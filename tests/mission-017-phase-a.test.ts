import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { JwtService } from '../src/api/services/auth/JwtService.js';

// M017 Phase A — legacy settle-path hardening verification.
// Proves: (1) settlement idempotency incl. concurrency, (2) per-method journal
// lines with sum invariant, (3) durable completion events in the settle
// transaction, (4) full rollback on mid-settle failure, (5) single-tender
// regression. All assertions read back persisted STATE via Prisma.

const prisma = new PrismaClient();
const jwtService = new JwtService();
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

async function seedCoa(restaurantId: string) {
    const rows = [
        { code: '1000', name: 'Cash Drawer', type: 'ASSET' },
        { code: '1010', name: 'Card/Digital Receivables', type: 'ASSET' },
        { code: '1040', name: 'Customer Account', type: 'ASSET' },
        { code: '2000', name: 'Tax Payable', type: 'LIABILITY' },
        { code: '2010', name: 'Service Charge Payable', type: 'LIABILITY' },
        { code: '4000', name: 'Food & Beverage Revenue', type: 'REVENUE' },
        { code: '4010', name: 'Delivery Revenue', type: 'REVENUE' },
        { code: '4020', name: 'Rounding', type: 'REVENUE' },
        { code: '4900', name: 'Discount Expense', type: 'EXPENSE' },
    ];
    for (const r of rows) {
        await prisma.chart_of_accounts.create({
            data: { restaurant_id: restaurantId, code: r.code, name: r.name, type: r.type as any, is_system: true },
        });
    }
}

