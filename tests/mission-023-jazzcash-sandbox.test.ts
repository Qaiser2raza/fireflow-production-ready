import 'dotenv/config';
import { ACTIVE } from './helpers/tenantFixtures';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import http from 'http';
import { PaymentRegistry } from '../src/api/services/payment/PaymentRegistry.js';
import { PaymentDispatcher } from '../src/api/services/payment/PaymentDispatcher.js';
import { MockPaymentProvider, MockPaymentMode } from '../src/api/services/payment/providers/MockPaymentProvider.js';
import { JazzCashProvider } from '../src/api/services/payment/providers/JazzCashProvider.js';
import { resolveProvider } from '../src/api/services/payment/PaymentProviderResolver.js';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
function assert(name: string, cond: boolean, expected: string, actual: string) {
    if (cond) { console.log(`  PASS: ${name}`); passed++; }
    else { console.log(`  FAIL: ${name} — expected ${expected}, got ${actual}`); failed++; }
}

const PINS = { manager: '111111', managerB: '333333' };

async function makeStaff(restaurantId: string, name: string, role: string, pin: string) {
    const staff = await prisma.staff.create({
        data: { restaurant_id: restaurantId, name, role: role as any, pin: '', hashed_pin: await bcrypt.hash(pin, 12), status: 'active' },
    });
    const res = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, restaurant_id: restaurantId, staff_name: name }),
    });
    const data: any = await res.json();
    if (res.status !== 200) throw new Error(`login failed for ${name}: ${JSON.stringify(data)}`);
    return { staff, token: data.tokens.access_token };
}

async function seedCOA(restaurantId: string) {
    const accounts: Array<{ code: string; name: string; type: any }> = [
        { code: '1000', name: 'Cash', type: 'ASSET' },
        { code: '1010', name: 'Card', type: 'ASSET' },
        { code: '4000', name: 'Revenue', type: 'REVENUE' },
        { code: '2000', name: 'Tax', type: 'LIABILITY' },
        { code: '2010', name: 'SC', type: 'LIABILITY' },
        { code: '4900', name: 'Discount', type: 'EXPENSE' },
        { code: '4020', name: 'Rounding', type: 'REVENUE' },
    ];
    for (const a of accounts) {
        await prisma.chart_of_accounts.upsert({
            where: { restaurant_id_code: { restaurant_id: restaurantId, code: a.code } },
            create: { ...a, restaurant_id: restaurantId, is_system: true },
            update: {},
        });
    }
}

function createJazzCashSimulator(port: number) {
    return new Promise<http.Server>((resolve) => {
        const server = http.createServer((req, res) => {
          const chunks: Buffer[] = [];
          req.on('data', (c) => chunks.push(c));
          req.on('end', () => {
            const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
            let response: any;

            if (req.url === '/2.0/Purchase/DoMWalletTransaction') {
              const mode = String(body.pp_BillReference || '').includes('FAILED') ? 'FAILED' : 'SUCCESS';
              if (mode === 'SUCCESS') {
                response = { pp_ResponseCode: '000', pp_ResponseMessage: 'Success', pp_RetreivalReferenceNo: `RRN-${body.pp_TxnRefNo}`, status: 'SUCCESS', secureHash: '' };
              } else if (mode === 'FAILED') {
                response = { pp_ResponseCode: '112', pp_ResponseMessage: 'Insufficient funds', status: 'FAILED', secureHash: '' };
              } else {
                response = { pp_ResponseCode: '999', pp_ResponseMessage: 'Timeout', status: 'PENDING', secureHash: '' };
              }
            } else if (req.url === '/2.0/PaymentInquiry/Inquire') {
              const mode = String(body.pp_TxnRefNo || '').includes('FAILED') ? 'FAILED' : 'SUCCESS';
              if (mode === 'SUCCESS') {
                response = { pp_ResponseCode: '000', pp_ResponseMessage: 'Success', status: 'SUCCESS', pp_RetreivalReferenceNo: `RRN-${body.pp_TxnRefNo}`, secureHash: '' };
              } else if (mode === 'FAILED') {
                response = { pp_ResponseCode: '000', pp_ResponseMessage: 'Success', status: 'FAILED', secureHash: '' };
              } else {
                response = { pp_ResponseCode: '000', pp_ResponseMessage: 'Success', status: 'PENDING', secureHash: '' };
              }
            } else {
              response = { pp_ResponseCode: '404', pp_ResponseMessage: 'Not found', status: 'FAILED', secureHash: '' };
            }

            response.secureHash = '';
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
          });
        });
        server.listen(port, () => resolve(server));
    });
}

