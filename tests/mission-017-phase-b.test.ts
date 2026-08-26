import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

// M017 Phase B — payment unification evidence (EVIDENCE, NOT AUTHORITY).
// Proves the strangler contract from the decision memo:
//   (1) CASH regression: synchronous path byte-identical to Phase A;
//   (2) provider-mediated methods (CARD) route through PaymentDispatcher:
//       payments aggregate + attempt state machine, then ONE commit
//       transaction with journal termination + durable events;
//   (3) mixed splits attribute journals per method;
//   (4) provider FAILED rejects the settle with order untouched;
//   (5) provider UNKNOWN refuses the settle (invariant 6) and the
//       reconciliation endpoint resolves it; re-settle commits via fast-path;
//   (6) Phase A replay guard intact through the new routing;
//   (7) tenant isolation on the new surfaces.

const prisma = new PrismaClient();
const BASE = 'http://localhost:3001/api';

let passed = 0;
let failed = 0;

function assert(testName: string, condition: boolean, expected: string, actual: string) {
    if (condition) {
        console.log(`  PASS: ${testName}`);
        passed++;
    } else {
        console.log(`  FAIL: ${testName} — expected ${expected}, got ${actual}`);
        failed++;
    }
}

async function makeTenant(name: string, ts: number) {
    const restaurant = await prisma.restaurants.create({
        data: {
            name,
            slug: `m017b-${name.toLowerCase().replace(/\s+/g, '-')}-${ts}`,
            phone: '03000000000',
            address: 'Test',
            currency: 'PKR',
            timezone: 'Asia/Karachi',
            subscription_plan: 'BASIC',
            subscription_status: 'ACTIVE',
        },
    });
    const pin = '424242';
    const staffName = `${name} Manager`;
    const staff = await prisma.staff.create({
        data: {
            restaurant_id: restaurant.id,
            name: staffName,
            role: 'MANAGER',
            pin: '',
            hashed_pin: await bcrypt.hash(pin, 12),
            status: 'active',
        },
    });
    const session = await prisma.cashier_sessions.create({
        data: { restaurant_id: restaurant.id, opened_by: staff.id, status: 'OPEN', opening_float: 0 },
    });
    const loginRes = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, restaurant_id: restaurant.id, staff_name: staffName }),
    });
    const loginData: any = await loginRes.json();
    if (loginRes.status !== 200 || !loginData?.tokens?.access_token) {
        throw new Error(`fixture login failed (${loginRes.status})`);
    }
    return { restaurant, staff, session, token: loginData.tokens.access_token };
}

