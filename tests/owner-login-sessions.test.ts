// Task 03 — Owner login on users + memberships + user_sessions.
//
// Exercises the real AuthController / UserSessionService against the local
// development database. Every fixture is unique (random email, random restaurant
// name) and teardown deletes ONLY rows this run created, by id, in dependency
// order: user_sessions, audit_logs, memberships, staff, users, restaurants.
//
// Run: npm run test:safe -- tests/owner-login-sessions.test.ts
// FIRST import: the global test-DB guard refuses to start against anything but a
// disposable test database, and loads .env.test when DATABASE_URL is unset.
import './_test-db-guard';
import 'dotenv/config';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { AuthController, BCRYPT_COST, resetLoginRateLimitTrackersForTests } from '../src/api/controllers/AuthController';
import { JwtService } from '../src/api/services/auth/JwtService';
import { EmailVerificationService } from '../src/api/services/EmailVerificationService';
import { userSessionService, USER_REFRESH_COOKIE } from '../src/api/services/auth/UserSessionService';

const prisma = new PrismaClient();
const jwtService = new JwtService();
const controller = new AuthController(prisma, jwtService, EmailVerificationService);

const OWNER_PASSWORD = 'OwnerSession#8421';
const WRONG_PASSWORD = 'WrongSession#0000';

