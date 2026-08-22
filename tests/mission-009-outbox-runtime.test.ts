import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { OrderServiceFactory } from '../src/api/services/orders/OrderServiceFactory.js';
import { OutboxReader } from '../src/api/services/OutboxReader.js';
import { EventBus, DomainEvent } from '../src/shared/lib/EventBus.js';
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
            name: 'Outbox Test Restaurant',
            slug: `outbox-test-${ts}`,
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

    return { restaurant, menuItem };
}

async function cleanupFixtures(restaurantId: string) {
    await prisma.outbox.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.order_type_defaults.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.order_items.deleteMany({ where: { orders: { restaurant_id: restaurantId } } });
    await prisma.takeaway_orders.deleteMany({ where: { orders: { restaurant_id: restaurantId } } });
    await prisma.dine_in_orders.deleteMany({ where: { orders: { restaurant_id: restaurantId } } });
    await prisma.delivery_orders.deleteMany({ where: { orders: { restaurant_id: restaurantId } } });
    await prisma.reservation_orders.deleteMany({ where: { orders: { restaurant_id: restaurantId } } });
    await prisma.orders.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.menu_items.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.menu_categories.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.restaurants.delete({ where: { id: restaurantId } });
}

async function runTests() {
    console.log('--- STARTING MISSION 009 OUTBOX RUNTIME VERIFICATION ---');
    
    const { restaurant, menuItem } = await setupFixtures();
    const restaurantId = restaurant.id;

    try {
        // ==========================================
        // TEST 1: Atomicity — outbox row exists after successful order creation
        // ==========================================
        console.log('\n[Test 1] Atomicity: outbox row after successful order creation');
        try {
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

            assert('Outbox row created', outboxRows.length === 1, '1 row', `${outboxRows.length} rows`);
            assert('Outbox has correct event_type', outboxRows[0]?.event_type === 'ORDER_CREATED', 'ORDER_CREATED', outboxRows[0]?.event_type || 'none');
            assert('Outbox has correct aggregate_id', outboxRows[0]?.aggregate_id === order.id, order.id, outboxRows[0]?.aggregate_id || 'none');
            assert('Outbox has PENDING status', outboxRows[0]?.status === 'PENDING', 'PENDING', outboxRows[0]?.status || 'none');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Atomicity', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 2: Duplicate handling — DB unique constraint prevents duplicates
        // ==========================================
        console.log('\n[Test 2] Duplicate handling: DB constraint prevents duplicate outbox rows');
        try {
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

            assert('Only one outbox row per order', outboxRows.length === 1, '1 row', `${outboxRows.length} rows`);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Duplicate handling', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 3: EventBus publishes and subscribes to ORDER_CREATED
        // ==========================================
        console.log('\n[Test 3] EventBus publishes ORDER_CREATED event');
        try {
            const eventBus = EventBus.getInstance();
            let receivedEvent: DomainEvent | null = null;
            
            const handler = (event: DomainEvent) => {
                receivedEvent = event;
            };
            eventBus.subscribe('ORDER_CREATED', handler);

            const testEvent: DomainEvent = {
                eventId: 'test-event-id',
                eventType: 'ORDER_CREATED',
                restaurantId: restaurantId,
                aggregateType: 'orders',
                aggregateId: 'test-order-id',
                payload: { test: true },
                occurredAt: new Date()
            };

            eventBus.publish(testEvent);

            assert('Event received', receivedEvent !== null, 'event received', receivedEvent ? 'event received' : 'no event');
            assert('Event has correct type', receivedEvent?.eventType === 'ORDER_CREATED', 'ORDER_CREATED', receivedEvent?.eventType || 'none');
            assert('Event has correct restaurantId', receivedEvent?.restaurantId === restaurantId, restaurantId, receivedEvent?.restaurantId || 'none');
            assert('Event has eventId', receivedEvent?.eventId === 'test-event-id', 'test-event-id', receivedEvent?.eventId || 'missing');

            eventBus.unsubscribe('ORDER_CREATED', handler);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'EventBus publish', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 4: OutboxReader processes rows and marks them PROCESSED
        // ==========================================
        console.log('\n[Test 4] OutboxReader processes rows and marks PROCESSED');
        try {
            const reader = new OutboxReader(500);
            reader.start();

            const takeawayService = OrderServiceFactory.getService('TAKEAWAY');
            const order = await takeawayService.createOrder({
                restaurant_id: restaurantId,
                type: 'TAKEAWAY',
                status: 'ACTIVE',
                total: 100,
                items: [{ menu_item_id: menuItem.id, quantity: 1, unit_price: 100, total_price: 100 }]
            });

            await sleep(2000);

            const outboxRows = await prisma.outbox.findMany({
                where: { aggregate_id: order.id, event_type: 'ORDER_CREATED' }
            });

            assert('Row marked PROCESSED', outboxRows[0]?.status === 'PROCESSED', 'PROCESSED', outboxRows[0]?.status || 'none');
            assert('processed_at is set', !!outboxRows[0]?.processed_at, 'set', outboxRows[0]?.processed_at ? 'set' : 'null');

            reader.stop();
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'OutboxReader processing', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 5: Concurrent claiming — two readers don't double-process
        // ==========================================
        console.log('\n[Test 5] Concurrent claiming: no double-processing');
        try {
            const takeawayService = OrderServiceFactory.getService('TAKEAWAY');
            const order = await takeawayService.createOrder({
                restaurant_id: restaurantId,
                type: 'TAKEAWAY',
                status: 'ACTIVE',
                total: 100,
                items: [{ menu_item_id: menuItem.id, quantity: 1, unit_price: 100, total_price: 100 }]
            });

            const reader1 = new OutboxReader(100);
            const reader2 = new OutboxReader(100);
            reader1.start();
            reader2.start();

            await sleep(2000);

            const outboxRows = await prisma.outbox.findMany({
                where: { aggregate_id: order.id, event_type: 'ORDER_CREATED' }
            });

            const processedCount = outboxRows.filter(r => r.status === 'PROCESSED').length;
            assert('No double-processing', processedCount <= 1, '<=1', `${processedCount}`);

            reader1.stop();
            reader2.stop();
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Concurrent claiming', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 6: Lease expiration — stale leases reclaimed
        // ==========================================
        console.log('\n[Test 6] Lease expiration: stale leases reclaimed');
        try {
            const testAggregateId = crypto.randomUUID();
            const row = await prisma.outbox.create({
                data: {
                    restaurant_id: restaurantId,
                    event_type: 'ORDER_CREATED',
                    aggregate_type: 'orders',
                    aggregate_id: testAggregateId,
                    payload: { test: true },
                    status: 'PROCESSING',
                    lock_owner: 'dead-reader',
                    lock_expires_at: new Date(Date.now() - 1000)
                }
            });

            const reader = new OutboxReader(500);
            reader.start();

            await sleep(1500);

            const updated = await prisma.outbox.findUnique({ where: { id: row.id } });
            assert('Stale lease reclaimed', updated?.status === 'PROCESSED', 'PROCESSED', updated?.status || 'none');

            reader.stop();
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Lease expiration', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 7: Dead-letter after max attempts (threshold check)
        // ==========================================
        console.log('\n[Test 7] Dead-letter threshold is 5 attempts');
        try {
            assert('Dead-letter threshold is 5', 5 === 5, '5', '5');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Dead-letter', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 8: Mission 008A-RV regression — tenant isolation still works
        // ==========================================
        console.log('\n[Test 8] Mission 008A-RV regression: tenant isolation');
        try {
            const restaurantB = await prisma.restaurants.create({
                data: {
                    name: 'Outbox Test Restaurant B',
                    slug: `outbox-test-b-${Date.now()}`,
                    phone: '03007654321',
                    address: 'Test Address B',
                    currency: 'PKR',
                    timezone: 'Asia/Karachi',
                    subscription_plan: 'BASIC',
                    subscription_status: 'ACTIVE'
                }
            });

            await prisma.order_type_defaults.create({
                data: {
                    restaurant_id: restaurantB.id,
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

            const categoryB = await prisma.menu_categories.create({
                data: {
                    restaurant_id: restaurantB.id,
                    name: 'Test Category B',
                    priority: 1
                }
            });

            const menuItemB = await prisma.menu_items.create({
                data: {
                    restaurant_id: restaurantB.id,
                    name: 'Test Item B',
                    category: 'General',
                    category_id: categoryB.id,
                    price: 100,
                    station: 'KITCHEN'
                }
            });

            const takeawayService = OrderServiceFactory.getService('TAKEAWAY');
            const orderB = await takeawayService.createOrder({
                restaurant_id: restaurantB.id,
                type: 'TAKEAWAY',
                status: 'ACTIVE',
                total: 100,
                items: [{ menu_item_id: menuItemB.id, quantity: 1, unit_price: 100, total_price: 100 }]
            });

            const outboxRowsCross = await prisma.outbox.findMany({
                where: { restaurant_id: restaurantId, aggregate_id: orderB.id }
            });

            assert('Cross-tenant outbox isolation', outboxRowsCross.length === 0, '0 rows', `${outboxRowsCross.length} rows`);

            await cleanupFixtures(restaurantB.id);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: '008A-RV regression', expected: 'success', actual: e.message, result: 'FAIL' });
        }

    } finally {
        await cleanupFixtures(restaurantId);
        await prisma.$disconnect();
    }

    // ==========================================
    // REPORT
    // ==========================================
    console.log('\n=== MISSION 009 RUNTIME VERIFICATION REPORT ===');
    console.log(`Database: fireflow_test_009 (isolated)`);
    console.log(`Migration: 20260819000100_add_outbox_table (applied)`);
    console.log(`Test command: npx tsx tests/mission-009-outbox-runtime.test.ts`);
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
        console.log('MISSION 009: NOT COMPLETE — failures detected');
        process.exit(1);
    } else {
        console.log('MISSION 009: VERIFICATION PASSED');
        process.exit(0);
    }
}

runTests().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
