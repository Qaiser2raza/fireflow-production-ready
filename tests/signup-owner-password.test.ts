// Task 02 — Signup owner password, users + memberships, email verification.
//
// Self-contained regression suite. Runs against the local development database
// and touches ONLY rows it created itself: every fixture uses a unique random
// email and restaurant name, and teardown deletes by recorded id in dependency
// order (memberships, tokens, invites, staff, users, restaurant).
//
// Run: npx tsx tests/signup-owner-password.test.ts
import 'dotenv/config';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { restaurantProvisioningService, RestaurantProvisioningService, DUPLICATE_OWNER_EMAIL_CODE } from '../src/api/services/onboarding/RestaurantProvisioningService';
import { AuthController, BCRYPT_COST } from '../src/api/controllers/AuthController';
import { EmailVerificationService } from '../src/api/services/EmailVerificationService';
import { JwtService } from '../src/api/services/auth/JwtService';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
function assert(name: string, cond: boolean, extra?: string) {
    if (cond) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}${extra ? ' :: ' + extra : ''}`); }
}

/** Ids created by this run, deleted by id in teardown. Nothing else. */
const created = {
    restaurants: [] as string[],
    staff: [] as string[],
    users: [] as string[],
    memberships: [] as string[],
    invites: [] as string[],
    tokens: [] as string[],
    outbox: [] as string[],
    auditLogs: [] as string[],
    sections: [] as string[],
    tables: [] as string[],
    orderTypeDefaults: [] as string[],
    chartOfAccounts: [] as string[],
};

const unique = () => crypto.randomBytes(6).toString('hex');

const STRONG_PASSWORD = 'BistroOwner#4711';

/** Minimal Express-like response double capturing status and body. */
function makeRes() {
    const res: any = {
        statusCode: 200,
        body: null as any,
        headers: {} as Record<string, string>,
    };
    res.status = (code: number) => { res.statusCode = code; return res; };
    res.json = (payload: any) => { res.body = payload; return res; };
    res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
    res.type = () => res;
    res.send = (payload: any) => { res.body = payload; return res; };
    return res;
}

/** Tracks every row a successful provisioning creates so teardown can remove it. */
async function trackProvisioning(result: any) {
    const restaurantId = result.restaurant.id;
    created.restaurants.push(restaurantId);
    created.staff.push(result.ownerStaff.id);
    created.invites.push(result.ownerInviteId);
    created.sections.push(...(await prisma.sections.findMany({ where: { restaurant_id: restaurantId }, select: { id: true } })).map(s => s.id));
    created.tables.push(...(await prisma.tables.findMany({ where: { restaurant_id: restaurantId }, select: { id: true } })).map(t => t.id));
    created.orderTypeDefaults.push(...(await prisma.order_type_defaults.findMany({ where: { restaurant_id: restaurantId }, select: { id: true } })).map(o => o.id));
    created.chartOfAccounts.push(...(await prisma.chart_of_accounts.findMany({ where: { restaurant_id: restaurantId }, select: { id: true } })).map(c => c.id));
    created.outbox.push(...(await prisma.outbox.findMany({ where: { restaurant_id: restaurantId }, select: { id: true } })).map(o => o.id));
    created.auditLogs.push(...(await prisma.audit_logs.findMany({ where: { restaurant_id: restaurantId }, select: { id: true } })).map(a => a.id));
    created.memberships.push(...(await prisma.memberships.findMany({ where: { restaurant_id: restaurantId }, select: { id: true } })).map(m => m.id));
    created.users.push(...(await prisma.users.findMany({ where: { email: { equals: String(result.verificationEmail || ''), mode: 'insensitive' } }, select: { id: true } })).map(u => u.id));
    created.tokens.push(...(await prisma.email_verification_tokens.findMany({ where: { restaurant_id: restaurantId }, select: { id: true } })).map(t => t.id));
}

async function teardown() {
    const byId = async (model: any, ids: string[]) => {
        for (const id of ids) {
            await model.deleteMany({ where: { id } }).catch(() => { });
        }
    };
    await byId(prisma.memberships, created.memberships);
    await byId(prisma.email_verification_tokens, created.tokens);
    await byId(prisma.owner_invites, created.invites);
    await byId(prisma.outbox, created.outbox);
    await byId(prisma.audit_logs, created.auditLogs);
    await byId(prisma.order_type_defaults, created.orderTypeDefaults);
    await byId(prisma.chart_of_accounts, created.chartOfAccounts);
    await byId(prisma.tables, created.tables);
    await byId(prisma.sections, created.sections);
    await byId(prisma.staff, created.staff);
    await byId(prisma.users, created.users);
    await byId(prisma.restaurants, created.restaurants);
}

async function provision(overrides: Partial<{
    name: string;
    ownerName: string;
    ownerEmail: string;
    ownerPassword: string;
}>) {
    const ownerEmail = overrides.ownerEmail ?? `owner-${unique()}@signup-test.example`;
    const result = await restaurantProvisioningService.provisionRestaurant({
        name: overrides.name ?? `Signup Test ${unique()}`,
        ownerName: overrides.ownerName ?? 'Signup Test Owner',
        ownerEmail,
        ownerPassword: overrides.ownerPassword ?? STRONG_PASSWORD,
    });
    (result as any).verificationEmail = ownerEmail.toLowerCase();
    if (result.success) await trackProvisioning(result);
    return result;
}

async function main() {
    // ---------- 1. WEAK / INVALID PASSWORDS REJECTED ----------
    const weak = await provision({ ownerPassword: 'Short#1' });
    assert('Short password rejected', weak.success === false, JSON.stringify(weak.error));
    assert('Short password error is explicit', /at least 10 characters/i.test(weak.error || ''), weak.error);

    const noPasswordEmail = `owner-${unique()}@signup-test.example`;
    const missing = await restaurantProvisioningService.provisionRestaurant({
        name: `Signup Test ${unique()}`,
        ownerName: 'No Password Owner',
        ownerEmail: noPasswordEmail,
    });
    (missing as any).verificationEmail = noPasswordEmail;
    if (missing.success) await trackProvisioning(missing);
    assert('PIN-only provisioning (no password) still succeeds', missing.success === true, missing.error);
    assert('PIN-only provisioning creates no users row',
        (await prisma.users.findUnique({ where: { email: noPasswordEmail } })) === null);

    const emailAsPassword = `Owner-${unique()}@signup-test.example`;
    const sameAsEmail = await provision({ ownerEmail: emailAsPassword, ownerPassword: emailAsPassword });
    assert('Password equal to email rejected', sameAsEmail.success === false, JSON.stringify(sameAsEmail.error));

    assert('validateOwnerPassword rejects < 10 chars', RestaurantProvisioningService.validateOwnerPassword('Ab1!efgh', 'a@b.com') !== null);
    assert('validateOwnerPassword rejects blank', RestaurantProvisioningService.validateOwnerPassword('', 'a@b.com') !== null);
    assert('validateOwnerPassword accepts strong', RestaurantProvisioningService.validateOwnerPassword(STRONG_PASSWORD, 'a@b.com') === null);

    // ---------- 2. SUCCESSFUL SIGNUP ----------
    const ok = await provision({});
    assert('Signup succeeded', ok.success === true, ok.error);

    const restaurantId: string = ok.restaurant.id;
    const email = String((ok as any).verificationEmail);

    const user = await prisma.users.findUnique({ where: { email } });
    const staff = await prisma.staff.findUnique({ where: { id: ok.ownerStaff.id } });
    const membership = await prisma.memberships.findFirst({ where: { user_id: user?.id, restaurant_id: restaurantId } });

    assert('users row created', !!user, 'no users row');
    assert('users.email lowercased and trimmed', user?.email === email.toLowerCase().trim(), user?.email);
    assert('users.email_verified_at starts NULL', user?.email_verified_at === null, String(user?.email_verified_at));
    assert('users.is_active true', user?.is_active === true);
    assert('membership created with role OWNER', membership?.role === 'OWNER', membership?.role);
    assert('membership linked to the owner staff row', membership?.staff_id === ok.ownerStaff.id, membership?.staff_id);
    assert('owner staff belongs to the new restaurant', staff?.restaurant_id === restaurantId);

    // TEMP dual-write (removed in Task 03)
    assert('TEMP staff.email dual-written', staff?.email === email.toLowerCase(), staff?.email || 'null');
    assert('TEMP staff.password_hash dual-written', !!staff?.password_hash);
    assert('TEMP staff starts unverified', staff?.is_email_verified === false, String(staff?.is_email_verified));

    // ---------- 3. HASHING, NOT PLAINTEXT ----------
    assert('users.password_hash is bcrypt at the shared cost', !!user?.password_hash && user.password_hash.startsWith('$2') && user.password_hash !== STRONG_PASSWORD);
    assert('staff.password_hash matches the users hash (same dual-write)', staff?.password_hash === user?.password_hash);
    assert('bcrypt compare succeeds for the chosen password', !!user?.password_hash && await bcrypt.compare(STRONG_PASSWORD, user.password_hash));
    assert('bcrypt cost constant shared with AuthController', BCRYPT_COST === 14, String(BCRYPT_COST));
    const costOf = (hash: string) => Number(hash.split('$')[2]);
    assert('hash uses the shared cost', !!user?.password_hash && costOf(user.password_hash) === BCRYPT_COST, user?.password_hash ? String(costOf(user.password_hash)) : 'none');

    // ---------- 4. NO SECRET IN ANY RESULT/PAYLOAD ----------
    const serializedResult = JSON.stringify({ restaurant: ok.restaurant, ownerStaff: ok.ownerStaff, ownerInviteId: ok.ownerInviteId });
    assert('Result carries no plaintext password', !serializedResult.includes(STRONG_PASSWORD));
    assert('Result carries no password_hash', !serializedResult.includes('password_hash') && !serializedResult.includes('hashed_pin'));
    const artifacts = await prisma.email_verification_tokens.findMany({ where: { restaurant_id: restaurantId } });
    const blob = JSON.stringify(artifacts) + JSON.stringify(await prisma.outbox.findMany({ where: { restaurant_id: restaurantId } })) +
        JSON.stringify(await prisma.owner_invites.findMany({ where: { restaurant_id: restaurantId } })) +
        JSON.stringify(await prisma.audit_logs.findMany({ where: { restaurant_id: restaurantId } }));
    assert('No password or hash in tokens/outbox/invites/audit', !blob.includes(STRONG_PASSWORD) && !blob.includes('$2'));
    assert('One single-use verification token created', artifacts.length === 1, String(artifacts.length));
    assert('Verification token carries the staff and restaurant ids', artifacts[0]?.staff_id === ok.ownerStaff.id && artifacts[0]?.restaurant_id === restaurantId);
    assert('Verification token is unused and expiring', artifacts[0]?.used === false && new Date(artifacts[0]!.expires_at).getTime() > Date.now());

    // ---------- 5. DUPLICATE EMAIL REJECTED, NO EXTRA ROWS ----------
    const restaurantsBefore = await prisma.restaurants.count();
    const usersBefore = await prisma.users.count();
    const membershipsBefore = await prisma.memberships.count();
    const staffBefore = await prisma.staff.count();

    const duplicate = await restaurantProvisioningService.provisionRestaurant({
        name: `Signup Test ${unique()}`,
        ownerName: 'Impostor Owner',
        ownerEmail: email.toUpperCase(),
        ownerPassword: STRONG_PASSWORD,
    });
    assert('Duplicate email rejected', duplicate.success === false, JSON.stringify(duplicate.error));
    assert('Duplicate rejection is explicit', (duplicate.error || '').includes('Sign in instead'), duplicate.error);
    assert('Duplicate rejection carries the code', duplicate.errorCode === DUPLICATE_OWNER_EMAIL_CODE, duplicate.errorCode);
    assert('Duplicate signup created no restaurant', (await prisma.restaurants.count()) === restaurantsBefore);
    assert('Duplicate signup created no user', (await prisma.users.count()) === usersBefore);
    assert('Duplicate signup created no membership', (await prisma.memberships.count()) === membershipsBefore);
    assert('Duplicate signup created no staff', (await prisma.staff.count()) === staffBefore);

    // ---------- 6. VERIFICATION SETS BOTH FLAGS ----------
    const controller = new AuthController(prisma, new JwtService(), EmailVerificationService);
    const token = artifacts[0].token;

    const verifyRes = makeRes();
    await controller.verifyEmail({ body: { token } } as any, verifyRes as any);
    assert('Verification succeeds', verifyRes.statusCode === 200, JSON.stringify(verifyRes.body));
    assert('Verification response has no token', !JSON.stringify(verifyRes.body || {}).includes(token));

    const userAfter = await prisma.users.findUnique({ where: { email } });
    const staffAfter = await prisma.staff.findUnique({ where: { id: ok.ownerStaff.id } });
    assert('users.email_verified_at set', !!userAfter?.email_verified_at);
    assert('staff.is_email_verified set (TEMP dual-write)', staffAfter?.is_email_verified === true, String(staffAfter?.is_email_verified));

    const replayRes = makeRes();
    await controller.verifyEmail({ body: { token } } as any, replayRes as any);
    assert('Token is single-use', replayRes.statusCode === 400, String(replayRes.statusCode));

    const linkRes = makeRes();
    await controller.verifyEmailLink({ query: {} } as any, linkRes as any);
    assert('Verification link without a token is rejected', linkRes.statusCode === 400, String(linkRes.statusCode));
    assert('Verification link response carries no token', !JSON.stringify(linkRes.body || '').includes(token));

    const linkOkRes = makeRes();
    await controller.verifyEmailLink({ query: { token: 'not-a-real-token' } } as any, linkOkRes as any);
    assert('Unknown verification link token rejected', linkOkRes.statusCode === 400, String(linkOkRes.statusCode));

    const inviteAfter = await prisma.owner_invites.findUnique({ where: { id: ok.ownerInviteId } });
    assert('owner_invite marked VERIFIED', inviteAfter?.state === 'VERIFIED', inviteAfter?.state);

    console.log(`\n=== SIGNUP OWNER PASSWORD: ${passed} passed, ${failed} failed ===`);
}

main()
    .catch((e) => { console.error('FATAL:', e); process.exitCode = 1; })
    .finally(async () => {
        await teardown();
        await prisma.$disconnect();
        process.exit(failed > 0 ? 1 : 0);
    });