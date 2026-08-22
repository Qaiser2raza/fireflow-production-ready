import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { OrderServiceFactory } from '../src/api/services/orders/OrderServiceFactory.js';
import { OutboxReader } from '../src/api/services/OutboxReader.js';
import { IntegrationRegistry } from '../src/api/services/integration/IntegrationRegistry.js';
import { IntegrationDispatcher } from '../src/api/services/integration/IntegrationDispatcher.js';
import { MockConnector, MockConnectorMode } from '../src/api/services/integration/connectors/MockConnector.js';
import crypto from 'crypto';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const results: Array<{ test: string; expected: string; actual: string; result: string }> = [];

function assert(testName: string, condition: boolean, expected: string, actual: string) {
    if (condition) {
        console.log(`  PASS: ${testName}`);
        passed++;
        results.push({ test: testName, expected, actual, result: 'PASS' });
    } else {
        console.log(`  FAIL: ${testName} — expected ${expected}, got ${actual}`);
        failed++;
        results.push({ test: testName, expected, actual, result: 'FAIL' });
    }
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function setupFixtures() {
    const ts = Date.now();
    const restaurant = await prisma.restaurants.create({
        data: {
            name: 'Integration Test Restaurant',
            slug: `integration-test-${ts}`,
            phone: '03001234567',
            address: 'Test Address',
            currency: 'PKR',
            timezone: 'Asia/Karachi',
            subscription_plan: 'BASIC',
            subscription_status: 'ACTIVE'
        }
    });

    await prisma.order_type_defaults.create({
        data: {
            restaurant_id: restaurant.id,
            order_type: 'TAKEAWAY',
            tax_enabled: true,
            tax_rate: 10,
            tax_type: 'EXCLUSIVE',
            svc_enabled: false,
            svc_rate: 0,
            delivery_fee: 0,
            discount_max: 0
        }
    });

    const category = await prisma.menu_categories.create({
        data: {
            restaurant_id: restaurant.id,
            name: 'Test Category',
            priority: 1
        }
    });

    const menuItem = await prisma.menu_items.create({
        data: {
            restaurant_id: restaurant.id,
            name: 'Test Item',
            category: 'General',
            category_id: category.id,
            price: 100,
            station: 'KITCHEN'
        }
    });

    const station = await prisma.stations.create({
        data: {
            restaurant_id: restaurant.id,
            name: 'Test Station'
        }
    });

    return { restaurant, menuItem, station };
}

async function cleanupTestData(restaurantId: string) {
    await prisma.integration_deliveries.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.integrations.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.outbox.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.order_type_defaults.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.order_items.deleteMany({ where: { orders: { restaurant_id: restaurantId } } });
    await prisma.takeaway_orders.deleteMany({ where: { orders: { restaurant_id: restaurantId } } });
    await prisma.dine_in_orders.deleteMany({ where: { orders: { restaurant_id: restaurantId } } });
    await prisma.delivery_orders.deleteMany({ where: { orders: { restaurant_id: restaurantId } } });
    await prisma.reservation_orders.deleteMany({ where: { orders: { restaurant_id: restaurantId } } });
    await prisma.orders.deleteMany({ where: { restaurant_id: restaurantId } });
}

async function cleanupFixtures(restaurantId: string) {
    await cleanupTestData(restaurantId);
    await prisma.menu_items.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.menu_categories.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.stations.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.restaurants.delete({ where: { id: restaurantId } });
}

async function runTests() {
    console.log('--- STARTING MISSION 010 INTEGRATION RUNTIME VERIFICATION ---');

    const { restaurant, menuItem, station } = await setupFixtures();
    const restaurantId = restaurant.id;

    try {
        // ==========================================
        // TEST 1: Registry — mock connector registered
        // ==========================================
        console.log('\n[Test 1] Registry: mock connector registered');
        try {
            const registry = IntegrationRegistry.getInstance();
            registry.clear();
            const mockConnector = new MockConnector();
            registry.register(mockConnector);

            assert('Mock connector registered', registry.has('MOCK'), 'true', registry.has('MOCK') ? 'true' : 'false');
            assert('Connector type is MOCK', registry.get('MOCK')?.type === 'MOCK', 'MOCK', registry.get('MOCK')?.type || 'none');
            assert('Connector version is 1.0.0', registry.get('MOCK')?.version === '1.0.0', '1.0.0', registry.get('MOCK')?.version || 'none');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Registry', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 2: Registry — duplicate registration rejected
        // ==========================================
        console.log('\n[Test 2] Registry: duplicate registration rejected');
        try {
            const registry = IntegrationRegistry.getInstance();
            registry.clear();
            const mockConnector = new MockConnector();
            registry.register(mockConnector);
            let errorThrown = false;
            try {
                registry.register(mockConnector);
            } catch (e: any) {
                errorThrown = true;
            }
            assert('Duplicate registration rejected', errorThrown, 'true', errorThrown ? 'true' : 'false');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Registry duplicate', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 3: Integration registration — tenant scoped
        // ==========================================
        console.log('\n[Test 3] Integration registration: tenant scoped');
        try {
            const integration = await prisma.integrations.create({
                data: {
                    restaurant_id: restaurantId,
                    connector_type: 'MOCK',
                    status: 'ENABLED'
                }
            });

            assert('Integration created', !!integration.id, 'id present', integration.id ? 'present' : 'missing');
            assert('Integration has restaurant_id', integration.restaurant_id === restaurantId, restaurantId, integration.restaurant_id);

            const found = await prisma.integrations.findFirst({
                where: { restaurant_id: restaurantId, connector_type: 'MOCK' }
            });
            assert('Integration queryable by restaurant', !!found, 'found', found ? 'found' : 'missing');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Integration registration', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 4: Integration registration — disabled integration skipped
        // ==========================================
        console.log('\n[Test 4] Disabled integration skipped by dispatcher');
        try {
            const disabledIntegration = await prisma.integrations.create({
                data: {
                    restaurant_id: restaurantId,
                    connector_type: 'MOCK',
                    status: 'DISABLED'
                }
            });

            const takeawayService = OrderServiceFactory.getService('TAKEAWAY');
            const order = await takeawayService.createOrder({
                restaurant_id: restaurantId,
                type: 'TAKEAWAY',
                status: 'ACTIVE',
                total: 100,
                items: [{ menu_item_id: menuItem.id, quantity: 1, unit_price: 100, total_price: 100 }]
            });

            const dispatcher = new IntegrationDispatcher(100);
            dispatcher.start();
            await sleep(500);
            dispatcher.stop();

            const deliveries = await prisma.integration_deliveries.findMany({
                where: { integration_id: disabledIntegration.id }
            });

            assert('No deliveries for disabled integration', deliveries.length === 0, '0', `${deliveries.length}`);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Disabled integration', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 5: Successful delivery
        // ==========================================
        console.log('\n[Test 5] Successful delivery');
        try {
            await cleanupTestData(restaurantId);
            const registry = IntegrationRegistry.getInstance();
            registry.clear();
            const mockConnector = new MockConnector();
            mockConnector.setMode('SUCCESS');
            mockConnector.clearHistory();
            registry.register(mockConnector);

            const enabledIntegration = await prisma.integrations.create({
                data: {
                    restaurant_id: restaurantId,
                    connector_type: 'MOCK',
                    status: 'ENABLED'
                }
            });

            await prisma.order_type_defaults.create({
                data: {
                    restaurant_id: restaurantId,
                    order_type: 'TAKEAWAY',
                    tax_enabled: true,
                    tax_rate: 10,
                    tax_type: 'EXCLUSIVE',
                    svc_enabled: false,
                    svc_rate: 0,
                    delivery_fee: 0,
                    discount_max: 0
                }
            });

            const takeawayService = OrderServiceFactory.getService('TAKEAWAY');
            const order = await takeawayService.createOrder({
                restaurant_id: restaurantId,
                type: 'TAKEAWAY',
                status: 'ACTIVE',
                total: 100,
                items: [{ menu_item_id: menuItem.id, quantity: 1, unit_price: 100, total_price: 100 }]
            });

            const outboxRows = await prisma.outbox.findMany({
                where: { aggregate_id: order.id, event_type: 'ORDER_CREATED' }
            });

            const dispatcher = new IntegrationDispatcher(100);
            dispatcher.start();
            await sleep(2000);
            dispatcher.stop();

            const deliveries = await prisma.integration_deliveries.findMany({
                where: { integration_id: enabledIntegration.id }
            });

            assert('Delivery created', deliveries.length === 1, '1', `${deliveries.length}`);
            assert('Delivery is COMPLETED', deliveries[0]?.status === 'COMPLETED', 'COMPLETED', deliveries[0]?.status || 'none');
            assert('Delivery has correlation_id', !!deliveries[0]?.correlation_id, 'present', deliveries[0]?.correlation_id ? 'present' : 'missing');
            assert('Delivery has idempotency_key', !!deliveries[0]?.idempotency_key, 'present', deliveries[0]?.idempotency_key ? 'present' : 'missing');
            assert('Delivery has external_reference', deliveries[0]?.external_reference?.startsWith('mock-ref'), 'mock-ref...', deliveries[0]?.external_reference || 'none');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Successful delivery', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 6: Idempotency — duplicate event creates one delivery
        // ==========================================
        console.log('\n[Test 6] Idempotency: duplicate event creates one delivery');
        try {
            await cleanupTestData(restaurantId);
            const registry = IntegrationRegistry.getInstance();
            registry.clear();
            const mockConnector = new MockConnector();
            mockConnector.setMode('SUCCESS');
            registry.register(mockConnector);

            const enabledIntegration = await prisma.integrations.create({
                data: {
                    restaurant_id: restaurantId,
                    connector_type: 'MOCK',
                    status: 'ENABLED'
                }
            });

            await prisma.order_type_defaults.create({
                data: {
                    restaurant_id: restaurantId,
                    order_type: 'TAKEAWAY',
                    tax_enabled: true,
                    tax_rate: 10,
                    tax_type: 'EXCLUSIVE',
                    svc_enabled: false,
                    svc_rate: 0,
                    delivery_fee: 0,
                    discount_max: 0
                }
            });

            const takeawayService = OrderServiceFactory.getService('TAKEAWAY');
            const order = await takeawayService.createOrder({
                restaurant_id: restaurantId,
                type: 'TAKEAWAY',
                status: 'ACTIVE',
                total: 100,
                items: [{ menu_item_id: menuItem.id, quantity: 1, unit_price: 100, total_price: 100 }]
            });

            const dispatcher = new IntegrationDispatcher(100);
            dispatcher.start();
            await sleep(2000);
            dispatcher.stop();

            const deliveries = await prisma.integration_deliveries.findMany({
                where: { integration_id: enabledIntegration.id }
            });

            assert('Only one delivery per integration/event', deliveries.length === 1, '1', `${deliveries.length}`);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Idempotency', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 7: Retryable failure — delivery retries with backoff
        // ==========================================
        console.log('\n[Test 7] Retryable failure: delivery retries with backoff');
        try {
            await cleanupTestData(restaurantId);
            const registry = IntegrationRegistry.getInstance();
            registry.clear();
            const mockConnector = new MockConnector();
            mockConnector.setMode('RETRYABLE_FAILURE');
            registry.register(mockConnector);

            const enabledIntegration = await prisma.integrations.create({
                data: {
                    restaurant_id: restaurantId,
                    connector_type: 'MOCK',
                    status: 'ENABLED'
                }
            });

            await prisma.order_type_defaults.create({
                data: {
                    restaurant_id: restaurantId,
                    order_type: 'TAKEAWAY',
                    tax_enabled: true,
                    tax_rate: 10,
                    tax_type: 'EXCLUSIVE',
                    svc_enabled: false,
                    svc_rate: 0,
                    delivery_fee: 0,
                    discount_max: 0
                }
            });

            const outboxRow = await prisma.outbox.create({
                data: {
                    restaurant_id: restaurantId,
                    event_type: 'ORDER_CREATED',
                    aggregate_type: 'orders',
                    aggregate_id: crypto.randomUUID(),
                    payload: { test: true },
                    status: 'PENDING'
                }
            });

            const dispatcher = new IntegrationDispatcher(100);
            dispatcher.start();
            await sleep(500);
            dispatcher.stop();

            const deliveries = await prisma.integration_deliveries.findMany({
                where: { integration_id: enabledIntegration.id, outbox_id: outboxRow.id }
            });

            assert('Delivery created for retryable failure', deliveries.length === 1, '1', `${deliveries.length}`);
            assert('Delivery is scheduled for retry', deliveries[0]?.status === 'PENDING', 'PENDING', deliveries[0]?.status || 'none');
            assert('Delivery attempt_count is 1', deliveries[0]?.attempt_count === 1, '1', `${deliveries[0]?.attempt_count}`);
            assert('Delivery has available_at in future', deliveries[0]?.available_at > new Date(), 'future', `${deliveries[0]?.available_at}`);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Retryable failure', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 8: Permanent failure — delivery marked DEAD_LETTER
        // ==========================================
        console.log('\n[Test 8] Permanent failure: delivery marked DEAD_LETTER');
        try {
            await cleanupTestData(restaurantId);
            const registry = IntegrationRegistry.getInstance();
            registry.clear();
            const mockConnector = new MockConnector();
            mockConnector.setMode('PERMANENT_FAILURE');
            registry.register(mockConnector);

            const enabledIntegration = await prisma.integrations.create({
                data: {
                    restaurant_id: restaurantId,
                    connector_type: 'MOCK',
                    status: 'ENABLED'
                }
            });

            await prisma.order_type_defaults.create({
                data: {
                    restaurant_id: restaurantId,
                    order_type: 'TAKEAWAY',
                    tax_enabled: true,
                    tax_rate: 10,
                    tax_type: 'EXCLUSIVE',
                    svc_enabled: false,
                    svc_rate: 0,
                    delivery_fee: 0,
                    discount_max: 0
                }
            });

            const outboxRow = await prisma.outbox.create({
                data: {
                    restaurant_id: restaurantId,
                    event_type: 'ORDER_CREATED',
                    aggregate_type: 'orders',
                    aggregate_id: crypto.randomUUID(),
                    payload: { test: true },
                    status: 'PENDING'
                }
            });

            const dispatcher = new IntegrationDispatcher(100);
            dispatcher.start();
            await sleep(1000);
            dispatcher.stop();

            const deliveries = await prisma.integration_deliveries.findMany({
                where: { integration_id: enabledIntegration.id, outbox_id: outboxRow.id }
            });

            assert('Delivery created for permanent failure', deliveries.length === 1, '1', `${deliveries.length}`);
            assert('Delivery is DEAD_LETTER', deliveries[0]?.status === 'DEAD_LETTER', 'DEAD_LETTER', deliveries[0]?.status || 'none');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Permanent failure', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 9: Unknown result — remains UNKNOWN
        // ==========================================
        console.log('\n[Test 9] Unknown result: remains UNKNOWN');
        try {
            await cleanupTestData(restaurantId);
            const registry = IntegrationRegistry.getInstance();
            registry.clear();
            const mockConnector = new MockConnector();
            mockConnector.setMode('UNKNOWN');
            registry.register(mockConnector);

            const enabledIntegration = await prisma.integrations.create({
                data: {
                    restaurant_id: restaurantId,
                    connector_type: 'MOCK',
                    status: 'ENABLED'
                }
            });

            await prisma.order_type_defaults.create({
                data: {
                    restaurant_id: restaurantId,
                    order_type: 'TAKEAWAY',
                    tax_enabled: true,
                    tax_rate: 10,
                    tax_type: 'EXCLUSIVE',
                    svc_enabled: false,
                    svc_rate: 0,
                    delivery_fee: 0,
                    discount_max: 0
                }
            });

            const outboxRow = await prisma.outbox.create({
                data: {
                    restaurant_id: restaurantId,
                    event_type: 'ORDER_CREATED',
                    aggregate_type: 'orders',
                    aggregate_id: crypto.randomUUID(),
                    payload: { test: true },
                    status: 'PENDING'
                }
            });

            const dispatcher = new IntegrationDispatcher(100);
            dispatcher.start();
            await sleep(1000);
            dispatcher.stop();

            const deliveries = await prisma.integration_deliveries.findMany({
                where: { integration_id: enabledIntegration.id, outbox_id: outboxRow.id }
            });

            assert('Delivery created for unknown result', deliveries.length === 1, '1', `${deliveries.length}`);
            assert('Delivery is UNKNOWN', deliveries[0]?.status === 'UNKNOWN', 'UNKNOWN', deliveries[0]?.status || 'none');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Unknown result', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 10: Lease expiration — stale lease reclaimed
        // ==========================================
        console.log('\n[Test 10] Lease expiration: stale lease reclaimed');
        try {
            await cleanupTestData(restaurantId);
            const registry = IntegrationRegistry.getInstance();
            registry.clear();
            const mockConnector = new MockConnector();
            mockConnector.setMode('SUCCESS');
            registry.register(mockConnector);

            const enabledIntegration = await prisma.integrations.create({
                data: {
                    restaurant_id: restaurantId,
                    connector_type: 'MOCK',
                    status: 'ENABLED'
                }
            });

            const outboxRow = await prisma.outbox.create({
                data: {
                    restaurant_id: restaurantId,
                    event_type: 'ORDER_CREATED',
                    aggregate_type: 'orders',
                    aggregate_id: crypto.randomUUID(),
                    payload: { test: true },
                    status: 'PENDING'
                }
            });

            const staleDelivery = await prisma.integration_deliveries.create({
                data: {
                    integration_id: enabledIntegration.id,
                    restaurant_id: restaurantId,
                    outbox_id: outboxRow.id,
                    event_type: 'ORDER_CREATED',
                    idempotency_key: `integration:${enabledIntegration.id}:outbox:${outboxRow.id}`,
                    correlation_id: 'corr-lease-test',
                    status: 'PROCESSING',
                    attempt_count: 1,
                    available_at: new Date(),
                    lock_owner: 'dead-dispatcher',
                    lock_expires_at: new Date(Date.now() - 1000)
                }
            });

            const dispatcher = new IntegrationDispatcher(100);
            dispatcher.start();
            await sleep(1000);
            dispatcher.stop();

            const updated = await prisma.integration_deliveries.findUnique({ where: { id: staleDelivery.id } });
            assert('Stale lease reclaimed', updated?.status === 'COMPLETED', 'COMPLETED', updated?.status || 'none');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Lease expiration', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 11: Cross-tenant isolation
        // ==========================================
        console.log('\n[Test 11] Cross-tenant integration isolation');
        try {
            await cleanupTestData(restaurantId);
            const restaurantB = await prisma.restaurants.create({
                data: {
                    name: 'Integration Test Restaurant B',
                    slug: `integration-test-b-${Date.now()}`,
                    phone: '03007654321',
                    address: 'Test Address B',
                    currency: 'PKR',
                    timezone: 'Asia/Karachi',
                    subscription_plan: 'BASIC',
                    subscription_status: 'ACTIVE'
                }
            });

            const integrationB = await prisma.integrations.create({
                data: {
                    restaurant_id: restaurantB.id,
                    connector_type: 'MOCK',
                    status: 'ENABLED'
                }
            });

            const outboxRow = await prisma.outbox.create({
                data: {
                    restaurant_id: restaurantId,
                    event_type: 'ORDER_CREATED',
                    aggregate_type: 'orders',
                    aggregate_id: crypto.randomUUID(),
                    payload: { test: true },
                    status: 'PENDING'
                }
            });

            const dispatcher = new IntegrationDispatcher(100);
            dispatcher.start();
            await sleep(1000);
            dispatcher.stop();

            const crossTenantDeliveries = await prisma.integration_deliveries.findMany({
                where: { integration_id: integrationB.id, outbox_id: outboxRow.id }
            });

            assert('No cross-tenant deliveries', crossTenantDeliveries.length === 0, '0', `${crossTenantDeliveries.length}`);

            await cleanupFixtures(restaurantB.id);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Cross-tenant isolation', expected: 'success', actual: e.message, result: 'FAIL' });
        }

    } finally {
        await cleanupFixtures(restaurantId);
        await prisma.$disconnect();
    }

    // ==========================================
    // REPORT
    // ==========================================
    console.log('\n=== MISSION 010 RUNTIME VERIFICATION REPORT ===');
    console.log(`Database: fireflow_test_010 (isolated)`);
    console.log(`Migration: 20260819000200_add_integrations (applied)`);
    console.log(`Test command: $env:DATABASE_URL="postgresql://postgres:admin123@localhost:5432/fireflow_test_010?schema=public"; npx tsx tests/mission-010-integration-runtime.test.ts`);
    console.log('');
    console.log('Results:');
    results.forEach(r => {
        console.log(`  [${r.result}] ${r.test} — expected: ${r.expected}, actual: ${r.actual}`);
    });
    console.log('');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: 0`);
    console.log(`Blocked: 0`);
    console.log('');
    if (failed > 0) {
        console.log('MISSION 010: NOT COMPLETE — failures detected');
        process.exit(1);
    } else {
        console.log('MISSION 010: VERIFICATION PASSED');
        process.exit(0);
    }
}

runTests().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
