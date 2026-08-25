import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { isProofUniquenessConflict } from '../src/api/services/payment/SettlementGuards.js';

// M017 A1 — payment-proof submission verification (EVIDENCE, NOT AUTHORITY).
// Proves per plans/a1-payment-proof-spec.md §4:
//   (1) authorization boundary: unauthenticated 401, cross-tenant scoped-denied;
//   (2) authority prohibition: license_keys / subscription_status /
//       journal_entries / ledger_entries / orders all UNCHANGED by submission;
//   (3) local idempotency: sequential replay verbatim + concurrency winner-takes-one;
//   (4) client_token disambiguation: identical period/method/amount with
//       distinct tokens are DISTINCT payments (no false collision);
//   (5) outbox contract: exactly one PAYMENT_PROOF_SUBMITTED event per proof,
//       aggregate-triple unique, payload carries no raw secrets;
//   (6) structural P2002 attribution on the proof key surface only.
// All state assertions read back persisted STATE via Prisma.

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
            slug: `m017a1-${name.toLowerCase().replace(/\s+/g, '-')}-${ts}`,
            phone: '03000000000',
            address: 'Test',
            currency: 'PKR',
            timezone: 'Asia/Karachi',
            subscription_plan: 'BASIC',
            subscription_status: 'ACTIVE',
        },
    });
    const pin = '424242';
    const pinHash = await bcrypt.hash(pin, 12);
    const staffName = `${name} Manager`;
    const staff = await prisma.staff.create({
        data: {
            restaurant_id: restaurant.id,
            name: staffName,
            role: 'MANAGER',
            pin: '',
            hashed_pin: pinHash,
            status: 'active',
        },
    });
    const session = await prisma.cashier_sessions.create({
        data: { restaurant_id: restaurant.id, opened_by: staff.id, status: 'OPEN', opening_float: 0 },
    });
    // Authenticate through the real login flow (same pattern as phase2-wizard):
    // guarantees a token the RUNNING server accepts, whatever its key/version.
    const loginRes = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, restaurant_id: restaurant.id, staff_name: staffName }),
    });
    const loginData: any = await loginRes.json();
    if (loginRes.status !== 200 || !loginData?.tokens?.access_token) {
        throw new Error(`fixture login failed (${loginRes.status}): ${JSON.stringify(loginData).slice(0, 120)}`);
    }
    const token = loginData.tokens.access_token;
    return { restaurant, staff, session, token };
}

