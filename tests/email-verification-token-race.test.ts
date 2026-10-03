/**
 * Task 05 (commit 1) — the concurrent verification-token race.
 *
 * `createVerificationEmail` used to invalidate and then create as two independent
 * writes, so two concurrent resends could both invalidate, both create, and leave
 * two live tokens for one address — each of which then verified successfully.
 * Invalidate-then-create is now one transaction behind a transaction-scoped
 * advisory lock keyed on the normalized address.
 *
 * This suite asserts the race is actually closed against real concurrent
 * transactions (no mocking, no clock control), plus the properties the fix must
 * not break: the surviving token verifies exactly once, and a caller that already
 * holds a transaction gets its token back and participates in the same lock.
 *
 * Run: npm run test:safe -- tests/email-verification-token-race.test.ts
 */
import './_test-db-guard';
import 'dotenv/config';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { EmailVerificationService } from '../src/api/services/EmailVerificationService';
import { ACTIVE } from './helpers/tenantFixtures';

const prisma = new PrismaClient();

const CONCURRENCY = 10;

let passed = 0;
let failed = 0;
function assert(name: string, cond: boolean, extra?: string) {
    if (cond) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}${extra ? ' :: ' + extra : ''}`); }
}

interface Fixture { restaurantId: string; staffId: string; email: string; }

const trash: string[] = [];

async function makeFixture(): Promise<Fixture> {
    const email = `verify-race-${crypto.randomBytes(6).toString('hex')}@test.fireflow`;
    const restaurant = await prisma.restaurants.create({
        data: {
            name: `VerifyRace ${Date.now()}`,
            slug: `verify-race-${crypto.randomBytes(6).toString('hex')}`,
            subscription_status: ACTIVE,
        },
    });
    const staff = await prisma.staff.create({
        data: {
            restaurant_id: restaurant.id,
            name: 'Verify Race Owner',
            role: 'OWNER',
            email,
            pin: '',
            hashed_pin: await bcrypt.hash('123456', 10),
            status: 'active',
        },
    });
    trash.push(restaurant.id);
    return { restaurantId: restaurant.id, staffId: staff.id, email };
}

async function unusedTokens(email: string): Promise<string[]> {
    const rows = await prisma.email_verification_tokens.findMany({
        where: { email, used: false },
        select: { token: true },
    });
    return rows.map((r) => r.token);
}

async function cleanup(): Promise<void> {
    // email_verification_tokens holds no FK to restaurants, so the address is
    // cleared by restaurant id via the staff row first.
    for (const restaurantId of trash) {
        const staff = await prisma.staff.findMany({ where: { restaurant_id: restaurantId }, select: { id: true } });
        await prisma.email_verification_tokens.deleteMany({
            where: { restaurant_id: restaurantId },
        }).catch(() => {});
        for (const s of staff) {
            await prisma.email_verification_tokens.deleteMany({ where: { staff_id: s.id } }).catch(() => {});
        }
        await prisma.staff.deleteMany({ where: { restaurant_id: restaurantId } }).catch(() => {});
        await prisma.restaurants.deleteMany({ where: { id: restaurantId } }).catch(() => {});
    }
}

async function runTests(): Promise<void> {
    console.log('\n--- a single mint invalidates the previous token ---');
    {
        const f = await makeFixture();
        const first = await EmailVerificationService.createVerificationEmail(f.email, f.staffId, f.restaurantId);
        const second = await EmailVerificationService.createVerificationEmail(f.email, f.staffId, f.restaurantId);

        const firstRow = await prisma.email_verification_tokens.findUnique({ where: { token: first } });
        const secondRow = await prisma.email_verification_tokens.findUnique({ where: { token: second } });

        assert('the first token is invalidated by the second mint', firstRow?.used === true, String(firstRow?.used));
        assert('the second token is the only live one', secondRow?.used === false && (await unusedTokens(f.email)).length === 1);
        assert('the two mints returned different tokens', first !== second);
        await cleanup();
    }

    console.log('\n--- 10 concurrent resends leave exactly ONE live token ---');
    {
        const f = await makeFixture();

        // A token that exists BEFORE the burst: it must be invalidated by it.
        const preExisting = await EmailVerificationService.createVerificationEmail(f.email, f.staffId, f.restaurantId);

        const issued = await Promise.all(
            Array.from({ length: CONCURRENCY }, () =>
                EmailVerificationService.createVerificationEmail(f.email, f.staffId, f.restaurantId)
            )
        );

        const live = await unusedTokens(f.email);
        const all = await prisma.email_verification_tokens.findMany({
            where: { email: f.email },
            select: { token: true, used: true },
        });

        assert(`all ${CONCURRENCY} concurrent mints returned a distinct token`,
            new Set(issued).size === CONCURRENCY, String(new Set(issued).size));
        assert(`exactly one live token survives ${CONCURRENCY} concurrent resends`,
            live.length === 1, `live=${live.length}`);
        assert('every row for the address is accounted for',
            all.length === CONCURRENCY + 1, `rows=${all.length}`);

        const supersededUsed = all.filter((r) => r.token !== live[0]).every((r) => r.used === true);
        assert('every other token is invalidated', supersededUsed);

        const preExistingRow = await prisma.email_verification_tokens.findUnique({ where: { token: preExisting } });
        assert('the token that existed before the burst is invalidated',
            preExistingRow?.used === true, String(preExistingRow?.used));

        console.log('\n--- the surviving token verifies exactly once ---');
        const survivor = live[0];
        assert('the survivor is one of the tokens the burst issued', issued.includes(survivor));

        const verified = await EmailVerificationService.verifyToken(survivor);
        assert('the surviving token verifies', verified.valid === true, verified.error);
        assert('verification reports the right address', verified.email === f.email, String(verified.email));
        assert('verification reports the right staff row', verified.staffId === f.staffId, String(verified.staffId));
        assert('verification reports the right tenant', verified.restaurantId === f.restaurantId, String(verified.restaurantId));

        const replay = await EmailVerificationService.verifyToken(survivor);
        assert('the surviving token cannot be replayed', replay.valid === false, replay.error);

        for (const dead of issued.filter((t) => t !== survivor)) {
            const attempt = await EmailVerificationService.verifyToken(dead);
            assert('a superseded token never verifies', attempt.valid === false, attempt.error);
        }

        assert('no live token is left after verification', (await unusedTokens(f.email)).length === 0);
        await cleanup();
    }

    console.log('\n--- a caller-supplied transaction joins the same lock ---');
    {
        const f = await makeFixture();
        const outside = await EmailVerificationService.createVerificationEmail(f.email, f.staffId, f.restaurantId);

        const inside = await prisma.$transaction(async (tx) => {
            const token = await EmailVerificationService.createVerificationEmail(f.email, f.staffId, f.restaurantId, tx);
            // Inside the same transaction the caller sees its own write, which
            // proves the token was created on the injected client, not a separate
            // connection that could have committed independently.
            const visible = await tx.email_verification_tokens.findUnique({ where: { token } });
            assert('the token was created on the injected transaction client', visible?.used === false);
            return token;
        });

        const outsideRow = await prisma.email_verification_tokens.findUnique({ where: { token: outside } });
        assert('the pre-existing token was invalidated inside the caller transaction',
            outsideRow?.used === true, String(outsideRow?.used));

        const live = await unusedTokens(f.email);
        assert('exactly one live token after the caller transaction', live.length === 1, `live=${live.length}`);
        assert('the caller transaction token is the survivor', live[0] === inside);
        await cleanup();
    }

    console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
}

runTests()
    .catch((err) => {
        console.error('FATAL', err);
        failed++;
    })
    .finally(async () => {
        await cleanup();
        await prisma.$disconnect();
        process.exit(failed === 0 ? 0 : 1);
    });