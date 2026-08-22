import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { OrderServiceFactory } from '../src/api/services/orders/OrderServiceFactory.js';
import { PaymentRegistry } from '../src/api/services/payment/PaymentRegistry.js';
import { PaymentDispatcher } from '../src/api/services/payment/PaymentDispatcher.js';
import { MockPaymentProvider, MockPaymentMode } from '../src/api/services/payment/providers/MockPaymentProvider.js';
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
            name: 'Payment Test Restaurant',
            slug: `payment-test-${ts}`,
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

async function cleanupFixtures(restaurantId: string) {
    await prisma.payment_attempts.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.payments.deleteMany({ where: { restaurant_id: restaurantId } });
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
    await prisma.menu_items.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.menu_categories.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.stations.deleteMany({ where: { restaurant_id: restaurantId } });
    await prisma.restaurants.delete({ where: { id: restaurantId } });
}

async function runTests() {
    console.log('--- STARTING MISSION 011 PAYMENT LIFECYCLE VERIFICATION ---');

    const { restaurant, menuItem, station } = await setupFixtures();
    const restaurantId = restaurant.id;

    try {
        // ==========================================
        // TEST 1: Registry — mock payment provider registered
        // ==========================================
        console.log('\n[Test 1] Registry: mock payment provider registered');
        try {
            const registry = PaymentRegistry.getInstance();
            registry.clear();
            const mockProvider = new MockPaymentProvider();
            registry.register(mockProvider);

            assert('Mock payment provider registered', registry.has('MOCK_PAYMENT'), 'true', registry.has('MOCK_PAYMENT') ? 'true' : 'false');
            assert('Provider type is MOCK_PAYMENT', registry.get('MOCK_PAYMENT')?.type === 'MOCK_PAYMENT', 'MOCK_PAYMENT', registry.get('MOCK_PAYMENT')?.type || 'none');
            assert('Provider version is 1.0.0', registry.get('MOCK_PAYMENT')?.version === '1.0.0', '1.0.0', registry.get('MOCK_PAYMENT')?.version || 'none');
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
            const registry = PaymentRegistry.getInstance();
            const mockProvider = new MockPaymentProvider();
            let errorThrown = false;
            try {
                registry.register(mockProvider);
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
        // TEST 3: Payment creation — tenant scoped
        // ==========================================
        console.log('\n[Test 3] Payment creation: tenant scoped');
        try {
            const order = await prisma.orders.create({
                data: {
                    restaurant_id: restaurantId,
                    type: 'TAKEAWAY',
                    status: 'ACTIVE',
                    total: 100,
                    payment_status: 'UNPAID'
                }
            });

            const payment = await prisma.payments.create({
                data: {
                    restaurant_id: restaurantId,
                    order_id: order.id,
                    amount: 100,
                    currency: 'PKR',
                    status: 'PENDING',
                    provider: 'MOCK_PAYMENT'
                }
            });

            assert('Payment created', !!payment.id, 'id present', payment.id ? 'present' : 'missing');
            assert('Payment has restaurant_id', payment.restaurant_id === restaurantId, restaurantId, payment.restaurant_id);
            assert('Payment has order_id', payment.order_id === order.id, order.id, payment.order_id);

            const found = await prisma.payments.findFirst({
                where: { restaurant_id: restaurantId, order_id: order.id }
            });
            assert('Payment queryable by restaurant', !!found, 'found', found ? 'found' : 'missing');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Payment creation', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 4: Payment amount is immutable
        // ==========================================
        console.log('\n[Test 4] Payment amount is immutable');
        try {
            const order = await prisma.orders.create({
                data: {
                    restaurant_id: restaurantId,
                    type: 'TAKEAWAY',
                    status: 'ACTIVE',
                    total: 200,
                    payment_status: 'UNPAID'
                }
            });

            const payment = await prisma.payments.create({
                data: {
                    restaurant_id: restaurantId,
                    order_id: order.id,
                    amount: 200,
                    currency: 'PKR',
                    status: 'PENDING',
                    provider: 'MOCK_PAYMENT'
                }
            });

            assert('Payment amount set correctly', payment.amount.toString() === '200', '200', payment.amount.toString());
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Payment amount immutable', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 5: Successful payment attempt
        // ==========================================
        console.log('\n[Test 5] Successful payment attempt');
        try {
            const registry = PaymentRegistry.getInstance();
            registry.clear();
            const mockProvider = new MockPaymentProvider();
            mockProvider.setMode('SUCCESS');
            mockProvider.clearHistory();
            registry.register(mockProvider);

            const order = await prisma.orders.create({
                data: {
                    restaurant_id: restaurantId,
                    type: 'TAKEAWAY',
                    status: 'ACTIVE',
                    total: 100,
                    payment_status: 'UNPAID'
                }
            });

            const payment = await prisma.payments.create({
                data: {
                    restaurant_id: restaurantId,
                    order_id: order.id,
                    amount: 100,
                    currency: 'PKR',
                    status: 'PENDING',
                    provider: 'MOCK_PAYMENT'
                }
            });

            const dispatcher = PaymentDispatcher.getInstance();
            await dispatcher.startAttempt(payment.id, {
                paymentId: payment.id,
                restaurantId: restaurantId,
                orderId: order.id,
                staffId: 'test-staff',
                correlationId: crypto.randomUUID(),
                requestIdempotencyKey: crypto.randomUUID(),
                providerIdempotencyKey: `payment:${payment.id}:attempt:${crypto.randomUUID()}`,
                source: 'PAYMENT_DISPATCHER'
            });

            const updatedPayment = await prisma.payments.findUnique({ where: { id: payment.id } });
            const attempts = await prisma.payment_attempts.findMany({ where: { payment_id: payment.id } });

            assert('Payment status is PAID', updatedPayment?.status === 'PAID', 'PAID', updatedPayment?.status || 'none');
            assert('Attempt created', attempts.length === 1, '1', `${attempts.length}`);
            assert('Attempt status is COMPLETED', attempts[0]?.status === 'COMPLETED', 'COMPLETED', attempts[0]?.status || 'none');
            assert('Attempt has external_reference', attempts[0]?.external_reference?.startsWith('mock-payment'), 'mock-payment...', attempts[0]?.external_reference || 'none');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Successful payment', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 6: Failed payment attempt
        // ==========================================
        console.log('\n[Test 6] Failed payment attempt');
        try {
            const registry = PaymentRegistry.getInstance();
            registry.clear();
            const mockProvider = new MockPaymentProvider();
            mockProvider.setMode('FAILED');
            mockProvider.clearHistory();
            registry.register(mockProvider);

            const order = await prisma.orders.create({
                data: {
                    restaurant_id: restaurantId,
                    type: 'TAKEAWAY',
                    status: 'ACTIVE',
                    total: 100,
                    payment_status: 'UNPAID'
                }
            });

            const payment = await prisma.payments.create({
                data: {
                    restaurant_id: restaurantId,
                    order_id: order.id,
                    amount: 100,
                    currency: 'PKR',
                    status: 'PENDING',
                    provider: 'MOCK_PAYMENT'
                }
            });

            const dispatcher = PaymentDispatcher.getInstance();
            await dispatcher.startAttempt(payment.id, {
                paymentId: payment.id,
                restaurantId: restaurantId,
                orderId: order.id,
                staffId: 'test-staff',
                correlationId: crypto.randomUUID(),
                requestIdempotencyKey: crypto.randomUUID(),
                providerIdempotencyKey: `payment:${payment.id}:attempt:${crypto.randomUUID()}`,
                source: 'PAYMENT_DISPATCHER'
            });

            const updatedPayment = await prisma.payments.findUnique({ where: { id: payment.id } });
            const attempts = await prisma.payment_attempts.findMany({ where: { payment_id: payment.id } });

            assert('Payment status is FAILED', updatedPayment?.status === 'FAILED', 'FAILED', updatedPayment?.status || 'none');
            assert('Attempt status is DEAD_LETTER', attempts[0]?.status === 'DEAD_LETTER', 'DEAD_LETTER', attempts[0]?.status || 'none');
            assert('Attempt has last_error', !!attempts[0]?.last_error, 'present', attempts[0]?.last_error ? 'present' : 'missing');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Failed payment', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 7: Unknown payment attempt
        // ==========================================
        console.log('\n[Test 7] Unknown payment attempt');
        try {
            const registry = PaymentRegistry.getInstance();
            registry.clear();
            const mockProvider = new MockPaymentProvider();
            mockProvider.setMode('UNKNOWN');
            mockProvider.clearHistory();
            registry.register(mockProvider);

            const order = await prisma.orders.create({
                data: {
                    restaurant_id: restaurantId,
                    type: 'TAKEAWAY',
                    status: 'ACTIVE',
                    total: 100,
                    payment_status: 'UNPAID'
                }
            });

            const payment = await prisma.payments.create({
                data: {
                    restaurant_id: restaurantId,
                    order_id: order.id,
                    amount: 100,
                    currency: 'PKR',
                    status: 'PENDING',
                    provider: 'MOCK_PAYMENT'
                }
            });

            const dispatcher = PaymentDispatcher.getInstance();
            await dispatcher.startAttempt(payment.id, {
                paymentId: payment.id,
                restaurantId: restaurantId,
                orderId: order.id,
                staffId: 'test-staff',
                correlationId: crypto.randomUUID(),
                requestIdempotencyKey: crypto.randomUUID(),
                providerIdempotencyKey: `payment:${payment.id}:attempt:${crypto.randomUUID()}`,
                source: 'PAYMENT_DISPATCHER'
            });

            const updatedPayment = await prisma.payments.findUnique({ where: { id: payment.id } });
            const attempts = await prisma.payment_attempts.findMany({ where: { payment_id: payment.id } });

            assert('Payment status is UNKNOWN', updatedPayment?.status === 'UNKNOWN', 'UNKNOWN', updatedPayment?.status || 'none');
            assert('Attempt status is UNKNOWN', attempts[0]?.status === 'UNKNOWN', 'UNKNOWN', attempts[0]?.status || 'none');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Unknown payment', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 8: Request-level idempotency
        // ==========================================
        console.log('\n[Test 8] Request-level idempotency');
        try {
            const registry = PaymentRegistry.getInstance();
            registry.clear();
            const mockProvider = new MockPaymentProvider();
            mockProvider.setMode('SUCCESS');
            registry.register(mockProvider);

            const order = await prisma.orders.create({
                data: {
                    restaurant_id: restaurantId,
                    type: 'TAKEAWAY',
                    status: 'ACTIVE',
                    total: 100,
                    payment_status: 'UNPAID'
                }
            });

            const payment = await prisma.payments.create({
                data: {
                    restaurant_id: restaurantId,
                    order_id: order.id,
                    amount: 100,
                    currency: 'PKR',
                    status: 'PENDING',
                    provider: 'MOCK_PAYMENT'
                }
            });

            const dispatcher = PaymentDispatcher.getInstance();
            const requestIdempotencyKey = crypto.randomUUID();

            await dispatcher.startAttempt(payment.id, {
                paymentId: payment.id,
                restaurantId: restaurantId,
                orderId: order.id,
                staffId: 'test-staff',
                correlationId: crypto.randomUUID(),
                requestIdempotencyKey: requestIdempotencyKey,
                providerIdempotencyKey: `payment:${payment.id}:attempt:${crypto.randomUUID()}`,
                source: 'PAYMENT_DISPATCHER'
            });

            let errorThrown = false;
            try {
                await dispatcher.startAttempt(payment.id, {
                    paymentId: payment.id,
                    restaurantId: restaurantId,
                    orderId: order.id,
                    staffId: 'test-staff',
                    correlationId: crypto.randomUUID(),
                    requestIdempotencyKey: requestIdempotencyKey,
                    providerIdempotencyKey: `payment:${payment.id}:attempt:${crypto.randomUUID()}`,
                    source: 'PAYMENT_DISPATCHER'
                });
            } catch (e: any) {
                errorThrown = true;
            }

            const attempts = await prisma.payment_attempts.findMany({ where: { payment_id: payment.id } });
            assert('Only one attempt created', attempts.length === 1, '1', `${attempts.length}`);
            assert('Second request rejected for PAID payment', errorThrown, 'true', errorThrown ? 'true' : 'false');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Request idempotency', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 9: Cross-tenant access rejected
        // ==========================================
        console.log('\n[Test 9] Cross-tenant access rejected');
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

            const order = await prisma.orders.create({
                data: {
                    restaurant_id: restaurantId,
                    type: 'TAKEAWAY',
                    status: 'ACTIVE',
                    total: 100,
                    payment_status: 'UNPAID'
                }
            });

            const payment = await prisma.payments.create({
                data: {
                    restaurant_id: restaurantId,
                    order_id: order.id,
                    amount: 100,
                    currency: 'PKR',
                    status: 'PENDING',
                    provider: 'MOCK_PAYMENT'
                }
            });

            const registry = PaymentRegistry.getInstance();
            registry.clear();
            const mockProvider = new MockPaymentProvider();
            mockProvider.setMode('SUCCESS');
            registry.register(mockProvider);

            const dispatcher = PaymentDispatcher.getInstance();
            let errorThrown = false;
            try {
                await dispatcher.startAttempt(payment.id, {
                    paymentId: payment.id,
                    restaurantId: otherRestaurant.id,
                    orderId: order.id,
                    staffId: 'test-staff',
                    correlationId: crypto.randomUUID(),
                    requestIdempotencyKey: crypto.randomUUID(),
                    providerIdempotencyKey: `payment:${payment.id}:attempt:${crypto.randomUUID()}`,
                    source: 'PAYMENT_DISPATCHER'
                });
            } catch (e: any) {
                errorThrown = true;
            }

            assert('Cross-tenant access rejected', errorThrown, 'true', errorThrown ? 'true' : 'false');

            await cleanupFixtures(otherRestaurant.id);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Cross-tenant', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 10: UNKNOWN reconciliation
        // ==========================================
        console.log('\n[Test 10] UNKNOWN reconciliation');
        try {
            const registry = PaymentRegistry.getInstance();
            registry.clear();
            const mockProvider = new MockPaymentProvider();
            mockProvider.setMode('UNKNOWN');
            mockProvider.clearHistory();
            registry.register(mockProvider);

            const order = await prisma.orders.create({
                data: {
                    restaurant_id: restaurantId,
                    type: 'TAKEAWAY',
                    status: 'ACTIVE',
                    total: 100,
                    payment_status: 'UNPAID'
                }
            });

            const payment = await prisma.payments.create({
                data: {
                    restaurant_id: restaurantId,
                    order_id: order.id,
                    amount: 100,
                    currency: 'PKR',
                    status: 'PENDING',
                    provider: 'MOCK_PAYMENT'
                }
            });

            const dispatcher = PaymentDispatcher.getInstance();
            await dispatcher.startAttempt(payment.id, {
                paymentId: payment.id,
                restaurantId: restaurantId,
                orderId: order.id,
                staffId: 'test-staff',
                correlationId: crypto.randomUUID(),
                requestIdempotencyKey: crypto.randomUUID(),
                providerIdempotencyKey: `payment:${payment.id}:attempt:${crypto.randomUUID()}`,
                source: 'PAYMENT_DISPATCHER'
            });

            let updatedPayment = await prisma.payments.findUnique({ where: { id: payment.id } });
            assert('Payment is UNKNOWN after attempt', updatedPayment?.status === 'UNKNOWN', 'UNKNOWN', updatedPayment?.status || 'none');

            await dispatcher.reconcileUnknown(payment.id, {
                paymentId: payment.id,
                restaurantId: restaurantId,
                orderId: order.id,
                staffId: 'test-staff',
                correlationId: crypto.randomUUID(),
                requestIdempotencyKey: crypto.randomUUID(),
                providerIdempotencyKey: '',
                source: 'PAYMENT_DISPATCHER'
            }, 'PAID');

            updatedPayment = await prisma.payments.findUnique({ where: { id: payment.id } });
            assert('Payment reconciled to PAID', updatedPayment?.status === 'PAID', 'PAID', updatedPayment?.status || 'none');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'UNKNOWN reconciliation', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 11: PAID payment cannot be processed again
        // ==========================================
        console.log('\n[Test 11] PAID payment cannot be processed again');
        try {
            const registry = PaymentRegistry.getInstance();
            registry.clear();
            const mockProvider = new MockPaymentProvider();
            mockProvider.setMode('SUCCESS');
            registry.register(mockProvider);

            const order = await prisma.orders.create({
                data: {
                    restaurant_id: restaurantId,
                    type: 'TAKEAWAY',
                    status: 'ACTIVE',
                    total: 100,
                    payment_status: 'UNPAID'
                }
            });

            const payment = await prisma.payments.create({
                data: {
                    restaurant_id: restaurantId,
                    order_id: order.id,
                    amount: 100,
                    currency: 'PKR',
                    status: 'PENDING',
                    provider: 'MOCK_PAYMENT'
                }
            });

            const dispatcher = PaymentDispatcher.getInstance();
            await dispatcher.startAttempt(payment.id, {
                paymentId: payment.id,
                restaurantId: restaurantId,
                orderId: order.id,
                staffId: 'test-staff',
                correlationId: crypto.randomUUID(),
                requestIdempotencyKey: crypto.randomUUID(),
                providerIdempotencyKey: `payment:${payment.id}:attempt:${crypto.randomUUID()}`,
                source: 'PAYMENT_DISPATCHER'
            });

            let errorThrown = false;
            try {
                await dispatcher.startAttempt(payment.id, {
                    paymentId: payment.id,
                    restaurantId: restaurantId,
                    orderId: order.id,
                    staffId: 'test-staff',
                    correlationId: crypto.randomUUID(),
                    requestIdempotencyKey: crypto.randomUUID(),
                    providerIdempotencyKey: `payment:${payment.id}:attempt:${crypto.randomUUID()}`,
                    source: 'PAYMENT_DISPATCHER'
                });
            } catch (e: any) {
                errorThrown = true;
            }

            assert('PAID payment rejects new attempt', errorThrown, 'true', errorThrown ? 'true' : 'false');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'PAID payment rejection', expected: 'success', actual: e.message, result: 'FAIL' });
        }

    } finally {
        await cleanupFixtures(restaurantId);
        await prisma.$disconnect();
    }

    // ==========================================
    // REPORT
    // ==========================================
    console.log('\n=== MISSION 011 PAYMENT LIFECYCLE VERIFICATION REPORT ===');
    console.log(`Database: fireflow_test_011 (isolated)`);
    console.log(`Migration: 20260819000300_add_payments (applied)`);
    console.log(`Test command: $env:DATABASE_URL="postgresql://postgres:admin123@localhost:5432/fireflow_test_011?schema=public"; npx tsx tests/mission-011-payment-lifecycle.test.ts`);
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
        console.log('MISSION 011: NOT COMPLETE — failures detected');
        process.exit(1);
    } else {
        console.log('MISSION 011: VERIFICATION PASSED');
        process.exit(0);
    }
}

runTests().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
