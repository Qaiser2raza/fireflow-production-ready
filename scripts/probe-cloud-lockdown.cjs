#!/usr/bin/env node
// TD-12 STEP 4 — cloud lockdown probe matrix (runbook: docs/work-in-progress/TD12_LOCKDOWN_RUNBOOK.md)
//
// Proves whether anonymous/authenticated identities can WRITE the SaaS cloud
// tables (license_keys, restaurants_cloud, subscription_payments).
//
// Safety: write probes target a NONEXISTENT row (ghost UUID). Under a REVOKE,
// PostgREST answers 403/42501 before any row matching. Under a drifted GRANT,
// the statement matches zero rows -> 204 and NOTHING is mutated. The suite is
// therefore read-safe by construction. INSERT probing is OFF by default
// (pollution risk); --with-insert enables it WITH immediate self-cleanup.
//
// Verdict semantics (exit codes are the single source of truth):
//   0  LOCKED          every EXECUTED write cell rejected; positive control OK
//   1  FATAL           harness/config failure
//   2  HOLES PRESENT   at least one executed write cell was accepted
//   3  INCOMPLETE      ran, but one or more cells were skipped (creds absent)
//
// Every skipped cell is labeled SKIP(reason) — never counted as PASS.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TABLES = ['license_keys', 'restaurants_cloud', 'subscription_payments'];
// Live PK columns (verified against cloudClient.ts usage + G4 diff audit):
const KEY_COL = { license_keys: 'id', restaurants_cloud: 'restaurant_id', subscription_payments: 'id' };
// Real writable columns per table (PGRST204-safe; live schema, not saas_schema.sql fiction)
const WRITE_COL = { license_keys: { status: 'active' }, restaurants_cloud: { subscription_status: 'active' }, subscription_payments: { status: 'pending' } };
const GHOST_ID = '00000000-0000-0000-0000-000000000000';
const BASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_KEY || '';
const PROBE_EMAIL = process.env.SUPABASE_PROBE_EMAIL || '';
const PROBE_PASSWORD = process.env.SUPABASE_PROBE_PASSWORD || '';
const WITH_INSERT = process.argv.includes('--with-insert');

if (!BASE || !ANON) {
    console.error('[PROBE] FATAL: SUPABASE_URL/VITE_SUPABASE_URL and an anon key are required.');
    console.error('[PROBE] Found url=' + Boolean(BASE) + ' anon=' + Boolean(ANON));
    process.exit(1);
}
console.log(`[PROBE] target=${BASE} anon_key_fp=${ANON.slice(0, 8)}… service_key_present=${Boolean(SERVICE)} insert_probes=${WITH_INSERT}`);

const results = [];
function cell(identity, table, op, state, detail) {
    results.push({ identity, table, op, state, detail });
    const mark = { LOCKED: 'PASS', HOLE: 'FAIL', INFO: 'info', SKIP: 'skip', ERROR: 'err!' }[state];
    console.log(`${mark.padEnd(4)} [${identity}] ${table}.${op.padEnd(6)} ${state.padEnd(9)} ${detail}`);
}

function classify(status, body) {
    // Hard deny surfaces: 401/403 (incl. 42501 permission denied mapped by Kong/PostgREST)
    if (status === 401 || status === 403) return { state: 'LOCKED', detail: `HTTP ${status} ${codeOf(body)}` };
    if (body && typeof body === 'object' && /^(42|44)/.test(String(body.code || ''))) {
        return { state: 'LOCKED', detail: `HTTP ${status} pgcode=${body.code}` };
    }
    // Zero-row success under an active GRANT: nothing mutated, but the door is OPEN
    if (status === 204 || status === 200) return { state: 'HOLE', detail: `HTTP ${status} accepted (zero-row)` };
    if (status === 404 && !codeOf(body)) return { state: 'HOLE', detail: 'HTTP 404 clean (grant active, row absent)' };
    if (status === 404) return { state: 'LOCKED', detail: `HTTP 404 ${codeOf(body)}` };
    return { state: 'ERROR', detail: `unexpected HTTP ${status}` };
}
function codeOf(body) {
    if (!body) return '';
    if (typeof body === 'string') { const m = body.match(/"code"\s*:\s*"([^"]+)"/); return m ? m[1] : ''; }
    return body.code ? String(body.code) : (body.message ? String(body.message).slice(0, 60) : '');
}