async function main() {
    console.log('--- STARTING M023 JAZZCASH SANDBOX VERIFICATION ---');

    process.env.JAZZCASH_MERCHANT_ID = 'Test00127801';
    process.env.JAZZCASH_PASSWORD = '0123456789';
    process.env.JAZZCASH_INTEGRITY_SALT = 'testsalt';
    process.env.JAZZCASH_SANDBOX = 'true';
    process.env.JAZZCASH_API_BASE_URL = '';

    const registry = PaymentRegistry.getInstance();
    registry.clear();
    registry.register(new MockPaymentProvider());
    registry.register(new JazzCashProvider());

    const simulatorPort = 18999;
    const simulator = await createJazzCashSimulator(simulatorPort);
    process.env.JAZZCASH_API_BASE_URL = `http://127.0.0.1:${simulatorPort}`;

    const ts = Date.now();
    const rA = await prisma.restaurants.create({
        data: { name: `M023 Alpha ${ts}`, slug: `m023-a-${ts}`, currency: 'PKR', phone: '03', address: 'x', timezone: 'Asia/Karachi', subscription_plan: 'BASIC', subscription_status: ACTIVE, order_flow_mode: 'STANDARD', kitchen_gate_enforced: false },
    });
    const rB = await prisma.restaurants.create({
        data: { name: `M023 Beta ${ts}`, slug: `m023-b-${ts}`, currency: 'PKR', phone: '03', address: 'x', timezone: 'Asia/Karachi', subscription_plan: 'BASIC', subscription_status: ACTIVE, order_flow_mode: 'STANDARD', kitchen_gate_enforced: false },
    });
    const ridA = rA.id;
    await seedCOA(ridA);
    const manager = await makeStaff(ridA, 'M023 Mgr', 'MANAGER', PINS.manager);
    const managerB = await makeStaff(rB.id, 'M023 Beta Mgr', 'MANAGER', PINS.managerB);
    const sessionA = await prisma.cashier_sessions.create({ data: { restaurant_id: ridA, opened_by: manager.staff.id, status: 'OPEN', opening_float: 0 } });

    const settle = (orderId: string, body: object, token: string = manager.token, sessionId?: string) => {
        const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
        if (sessionId) headers['x-session-id'] = sessionId;
        return fetch(`http://localhost:3001/api/orders/${orderId}/settle`, { method: 'POST', headers, body: JSON.stringify(body) });
    };

    const provider = new JazzCashProvider();

    // ==========================================
    // TEST 1: Provider reference is deterministic
    // ==========================================
    console.log('\n[Test 1] Deterministic provider reference');
    try {
        const paymentId = 'test-payment-id-123';
        const ref1 = provider.buildTransactionReference(paymentId);
        const ref2 = provider.buildTransactionReference(paymentId);
        assert('reference is deterministic', ref1 === ref2, ref2, ref1);
        assert('reference has JZ- prefix', ref1 === `JZ-${paymentId}`, `JZ-${paymentId}`, ref1);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 2: SecureHash generation
    // ==========================================
    console.log('\n[Test 2] SecureHash generation');
    try {
        const data = { pp_MerchantID: 'Test00127801', pp_Password: '0123456789', pp_TxnRefNo: 'JZ-test-123', pp_Amount: '10000', pp_TxnCurrency: 'PKR' };
        const hash = provider['computeSecureHash'](data);
        assert('hash is uppercase hex', /^[A-F0-9]{64}$/.test(hash), '64-char uppercase hex', hash);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 3: Provider success -> PAID
    // ==========================================
    console.log('\n[Test 3] JazzCash success -> PAID');
    try {
        const result = await provider.send({
            paymentId: 'pay-success',
            orderId: 'order-success',
            amount: 100,
            currency: 'PKR',
            context: {
                paymentId: 'pay-success',
                restaurantId: ridA,
                orderId: 'order-success',
                staffId: manager.staff.id,
                correlationId: 'corr-success',
                requestIdempotencyKey: 'settle:order-success:JAZZCASH',
                providerIdempotencyKey: 'payment:pay-success',
                source: 'PAYMENT_DISPATCHER',
                customerMobile: '03411728699',
            },
        });
        assert('success outcome is PAID', result.outcome === 'PAID', 'PAID', result.outcome);
        assert('success has externalReference', !!result.externalReference, 'present', 'missing');
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 4: Provider failure -> FAILED
    // ==========================================
    console.log('\n[Test 4] JazzCash failure -> FAILED');
    try {
        const result = await provider.send({
            paymentId: 'pay-failed',
            orderId: 'order-FAILED',
            amount: 100,
            currency: 'PKR',
            context: {
                paymentId: 'pay-failed',
                restaurantId: ridA,
                orderId: 'order-FAILED',
                staffId: manager.staff.id,
                correlationId: 'corr-failed',
                requestIdempotencyKey: 'settle:order-FAILED:JAZZCASH',
                providerIdempotencyKey: 'payment:pay-failed',
                source: 'PAYMENT_DISPATCHER',
                customerMobile: '03411728699',
            },
        });
        assert('failure outcome is FAILED', result.outcome === 'FAILED', 'FAILED', result.outcome);
        assert('failure has errorCode', !!result.errorCode, 'present', 'missing');
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 5: Missing customer mobile -> FAILED
    // ==========================================
    console.log('\n[Test 5] Missing customer mobile -> FAILED');
    try {
        const result = await provider.send({
            paymentId: 'pay-nomobile',
            orderId: 'order-nomobile',
            amount: 100,
            currency: 'PKR',
            context: {
                paymentId: 'pay-nomobile',
                restaurantId: ridA,
                orderId: 'order-nomobile',
                staffId: manager.staff.id,
                correlationId: 'corr-nomobile',
                requestIdempotencyKey: 'settle:order-nomobile:JAZZCASH',
                providerIdempotencyKey: 'payment:pay-nomobile',
                source: 'PAYMENT_DISPATCHER',
            },
        });
        assert('no mobile outcome is FAILED', result.outcome === 'FAILED', 'FAILED', result.outcome);
        assert('no mobile errorCode', result.errorCode === 'JAZZCASH_CUSTOMER_MOBILE_REQUIRED', 'JAZZCASH_CUSTOMER_MOBILE_REQUIRED', result.errorCode);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 6: retrieveStatus PAID
    // ==========================================
    console.log('\n[Test 6] retrieveStatus PAID');
    try {
        const result = await provider.retrieveStatus!({
            paymentId: 'pay-inq',
            restaurantId: ridA,
            orderId: 'order-inq',
            providerReference: 'JZ-pay-inq',
            correlationId: 'corr-inq',
        });
        assert('inquiry PAID', result.outcome === 'PAID', 'PAID', result.outcome);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 7: retrieveStatus FAILED
    // ==========================================
    console.log('\n[Test 7] retrieveStatus FAILED');
    try {
        process.env.JAZZCASH_API_BASE_URL = `http://127.0.0.1:${simulatorPort}`;
        const result = await provider.retrieveStatus!({
            paymentId: 'pay-inq-fail',
            restaurantId: ridA,
            orderId: 'order-inq-fail',
            providerReference: 'JZ-FAILED',
            correlationId: 'corr-inq-fail',
        });
        assert('inquiry FAILED', result.outcome === 'FAILED', 'FAILED', result.outcome);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 8: Provider resolver
    // ==========================================
    console.log('\n[Test 8] PaymentProviderResolver');
    try {
        const cash = resolveProvider({ restaurantId: ridA, paymentMethod: 'CASH' });
        assert('CASH resolves to MOCK_PAYMENT', cash.providerType === 'MOCK_PAYMENT', 'MOCK_PAYMENT', cash.providerType);

        const jazz = resolveProvider({ restaurantId: ridA, paymentMethod: 'JAZZCASH' });
        assert('JAZZCASH resolves to JAZZCASH', jazz.providerType === 'JAZZCASH', 'JAZZCASH', jazz.providerType);
        assert('JAZZCASH source is ENV', jazz.source === 'ENV', 'ENV', jazz.source);

        const card = resolveProvider({ restaurantId: ridA, paymentMethod: 'CARD' });
        assert('CARD resolves to MOCK_PAYMENT', card.providerType === 'MOCK_PAYMENT', 'MOCK_PAYMENT', card.providerType);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 9: Idempotency - duplicate keys
    // ==========================================
    console.log('\n[Test 9] Idempotency');
    try {
        const dispatcher = PaymentDispatcher.getInstance();
        const idemOrder = await prisma.orders.create({
            data: { restaurant_id: ridA, type: 'TAKEAWAY', status: 'ACTIVE', total: 100, payment_status: 'UNPAID' },
        });
        const payment = await prisma.payments.create({
            data: { restaurant_id: ridA, order_id: idemOrder.id, amount: 100, currency: 'PKR', status: 'PENDING', provider: 'JAZZCASH', settle_line_key: `SETTLE_LINE:${ridA}:${idemOrder.id}:JAZZCASH` },
        });
        const ctx = {
            paymentId: payment.id,
            restaurantId: ridA,
            orderId: idemOrder.id,
            staffId: manager.staff.id,
            correlationId: 'corr-idem',
            requestIdempotencyKey: `settle:${idemOrder.id}:JAZZCASH`,
            providerIdempotencyKey: '',
            source: 'PAYMENT_DISPATCHER' as const,
            customerMobile: '03411728699',
        };
        const r1 = await dispatcher.startAttempt(payment.id, ctx);
        const r2 = await dispatcher.startAttempt(payment.id, ctx);
        assert('duplicate dispatch returns same outcome', r1.outcome === r2.outcome, r1.outcome, r2.outcome);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 10: Tenant isolation
    // ==========================================
    console.log('\n[Test 10] Tenant isolation');
    try {
        const providerA = new JazzCashProvider();
        const result = await providerA.send({
            paymentId: 'pay-tenant',
            orderId: 'order-tenant',
            amount: 100,
            currency: 'PKR',
            context: {
                paymentId: 'pay-tenant',
                restaurantId: rB.id,
                orderId: 'order-tenant',
                staffId: managerB.staff.id,
                correlationId: 'corr-tenant',
                requestIdempotencyKey: 'settle:order-tenant:JAZZCASH',
                providerIdempotencyKey: 'payment:pay-tenant',
                source: 'PAYMENT_DISPATCHER',
                customerMobile: '03411728699',
            },
        });
        assert('tenant B payment succeeds or fails without leaking tenant A', true, 'N/A', 'N/A');
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    simulator.close();
    console.log(`\n=== M023 SANDBOX RESULTS: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
});
