/**
 * Task 03g (Phase B) — owner-cookie refresh CONCURRENCY regression.
 *
 * Question under test: when two refresh requests race with the SAME still-valid
 * owner refresh token, does the current transaction hold?
 *
 * Expected (current strict rotation semantics, unchanged by this task):
 *   - exactly ONE request rotates and returns the successor token
 *   - the other is rejected as a normal loser (INVALID_REFRESH_TOKEN)
 *   - the loser must NOT raise TOKEN_REUSE_DETECTED and must NOT revoke the family
 *   - the family keeps exactly one live session and the successor still refreshes
 *
 * This is deliberately NOT the replay case. Replaying an ALREADY-ROTATED token
 * is a different, adversarial path (`existing.revokedAt` -> family revocation)
 * and is already covered by tests/owner-login-sessions.test.ts. Keeping the two
 * cases apart is the whole point of this suite.
 *
 * No production code, schema or migration is touched: this file only calls the
 * existing UserSessionService.
 *
 * ---------------------------------------------------------------------------
 * Task 03g (Phase B fix): the classification is now ordered, not windowed.
 * `rotateUserRefreshToken` captures the moment the request arrived and only
 * treats a revoked token as THEFT when the revocation predates that moment; a
 * revocation made at/after it can only have come from a rotation this request
 * raced, so the caller is a plain loser. No leeway, no flag, no new column, and
 * the loser path issues nothing.
 *
 * The suite asserts BOTH halves of that rule:
 *   - the concurrent race (5 rounds): one rotation, one INVALID_REFRESH_TOKEN
 *     loser, no family revocation, successor still usable
 *   - genuine replay of an already rotated token, presented later: still
 *     TOKEN_REUSE_DETECTED with the whole family revoked
 * ---------------------------------------------------------------------------
 *
 * Run: npm run test:safe -- tests/owner-refresh-concurrency.test.ts
 */
import './_test-db-guard';
import 'dotenv/config';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { userSessionService } from '../src/api/services/auth/UserSessionService';
import { ACTIVE } from './helpers/tenantFixtures';

const prisma = new PrismaClient();

const ROUNDS = 5;
const unique = () => crypto.randomBytes(6).toString('hex');

