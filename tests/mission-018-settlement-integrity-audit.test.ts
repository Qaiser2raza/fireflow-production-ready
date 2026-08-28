import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

// M018 — Settlement Integrity Audit (EVIDENCE, NOT IMPLEMENTATION).
// Directive: prove CURRENT behavior first. Findings are labeled FINDING and
// are expected results of this suite; implementation changes come only after
// the co-CTO reviews demonstrated gaps.
//
// Sections:
//   A. void/cancel PAID-state guards (service layer)
//   B. void of a voidable order: what IS written vs what is NOT (findings)
//   C. refund boundary: fields unwritable + no endpoint exists (finding)
//   D. hard-delete hole: DELETE /api/orders/:id on a SETTLED order (SEVERE)
//   E. tax/SC/discount accounting map: liability vs revenue (runtime proof)
//   F. day-close: expected-cash math, variance, session journal, boundaries

const prisma = new PrismaClient();
const BASE = 'http://localhost:3001/api';

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, expected: string, actual: string) {
    if (condition) { console.log(`  PASS: ${name}`); passed++; }
    else { console.log(`  FAIL: ${name} — expected ${expected}, got ${actual}`); failed++; }
}
function finding(name: string, condition: boolean, detail: string) {
    // A finding assert: condition TRUE means the suspected gap is CONFIRMED.
    if (condition) { console.log(`  FINDING CONFIRMED: ${name} — ${detail}`); passed++; }
    else { console.log(`  FINDING NOT REPRODUCED: ${name}`); failed++; }
}

