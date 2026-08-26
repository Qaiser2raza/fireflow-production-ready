import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

// M019 — Express / kitchen-gate operating mode (EVIDENCE per approved design).
// Matrix source: co-CTO implementation gate (2026-08-26). Invariants E1-E4
// asserted at runtime: EXPRESS = earlier entry into the SAME unified path;
// the gate is read-only and has no authority over provider state.

const prisma = new PrismaClient();
const BASE = 'http://localhost:3001/api';

let passed = 0;
let failed = 0;
function assert(name: string, cond: boolean, expected: string, actual: string) {
    if (cond) { console.log(`  PASS: ${name}`); passed++; }
    else { console.log(`  FAIL: ${name} — expected ${expected}, got ${actual}`); failed++; }
}

async function makeStaff(restaurantId: string, name: string, role: string, pin: string) {
    const staff = await prisma.staff.create({
        data: { restaurant_id: restaurantId, name, role: role as any, pin: '', hashed_pin: await bcrypt.hash(pin, 12), status: 'active' },
    });
    const res = await fetch(`${BASE}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, restaurant_id: restaurantId, staff_name: name }),
    });
    const data: any = await res.json();
    if (res.status !== 200) throw new Error(`login failed for ${name}`);
    return { staff, token: data.tokens.access_token };
}

async function main() {
    console.log('--- STARTING M019 EXPRESS / KITCHEN-GATE VERIFICATION ---');
    const ts = Date.now();

    const rA = await prisma.restaurants.create({
        data: { name: 'M019 Alpha', slug: `m019-a-${ts}`, currency: 'PKR', phone: '03', address: 'x', timezone: 'Asia/Karachi', subscription_plan: 'BASIC', subscription_status: 'ACTIVE' },
    });
    const rB = await prisma.restaurants.create({
        data: { name: 'M019 Beta', slug: `m019-b-${ts}`, currency: 'PKR', phone: '03', address: 'x', timezone: 'Asia/Karachi', subscription_plan: 'BASIC', subscription_status: 'ACTIVE' },
    });
    const ridA = rA.id;
    const manager = await makeStaff(ridA, 'M019 Manager', 'MANAGER', '111111');
    const waiter = await makeStaff(ridA, 'M019 Waiter', 'WAITER', '222222');
    const managerB = await makeStaff(rB.id, 'M019 Beta Manager', 'MANAGER', '333333');

    const sessionA = await prisma.cashier_sessions.create({ data: { restaurant_id: ridA, opened_by: manager.staff.id, status: 'OPEN', opening_float: 0 } });
    const menuItem = await prisma.menu_items.create({ data: { restaurant_id: ridA, name: 'Gate Item', price: 50, category: 'Gate' } as any });

    const setMode = async (token: string, body: object) =>
        fetch(`${BASE}/restaurant/flow-mode`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const createOrder = () =>
        prisma.orders.create({ data: { restaurant_id: ridA, type: 'TAKEAWAY', status: 'ACTIVE', total: 50, payment_status: 'UNPAID' } });
    const addItem = async (orderId: string, status: string) =>
        prisma.order_items.create({ data: { order_id: orderId, menu_item_id: menuItem.id, quantity: 1, unit_price: 50, total_price: 50, item_name: 'Gate Item', item_status: status } as any });
    const fire = (orderId: string) =>
        prisma.fire_batches.create({ data: { order_id: orderId, version_number: 1, created_by_user_id: manager.staff.id, metadata_json: { item_count: 1 } } as any });
    const settle = (orderId: string, body: object, token: string = manager.token) =>
        fetch(`${BASE}/orders/${orderId}/settle`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'x-session-id': sessionA.id, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const setProviderMode = async (mode: string) => {
        const r = await fetch(`${BASE}/testing/payment-mode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
        if (r.status !== 200) throw new Error(`provider mode ${mode} failed`);
    };

    try {
        // ============ M0: default persistence (disposition #1) ============
        console.log('\n[M0] Defaults persisted explicitly');
        assert('fresh tenant lands STANDARD + enforcement OFF', rA.order_flow_mode === 'STANDARD' && rA.kitchen_gate_enforced === false, 'STANDARD/false', `${rA.order_flow_mode}/${rA.kitchen_gate_enforced}`);

        // ============ M1: STANDARD + OFF = today's behavior ================
        console.log('\n[M1] STANDARD + enforcement OFF — existing behavior unchanged');
        const o1 = await createOrder();
        await addItem(o1.id, 'PENDING'); // unfired, pending items — must NOT block
        const r1 = await settle(o1.id, { paymentMethod: 'CASH', total: 50 });
        assert('settle proceeds with pending items (gate inert)', r1.status === 200, '200', `${r1.status}`);

        // ============ M2: STANDARD + ON — matrix rows 2-4 ==================
        console.log('\n[M2] STANDARD + enforcement ON');
        const rEn = await setMode(manager.token, { orderFlowMode: 'STANDARD', kitchenGateEnforced: true, reason: 'audit matrix' });
        assert('mode config accepted for MANAGER', rEn.status === 200, '200', `${rEn.status}`);

        // Row 3: fired item not ready -> 409
        const o2 = await createOrder();
        await addItem(o2.id, 'PREPARING');
        await fire(o2.id);
        const r2 = await settle(o2.id, { paymentMethod: 'CASH', total: 50 });
        assert('fired item not ready -> 409 KITCHEN_GATE_NOT_RELEASED', r2.status === 409, '409', `${r2.status}`);
        const r2b: any = await r2.json();
        assert('refusal names the gate + pending count', r2b.code === 'KITCHEN_GATE_NOT_RELEASED' && r2b.pendingItems === 1, 'code+1', JSON.stringify(r2b).slice(0, 70));

        // Gate refusal side effects (E2/E3): nothing touched
        assert('no payments aggregate created', (await prisma.payments.count({ where: { order_id: o2.id } })) === 0, '0', 'present');
        assert('no journals', (await prisma.journal_entries.count({ where: { reference_type: 'ORDER_SALE', reference_id: o2.id } })) === 0, '0', 'present');
        assert('no settle events', (await prisma.outbox.count({ where: { aggregate_id: o2.id, event_type: { in: ['PAYMENT_COMPLETED', 'ORDER_COMPLETED'] } } })) === 0, '0', 'present');
        const o2after = await prisma.orders.findUnique({ where: { id: o2.id } });
        assert('order untouched (ACTIVE/UNPAID)', o2after?.status === 'ACTIVE' && o2after?.payment_status === 'UNPAID', 'ACTIVE/UNPAID', `${o2after?.status}/${o2after?.payment_status}`);

        // Row 2: all fired items DONE -> proceeds
        await prisma.order_items.updateMany({ where: { order_id: o2.id }, data: { item_status: 'DONE' } });
        const r2c = await settle(o2.id, { paymentMethod: 'CASH', total: 50 });
        assert('all fired items DONE -> settlement proceeds', r2c.status === 200, '200', `${r2c.status}`);

        // Row 4: zero fired items -> ready
        const o3 = await createOrder();
        await addItem(o3.id, 'PENDING');
        const r3 = await settle(o3.id, { paymentMethod: 'CASH', total: 50 });
        assert('zero fired items = ready (tested rule)', r3.status === 200, '200', `${r3.status}`);

        // ============ M3: override ceremony (rows 5-8) =====================
        console.log('\n[M3] Manager payment-override');
        const o4 = await createOrder();
        await addItem(o4.id, 'PREPARING');
        await fire(o4.id);

        // Row 7: wrong PIN -> denied, no payment attempt
        const rWrong = await settle(o4.id, { paymentMethod: 'CASH', total: 50, paymentOverride: { pin: '999999', reason: 'stuck ticket' } });
        assert('wrong manager PIN denied (409, still gated)', rWrong.status === 409, '409', `${rWrong.status}`);
        assert('wrong PIN: no provider attempt', (await prisma.payments.count({ where: { order_id: o4.id } })) === 0, '0', 'present');

        // Row 6: non-manager override -> denied
        const rWaiter = await settle(o4.id, { paymentMethod: 'CASH', total: 50, paymentOverride: { pin: '222222', reason: 'waiter try' } }, waiter.token);
        assert('WAITER override denied', rWaiter.status === 409, '409', `${rWaiter.status}`);
        const waiterBlock = await prisma.audit_logs.findFirst({ where: { restaurant_id: ridA, action_type: 'KITCHEN_GATE_BLOCKED', entity_id: o4.id }, orderBy: { created_at: 'desc' } });
        assert('WAITER override audited as INSUFFICIENT_ROLE', (waiterBlock?.details as any)?.override_denied_reason === 'INSUFFICIENT_ROLE', 'INSUFFICIENT_ROLE', JSON.stringify(waiterBlock?.details || {}).slice(0, 60));

        // Row 5: manager override -> one authorization -> settlement
        const rOverride = await settle(o4.id, { paymentMethod: 'CASH', total: 50, paymentOverride: { pin: '111111', reason: 'kiosk stuck — ticket #4' } });
        assert('manager override settles (200)', rOverride.status === 200, '200', `${rOverride.status}`);
        const ovAudit = await prisma.audit_logs.findFirst({ where: { restaurant_id: ridA, action_type: 'ORDER_PAYMENT_OVERRIDE', entity_id: o4.id } });
        assert('override audited with facts', !!ovAudit && (ovAudit.details as any)?.resulting_authorization === 'SINGLE_SETTLE_ATTEMPT' && !JSON.stringify(ovAudit.details).includes('111111'), 'facts only', JSON.stringify(ovAudit?.details || {}).slice(0, 80));
        const ovEvent = await prisma.outbox.findFirst({ where: { restaurant_id: ridA, event_type: 'ORDER_PAYMENT_OVERRIDE', aggregate_id: o4.id } });
        assert('override outbox event carries required fields, no secrets', !!ovEvent && !!(ovEvent.payload as any)?.priorGateState && !JSON.stringify(ovEvent.payload).includes('111111'), 'fields+no-secret', JSON.stringify(ovEvent?.payload || {}).slice(0, 80));

        // Row 8: reuse override -> denied (mechanically scoped to the request)
        const o4b = await createOrder();
        await addItem(o4b.id, 'PREPARING');
        await fire(o4b.id);
        const rReuse = await settle(o4b.id, { paymentMethod: 'CASH', total: 50 }); // no override supplied
        assert('override NOT reusable: fresh order still gated without new ceremony', rReuse.status === 409, '409', `${rReuse.status}`);
        // settled-order retry answers replay, not override reuse
        const rReplay = await settle(o4.id, { paymentMethod: 'CASH', total: 50, paymentOverride: { pin: '111111', reason: 'retry' } });
        assert('settled-order retry -> replay verbatim (not override reuse)', rReplay.status === 200 && rReplay.headers.get('x-settlement-replay') === 'true', 'replay', `${rReplay.status}/${rReplay.headers.get('x-settlement-replay')}`);

        // ============ M4: EXPRESS (rows 9, 11, 12 + E1/E2) =================
        console.log('\n[M4] EXPRESS mode — earlier entry, same controls');
        const rExp = await setMode(manager.token, { orderFlowMode: 'EXPRESS' });
        assert('EXPRESS accepted; enforcement forced inert', rExp.status === 200 && ((await rExp.json()).restaurant.kitchen_gate_enforced === false), '200/false', `${rExp.status}`);
        const cfg = await prisma.restaurants.findUnique({ where: { id: ridA } });
        assert('persisted pair coherent (EXPRESS + enforced=false)', cfg?.order_flow_mode === 'EXPRESS' && cfg?.kitchen_gate_enforced === false, 'EXPRESS/false', `${cfg?.order_flow_mode}/${cfg?.kitchen_gate_enforced}`);

        const o5 = await createOrder();
        await addItem(o5.id, 'PENDING'); // not even fired — payment still available
        const r5 = await settle(o5.id, { paymentMethod: 'CASH', total: 50 });
        assert('EXPRESS: payment immediately available at creation', r5.status === 200, '200', `${r5.status}`);

        // E1: provider FAILED semantics identical in EXPRESS
        await setProviderMode('FAILED');
        const o6 = await createOrder();
        const r6 = await settle(o6.id, { payments: [{ method: 'CARD', amount: 50 }] });
        assert('EXPRESS + provider FAILED -> 402 (E1: same semantics)', r6.status === 402, '402', `${r6.status}`);

        // E2: provider UNKNOWN semantics identical in EXPRESS
        await setProviderMode('UNKNOWN');
        const o7 = await createOrder();
        const r7 = await settle(o7.id, { payments: [{ method: 'CARD', amount: 50 }] });
        assert('EXPRESS + provider UNKNOWN -> 409 + paymentId (E2)', r7.status === 409, '409', `${r7.status}`);
        const r7b: any = await r7.json();
        const rRec = await fetch(`${BASE}/payments/${r7b.paymentId}/reconcile`, { method: 'POST', headers: { Authorization: `Bearer ${manager.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ outcome: 'PAID' }) });
        assert('reconcile path intact in EXPRESS', rRec.status === 200, '200', `${rRec.status}`);
        await setProviderMode('SUCCESS');
        const r7c = await settle(o7.id, { payments: [{ method: 'CARD', amount: 50 }] });
        assert('fast-path re-settle after reconcile', r7c.status === 200, '200', `${r7c.status}`);

        // settle events carry orderFlowMode (§11)
        const ev = await prisma.outbox.findFirst({ where: { aggregate_id: o7.id, event_type: 'PAYMENT_COMPLETED' } });
        assert('PAYMENT_COMPLETED carries orderFlowMode=EXPRESS', (ev?.payload as any)?.orderFlowMode === 'EXPRESS', 'EXPRESS', String((ev?.payload as any)?.orderFlowMode));

        // ============ M5: configuration boundaries (rows 13-14) ============
        console.log('\n[M5] Configuration + tenant boundaries');
        const rWaiterCfg = await setMode(waiter.token, { orderFlowMode: 'EXPRESS' });
        assert('WAITER cannot change mode (403)', rWaiterCfg.status === 403, '403', `${rWaiterCfg.status}`);
        const rBad = await setMode(manager.token, { orderFlowMode: 'CHAOS' });
        assert('invalid mode rejected 400', rBad.status === 400, '400', `${rBad.status}`);

        const rB = await setMode(managerB.token, { orderFlowMode: 'EXPRESS', kitchenGateEnforced: true });
        assert('tenant B mutates only itself', rB.status === 200, '200', `${rB.status}`);
        const cfgA = await prisma.restaurants.findUnique({ where: { id: ridA } });
        assert('tenant A untouched by B config change', cfgA?.order_flow_mode === 'EXPRESS', 'unchanged', String(cfgA?.order_flow_mode));

        const oX = await createOrder();
        const rX = await fetch(`${BASE}/orders/${oX.id}/settle`, { method: 'POST', headers: { Authorization: `Bearer ${managerB.token}`, 'x-session-id': sessionA.id, 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentMethod: 'CASH', total: 50 }) });
        // Denied at the SESSION-GATE layer (B's token + A's session -> 403
        // session/tenant mismatch) before any order lookup — denial is the
        // contract; the specific layer is an implementation detail.
        assert('cross-tenant settle denied', rX.status === 403 || rX.status === 404, '403/404', `${rX.status}`);

        const modeEvents = await prisma.outbox.count({ where: { restaurant_id: ridA, event_type: 'ORDER_FLOW_MODE_CHANGED' } });
        assert('ORDER_FLOW_MODE_CHANGED outboxed for A changes', modeEvents === 2, '2', `${modeEvents}`);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    } finally {
        try {
            const rids = [ridA, rB.id];
            await prisma.payment_attempts.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.payments.deleteMany({ where: { restaurant_id: { in: rids } } });
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
            await prisma.staff.deleteMany({ where: { restaurant_id: { in: rids } } });
            await prisma.restaurants.deleteMany({ where: { id: { in: rids } } });
        } catch (e: any) {
            console.log('cleanup warning:', e.message);
        }
    }

    console.log(`\n=== M019 RESULTS: ${passed} passed, ${failed} failed ===`);
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

main();
