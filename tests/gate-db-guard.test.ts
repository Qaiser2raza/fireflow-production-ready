// TD-14b — release-gate database safety boundary.
// Negative test: the gate must HARD-FAIL (before booting anything or sweeping
// data) when pointed at a non-disposable database, and the allowlist must
// accept exactly the approved gate/verify targets.

import { spawnSync } from 'child_process';
import path from 'path';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
// Release gate is CommonJS and runs main() only when invoked directly,
// so requiring it here is safe and gives us the exported predicates.
const gate = require_('../scripts/release-gate.cjs');

let passed = 0;
let failed = 0;
function assert(testName: string, condition: boolean, expected: string, actual: string) {
    if (condition) {
        console.log(`  PASS: ${testName}`);
        passed++;
    } else {
        console.log(`  FAIL: ${testName} — expected ${expected}, got ${actual}`);
        failed++;
    }
}

function main() {
    console.log('--- STARTING GATE DB SAFETY GUARD VERIFICATION ---');

    // 1. Allowlist accepts exactly the disposable targets
    assert('verify DB allowed (fireflow_migrate_verify)', gate.isAllowedGateDb('fireflow_migrate_verify') === true, 'true', String(gate.isAllowedGateDb('fireflow_migrate_verify')));
    assert('verify suffix allowed (x_verify)', gate.isAllowedGateDb('acme_verify') === true, 'true', String(gate.isAllowedGateDb('acme_verify')));
    assert('CI service DB allowed (fireflow_gate)', gate.isAllowedGateDb('fireflow_gate') === true, 'true', String(gate.isAllowedGateDb('fireflow_gate')));

    // 2. Real-shaped databases are denied
    assert('dev DB denied (fireflow_local)', gate.isAllowedGateDb('fireflow_local') === false, 'false', String(gate.isAllowedGateDb('fireflow_local')));
    assert('production-ish DB denied', gate.isAllowedGateDb('fireflow_production') === false, 'false', String(gate.isAllowedGateDb('fireflow_production')));
    assert('per-mission scratch DB denied', gate.isAllowedGateDb('fireflow_test_008') === false, 'false', String(gate.isAllowedGateDb('fireflow_test_008')));
    assert('unresolvable URL denied', gate.isAllowedGateDb('') === false, 'false', String(gate.isAllowedGateDb('')));
    assert('lookalike denied (verify_prod does not end in _verify segment)', gate.isAllowedGateDb('fireflow_verify_prod') === false, 'false', String(gate.isAllowedGateDb('fireflow_verify_prod')));

    // 3. Live negative run: gate refuses a dev DATABASE_URL before any work
    const t0 = Date.now();
    const res = spawnSync(process.execPath, ['scripts/release-gate.cjs'], {
        env: { ...process.env, DATABASE_URL: 'postgresql://postgres:x@localhost:5432/fireflow_local?schema=public' },
        encoding: 'utf8',
        timeout: 30000,
    });
    const out = `${res.stdout || ''}${res.stderr || ''}`;
    const elapsed = Date.now() - t0;
    assert('negative run exits non-zero', (res.status ?? 1) !== 0, '!=0', String(res.status));
    assert('refusal names the safety boundary', /REFUSING TO RUN/.test(out), 'REFUSING present', out.slice(0, 80));
    assert('refusal names offending database', /fireflow_local/.test(out), 'fireflow_local named', out.slice(0, 120));
    assert('refusal happens BEFORE suites/boot (fast fail)', elapsed < 15000 && !/\[GATE\] RUN /.test(out), '<15s no RUN', `${elapsed}ms`);
    assert('no server boot attempted', !/Server Engine Online/.test(out), 'no boot', /Server Engine Online/.test(out) ? 'booted' : 'none');

    console.log(`\n=== GATE DB SAFETY GUARD RESULTS: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
}

main();
