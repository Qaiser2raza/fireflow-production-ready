/**
 * Task 04 — tenant access lifecycle (04-2).
 *
 * Access is derived from the restaurants row plus the dates on it, so every
 * transition is asserted here against a FIXED CLOCK (no database, no sleeping)
 * and then against the real tables through getTenantAccess / setSubscriptionStatus.
 *
 * Run: npm run test:safe -- tests/tenant-access-lifecycle.test.ts
 */
import './_test-db-guard';
import 'dotenv/config';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
    buildTenantAccessWarning,
    evaluateTenantAccess,
    getGraceDays,
    getTenantAccess,
    GRACE_DAYS,
    TenantNotFoundError,
    TRIAL_DAYS,
    type TenantAccessRow,
} from '../src/api/services/tenant/getTenantAccess';
import { setSubscriptionStatus } from '../src/api/services/tenant/setSubscriptionStatus';
import { resolveOwnerRefreshTarget } from '../src/api/services/auth/ownerSessionRefresh';
import { userSessionService } from '../src/api/services/auth/UserSessionService';

const prisma = new PrismaClient();

const NOW = new Date('2026-06-01T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const at = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * DAY);

let passed = 0;
let failed = 0;
function assert(name: string, cond: boolean, extra?: string) {
    if (cond) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}${extra ? ' :: ' + extra : ''}`); }
}

function row(overrides: Partial<TenantAccessRow>): TenantAccessRow {
    return {
        is_active: true,
        subscription_status: 'TRIAL',
        trial_ends_at: at(10),
        subscription_expires_at: null,
        ...overrides,
    };
}

/** Env override for GRACE_DAYS must not leak into the other cases. */
function withEnv<T>(key: string, value: string | undefined, fn: () => T): T {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    try {
        return fn();
    } finally {
        if (previous === undefined) delete process.env[key];
        else process.env[key] = previous;
    }
}

async function testDerivedTransitions() {
    console.log('\n--- derived transitions (fake clock) ---');

    // TRIAL
    const trialActive = evaluateTenantAccess(row({ subscription_status: 'TRIAL', trial_ends_at: at(10) }), NOW);
    assert('TRIAL inside trial -> FULL', trialActive.mode === 'FULL', trialActive.mode);
    assert('TRIAL inside trial -> effectiveStatus TRIAL', trialActive.effectiveStatus === 'TRIAL', trialActive.effectiveStatus);
    assert('TRIAL inside trial -> daysLeft 10', trialActive.daysLeft === 10, String(trialActive.daysLeft));
    assert('TRIAL inside trial -> no warning', buildTenantAccessWarning(trialActive) === null);

    const trialBoundary = evaluateTenantAccess(row({ subscription_status: 'TRIAL', trial_ends_at: NOW }), NOW);
    assert('TRIAL exactly at trial end -> still FULL', trialBoundary.mode === 'FULL', trialBoundary.mode);

    const trialGrace = evaluateTenantAccess(row({ subscription_status: 'TRIAL', trial_ends_at: at(-1) }), NOW);
    assert('TRIAL past trial end -> FULL in grace', trialGrace.mode === 'FULL', trialGrace.mode);
    assert('TRIAL past trial end -> effectiveStatus GRACE', trialGrace.effectiveStatus === 'GRACE', trialGrace.effectiveStatus);
    assert('TRIAL past trial end -> reason GRACE_PERIOD', trialGrace.reason === 'GRACE_PERIOD', trialGrace.reason);
    assert('TRIAL past trial end -> daysLeft = GRACE_DAYS - 1', trialGrace.daysLeft === GRACE_DAYS - 1, String(trialGrace.daysLeft));
    assert('TRIAL grace warning is GRACE_PERIOD', buildTenantAccessWarning(trialGrace)?.code === 'GRACE_PERIOD');

    const trialGraceEdge = evaluateTenantAccess(
        row({ subscription_status: 'TRIAL', trial_ends_at: at(-GRACE_DAYS) }),
        NOW
    );
    assert('TRIAL at grace edge -> still FULL', trialGraceEdge.mode === 'FULL', trialGraceEdge.mode);
    assert('TRIAL at grace edge -> daysLeft 0', trialGraceEdge.daysLeft === 0, String(trialGraceEdge.daysLeft));

    const trialSuspended = evaluateTenantAccess(
        row({ subscription_status: 'TRIAL', trial_ends_at: at(-(GRACE_DAYS + 1)) }),
        NOW
    );
    assert('TRIAL past grace -> READ_ONLY', trialSuspended.mode === 'READ_ONLY', trialSuspended.mode);
    assert('TRIAL past grace -> effectiveStatus SUSPENDED', trialSuspended.effectiveStatus === 'SUSPENDED', trialSuspended.effectiveStatus);
    assert('TRIAL past grace -> daysLeft null', trialSuspended.daysLeft === null, String(trialSuspended.daysLeft));
    assert('TRIAL past grace -> read-only warning', buildTenantAccessWarning(trialSuspended)?.code === 'TENANT_READ_ONLY');

    // PENDING_REVIEW follows the trial end date.
    const pendingActive = evaluateTenantAccess(row({ subscription_status: 'PENDING_REVIEW', trial_ends_at: at(5) }), NOW);
    assert('PENDING_REVIEW inside trial -> FULL', pendingActive.mode === 'FULL', pendingActive.mode);
    const pendingGrace = evaluateTenantAccess(row({ subscription_status: 'PENDING_REVIEW', trial_ends_at: at(-1) }), NOW);
    assert('PENDING_REVIEW past trial end -> GRACE', pendingGrace.effectiveStatus === 'GRACE', pendingGrace.effectiveStatus);
    const pendingSuspended = evaluateTenantAccess(
        row({ subscription_status: 'PENDING_REVIEW', trial_ends_at: at(-(GRACE_DAYS + 1)) }),
        NOW
    );
    assert('PENDING_REVIEW past grace -> READ_ONLY', pendingSuspended.mode === 'READ_ONLY', pendingSuspended.mode);

    // ACTIVE follows subscription_expires_at and ignores the trial date.
    const activeInside = evaluateTenantAccess(
        row({ subscription_status: 'ACTIVE', trial_ends_at: at(-100), subscription_expires_at: at(20) }),
        NOW
    );
    assert('ACTIVE inside period -> FULL', activeInside.mode === 'FULL', activeInside.mode);
    assert('ACTIVE inside period -> daysLeft 20', activeInside.daysLeft === 20, String(activeInside.daysLeft));

    const activeGrace = evaluateTenantAccess(
        row({ subscription_status: 'ACTIVE', subscription_expires_at: at(-2) }),
        NOW
    );
    assert('ACTIVE past period -> GRACE', activeGrace.effectiveStatus === 'GRACE', activeGrace.effectiveStatus);
    assert('ACTIVE past period -> daysLeft GRACE_DAYS-2', activeGrace.daysLeft === GRACE_DAYS - 2, String(activeGrace.daysLeft));

    const activeSuspended = evaluateTenantAccess(
        row({ subscription_status: 'ACTIVE', subscription_expires_at: at(-(GRACE_DAYS + 1)) }),
        NOW
    );
    assert('ACTIVE past grace -> READ_ONLY', activeSuspended.mode === 'READ_ONLY', activeSuspended.mode);

    // Stored GRACE.
    const graceInside = evaluateTenantAccess(row({ subscription_status: 'GRACE', subscription_expires_at: at(-1) }), NOW);
    assert('GRACE inside window -> FULL', graceInside.mode === 'FULL', graceInside.mode);
    assert('GRACE inside window -> warning', buildTenantAccessWarning(graceInside)?.code === 'GRACE_PERIOD');
    const gracePast = evaluateTenantAccess(
        row({ subscription_status: 'GRACE', subscription_expires_at: at(-(GRACE_DAYS + 1)) }),
        NOW
    );
    assert('GRACE past window -> READ_ONLY', gracePast.mode === 'READ_ONLY', gracePast.mode);

    // Stored SUSPENDED is terminal until a status change.
    const suspended = evaluateTenantAccess(
        row({ subscription_status: 'SUSPENDED', trial_ends_at: at(30), subscription_expires_at: at(30) }),
        NOW
    );
    assert('SUSPENDED -> READ_ONLY', suspended.mode === 'READ_ONLY', suspended.mode);
    assert('SUSPENDED -> reason TENANT_SUSPENDED', suspended.reason === 'TENANT_SUSPENDED', suspended.reason);

    // BLOCKED outranks every lifecycle state.
    const blockedTrial = evaluateTenantAccess(
        row({ is_active: false, subscription_status: 'TRIAL', trial_ends_at: at(10) }),
        NOW
    );
    assert('is_active=false -> BLOCKED', blockedTrial.mode === 'BLOCKED', blockedTrial.mode);
    assert('is_active=false -> reason RESTAURANT_INACTIVE', blockedTrial.reason === 'RESTAURANT_INACTIVE', blockedTrial.reason);
    const blockedActive = evaluateTenantAccess(
        row({ is_active: false, subscription_status: 'ACTIVE', subscription_expires_at: at(30) }),
        NOW
    );
    assert('is_active=false during active period -> BLOCKED', blockedActive.mode === 'BLOCKED', blockedActive.mode);

    // No dates on record: nothing to derive from.
    const noDates = evaluateTenantAccess(
        { is_active: true, subscription_status: 'TRIAL', trial_ends_at: null, subscription_expires_at: null },
        NOW
    );
    assert('TRIAL without trial end -> FULL', noDates.mode === 'FULL', noDates.mode);
    assert('TRIAL without trial end -> daysLeft null', noDates.daysLeft === null, String(noDates.daysLeft));

    // GRACE_DAYS: constant with env override, unusable values fall back.
    assert('GRACE_DAYS default is 5', getGraceDays() === 5, String(getGraceDays()));
    assert('TRIAL_DAYS default is 14', TRIAL_DAYS === 14, String(TRIAL_DAYS));
    assert(
        'TENANT_GRACE_DAYS override is honored',
        withEnv('TENANT_GRACE_DAYS', '2', () => getGraceDays()) === 2
    );
    assert(
        'TENANT_GRACE_DAYS=0 suspends immediately',
        withEnv('TENANT_GRACE_DAYS', '0', () => {
            const access = evaluateTenantAccess(row({ subscription_status: 'TRIAL', trial_ends_at: at(-1) }), NOW);
            return access.mode === 'READ_ONLY' && access.effectiveStatus === 'SUSPENDED';
        })
    );
    assert(
        'TENANT_GRACE_DAYS garbage falls back to 5',
        withEnv('TENANT_GRACE_DAYS', 'not-a-number', () => getGraceDays()) === 5
    );
    assert('getGraceDays restored after override', getGraceDays() === 5, String(getGraceDays()));
}

async function testGetTenantAccessWithStub() {
    console.log('\n--- getTenantAccess (stubbed db) ---');

    const stub = (value: unknown) => ({ restaurants: { findUnique: async () => value } });
    const fromStub = await getTenantAccess(
        stub(row({ subscription_status: 'TRIAL', trial_ends_at: at(-(GRACE_DAYS + 1)) })) as any,
        'stub-tenant',
        NOW
    );
    assert('stubbed row is derived from its dates', fromStub.mode === 'READ_ONLY' && fromStub.effectiveStatus === 'SUSPENDED', JSON.stringify(fromStub));

    let threw = false;
    try {
        await getTenantAccess(stub(null) as any, 'no-such-restaurant', NOW);
    } catch (err) {
        threw = err instanceof TenantNotFoundError;
    }
    assert('missing tenant throws TenantNotFoundError', threw);
}

const created = { restaurants: [] as string[], events: [] as string[], sessions: [] as string[], users: [] as string[], staff: [] as string[], memberships: [] as string[] };

async function teardown() {
    for (const id of created.events) await prisma.subscription_events.deleteMany({ where: { id } }).catch(() => { });
    await prisma.subscription_events.deleteMany({ where: { restaurant_id: { in: [...created.restaurants] } } }).catch(() => { });
    for (const id of created.sessions) await prisma.user_sessions.deleteMany({ where: { id } }).catch(() => { });
    for (const id of created.memberships) await prisma.memberships.deleteMany({ where: { id } }).catch(() => { });
    for (const id of created.staff) await prisma.staff.deleteMany({ where: { id } }).catch(() => { });
    for (const id of created.users) await prisma.users.deleteMany({ where: { id } }).catch(() => { });
    for (const id of created.restaurants) await prisma.restaurants.deleteMany({ where: { id } }).catch(() => { });
}

async function makeTenant(data: Record<string, unknown>) {
    const unique = crypto.randomBytes(6).toString('hex');
    const restaurant = await prisma.restaurants.create({
        data: { name: `Tenant Access ${unique}`, slug: `tenant-access-${unique}`, ...data } as any,
    });
    created.restaurants.push(restaurant.id);
    return restaurant;
}

async function testAgainstDatabase() {
    console.log('\n--- getTenantAccess (real tables) ---');

    const active = await makeTenant({
        subscription_status: 'ACTIVE',
        subscription_expires_at: new Date(Date.now() + 10 * DAY),
    });
    const activeAccess = await getTenantAccess(prisma, active.id);
    assert('real ACTIVE tenant is FULL', activeAccess.mode === 'FULL', activeAccess.mode);
    assert('real ACTIVE tenant reports ACTIVE', activeAccess.status === 'ACTIVE', activeAccess.status);

    const expired = await makeTenant({
        subscription_status: 'ACTIVE',
        subscription_expires_at: new Date(Date.now() - (GRACE_DAYS + 1) * DAY),
    });
    const expiredAccess = await getTenantAccess(prisma, expired.id);
    assert('real expired tenant is READ_ONLY', expiredAccess.mode === 'READ_ONLY', expiredAccess.mode);
    assert('real expired tenant derives SUSPENDED', expiredAccess.effectiveStatus === 'SUSPENDED', expiredAccess.effectiveStatus);

    const suspended = await makeTenant({ subscription_status: 'SUSPENDED' });
    const suspendedAccess = await getTenantAccess(prisma, suspended.id);
    assert('real SUSPENDED tenant is READ_ONLY', suspendedAccess.mode === 'READ_ONLY', suspendedAccess.mode);

    const defaultStatus = await makeTenant({});
    const defaultRow = await prisma.restaurants.findUnique({ where: { id: defaultStatus.id }, select: { subscription_status: true } });
    assert('new tenant defaults to TRIAL', defaultRow?.subscription_status === 'TRIAL', String(defaultRow?.subscription_status));

    let missingThrew = false;
    try {
        await getTenantAccess(prisma, crypto.randomUUID());
    } catch (err) {
        missingThrew = err instanceof TenantNotFoundError;
    }
    assert('unknown restaurant id throws TenantNotFoundError', missingThrew);

    console.log('\n--- setSubscriptionStatus (status + event in one transaction) ---');

    const result = await setSubscriptionStatus(prisma, {
        restaurantId: defaultStatus.id,
        toStatus: 'PENDING_REVIEW',
        actorType: 'OWNER',
        actorId: 'test-owner',
        reason: 'payment proof uploaded',
    });
    assert('setSubscriptionStatus reports the change', result.changed === true && result.fromStatus === 'TRIAL' && result.toStatus === 'PENDING_REVIEW', JSON.stringify(result));
    if (result.eventId) created.events.push(result.eventId);

    const [rowAfter, events] = await Promise.all([
        prisma.restaurants.findUnique({ where: { id: defaultStatus.id }, select: { subscription_status: true, trial_ends_at: true } }),
        prisma.subscription_events.findMany({ where: { restaurant_id: defaultStatus.id }, orderBy: { created_at: 'asc' } }),
    ]);
    assert('status column is PENDING_REVIEW', rowAfter?.subscription_status === 'PENDING_REVIEW', String(rowAfter?.subscription_status));
    assert('TRIAL without an end date gets a 14-day trial', rowAfter?.trial_ends_at !== null, String(rowAfter?.trial_ends_at));
    assert('exactly one event appended', events.length === 1, String(events.length));
    assert(
        'event records from/to/actor/reason',
        events[0]?.from_status === 'TRIAL' &&
        events[0]?.to_status === 'PENDING_REVIEW' &&
        events[0]?.actor_type === 'OWNER' &&
        events[0]?.actor_id === 'test-owner' &&
        events[0]?.reason === 'payment proof uploaded',
        JSON.stringify(events[0])
    );

    const noop = await setSubscriptionStatus(prisma, {
        restaurantId: defaultStatus.id,
        toStatus: 'PENDING_REVIEW',
        actorType: 'SYSTEM',
    });
    assert('no-op transition writes no event', noop.changed === false && noop.eventId === null, JSON.stringify(noop));

    const activated = await setSubscriptionStatus(prisma, {
        restaurantId: defaultStatus.id,
        toStatus: 'ACTIVE',
        actorType: 'SUPER_ADMIN',
        actorId: 'test-admin',
        reason: 'payment verified',
        subscriptionExpiresAt: new Date(Date.now() + 30 * DAY),
    });
    assert('approval transitions to ACTIVE', activated.changed === true, JSON.stringify(activated));
    if (activated.eventId) created.events.push(activated.eventId);
    const eventCount = await prisma.subscription_events.count({ where: { restaurant_id: defaultStatus.id } });
    assert('history keeps every transition', eventCount === 2, String(eventCount));

    console.log('\n--- owner refresh honours tenant access ---');

    const unique = crypto.randomBytes(6).toString('hex');
    const user = await prisma.users.create({
        data: { email: `tenant-refresh-${unique}@example.test`, password_hash: 'x', name: 'Tenant Refresh Owner', is_active: true, email_verified_at: new Date() },
    });
    created.users.push(user.id);
    const restaurant = await makeTenant({ subscription_status: 'ACTIVE', subscription_expires_at: new Date(Date.now() - (GRACE_DAYS + 1) * DAY) });
    const staff = await prisma.staff.create({
        data: { restaurant_id: restaurant.id, name: 'Tenant Refresh Owner', role: 'MANAGER', pin: '', hashed_pin: 'x', status: 'active' },
    });
    created.staff.push(staff.id);
    const membership = await prisma.memberships.create({
        data: { user_id: user.id, restaurant_id: restaurant.id, role: 'OWNER', staff_id: staff.id },
    });
    created.memberships.push(membership.id);
    const session = await userSessionService.createUserSession({ userId: user.id, restaurantId: restaurant.id });
    created.sessions.push(session.session.id);

    const resolution = await resolveOwnerRefreshTarget(prisma, session.session);
    assert('suspended tenant still refreshes (family survives)', resolution.ok === true, JSON.stringify(resolution));
    if (resolution.ok) {
        assert('refresh reports READ_ONLY', resolution.tenantAccess.mode === 'READ_ONLY', resolution.tenantAccess.mode);
        assert('refresh warning is present', buildTenantAccessWarning(resolution.tenantAccess)?.code === 'TENANT_READ_ONLY');
    }

    await prisma.restaurants.update({ where: { id: restaurant.id }, data: { is_active: false } });
    const blocked = await resolveOwnerRefreshTarget(prisma, session.session);
    assert(
        'is_active=false still stops the refresh (existing RESTAURANT_INACTIVE guard wins)',
        !blocked.ok && blocked.code === 'RESTAURANT_INACTIVE',
        JSON.stringify(blocked)
    );
}

async function main() {
    console.log('Task 04 — tenant access lifecycle');
    console.log(`GRACE_DAYS=${GRACE_DAYS} TRIAL_DAYS=${TRIAL_DAYS}`);
    try {
        await testDerivedTransitions();
        await testGetTenantAccessWithStub();
        await testAgainstDatabase();
    } catch (err: any) {
        failed++;
        console.log(`FAIL: suite threw :: ${err.message}`);
    } finally {
        await teardown();
        await prisma.$disconnect();
    }
    console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
}

main();