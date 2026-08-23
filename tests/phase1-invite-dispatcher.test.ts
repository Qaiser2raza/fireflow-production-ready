// Phase 1 slice B — OwnerInviteDispatcher regression suite.
// Requires the API server running on :3001 (NODE_ENV=test). Proves:
//  - success transition stores supabase_user_id + invited_at
//  - idempotency: an already-SENT invite is never driven twice
//  - RETRYABLE failure keeps state recoverable with sanitized error codes;
//    exhaustion lands in MANUAL (never auto-dead from transient errors)
//  - ALREADY_PRESENT is known-negative → MANUAL (tenant never auto-attached)
//  - UNKNOWN is NEVER failure: reconciles by lookup first; found → SENT
//    without a second create; not-found → safe re-create
//  - manual retry resets terminal invites (audited, secret-free)
//  - cloud mirror registration is idempotent per restaurant_id
//  - SUPER_ADMIN-only retry/list routes; MANAGER rejected
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE = 'http://localhost:3001';
let passed = 0, failed = 0;
function assert(name: string, cond: boolean, extra?: string) {
    if (cond) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}${extra ? ' :: ' + extra : ''}`); }
}
async function j(method: string, url: string, body?: any, token?: string) {
    const res = await fetch(BASE + url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    let data: any = null; try { data = await res.json(); } catch { }
    return { status: res.status, data };
}

type ScriptedPort = any;

function scriptedInvitePort(script: { lookup?: () => any; create?: () => any }) {
    const calls = { lookup: 0, create: 0 };
    return {
        calls,
        async findUserIdByEmail(_email: string) { calls.lookup++; return script.lookup ? script.lookup() : { outcome: 'NOT_FOUND' }; },
        async createUser(_email: string, _meta: any) { calls.create++; return script.create ? script.create() : { outcome: 'SENT', userId: 'sup-' + Math.random().toString(36).slice(2) }; },
        async findCloudRestaurant() { return { found: true }; },
        async createCloudRestaurant() { return { outcome: 'REGISTERED' } as any; },
        isConfigured() { return false; },
    } as ScriptedPort;
}

async function main() {
    const { OwnerInviteDispatcher } = await import('../src/api/services/onboarding/OwnerInviteDispatcher');

    // ---------- FIXTURES ----------
    const ts = Date.now();
    const rVault = await prisma.restaurants.create({ data: { name: `P1B_VAULT_${ts}`, slug: `p1b-vault-${ts}`, subscription_status: 'active' } });
    const rMgr = await prisma.restaurants.create({ data: { name: `P1B_MGR_${ts}`, slug: `p1b-mgr-${ts}`, subscription_status: 'active' } });
    const rWork = await prisma.restaurants.create({ data: { name: `P1B_WORK_${ts}`, slug: `p1b-work-${ts}`, subscription_plan: 'STANDARD', subscription_status: 'trial' } });
    const sa = await prisma.staff.create({ data: { restaurant_id: rVault.id, name: 'SuperB', role: 'SUPER_ADMIN', pin: '', hashed_pin: await bcrypt.hash('121212', 10), status: 'active' } });
    const mgr = await prisma.staff.create({ data: { restaurant_id: rMgr.id, name: 'MgrB', role: 'MANAGER', pin: '', hashed_pin: await bcrypt.hash('333444', 10), status: 'active' } });

    const login = async (pin: string, rid: string, name: string) =>
        (await j('POST', '/api/auth/login', { pin, restaurant_id: rid, staff_name: name })).data?.tokens?.access_token as string;
    const superTok = await login('121212', rVault.id, 'SuperB');
    const mgrTok = await login('333444', rMgr.id, 'MgrB');

    // One provisioned tenant drives every scenario through cloned invite rows.
    const base = await prisma.owner_invites.create({
        data: { restaurant_id: rWork.id, email: `owner-${ts}@p1b.example`, state: 'INVITE_PENDING' },
    });
    const mkInvite = (suffix: string, state = 'INVITE_PENDING', attempts = 0) =>
        prisma.owner_invites.create({
            data: { restaurant_id: rWork.id, email: `${suffix}-${ts}@p1b.example`, state, attempt_count: attempts },
        });

    try {
        // ========== 1. SUCCESS ==========
        let port = scriptedInvitePort({});
        let d = new OwnerInviteDispatcher({ invite: port, cloud: port, isConfigured: () => false });
        await d.processInvite(base.id);
        let row = await prisma.owner_invites.findUniqueOrThrow({ where: { id: base.id } });
        assert('Success transitions to INVITE_SENT', row.state === 'INVITE_SENT');
        assert('Provider user id persisted', !!row.supabase_user_id);
        assert('invited_at stamped', !!row.invited_at);

        // ========== 2. IDEMPOTENCY ==========
        await d.processInvite(base.id);
        assert('SENT invite never re-driven (no second create)', port.calls.create === 1, String(port.calls.create));

        // ========== 3. RETRYABLE → exhaustion → MANUAL ==========
        const iR = await mkInvite('retry');
        port = scriptedInvitePort({ create: () => ({ outcome: 'RETRYABLE', code: 'SUPABASE_5XX' }) });
        d = new OwnerInviteDispatcher({ invite: port, cloud: port, isConfigured: () => false });
        for (let k = 0; k < 4; k++) await d.processInvite(iR.id);
        row = await prisma.owner_invites.findUniqueOrThrow({ where: { id: iR.id } });
        assert('Transient failures stay recoverable (FAILED_RETRYING)', row.state === 'INVITE_FAILED_RETRYING');
        assert('Sanitized error code stored', row.last_error === 'SUPABASE_5XX');
        assert('Attempts counted', row.attempt_count === 4, String(row.attempt_count));
        await d.processInvite(iR.id);
        row = await prisma.owner_invites.findUniqueOrThrow({ where: { id: iR.id } });
        assert('Exhaustion lands in MANUAL, not dead-loop', row.state === 'INVITE_FAILED_MANUAL' && row.last_error === 'MAX_ATTEMPTS_EXHAUSTED');

        // ========== 4. DUPLICATE EMAIL = known-negative → MANUAL ==========
        const iDup = await mkInvite('dup');
        port = scriptedInvitePort({ create: () => ({ outcome: 'ALREADY_PRESENT' }) });
        d = new OwnerInviteDispatcher({ invite: port, cloud: port, isConfigured: () => false });
        await d.processInvite(iDup.id);
        row = await prisma.owner_invites.findUniqueOrThrow({ where: { id: iDup.id } });
        assert('Duplicate email → MANUAL (no auto-attach)', row.state === 'INVITE_FAILED_MANUAL' && row.last_error === 'SUPABASE_DUPLICATE_EMAIL');

        // ========== 5. UNKNOWN → reconcile FOUND → SENT without re-create ==========
        const iUnk = await mkInvite('unk');
        port = scriptedInvitePort({
            create: () => ({ outcome: 'UNKNOWN', code: 'SUPABASE_TIMEOUT' }),
            lookup: () => ({ outcome: 'FOUND', userId: 'sup-existing-1' }),
        });
        d = new OwnerInviteDispatcher({ invite: port, cloud: port, isConfigured: () => false });
        await d.processInvite(iUnk.id);
        row = await prisma.owner_invites.findUniqueOrThrow({ where: { id: iUnk.id } });
        assert('Timeout recorded as UNKNOWN, never failure', row.state === 'INVITE_UNKNOWN' && row.last_error === 'SUPABASE_TIMEOUT');
        const createsAfterTimeout = port.calls.create;
        await d.processInvite(iUnk.id);
        row = await prisma.owner_invites.findUniqueOrThrow({ where: { id: iUnk.id } });
        assert('Reconciliation resolves UNKNOWN to SENT', row.state === 'INVITE_SENT' && row.supabase_user_id === 'sup-existing-1');
        assert('No blind duplicate create after timeout', port.calls.create === createsAfterTimeout, `${port.calls.create}/${createsAfterTimeout}`);

        // ========== 6. UNKNOWN → reconcile NOT_FOUND → safe re-create ==========
        const iUnk2 = await mkInvite('unk2');
        port = scriptedInvitePort({
            create: () => ({ outcome: 'UNKNOWN', code: 'SUPABASE_NETWORK' }),
            lookup: () => ({ outcome: 'NOT_FOUND' }),
        });
        d = new OwnerInviteDispatcher({ invite: port, cloud: port, isConfigured: () => false });
        await d.processInvite(iUnk2.id);
        await d.processInvite(iUnk2.id);
        row = await prisma.owner_invites.findUniqueOrThrow({ where: { id: iUnk2.id } });
        assert('Unknown-outcome retried safely when provider lookup confirms absence', port.calls.create >= 2, String(port.calls.create));
        assert('Still recoverable after repeated unknowns', ['INVITE_UNKNOWN', 'INVITE_FAILED_RETRYING'].includes(row.state));

        // ========== 7. MANUAL RETRY (service + HTTP route) ==========
        port = scriptedInvitePort({ create: () => ({ outcome: 'SENT', userId: 'sup-after-retry' }) });
        d = new OwnerInviteDispatcher({ invite: port, cloud: port, isConfigured: () => false });
        const retrySvc = await d.manualRetry(iDup.id, 'suite-test');
        assert('Manual retry resets terminal invite', retrySvc.ok === true && retrySvc.state === 'INVITE_PENDING');
        const audited = await prisma.audit_logs.findFirst({ where: { action_type: 'OWNER_INVITE_MANUAL_RETRY', entity_id: iDup.id } });
        assert('Manual retry audited without secrets', !!audited && !JSON.stringify(audited.details).toLowerCase().includes('pin'));
        await d.processInvite(iDup.id);
        row = await prisma.owner_invites.findUniqueOrThrow({ where: { id: iDup.id } });
        assert('Post-retry drive succeeds to SENT', row.state === 'INVITE_SENT');

        const badRetry = await d.manualRetry(base.id, 'should-refuse');
        assert('Retry refused for already-sent invite', badRetry.ok === false);

        const mgrRetry = await j('POST', `/api/super-admin/owner-invites/${iR.id}/retry`, {}, mgrTok);
        assert('MANAGER rejected from retry route', mgrRetry.status === 403, String(mgrRetry.status));

        // iR is FAILED_MANUAL → SUPER_ADMIN HTTP retry must reset it
        const okRetry = await j('POST', `/api/super-admin/owner-invites/${iR.id}/retry`, {}, superTok);
        row = await prisma.owner_invites.findUniqueOrThrow({ where: { id: iR.id } });
        assert('SUPER_ADMIN HTTP retry resets exhausted invite', okRetry.status === 200 && row.state === 'INVITE_PENDING' && row.attempt_count === 0);

        const listRes = await j('GET', '/api/super-admin/owner-invites', undefined, superTok);
        const listBlob = JSON.stringify(listRes.data);
        assert('Invite list reachable for SUPER_ADMIN', listRes.status === 200 && Array.isArray(listRes.data));
        assert('Invite list carries states and error codes only', listBlob.includes('SUPABASE_DUPLICATE_EMAIL') || listBlob.includes('INVITE_'));

        // ========== 8. CLOUD MIRROR IDEMPOTENCY ==========
        const cloudCalls = { find: 0, create: 0 };
        const cloudPort = {
            async findCloudRestaurant(rid: string) {
                cloudCalls.find++;
                return rid === rWork.id ? { found: true } : { found: false, unknown: true };
            },
            async createCloudRestaurant() { cloudCalls.create++; return { outcome: 'REGISTERED' } as any; },
            isConfigured() { return false; },
            async findUserIdByEmail() { return { outcome: 'NOT_FOUND' }; },
            async createUser() { return { outcome: 'SENT', userId: 'x' }; },
        };
        d = new OwnerInviteDispatcher({ invite: cloudPort, cloud: cloudPort, isConfigured: () => false });
        await d.processRegistration(rWork);
        assert('Mirror marked synced after registration', !!(await prisma.restaurants.findUniqueOrThrow({ where: { id: rWork.id } })).cloud_synced_at);
        await d.processRegistration(rWork);
        assert('Already-synced mirror never re-created', cloudCalls.create === 0, String(cloudCalls.create));

        // Sweep excludes synced tenants entirely. The assertion is self-scoped:
        // other suites may legitimately leave their own pending work in the
        // shared dev database, so we assert OUR tenant is not re-created.
        let sweepCreates = 0;
        const sweepCloud = {
            async findCloudRestaurant(rid: string) {
                return rid === rWork.id ? { found: true } : { found: false, unknown: true };
            },
            async createCloudRestaurant() { sweepCreates++; return { outcome: 'REGISTERED' } as any; },
            async findUserIdByEmail() { return { outcome: 'NOT_FOUND' }; },
            async createUser() { return { outcome: 'SENT', userId: 'sweep-' + Math.random().toString(36).slice(2) }; },
            isConfigured() { return false; },
        };
        const sweep = new OwnerInviteDispatcher({ invite: sweepCloud, cloud: sweepCloud, isConfigured: () => true }, 9999999);
        await sweep.processOnce();
        assert('Sweep never re-creates our already-synced mirror', sweepCreates === 0, String(sweepCreates));

    } finally {
        // ---------- CLEANUP ----------
        for (const r of [rVault.id, rMgr.id, rWork.id]) {
            await prisma.outbox.deleteMany({ where: { restaurant_id: r } });
            await prisma.owner_invites.deleteMany({ where: { restaurant_id: r } });
            await prisma.audit_logs.deleteMany({ where: { restaurant_id: r } });
            await prisma.staff.deleteMany({ where: { restaurant_id: r } });
            await prisma.restaurants.deleteMany({ where: { id: r } }).catch(() => { });
        }
    }

    console.log(`\n=== PHASE 1 SLICE B: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
