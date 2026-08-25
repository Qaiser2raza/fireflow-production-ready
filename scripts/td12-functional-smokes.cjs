#!/usr/bin/env node
// TD-12 T-4 — functional smokes: prove service-role writes still work post-lockdown.
// One insert per table → verify → cleanup. No pollution left behind.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BASE = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
if (!BASE || !KEY) { console.error('[SMOKE] FATAL: SUPABASE_URL and SUPABASE_SERVICE_KEY required'); process.exit(1); }

const results = [];
function cell(label, ok, detail) { results.push({ label, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(36)} ${detail}`); }

async function rest(method, table, query, body, prefer) {
  const res = await fetch(`${BASE}/rest/v1/${table}${query || ''}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text.slice(0, 200); }
  return { status: res.status, body: parsed };
}

async function smoke() {
  console.log('\n=== TD-12 FUNCTIONAL SMOKES (service key) ===\n');
  const { randomUUID } = require('crypto');

  // 1) restaurants_cloud — must persist through subscription_payments insert
  const cloudUuid = randomUUID();
  const restIns = await rest('POST', 'restaurants_cloud', '', {
    restaurant_id: cloudUuid,
    name: 'SMOKE TEST',
    slug: 'smoke-' + Date.now(),
    subscription_plan: 'BASIC',
    subscription_status: 'trial',
    monthly_fee: 0,
    currency: 'PKR',
  }, 'return=representation');
  const restRowId = Array.isArray(restIns.body) && restIns.body[0]?.id ? restIns.body[0].id : null;
  cell('restaurants_cloud INSERT', restIns.status === 201 && !!restRowId, `HTTP ${restIns.status} rowId=${restRowId ? restRowId.slice(0,8) : 'none'}`);

  // 2) subscription_payments — uses the cloud restaurant_id
  const payUuid = randomUUID();
  const payIns = await rest('POST', 'subscription_payments', '', {
    restaurant_id: cloudUuid,
    transaction_id: payUuid,
    amount: 0.01,
    payment_method: 'CASH',
    status: 'pending',
  }, 'return=representation');
  const payId = Array.isArray(payIns.body) && payIns.body[0]?.id ? payIns.body[0].id : null;
  cell('subscription_payments INSERT', payIns.status === 201 && !!payId, `HTTP ${payIns.status} id=${payId ? payId.slice(0,8) : 'none'}`);
  if (payId) {
    const payDel = await rest('DELETE', 'subscription_payments', `?id=eq.${payId}`);
    cell('subscription_payments DELETE (cleanup)', payDel.status === 204 || payDel.status === 404, `HTTP ${payDel.status}`);
  }

  // 3) license_keys — column is `key`, not `license_key`
  const licIns = await rest('POST', 'license_keys', '', {
    key: 'smoke-lic-' + Date.now() + '-' + randomUUID().slice(0,8),
    plan: 'BASIC',
    status: 'unused',
  }, 'return=representation');
  const licId = Array.isArray(licIns.body) && licIns.body[0]?.id ? licIns.body[0].id : null;
  cell('license_keys INSERT', licIns.status === 201 && !!licId, `HTTP ${licIns.status} id=${licId ? licId.slice(0,8) : 'none'}`);
  if (licId) {
    const licDel = await rest('DELETE', 'license_keys', `?id=eq.${licId}`);
    cell('license_keys DELETE (cleanup)', licDel.status === 204 || licDel.status === 404, `HTTP ${licDel.status}`);
  }

  // cleanup restaurants_cloud last (after subscription_payments FK consumer is gone)
  if (restRowId) {
    const restDel = await rest('DELETE', 'restaurants_cloud', `?id=eq.${restRowId}`);
    cell('restaurants_cloud DELETE (cleanup)', restDel.status === 204 || restDel.status === 404, `HTTP ${restDel.status}`);
  }

  console.log('\n=== SMOKE VERDICT ===');
  const fails = results.filter(r => !r.ok);
  if (fails.length) { fails.forEach(f => console.log(`FAIL: ${f.label} — ${f.detail}`)); process.exit(1); }
  console.log('RESULT: ALL SMOKES PASS — service-role write path intact post-lockdown');
  process.exit(0);
}

smoke().catch(e => { console.error('[SMOKE] FATAL:', e.message); process.exit(1); });