async function makeStaff(restaurantId: string, name: string, role: string, pin: string) {
    const staff = await prisma.staff.create({
        data: { restaurant_id: restaurantId, name, role: role as any, pin: '', hashed_pin: await bcrypt.hash(pin, 12), status: 'active' },
    });
    const loginRes = await fetch(`${BASE}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, restaurant_id: restaurantId, staff_name: name }),
    });
    const data: any = await loginRes.json();
    if (loginRes.status !== 200) throw new Error(`login failed for ${name}`);
    return { staff, token: data.tokens.access_token };
}

async function main() {
    console.log('--- STARTING M018 SETTLEMENT INTEGRITY AUDIT ---');
    const ts = Date.now();

    const restaurantA = await prisma.restaurants.create({
        data: { name: 'M018 Audit', slug: `m018-a-${ts}`, currency: 'PKR', phone: '03000000000', address: 'x', timezone: 'Asia/Karachi', subscription_plan: 'BASIC', subscription_status: 'ACTIVE' },
    });
    const restaurantB = await prisma.restaurants.create({
        data: { name: 'M018 Beta', slug: `m018-b-${ts}`, currency: 'PKR', phone: '03000000000', address: 'x', timezone: 'Asia/Karachi', subscription_plan: 'BASIC', subscription_status: 'ACTIVE' },
    });
    const ridA = restaurantA.id;
    const ridB = restaurantB.id;

    const manager = await makeStaff(ridA, 'Audit Manager', 'MANAGER', '111111');
    const waiter = await makeStaff(ridA, 'Audit Waiter', 'WAITER', '222222');
    const cashier = await makeStaff(ridA, 'Audit Cashier', 'CASHIER', '333333');
    const managerB = await makeStaff(ridB, 'Beta Manager', 'MANAGER', '444444');

    // updateOrder requires order-type defaults to exist for the tenant+type
    await prisma.order_type_defaults.create({
        data: { restaurant_id: ridA, order_type: 'TAKEAWAY', tax_enabled: true, tax_rate: 10, tax_type: 'EXCLUSIVE', svc_enabled: false, svc_rate: 0, delivery_fee: 0, discount_max: 100 },
    });

    // Seed COA so journal posting is active (resolveAccount matches code+tenant)
    const coa: Array<[string, string, any]> = [
        ['1000', 'Cash & Cash Equivalents', 'ASSET'],
        ['1010', 'Card/Digital Receivables', 'ASSET'],
        ['1040', 'Customer Account', 'ASSET'],
        ['1090', 'Manager Drawing', 'ASSET'],
        ['2000', 'Tax Payable', 'LIABILITY'],
        ['2010', 'Service Charge Payable', 'LIABILITY'],
        ['4000', 'Food & Beverage Revenue', 'REVENUE'],
        ['4010', 'Delivery Fee Revenue', 'REVENUE'],
        ['4020', 'Rounding Adjustment', 'REVENUE'],
        ['4030', 'Misc Income', 'REVENUE'],
        ['4900', 'Discount Expense', 'EXPENSE'],
        ['5030', 'Shortage Expense', 'EXPENSE'],
    ];
    for (const [code, name, type] of coa) {
        await prisma.chart_of_accounts.create({ data: { restaurant_id: ridA, code, name, type } });
    }

    const createOrder = (total: number, extra: object = {}) =>
        prisma.orders.create({ data: { restaurant_id: ridA, type: 'TAKEAWAY', status: 'ACTIVE', total, payment_status: 'UNPAID', ...extra } });
    const patchOrder = (orderId: string, body: object, token: string) =>
        fetch(`${BASE}/orders/${orderId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const settle = (orderId: string, body: object, token: string, sessionId: string) =>
        fetch(`${BASE}/orders/${orderId}/settle`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'x-session-id': sessionId, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const journalLinesFor = async (orderId: string) => {
        const je = await prisma.journal_entries.findFirst({ where: { reference_type: 'ORDER_SALE', reference_id: orderId }, include: { journal_entry_lines: { include: { chart_of_accounts: true } } } as any });
        return je ? (je as any).journal_entry_lines.map((l: any) => ({ code: l.chart_of_accounts?.code, debit: Number(l.debit || 0), credit: Number(l.credit || 0) })) : [];
    };

    try {
        // ================ A. PAID-state guards ================================
        console.log('\n[A] Void/cancel guards on a PAID order (service layer)');
        const oPaid = await createOrder(100);
        await settle(oPaid.id, { paymentMethod: 'CASH', total: 100 }, manager.token, (await prisma.cashier_sessions.create({ data: { restaurant_id: ridA, opened_by: manager.staff.id, status: 'OPEN', opening_float: 0 } })).id);
        // void guard order: fire-batch precondition is evaluated BEFORE the paid
        // check, so the PAID rejection is only reachable on a kitchen-fired order.
        await prisma.fire_batches.create({ data: { order_id: oPaid.id, version_number: 1, created_by_user_id: manager.staff.id, metadata_json: { item_count: 1 } } as any });
        const rCancelPaid = await patchOrder(oPaid.id, { status: 'CANCELLED' }, manager.token);
        const rCancelPaidBody: any = await rCancelPaid.json();
        assert('cancel fired+PAID blocked (kitchen guard first)', rCancelPaid.status === 500 && /sent to kitchen/i.test(rCancelPaidBody.error || ''), 'blocked', `${rCancelPaid.status}:${(rCancelPaidBody.error || '').slice(0, 40)}`);
        // PAID guard for CANCEL is reachable on a paid order with NO fire batches
        const oPaid2 = await createOrder(55);
        await settle(oPaid2.id, { paymentMethod: 'CASH', total: 55 }, manager.token, (await prisma.cashier_sessions.create({ data: { restaurant_id: ridA, opened_by: manager.staff.id, status: 'OPEN', opening_float: 0 } })).id);
        const rCancelPaid2 = await patchOrder(oPaid2.id, { status: 'CANCELLED' }, manager.token);
        const rCancelPaid2Body: any = await rCancelPaid2.json();
        assert('cancel PAID (unfired) blocked by paid guard', rCancelPaid2.status === 500 && /already paid/i.test(rCancelPaid2Body.error || ''), 'blocked', `${rCancelPaid2.status}:${(rCancelPaid2Body.error || '').slice(0, 40)}`);
        const rVoidPaid = await patchOrder(oPaid.id, { status: 'VOIDED' }, manager.token);
        const rVoidPaidBody: any = await rVoidPaid.json();
        assert('void PAID blocked', rVoidPaid.status === 500 && /already paid/i.test(rVoidPaidBody.error || ''), 'blocked', `${rVoidPaid.status}:${(rVoidPaidBody.error || '').slice(0, 40)}`);

        // ================ B. Void of a VOIDABLE order =========================
        console.log('\n[B] Void of unpaid kitchen-fired order — F-03 fix verification');
        const oVoid = await createOrder(60);
        await prisma.fire_batches.create({ data: { order_id: oVoid.id, version_number: 1, created_by_user_id: manager.staff.id, metadata_json: { item_count: 1 } } as any });
        const rVoid = await patchOrder(oVoid.id, { status: 'VOIDED', authorized_by: manager.staff.id, void_reason: 'Customer changed mind', void_notes: 'Kitchen notified' }, manager.token);
        assert('void of voidable order succeeds', rVoid.status === 200, '200', `${rVoid.status}`);
        const oVoidAfter = await prisma.orders.findUnique({ where: { id: oVoid.id } });
        assert('order status VOIDED', oVoidAfter?.status === 'VOIDED', 'VOIDED', String(oVoidAfter?.status));
        const auditVoid = await prisma.audit_logs.findFirst({ where: { restaurant_id: ridA, action_type: 'ORDER_VOIDED', entity_id: oVoid.id } });
        assert('audit log ORDER_VOIDED written', !!auditVoid, 'present', auditVoid ? 'present' : 'missing');
        assert('voided_at written', !!oVoidAfter?.voided_at, 'present', oVoidAfter?.voided_at ? 'present' : 'missing');
        assert('voided_by written', !!oVoidAfter?.voided_by, 'present', oVoidAfter?.voided_by ? 'present' : 'missing');
        assert('void_reason written', oVoidAfter?.void_reason === 'Customer changed mind', 'Customer changed mind', String(oVoidAfter?.void_reason || 'missing'));
        const voidEvents = await prisma.outbox.count({ where: { restaurant_id: ridA, aggregate_id: oVoid.id, event_type: 'ORDER_VOIDED' } });
        assert('ORDER_VOIDED outbox event created', voidEvents === 1, '1', `${voidEvents}`);
        const fbCount = await prisma.fire_batches.count({ where: { order_id: oVoid.id } });
        assert('fire_batches cleared on void (KDS surface)', fbCount === 0, '0', `fire_batches rows still present = ${fbCount}`);

        // ================ C. Refund boundary ==================================
        console.log('\n[C] Refund boundary — fields guarded, endpoint ceremony-gated');
        const rRefundField = await patchOrder(oPaid.id, { refund_transaction_id: 'tx-123' }, manager.token);
        assert('refund fields rejected via generic PATCH (403)', rRefundField.status === 403, '403', `${rRefundField.status}`);
        // F-02 CLOSED (M020): the refund endpoint now EXISTS behind
        // MANAGER+ + money-movement PIN ceremony. The original audit finding
        // ("no refund endpoint exists, 404") documented the pre-F-02 gap and
        // is superseded; the boundary probe now asserts the new posture:
        // an unauthenticated refund attempt is refused at the auth layer.
        const rRefundEndpoint = await fetch(`${BASE}/orders/${oPaid.id}/refund`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: 10 }) });
        finding('refund endpoint exists and refuses unauthenticated attempts (F-02 closed)', rRefundEndpoint.status === 401, `POST /orders/:id/refund unauthenticated -> ${rRefundEndpoint.status}; ceremony-gated per M018 F-02 design rev2`);

        // ================ D. F-01 REMEDIATED: delete authorization ===========
        // Original finding (2026-08-26): WAITER could hard-delete a SETTLED
        // order with zero audit trail. Fixed per co-CTO disposition:
        //   - deletion requires MANAGER/ADMIN/SUPER_ADMIN (void/cancel posture)
        //   - settled orders are NEVER deletable, regardless of role (reversal
        //     belongs to the refund flow, F-02)
        //   - blocked AND successful AND cross-tenant attempts all audited
        console.log('\n[D] DELETE authorization matrix (F-01 remediated)');
        const oDel = await createOrder(70);
        await settle(oDel.id, { paymentMethod: 'CASH', total: 70 }, manager.token, (await prisma.cashier_sessions.create({ data: { restaurant_id: ridA, opened_by: manager.staff.id, status: 'OPEN', opening_float: 0 } })).id);

        const rDelWaiter = await fetch(`${BASE}/orders/${oDel.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${waiter.token}` } });
        // Precedence decision (documented): the settled STATE guard wins over
        // the role guard — a settled order answers 409 to every role; role
        // insufficiency is separately proven on the non-settled case below.
        assert('WAITER delete settled -> 409 (state guard precedes role guard)', rDelWaiter.status === 409, '409', `${rDelWaiter.status}`);
        const blockedWaiter = await prisma.audit_logs.findFirst({ where: { restaurant_id: ridA, action_type: 'ORDER_DELETE_BLOCKED', entity_id: oDel.id }, orderBy: { created_at: 'desc' } });
        assert('blocked WAITER attempt logged with role + reason', !!blockedWaiter && (blockedWaiter.details as any)?.role === 'WAITER' && (blockedWaiter.details as any)?.reason === 'ORDER_SETTLED', 'logged', JSON.stringify(blockedWaiter?.details || {}).slice(0, 60));

        const rDelMgr = await fetch(`${BASE}/orders/${oDel.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${manager.token}` } });
        assert('MANAGER delete settled -> 409 (settled guard regardless of role)', rDelMgr.status === 409, '409', `${rDelMgr.status}`);
        const blockedMgr = await prisma.audit_logs.findFirst({ where: { restaurant_id: ridA, action_type: 'ORDER_DELETE_BLOCKED', entity_id: oDel.id }, orderBy: { created_at: 'desc' } });
        assert('blocked MANAGER attempt logged with settled reason', !!blockedMgr && (blockedMgr.details as any)?.reason === 'ORDER_SETTLED' && (blockedMgr.details as any)?.settled === true, 'logged', JSON.stringify(blockedMgr?.details || {}).slice(0, 60));
        const oDelIntact = await prisma.orders.findUnique({ where: { id: oDel.id } });
        assert('settled order + evidence intact after blocks', oDelIntact !== null && (await prisma.transactions.count({ where: { order_id: oDel.id } })) === 1, 'intact', `${oDelIntact ? 'present' : 'gone'}`);

        const oDel2 = await createOrder(45);
        const rDelOk = await fetch(`${BASE}/orders/${oDel2.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${manager.token}` } });
        assert('MANAGER delete non-settled -> 200', rDelOk.status === 200, '200', `${rDelOk.status}`);
        const deletedLog = await prisma.audit_logs.findFirst({ where: { restaurant_id: ridA, action_type: 'ORDER_DELETED', entity_id: oDel2.id } });
        assert('successful delete logged (who/role/status)', !!deletedLog && (deletedLog.details as any)?.role === 'MANAGER' && (deletedLog.details as any)?.previous_status === 'ACTIVE', 'logged', JSON.stringify(deletedLog?.details || {}).slice(0, 60));
        assert('non-settled order actually removed', (await prisma.orders.findUnique({ where: { id: oDel2.id } })) === null, 'gone', 'present');

        const oDel3 = await createOrder(30);
        const rDelWaiter2 = await fetch(`${BASE}/orders/${oDel3.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${waiter.token}` } });
        assert('WAITER delete non-settled -> 403 (explicit rule: deletion is MANAGER+)', rDelWaiter2.status === 403, '403', `${rDelWaiter2.status}`);
        assert('oDel3 still present', (await prisma.orders.findUnique({ where: { id: oDel3.id } })) !== null, 'present', 'gone');

        const rDelX = await fetch(`${BASE}/orders/${oDel3.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${managerB.token}` } });
        assert('cross-tenant delete -> 404', rDelX.status === 404, '404', `${rDelX.status}`);
        const xLog = await prisma.audit_logs.findFirst({ where: { restaurant_id: ridB, action_type: 'ORDER_DELETE_BLOCKED', entity_id: oDel3.id } });
        assert('cross-tenant probe logged in CALLER tenant (no existence oracle)', !!xLog && (xLog.details as any)?.reason === 'ORDER_NOT_FOUND_OR_CROSS_TENANT', 'logged', xLog ? 'logged' : 'missing');

        // ================ E. Tax/SC/discount accounting map ===================
        console.log('\n[E] Tax liability map — runtime proof of the existing model');
        // E1: EXCLUSIVE tax: subtotal 100, tax 10, total 110
        const oE1 = await createOrder(110, { tax: 10, tax_type: 'EXCLUSIVE' });
        await settle(oE1.id, { paymentMethod: 'CASH', total: 110, tax: 10 }, manager.token, (await prisma.cashier_sessions.create({ data: { restaurant_id: ridA, opened_by: manager.staff.id, status: 'OPEN', opening_float: 0 } })).id);
        const e1 = await journalLinesFor(oE1.id);
        const e1tax = e1.filter(l => l.code === '2000').reduce((s, l) => s + l.credit, 0);
        const e1rev = e1.filter(l => l.code === '4000').reduce((s, l) => s + l.credit, 0);
        const e1cash = e1.filter(l => l.code === '1000').reduce((s, l) => s + l.debit, 0);
        assert('EXCLUSIVE: tax credited to 2000 liability == 10', e1tax === 10, '10', `${e1tax}`);
        assert('EXCLUSIVE: net revenue 4000 == 100', e1rev === 100, '100', `${e1rev}`);
        assert('EXCLUSIVE: cash debit == 110', e1cash === 110, '110', `${e1cash}`);
        const e1dr = e1.reduce((s, l) => s + l.debit, 0); const e1cr = e1.reduce((s, l) => s + l.credit, 0);
        assert('journal balanced', Math.abs(e1dr - e1cr) < 0.001, 'balanced', `${e1dr}/${e1cr}`);
        // E2: INCLUSIVE tax: total 110 incl tax 10
        const oE2 = await createOrder(110, { tax: 10, tax_type: 'INCLUSIVE' });
        await settle(oE2.id, { paymentMethod: 'CASH', total: 110, tax: 10 }, manager.token, (await prisma.cashier_sessions.create({ data: { restaurant_id: ridA, opened_by: manager.staff.id, status: 'OPEN', opening_float: 0 } })).id);
        const e2 = await journalLinesFor(oE2.id);
        assert('INCLUSIVE: tax liability still == 10', e2.filter(l => l.code === '2000').reduce((s, l) => s + l.credit, 0) === 10, '10', `${e2.filter(l => l.code === '2000').reduce((s, l) => s + l.credit, 0)}`);
        // E3: SC + discount: total 85, sc 5, discount 20
        const oE3 = await createOrder(85, { service_charge: 5, discount: 20 });
        await settle(oE3.id, { paymentMethod: 'CASH', total: 85, service_charge: 5, discount: 20 }, manager.token, (await prisma.cashier_sessions.create({ data: { restaurant_id: ridA, opened_by: manager.staff.id, status: 'OPEN', opening_float: 0 } })).id);
        const e3 = await journalLinesFor(oE3.id);
        assert('SC credited to 2010 liability == 5', e3.filter(l => l.code === '2010').reduce((s, l) => s + l.credit, 0) === 5, '5', `${e3.filter(l => l.code === '2010').reduce((s, l) => s + l.credit, 0)}`);
        assert('discount debited to 4900 == 20', e3.filter(l => l.code === '4900').reduce((s, l) => s + l.debit, 0) === 20, '20', `${e3.filter(l => l.code === '4900').reduce((s, l) => s + l.debit, 0)}`);
        assert('gross revenue 4000 == 100 (before discount)', e3.filter(l => l.code === '4000').reduce((s, l) => s + l.credit, 0) === 100, '100', `${e3.filter(l => l.code === '4000').reduce((s, l) => s + l.credit, 0)}`);
        const e3dr = e3.reduce((s, l) => s + l.debit, 0); const e3cr = e3.reduce((s, l) => s + l.credit, 0);
        assert('SC/discount journal balanced', Math.abs(e3dr - e3cr) < 0.001, 'balanced', `${e3dr}/${e3cr}`);

        // ================ F. Day-close ========================================
        console.log('\n[F] Day-close — expected cash, variance, journal, boundaries');
        const openSession = async (token: string, float: number) => {
            const r = await fetch(`${BASE}/cashier/open`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ staffId: cashier.staff.id, openingFloat: float }) });
            return { status: r.status, body: await r.json() as any };
        };
        const rOpenMgr = await openSession(manager.token, 0);
        assert('MANAGER cannot open cashier session (403)', rOpenMgr.status === 403, '403', `${rOpenMgr.status}`);
        const s1 = await openSession(cashier.token, 500);
        assert('CASHIER opens session with float 500', s1.status === 200, '200', `${s1.status}`);
        const sessionId1 = s1.body.session.id;
        const oF1 = await createOrder(300);
        const rF1 = await settle(oF1.id, { paymentMethod: 'CASH', total: 300 }, cashier.token, sessionId1);
        assert('cashier settles 300 cash on own session', rF1.status === 200, '200', `${rF1.status}`);
        const rClose = await fetch(`${BASE}/cashier/close`, { method: 'POST', headers: { Authorization: `Bearer ${cashier.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sessionId1, actualCash: 800, withdrawnAmount: 800, closedBy: cashier.staff.id }) });
        assert('session close succeeds', rClose.status === 200, '200', `${rClose.status}`);
        const closed1: any = (await rClose.json()).session;
        assert('expected cash == 800 (500 float + 300 sales)', Number(closed1.expected_cash) === 800, '800', String(closed1.expected_cash));
        assert('variance == 0 when counted == expected', Number(closed1.difference) === 0, '0', String(closed1.difference));
        const closeJe = await prisma.journal_entries.count({ where: { reference_type: 'CASHIER_SESSION', reference_id: sessionId1 } });
        assert('session-close journal written', closeJe === 1, '1', `${closeJe}`);
        const rClose2 = await fetch(`${BASE}/cashier/close`, { method: 'POST', headers: { Authorization: `Bearer ${cashier.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sessionId1, actualCash: 0, withdrawnAmount: 0, closedBy: cashier.staff.id }) });
        assert('double-close blocked', rClose2.status === 500 && /already closed/i.test(((await rClose2.json()) as any).error || ''), 'blocked', `${rClose2.status}`);

        // variance case
        const s2 = await openSession(cashier.token, 0);
        const sessionId2 = s2.body.session.id;
        const oF2 = await createOrder(100);
        await settle(oF2.id, { paymentMethod: 'CASH', total: 100 }, cashier.token, sessionId2);
        const rCloseV = await fetch(`${BASE}/cashier/close`, { method: 'POST', headers: { Authorization: `Bearer ${cashier.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sessionId2, actualCash: 90, withdrawnAmount: 90, closedBy: cashier.staff.id }) });
        const closedV: any = (await rCloseV.json()).session;
        assert('shortage variance persisted (-10)', Number(closedV.difference) === -10 && Number(closedV.expected_cash) === 100, '-10', `${closedV.difference}/${closedV.expected_cash}`);

        // cross-tenant close — use a fresh open session
        const sCross = await openSession(cashier.token, 0);
        const sessionIdCross = sCross.body.session.id;
        const rX = await fetch(`${BASE}/cashier/close`, { method: 'POST', headers: { Authorization: `Bearer ${managerB.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sessionIdCross, actualCash: 0, withdrawnAmount: 0, closedBy: managerB.staff.id }) });
        assert('cross-tenant close blocked with 403', rX.status === 403, '403', `${rX.status}; isolation holds via service check`);

        // rider-shift gate
        const rRider = await fetch(`${BASE}/cashier/close`, { method: 'POST', headers: { Authorization: `Bearer ${cashier.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: s1.body.session.id, actualCash: 0, withdrawnAmount: 0, closedBy: cashier.staff.id }) });
        // s1 already closed; close the cross-tenant test session too, then open a fresh one
        await fetch(`${BASE}/cashier/close`, { method: 'POST', headers: { Authorization: `Bearer ${cashier.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sessionIdCross, actualCash: 0, withdrawnAmount: 0, closedBy: cashier.staff.id }) });
        const s3 = await openSession(cashier.token, 0);
        if (!s3.body.session) {
            console.log('  [DEBUG] s3 openSession failed:', JSON.stringify(s3.body));
            throw new Error('openSession failed for rider-shift gate test');
        }
        await prisma.rider_shifts.create({ data: { restaurant_id: ridA, rider_id: manager.staff.id, opened_by: manager.staff.id } });
        const rRider2 = await fetch(`${BASE}/cashier/close`, { method: 'POST', headers: { Authorization: `Bearer ${cashier.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: s3.body.session.id, actualCash: 0, withdrawnAmount: 0, closedBy: cashier.staff.id }) });
        assert('close blocked while rider shifts OPEN (409)', rRider2.status === 409, '409', `${rRider2.status}`);

        // Clean up rider shift so s3 can be closed before F-06
        await prisma.rider_shifts.deleteMany({ where: { restaurant_id: ridA } });
        const rCloseS3 = await fetch(`${BASE}/cashier/close`, { method: 'POST', headers: { Authorization: `Bearer ${cashier.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: s3.body.session.id, actualCash: 0, withdrawnAmount: 0, closedBy: cashier.staff.id }) });
        assert('s3 closed after rider shift removed', rCloseS3.status === 200, '200', `${rCloseS3.status}`);

        // ================ F-06. Session-close journal blocking =================
        console.log('\n[F-06] Session-close journal blocking (HTTP regression)');
        const sF06 = await openSession(cashier.token, 0);
        const sessionIdF06 = sF06.body?.session?.id;
        assert('F-06 openSession succeeded', !!sessionIdF06, 'session id', sessionIdF06 || 'missing');
        const rCloseF06 = await fetch(`${BASE}/cashier/close`, { method: 'POST', headers: { Authorization: `Bearer ${cashier.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sessionIdF06, actualCash: 100, withdrawnAmount: 50, closedBy: cashier.staff.id }) });
        assert('session close succeeds via HTTP', rCloseF06.status === 200, '200', `${rCloseF06.status}`);
        const closeF06Body: any = await rCloseF06.json();
        assert('response carries session', !!closeF06Body.session, 'session object', JSON.stringify(closeF06Body));
        const closeJeF06 = await prisma.journal_entries.count({ where: { reference_type: 'CASHIER_SESSION', reference_id: sessionIdF06 } });
        assert('session-close journal written via HTTP', closeJeF06 === 1, '1', `${closeJeF06}`);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    } finally {
        try {
            const rids = [ridA, ridB];
            await prisma.payment_attempts.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.payments.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.journal_entry_lines.deleteMany({ where: { journal_entries: { restaurant_id: { in: rids } } } });
            await prisma.journal_entries.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.ledger_entries.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.transactions.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.outbox.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.audit_logs.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.fire_batches.deleteMany({ where: { orders: { restaurant_id: { in: rids } } } });
            await prisma.rider_shifts.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.takeaway_orders.deleteMany({ where: { orders: { restaurant_id: { in: rids } } } });
            await prisma.dine_in_orders.deleteMany({ where: { orders: { restaurant_id: { in: rids } } } });
            await prisma.delivery_orders.deleteMany({ where: { orders: { restaurant_id: { in: rids } } } });
            await prisma.orders.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.cashier_sessions.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.chart_of_accounts.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.staff.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.restaurants.deleteMany({ where: { id: { in: rids } } });
        } catch (e: any) {
            console.log('cleanup warning:', e.message);
        }
    }

    console.log(`\n=== M018 AUDIT RESULTS: ${passed} passed, ${failed} failed ===`);
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

main();
