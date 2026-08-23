// Phase 1 — Provisioning & Identity slice A regression suite.
// Requires the API server running on :3001 (NODE_ENV=test). Proves:
//  - Vault provisioning (SUPER_ADMIN) happy path: tenant + manager + seeds
//  - exactly-once plaintext PIN: hash-only persistence, PIN absent from every
//    persisted artifact (staff row, outbox payloads, audit details)
//  - must_change_pin + 7-day pin_expires_at flags; issued PIN authenticates
//  - rollback on mid-transaction failure (slug conflict leaves zero residue)
//  - slug validation, missing-field validation
//  - MANAGER rejection from the SUPER_ADMIN-only route
//  - duplicate active-invitation prevention at the DB level
//  - unbound license evaluation returns a well-formed verdict without a tenant row
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
    // ---------- FIXTURES ----------
    const ts = Date.now();
    const rVault = await prisma.restaurants.create({ data: { name: `P1VAULT_${ts}`, slug: `p1-vault-${ts}`, subscription_status: 'active' } });
    const rMgrT = await prisma.restaurants.create({ data: { name: `P1MGR_${ts}`, slug: `p1-mgr-${ts}`, subscription_status: 'active' } });
    const sa = await prisma.staff.create({ data: { restaurant_id: rVault.id, name: 'SuperA', role: 'SUPER_ADMIN', pin: '', hashed_pin: await bcrypt.hash('121212', 10), status: 'active' } });
    const mgr = await prisma.staff.create({ data: { restaurant_id: rMgrT.id, name: 'PlainMgr', role: 'MANAGER', pin: '', hashed_pin: await bcrypt.hash('333444', 10), status: 'active' } });

    const login = async (pin: string, rid: string, name: string) =>
        (await j('POST', '/api/auth/login', { pin, restaurant_id: rid, staff_name: name })).data?.tokens?.access_token as string;
    const superTok = await login('121212', rVault.id, 'SuperA');
    const mgrTok = await login('333444', rMgrT.id, 'PlainMgr');

    const provision = (body: any, tok: string) => j('POST', '/api/super-admin/restaurants/provision', body, tok);
    const ownerEmail = `owner-${ts}@p1test.example`;

    try {
        // ========== 1. HAPPY PATH ==========
        const ok = await provision({
            name: `Phase1 Cafe ${ts}`, slug: `phase1-cafe-${ts}`,
            city: 'Karachi', owner_name: 'Cafe Owner', owner_email: ownerEmail,
            subscription_plan: 'STANDARD', subscription_status: 'trial',
        }, superTok);

        assert('Provision returns 201', ok.status === 201, JSON.stringify(ok.data).slice(0, 200));
        assert('Handover payload contains one-time PIN', typeof ok.data?.ownerStaff?.temporary_pin === 'string' && /^\d{6}$/.test(ok.data.ownerStaff.temporary_pin));
        assert('Handover marks must_change_pin', ok.data?.ownerStaff?.must_change_pin === true);
        assert('Invite id returned', typeof ok.data?.owner_invite_id === 'string');

        const rid: string = ok.data.restaurant.id;
        const tempPin: string = ok.data.ownerStaff.temporary_pin;

        const dbStaff = await prisma.staff.findFirst({ where: { restaurant_id: rid, role: 'MANAGER' } });
        assert('Manager created with hash only (pin sentinel empty)', !!dbStaff && dbStaff.pin === '' && !!dbStaff.hashed_pin);
        assert('must_change_pin persisted', dbStaff?.must_change_pin === true);
        const expDays = dbStaff?.pin_expires_at ? Math.round((dbStaff.pin_expires_at.getTime() - Date.now()) / 86400000) : -1;
        assert('pin_expires_at ≈ 7 days', expDays >= 6 && expDays <= 7, String(expDays));

        const sectionCount = await prisma.sections.count({ where: { restaurant_id: rid } });
        const tableCount = await prisma.tables.count({ where: { restaurant_id: rid } });
        const otdCount = await prisma.order_type_defaults.count({ where: { restaurant_id: rid } });
        const coaCount = await prisma.chart_of_accounts.count({ where: { restaurant_id: rid } });
        assert('Tenant seeds complete (section/table/3 order types/5 CoA)',
            sectionCount === 1 && tableCount === 1 && otdCount === 3 && coaCount === 5,
            `${sectionCount}/${tableCount}/${otdCount}/${coaCount}`);

        // ========== 2. EXACTLY-ONCE SECRET / NO PERSISTED PLAINTEXT ==========
        const invite = await prisma.owner_invites.findUnique({ where: { restaurant_id_email: { restaurant_id: rid, email: ownerEmail } } });
        assert('owner_invites row PENDING', invite?.state === 'INVITE_PENDING');
        const outboxRows = await prisma.outbox.findMany({ where: { restaurant_id: rid } });
        assert('Two outbox events enqueued', outboxRows.length === 2, String(outboxRows.length));
        assert('Outbox event types correct',
            outboxRows.some(o => o.event_type === 'RESTAURANT_CLOUD_REGISTER') &&
            outboxRows.some(o => o.event_type === 'OWNER_INVITE_REQUESTED'));
        const blob = outboxRows.map(o => JSON.stringify(o.payload)).join('|') + '|' + JSON.stringify(invite);
        assert('PIN absent from outbox payloads and invite row', !blob.includes(tempPin));
        assert('No secret fields in outbox payloads', !blob.includes('hashed_pin') && !blob.includes('"pin"'));

        const audits = await prisma.audit_logs.findMany({ where: { restaurant_id: rid, action_type: 'RESTAURANT_PROVISIONED' } });
        assert('Provisioning audit written once without PIN material',
            audits.length === 1 && !JSON.stringify(audits[0].details).includes(tempPin) && !JSON.stringify(audits[0].details).includes('hashed_pin'));

        // Issued PIN authenticates via the real login path (bcrypt compare)
        const relogin = await j('POST', '/api/auth/login', { pin: tempPin, restaurant_id: rid, staff_name: 'Cafe Owner' });
        assert('Issued PIN authenticates through bcrypt path', relogin.status === 200, String(relogin.status));

        // ========== 3. ROLLBACK ON MID-TX FAILURE ==========
        const beforeR = await prisma.restaurants.count();
        const beforeO = await prisma.outbox.count();
        const dupSlug = await provision({
            name: `Dup ${ts}`, slug: `phase1-cafe-${ts}`,
            owner_name: 'X', owner_email: `x-${ts}@p1test.example`,
        }, superTok);
        assert('Duplicate slug rejected 400', dupSlug.status === 400);
        assert('Zero residue after rolled-back provision',
            (await prisma.restaurants.count()) === beforeR &&
            (await prisma.outbox.count()) === beforeO &&
            (await prisma.staff.count({ where: { name: 'X' } })) === 0 &&
            (await prisma.owner_invites.count({ where: { email: `x-${ts}@p1test.example` } })) === 0);

        // ========== 4. VALIDATION ==========
        const badSlug = await provision({ name: 'Bad Slug', slug: 'Invalid_Slug!', owner_name: 'Y', owner_email: `y-${ts}@p1test.example` }, superTok);
        assert('Invalid slug format rejected 400', badSlug.status === 400);
        const missing = await provision({ name: 'Missing Owner' }, superTok);
        assert('Missing owner fields rejected 400', missing.status === 400);

        // ========== 5. ROLE BOUNDARY (D-4) ==========
        const mgrTry = await provision({
            name: `MgrCafe ${ts}`, owner_name: 'Z', owner_email: `z-${ts}@p1test.example`,
        }, mgrTok);
        assert('MANAGER rejected on SUPER_ADMIN-only provisioning', mgrTry.status === 403, String(mgrTry.status));

        // ========== 6. DUPLICATE ACTIVE INVITATION PREVENTION ==========
        let uniqueHeld = false;
        try {
            await prisma.owner_invites.create({ data: { restaurant_id: rid, email: ownerEmail, state: 'INVITE_PENDING' } });
        } catch (e: any) {
            uniqueHeld = e?.code === 'P2002';
        }
        assert('Second active invite for same restaurant+email blocked by DB constraint', uniqueHeld);

        // ========== 7. UNBOUND LICENSE EVALUATION (no tenant binding) ==========
        const { LicenseService } = await import('../src/api/services/licensing/LicenseService');
        const unbound = await LicenseService.evaluateUnboundLicenseStatus();
        assert('Unbound license evaluation returns well-formed verdict',
            ['unlicensed', 'tampered', 'expired', 'active'].includes(unbound.status),
            JSON.stringify(unbound.error || '').slice(0, 120));

    } finally {
        // ---------- CLEANUP ----------
        const ids = [rVault.id, rMgrT.id];
        const provRest = await prisma.restaurants.findMany({ where: { slug: { startsWith: `phase1-cafe-${ts}` } }, select: { id: true } });
        for (const r of [...ids, ...provRest.map(x => x.id)]) {
            await prisma.outbox.deleteMany({ where: { restaurant_id: r } });
            await prisma.owner_invites.deleteMany({ where: { restaurant_id: r } });
            await prisma.audit_logs.deleteMany({ where: { restaurant_id: r } });
            await prisma.refresh_tokens.deleteMany({ where: { staff: { restaurant_id: r } } }).catch(() => { });
            await prisma.cashier_sessions.deleteMany({ where: { restaurant_id: r } }).catch(() => { });
            await prisma.order_type_defaults.deleteMany({ where: { restaurant_id: r } });
            await prisma.chart_of_accounts.deleteMany({ where: { restaurant_id: r } });
            await prisma.tables.deleteMany({ where: { restaurant_id: r } });
            await prisma.sections.deleteMany({ where: { restaurant_id: r } });
            await prisma.staff.deleteMany({ where: { restaurant_id: r } });
            await prisma.restaurants.deleteMany({ where: { id: r } });
        }
    }

    console.log(`\n=== PHASE 1 SLICE A: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(async e => {
    console.error('FATAL:', e);
    process.exit(1);
});