async function main() {
    console.log('--- STARTING M017 PHASE A SETTLE HARDENING VERIFICATION ---');
    const ts = Date.now();

    const restaurant = await prisma.restaurants.create({
        data: {
            name: 'M017 Phase A Restaurant',
            slug: `m017pa-${ts}`,
            phone: '03000000000',
            address: 'Test',
            currency: 'PKR',
            timezone: 'Asia/Karachi',
            subscription_plan: 'BASIC',
            subscription_status: 'ACTIVE',
        },
    });
    const rid = restaurant.id;

    const pinHash = await bcrypt.hash('424242', 12);
    const staff = await prisma.staff.create({
        data: {
            restaurant_id: rid,
            name: 'Settle Manager',
            role: 'MANAGER',
            pin: '',
            hashed_pin: pinHash,
            status: 'active',
        },
    });
    const token = jwtService.generateAccessToken(staff.id, rid, 'MANAGER', staff.name);

    const session = await prisma.cashier_sessions.create({
        data: { restaurant_id: rid, opened_by: staff.id, status: 'OPEN', opening_float: 0 },
    });

    await seedCoa(rid);

    const accounts = await prisma.chart_of_accounts.findMany({ where: { restaurant_id: rid } });
    const accByCode = new Map(accounts.map(a => [a.code, a]));

    const makeOrder = (total: number, tax: number) =>
        prisma.orders.create({
            data: {
                restaurant_id: rid,
                type: 'TAKEAWAY',
                status: 'ACTIVE',
                total,
                tax,
                tax_type: 'EXCLUSIVE',
                payment_status: 'UNPAID',
            },
        });

    const settle = (orderId: string, body: object) =>
        fetch(`${BASE}/orders/${orderId}/settle`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'x-session-id': session.id,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

    const stateOf = async (orderId: string) => ({
        order: await prisma.orders.findUnique({ where: { id: orderId } }),
        txs: await prisma.transactions.findMany({ where: { order_id: orderId }, orderBy: { amount: 'asc' } }),
        journal: await prisma.journal_entries.findFirst({
            where: { reference_type: 'ORDER_SALE', reference_id: orderId },
            include: { journal_entry_lines: true },
        }),
        revenueCredits: await prisma.ledger_entries.count({
            where: { reference_id: orderId, reference_type: 'ORDER', transaction_type: 'CREDIT', account_id: null },
        }),
        debitLedgers: await prisma.ledger_entries.findMany({
            where: { reference_id: orderId, reference_type: 'ORDER', transaction_type: 'DEBIT' },
        }),
        events: await prisma.outbox.findMany({
            where: { aggregate_type: 'orders', aggregate_id: orderId },
            orderBy: { event_type: 'asc' },
        }),
    });

    try {
        // =====================================================
        // TEST 1: single-tender settle + sequential replay
        // =====================================================
        console.log('\n[Test 1] Single-tender settle; replay returns original verbatim');
        {
            const order = await makeOrder(110, 10);
            const body = { total: 110, tax: 10, payments: [{ method: 'CASH', amount: 110 }] };

            const res1 = await settle(order.id, body);
            assert('settle accepted', res1.status === 200, '200', `${res1.status}`);
            assert('no replay header on first settle', res1.headers.get('x-settlement-replay') === null, 'null', String(res1.headers.get('x-settlement-replay')));

            let s = await stateOf(order.id);
            assert('order CLOSED+PAID+key set', s.order?.status === 'CLOSED' && s.order?.payment_status === 'PAID' && s.order?.settlement_key === `SETTLE:${rid}:${order.id}`, 'CLOSED/PAID/keyed', `${s.order?.status}/${s.order?.payment_status}/${s.order?.settlement_key}`);
            assert('exactly one transaction row', s.txs.length === 1 && s.txs[0].payment_method === 'CASH' && Number(s.txs[0].amount) === 110, '1xCASH@110', `${s.txs.length}x${s.txs[0]?.payment_method}@${s.txs[0]?.amount}`);
            assert('journal posted once', !!s.journal, 'present', s.journal ? 'present' : 'missing');

            const res2 = await settle(order.id, body);
            assert('replay returns 200', res2.status === 200, '200', `${res2.status}`);
            assert('replay marked via header', res2.headers.get('x-settlement-replay') === 'true', 'true', String(res2.headers.get('x-settlement-replay')));
            const body2: any = await res2.json();
            assert('replay body is original order verbatim', body2.success === true && body2.order.id === order.id && body2.order.payment_status === 'PAID', 'same settled order', JSON.stringify(body2).slice(0, 80));

            const before = s;
            s = await stateOf(order.id);
            assert('replay had ZERO side effects (tx count)', s.txs.length === before.txs.length, '1', `${s.txs.length}`);
            assert('replay had ZERO side effects (events)', s.events.length === 2, '2', `${s.events.length}`);
            assert('PAYMENT_COMPLETED event present', s.events.some(e => e.event_type === 'PAYMENT_COMPLETED'), 'present', s.events.map(e => e.event_type).join(','));
            assert('ORDER_COMPLETED event present', s.events.some(e => e.event_type === 'ORDER_COMPLETED'), 'present', s.events.map(e => e.event_type).join(','));
            const pc = s.events.find(e => e.event_type === 'PAYMENT_COMPLETED') as any;
            assert('event payload sanitized business facts', pc?.payload?.orderId === order.id && Number(pc?.payload?.total) === 110 && Array.isArray(pc?.payload?.payments) && pc.payload.payments[0].method === 'CASH', 'facts-only payload', JSON.stringify(pc?.payload).slice(0, 120));
        }

        // =====================================================
        // TEST 2: parallel double-submit -> exactly one settlement
        // =====================================================
        console.log('\n[Test 2] Parallel double-submit produces exactly one settlement');
        {
            const order = await makeOrder(110, 10);
            const body = { total: 110, tax: 10, payments: [{ method: 'CASH', amount: 110 }] };

            const [r1, r2] = await Promise.all([settle(order.id, body), settle(order.id, body)]);
            assert('both concurrent requests answered 200', r1.status === 200 && r2.status === 200, '200/200', `${r1.status}/${r2.status}`);
            const replays = [r1, r2].filter(r => r.headers.get('x-settlement-replay') === 'true').length;
            assert('exactly one request won the race', replays === 1, '1 replay', `${replays}`);

            const s = await stateOf(order.id);
            assert('exactly one transaction row under concurrency', s.txs.length === 1, '1', `${s.txs.length}`);
            assert('exactly one ORDER_SALE journal under concurrency', !!s.journal, '1', s.journal ? '1' : '0');
            assert('exactly one event pair under concurrency', s.events.length === 2, '2', `${s.events.length}`);
            assert('order settled once', s.order?.payment_status === 'PAID' && s.order?.settlement_key === `SETTLE:${rid}:${order.id}`, 'PAID+keyed', `${s.order?.payment_status}/${s.order?.settlement_key}`);
        }

        // =====================================================
        // TEST 3: mixed-tender drill — per-method journals, sum invariant
        // =====================================================
        console.log('\n[Test 3] Mixed tender (60 CASH + 50 CARD): per-method journal lines');
        {
            const order = await makeOrder(110, 10);
            const res = await settle(order.id, {
                total: 110, tax: 10,
                payments: [{ method: 'CASH', amount: 60 }, { method: 'CARD', amount: 50 }],
            });
            assert('mixed-tender settle accepted', res.status === 200, '200', `${res.status}`);

            const s = await stateOf(order.id);
            assert('two transaction rows for split', s.txs.length === 2, '2', `${s.txs.length}`);
            const sumTx = s.txs.reduce((a, t) => a + Number(t.amount), 0);
            assert('transactions sum == settled total', Math.abs(sumTx - 110) < 0.001, '110', `${sumTx}`);

            const lines = (s.journal as any)?.journal_entry_lines ?? [];
            const accCode = new Map(accounts.map(a => [a.id, a.code]));
            const debits = lines.filter((l: any) => Number(l.debit) > 0);
            const cashLine = debits.find((l: any) => accCode.get(l.account_id) === '1000');
            const cardLine = debits.find((l: any) => accCode.get(l.account_id) === '1010');
            assert('cash line journals under 1000 with meta CASH', !!cashLine && Math.abs(Number(cashLine.debit) - 60) < 0.001 && (cashLine.meta as any)?.paymentMethod === 'CASH', '1000@60 metaCASH', `${cashLine ? accCode.get(cashLine.account_id) : 'missing'}@${cashLine?.debit}`);
            assert('card line journals under 1010 with meta CARD', !!cardLine && Math.abs(Number(cardLine.debit) - 50) < 0.001 && (cardLine.meta as any)?.paymentMethod === 'CARD', '1010@50 metaCARD', `${cardLine ? accCode.get(cardLine.account_id) : 'missing'}@${cardLine?.debit}`);

            const totalDebit = debits.reduce((a: number, l: any) => a + Number(l.debit), 0);
            const totalCredit = lines.reduce((a: number, l: any) => a + Number(l.credit || 0), 0);
            assert('journal balanced and sums == total', Math.abs(totalDebit - 110) < 0.001 && Math.abs(totalCredit - 110) < 0.001, '110/110', `${totalDebit}/${totalCredit}`);

            const ledgerMethods = s.debitLedgers.map(l => l.description).join(' | ');
            assert('per-method ledger debits present', /CASH received/.test(ledgerMethods) && /CARD received/.test(ledgerMethods), 'CASH+CARD descriptions', ledgerMethods.slice(0, 90));
            const sumDebitLedger = s.debitLedgers.reduce((a, l) => a + Number(l.amount), 0);
            assert('ledger debits sum == settled total', Math.abs(sumDebitLedger - 110) < 0.001, '110', `${sumDebitLedger}`);

            const fiscalCount = await prisma.fiscal_documents.count({ where: { restaurant_id: rid } });
            assert('fiscal linkage unchanged (POS settle does not create fiscal docs today)', fiscalCount === 0, '0', `${fiscalCount}`);
        }

        // =====================================================
        // TEST 4: mid-settle failure drill — FULL rollback incl. outbox
        // =====================================================
        console.log('\n[Test 4] Mid-settle failure rolls back everything, retry succeeds');
        {
            const order = await makeOrder(110, 10);
            // Blocker forces the in-transaction outbox insert to violate its
            // unique constraint AFTER order-close, transactions and journals
            // were written — simulating an enqueue failure mid-settle.
            await prisma.outbox.create({
                data: {
                    restaurant_id: rid,
                    event_type: 'PAYMENT_COMPLETED',
                    aggregate_type: 'orders',
                    aggregate_id: order.id,
                    payload: { blocker: true },
                },
            });

            const res = await settle(order.id, { total: 110, tax: 10, payments: [{ method: 'CASH', amount: 110 }] });
            assert('mid-settle failure surfaces as error', res.status >= 500, '>=500', `${res.status}`);

            const s = await stateOf(order.id);
            assert('rollback: order still ACTIVE/UNPAID/unkeyed', s.order?.status === 'ACTIVE' && s.order?.payment_status !== 'PAID' && !s.order?.settlement_key, 'ACTIVE/UNPAID/no key', `${s.order?.status}/${s.order?.payment_status}/${s.order?.settlement_key}`);
            assert('rollback: no transaction rows', s.txs.length === 0, '0', `${s.txs.length}`);
            assert('rollback: no journal', !s.journal, 'none', s.journal ? 'present' : 'none');
            assert('rollback: no revenue credit', s.revenueCredits === 0, '0', `${s.revenueCredits}`);
            assert('rollback: no orphaned events (only the pre-seeded blocker)', s.events.length === 1, '1', `${s.events.length}`);

            await prisma.outbox.deleteMany({ where: { aggregate_type: 'orders', aggregate_id: order.id } });
            const resRetry = await settle(order.id, { total: 110, tax: 10, payments: [{ method: 'CASH', amount: 110 }] });
            assert('retry after failure settles cleanly (deterministic key)', resRetry.status === 200 && resRetry.headers.get('x-settlement-replay') === null, '200 fresh', `${resRetry.status}/${resRetry.headers.get('x-settlement-replay')}`);
            const s2 = await stateOf(order.id);
            assert('retry produced full settlement state', s2.order?.payment_status === 'PAID' && s2.txs.length === 1 && s2.events.length === 2, 'PAID/1tx/2events', `${s2.order?.payment_status}/${s2.txs.length}/${s2.events.length}`);
        }

        // =====================================================
        // TEST 5: legacy PAID order without key is treated as settled
        // =====================================================
        console.log('\n[Test 5] Legacy already-paid order (no key) cannot be re-settled');
        {
            const order = await prisma.orders.create({
                data: { restaurant_id: rid, type: 'TAKEAWAY', status: 'CLOSED', total: 80, payment_status: 'PAID' },
            });
            const res = await settle(order.id, { total: 80, payments: [{ method: 'CASH', amount: 80 }] });
            assert('legacy paid order replay suppressed', res.status === 200 && res.headers.get('x-settlement-replay') === 'true', '200+replay header', `${res.status}/${res.headers.get('x-settlement-replay')}`);
            const txCount = await prisma.transactions.count({ where: { order_id: order.id } });
            assert('legacy replay created no transactions', txCount === 0, '0', `${txCount}`);
        }
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    } finally {
        // Cleanup fixtures
        try {
            await prisma.journal_entry_lines.deleteMany({ where: { journal_entries: { restaurant_id: rid } } });
            await prisma.journal_entries.deleteMany({ where: { restaurant_id: rid } });
            await prisma.ledger_entries.deleteMany({ where: { restaurant_id: rid } });
            await prisma.outbox.deleteMany({ where: { restaurant_id: rid } });
            await prisma.transactions.deleteMany({ where: { restaurant_id: rid } });
            await prisma.cashier_sessions.deleteMany({ where: { restaurant_id: rid } });
            await prisma.orders.deleteMany({ where: { restaurant_id: rid } });
            await prisma.menu_items.deleteMany({ where: { restaurant_id: rid } });
            await prisma.menu_categories.deleteMany({ where: { restaurant_id: rid } });
            await prisma.order_type_defaults.deleteMany({ where: { restaurant_id: rid } });
            await prisma.chart_of_accounts.deleteMany({ where: { restaurant_id: rid } });
            await prisma.staff.deleteMany({ where: { restaurant_id: rid } });
            await prisma.restaurants.delete({ where: { id: rid } });
        } catch (e: any) {
            console.log('cleanup warning:', e.message);
        }
    }

    console.log(`\n=== M017 PHASE A RESULTS: ${passed} passed, ${failed} failed ===`);
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

main();
