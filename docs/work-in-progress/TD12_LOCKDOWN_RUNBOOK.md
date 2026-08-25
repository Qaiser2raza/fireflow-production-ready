---
status: DRAFT
audience:
  - engineering
  - founder
owner: FireFlow team
last_reviewed: 2026-08-25
source: TD-12 lockdown (F-V3 G-probes, Fable 5 revised runbook)
sensitivity: internal
---

# TD-12 Lockdown Runbook (DRAFT)

Single coordinated change window to close the anonymous-write hole in the SaaS
cloud tables. Critical path: founder-held Supabase console access (STEP 0).

## Verified facts (2026-08-25 probes)

- RLS is **enabled** on all three tables (anon INSERT → 42501 everywhere).
- **Drifted-policy matrix (ghost-row probes, zero mutations):**

| Table | anon SELECT | anon INSERT | anon UPDATE | anon DELETE |
|---|---|---|---|---|
| `license_keys` | yes (rows visible) | **blocked (42501)** | **OPEN (204)** | **OPEN (204)** |
| `restaurants_cloud` | yes | **blocked (42501)** | **OPEN (204)** | **OPEN (204)** |
| `subscription_payments` | yes (0 rows) | **blocked (42501)** | **OPEN (204)** | **OPEN (204)** |

  Live policies grant anonymous UPDATE + DELETE on every SaaS table; INSERT is
  denied everywhere. Anyone on the internet can modify or delete any license or
  billing row today.
- Column-level drift confirmed too: `saas_schema.sql` declares `plan` on
  `restaurants_cloud`; live column is `subscription_plan` (PGRST204). The file
  is fiction; G4's full diff audit stands.
- Forensic baseline archived: `scratch/forensic_baseline_2026-08-25.json`
  (3 license keys, 1 demo restaurant row, 0 payments).
- `subscription_payments` state (Q3): INSERT blocked ⇒ the POS payment-proof
  modal (`PaymentSubmissionView`) has never been able to persist — it shows
  "Database Error: new row violates row-level security policy…" to users.
  Loud failure, not silent data loss, but the feature is dead at the DB layer.
- Provenance (Q1) still requires STEP 0 dashboard capture of `pg_policies`.

## Client-code inventory (STEP 2 — complete)

Every direct touchpoint of the three tables, repo-wide:

| Surface | Table(s) | Ops | Client credential | Fate under lockdown |
|---|---|---|---|---|
| `src/hq/hqApi.ts` (Vercel HQ console, `hq.html`) | license_keys, restaurants_cloud, subscription_payments | SELECT, INSERT, UPDATE | anon (`VITE_SUPABASE_ANON_KEY`) | Mixed TODAY: updates work through the hole; inserts already fail (42501 / wrong columns). Under lockdown updates die too — stub or route through service-key API in same window. |
| `src/operations/pos/PaymentSubmissionView.tsx` (POS Billing → submit payment) | subscription_payments | INSERT | anon | **ALREADY BROKEN** (INSERT blocked; UI shows DB error). Stub UI now; real fix = authenticated server endpoint post-lockdown. |
| `src/shared/lib/cloudClient.ts` | all three | SELECT/INSERT/UPDATE/DELETE | anon (browser) or anon-fallback (server) | INSERT paths (`registerRestaurant`, `submitPaymentProof`, `generateLicenseKey`, activation writes): **already broken off-HQ**. `revokeLicenseKey`/`deleteLicenseKey`: work through the hole today; die under lockdown until service key (STEP 5). `getPaymentHistory`/`getSubscriptionStatus`/`checkLicenseKey`: reads only. Activation functions: zero callers (G5 sweep). |
| `src/api/services/SuperAdminService.ts` | license_keys, subscription_payments, restaurants_cloud | INSERT/UPDATE/SELECT | anon-fallback (`getSupabaseClient`) | Insert path already broken; verify-payment update works through the hole today. Needs service key (STEP 5). |
| `src/api/services/platform/SupabaseAdminService.ts` | restaurants_cloud | SELECT, INSERT (upsert) | **service key only** (`isConfigured()` gate) | Unaffected once configured; currently idle locally. |
| `src/api/server.ts` (licensing sync :482, payments list :2487) | license_keys, subscription_payments | SELECT | anon-fallback | Reads stay open pre-full-RLS; revisit at policy design. |
| `src/client/RestaurantContext.tsx:65` | subscription_payments | SELECT (limit 1) | anon | Read — unaffected by write revocation. |
| `qr-pwa/src/lib/api.ts:19` | restaurants_cloud | SELECT by slug | anon | Read — unaffected. |
| `api/generate-license.ts` (Vercel fn) | license_keys | INSERT | **service key, fail-closed** | Model citizen — the post-lockdown pattern. |
| `scripts/test-hq-flow.ts`, `scripts/test-enterprise.ts` | license_keys | INSERT/SELECT | service/anon | Dev scripts; update or ignore. |