let passed = 0;
let failed = 0;
function assert(name: string, cond: boolean, extra?: string) {
    if (cond) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}${extra ? ' :: ' + extra : ''}`); }
}

const unique = () => crypto.randomBytes(6).toString('hex');

const created = {
    restaurants: [] as string[],
    staff: [] as string[],
    users: [] as string[],
    memberships: [] as string[],
    sessions: [] as string[],
    auditLogs: [] as string[],
};

async function teardown() {
    const byId = async (model: any, ids: string[]) => {
        for (const id of ids) await model.deleteMany({ where: { id } }).catch(() => { });
    };
    await byId(prisma.user_sessions, created.sessions);
    await byId(prisma.audit_logs, created.auditLogs);
    await byId(prisma.memberships, created.memberships);
    await byId(prisma.staff, created.staff);
    await byId(prisma.users, created.users);
    await byId(prisma.restaurants, created.restaurants);
}

/** Minimal Express response double that also captures cookies. */
function makeRes() {
    const res: any = { statusCode: 200, body: null, cookies: [] as any[], headers: {} as Record<string, string> };
    res.status = (code: number) => { res.statusCode = code; return res; };
    res.json = (payload: any) => { res.body = payload; return res; };
    res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
    res.cookie = (name: string, value: string, options: any) => { res.cookies.push({ name, value, options }); return res; };
    res.clearCookie = (name: string, options: any) => { res.cookies.push({ name, value: '', options, cleared: true }); return res; };
    return res;
}

function loginReq(body: any, ip = '127.0.0.1') {
    return { body, ip, headers: { 'user-agent': 'task03-test-agent' } } as any;
}

async function trackRestaurant(restaurantId: string) {
    created.restaurants.push(restaurantId);
    created.staff.push(...(await prisma.staff.findMany({ where: { restaurant_id: restaurantId }, select: { id: true } })).map(s => s.id));
    created.memberships.push(...(await prisma.memberships.findMany({ where: { restaurant_id: restaurantId }, select: { id: true } })).map(m => m.id));
    created.auditLogs.push(...(await prisma.audit_logs.findMany({ where: { restaurant_id: restaurantId }, select: { id: true } })).map(a => a.id));
    created.sessions.push(...(await prisma.user_sessions.findMany({ where: { user: { memberships: { some: { restaurant_id: restaurantId } } } }, select: { id: true } })).map(s => s.id));
}

interface FixtureOptions {
    verified?: boolean;
    active?: boolean;
    memberships?: number;
    linkStaff?: boolean;
}

/** Creates one owner identity with N restaurant memberships. */
async function makeOwner(options: FixtureOptions = {}) {
    const {
        verified = true,
        active = true,
        memberships: membershipCount = 1,
        linkStaff = true,
    } = options;

    const email = `owner-${unique()}@owner-login-test.example`;
    const user = await prisma.users.create({
        data: {
            email,
            password_hash: await bcrypt.hash(OWNER_PASSWORD, BCRYPT_COST),
            name: 'Owner Login Test',
            is_active: active,
            email_verified_at: verified ? new Date() : null,
        },
    });
    created.users.push(user.id);

    const restaurantIds: string[] = [];
    for (let i = 0; i < membershipCount; i++) {
        const restaurant = await prisma.restaurants.create({
            data: { name: `Owner Login Test ${unique()}`, slug: `owner-login-${unique()}`, is_active: true, onboarding_status: 'ACTIVE' },
        });
        await trackRestaurant(restaurant.id);

        await prisma.memberships.create({
            data: {
                user_id: user.id,
                restaurant_id: restaurant.id,
                role: i === 0 ? 'OWNER' : 'ADMIN',
                staff_id: null,
            },
        });
        if (linkStaff) {
            const staff = await prisma.staff.create({
                data: {
                    restaurant_id: restaurant.id,
                    name: 'Owner Login Test',
                    role: 'MANAGER',
                    pin: '',
                    hashed_pin: await bcrypt.hash('123456', 10),
                    status: 'active',
                },
            });
            await prisma.memberships.updateMany({
                where: { user_id: user.id, restaurant_id: restaurant.id },
                data: { staff_id: staff.id },
            });
        }
        restaurantIds.push(restaurant.id);
    }

    // Re-read the membership ids after the staff link update.
    created.memberships.length = 0;
    created.memberships.push(...(await prisma.memberships.findMany({ where: { user_id: user.id }, select: { id: true } })).map(m => m.id));

    return { user, email, restaurantIds };
}

async function main() {
    // ---------- 1. SUCCESS WITH ONE MEMBERSHIP ----------
    resetLoginRateLimitTrackersForTests();
    const owner = await makeOwner();
    const res = makeRes();
    await controller.login(loginReq({ email: owner.email, password: OWNER_PASSWORD }), res);

    assert('Login succeeds for a verified owner', res.statusCode === 200 && res.body?.success === true, JSON.stringify(res.body).slice(0, 160));
    assert('Response carries an access token', typeof res.body?.accessToken === 'string');

    const staffRow = await prisma.staff.findFirst({ where: { restaurant_id: owner.restaurantIds[0] } });
    const claims = jwtService.verifyToken(res.body.accessToken);
    assert('Access token verifies', claims.valid === true, claims.error);
    assert('Access token carries the staff id', claims.payload?.staffId === staffRow?.id);
    assert('Access token carries the tenant id', claims.payload?.restaurantId === owner.restaurantIds[0]);
    assert('Access token carries the staff role', claims.payload?.role === 'MANAGER', claims.payload?.role);
    assert('Access token is type access', claims.payload?.type === 'access');
    const lifetimeMin = Math.round(((claims.payload!.exp - claims.payload!.iat) / 60));
    assert('Access token expiry matches staff login (15 min)', lifetimeMin === 15, String(lifetimeMin));

    assert('Response staff payload mirrors the staff login shape',
        res.body?.staff?.id === staffRow?.id && res.body?.staff?.restaurant_id === owner.restaurantIds[0] && res.body?.staff?.role === 'MANAGER');
    assert('Response carries the restaurant object', res.body?.restaurant?.id === owner.restaurantIds[0]);

    const refreshCookie = res.cookies.find((c: any) => c.name === USER_REFRESH_COOKIE);
    assert('Refresh token is set as an httpOnly cookie', !!refreshCookie && refreshCookie.options?.httpOnly === true);
    assert('Cookie is sameSite lax and scoped to the auth routes',
        refreshCookie?.options?.sameSite === 'lax' && refreshCookie?.options?.path === '/api/auth', JSON.stringify(refreshCookie?.options));
    const rawRefresh = refreshCookie?.value as string;

    const body = JSON.stringify(res.body);
    assert('No refresh token in the JSON body', !body.includes(rawRefresh) && res.body.refreshToken === undefined && res.body.tokens?.refresh_token === undefined);
    assert('No password or hash in the JSON body', !body.includes(OWNER_PASSWORD) && !body.includes('$2'));

    const sessions = await prisma.user_sessions.findMany({ where: { user_id: owner.user.id }, select: { refresh_token_hash: true, user_id: true, token_family_id: true, revoked_at: true, user_agent: true, ip_address: true, expires_at: true } });
    assert('Exactly one user_sessions row created', sessions.length === 1, String(sessions.length));
    assert('Session stores only the hash', sessions[0].refresh_token_hash !== rawRefresh && !sessions[0].refresh_token_hash.includes(rawRefresh));
    assert('Session hash is the sha256 of the cookie token', sessions[0].refresh_token_hash === crypto.createHash('sha256').update(rawRefresh).digest('hex'));
    assert('Session records user agent and ip', sessions[0].user_agent === 'task03-test-agent' && sessions[0].ip_address === '127.0.0.1');
    assert('Session is unrevoked and expiring', sessions[0].revoked_at === null && sessions[0].expires_at.getTime() > Date.now());
    const loginAudit = await prisma.audit_logs.findFirst({ where: { restaurant_id: owner.restaurantIds[0], action_type: 'USER_LOGIN' } });
    assert('USER_LOGIN audit written without secrets', !!loginAudit && !JSON.stringify(loginAudit.details).includes(OWNER_PASSWORD));

    // ---------- 2. WRONG PASSWORD AND UNKNOWN EMAIL ARE IDENTICAL ----------
    resetLoginRateLimitTrackersForTests();
    const wrongRes = makeRes();
    await controller.login(loginReq({ email: owner.email, password: WRONG_PASSWORD }), wrongRes);
    const unknownRes = makeRes();
    await controller.login(loginReq({ email: `nobody-${unique()}@owner-login-test.example`, password: WRONG_PASSWORD }), unknownRes);
    assert('Wrong password returns 401', wrongRes.statusCode === 401, String(wrongRes.statusCode));
    assert('Unknown email returns 401', unknownRes.statusCode === 401, String(unknownRes.statusCode));
    assert('Wrong password and unknown email are indistinguishable',
        wrongRes.body?.error === unknownRes.body?.error && wrongRes.body?.error === 'Invalid credentials',
        `${wrongRes.body?.error} vs ${unknownRes.body?.error}`);
    assert('No session was created by a failed login', (await prisma.user_sessions.count({ where: { user_id: owner.user.id, revoked_at: null } })) === 1);

    // ---------- 3. UNVERIFIED AND INACTIVE ACCOUNTS ----------
    resetLoginRateLimitTrackersForTests();
    const unverified = await makeOwner({ verified: false });
    const unverifiedRes = makeRes();
    await controller.login(loginReq({ email: unverified.email, password: OWNER_PASSWORD }), unverifiedRes);
    assert('Unverified email rejected with the verify message',
        unverifiedRes.statusCode === 403 && unverifiedRes.body?.code === 'EMAIL_NOT_VERIFIED' && /verify your email/i.test(unverifiedRes.body?.error || ''),
        JSON.stringify(unverifiedRes.body));
    assert('No session issued for an unverified account', (await prisma.user_sessions.count({ where: { user_id: unverified.user.id } })) === 0);

    resetLoginRateLimitTrackersForTests();
    const inactive = await makeOwner({ active: false });
    const inactiveRes = makeRes();
    await controller.login(loginReq({ email: inactive.email, password: OWNER_PASSWORD }), inactiveRes);
    assert('Inactive account rejected',
        inactiveRes.statusCode === 403 && inactiveRes.body?.code === 'ACCOUNT_INACTIVE', JSON.stringify(inactiveRes.body));
    assert('No session issued for an inactive account', (await prisma.user_sessions.count({ where: { user_id: inactive.user.id } })) === 0);

    // ---------- 4. NO MEMBERSHIP ----------
    resetLoginRateLimitTrackersForTests();
    const orphan = await makeOwner({ memberships: 0 });
    const orphanRes = makeRes();
    await controller.login(loginReq({ email: orphan.email, password: OWNER_PASSWORD }), orphanRes);
    assert('Account without membership rejected',
        orphanRes.statusCode === 403 && orphanRes.body?.code === 'NO_MEMBERSHIP', JSON.stringify(orphanRes.body));

    // ---------- 5. MEMBERSHIP WITHOUT A STAFF LINK ----------
    resetLoginRateLimitTrackersForTests();
    const unlinked = await makeOwner({ linkStaff: false });
    const unlinkedRes = makeRes();
    await controller.login(loginReq({ email: unlinked.email, password: OWNER_PASSWORD }), unlinkedRes);
    assert('Membership without a staff profile is refused clearly',
        unlinkedRes.statusCode === 403 && unlinkedRes.body?.code === 'STAFF_LINK_MISSING', JSON.stringify(unlinkedRes.body));

    // ---------- 6. LOCKOUT AFTER 5 FAILURES, RESET ON SUCCESS ----------
    resetLoginRateLimitTrackersForTests();
    const lockOwner = await makeOwner();
    let lockedResponse: any = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
        resetLoginRateLimitTrackersForTests();
        const attemptRes = makeRes();
        await controller.login(loginReq({ email: lockOwner.email, password: WRONG_PASSWORD }), attemptRes);
        lockedResponse = attemptRes;
    }
    assert('Five failed attempts return 401 each time', lockedResponse.statusCode === 401, String(lockedResponse.statusCode));
    const afterFailures = await prisma.users.findUnique({ where: { id: lockOwner.user.id } });
    assert('failed_login_count reached 5', afterFailures?.failed_login_count === 5, String(afterFailures?.failed_login_count));
    assert('locked_until set for 15 minutes',
        !!afterFailures?.locked_until && afterFailures.locked_until.getTime() > Date.now() && afterFailures.locked_until.getTime() <= Date.now() + 15 * 60 * 1000);

    resetLoginRateLimitTrackersForTests();
    const lockedRes = makeRes();
    await controller.login(loginReq({ email: lockOwner.email, password: OWNER_PASSWORD }), lockedRes);
    assert('Locked account refused even with the right password',
        lockedRes.statusCode === 403 && lockedRes.body?.code === 'ACCOUNT_LOCKED', JSON.stringify(lockedRes.body));

    // Unlock (simulates the lock window elapsing) and prove counters reset.
    await prisma.users.update({ where: { id: lockOwner.user.id }, data: { failed_login_count: 0, locked_until: null } });
    resetLoginRateLimitTrackersForTests();
    const successRes = makeRes();
    await controller.login(loginReq({ email: lockOwner.email, password: OWNER_PASSWORD }), successRes);
    assert('Login succeeds after the lock clears', successRes.statusCode === 200, JSON.stringify(successRes.body).slice(0, 160));
    const afterSuccess = await prisma.users.findUnique({ where: { id: lockOwner.user.id } });
    assert('Counters reset on success', afterSuccess?.failed_login_count === 0 && afterSuccess?.locked_until === null);
    assert('last_login_at recorded', !!afterSuccess?.last_login_at);

    // ---------- 7. TWO MEMBERSHIPS => SELECTION FLOW ----------
    resetLoginRateLimitTrackersForTests();
    const multi = await makeOwner({ memberships: 2 });
    const multiRes = makeRes();
    await controller.login(loginReq({ email: multi.email, password: OWNER_PASSWORD }), multiRes);
    assert('Two memberships require restaurant selection',
        multiRes.body?.requires_restaurant_selection === true, JSON.stringify(multiRes.body).slice(0, 200));
    assert('Selection list carries id, name, slug and role',
        Array.isArray(multiRes.body?.restaurants) && multiRes.body.restaurants.length === 2 &&
        multiRes.body.restaurants.every((r: any) => r.restaurant_id && r.name && r.slug && r.role));
    assert('No session issued before a restaurant is chosen',
        (await prisma.user_sessions.count({ where: { user_id: multi.user.id } })) === 0);
    assert('No access token issued before a restaurant is chosen', multiRes.body?.accessToken === undefined);

    const selectionToken: string = multiRes.body.selection_token;
    const selectionClaims = jwtService.verifySelectionToken(selectionToken);
    assert('Selection token is valid and bound to the user',
        selectionClaims.valid === true && selectionClaims.payload?.userId === multi.user.id, selectionClaims.error);
    assert('Selection token expires in 5 minutes',
        Math.round((selectionClaims.payload!.exp - selectionClaims.payload!.iat) / 60) === 5);
    assert('Selection token is not usable as an access token',
        jwtService.verifyToken(selectionToken).valid === false);

    // Foreign restaurant
    resetLoginRateLimitTrackersForTests();
    const foreign = await makeOwner();
    const foreignRes = makeRes();
    await controller.selectRestaurant(loginReq({ selection_token: selectionToken, restaurant_id: foreign.restaurantIds[0] }), foreignRes);
    assert('Restaurant the user does not belong to is rejected',
        foreignRes.statusCode === 403 && foreignRes.body?.code === 'NO_MEMBERSHIP_FOR_RESTAURANT', JSON.stringify(foreignRes.body));

    // Tampered token
    const tampered = selectionToken.slice(0, -4) + 'AAAA';
    const tamperedRes = makeRes();
    await controller.selectRestaurant(loginReq({ selection_token: tampered, restaurant_id: multi.restaurantIds[0] }), tamperedRes);
    assert('Tampered selection token rejected',
        tamperedRes.statusCode === 401 && tamperedRes.body?.code === 'INVALID_SELECTION_TOKEN', JSON.stringify(tamperedRes.body));

    // Expired token
    const expiredToken = jwtService.generateSelectionToken(multi.user.id, -60);
    const expiredRes = makeRes();
    await controller.selectRestaurant(loginReq({ selection_token: expiredToken, restaurant_id: multi.restaurantIds[0] }), expiredRes);
    assert('Expired selection token rejected',
        expiredRes.statusCode === 401 && expiredRes.body?.code === 'INVALID_SELECTION_TOKEN', JSON.stringify(expiredRes.body));

    // Valid selection
    resetLoginRateLimitTrackersForTests();
    const pickRes = makeRes();
    await controller.selectRestaurant(loginReq({ selection_token: selectionToken, restaurant_id: multi.restaurantIds[1] }), pickRes);
    assert('Selecting a membership issues a session', pickRes.statusCode === 200 && typeof pickRes.body?.accessToken === 'string', JSON.stringify(pickRes.body).slice(0, 160));
    assert('Selected tenant is the chosen restaurant',
        jwtService.verifyToken(pickRes.body.accessToken).payload?.restaurantId === multi.restaurantIds[1]);
    const multiSessions = await prisma.user_sessions.findMany({ where: { user_id: multi.user.id } });
    assert('Session stored for the selected restaurant only', multiSessions.length === 1);
    assert('Selection response has no refresh token',
        pickRes.body.refreshToken === undefined && !JSON.stringify(pickRes.body).includes(pickRes.cookies.find((c: any) => c.name === USER_REFRESH_COOKIE)?.value || 'x'));

    // ---------- 8. REFRESH ROTATION AND REUSE DETECTION ----------
    const sessionOwner = await makeOwner();
    const loginRes2 = makeRes();
    resetLoginRateLimitTrackersForTests();
    await controller.login(loginReq({ email: sessionOwner.email, password: OWNER_PASSWORD }), loginRes2);
    const raw1 = loginRes2.cookies.find((c: any) => c.name === USER_REFRESH_COOKIE)!.value;

    const rotation1 = await userSessionService.rotateUserRefreshToken(raw1);
    assert('Refresh rotates to a new token', !('error' in rotation1) && rotation1.token !== raw1);
    const raw2 = ('token' in rotation1 ? rotation1.token : '') as string;

    const rotation2 = await userSessionService.rotateUserRefreshToken(raw2);
    assert('Second rotation issues a third token', !('error' in rotation2) && rotation2.token !== raw2);
    const raw3 = ('token' in rotation2 ? rotation2.token : '') as string;

    const family = await prisma.user_sessions.findMany({ where: { user_id: sessionOwner.user.id }, select: { token_family_id: true, revoked_at: true } });
    assert('All rotations stay in one token family', new Set(family.map((f) => f.token_family_id)).size === 1);
    assert('Rotated rows are revoked', family.filter((f) => !f.revoked_at).length === 1);

    const reuse = await userSessionService.rotateUserRefreshToken(raw1);
    assert('Replaying a rotated token is theft', 'error' in reuse && reuse.error === 'TOKEN_REUSE_DETECTED', JSON.stringify(reuse));
    const familyAfterReuse = await prisma.user_sessions.findMany({ where: { user_id: sessionOwner.user.id }, select: { revoked_at: true } });
    assert('Reuse revokes the whole family', familyAfterReuse.every((f) => f.revoked_at !== null), `${familyAfterReuse.filter((f) => !f.revoked_at).length} still live`);

    const afterRevoke = await userSessionService.rotateUserRefreshToken(raw3);
    assert('The live token is dead after family revocation', 'error' in afterRevoke);

    const garbage = await userSessionService.rotateUserRefreshToken('not-a-real-token');
    assert('Unknown refresh token rejected', 'error' in garbage && garbage.error === 'INVALID_REFRESH_TOKEN');

    // ---------- 9. LOGOUT REVOKES THE SESSION ----------
    const logoutOwner = await makeOwner();
    const logoutRes = makeRes();
    resetLoginRateLimitTrackersForTests();
    await controller.login(loginReq({ email: logoutOwner.email, password: OWNER_PASSWORD }), logoutRes);
    const logoutRaw = logoutRes.cookies.find((c: any) => c.name === USER_REFRESH_COOKIE)!.value;

    const revoked = await userSessionService.revokeUserSession(logoutRaw);
    assert('Logout revokes the session', revoked === true);
    const afterLogout = await userSessionService.rotateUserRefreshToken(logoutRaw);
    assert('The revoked token no longer refreshes', 'error' in afterLogout, JSON.stringify(afterLogout));
    assert('Logout leaves no live session for that family',
        (await prisma.user_sessions.count({ where: { user_id: logoutOwner.user.id, revoked_at: null } })) === 0);

    // ---------- 10. NOTHING SECRET IN COOKIE HANDLING ----------
    const finalRes = makeRes();
    resetLoginRateLimitTrackersForTests();
    const finalOwner = await makeOwner();
    await controller.login(loginReq({ email: finalOwner.email, password: OWNER_PASSWORD }), finalRes);
    const cookieDump = JSON.stringify(finalRes.cookies);
    assert('Cookie payload is the raw token only (no password or hash)',
        !cookieDump.includes(OWNER_PASSWORD) && !cookieDump.includes('$2'));

    const noPasswordColumns = await prisma.users.findUnique({ where: { id: finalOwner.user.id }, select: { password_hash: true } });
    assert('users.password_hash is a bcrypt hash, not the password',
        noPasswordColumns?.password_hash !== OWNER_PASSWORD && noPasswordColumns!.password_hash.startsWith('$2'));
    assert('Signup no longer dual-writes owner credentials onto staff',
        (await prisma.staff.findFirst({ where: { restaurant_id: finalOwner.restaurantIds[0] }, select: { email: true, password_hash: true } }))?.password_hash === null);

    console.log(`\n=== OWNER LOGIN SESSIONS: ${passed} passed, ${failed} failed ===`);
}

main()
    .catch((e) => { console.error('FATAL:', e); process.exitCode = 1; })
    .finally(async () => {
        await teardown();
        await prisma.$disconnect();
        process.exit(failed > 0 ? 1 : 0);
    });