async function main() {
    console.log('--- STARTING M017 PHASE B PAYMENT UNIFICATION VERIFICATION ---');
    const ts = Date.now();
    const tenantA = await makeTenant('M017B Alpha', ts);
    const tenantB = await makeTenant('M017B Beta', ts);
    const ridA = tenantA.restaurant.id;

    const setMode = async (mode: string) => {
        const r = await fetch(`${BASE}/testing/payment-mode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode }),
        });
        if (r.status !== 200) throw new Error(`setMode ${mode} failed: ${r.status}`);
    };
    const settle = (orderId: string, body: object, tenant: typeof tenantA = tenantA) =>
        fetch(`${BASE}/orders/${orderId}/settle`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${tenant.token}`,
                'x-session-id': tenant.session.id,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
    const createOrder = (total: number) =>
        prisma.orders.create({
            data: { restaurant_id: ridA, type: 'TAKEAWAY', status: 'ACTIVE', total, payment_status: 'UNPAID' },
        });
    const eventsFor = (orderId: string) =>
        prisma.outbox.findMany({ where: { restaurant_id: ridA, aggregate_type: 'orders', aggregate_id: orderId } });

    try {
        // ================= T1: CASH regression (Phase A path untouched) =====
        console.log('\n[T1] CASH-only settle — synchronous path regression');
        const o1 = await createOrder(100);
        const r1: any = await (await settle(o1.id, { paymentMethod: 'CASH', total: 100 })).json();
        assert('cash settle succeeds', r1.success === true && r1.order.payment_status === 'PAID', 'PAID', String(r1.order?.payment_status));
        const cashTxRows = await prisma.transactions.findMany({ where: { order_id: o1.id } });
        assert('one CASH transaction row', cashTxRows.length === 1 && cashTxRows[0].payment_method === 'CASH', '1xCASH', `${cashTxRows.length}`);
        const cashEvents = await eventsFor(o1.id);
        assert('both durable events present', cashEvents.some(e => e.event_type === 'PAYMENT_COMPLETED') && cashEvents.some(e => e.event_type === 'ORDER_COMPLETED'), '2 events', `${cashEvents.length}`);
        const cashPaymentsRows = await prisma.payments.count({ where: { order_id: o1.id } });
        assert('cash path creates NO payments aggregate', cashPaymentsRows === 0, '0', `${cashPaymentsRows}`);

        // ================= T2: CARD-only through dispatcher ==================
        console.log('\n[T2] CARD-only settle — PaymentDispatcher route');
        await setMode('SUCCESS');
        const o2 = await createOrder(80);
        const r2: any = await (await settle(o2.id, { payments: [{ method: 'CARD', amount: 80 }] })).json();
        assert('card settle succeeds via dispatcher', r2.success === true && r2.order.payment_status === 'PAID', 'PAID', String(r2.order?.payment_status));
        const agg = await prisma.payments.findFirst({ where: { order_id: o2.id } });
        assert('payments aggregate PAID with external ref', agg?.status === 'PAID' && !!agg.external_reference, 'PAID+ref', `${agg?.status}/${agg?.external_reference?.slice(0, 12)}`);
        const attempts = await prisma.payment_attempts.findMany({ where: { payment_id: agg!.id } });
        assert('attempt COMPLETED', attempts.length === 1 && attempts[0].status === 'COMPLETED', '1xCOMPLETED', `${attempts.length}`);
        const cardTxRows = await prisma.transactions.findMany({ where: { order_id: o2.id } });
        assert('CARD transaction carries external reference', cardTxRows.length === 1 && cardTxRows[0].payment_method === 'CARD' && cardTxRows[0].transaction_ref === agg!.external_reference, 'ref matches', String(cardTxRows[0]?.transaction_ref).slice(0, 16));
        const cardEvents = await eventsFor(o2.id);
        assert('both durable events present (dispatcher path)', cardEvents.some(e => e.event_type === 'PAYMENT_COMPLETED') && cardEvents.some(e => e.event_type === 'ORDER_COMPLETED'), '2 events', `${cardEvents.length}`);

        // ================= T3: mixed split CASH + CARD =======================
        console.log('\n[T3] Mixed split — per-method journal attribution');
        const o3 = await createOrder(80);
        const r3: any = await (await settle(o3.id, { payments: [{ method: 'CASH', amount: 50 }, { method: 'CARD', amount: 30 }] })).json();
        assert('mixed settle succeeds', r3.success === true && r3.order.payment_status === 'PAID', 'PAID', String(r3.order?.payment_status));
        const mixedTx = await prisma.transactions.findMany({ where: { order_id: o3.id } });
        assert('two transaction rows (CASH+CARD)', mixedTx.length === 2 && new Set(mixedTx.map(t => t.payment_method)).size === 2, '2 methods', `${mixedTx.length}`);
        const ledgers = await prisma.ledger_entries.findMany({ where: { restaurant_id: ridA } });
        const debits = ledgers.filter(l => l.transaction_type === 'DEBIT').reduce((s, l) => s + Number(l.amount), 0);
        const credits = ledgers.filter(l => l.transaction_type === 'CREDIT').reduce((s, l) => s + Number(l.amount), 0);
        assert('ledger balanced across mixed settle', Math.abs(debits - credits) < 0.001 && debits >= 80, 'balanced', `${debits}/${credits}`);
        const mixedEvents = await eventsFor(o3.id);
        const payPayload: any = mixedEvents.find(e => e.event_type === 'PAYMENT_COMPLETED')?.payload;
        assert('event payload lists both methods', Array.isArray(payPayload?.payments) && payPayload.payments.length === 2, '2 lines', JSON.stringify(payPayload?.payments)?.slice(0, 60));

        // ================= T4: provider FAILED ===============================
        console.log('\n[T4] Provider FAILED — settle rejected, order untouched');
        await setMode('FAILED');
        const o4 = await createOrder(40);
        const baselineJournals = await prisma.journal_entries.count({ where: { restaurant_id: ridA } });
        const baselineEvents = await prisma.outbox.count({ where: { restaurant_id: ridA } });
        const r4 = await settle(o4.id, { payments: [{ method: 'CARD', amount: 40 }] });
        assert('failed card settle rejected 402', r4.status === 402, '402', `${r4.status}`);
        const r4b: any = await r4.json();
        assert('rejection carries paymentId', !!r4b.paymentId, 'paymentId', JSON.stringify(r4b).slice(0, 60));
        const o4After = await prisma.orders.findUnique({ where: { id: o4.id } });
        assert('order remains OPEN/UNPAID', o4After?.status === 'ACTIVE' && o4After?.payment_status === 'UNPAID', 'ACTIVE/UNPAID', `${o4After?.status}/${o4After?.payment_status}`);
        assert('zero new journals', (await prisma.journal_entries.count({ where: { restaurant_id: ridA } })) === baselineJournals, `${baselineJournals}`, 'changed');
        assert('zero new events', (await prisma.outbox.count({ where: { restaurant_id: ridA } })) === baselineEvents, `${baselineEvents}`, 'changed');
        const failedAgg = await prisma.payments.findFirst({ where: { order_id: o4.id } });
        assert('aggregate FAILED, attempt DEAD_LETTER', failedAgg?.status === 'FAILED' && (await prisma.payment_attempts.count({ where: { payment_id: failedAgg.id, status: 'DEAD_LETTER' } })) === 1, 'FAILED/DEAD_LETTER', `${failedAgg?.status}`);

        // ================= T5: UNKNOWN -> reconcile -> fast-path commit ======
        console.log('\n[T5] Provider UNKNOWN — invariant 6 reconciliation loop');
        await setMode('UNKNOWN');
        const o5 = await createOrder(25);
        const r5 = await settle(o5.id, { payments: [{ method: 'CARD', amount: 25 }] });
        assert('unknown settle refused 409', r5.status === 409, '409', `${r5.status}`);
        const r5b: any = await r5.json();
        assert('refusal carries paymentId', !!r5b.paymentId, 'paymentId', JSON.stringify(r5b).slice(0, 60));
        const o5After = await prisma.orders.findUnique({ where: { id: o5.id } });
        assert('order untouched by UNKNOWN', o5After?.payment_status === 'UNPAID', 'UNPAID', String(o5After?.payment_status));
        const unkAgg = await prisma.payments.findUnique({ where: { id: r5b.paymentId } });
        assert('aggregate UNKNOWN, attempt UNKNOWN', unkAgg?.status === 'UNKNOWN' && (await prisma.payment_attempts.count({ where: { payment_id: unkAgg.id, status: 'UNKNOWN' } })) === 1, 'UNKNOWN/UNKNOWN', `${unkAgg?.status}`);

        // reconcile guards
        const rBad = await fetch(`${BASE}/payments/${unkAgg!.id}/reconcile`, {
            method: 'POST', headers: { Authorization: `Bearer ${tenantA.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ outcome: 'MAYBE' }),
        });
        assert('invalid outcome rejected 400', rBad.status === 400, '400', `${rBad.status}`);
        const rForeign = await fetch(`${BASE}/payments/${unkAgg!.id}/reconcile`, {
            method: 'POST', headers: { Authorization: `Bearer ${tenantB.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ outcome: 'PAID' }),
        });
        assert('cross-tenant reconcile 404', rForeign.status === 404, '404', `${rForeign.status}`);

        const rRec = await fetch(`${BASE}/payments/${unkAgg!.id}/reconcile`, {
            method: 'POST', headers: { Authorization: `Bearer ${tenantA.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ outcome: 'PAID' }),
        });
        assert('reconcile PAID succeeds', rRec.status === 200, '200', `${rRec.status}`);
        const rRec2 = await fetch(`${BASE}/payments/${unkAgg!.id}/reconcile`, {
            method: 'POST', headers: { Authorization: `Bearer ${tenantA.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ outcome: 'PAID' }),
        });
        assert('reconcile on non-UNKNOWN rejected 409', rRec2.status === 409, '409', `${rRec2.status}`);

        await setMode('SUCCESS');
        const r5c: any = await (await settle(o5.id, { payments: [{ method: 'CARD', amount: 25 }] })).json();
        assert('re-settle after reconcile commits via fast-path', r5c.success === true && r5c.order.payment_status === 'PAID', 'PAID', String(r5c.order?.payment_status));
        const o5Events = await eventsFor(o5.id);
        assert('events present after fast-path commit', o5Events.some(e => e.event_type === 'PAYMENT_COMPLETED') && o5Events.some(e => e.event_type === 'ORDER_COMPLETED'), '2 events', `${o5Events.length}`);
        const attemptsAfter = await prisma.payment_attempts.count({ where: { payment_id: unkAgg!.id } });
        assert('provider NOT re-driven on fast-path (still 1 attempt)', attemptsAfter === 1, '1', `${attemptsAfter}`);

        // ================= T6: Phase A replay guard intact ====================
        console.log('\n[T6] Replay guard through the new routing');
        const r6 = await settle(o2.id, { payments: [{ method: 'CARD', amount: 80 }] });
        assert('replayed settle returns 200 verbatim', r6.status === 200, '200', `${r6.status}`);
        assert('X-Settlement-Replay header set', r6.headers.get('x-settlement-replay') === 'true', 'true', String(r6.headers.get('x-settlement-replay')));
        const attemptsT6 = await prisma.payment_attempts.count({ where: { payments: { order_id: o2.id } } });
        assert('no extra provider attempts on replay', attemptsT6 === 1, '1', `${attemptsT6}`);

        // ================= T7: testing route guard ===========================
        console.log('\n[T7] Test-control surface hygiene');
        const rBadMode = await fetch(`${BASE}/testing/payment-mode`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'EXPLOIT' }),
        });
        assert('invalid mode rejected 400', rBadMode.status === 400, '400', `${rBadMode.status}`);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    } finally {
        try {
            const rids = [tenantA.restaurant.id, tenantB.restaurant.id];
            await prisma.payment_attempts.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.payments.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.transactions.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.ledger_entries.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.journal_entries.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.outbox.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.orders.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.menu_items.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.menu_categories.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.cashier_sessions.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.staff.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.restaurants.deleteMany({ where: { id: { in: rids } } });
        } catch (e: any) {
            console.log('cleanup warning:', e.message);
        }
    }

    console.log(`\n=== M017 PHASE B RESULTS: ${passed} passed, ${failed} failed ===`);
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

main();
