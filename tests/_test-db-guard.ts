/**
 * GLOBAL TEST DATABASE GUARD
 *
 * Import this module before anything touches Prisma. It exists because suites
 * and seeds sweep fixture data with deleteMany/deleteMany-on-restaurants, so a
 * misdirected run destroys real development data:
 *
 *   - tests/mission-031-b-wac.test.ts  -> prisma.restaurants.deleteMany({})
 *   - prisma/seed.ts                   -> prisma.restaurants.deleteMany({})
 *
 * Rules:
 *   1. Never start with NODE_ENV=production.
 *   2. If DATABASE_URL is unset, `.env.test` is loaded (never overriding an
 *      already exported value), so a bare `npx tsx tests/foo.test.ts` lands on
 *      the disposable test database instead of the development one.
 *   3. The target database must satisfy the SAME disposable policy the release
 *      gate enforces (TD-14b): `*_verify`, the `fireflow_gate` CI database, or a
 *      `*_test` database. `fireflow_local` and any production-shaped database
 *      are refused before Prisma ever connects.
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
// CommonJS and side-effect free when required: the gate only runs main() when it
// is invoked directly, so the tested DB-safety predicates can be reused here.
const gate = require_('../scripts/release-gate.cjs');

/** Extra disposable suffix accepted for ad-hoc/local test runs. */
export const REQUIRED_DB_SUFFIX = '_test';

let alreadyChecked = false;

function refuse(reason: string): never {
    console.error(`[test-guard] REFUSING TO RUN: ${reason}`);
    process.exit(1);
}

export function assertTestDatabase(): void {
    if (alreadyChecked) return;
    alreadyChecked = true;

    if (process.env.NODE_ENV === 'production') {
        refuse('NODE_ENV is production.');
    }

    if (!process.env.DATABASE_URL) {
        const envTestPath = path.resolve(process.cwd(), '.env.test');
        if (fs.existsSync(envTestPath)) {
            // dotenv never overrides a value already exported into the process.
            dotenv.config({ path: envTestPath });
        }
    }

    const url = process.env.DATABASE_URL || '';
    const databaseName = gate.extractDbName(url);

    const allowed =
        gate.isAllowedGateDb(databaseName) || databaseName.endsWith(REQUIRED_DB_SUFFIX);

    if (!allowed) {
        console.error(`[test-guard] Target database: "${databaseName || '(unresolvable)'}"`);
        console.error(
            `[test-guard] Allowed: disposable test databases ("*${REQUIRED_DB_SUFFIX}") and the release-gate ` +
            'databases ("*_verify", "fireflow_gate").'
        );
        console.error(
            '[test-guard] Suites and seeds sweep data; pointing them at a real tenant/dev database is a destructive operation.'
        );
        refuse(
            `DATABASE_URL does not point at a disposable test database (got "${databaseName || '(unresolvable)'}").`
        );
    }

    console.log(`[test-guard] test database OK: ${databaseName}`);
}

// Side effect on import: this module IS the guard, not a utility.
assertTestDatabase();