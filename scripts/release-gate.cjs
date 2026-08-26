// FireFlow Release Gate — independent, sequential verification orchestrator.
// Boots its own API server (NODE_ENV=test), runs every security-relevant suite
// STRICTLY SEQUENTIALLY (concurrent DB-bound HTTP suites interfere), then
// type-checks and builds. Exit code is the single source of truth for CI.
//
// TD-14b SAFETY BOUNDARY: suites sweep fixture data across the configured
// database. The gate therefore REFUSES to run against any database that is
// not an explicitly disposable verify/gate database — a real tenant DB
// (e.g. fireflow_local) can never be destructively swept by misconfiguration.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

function resolveDatabaseUrl() {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find(l => l.startsWith('DATABASE_URL='));
        if (line) return line.slice('DATABASE_URL='.length).trim();
    }
    return '';
}

function extractDbName(url) {
    const m = String(url || '').match(/\/([^/?]+)(\?|$)/);
    return m ? m[1] : '';
}

/**
 * Only explicitly disposable databases may host the gate:
 *   *_verify (e.g. fireflow_migrate_verify) and fireflow_gate (CI service DB).
 * Everything else — production-shaped dev DBs included — hard-fails.
 */
function isAllowedGateDb(dbName) {
    if (!dbName) return false;
    if (dbName === 'fireflow_gate') return true;
    return /(^|_)verify$/.test(dbName);
}

function assertGateDatabaseSafety() {
    const url = resolveDatabaseUrl();
    const dbName = extractDbName(url);
    if (!isAllowedGateDb(dbName)) {
        console.error('[GATE] REFUSING TO RUN: DATABASE_URL does not point at an approved disposable gate database.');
        console.error(`[GATE] Target database: "${dbName || '(unresolvable)'}"`);
        console.error('[GATE] Allowed: *_verify databases and the CI database (fireflow_gate).');
        console.error('[GATE] Suites sweep data; pointing the gate at a real tenant/dev DB is a destructive operation (TD-14b).');
        console.error('[GATE] Fix: $env:DATABASE_URL = \'<postgres url for fireflow_migrate_verify>\' then re-run.');
        process.exit(1);
    }
    console.log(`[GATE] DB safety assertion OK: ${dbName}`);
}

// ---- TD-14b boundary is enforced inside main(), before any server boot or
// ---- suite sweep, so that requiring this module (tests) never triggers it.

const STEP_RE = /^\[GATE\]/;
const log = m => console.log(`[GATE] ${m}`);
const results = [];
let serverProc = null;

function waitForPort(port, timeoutMs = 90000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const tryOnce = () => {
            const s = net.connect(port, '127.0.0.1');
            s.once('connect', () => { s.destroy(); resolve(); });
            s.once('error', () => {
                s.destroy();
                if (Date.now() - start > timeoutMs) reject(new Error(`port ${port} never became ready`));
                else setTimeout(tryOnce, 500);
            });
        };
        tryOnce();
    });
}

function run(name, cmd, opts = {}) {
    return new Promise(resolve => {
        log(`RUN  ${name}`);
        const t0 = Date.now();
        const child = spawn(cmd, { shell: true, stdio: ['ignore', 'pipe', 'pipe'], ...opts.env ? { env: { ...process.env, ...opts.env } } : {} });
        let tail = '';
        const capture = d => {
            tail += d.toString();
            if (tail.length > 8000) tail = tail.slice(-8000);
            process.stdout.write(d);
        };
        child.stdout.on('data', capture);
        child.stderr.on('data', capture);
        child.on('exit', code => {
            results.push({ name, code, ms: Date.now() - t0, tail: tail.slice(-600) });
            log(code === 0 ? `OK   ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)` : `FAIL ${name} exit=${code}`);
            resolve(code);
        });
    });
}

async function main() {
    let failed = false;

    // ---- 0. TD-14b: database safety assertion FIRST ----
    assertGateDatabaseSafety();

    // ---- 1. boot API server (test mode) ----
    log('BOOT api server (NODE_ENV=test) on :3001');
    serverProc = spawn('npx cross-env NODE_ENV=test LOGIN_RATE_LIMIT_MAX=10000 VERIFY_PIN_RATE_LIMIT_MAX=10000 npx tsx src/api/server.ts', { shell: true, stdio: 'ignore' });
    await waitForPort(3001);
    log('BOOT api ready');

    // ---- 2. suites — strictly sequential by design ----
    const suites = [
        'gate db safety guard                  ', 'npx tsx tests/gate-db-guard.test.ts',
        'mission-016b boundary regression      ', 'npx tsx tests/mission-016b-boundary.test.ts',
        'phase1 PIN hardening                  ', 'npx tsx tests/phase1-pin-hardening.test.ts',
        'phase1 provisioning                   ', 'npx tsx tests/phase1-provisioning.test.ts',
        'phase1 invite dispatcher              ', 'npx tsx tests/phase1-invite-dispatcher.test.ts',
        'phase1 slice C vault UI               ', 'npx tsx tests/phase1-slice-c-vault.test.ts',
        'phase2 wizard                         ', 'npx tsx tests/phase2-wizard.test.ts',
        'phase2 wizard UI                      ', 'npx tsx tests/phase2-wizard-ui.test.ts',
        'refresh-token rotation                ', 'npx tsx tests/refresh-token-rotation.test.ts',
        'platform auth                         ', 'npx tsx tests/platform-auth.test.ts',
        'service tenant isolation              ', 'npx tsx tests/service-tenant-isolation.test.ts',
        'phase2 support bridge                 ', 'npx tsx tests/phase2-service-support.test.ts',
        'm017 phase A settle hardening         ', 'npx tsx tests/mission-017-phase-a.test.ts',
        'm017 A1 payment proof                 ', 'npx tsx tests/mission-017-a1-payment-proof.test.ts',
        'm017 phase B payment unification      ', 'npx tsx tests/mission-017-phase-b.test.ts',
    ];
    for (let i = 0; i < suites.length; i += 2) {
        const code = await run(suites[i].trim(), suites[i + 1]);
        if (code !== 0) failed = true;
    }

    // ---- 3. stop server before static gates ----
    if (serverProc) { try { process.platform === 'win32' ? spawnSync('taskkill', ['/pid', String(serverProc.pid), '/T', '/F']) : serverProc.kill(); } catch { } }
    await new Promise(r => setTimeout(r, 1000));

    // ---- 4. typecheck / build ----
    if (await run('typescript check', 'npx tsc --noEmit') !== 0) failed = true;
    if (await run('frontend production build', 'npm run build') !== 0) failed = true;

    // ---- summary ----
    console.log('\n================ RELEASE GATE SUMMARY ================');
    for (const r of results) {
        console.log(`${r.code === 0 ? 'PASS' : 'FAIL'}  ${r.name}  (${(r.ms / 1000).toFixed(1)}s)`);
        if (r.code !== 0) console.log('      tail: ' + r.tail.replace(/\n/g, '\n      '));
    }
    console.log('======================================================');
    console.log(failed ? 'RELEASE GATE: FAILED' : 'RELEASE GATE: PASSED');
    process.exit(failed ? 1 : 0);
}

if (require.main === module) {
    main().catch(async e => {
        console.error('[GATE] fatal:', e);
        if (serverProc) { try { process.platform === 'win32' ? spawnSync('taskkill', ['/pid', String(serverProc.pid), '/T', '/F']) : serverProc.kill(); } catch { } }
        process.exit(1);
    });
}

module.exports = { isAllowedGateDb, extractDbName, resolveDatabaseUrl };