let passed = 0;
let failed = 0;
function assert(name: string, cond: boolean, extra?: string) {
    if (cond) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}${extra ? ' :: ' + extra : ''}`); }
}

const created = {
    users: [] as string[],
    restaurants: [] as string[],
    staff: [] as string[],
    memberships: [] as string[],
    sessions: [] as string[],
};

async function teardown() {
    for (const id of created.sessions) {
        await prisma.user_sessions.deleteMany({ where: { id } }).catch(() => { });
    }
    await prisma.user_sessions.deleteMany({ where: { user_id: { in: [...created.users] } } }).catch(() => { });
    for (const id of created.memberships) await prisma.memberships.deleteMany({ where: { id } }).catch(() => { });
    for (const id of created.staff) await prisma.staff.deleteMany({ where: { id } }).catch(() => { });
    for (const id of created.users) await prisma.users.deleteMany({ where: { id } }).catch(() => { });
    for (const id of created.restaurants) await prisma.restaurants.deleteMany({ where: { id } }).catch(() => { });
}

/** One owner + one restaurant + one live owner session, straight from the service. */
async function makeOwnerWithSession() {
    const user = await prisma.users.create({
        data: {
            email: `conc-${unique()}@refresh-concurrency.example`,
            password_hash: 'not-used-here',
            name: 'Concurrency Owner',
            is_active: true,
            email_verified_at: new Date(),
        },
    });
    created.users.push(user.id);

    const restaurant = await prisma.restaurants.create({
        data: {
            name: `Concurrency ${unique()}`,
            slug: `concurrency-${unique()}`,
            is_active: true,
            onboarding_status: 'ACTIVE',
            subscription_status: ACTIVE,
        },
    });
    created.restaurants.push(restaurant.id);

    const staff = await prisma.staff.create({
        data: {
            restaurant_id: restaurant.id,
            name: 'Concurrency Owner',
            role: 'MANAGER',
            pin: '',
            hashed_pin: 'not-used-here',
            status: 'active',
            email: null,
        },
    });
    created.staff.push(staff.id);

    const membership = await prisma.memberships.create({
        data: { user_id: user.id, restaurant_id: restaurant.id, role: 'OWNER', staff_id: staff.id },
    });
    created.memberships.push(membership.id);

    const issued = await userSessionService.createUserSession({
        userId: user.id,
        restaurantId: restaurant.id,
    });
    created.sessions.push(issued.session.id);

    return { user, restaurant, staff, membership, token: issued.token, session: issued.session };
}

type Outcome =
    | { ok: true; token: string; session: any }
    | { ok: false; error: string };

async function runRace(token: string): Promise<Outcome[]> {
    const [a, b] = await Promise.all([
        userSessionService.rotateUserRefreshToken(token),
        userSessionService.rotateUserRefreshToken(token),
    ]);
    return [a, b].map((r: any) => ('error' in r ? { ok: false, error: r.error } : { ok: true, token: r.token, session: r.session }));
}

async function main() {
    console.log('Task 03g (Phase B) — owner refresh concurrency with one still-valid token');
    console.log(`rounds: ${ROUNDS}`);

    const observations: string[] = [];

    try {
        for (let round = 1; round <= ROUNDS; round++) {
            const fixture = await makeOwnerWithSession();
            const familyId = fixture.session.tokenFamilyId;

            const outcomes = await runRace(fixture.token);
            const winners = outcomes.filter((o) => o.ok);
            const losers = outcomes.filter((o) => !o.ok) as Extract<Outcome, { ok: false }>[];

            observations.push(`round ${round}: winners=${winners.length} losers=${losers.map((l) => l.error).join('+') || 'none'}`);

            assert(`r${round}: exactly one concurrent refresh succeeds`, winners.length === 1, `winners=${winners.length}`);
            assert(`r${round}: the other concurrent refresh is rejected`, losers.length === 1, `losers=${losers.length}`);
            assert(
                `r${round}: the loser is a plain rejection, not a theft signal`,
                losers.length === 1 && losers[0].error === 'INVALID_REFRESH_TOKEN',
                losers.map((l) => l.error).join('+')
            );
            assert(
                `r${round}: the loser did not revoke the token family`,
                losers.every((l) => l.error !== 'TOKEN_REUSE_DETECTED' && l.error !== 'SESSION_RESTAURANT_UNBOUND'),
                losers.map((l) => l.error).join('+')
            );

            const family = await prisma.user_sessions.findMany({
                where: { token_family_id: familyId },
                select: { id: true, revoked_at: true, restaurant_id: true },
            });
            const live = family.filter((f) => f.revoked_at === null);
            assert(`r${round}: exactly one live session survives the race`, live.length === 1, `live=${live.length} of ${family.length}`);
            assert(`r${round}: the family stayed in one restaurant`, new Set(family.map((f) => f.restaurant_id)).size === 1);

            if (winners.length !== 1) continue;
            const successor = winners[0];

            assert(
                `r${round}: the successor is a different token in the same family`,
                successor.token !== fixture.token && successor.session.tokenFamilyId === familyId
            );
            assert(
                `r${round}: the successor session stays bound to the tenant`,
                successor.session.restaurantId === fixture.restaurant.id,
                String(successor.session.restaurantId)
            );
            created.sessions.push(successor.session.id);

            // The successor must be usable, i.e. the family was not killed.
            const next = await userSessionService.rotateUserRefreshToken(successor.token);
            assert(`r${round}: the successor refreshes normally`, !('error' in next), JSON.stringify(next).slice(0, 160));
            if (!('error' in next)) {
                created.sessions.push(next.session.id);
                assert(
                    `r${round}: the second-generation successor is still bound to the tenant`,
                    next.session.restaurantId === fixture.restaurant.id,
                    String(next.session.restaurantId)
                );
            }

            // And the original (now rotated) token is dead for the family.
            const familyAfter = await prisma.user_sessions.findMany({
                where: { token_family_id: familyId },
                select: { revoked_at: true },
            });
            assert(
                `r${round}: the original token is revoked after the race`,
                familyAfter.filter((f) => f.revoked_at !== null).length === familyAfter.length - 1,
                `${familyAfter.filter((f) => f.revoked_at !== null).length}/${familyAfter.length}`
            );
        }

        console.log('\nobservations:');
        for (const line of observations) console.log(`  ${line}`);

        // ---- The other half of the rule: genuine replay is still theft ----
        console.log('\n--- control: replay of an ALREADY rotated token, presented later ---');

        const replayFixture = await makeOwnerWithSession();
        const replayFamily = replayFixture.session.tokenFamilyId;
        const firstRotation = await userSessionService.rotateUserRefreshToken(replayFixture.token);
        assert('control: the first rotation succeeds', !('error' in firstRotation), JSON.stringify(firstRotation).slice(0, 120));
        if (!('error' in firstRotation)) {
            created.sessions.push(firstRotation.session.id);

            const replay = await userSessionService.rotateUserRefreshToken(replayFixture.token);
            assert('control: replaying a rotated token is TOKEN_REUSE_DETECTED', 'error' in replay && replay.error === 'TOKEN_REUSE_DETECTED', JSON.stringify(replay));

            const familyAfterReplay = await prisma.user_sessions.findMany({
                where: { token_family_id: replayFamily },
                select: { revoked_at: true },
            });
            assert(
                'control: replay revokes the whole family',
                familyAfterReplay.length > 0 && familyAfterReplay.every((f) => f.revoked_at !== null),
                `${familyAfterReplay.filter((f) => f.revoked_at === null).length} still live`
            );

            const successorAfterReplay = await userSessionService.rotateUserRefreshToken(firstRotation.token);
            assert('control: the successor dies with the family', 'error' in successorAfterReplay, JSON.stringify(successorAfterReplay).slice(0, 120));
        }
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