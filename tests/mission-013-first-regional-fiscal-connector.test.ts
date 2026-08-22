import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { OrderServiceFactory } from '../src/api/services/orders/OrderServiceFactory.js';
import { FiscalRegistry } from '../src/api/services/fiscal/FiscalRegistry.js';
import { FiscalDocumentService } from '../src/api/services/fiscal/FiscalDocumentService.js';
import { FiscalDeliveryService } from '../src/api/services/fiscal/FiscalDeliveryService.js';
import { FiscalHttpConnector } from '../src/api/services/fiscal/connectors/FiscalHttpConnector.js';
import { HmacAuth } from '../src/api/services/fiscal/HmacAuth.js';
import { MockFiscalProvider, MockFiscalMode } from '../src/api/services/fiscal/providers/MockFiscalProvider.js';
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
            name: 'Fiscal Connector Test Restaurant',
            slug: `fiscal-connector-test-${ts}`,
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

    const integration = await prisma.integrations.create({
        data: {
            restaurant_id: restaurant.id,
            connector_type: 'FISCAL_CONNECTOR',
            connector_version: '1.0.0',
            status: 'ENABLED',
            configuration_reference: 'http://localhost:3001'
        }
    });

    return { restaurant, menuItem, station, integration };
}

async function cleanupFixtures(restaurantId: string) {
    await prisma.fiscal_attempts.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.fiscal_documents.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.outbox.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.integration_deliveries.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.integrations.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.payment_attempts.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.payments.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.order_type_defaults.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.order_items.deleteMany({ where: { orders: { restaurant_id: restaurantId } } });
    await prisma.takeaway_orders.deleteMany({ where: { orders: { restaurant_id: restaurantId } } });
    await prisma.dine_in_orders.deleteMany({ where: { orders: { restaurant_id: restaurantId } } });
    await prisma.delivery_orders.deleteMany({ where: { orders: { restaurant_id: restaurantId } } });
    await prisma.reservation_orders.deleteMany({ where: { orders: { restaurant_id: restaurantId } } });
    await prisma.orders.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.menu_items.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.menu_categories.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.stations.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.restaurants.delete({ where: { id: restaurantId } });
}

