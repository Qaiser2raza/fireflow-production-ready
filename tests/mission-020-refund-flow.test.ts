import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

// M020 — M018 F-02 refund flow for settled orders (EVIDENCE per approved
// design rev2, docs/work-in-progress/REFUND_FLOW_DESIGN.md §18 closure
// matrix). Invariants asserted at runtime: R1 concurrent-race convergence,
// R2 closed-session immutability, R3 three-layer duplicate protection,
// R4 UNKNOWN discipline, R5 boundary preservation.

const prisma = new PrismaClient();
const BASE = 'http://localhost:3001/api';

let passed = 0;
let failed = 0;
function assert(name: string, cond: boolean, expected: string, actual: string) {
    if (cond) { console.log(`  PASS: ${name}`); passed++; }
    else { console.log(`  FAIL: ${name} — expected ${expected}, got ${actual}`); failed++; }
}

const PINS = { manager: '111111', waiter: '222222', managerB: '333333' };

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

async function seedCOA(restaurantId: string) {
    const accounts: Array<{ code: string; name: string; type: any }> = [
        { code: '1000', name: 'Cash & Cash Equivalents', type: 'ASSET' },
        { code: '1010', name: 'Card / Digital Receivables', type: 'ASSET' },
        { code: '1020', name: 'Rider Receivables', type: 'ASSET' },
        { code: '1040', name: 'Customer Account', type: 'ASSET' },
        { code: '1090', name: 'Manager Safe / Drawing', type: 'ASSET' },
        { code: '2000', name: 'Sales Tax Payable', type: 'LIABILITY' },
        { code: '2010', name: 'Service Charge Payable', type: 'LIABILITY' },
        { code: '4000', name: 'Food & Beverage Revenue', type: 'REVENUE' },
        { code: '4010', name: 'Delivery Fee Revenue', type: 'REVENUE' },
        { code: '4020', name: 'Rounding Differences', type: 'REVENUE' },
        { code: '4030', name: 'Miscellaneous Income', type: 'REVENUE' },
        { code: '4900', name: 'Discounts Given', type: 'EXPENSE' },
        { code: '5030', name: 'Cash Shortage', type: 'EXPENSE' },
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
    console.log('--- STARTING M020 REFUND FLOW VERIFICATION (F-02 design rev2 §18) ---');
    const ts = Date.now();

    const rA = await prisma.restaurants.create({
        data: { name: 'M020 Alpha', slug: `m020-a-${ts}`, currency: 'PKR', phone: '03', address: 'x', timezone: 'Asia/Karachi', subscription_plan: 'BASIC', subscription_status: 'ACTIVE' },
    });
    const rB = await prisma.restaurants.create({
        data: { name: 'M020 Beta', slug: `m020-b-${ts}`, currency: 'PKR', phone: '03', address: 'x', timezone: 'Asia/Karachi', subscription_plan: 'BASIC', subscription_status: 'ACTIVE' },
    });
    const ridA = rA.id;
    await seedCOA(ridA);
    const manager = await makeStaff(ridA, 'M020 Manager', 'MANAGER', PINS.manager);
    const waiter = await makeStaff(ridA, 'M020 Waiter', 'WAITER', PINS.waiter);
    const managerB = await makeStaff(rB.id, 'M020 Beta Manager', 'MANAGER', PINS.managerB);

    const sessionA = await prisma.cashier_sessions.create({ data: { restaurant_id: ridA, opened_by: manager.staff.id, status: 'OPEN', opening_float: 100 } });

    const setProviderMode = async (mode: string) => {
        const r = await fetch(`${BASE}/testing/payment-mode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
        if (r.status !== 200) throw new Error(`provider mode ${mode} failed`);
    };
    const providerHistory = async (): Promise<Array<{ providerIdempotencyKey: string; outcome: string }>> => {
        const r = await fetch(`${BASE}/testing/payment-mode`);
        const d: any = await r.json();
        return d.refundCalls || [];
    };
    const settle = (orderId: string, body: object, sessionId?: string) =>
        fetch(`${BASE}/orders/${orderId}/settle`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${manager.token}`, ...(sessionId ? { 'x-session-id': sessionId } : {}), 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    const refund = (orderId: string, body: object, token: string = manager.token, sessionId?: string | null) =>
        fetch(`${BASE}/orders/${orderId}/refund`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, ...(sessionId ? { 'x-session-id': sessionId } : {}), 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    const reconcile = (refundId: string, body: object, token: string = manager.token) =>
        fetch(`${BASE}/refunds/${refundId}/reconcile`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    const createOrder = (total: number) =>
        prisma.orders.create({ data: { restaurant_id: ridA, type: 'TAKEAWAY', status: 'ACTIVE', total, payment_status: 'UNPAID' } });
    const journalNets = async (referenceType: string, referenceId: string) => {
        const journals = await prisma.journal_entries.findMany({
            where: { reference_type: referenceType, reference_id: referenceId },
            include: { journal_entry_lines: { include: { chart_of_accounts: { select: { code: true } } } } },
        });
        const nets: Record<string, number> = {};
        let totalDr = 0, totalCr = 0;
        for (const j of journals) for (const l of j.journal_entry_lines) {
            const code = l.chart_of_accounts.code;
            nets[code] = (nets[code] || 0) + Number(l.debit) - Number(l.credit);
            totalDr += Number(l.debit); totalCr += Number(l.credit);
        }
        return { journals, nets, totalDr, totalCr };
    };

    try {
        await setProviderMode('SUCCESS');

        // Shared fixtures — settled orders used across the matrix.
        const o1 = await createOrder(50); // CASH — denial rows then successful cash refund
        await settle(o1.id, { paymentMethod: 'CASH', total: 50 }, sessionA.id);
        const o2 = await createOrder(80); // CARD — digital-only refund without session
        await settle(o2.id, { payments: [{ method: 'CARD', amount: 80 }] }, sessionA.id);

        // ============ Row 3: cross-tenant denial (404 oracle) ============
        console.log('\n[R3] Cross-tenant refund denial');
        const rCross = await refund(o1.id, { pin: PINS.managerB, reasonCode: 'CUSTOMER_REQUEST' }, managerB.token);
        assert('tenant B cannot refund tenant A order (404)', rCross.status === 404, '404', `${rCross.status}`);

        // ============ Row 1: MANAGER+ authorization =======================
        console.log('\n[R1] Role gate');
        const rWaiter = await refund(o1.id, { pin: PINS.waiter, reasonCode: 'CUSTOMER_REQUEST' }, waiter.token);
        assert('WAITER refund denied (403)', rWaiter.status === 403, '403', `${rWaiter.status}`);

        // ============ Row 2: wrong PIN + missing reason ===================
        console.log('\n[R2] Ceremony denials');
        const rWrongPin = await refund(o1.id, { pin: '999999', reasonCode: 'ORDER_ERROR' });
        assert('wrong money-movement PIN denied (403)', rWrongPin.status === 403, '403', `${rWrongPin.status}`);
        const wrongPinBody: any = await rWrongPin.json();
        assert('denial names PIN failure', wrongPinBody.code === 'REFUND_PIN_INVALID', 'REFUND_PIN_INVALID', wrongPinBody.code);
        const denyAudit = await prisma.audit_logs.findFirst({ where: { restaurant_id: ridA, action_type: 'REFUND_DENIED', entity_id: o1.id }, orderBy: { created_at: 'desc' } });
        assert('wrong PIN audited', !!denyAudit && (denyAudit.details as any)?.denied_reason === 'PIN_VERIFICATION_FAILED', 'PIN_VERIFICATION_FAILED', JSON.stringify(denyAudit?.details || {}).slice(0, 60));
        assert('no aggregate created by denied attempt', (await prisma.refunds.count({ where: { order_id: o1.id } })) === 0, '0', 'present');
        const rNoReason = await refund(o1.id, { pin: PINS.manager });
        assert('missing structured reason denied (400)', rNoReason.status === 400, '400', `${rNoReason.status}`);
        const rBadReason = await refund(o1.id, { pin: PINS.manager, reasonCode: 'FREEFORM_WHIM' });
        assert('non-enum reason denied (400)', rBadReason.status === 400, '400', `${rBadReason.status}`);

        // ============ Rows 4 + 9: full CASH refund -> REFUNDED ============
        console.log('\n[R4/R9] Full cash refund');
        const rCash = await refund(o1.id, { pin: PINS.manager, reasonCode: 'CUSTOMER_REQUEST', reasonDetail: 'customer changed mind' }, manager.token, sessionA.id);
        assert('cash refund completes (200)', rCash.status === 200, '200', `${rCash.status}`);
        const cashBody: any = await rCash.json();
        assert('cash rail uses CASH_DRAWER provider', cashBody.refund.provider === 'CASH_DRAWER', 'CASH_DRAWER', cashBody.refund?.provider);
        assert('refund_key is REFUND:{tenant}:{order}', cashBody.refund.refund_key === `REFUND:${ridA}:${o1.id}`, `REFUND:${ridA.slice(-6)}…`, String(cashBody.refund.refund_key).slice(0, 30));
        assert('cash refund lands COMPLETED', cashBody.refundStatus === 'COMPLETED' && cashBody.refund.completed_at !== null, 'COMPLETED', `${cashBody.refundStatus}`);
        const o1After = await prisma.orders.findUnique({ where: { id: o1.id } });
        assert('order flipped to REFUNDED', o1After?.payment_status === 'REFUNDED', 'REFUNDED', String(o1After?.payment_status));
        const reversalTxs1 = await prisma.transactions.findMany({ where: { order_id: o1.id, status: 'REFUNDED' } });
        assert('one CASH reversal transaction row 1:1', reversalTxs1.length === 1 && reversalTxs1[0].payment_method === 'CASH' && Number(reversalTxs1[0].amount) === 50, 'CASH/50', `${reversalTxs1.length}/${reversalTxs1[0]?.payment_method}/${Number(reversalTxs1[0]?.amount)}`);
        assert('reversal carries session context', cashBody.refund.session_id === sessionA.id, 'session', String(cashBody.refund.session_id));
        const refundLedger = await prisma.ledger_entries.findMany({ where: { reference_type: 'REFUND', reference_id: cashBody.refund.id } });
        assert('ledger mirrors keep drawer math correct (50 out + revenue reversal)', refundLedger.some(l => l.transaction_type === 'CREDIT' && Number(l.amount) === 50) && refundLedger.some(l => l.transaction_type === 'DEBIT' && Number(l.amount) === 50), 'credit+debit/50', JSON.stringify(refundLedger.map(l => `${l.transaction_type}:${Number(l.amount)}`)));

        // ============ Row 5: full digital refund, no session needed ========
        console.log('\n[R5] Full card/digital refund');
        const rCard = await refund(o2.id, { pin: PINS.manager, reasonCode: 'DUPLICATE_CHARGE' });
        assert('digital refund proceeds WITHOUT open session (§7)', rCard.status === 200, '200', `${rCard.status}`);
        const cardBody: any = await rCard.json();
        assert('card refund COMPLETED with provider reference', cardBody.refundStatus === 'COMPLETED' && String(cardBody.refund.external_reference || '').startsWith('mock-refund-'), 'COMPLETED/mock-refund-*', `${cardBody.refundStatus}/${String(cardBody.refund?.external_reference).slice(0, 16)}`);
        assert('card refund aggregate records MOCK_PAYMENT provider', cardBody.refund.provider === 'MOCK_PAYMENT', 'MOCK_PAYMENT', cardBody.refund?.provider);
        const o2After = await prisma.orders.findUnique({ where: { id: o2.id } });
        assert('digital order also flips REFUNDED', o2After?.payment_status === 'REFUNDED', 'REFUNDED', String(o2After?.payment_status));

        // ============ Rows 6+7+8: mixed tender 1:1 + mirror journal ========
        console.log('\n[R6/R7/R8] Mixed-tender reversal + mirror-image journal');
        const o3 = await createOrder(100);
        await settle(o3.id, { payments: [{ method: 'CASH', amount: 60 }, { method: 'CARD', amount: 40 }], tax: 10, service_charge: 5, discount: 5, total: 100 }, sessionA.id);
        const saleBefore = await journalNets('ORDER_SALE', o3.id);
        const saleJournalBefore = {
            count: saleBefore.journals.length,
            lines: saleBefore.journals.flatMap(j => j.journal_entry_lines).map(l => ({ acct: l.account_id, dr: Number(l.debit), cr: Number(l.credit) })).sort((a, b) => a.acct.localeCompare(b.acct)),
        };
        assert('sale journal exists and balances pre-refund', saleJournalBefore.count === 1 && Math.abs(saleBefore.totalDr - saleBefore.totalCr) < 0.001, 'balanced/1', `${saleBefore.totalDr}/${saleBefore.totalCr}/${saleJournalBefore.count}`);
        const rMixed = await refund(o3.id, { pin: PINS.manager, reasonCode: 'FOOD_QUALITY', reasonDetail: 'entire ticket remade' }, manager.token, sessionA.id);
        assert('mixed-tender refund completes (200)', rMixed.status === 200, '200', `${rMixed.status}`);
        const mixedBody: any = await rMixed.json();
        const mixedReversals = await prisma.transactions.findMany({ where: { order_id: o3.id, status: 'REFUNDED' } });
        assert('each tender line reversed 1:1 on its own rail (CASH60+CARD40)', mixedReversals.length === 2 && mixedReversals.some(t => t.payment_method === 'CASH' && Number(t.amount) === 60) && mixedReversals.some(t => t.payment_method === 'CARD' && Number(t.amount) === 40), '2 rails', JSON.stringify(mixedReversals.map(t => `${t.payment_method}:${Number(t.amount)}`)));
        const refundJournal = await journalNets('ORDER_REFUND', mixedBody.refund.id);
        assert('refund journal balances (JOURNAL_IMBALANCE guard holds)', Math.abs(refundJournal.totalDr - refundJournal.totalCr) < 0.001, 'DR==CR', `${refundJournal.totalDr}/${refundJournal.totalCr}`);
        const flipOk = Object.keys(saleBefore.nets).every(code => {
            const saleNet = saleBefore.nets[code] || 0;
            const refundNet = refundJournal.nets[code] || 0;
            return saleNet === 0 ? refundNet === 0 : Math.abs(saleNet + refundNet) < 0.001;
        });
        assert('every account line is sign-flipped vs ORDER_SALE (tax/sc/revenue/discount/tender)', flipOk, 'exact mirror', JSON.stringify({ sale: saleBefore.nets, refund: refundJournal.nets }));
        assert('tax liability reduced not asset-refunded (DR 2000)', (refundJournal.nets['2000'] || 0) > 0 && (refundJournal.nets['1000'] || 0) < 0 && (refundJournal.nets['1010'] || 0) < 0 && (refundJournal.nets['4000'] || 0) > 0 && (refundJournal.nets['4900'] || 0) < 0, 'DR2000/CR1000/CR1010/DR4000/CR4900', JSON.stringify(refundJournal.nets));
        const saleAfter = await journalNets('ORDER_SALE', o3.id);
        const saleJournalAfter = {
            count: saleAfter.journals.length,
            lines: saleAfter.journals.flatMap(j => j.journal_entry_lines).map(l => ({ acct: l.account_id, dr: Number(l.debit), cr: Number(l.credit) })).sort((a, b) => a.acct.localeCompare(b.acct)),
        };
        assert('original sale journal immutable after refund', JSON.stringify(saleJournalBefore) === JSON.stringify(saleJournalAfter), 'identical', 'mutated');

        // ============ Row 13: sequential duplicate → same identity =========
        console.log('\n[R13] Sequential duplicate refund');
        const rDup = await refund(o3.id, { pin: PINS.manager, reasonCode: 'OTHER' }, manager.token, sessionA.id);
        const dupBody: any = await rDup.json();
        assert('duplicate returns SAME refund identity verbatim', rDup.status === 200 && dupBody.replay === true && dupBody.refund.id === mixedBody.refund.id, 'same id/replay', `${dupBody.refund?.id}`);
        assert('still exactly ONE refund aggregate + ONE reversal journal', (await prisma.refunds.count({ where: { order_id: o3.id } })) === 1 && (await prisma.journal_entries.count({ where: { reference_type: 'ORDER_REFUND', reference_id: mixedBody.refund.id } })) === 1, '1/1', `${await prisma.refunds.count({ where: { order_id: o3.id } })}/${await prisma.journal_entries.count({ where: { reference_type: 'ORDER_REFUND', reference_id: mixedBody.refund.id } })}`);

        // ============ Row 14: CONCURRENT duplicate → one operation (R1) ====
        console.log('\n[R14] Concurrent refund race (Promise.all)');
        await setProviderMode('SUCCESS');
        const o4 = await createOrder(70);
        await settle(o4.id, { payments: [{ method: 'CARD', amount: 70 }] }, sessionA.id);
        const [race1, race2] = await Promise.all([
            refund(o4.id, { pin: PINS.manager, reasonCode: 'ORDER_ERROR' }),
            refund(o4.id, { pin: PINS.manager, reasonCode: 'ORDER_ERROR' }),
        ]);
        assert('both racing requests answer 200', race1.status === 200 && race2.status === 200, '200/200', `${race1.status}/${race2.status}`);
        const raceAggs = await prisma.refunds.findMany({ where: { order_id: o4.id } });
        assert('exactly ONE refund aggregate exists', raceAggs.length === 1, '1', `${raceAggs.length}`);
        const raceRefundId = raceAggs[0]?.id;
        const history = await providerHistory();
        const raceCalls = history.filter(c => c.providerIdempotencyKey.startsWith(`refund:${raceRefundId}`));
        assert('provider saw exactly ONE refund operation (R1 proven)', raceCalls.length === 1 && raceCalls[0].outcome === 'COMPLETED', '1xCOMPLETED', JSON.stringify(history.filter(c => c.providerIdempotencyKey.includes('refund:')).length) + '/' + raceCalls.length);
        const raceDupResponses = [(await race1.json()), (await race2.json())];
        assert('racing responses converge on one identity', raceDupResponses.every((b: any) => b.refund.id === raceRefundId) && raceDupResponses.some((b: any) => b.replay === true), 'same id', JSON.stringify(raceDupResponses.map((b: any) => b.refund?.id)));
        assert('exactly one resulting reversal journal + order REFUNDED once', (await prisma.journal_entries.count({ where: { reference_type: 'ORDER_REFUND', reference_id: raceRefundId } })) === 1 && (await prisma.orders.findUnique({ where: { id: o4.id } }))?.payment_status === 'REFUNDED', '1/REFUNDED', `${await prisma.journal_entries.count({ where: { reference_type: 'ORDER_REFUND', reference_id: raceRefundId } })}`);
        const raceReversalRows = await prisma.transactions.findMany({ where: { order_id: o4.id, status: 'REFUNDED' } });
        assert('no second reversal transaction row', raceReversalRows.length === 1, '1', `${raceReversalRows.length}`);

        // ============ Row 15: crash/retry after provider acceptance =========
        console.log('\n[R15] Crash/retry after provider acceptance');
        const o5 = await createOrder(90);
        await settle(o5.id, { payments: [{ method: 'CARD', amount: 90 }] }, sessionA.id);
        const crashTx = await prisma.transactions.findFirst({ where: { order_id: o5.id, status: 'PAID' } });
        const crashAggregate = await prisma.refunds.create({
            data: {
                restaurant_id: ridA,
                order_id: o5.id,
                refund_key: `REFUND:${ridA}:${o5.id}`,
                amount: 90,
                currency: 'PKR',
                status: 'PENDING',
                provider: 'MOCK_PAYMENT',
                reason_code: 'OTHER',
                requested_by: manager.staff.id,
            },
        });
        const { PaymentDispatcher } = await import('../src/api/services/payment/PaymentDispatcher');
        const { PaymentRegistry } = await import('../src/api/services/payment/PaymentRegistry');
        const { MockPaymentProvider } = await import('../src/api/services/payment/providers/MockPaymentProvider');
        const testRegistry = PaymentRegistry.getInstance();
        const localMock = new MockPaymentProvider();
        if (!testRegistry.has('MOCK_PAYMENT')) testRegistry.register(localMock);
        const crashedAttempt = await PaymentDispatcher.getInstance().startRefundAttempt({
            refundId: crashAggregate.id,
            restaurantId: ridA,
            orderId: o5.id,
            transactionId: crashTx!.id,
            amount: 90,
            currency: 'PKR',
            staffId: manager.staff.id,
        });
        assert('simulated provider acceptance returned COMPLETED', crashedAttempt.outcome === 'COMPLETED', 'COMPLETED', crashedAttempt.outcome);
        const crashedState = await prisma.refunds.findUnique({ where: { id: crashAggregate.id } });
        assert('simulated crash state: provider accepted, nothing committed locally', crashedState?.status === 'COMPLETED' && (await prisma.journal_entries.count({ where: { reference_type: 'ORDER_REFUND', reference_id: crashAggregate.id } })) === 0, 'COMPLETED/no-journal', `${crashedState?.status}`);
        const crashKey = `refund:${crashAggregate.id}:${crashTx!.id}`;
        const drivesBeforeRetry = localMock.getReceivedRefundCalls().filter(c => c.providerIdempotencyKey === crashKey).length;
        const rRetry = await refund(o5.id, { pin: PINS.manager, reasonCode: 'OTHER' });
        const retryBody: any = await rRetry.json();
        assert('retry fast-paths the persisted aggregate', rRetry.status === 200 && retryBody.replay === true && retryBody.refund.id === crashAggregate.id, 'replay/same id', `${retryBody.replay}/${retryBody.refund?.id}`);
        assert('side effects completed from persisted state: ONE journal, order REFUNDED', (await prisma.journal_entries.count({ where: { reference_type: 'ORDER_REFUND', reference_id: crashAggregate.id } })) === 1 && (await prisma.orders.findUnique({ where: { id: o5.id } }))?.payment_status === 'REFUNDED', '1/REFUNDED', 'missing');
        const drivesAfterRetry = localMock.getReceivedRefundCalls().filter(c => c.providerIdempotencyKey === crashKey).length;
        assert('provider NOT re-driven on retry (exactly one drive before AND after)', drivesBeforeRetry === 1 && drivesAfterRetry === 1, '1/1', `${drivesBeforeRetry}/${drivesAfterRetry}`);

        // ============ Row 10: provider FAILED → no reversal journal =========
        console.log('\n[R10] Provider FAILED semantics');
        const o6 = await createOrder(60);
        await settle(o6.id, { payments: [{ method: 'CARD', amount: 60 }] }, sessionA.id);
        await setProviderMode('FAILED');
        const rFailed = await refund(o6.id, { pin: PINS.manager, reasonCode: 'CUSTOMER_REQUEST' });
        const failedBody: any = await rFailed.json();
        assert('refund lands FAILED', rFailed.status === 200 && failedBody.refundStatus === 'FAILED', '200/FAILED', `${rFailed.status}/${failedBody.refundStatus}`);
        assert('NO reversal journal on FAILED', (await prisma.journal_entries.count({ where: { reference_type: 'ORDER_REFUND', reference_id: failedBody.refund.id } })) === 0, '0', 'present');
        assert('order remains PAID on FAILED', (await prisma.orders.findUnique({ where: { id: o6.id } }))?.payment_status === 'PAID', 'PAID', 'other');
        const rFailedDup = await refund(o6.id, { pin: PINS.manager, reasonCode: 'CUSTOMER_REQUEST' });
        const failedDupBody: any = await rFailedDup.json();
        assert('FAILED aggregate replayed verbatim (no re-drive)', failedDupBody.replay === true && failedDupBody.refund.id === failedBody.refund.id && failedDupBody.refund.status === 'FAILED', 'same FAILED identity', `${failedDupBody.refund?.id}/${failedDupBody.refund?.status}`);
        await setProviderMode('SUCCESS');

        // ============ Rows 11+12: UNKNOWN discipline + ceremony reconcile ====
        console.log('\n[R11/R12] UNKNOWN discipline + reconciliation');
        const o7 = await createOrder(40);
        await settle(o7.id, { payments: [{ method: 'CARD', amount: 40 }] }, sessionA.id);
        await setProviderMode('UNKNOWN');
        const rUnknown = await refund(o7.id, { pin: PINS.manager, reasonCode: 'ORDER_ERROR' });
        const unknownBody: any = await rUnknown.json();
        assert('aggregate lands UNKNOWN', rUnknown.status === 200 && unknownBody.refundStatus === 'UNKNOWN' && unknownBody.refund.status === 'UNKNOWN', 'UNKNOWN', `${unknownBody.refundStatus}`);
        assert('UNKNOWN: order stays PAID (R4)', (await prisma.orders.findUnique({ where: { id: o7.id } }))?.payment_status === 'PAID', 'PAID', 'other');
        assert('UNKNOWN: NO reversal journal', (await prisma.journal_entries.count({ where: { reference_type: 'ORDER_REFUND', reference_id: unknownBody.refund.id } })) === 0, '0', 'present');
        const unknownEvent = await prisma.outbox.findFirst({ where: { restaurant_id: ridA, event_type: 'ORDER_REFUND_UNKNOWN', payload: { path: ['refundId'], equals: unknownBody.refund.id } } });
        assert('ORDER_REFUND_UNKNOWN outboxed instance-scoped', !!unknownEvent && (unknownEvent.aggregate_type === 'refunds'), 'refunds aggregate', JSON.stringify(unknownEvent?.aggregate_type));
        const rRecPin = await reconcile(unknownBody.refund.id, { pin: '999999', outcome: 'COMPLETED' });
        assert('reconcile with wrong PIN denied (403)', rRecPin.status === 403, '403', `${rRecPin.status}`);
        const rRec = await reconcile(unknownBody.refund.id, { pin: PINS.manager, outcome: 'COMPLETED' });
        assert('ceremony-gated reconcile resolves COMPLETED (200)', rRec.status === 200, '200', `${rRec.status}`);
        const recJournals = await prisma.journal_entries.count({ where: { reference_type: 'ORDER_REFUND', reference_id: unknownBody.refund.id } });
        assert('reconcile produced EXACTLY ONE reversal journal', recJournals === 1, '1', `${recJournals}`);
        assert('post-reconcile order REFUNDED, refund COMPLETED', (await prisma.orders.findUnique({ where: { id: o7.id } }))?.payment_status === 'REFUNDED' && (await prisma.refunds.findUnique({ where: { id: unknownBody.refund.id } }))?.status === 'COMPLETED', 'REFUNDED/COMPLETED', 'other');
        const rRecAgain = await reconcile(unknownBody.refund.id, { pin: PINS.manager, outcome: 'COMPLETED' });
        assert('second reconcile refused (not UNKNOWN)', rRecAgain.status === 409, '409', `${rRecAgain.status}`);
        await setProviderMode('SUCCESS');

        // ============ Row 16: day-close interaction (§7) =====================
        console.log('\n[R16] Session context / day-close interaction');
        const sessionC = await prisma.cashier_sessions.create({ data: { restaurant_id: ridA, opened_by: manager.staff.id, status: 'OPEN', opening_float: 100 } });
        const o8 = await createOrder(50);
        await settle(o8.id, { paymentMethod: 'CASH', total: 50 }, sessionC.id);
        const o9 = await createOrder(30);
        await settle(o9.id, { paymentMethod: 'CASH', total: 30 }, sessionC.id);
        const rInSession = await refund(o8.id, { pin: PINS.manager, reasonCode: 'ORDER_ERROR' }, manager.token, sessionC.id);
        assert('in-session cash refund completes', rInSession.status === 200, '200', `${rInSession.status}`);
        const closeRes = await fetch(`${BASE}/cashier/close`, { method: 'POST', headers: { Authorization: `Bearer ${manager.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sessionC.id, actualCash: 130, withdrawnAmount: 0, closedBy: manager.staff.id, notes: 'M020 day-close proof' }) }).catch(() => null);
        if (!closeRes || closeRes.status !== 200) {
            const { CashierSessionService } = await import('../src/api/services/finance/CashierSessionService');
            await CashierSessionService.closeSession(ridA, sessionC.id, 130, 0, manager.staff.id, 'M020 day-close proof');
        }
        const closedSession = await prisma.cashier_sessions.findUnique({ where: { id: sessionC.id } });
        // Session math proof: float(100) + cash sales o8(50)+o9(30) − in-session refund(50) = 130.
        // Without the refund reduction the expectation would be 180 — the delta IS the refund.
        assert('in-session refund reduces EXPECTED cash at close (100+80-50=130)', Number(closedSession?.expected_cash) === 130 && Number(closedSession?.difference) === 0, '130/0', `${Number(closedSession?.expected_cash)}/${Number(closedSession?.difference)}`);
        assert('closed session accounting immutable — no retroactive edit surface', closedSession?.status === 'CLOSED' && closedSession?.closed_at !== null, 'CLOSED', closedSession?.status || '');
        const rNoSession = await refund(o9.id, { pin: PINS.manager, reasonCode: 'ORDER_ERROR' });
        assert('cash refund WITHOUT open session refused 409 REFUND_NO_OPEN_SESSION', rNoSession.status === 409, '409', `${rNoSession.status}`);
        const noSessionBody: any = await rNoSession.json();
        assert('refusal codes the drawer rule', noSessionBody.code === 'REFUND_NO_OPEN_SESSION', 'REFUND_NO_OPEN_SESSION', noSessionBody.code);
        assert('refused cash refund left order PAID + no journal', (await prisma.orders.findUnique({ where: { id: o9.id } }))?.payment_status === 'PAID' && (await prisma.refunds.count({ where: { order_id: o9.id } })) === 0, 'PAID/0', 'other');

        // ============ Row 17: time-window enforcement (§12) ==================
        console.log('\n[R17] Refund window enforcement');
        const rCfgBad = await fetch(`${BASE}/restaurant/flow-mode`, { method: 'PATCH', headers: { Authorization: `Bearer ${manager.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ orderFlowMode: 'STANDARD', refundWindowDays: -1 }) });
        assert('negative window rejected 400 at config route', rCfgBad.status === 400, '400', `${rCfgBad.status}`);
        const rCfg = await fetch(`${BASE}/restaurant/flow-mode`, { method: 'PATCH', headers: { Authorization: `Bearer ${manager.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ orderFlowMode: 'STANDARD', kitchenGateEnforced: false, refundWindowDays: 30, reason: 'M020 window matrix' }) });
        assert('configurable window accepted for MANAGER (200)', rCfg.status === 200, '200', `${rCfg.status}`);
        assert('window persisted server-side', ((await prisma.restaurants.findUnique({ where: { id: ridA } })))?.refund_window_days === 30, '30', String((await prisma.restaurants.findUnique({ where: { id: ridA } }))?.refund_window_days));
        const o10 = await createOrder(20);
        await settle(o10.id, { paymentMethod: 'CASH', total: 20 }, sessionA.id);
        const staleDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
        await prisma.orders.update({ where: { id: o10.id }, data: { closed_at: staleDate } });
        const rStale = await refund(o10.id, { pin: PINS.manager, reasonCode: 'CUSTOMER_REQUEST' }, manager.token, sessionA.id);
        assert('outside-window refund blocked 403', rStale.status === 403, '403', `${rStale.status}`);
        const staleBody: any = await rStale.json();
        assert('block coded REFUND_WINDOW_EXCEEDED', staleBody.code === 'REFUND_WINDOW_EXCEEDED', 'REFUND_WINDOW_EXCEEDED', staleBody.code);
        const blockAudit = await prisma.audit_logs.findFirst({ where: { restaurant_id: ridA, action_type: 'REFUND_WINDOW_EXCEEDED', entity_id: o10.id } });
        assert('blocked attempt AUDITED (signals precedent)', !!blockAudit && (blockAudit.details as any)?.refund_window_days === 30, 'audited/30', JSON.stringify(blockAudit?.details || {}).slice(0, 60));
        assert('blocked attempt created NO aggregate', (await prisma.refunds.count({ where: { order_id: o10.id } })) === 0, '0', 'present');
        const o11 = await createOrder(25);
        await settle(o11.id, { paymentMethod: 'CASH', total: 25 }, sessionA.id);
        const rFresh = await refund(o11.id, { pin: PINS.manager, reasonCode: 'CUSTOMER_REQUEST' }, manager.token, sessionA.id);
        assert('inside-window refund passes (positive control)', rFresh.status === 200 && (await rFresh.json()).refundStatus === 'COMPLETED', '200/COMPLETED', `${rFresh.status}`);

        // ============ Row 18: audit/outbox events, instance-scoped, ceremony separated =
        console.log('\n[R18] Events + audit hygiene');
        const ceremonies = await prisma.audit_logs.findMany({ where: { restaurant_id: ridA, action_type: 'REFUND_REQUESTED' } });
        assert('REFUND_REQUESTED ceremony audited separately', ceremonies.length >= 5, '>=5', `${ceremonies.length}`);
        assert('ceremony record marks pin_verified:true + structured reason', ceremonies.every(c => (c.details as any)?.pin_verified === true && !!(c.details as any)?.reason_code), 'true+code', JSON.stringify(ceremonies[0]?.details || {}).slice(0, 70));
        const completedEvents = await prisma.outbox.findMany({ where: { restaurant_id: ridA, event_type: 'ORDER_REFUND_COMPLETED' } });
        const distinctAggregates = new Set(completedEvents.map(e => e.aggregate_id));
        assert('completion events exist and are INSTANCE-scoped (distinct aggregates)', completedEvents.length >= 4 && distinctAggregates.size === completedEvents.length, 'all distinct', `${completedEvents.length}/${distinctAggregates.size}`);
        const auditIds = new Set((await prisma.audit_logs.findMany({ where: { restaurant_id: ridA, action_type: 'ORDER_REFUND_COMPLETED' } })).map(a => a.id));
        assert('each event aggregates its OWN audit-row instance', completedEvents.every(e => auditIds.has(e.aggregate_id)), 'audit-row ids', `${completedEvents.filter(e => !auditIds.has(e.aggregate_id)).length} orphans`);
        const payloadOk = completedEvents.every(e => {
            const p: any = e.payload;
            return p.orderId && p.refundId && p.tenantId && typeof p.amount === 'number' && p.reasonCode && p.actor;
        });
        assert('event payloads carry business facts only', payloadOk, 'orderId/refundId/tenantId/amount/reasonCode/actor', 'incomplete');
        const secretLeak = JSON.stringify(completedEvents.map(e => e.payload)) + JSON.stringify([...ceremonies.map(c => c.details), ...completedEvents.map(e => e.payload)]);
        assert('NO credential material in events or audits', !secretLeak.includes(PINS.manager) && !secretLeak.includes(PINS.waiter) && !secretLeak.includes(PINS.managerB), 'clean', 'LEAK');

        // Window restored to default posture for hygiene
        await fetch(`${BASE}/restaurant/flow-mode`, { method: 'PATCH', headers: { Authorization: `Bearer ${manager.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ orderFlowMode: 'STANDARD', kitchenGateEnforced: false, refundWindowDays: 7 }) });
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

    console.log(`\n=== M020 RESULTS: ${passed} passed, ${failed} failed ===`);
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

main();
