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

- RLS is **enabled** on all three tables (anon INSERT → 42501).
- A **drifted UPDATE-granting policy** exists live on `license_keys` and
  `restaurants_cloud` (anon PATCH → 204, including full status flips). It is
  absent from `supabase/saas_schema.sql` (which grants anon SELECT only) —
  someone loosened the live DB outside migrations.
- `subscription_payments` policy state unverified (Q3) — capture in STEP 0.

## Client-code inventory (STEP 2 — complete)

Every direct touchpoint of the three tables, repo-wide:

| Surface | Table(s) | Ops | Client credential | Fate under lockdown |
|---|---|---|---|---|
| `src/hq/hqApi.ts` (Vercel HQ console, `hq.html`) | license_keys, restaurants_cloud, subscription_payments | SELECT, INSERT, UPDATE | anon (`VITE_SUPABASE_ANON_KEY`) | **BREAKS** — hqAddRestaurant, hqRevokeLicense, hqVerifyPayment all anon-writers. Stub or route through service-key API in same window. |
| `src/operations/pos/PaymentSubmissionView.tsx` (POS Billing → submit payment) | subscription_payments | INSERT | anon | **BREAKS** — tenant-facing payment-proof submission. Stub UI or add authenticated server endpoint before/with revocation. |
| `src/shared/lib/cloudClient.ts` | all three | SELECT/INSERT/UPDATE/DELETE | anon (browser) or anon-fallback (server) | `checkLicenseKey`/`activateLicenseKey`/`registerRestaurant`/`submitPaymentProof`: zero callers (dead, G5 sweep). `getPaymentHistory`/`getSubscriptionStatus`: reads only (BillingView). `generateLicenseKey`/`revokeLicenseKey`/`deleteLicenseKey`/`getLicenseKeys`: server-called via Vault → need service key configured (STEP 5). |
| `src/api/services/SuperAdminService.ts` | license_keys, subscription_payments, restaurants_cloud | INSERT/UPDATE/SELECT | anon-fallback (`getSupabaseClient`) | Needs service key (STEP 5); JWT-overwrite update (line 83) also RLS-blocked for anon today. |
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
- **STEP 1 (done/independent):** REST row-level baseline of demo data.
- **STEP 2 (done):** client-code inventory — this document.
- **STEP 3 (founder):** DROP the drifted write policies by captured name;
  `REVOKE INSERT, UPDATE, DELETE ON license_keys, restaurants_cloud, subscription_payments FROM anon;`
  and the same `FROM authenticated;` (license administration is a platform
  role, not a tenant role). No `FORCE RLS` (service_role BYPASSRLS; revisit
  only if owner-role connections are verified).
- **STEP 4:** re-run probe matrix — all mutations must reject for anon AND
  authenticated-tenant contexts, **including a positive control**: one
  service-role write that must succeed (distinguishes "locked down" from
  "harness broken").
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