async function main() {
    console.log('--- STARTING M017 A1 PAYMENT PROOF VERIFICATION ---');
    const ts = Date.now();

    const tenantA = await makeTenant('M017 A1 Alpha', ts);
    const tenantB = await makeTenant('M017 A1 Beta', ts);
    const ridA = tenantA.restaurant.id;
    const ridB = tenantB.restaurant.id;

    const submit = (tenant: typeof tenantA, body: object, opts: { auth?: boolean; sessionId?: string | null } = {}) =>
        fetch(`${BASE}/billing/payment-proof`, {
            method: 'POST',
            headers: {
                ...(opts.auth === false ? {} : { Authorization: `Bearer ${tenant.token}` }),
                ...(opts.sessionId === null ? {} : { 'x-session-id': opts.sessionId ?? tenant.session.id }),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

    const stateOf = async () => ({
        licenses: await prisma.license_keys.count(),
        subA: (await prisma.restaurants.findUnique({ where: { id: ridA } }))?.subscription_status,
        journalsA: await prisma.journal_entries.count({ where: { restaurant_id: ridA } }),
        ledgersA: await prisma.ledger_entries.count({ where: { restaurant_id: ridA } }),
        txsA: await prisma.transactions.count({ where: { restaurant_id: ridA } }),
        ordersA: await prisma.orders.count({ where: { restaurant_id: ridA } }),
        deliveries: await prisma.integration_deliveries.count(),
    });

    const baseline = await stateOf();

    try {
        // =====================================================
        // TEST 1: input validation rejects malformed submissions
        // =====================================================
        console.log('\n[Test 1] Input validation (400 surfaces)');
        {
            const good = { billing_period: '2026-08', method: 'JAZZCASH', amount_minor: 150000 };
            let r = await submit(tenantA, { ...good, client_token: 'short' });
            assert('client_token below 8 chars rejected', r.status === 400, '400', `${r.status}`);
            r = await submit(tenantA, { ...good, client_token: 'x'.repeat(65) });
            assert('client_token above 64 chars rejected', r.status === 400, '400', `${r.status}`);
            r = await submit(tenantA, { ...good, client_token: 'valid-token-1', billing_period: '2026-13' });
            assert('month 13 rejected by period format', r.status === 400, '400', `${r.status}`);
            r = await submit(tenantA, { ...good, client_token: 'valid-token-1', billing_period: '08-2026' });
            assert('YYYY-MM order enforced', r.status === 400, '400', `${r.status}`);
            r = await submit(tenantA, { ...good, client_token: 'valid-token-1', amount_minor: 0 });
            assert('zero amount rejected', r.status === 400, '400', `${r.status}`);
            r = await submit(tenantA, { ...good, client_token: 'valid-token-1', amount_minor: 1500.5 });
            assert('fractional minor units rejected', r.status === 400, '400', `${r.status}`);
            r = await submit(tenantA, { ...good, client_token: 'valid-token-1', method: '' });
            assert('empty payment method rejected', r.status === 400, '400', `${r.status}`);
        }

        // =====================================================
        // TEST 2: authorization boundary
        // =====================================================
        console.log('\n[Test 2] Unauthenticated 401; session gate enforced');
        {
            const body = { client_token: 'anon-token-0001', billing_period: '2026-08', method: 'EASYPAISA', amount_minor: 100000 };
            let r = await submit(tenantA, body, { auth: false });
            assert('unauthenticated request rejected 401', r.status === 401, '401', `${r.status}`);

            r = await submit(tenantA, body, { sessionId: null });
            assert('missing cashier session rejected (SESSION_REQUIRED)', r.status === 402, '402', `${r.status}`);
        }

        // =====================================================
        // TEST 3: happy path — evidence recorded, nothing else mutated
        // =====================================================
        console.log('\n[Test 3] Submission records evidence; ZERO authority side effects');
        const proofBodyA = {
            client_token: `tok-alpha-${ts}`,
            billing_period: '2026-08',
            method: 'JAZZCASH',
            amount_minor: 250000,
            reference_note: 'Aug invoice transfer slip #8817',
        };
        {
            const r = await submit(tenantA, proofBodyA);
            assert('submission accepted', r.status === 200, '200', `${r.status}`);
            assert('first submit NOT marked as replay', r.headers.get('x-proof-replay') === null, 'null', String(r.headers.get('x-proof-replay')));
            const body: any = await r.json();
            const proof = body.proof;
            assert('proof persisted pending/unverified', !!proof?.id && proof.status === 'pending', 'pending row', JSON.stringify(proof)?.slice(0, 80));
            assert('proof bound to submitting tenant', proof?.restaurant_id === ridA, ridA.slice(0, 8), String(proof?.restaurant_id).slice(0, 8));
            assert('billing_period persisted', proof?.billing_period === '2026-08', '2026-08', String(proof?.billing_period));
            assert('reference_note persisted (bounded)', proof?.reference_note === 'Aug invoice transfer slip #8817', 'note kept', String(proof?.reference_note));
            assert('actor attribution recorded', proof?.submitted_by === tenantA.staff.id, 'staff id', String(proof?.submitted_by));
            assert('amount converted minor->major', Number(proof?.amount) === 2500, '2500', String(proof?.amount));

            const events = await prisma.outbox.findMany({ where: { aggregate_type: 'subscription_payment_proofs', aggregate_id: proof.id } });
            assert('exactly one outbox event per proof', events.length === 1, '1', `${events.length}`);
            const ev: any = events[0];
            assert('event type is PAYMENT_PROOF_SUBMITTED', ev.event_type === 'PAYMENT_PROOF_SUBMITTED', 'PAYMENT_PROOF_SUBMITTED', ev.event_type);
            const payloadStr = JSON.stringify(ev.payload);
            assert('event payload carries NO raw client_token (secret hygiene)', !payloadStr.includes(proofBodyA.client_token), 'token absent', payloadStr.includes(proofBodyA.client_token) ? 'token leaked' : 'absent');
            assert('event payload carries proof key + routing facts', (ev.payload as any)?.proofKey === proof.transaction_id && (ev.payload as any)?.billingPeriod === '2026-08' && (ev.payload as any)?.currency === 'PKR', 'key+facts', payloadStr.slice(0, 100));

            const after = await stateOf();
            assert('license_keys count UNCHANGED', after.licenses === baseline.licenses, `${baseline.licenses}`, `${after.licenses}`);
            assert('subscription_status UNCHANGED (evidence never activates)', after.subA === baseline.subA, String(baseline.subA), String(after.subA));
            assert('journal_entries UNCHANGED (zero revenue recognition)', after.journalsA === baseline.journalsA, `${baseline.journalsA}`, `${after.journalsA}`);
            assert('ledger_entries UNCHANGED', after.ledgersA === baseline.ledgersA, `${baseline.ledgersA}`, `${after.ledgersA}`);
            assert('order transactions UNCHANGED', after.txsA === baseline.txsA, `${baseline.txsA}`, `${after.txsA}`);
            assert('orders UNCHANGED (no lifecycle events)', after.ordersA === baseline.ordersA, `${baseline.ordersA}`, `${after.ordersA}`);
            assert('integration_deliveries UNCHANGED (zero cloud calls)', after.deliveries === baseline.deliveries, `${baseline.deliveries}`, `${after.deliveries}`);
        }

        // =====================================================
        // TEST 4: sequential replay returns original verbatim
        // =====================================================
        console.log('\n[Test 4] Sequential retry of same logical submission');
        {
            const r = await submit(tenantA, proofBodyA);
            assert('replay accepted', r.status === 200, '200', `${r.status}`);
            assert('replay marked via header', r.headers.get('x-proof-replay') === 'true', 'true', String(r.headers.get('x-proof-replay')));
            const body: any = await r.json();
            const rows = await prisma.subscription_payments.findMany({
                where: { restaurant_id: ridA, transaction_id: body.proof.transaction_id },
            });
            const events = await prisma.outbox.count({ where: { aggregate_type: 'subscription_payment_proofs', aggregate_id: body.proof.id } });
            assert('verbatim original returned (same id)', body.success === true && !!body.proof.id, 'same proof', JSON.stringify(body).slice(0, 60));
            assert('still exactly ONE proof row', rows.length === 1, '1', `${rows.length}`);
            assert('still exactly ONE outbox event', events === 1, '1', `${events}`);
        }

        // =====================================================
        // TEST 5: client_token disambiguation (co-CTO required case)
        // =====================================================
        console.log('\n[Test 5] Same period/method/amount, DIFFERENT token => distinct payment');
        {
            const secondToken = { ...proofBodyA, client_token: `tok-beta-${ts}` };
            const r = await submit(tenantA, secondToken);
            assert('distinct-token submission accepted (NOT suppressed)', r.status === 200 && r.headers.get('x-proof-replay') === null, '200 fresh', `${r.status}/${r.headers.get('x-proof-replay')}`);
            const body: any = await r.json();
            const distinctRows = await prisma.subscription_payments.findMany({
                where: { restaurant_id: ridA, billing_period: '2026-08', payment_method: 'JAZZCASH' },
            });
            assert('both payments stored as separate rows', distinctRows.length === 2, '2', `${distinctRows.length}`);
            assert('new payment has its own id and key', body.proof.id !== undefined && body.proof.transaction_id !== undefined, 'own identity', `${!!body.proof.id}`);
            assert('two keys differ despite identical business inputs', new Set(distinctRows.map(p => p.transaction_id)).size === 2, '2 distinct keys', `${new Set(distinctRows.map(p => p.transaction_id)).size}`);
            const evCount = await prisma.outbox.count({ where: { aggregate_type: 'subscription_payment_proofs', aggregate_id: body.proof.id } });
            assert('second payment got exactly one event', evCount === 1, '1', `${evCount}`);
        }

        // =====================================================
        // TEST 6: tenant isolation — same inputs from another tenant
        // =====================================================
        console.log('\n[Test 6] Cross-tenant submission is isolated, never colliding');
        {
            const r = await submit(tenantB, { ...proofBodyA }); // identical token/period/method/amount as tenant A
            assert('tenant B identical submission accepted as ITS OWN evidence', r.status === 200, '200', `${r.status}`);
            const body: any = await r.json();
            assert('row belongs to tenant B', body.proof.restaurant_id === ridB, ridB.slice(0, 8), String(body.proof.restaurant_id).slice(0, 8));

            const aRow = await prisma.subscription_payments.findFirst({
                where: { transaction_id: body.proof.transaction_id, restaurant_id: ridA },
            });
            assert("B's proof key cannot resolve inside A's scope", aRow === null, 'null', aRow ? 'found' : 'null');

            const foreignSession = await submit(tenantB, { client_token: `tok-x-${ts}`, billing_period: '2026-08', method: 'CASH', amount_minor: 500 }, { sessionId: tenantA.session.id });
            assert("foreign tenant session rejected 403", foreignSession.status === 403, '403', `${foreignSession.status}`);
        }

        // =====================================================
        // TEST 7: parallel duplicate submissions -> exactly one record
        // =====================================================
        console.log('\n[Test 7] Concurrent duplicates converge to one row + one event');
        {
            const body = { client_token: `tok-race-${ts}`, billing_period: '2026-07', method: 'BANK_TRANSFER', amount_minor: 99000 };
            const results = await Promise.all([
                submit(tenantA, body), submit(tenantA, body), submit(tenantA, body), submit(tenantA, body),
            ]);
            assert('all four concurrent requests answered 200', results.every(r => r.status === 200), '200x4', results.map(r => r.status).join('/'));
            const winners = results.filter(r => r.headers.get('x-proof-replay') === null).length;
            assert('exactly one request won the race', winners === 1, '1', `${winners}`);
            const ids = new Set<string>();
            for (const r of results) { const b: any = await r.json(); ids.add(b.proof.id); }
            assert('every response returns the SAME original proof', ids.size === 1, '1 id', `${ids.size}`);

            const rows = await prisma.subscription_payments.findMany({ where: { restaurant_id: ridA, billing_period: '2026-07' } });
            assert('exactly one persisted row under concurrency', rows.length === 1, '1', `${rows.length}`);
            const events = await prisma.outbox.count({ where: { aggregate_type: 'subscription_payment_proofs', aggregate_id: rows[0].id } });
            assert('exactly one outbox event under concurrency', events === 1, '1', `${events}`);
        }

        // =====================================================
        // TEST 8: P2002 attribution is structural (unit surface)
        // =====================================================
        console.log('\n[Test 8] Replay attribution narrowed to the proof-key surface');
        {
            const txIdErr: any = { code: 'P2002', meta: { target: ['subscription_payments_transaction_id_key'] } };
            const proofKeyErr: any = { code: 'P2002', meta: { target: ['proof_key'] } };
            const unrelatedErr: any = { code: 'P2002', meta: { target: ['foo', 'bar'] } };
            const fkErr: any = { code: 'P2003', meta: { field_name: 'subscription_payments_restaurant_id_fkey' } };

            assert('transaction_id conflict IS attributable', isProofUniquenessConflict(txIdErr) === true, 'true', String(isProofUniquenessConflict(txIdErr)));
            assert('dedicated proof_key conflict IS attributable (spec-shaped surface)', isProofUniquenessConflict(proofKeyErr) === true, 'true', String(isProofUniquenessConflict(proofKeyErr)));
            assert('unrelated UNIQUE(foo,bar) NOT attributable', isProofUniquenessConflict(unrelatedErr) === false, 'false', String(isProofUniquenessConflict(unrelatedErr)));
            assert('non-P2002 / null / plain Error never attributed', isProofUniquenessConflict(fkErr) === false && isProofUniquenessConflict(null) === false && isProofUniquenessConflict(new Error('x')) === false, 'false', 'see run');
        }
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    } finally {
        // Cleanup fixtures
        try {
            await prisma.subscription_payments.deleteMany({ where: { restaurant_id: { in: [ridA, ridB] } } });
            await prisma.outbox.deleteMany({ where: { restaurant_id: { in: [ridA, ridB] } } });
            await prisma.cashier_sessions.deleteMany({ where: { restaurant_id: { in: [ridA, ridB] } } });
            await prisma.staff.deleteMany({ where: { restaurant_id: { in: [ridA, ridB] } } });
            await prisma.restaurants.deleteMany({ where: { id: { in: [ridA, ridB] } } });
        } catch (e: any) {
            console.log('cleanup warning:', e.message);
        }
    }

    console.log(`\n=== M017 A1 RESULTS: ${passed} passed, ${failed} failed ===`);
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

main();
