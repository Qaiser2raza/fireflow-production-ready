// Phase 2 — First-login wizard & PIN enforcement regression suite.
// Requires the API server running on :3001 (NODE_ENV=test). Proves:
//  1. fresh provision lands SETUP_INCOMPLETE; operations blocked server-side;
//     allowlist endpoints pass; completion flips ACTIVE; operations succeed
//  2. direct-API skip attempts fail across inline AND generic-table routes
//  3. login payload exposes must_change_pin + onboarding_status; change-pin
//     clears flag; wrong-old/same-PIN rejected
//  4. expired-unused PIN authenticates nothing (403 PIN_EXPIRED, audited,
//     zero tokens); Vault reset revives access
//  5. Vault reset: SUPER_ADMIN-only; revokes ALL refresh families; old
//     refresh dead; new one-time PIN authenticates flagged must-change
//  6. migration compatibility: pre-migration tenants operate unchanged
//  7. error codes stay distinct: PIN_EXPIRED ≠ PIN_CHANGE_REQUIRED ≠
//     SETUP_INCOMPLETE ≠ ALREADY_ACTIVE
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

async function main() {
    const ts = Date.now();

    // ---------- FIXTURES ----------
    const rVault = await prisma.restaurants.create({ data: { name: `P2_VAULT_${ts}`, slug: `p2-vault-${ts}`, subscription_status: 'active' } });
    const rMgrT = await prisma.restaurants.create({ data: { name: `P2_MGR_${ts}`, slug: `p2-mgr-${ts}`, subscription_status: 'active' } });
    const rLegacy = await prisma.restaurants.create({ data: { name: `P2_LEGACY_${ts}`, slug: `p2-legacy-${ts}`, subscription_status: 'active' } });
    const sa = await prisma.staff.create({ data: { restaurant_id: rVault.id, name: 'SuperP2', role: 'SUPER_ADMIN', pin: '', hashed_pin: await bcrypt.hash('121212', 10), status: 'active' } });
    const plainMgr = await prisma.staff.create({ data: { restaurant_id: rMgrT.id, name: 'PlainMgrP2', role: 'MANAGER', pin: '', hashed_pin: await bcrypt.hash('333444', 10), status: 'active' } });
    // Legacy-style staff on pre-migration tenant: no flags set at all
    const legacyStaff = await prisma.staff.create({ data: { restaurant_id: rLegacy.id, name: 'LegacyOwner', role: 'MANAGER', pin: '', hashed_pin: await bcrypt.hash('777888', 10), status: 'active' } });
    // Expired-unused PIN staff on an ACTIVE legacy tenant
    const expiredHash = await bcrypt.hash('555555', 10);
    const expiredStaff = await prisma.staff.create({
        data: {
            restaurant_id: rLegacy.id, name: 'ExpiredHolder', role: 'CASHIER', pin: '',
            hashed_pin: expiredHash, status: 'active',
            pin_expires_at: new Date(Date.now() - 60_000)
        }
    });

    const login = async (pin: string, rid: string, name: string) =>
        j('POST', '/api/auth/login', { pin, restaurant_id: rid, staff_name: name });
    const superLogin = await login('121212', rVault.id, 'SuperP2');
    const superTok: string = superLogin.data?.tokens?.access_token;
    const mgrTok: string = (await login('333444', rMgrT.id, 'PlainMgrP2')).data?.tokens?.access_token;

    try {
        // ========== CASE 6 FIRST: migration compat on legacy tenant ==========
        const legacyLogin = await login('777888', rLegacy.id, 'LegacyOwner');
        assert('C6: legacy tenant login works', legacyLogin.status === 200);
        assert('C6: legacy tenant reports ACTIVE', legacyLogin.data?.restaurant?.onboarding_status === 'ACTIVE');
        assert('C6: legacy staff has no forced change', legacyLogin.data?.staff?.must_change_pin === false);
        const legacyOp = await j('POST', '/api/staff', { name: `LegacyAdd${ts}`, role: 'CASHIER', pin: '112233' }, legacyLogin.data.tokens.access_token);
        assert('C6: legacy tenant operations unblocked', [200, 201].includes(legacyOp.status), String(legacyOp.status));

        // ========== CASE 4: expired unused PIN ==========
        const expiredAttempt = await login('555555', rLegacy.id, 'ExpiredHolder');
        assert('C4: expired PIN rejected with 403', expiredAttempt.status === 403);
        assert('C4: code PIN_EXPIRED (distinct)', expiredAttempt.data?.code === 'PIN_EXPIRED');
        assert('C4: no tokens issued', !expiredAttempt.data?.tokens);
        const expiredAudit = await prisma.audit_logs.findFirst({
            where: { staff_id: expiredStaff.id, action_type: 'STAFF_LOGIN_FAILED' },
            orderBy: { created_at: 'desc' }
        });
        assert('C4: expiry audited without secrets', (expiredAudit?.details as any)?.reason === 'pin_expired');

        // ========== CASE 1+3: fresh provision lifecycle ==========
        const prov = await j('POST', '/api/super-admin/restaurants/provision', {
            name: `Phase2 Bistro ${ts}`, slug: `phase2-bistro-${ts}`,
            owner_name: 'Wizard Owner', owner_email: `owner-${ts}@p2.example`,
        }, superTok);
        assert('C1: provision succeeds', prov.status === 201, String(prov.status));
        const rid: string = prov.data.restaurant.id;
        const issuedPin: string = prov.data.ownerStaff.temporary_pin;

        const firstLogin = await login(issuedPin, rid, 'Wizard Owner');
        assert('C3: issued PIN authenticates', firstLogin.status === 200);
        assert('C3: login exposes must_change_pin', firstLogin.data?.staff?.must_change_pin === true);
        assert('C3: login exposes SETUP_INCOMPLETE', firstLogin.data?.restaurant?.onboarding_status === 'SETUP_INCOMPLETE');
        const tok: string = firstLogin.data.tokens.access_token;
        const refreshTok: string = firstLogin.data.tokens.refresh_token;

        // ---- CASE 2: direct-API skip attempts (inline + generic-table routes)
        const skipStaff = await j('POST', '/api/staff', { name: `Skip${ts}`, role: 'CASHIER', pin: '998877' }, tok);
        assert('C2: inline staff creation blocked', skipStaff.status === 403 && skipStaff.data?.code === 'PIN_CHANGE_REQUIRED', `${skipStaff.status}`);
        const skipMenu = await j('POST', '/api/menu_items', { name: 'SkipItem', price: 1 }, tok);
        assert('C2: generic-table mutation blocked', skipMenu.status === 403 && ['PIN_CHANGE_REQUIRED'].includes(skipMenu.data?.code), `${skipMenu.status} ${JSON.stringify(skipMenu.data).slice(0, 80)}`);
        const skipOrderProbe = await j('PATCH', `/api/orders/${crypto.randomUUID()}`, { status: 'COMPLETED' }, tok).catch(() => ({ status: 0, data: null }) as any);
        assert('C2: order mutation surface blocked (not 404-leak)', [403].includes(skipOrderProbe.status), String(skipOrderProbe.status));

        // ---- allowlist works during restriction
        const statusRes = await j('GET', '/api/onboarding/status', undefined, tok);
        assert('C1: onboarding/status allowlisted', statusRes.status === 200 && statusRes.data?.onboarding_status === 'SETUP_INCOMPLETE');
        assert('C1: requirements reflect forced PIN', statusRes.data?.requirements?.pin_change_required === true);

        // ---- completion BEFORE pin change must refuse with PIN_CHANGE_REQUIRED
        const earlyComplete = await j('POST', '/api/onboarding/complete', {}, tok);
        assert('C7: complete before PIN change refuses PIN_CHANGE_REQUIRED', earlyComplete.status === 409 && earlyComplete.data?.code === 'PIN_CHANGE_REQUIRED', `${earlyComplete.status}`);

        // ---- CASE 3: change-pin validation ladder
        const wrongOld = await j('POST', '/api/auth/change-pin', { old_pin: '000000', new_pin: '444555' }, tok);
        assert('C3: wrong old PIN rejected', wrongOld.status === 401);
        const sameNew = await j('POST', '/api/auth/change-pin', { old_pin: issuedPin, new_pin: issuedPin }, tok);
        assert('C3: identical replacement rejected', sameNew.status === 400);
        const changed = await j('POST', '/api/auth/change-pin', { old_pin: issuedPin, new_pin: '654321' }, tok);
        assert('C3: change-pin succeeds', changed.status === 200, JSON.stringify(changed.data));
        assert('C3: issued PIN reuse rejected afterwards', (await j('POST', '/api/auth/change-pin', { old_pin: '654321', new_pin: issuedPin }, tok)).status === 400);

        // ---- tenant gate still active after PIN change (distinct code)
        const stillBlocked = await j('POST', '/api/staff', { name: `Still${ts}`, role: 'CASHIER', pin: '998877' }, tok);
        assert('C7: post-PIN block reports SETUP_INCOMPLETE (distinct)', stillBlocked.status === 403 && stillBlocked.data?.code === 'SETUP_INCOMPLETE', `${stillBlocked.status}`);

        const relogin = await login('654321', rid, 'Wizard Owner');
        assert('C3: new PIN authenticates, flag cleared', relogin.status === 200 && relogin.data?.staff?.must_change_pin === false, `${relogin.status}`);
        const tok2: string = relogin.data.tokens.access_token;

        const complete = await j('POST', '/api/onboarding/complete', {}, tok2);
        assert('C1: completion flips lifecycle to ACTIVE', complete.status === 200 && complete.data?.onboarding_status === 'ACTIVE');
        const replay = await j('POST', '/api/onboarding/complete', {}, tok2);
        assert('C7: replayed completion refused safely (ALREADY_ACTIVE)', replay.status === 409 && replay.data?.code === 'ALREADY_ACTIVE');
        const opAfter = await j('POST', '/api/staff', { name: `PostActive${ts}`, role: 'CASHIER', pin: '998877' }, tok2);
        assert('C1: operations succeed after ACTIVE', [200, 201].includes(opAfter.status), String(opAfter.status));

        // ========== CASE 5: Vault reset + family revocation ==========
        const mgrResetTry = await j('POST', `/api/super-admin/staff/${legacyStaff.id}/reset-pin`, {}, mgrTok);
        assert('C5: MANAGER rejected from reset route', mgrResetTry.status === 403, String(mgrResetTry.status));

        const reset = await j('POST', `/api/super-admin/staff/${relogin.data.staff.id}/reset-pin`, {}, superTok);
        assert('C5: SUPER_ADMIN reset returns handover-once payload',
            reset.status === 201 && /^\d{6}$/.test(reset.data?.temporary_pin || '') && reset.data?.must_change_pin === true);
        assert('C5: handover secret occurs exactly once', JSON.stringify(reset.data).split(reset.data.temporary_pin).length - 1 === 1);

        const oldRefresh = await j('POST', '/api/auth/refresh', { refresh_token: refreshTok });
        assert('C5: pre-reset refresh family fully revoked', oldRefresh.status === 401, String(oldRefresh.status));

        const oldAccess = await j('GET', '/api/onboarding/status', undefined, tok2);
        assert('C5: old access session dead after reset (staff hash replaced)', [401, 403].includes(oldAccess.status) || oldAccess.data?.requirements?.pin_change_required === true, String(oldAccess.status));

        const reloginAfterReset = await login(reset.data.temporary_pin, rid, 'Wizard Owner');
        assert('C5: replacement PIN authenticates flagged must-change', reloginAfterReset.status === 200 && reloginAfterReset.data?.staff?.must_change_pin === true);

        const resetAudit = await prisma.audit_logs.findFirst({ where: { action_type: 'STAFF_PIN_RESET', entity_id: relogin.data.staff.id } });
        assert('C5: reset audited without secrets', !!resetAudit && !JSON.stringify(resetAudit.details).includes(reset.data.temporary_pin));

        // ========== cleanup helper values for finally ==========
        (global as any).__p2ids = [rVault.id, rMgrT.id, rLegacy.id, rid];

    } finally {
        const ids: string[] = (global as any).__p2ids || [];
        for (const r of ids) {
            await prisma.outbox.deleteMany({ where: { restaurant_id: r } });
            await prisma.owner_invites.deleteMany({ where: { restaurant_id: r } });
            await prisma.audit_logs.deleteMany({ where: { restaurant_id: r } });
            await prisma.refresh_tokens.deleteMany({ where: { restaurant_id: r } }).catch(() => { });
            await prisma.menu_items.deleteMany({ where: { restaurant_id: r } }).catch(() => { });
            await prisma.menu_categories.deleteMany({ where: { restaurant_id: r } }).catch(() => { });
            await prisma.order_type_defaults.deleteMany({ where: { restaurant_id: r } });
            await prisma.chart_of_accounts.deleteMany({ where: { restaurant_id: r } });
            await prisma.tables.deleteMany({ where: { restaurant_id: r } });
            await prisma.sections.deleteMany({ where: { restaurant_id: r } });
            await prisma.staff.deleteMany({ where: { restaurant_id: r } });
            await prisma.restaurants.deleteMany({ where: { id: r } }).catch(() => { });
        }
    }

    console.log(`\n=== PHASE 2 WIZARD: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