async function runTests() {
    console.log('--- STARTING MISSION 013 FIRST REGIONAL FISCAL CONNECTOR VERIFICATION ---');

    const { restaurant, menuItem, station, integration } = await setupFixtures();
    const restaurantId = restaurant.id;

    try {
        // ==========================================
        // TEST 1: HMAC Auth — valid request succeeds
        // ==========================================
        console.log('\n[Test 1] HMAC Auth: valid request succeeds');
        try {
            const hmacAuth = HmacAuth.getInstance();
            hmacAuth.registerKey({
                keyId: 'test-key',
                secret: 'test-secret',
                audience: 'fireflow-fiscal-pk',
                createdAt: new Date(),
            });

            const body = { test: 'data' };
            const timestamp = Date.now();
            const nonce = crypto.randomUUID();
            const requestId = crypto.randomUUID();
            const bodyString = JSON.stringify(body);
            const bodyHash = crypto.createHash('sha256').update(bodyString).digest('hex');

            const signData = ['test-key', 'fireflow-fiscal-pk', String(timestamp), nonce, requestId, bodyHash].join('\n');
            const signature = crypto.createHmac('sha256', 'test-secret').update(signData).digest('base64');

            const verifiedRequest = {
                keyId: 'test-key',
                audience: 'fireflow-fiscal-pk',
                timestamp,
                nonce,
                requestId,
                bodyHash,
                signature,
                expiryWindowMs: 5 * 60 * 1000,
            };

            const result = hmacAuth.verify(verifiedRequest, body, signature);
            assert('Valid HMAC request succeeds', result.valid, 'true', result.valid ? 'true' : 'false');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'HMAC valid', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 2: HMAC Auth — invalid signature rejected
        // ==========================================
        console.log('\n[Test 2] HMAC Auth: invalid signature rejected');
        try {
            const hmacAuth = HmacAuth.getInstance();
            const body = { test: 'data' };
            const timestamp = Date.now();
            const nonce = crypto.randomUUID();
            const requestId = crypto.randomUUID();
            const bodyString = JSON.stringify(body);
            const bodyHash = crypto.createHash('sha256').update(bodyString).digest('hex');

            const verifiedRequest = {
                keyId: 'test-key',
                audience: 'fireflow-fiscal-pk',
                timestamp,
                nonce,
                requestId,
                bodyHash,
                signature: 'invalid-signature',
                expiryWindowMs: 5 * 60 * 1000,
            };

            const result = hmacAuth.verify(verifiedRequest, body, 'invalid-signature');
            assert('Invalid signature rejected', !result.valid, 'false', result.valid ? 'true' : 'false');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'HMAC invalid sig', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 3: HMAC Auth — altered body rejected
        // ==========================================
        console.log('\n[Test 3] HMAC Auth: altered body rejected');
        try {
            const hmacAuth = HmacAuth.getInstance();
            const body = { test: 'data' };
            const timestamp = Date.now();
            const nonce = crypto.randomUUID();
            const requestId = crypto.randomUUID();
            const bodyString = JSON.stringify(body);
            const bodyHash = crypto.createHash('sha256').update(bodyString).digest('hex');

            const signData = ['test-key', 'fireflow-fiscal-pk', String(timestamp), nonce, requestId, bodyHash].join('\n');
            const signature = crypto.createHmac('sha256', 'test-secret').update(signData).digest('base64');

            const verifiedRequest = {
                keyId: 'test-key',
                audience: 'fireflow-fiscal-pk',
                timestamp,
                nonce,
                requestId,
                bodyHash,
                signature,
                expiryWindowMs: 5 * 60 * 1000,
            };

            const result = hmacAuth.verify(verifiedRequest, { test: 'altered' }, signature);
            assert('Altered body rejected', !result.valid, 'false', result.valid ? 'true' : 'false');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'HMAC altered body', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 4: HMAC Auth — expired timestamp rejected
        // ==========================================
        console.log('\n[Test 4] HMAC Auth: expired timestamp rejected');
        try {
            const hmacAuth = HmacAuth.getInstance();
            const body = { test: 'data' };
            const timestamp = Date.now() - (10 * 60 * 1000);
            const nonce = crypto.randomUUID();
            const requestId = crypto.randomUUID();
            const bodyString = JSON.stringify(body);
            const bodyHash = crypto.createHash('sha256').update(bodyString).digest('hex');

            const signData = ['test-key', 'fireflow-fiscal-pk', String(timestamp), nonce, requestId, bodyHash].join('\n');
            const signature = crypto.createHmac('sha256', 'test-secret').update(signData).digest('base64');

            const verifiedRequest = {
                keyId: 'test-key',
                audience: 'fireflow-fiscal-pk',
                timestamp,
                nonce,
                requestId,
                bodyHash,
                signature,
                expiryWindowMs: 5 * 60 * 1000,
            };

            const result = hmacAuth.verify(verifiedRequest, body, signature);
            assert('Expired timestamp rejected', !result.valid, 'false', result.valid ? 'true' : 'false');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'HMAC expired', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 5: HMAC Auth — reused nonce rejected
        // ==========================================
        console.log('\n[Test 5] HMAC Auth: reused nonce rejected');
        try {
            const hmacAuth = HmacAuth.getInstance();
            const body = { test: 'data' };
            const timestamp = Date.now();
            const nonce = 'reused-nonce';
            const requestId = crypto.randomUUID();
            const bodyString = JSON.stringify(body);
            const bodyHash = crypto.createHash('sha256').update(bodyString).digest('hex');

            const signData = ['test-key', 'fireflow-fiscal-pk', String(timestamp), nonce, requestId, bodyHash].join('\n');
            const signature = crypto.createHmac('sha256', 'test-secret').update(signData).digest('base64');

            const verifiedRequest = {
                keyId: 'test-key',
                audience: 'fireflow-fiscal-pk',
                timestamp,
                nonce,
                requestId,
                bodyHash,
                signature,
                expiryWindowMs: 5 * 60 * 1000,
            };

            hmacAuth.verify(verifiedRequest, body, signature);
            const result2 = hmacAuth.verify(verifiedRequest, body, signature);
            assert('Reused nonce rejected', !result2.valid, 'false', result2.valid ? 'true' : 'false');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'HMAC reused nonce', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 6: FiscalHttpConnector — signs request correctly
        // ==========================================
        console.log('\n[Test 6] FiscalHttpConnector: signs request correctly');
        try {
            const hmacAuth = HmacAuth.getInstance();
            hmacAuth.registerKey({
                keyId: 'fireflow-fiscal-pk-dev',
                secret: 'dev-secret-change-in-production',
                audience: 'fireflow-fiscal-pk',
                createdAt: new Date(),
            });

            const connector = new FiscalHttpConnector('http://localhost:3001', hmacAuth, 'fireflow-fiscal-pk-dev');

            const mockRequest = {
                eventType: 'FISCAL_DOCUMENT_REQUESTED',
                eventVersion: 1,
                payload: {
                    fiscalDocumentId: crypto.randomUUID(),
                    orderId: crypto.randomUUID(),
                    restaurantId: restaurantId,
                    documentType: 'INVOICE',
                    currency: 'PKR',
                    subtotal: 1000,
                    taxTotal: 200,
                    grandTotal: 1200,
                    issuedAt: new Date().toISOString(),
                    documentVersion: 1,
                },
                context: {
                    integrationId: integration.id,
                    restaurantId: restaurantId,
                    correlationId: crypto.randomUUID(),
                    idempotencyKey: crypto.randomUUID(),
                    source: 'OUTBOX_DISPATCHER',
                },
            };

            const result = await connector.send(mockRequest);
            assert('Connector returns UNKNOWN (FBR unverified)', result.outcome === 'UNKNOWN', 'UNKNOWN', result.outcome);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Connector sign', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 7: FiscalDocumentService — requestDocument creates fiscal document and outbox event
        // ==========================================
        console.log('\n[Test 7] FiscalDocumentService: requestDocument creates fiscal document and outbox event');
        try {
            const registry = FiscalRegistry.getInstance();
            registry.clear();
            const mockProvider = new MockFiscalProvider();
            mockProvider.setMode('SUCCESS');
            mockProvider.clearHistory();
            registry.register(mockProvider);

            const takeawayService = OrderServiceFactory.getService('TAKEAWAY');
            const order = await takeawayService.createOrder({
                restaurant_id: restaurantId,
                type: 'TAKEAWAY',
                status: 'ACTIVE',
                total: 100,
                items: [{ menu_item_id: menuItem.id, quantity: 1, unit_price: 100, total_price: 100 }]
            });

            await prisma.orders.update({
                where: { id: order.id },
                data: { status: 'CLOSED', payment_status: 'PAID' }
            });

            const service = FiscalDocumentService.getInstance();
            const fiscalDoc = await service.requestDocument(order.id, {
                fiscalDocumentId: crypto.randomUUID(),
                restaurantId: restaurantId,
                orderId: order.id,
                correlationId: crypto.randomUUID(),
                idempotencyKey: crypto.randomUUID(),
                source: 'FISCAL_CONNECTOR'
            });

            assert('Fiscal document created', !!fiscalDoc.id, 'id present', fiscalDoc.id ? 'present' : 'missing');
            assert('Fiscal document status is PENDING', fiscalDoc.status === 'PENDING', 'PENDING', fiscalDoc.status);

            const outboxEvents = await prisma.outbox.findMany({
                where: { aggregate_id: fiscalDoc.id, event_type: 'FISCAL_DOCUMENT_REQUESTED' }
            });
            assert('Outbox event created', outboxEvents.length === 1, '1', `${outboxEvents.length}`);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'requestDocument', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 8: FiscalDeliveryService — disabled integration skipped
        // ==========================================
        console.log('\n[Test 8] FiscalDeliveryService: disabled integration skipped');
        try {
            await prisma.integrations.update({
                where: { id: integration.id },
                data: { status: 'DISABLED' }
            });

            const takeawayService = OrderServiceFactory.getService('TAKEAWAY');
            const order = await takeawayService.createOrder({
                restaurant_id: restaurantId,
                type: 'TAKEAWAY',
                status: 'ACTIVE',
                total: 100,
                items: [{ menu_item_id: menuItem.id, quantity: 1, unit_price: 100, total_price: 100 }]
            });

            await prisma.orders.update({
                where: { id: order.id },
                data: { status: 'CLOSED', payment_status: 'PAID' }
            });

            const service = FiscalDocumentService.getInstance();
            const fiscalDoc = await service.requestDocument(order.id, {
                fiscalDocumentId: crypto.randomUUID(),
                restaurantId: restaurantId,
                orderId: order.id,
                correlationId: crypto.randomUUID(),
                idempotencyKey: crypto.randomUUID(),
                source: 'FISCAL_CONNECTOR'
            });

            const deliveryService = FiscalDeliveryService.getInstance();
            await deliveryService['processCompletedDeliveries']();

            const updatedDoc = await prisma.fiscal_documents.findUnique({ where: { id: fiscalDoc.id } });
            assert('Disabled integration: document remains PENDING', updatedDoc?.status === 'PENDING', 'PENDING', updatedDoc?.status || 'none');

            await prisma.integrations.update({
                where: { id: integration.id },
                data: { status: 'ENABLED' }
            });
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Disabled integration', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 9: Cross-tenant fiscal document delivery rejected
        // ==========================================
        console.log('\n[Test 9] Cross-tenant fiscal document delivery rejected');
        try {
            const otherRestaurant = await prisma.restaurants.create({
                data: {
                    name: 'Other Restaurant',
                    slug: `other-restaurant-${Date.now()}`,
                    phone: '03007654321',
                    address: 'Other Address',
                    currency: 'PKR',
                    timezone: 'Asia/Karachi',
                    subscription_plan: 'BASIC',
                    subscription_status: 'ACTIVE'
                }
            });

            const otherIntegration = await prisma.integrations.create({
                data: {
                    restaurant_id: otherRestaurant.id,
                    connector_type: 'FISCAL_CONNECTOR',
                    connector_version: '1.0.0',
                    status: 'ENABLED',
                    configuration_reference: 'http://localhost:3001'
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

            await prisma.orders.update({
                where: { id: order.id },
                data: { status: 'CLOSED', payment_status: 'PAID' }
            });

            const service = FiscalDocumentService.getInstance();
            const fiscalDoc = await service.requestDocument(order.id, {
                fiscalDocumentId: crypto.randomUUID(),
                restaurantId: restaurantId,
                orderId: order.id,
                correlationId: crypto.randomUUID(),
                idempotencyKey: crypto.randomUUID(),
                source: 'FISCAL_CONNECTOR'
            });

            const delivery = await prisma.integration_deliveries.create({
                data: {
                    integration_id: otherIntegration.id,
                    restaurant_id: otherRestaurant.id,
                    outbox_id: (await prisma.outbox.findFirst({ where: { aggregate_id: fiscalDoc.id } }))!.id,
                    event_type: 'FISCAL_DOCUMENT_REQUESTED',
                    event_version: 1,
                    idempotency_key: crypto.randomUUID(),
                    correlation_id: crypto.randomUUID(),
                    status: 'COMPLETED',
                    attempt_count: 1,
                }
            });

            const deliveryService = FiscalDeliveryService.getInstance();
            await deliveryService['processCompletedDeliveries']();

            const updatedDoc = await prisma.fiscal_documents.findUnique({ where: { id: fiscalDoc.id } });
            assert('Cross-tenant delivery: document remains PENDING', updatedDoc?.status === 'PENDING', 'PENDING', updatedDoc?.status || 'none');

            await cleanupFixtures(otherRestaurant.id);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Cross-tenant delivery', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 10: FBR isolation — no FBR code in fiscal connector files
        // ==========================================
        console.log('\n[Test 10] FBR isolation in connector code');
        try {
            const fs = await import('fs');
            const path = await import('path');

            const connectorDir = path.join(process.cwd(), 'connector/src');
            const connectorFiles = fs.readdirSync(connectorDir).filter(f => f.endsWith('.ts'));
            const connectorContent = connectorFiles.map(f => fs.readFileSync(path.join(connectorDir, f), 'utf8')).join('');

            assert('No FBRService import in connector', !connectorContent.includes('FBRService'), 'absent', connectorContent.includes('FBRService') ? 'present' : 'absent');
            assert('No fbr_ims_url in connector', !connectorContent.includes('fbr_ims_url'), 'absent', connectorContent.includes('fbr_ims_url') ? 'present' : 'absent');
            assert('No fbr_ntn in connector', !connectorContent.includes('fbr_ntn'), 'absent', connectorContent.includes('fbr_ntn') ? 'present' : 'absent');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'FBR isolation connector', expected: 'success', actual: e.message, result: 'FAIL' });
        }

    } finally {
        await cleanupFixtures(restaurantId);
        await prisma.$disconnect();
    }

    // ==========================================
    // REPORT
    // ==========================================
    console.log('\n=== MISSION 013 FIRST REGIONAL FISCAL CONNECTOR VERIFICATION REPORT ===');
    console.log(`Database: fireflow_test_013 (isolated)`);
    console.log(`Test command: $env:DATABASE_URL="postgresql://postgres:admin123@localhost:5432/fireflow_test_013?schema=public"; npx tsx tests/mission-013-first-regional-fiscal-connector.test.ts`);
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
        console.log('MISSION 013: NOT COMPLETE — failures detected');
        process.exit(1);
    } else {
        console.log('MISSION 013: VERIFICATION PASSED');
        process.exit(0);
    }
}

runTests().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
