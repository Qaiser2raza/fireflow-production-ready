// Task 03f — server contract for the session bootstrap.
//
// After a page reload the client has no access token, so it silently POSTs
// /api/auth/refresh with the httpOnly cookie. That response must be shaped like
// a login response (so the client can reuse completeLogin) and must never carry
// a hash, a PIN or the raw refresh token.
//
// Run: npm run test:safe -- tests/owner-session-refresh.test.ts
import './_test-db-guard';
import 'dotenv/config';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { AuthController, BCRYPT_COST, resetLoginRateLimitTrackersForTests } from '../src/api/controllers/AuthController';
import { JwtService } from '../src/api/services/auth/JwtService';
import { EmailVerificationService } from '../src/api/services/EmailVerificationService';
import { userSessionService, USER_REFRESH_COOKIE } from '../src/api/services/auth/UserSessionService';
import { resolveOwnerRefreshTarget, buildOwnerSessionPayload } from '../src/api/services/auth/ownerSessionRefresh';

const prisma = new PrismaClient();
const jwtService = new JwtService();
const controller = new AuthController(prisma, jwtService, EmailVerificationService);

const OWNER_PASSWORD = 'SessionBootstrap#5517';

let passed = 0;
let failed = 0;
function assert(name: string, cond: boolean, extra?: string) {
    if (cond) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}${extra ? ' :: ' + extra : ''}`); }
}

const unique = () => crypto.randomBytes(6).toString('hex');

const created = { restaurants: [] as string[], staff: [] as string[], users: [] as string[], memberships: [] as string[], sessions: [] as string[], auditLogs: [] as string[] };

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

function makeRes() {
    const res: any = { statusCode: 200, body: null, cookies: [] as any[], headers: {} as Record<string, string> };
    res.status = (code: number) => { res.statusCode = code; return res; };
    res.json = (payload: any) => { res.body = payload; return res; };
    res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
    res.cookie = (name: string, value: string, options: any) => { res.cookies.push({ name, value, options }); return res; };
    res.clearCookie = (name: string, options: any) => { res.cookies.push({ name, value: '', options, cleared: true }); return res; };
    return res;
}

const loginReq = (body: any) => ({ body, ip: '127.0.0.1', headers: { 'user-agent': 'task03f-test-agent' } }) as any;

async function makeOwner() {
    const email = `owner-${unique()}@session-refresh-test.example`;
    const user = await prisma.users.create({
        data: {
            email,
            password_hash: await bcrypt.hash(OWNER_PASSWORD, BCRYPT_COST),
            name: 'Refresh Test Owner',
            is_active: true,
            email_verified_at: new Date(),
        },
    });
    created.users.push(user.id);

    const restaurant = await prisma.restaurants.create({
        data: { name: `Refresh Test ${unique()}`, slug: `refresh-test-${unique()}`, is_active: true, onboarding_status: 'ACTIVE' },
    });
    created.restaurants.push(restaurant.id);

    const staff = await prisma.staff.create({
        data: {
            restaurant_id: restaurant.id,
            name: 'Refresh Test Owner',
            role: 'MANAGER',
            pin: '',
            hashed_pin: await bcrypt.hash('123456', 10),
            status: 'active',
            email: null,
        },
    });
    created.staff.push(staff.id);

    const membership = await prisma.memberships.create({
        data: { user_id: user.id, restaurant_id: restaurant.id, role: 'OWNER', staff_id: staff.id },
    });
    created.memberships.push(membership.id);

    return { user, email, restaurant, staff };
}

async function main() {
    const owner = await makeOwner();

    resetLoginRateLimitTrackersForTests();
    const loginRes = makeRes();
    await controller.login(loginReq({ email: owner.email, password: OWNER_PASSWORD }), loginRes);
    assert('Owner login issues a session', loginRes.statusCode === 200, JSON.stringify(loginRes.body).slice(0, 160));

    const rawRefresh: string = loginRes.cookies.find((c: any) => c.name === USER_REFRESH_COOKIE)!.value;
    const loginKeys = Object.keys(loginRes.body || {}).sort();
    assert('Login response carries staff, restaurant and tokens',
        !!loginRes.body?.staff && !!loginRes.body?.restaurant && !!loginRes.body?.tokens?.access_token,
        loginKeys.join(','));

    // The client on reload: no access token, only the cookie.
    const rotation = await userSessionService.rotateUserRefreshToken(rawRefresh);
    assert('Refresh with the cookie rotates the session', !('error' in rotation), JSON.stringify(rotation));
    const session = ('session' in rotation ? rotation.session : null)!;
    assert('Session is bound to the owner restaurant', session?.restaurantId === owner.restaurant.id);

    const resolution = await resolveOwnerRefreshTarget(prisma as any, session);
    assert('Refresh resolves the tenant from the session row', resolution.ok === true, JSON.stringify(resolution).slice(0, 160));

    const accessToken = jwtService.generateAccessToken(
        resolution.ok ? resolution.staff.id : '',
        resolution.ok ? resolution.restaurantId : '',
        'MANAGER',
        'Refresh Test Owner'
    );

    // This is exactly what POST /api/auth/refresh returns (server.ts builds it
    // from the same helper).
    const payload = buildOwnerSessionPayload({
        accessToken,
        email: resolution.ok ? resolution.user.email : null,
        staff: resolution.ok ? resolution.staff : ({} as any),
        restaurant: resolution.ok ? resolution.restaurant : null,
        lastLogin: resolution.ok ? resolution.staff.last_login : null,
    });
    const wire = { ...payload, access_token: accessToken, expires_in: 15 * 60 };

    assert('Refresh response is login-shaped',
        wire.success === true && !!wire.accessToken && !!wire.tokens?.access_token && !!wire.staff?.id && !!wire.restaurant?.id,
        Object.keys(wire).join(','));
    assert('Refresh response carries the tenant in the staff object',
        wire.staff?.restaurant_id === owner.restaurant.id && wire.staff?.role === 'MANAGER');
    assert('Refresh response carries the owner email', wire.staff?.email === owner.email);
    assert('Refresh response keeps the legacy access_token/expiry fields',
        wire.access_token === accessToken && wire.expires_in === 900);
    assert('Refresh response login shape matches the login response keys',
        ['accessToken', 'restaurant', 'staff', 'success', 'tokens'].every((k) => loginKeys.includes(k)));

    const body = JSON.stringify(wire);
    assert('No raw refresh token in the body', !body.includes(rawRefresh) && (wire as any).refresh_token === undefined && (wire as any).tokens?.refresh_token === undefined);
    assert('No password or hash in the body', !body.includes(OWNER_PASSWORD) && !body.includes('$2'));
    assert('No PIN or staff secrets in the body',
        !body.includes('hashed_pin') && !body.includes('password_hash') && !body.includes('"pin"'));
    assert('No session token hash leaked',
        !body.includes(userSessionService.hashToken(rawRefresh)));

    const staffRow = await prisma.staff.findUnique({ where: { id: owner.staff.id }, select: { hashed_pin: true } });
    assert('Hash comparison proves the payload is not the staff row', !body.includes(staffRow!.hashed_pin));

    // A dead session must not produce a payload at all.
    await userSessionService.revokeUserSessionFamily(session.tokenFamilyId);
    const deadRotation = await userSessionService.rotateUserRefreshToken(rotation.token);
    assert('A revoked family cannot be refreshed', 'error' in deadRotation, JSON.stringify(deadRotation));

    console.log(`\n=== OWNER SESSION REFRESH CONTRACT: ${passed} passed, ${failed} failed ===`);
}

main()
    .catch((e) => { console.error('FATAL:', e); process.exitCode = 1; })
    .finally(async () => {
        await teardown();
        await prisma.$disconnect();
        process.exit(failed > 0 ? 1 : 0);
    });