**Answer to Q2:** yes — two shipped surfaces depend on anon writes: the HQ
console and the POS payment-submission modal. Both must be stubbed or
re-routed inside the lockdown window, or revocation converts the hole into
silent UX breakage.

## Change window (single sequence)

- **STEP 0 (founder, dashboard):** capture forensic baseline —
  `select * from pg_policies where tablename in ('license_keys','restaurants_cloud','subscription_payments');`
  and `select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name in (...);`
  Archive output before touching anything. Answers Q1 (policy provenance) and Q3.

  Copy-paste block (Supabase dashboard → SQL Editor, run as one script):

  ```sql
  -- STEP 0a: policy provenance capture
  select tablename, policyname, cmd, roles, qual, with_check
    from pg_policies
   where schemaname = 'public'
     and tablename in ('license_keys','restaurants_cloud','subscription_payments')
   order by tablename, policyname;

  -- STEP 0b: grant capture
  select table_name, grantee, privilege_type
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('license_keys','restaurants_cloud','subscription_payments')
   order by table_name, grantee, privilege_type;
  ```

  Archive both result grids next to `scratch/forensic_baseline_2026-08-25.json`.

- **STEP 1 (done/independent):** REST row-level baseline of demo data.
- **STEP 2 (done):** client-code inventory — this document.
- **STEP 3 (founder):** DROP the drifted write policies by captured name;
  `REVOKE INSERT, UPDATE, DELETE ON license_keys, restaurants_cloud, subscription_payments FROM anon;`
  and the same `FROM authenticated;` (license administration is a platform
  role, not a tenant role). No `FORCE RLS` (service_role BYPASSRLS; revisit
  only if owner-role connections are verified).

  Copy-paste block (same SQL Editor session, AFTER archiving STEP 0 output).
  The DO-loop drops by live catalog inspection — no name transcription risk:

  ```sql
  -- STEP 3a: drop every policy on the three tables that grants anything to anon
  do $$
  declare r record;
  begin
    for r in
      select schemaname, tablename, policyname
        from pg_policies
       where schemaname = 'public'
         and tablename in ('license_keys','restaurants_cloud','subscription_payments')
         and 'anon' = any(roles)
    loop
      execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
      raise notice 'dropped policy % on %.%', r.policyname, r.schemaname, r.tablename;
    end loop;
  end $$;

  -- STEP 3b: revoke DML from anon AND authenticated (service_role bypasses via BYPASSRLS)
  revoke insert, update, delete on license_keys, restaurants_cloud, subscription_payments from anon;
  revoke insert, update, delete on license_keys, restaurants_cloud, subscription_payments from authenticated;

  -- STEP 3c: post-state capture (archive alongside STEP 0 grids)
  select table_name, grantee, privilege_type
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('license_keys','restaurants_cloud','subscription_payments')
     and grantee in ('anon','authenticated')
   order by table_name, grantee;
  ```

- **STEP 4:** re-run probe matrix — all mutations must reject for anon AND
  authenticated-tenant contexts, **including a positive control**: one
  service-role write that must succeed (distinguishes "locked down" from
  "harness broken").

  Executable: `node scripts/probe-cloud-lockdown.cjs` (committed). Zero-mutation
  ghost-row technique; exit 0=LOCKED / 2=HOLES / 3=INCOMPLETE(skips) / 1=fatal.
  Pre-lockdown live run 2026-08-26: exit 2 — anon U+D open on all three tables
  (6/6 executed cells), zero mutations performed. Service control + authenticated
  cells remain SKIP until founder credentials land.
- **STEP 5 (same window, separate commit):** configure `SUPABASE_URL` +
  `SUPABASE_SERVICE_KEY` on the Vault node; explicitly verify
  `verifyPayment`, `generateLicenseKey` cloud insert, `OwnerInviteDispatcher`.
- **STEP 6:** commit probe suite + evidence + register updates.

## Follow-ups (ledgered, out of this window)

- Remove the anon-key fallback for privileged server-side calls
  (`initializeCloudClient`) — fail-open → loud configuration error (G2 doctrine).
- Full schema + policy diff audit once service credentials exist (G4 expanded);
  regenerate `saas_schema.sql` from live truth or migrate live to file — one
  direction, deliberately chosen.
- Dead-surface sweep (G5): orphaned `ActivationView`s, zero-caller cloudClient
  functions, `licenses/apply` display-status write.
- Automated negative-matrix probe suite wired into the release gate (C4).