async function rest(method, table, query, key, body, prefer) {
    const res = await fetch(`${BASE}/rest/v1/${table}${query}`, {
        method,
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            ...(prefer ? { Prefer: prefer } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let parsed = null;
    const text = await res.text();
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text.slice(0, 120); }
    return { status: res.status, body: parsed };
}

async function probeMatrix(identityLabel, key) {
    for (const t of TABLES) {
        const sel = await rest('GET', t, '?select=id&limit=1', key);
        cell(identityLabel, t, 'SELECT', sel.status === 200 ? 'INFO' : 'INFO',
            sel.status === 200 ? 'HTTP 200 readable' : `HTTP ${sel.status} (${codeOf(sel.body) || 'not readable'})`);

        const patch = await rest('PATCH', t, `?${KEY_COL[t]}=eq.${GHOST_ID}`, key, WRITE_COL[t]);
        const pc = classify(patch.status, patch.body);
        cell(identityLabel, t, 'UPDATE', pc.state, pc.detail);

        const del = await rest('DELETE', t, `?${KEY_COL[t]}=eq.${GHOST_ID}`, key);
        const dc = classify(del.status, del.body);
        cell(identityLabel, t, 'DELETE', dc.state, dc.detail);

        if (!WITH_INSERT) {
            cell(identityLabel, t, 'INSERT', 'SKIP', 'default-off (pollution risk; use --with-insert)');
        } else {
            const ins = await rest('POST', t, '', key, { restaurant_id: GHOST_ID, transaction_id: `probe-${Date.now()}`, amount: 0.01, status: 'pending' }, 'return=representation');
            if (ins.status === 201) {
                const newId = Array.isArray(ins.body) && ins.body[0] ? ins.body[0].id : null;
                if (newId) await rest('DELETE', t, `?id=eq.${newId}`, key);
                cell(identityLabel, t, 'INSERT', 'HOLE', `HTTP 201 inserted${newId ? ' + cleaned up' : ' (CLEANUP FAILED id unknown)'}`);
            } else {
                const ic = classify(ins.status, ins.body);
                cell(identityLabel, t, 'INSERT', ic.state === 'ERROR' ? 'ERROR' : ic.state, ic.detail);
            }
        }
    }
}

async function main() {
    console.log('\n=== TD-12 LOCKDOWN PROBE MATRIX ===');
    await probeMatrix('anon', ANON);

    if (PROBE_EMAIL && PROBE_PASSWORD) {
        const authRes = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: { apikey: ANON, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: PROBE_EMAIL, password: PROBE_PASSWORD }),
        });
        if (authRes.ok) {
            const jwt = (await authRes.json()).access_token;
            await probeMatrix('authenticated', jwt);
        } else {
            for (const t of TABLES) cell('authenticated', t, 'ALL', 'SKIP', `probe login failed HTTP ${authRes.status}`);
        }
    } else {
        for (const t of TABLES) cell('authenticated', t, 'ALL', 'SKIP', 'SUPABASE_PROBE_EMAIL/PASSWORD not configured');
    }

    if (SERVICE) {
        const ctrl = await rest('GET', 'license_keys', '?select=id&limit=1', SERVICE);
        cell('service', 'license_keys', 'CONTROL', ctrl.status === 200 ? 'LOCKED' : 'ERROR',
            ctrl.status === 200 ? 'positive control OK (harness valid)' : `HTTP ${ctrl.status} — HARNESS BROKEN`);
    } else {
        cell('service', '(all)', 'CONTROL', 'SKIP', 'SUPABASE_SERVICE_KEY absent — positive control NOT RUN');
    }

    console.log('\n=== VERDICT ===');
    const holes = results.filter(r => r.state === 'HOLE');
    const errors = results.filter(r => r.state === 'ERROR');
    const skips = results.filter(r => r.state === 'SKIP');
    const executed = results.filter(r => ['LOCKED', 'HOLE'].includes(r.state));
    console.log(`executed=${executed.length} holes=${holes.length} skips=${skips.length} errors=${errors.length}`);

    if (errors.length > 0) { console.log('RESULT: ERROR — inspect unexpected responses'); process.exit(1); }
    if (holes.length > 0) { console.log('RESULT: HOLES PRESENT — lockdown required'); results.filter(r=>r.state==='HOLE').forEach(h => console.log(`  hole: [${h.identity}] ${h.table}.${h.op}`)); process.exit(2); }
    if (skips.length > 0) { console.log('RESULT: INCOMPLETE — evidence pending skipped cells'); process.exit(3); }
    console.log('RESULT: LOCKED — all executed write probes rejected, control green');
    process.exit(0);
}

main().catch(e => { console.error('[PROBE] FATAL:', e.message); process.exit(1); });
