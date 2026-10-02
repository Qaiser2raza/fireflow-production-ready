/**
 * Test runner with a GLOBAL setup: the database guard runs once here, before any
 * suite starts, and every suite is then launched in a child process that
 * inherits the guarded DATABASE_URL. A suite can therefore never be started
 * through this runner against a database whose name does not end in `_test`.
 *
 * Usage:
 *   npm test                       # every tests/*.test.ts suite
 *   npm run test:safe -- tests/owner-login-sessions.test.ts
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Global setup: throws/exits before a single suite is started when the
// DATABASE_URL database is not a disposable test database.
import '../tests/_test-db-guard';

const TESTS_DIR = path.resolve(process.cwd(), 'tests');

function resolveSuites(requested: string[]): string[] {
  if (requested.length > 0) {
    return requested.map((f) => path.resolve(process.cwd(), f));
  }
  return fs
    .readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith('.test.ts'))
    .sort()
    .map((f) => path.join(TESTS_DIR, f));
}

function main(): void {
  const suites = resolveSuites(process.argv.slice(2));

  if (suites.length === 0) {
    console.error('No test suites found.');
    process.exit(1);
  }

  const failures: string[] = [];

  for (const suite of suites) {
    if (!fs.existsSync(suite)) {
      console.error(`Suite not found: ${suite}`);
      failures.push(suite);
      continue;
    }

    console.log(`\n=== ${path.relative(process.cwd(), suite)} ===`);
    const result = spawnSync(process.execPath, ['--import', 'tsx', suite], {
      stdio: 'inherit',
      env: process.env,
      cwd: process.cwd(),
    });

    if (result.status !== 0) {
      failures.push(path.relative(process.cwd(), suite));
    }
  }

  console.log('\n=== SUITE SUMMARY ===');
  if (failures.length === 0) {
    console.log(`All ${suites.length} suite(s) passed.`);
    return;
  }
  console.error(`Failed suites (${failures.length}): ${failures.join(', ')}`);
  process.exit(1);
}

main();