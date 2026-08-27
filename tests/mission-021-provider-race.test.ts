import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

// M021 — M021 provider-attempt single-claim race elimination.
// Proves PA-1: for any logical line SETTLE_LINE:{tenant}:{order}:{METHOD},
// concurrent/retried settles converge to exactly one payments aggregate,
// exactly one provider-driving execution, exactly one provider operation,
// and exactly one authoritative settlement/journal/event outcome.

const prisma = new PrismaClient();
const BASE = 'http://localhost:3001/api';

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
    const res = await fetch(`${BASE}/auth/login`, {
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

async function main() {
    console.log('--- STARTING M021 PROVIDER-ATTEMPT RACE VERIFICATION ---');
    const ts = Date.now();

    const rA = await prisma.restaurants.create({
        data: { name: `M021 Alpha ${ts}`, slug: `m021-a-${ts}`, currency: 'PKR', phone: '03', address: 'x', timezone: 'Asia/Karachi', subscription_plan: 'BASIC', subscription_status: 'ACTIVE', order_flow_mode: 'STANDARD', kitchen_gate_enforced: false },
    });
    const rB = await prisma.restaurants.create({
        data: { name: `M021 Beta ${ts}`, slug: `m021-b-${ts}`, currency: 'PKR', phone: '03', address: 'x', timezone: 'Asia/Karachi', subscription_plan: 'BASIC', subscription_status: 'ACTIVE', order_flow_mode: 'STANDARD', kitchen_gate_enforced: false },
    });
    const ridA = rA.id;
    await seedCOA(ridA);
    const manager = await makeStaff(ridA, 'M021 Mgr', 'MANAGER', PINS.manager);
    const managerB = await makeStaff(rB.id, 'M021 Beta Mgr', 'MANAGER', PINS.managerB);
    const sessionA = await prisma.cashier_sessions.create({ data: { restaurant_id: ridA, opened_by: manager.staff.id, status: 'OPEN', opening_float: 0 } });

    const setProviderMode = async (mode: string) => {
        const r = await fetch(`${BASE}/testing/payment-mode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
        if (r.status !== 200) throw new Error(`provider mode ${mode} failed: ${r.status}`);
    };
    const providerHistory = async (): Promise<Array<{ providerIdempotencyKey: string; outcome: string }>> => {
        const r = await fetch(`${BASE}/testing/payment-mode`);
        const d: any = await r.json();
        return d.calls || [];
    };
    const settle = (orderId: string, body: object, token: string = manager.token, sessionId?: string) => {
        const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
        if (sessionId) headers['x-session-id'] = sessionId;
        return fetch(`${BASE}/orders/${orderId}/settle`, { method: 'POST', headers, body: JSON.stringify(body) });
    };

    try {
        await setProviderMode('SUCCESS');

        // ============ PA-R1: 8x concurrent CARD settle =====================
        console.log('\n[PA-R1] Wide concurrent CARD settle race');
        const oRace = await prisma.orders.create({ data: { restaurant_id: ridA, type: 'TAKEAWAY', status: 'ACTIVE', total: 100, payment_status: 'UNPAID' } });
        const raceResults = await Promise.all(Array.from({ length: 8 }).map(() => settle(oRace.id, { payments: [{ method: 'CARD', amount: 100 }], total: 100 }, manager.token, sessionA.id)));
        const raceBodies = await Promise.all(raceResults.map(r => r.json()));
        const racePayments = await prisma.payments.findMany({ where: { order_id: oRace.id } });
        const raceAttempts = await prisma.payment_attempts.findMany({ where: { payment_id: { in: racePayments.map(p => p.id) } } });
        const raceCalls = (await providerHistory()).filter(c => c.outcome === 'PAID');
        const raceJournals = await prisma.journal_entries.count({ where: { reference_type: 'ORDER_SALE', reference_id: oRace.id } });
        const raceEvents = await prisma.outbox.count({ where: { event_type: 'PAYMENT_COMPLETED', payload: { path: ['orderId'], equals: oRace.id } } });

        assert('exactly 1 payments aggregate', racePayments.length === 1, '1', `${racePayments.length}`);
        assert('at least 1 attempt, typically 1 (single-driver path)', raceAttempts.length >= 1 && raceAttempts.length <= 2, '1-2', `${raceAttempts.length}`);
        assert('exactly 1 mock provider send (deterministic key deduped)', raceCalls.length === 1, '1', `${raceCalls.length}`);
        assert('deterministic provider key used: payment:{id}', raceCalls[0]?.providerIdempotencyKey?.startsWith(`payment:${racePayments[0]?.id}`), 'payment:{id}', raceCalls[0]?.providerIdempotencyKey || 'none');
        assert('exactly 1 ORDER_SALE journal', raceJournals === 1, '1', `${raceJournals}`);
        assert('exactly 1 PAYMENT_COMPLETED event', raceEvents === 1, '1', `${raceEvents}`);
        assert('no 402/500 responses (only 200 or 409)', raceResults.every(r => r.status === 200 || r.status === 409), '200/409 only', JSON.stringify(raceResults.map(r => r.status)));
        assert('at least one authoritative 200', raceResults.some(r => r.status === 200), '>=1 200', `${raceResults.filter(r => r.status === 200).length}`);
        assert('order flipped to CLOSED/PAID', (await prisma.orders.findUnique({ where: { id: oRace.id } }))?.payment_status === 'PAID', 'PAID', 'other');

        // ============ Sequential retry after success =========================
        console.log('\n[Sequential retry] Verbatim replay, zero new provider calls');
        const retryBefore = (await providerHistory()).filter(c => c.outcome === 'PAID').length;
        const rRetry = await settle(oRace.id, { payments: [{ method: 'CARD', amount: 100 }], total: 100 }, manager.token, sessionA.id);
        const retryBody: any = await rRetry.json();
        const retryAfter = (await providerHistory()).filter(c => c.outcome === 'PAID').length;
        assert('retry returns 200', rRetry.status === 200, '200', `${rRetry.status}`);
        assert('replay marked via header', rRetry.headers.get('x-settlement-replay') === 'true', 'true', String(rRetry.headers.get('x-settlement-replay')));
        assert('zero additional mock sends', retryAfter === retryBefore, `${retryBefore}`, `${retryAfter}`);
        assert('order stays PAID on replay', (await prisma.orders.findUnique({ where: { id: oRace.id } }))?.payment_status === 'PAID', 'PAID', 'other');

        // ============ PROCESSING crash/resume ===============================
        console.log('\n[Crash/resume] Stuck PROCESSING resumes through CAS + deterministic key');
        const oResume = await prisma.orders.create({ data: { restaurant_id: ridA, type: 'TAKEAWAY', status: 'ACTIVE', total: 70, payment_status: 'UNPAID' } });
        const resumePayment = await prisma.payments.create({ data: { restaurant_id: ridA, order_id: oResume.id, amount: 70, currency: 'PKR', status: 'PROCESSING', provider: 'MOCK_PAYMENT', settle_line_key: `SETTLE_LINE:${ridA}:${oResume.id}:CARD` } });
        const callsBeforeResume = (await providerHistory()).filter(c => c.outcome === 'PAID').length;
        const rResume = await settle(oResume.id, { payments: [{ method: 'CARD', amount: 70 }], total: 70 }, manager.token, sessionA.id);
        const callsAfterResume = (await providerHistory()).filter(c => c.outcome === 'PAID').length;
        assert('resume completes settle (200)', rResume.status === 200, '200', `${rResume.status}`);
        assert('single provider operation across resume', callsAfterResume === callsBeforeResume + 1, '+1', `+${callsAfterResume - callsBeforeResume}`);
        assert('payment row completed', (await prisma.payments.findUnique({ where: { id: resumePayment.id } }))?.status === 'PAID', 'PAID', 'other');

        // ============ UNKNOWN -> reconcile -> fast-path ====================
        console.log('\n[UNKNOWN] 409 then reconcile then fast-path');
        await setProviderMode('UNKNOWN');
        const oUnknown = await prisma.orders.create({ data: { restaurant_id: ridA, type: 'TAKEAWAY', status: 'ACTIVE', total: 40, payment_status: 'UNPAID' } });
        const rUnknown = await settle(oUnknown.id, { payments: [{ method: 'CARD', amount: 40 }], total: 40 }, manager.token, sessionA.id);
        assert('UNKNOWN mode -> 409', rUnknown.status === 409, '409', `${rUnknown.status}`);
        const unknownBody: any = await rUnknown.json();
        assert('response carries paymentId', !!unknownBody.paymentId, 'present', 'missing');
        assert('order stays ACTIVE', (await prisma.orders.findUnique({ where: { id: oUnknown.id } }))?.payment_status === 'UNPAID', 'UNPAID', 'other');

        // Reconcile via direct service (M017-B route pattern)
        const { PaymentDispatcher } = await import('../src/api/services/payment/PaymentDispatcher');
        await PaymentDispatcher.getInstance().reconcileUnknown(unknownBody.paymentId, { restaurantId: ridA, orderId: oUnknown.id, correlationId: `reconcile:${oUnknown.id}`, requestIdempotencyKey: `settle:${oUnknown.id}:CARD`, providerIdempotencyKey: '', source: 'RECONCILE' }, 'PAID');
        const rAfterReconcile = await settle(oUnknown.id, { payments: [{ method: 'CARD', amount: 40 }], total: 40 }, manager.token, sessionA.id);
        assert('post-reconcile fast-path settles (200)', rAfterReconcile.status === 200, '200', `${rAfterReconcile.status}`);
        assert('order now PAID', (await prisma.orders.findUnique({ where: { id: oUnknown.id } }))?.payment_status === 'PAID', 'PAID', 'other');
        await setProviderMode('SUCCESS');

        // ============ FAILED -> 402, no side effects =========================
        console.log('\n[FAILED] 402, no journals/events');
        await setProviderMode('FAILED');
        const oFailed = await prisma.orders.create({ data: { restaurant_id: ridA, type: 'TAKEAWAY', status: 'ACTIVE', total: 60, payment_status: 'UNPAID' } });
        const rFailed = await settle(oFailed.id, { payments: [{ method: 'CARD', amount: 60 }], total: 60 }, manager.token, sessionA.id);
        assert('FAILED mode -> 402', rFailed.status === 402, '402', `${rFailed.status}`);
        assert('no ORDER_SALE journal on FAILED', (await prisma.journal_entries.count({ where: { reference_type: 'ORDER_SALE', reference_id: oFailed.id } })) === 0, '0', 'present');
        assert('order stays ACTIVE', (await prisma.orders.findUnique({ where: { id: oFailed.id } }))?.payment_status === 'UNPAID', 'UNPAID', 'other');
        await setProviderMode('SUCCESS');

        // ============ Mixed CASH + CARD concurrent =========================
        console.log('\n[Mixed tender] CASH inline, CARD singly claimed');
        const oMixed = await prisma.orders.create({ data: { restaurant_id: ridA, type: 'TAKEAWAY', status: 'ACTIVE', total: 150, payment_status: 'UNPAID' } });
        const mixedResults = await Promise.all(Array.from({ length: 4 }).map(() => settle(oMixed.id, { payments: [{ method: 'CASH', amount: 60 }, { method: 'CARD', amount: 90 }], total: 150 }, manager.token, sessionA.id)));
        const mixedPayments = await prisma.payments.findMany({ where: { order_id: oMixed.id } });
        const mixedCalls = (await providerHistory()).filter(c => c.outcome === 'PAID');
        assert('exactly 1 CARD payment aggregate (CASH inline)', mixedPayments.length === 1 && mixedPayments[0]?.provider === 'MOCK_PAYMENT', '1/CARD', `${mixedPayments.length}/${mixedPayments[0]?.provider}`);
        assert('exactly 1 provider call for mixed tender', mixedCalls.length === 1, '1', `${mixedCalls.length}`);
        assert('order PAID', (await prisma.orders.findUnique({ where: { id: oMixed.id } }))?.payment_status === 'PAID', 'PAID', 'other');

        // ============ CASH-only race -> zero provider machinery =============
        console.log('\n[CASH-only] Zero payments/attempts/provider calls');
        await setProviderMode('SUCCESS');
        const oCash = await prisma.orders.create({ data: { restaurant_id: ridA, type: 'TAKEAWAY', status: 'ACTIVE', total: 50, payment_status: 'UNPAID' } });
        const cashCallsBefore = (await providerHistory()).filter(c => c.outcome === 'PAID').length;
        const cashResults = await Promise.all(Array.from({ length: 6 }).map(() => settle(oCash.id, { paymentMethod: 'CASH', total: 50 }, manager.token, sessionA.id)));
        const cashPayments = await prisma.payments.findMany({ where: { order_id: oCash.id } });
        const cashCallsAfter = (await providerHistory()).filter(c => c.outcome === 'PAID').length;
        assert('CASH race: zero payment aggregates', cashPayments.length === 0, '0', `${cashPayments.length}`);
        assert('CASH race: zero additional provider calls', cashCallsAfter === cashCallsBefore, `${cashCallsBefore}`, `${cashCallsAfter}`);
        assert('CASH race: all 200', cashResults.every(r => r.status === 200), 'all 200', JSON.stringify(cashResults.map(r => r.status)));

        // ============ Cross-tenant -> 404 oracle ============================
        console.log('\n[Cross-tenant] 404 oracle + audited block');
        const oCross = await prisma.orders.create({ data: { restaurant_id: ridA, type: 'TAKEAWAY', status: 'ACTIVE', total: 50, payment_status: 'UNPAID' } });
        const sessionB = await prisma.cashier_sessions.create({ data: { restaurant_id: rB.id, opened_by: managerB.staff.id, status: 'OPEN', opening_float: 0 } });
        const rCross = await fetch(`${BASE}/orders/${oCross.id}/settle`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${managerB.token}`, 'x-session-id': sessionB.id, 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentMethod: 'CASH', total: 50 }),
        });
        assert('tenant B cannot settle tenant A order (404)', rCross.status === 404, '404', `${rCross.status}`);

        // ============ M019 gate inert when enforcement OFF ==================
        console.log('\n[M019 gate] Kitchen gate inert with enforcement OFF');
        const oGate = await prisma.orders.create({ data: { restaurant_id: ridA, type: 'TAKEAWAY', status: 'ACTIVE', total: 40, payment_status: 'UNPAID' } });
        const rGate = await settle(oGate.id, { payments: [{ method: 'CARD', amount: 40 }], total: 40 }, manager.token, sessionA.id);
        assert('STANDARD + enforcement OFF -> settle succeeds (200)', rGate.status === 200, '200', `${rGate.status}`);
        assert('order PAID after successful settle', (await prisma.orders.findUnique({ where: { id: oGate.id } }))?.payment_status === 'PAID', 'PAID', 'other');

        // ============ M020 refund regression ==============================
        console.log('\n[M020 regression] Refund flow still intact');
        const oRefund = await prisma.orders.create({ data: { restaurant_id: ridA, type: 'TAKEAWAY', status: 'ACTIVE', total: 30, payment_status: 'UNPAID' } });
        const sessionForRefund = await prisma.cashier_sessions.create({ data: { restaurant_id: ridA, opened_by: manager.staff.id, status: 'OPEN', opening_float: 0 } });
        await settle(oRefund.id, { paymentMethod: 'CASH', total: 30 }, manager.token, sessionForRefund.id);
        const rRefund = await fetch(`${BASE}/orders/${oRefund.id}/refund`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${manager.token}`, 'x-session-id': sessionForRefund.id, 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: PINS.manager, reasonCode: 'CUSTOMER_REQUEST' }),
        });
        assert('M020 refund path still works', rRefund.status === 200, '200', `${rRefund.status}`);
        const refundBody: any = await rRefund.json();
        assert('refund order flips to REFUNDED', refundBody.refund?.payment_status === 'REFUNDED' || (await prisma.orders.findUnique({ where: { id: oRefund.id } }))?.payment_status === 'REFUNDED', 'REFUNDED', 'other');

        console.log(`\n=== M021 RESULTS: ${passed} passed, ${failed} failed ===`);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    } finally {
        try {
            const rids = [ridA, rB.id];
            await prisma.payment_attempts.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.payments.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.refunds.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.transactions.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.ledger_entries.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.journal_entries.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.outbox.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.audit_logs.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.fire_batches.deleteMany({ where: { orders: { restaurant_id: { in: rids } } } });
            await prisma.order_items.deleteMany({ where: { orders: { restaurant_id: { in: rids } } } });
            await prisma.orders.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.menu_items.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.cashier_sessions.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.chart_of_accounts.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.staff.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.restaurants.deleteMany({ where: { id: { in: rids } } });
        } catch (e: any) {
            console.log('cleanup warning:', e.message);
        }
    }

    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

main();
