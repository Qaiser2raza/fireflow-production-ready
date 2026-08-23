// FireFlow Release Gate — independent, sequential verification orchestrator.
// Boots its own API server (NODE_ENV=test), runs every security-relevant suite
// STRICTLY SEQUENTIALLY (concurrent DB-bound HTTP suites interfere), then
// type-checks and builds. Exit code is the single source of truth for CI.
// Usage: node scripts/release-gate.cjs
const { spawn, spawnSync } = require('child_process');
const net = require('net');

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

    // ---- 1. boot API server (test mode) ----
    log('BOOT api server (NODE_ENV=test) on :3001');
    serverProc = spawn('npx cross-env NODE_ENV=test LOGIN_RATE_LIMIT_MAX=10000 VERIFY_PIN_RATE_LIMIT_MAX=10000 npx tsx src/api/server.ts', { shell: true, stdio: 'ignore' });
    await waitForPort(3001);
    log('BOOT api ready');

    // ---- 2. suites — strictly sequential by design ----
    const suites = [
        'mission-016b boundary regression      ', 'npx tsx tests/mission-016b-boundary.test.ts',
        'phase1 PIN hardening                  ', 'npx tsx tests/phase1-pin-hardening.test.ts',
        'phase1 provisioning                   ', 'npx tsx tests/phase1-provisioning.test.ts',
        'phase1 invite dispatcher              ', 'npx tsx tests/phase1-invite-dispatcher.test.ts',
        'phase1 slice C vault UI               ', 'npx tsx tests/phase1-slice-c-vault.test.ts',
        'phase2 wizard                         ', 'npx tsx tests/phase2-wizard.test.ts',
        'refresh-token rotation                ', 'npx tsx tests/refresh-token-rotation.test.ts',
        'platform auth                         ', 'npx tsx tests/platform-auth.test.ts',
        'service tenant isolation              ', 'npx tsx tests/service-tenant-isolation.test.ts',
        'phase2 support bridge                 ', 'npx tsx tests/phase2-service-support.test.ts',
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

main().catch(async e => {
    console.error('[GATE] fatal:', e);
    if (serverProc) { try { process.platform === 'win32' ? spawnSync('taskkill', ['/pid', String(serverProc.pid), '/T', '/F']) : serverProc.kill(); } catch { } }
    process.exit(1);
});
