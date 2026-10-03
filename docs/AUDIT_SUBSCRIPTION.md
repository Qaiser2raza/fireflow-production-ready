# Audit + Plan: tenant status / trial / subscription (Task 04a)

Date: 2026-10-03. **Read-only investigation.** No source file, schema, migration or database was
modified, and no test or seed was run. The only artifact is this document.

Target lifecycle (from the task): `TRIAL -> PENDING_REVIEW -> ACTIVE -> GRACE -> SUSPENDED`
(trial 14 days, owner uploads payment proof, super admin approves, short grace after period end, then
read-only suspension, never delete data). Tasks 04 and 04b are separate; payment proofs and the super
admin UI are **not** part of Task 04 — only their plug-in point is noted.

---

## 1. Existing status fields on `restaurants`

`prisma/schema.prisma:793-883` — the only tenant lifecycle data that exists locally:

| Column | Type | Default | Line | Notes |
|---|---|---|---|---|
| `is_active` | Boolean | `true` | `:802` | the only field any request path enforces |
| `subscription_status` | String (TEXT) | `'trial'` (lowercase) | `:803` | free text, no enum, no CHECK, no index |
| `subscription_plan` | String | `'BASIC'` | `:804` | plan; cloud CHECK allows only BASIC/STANDARD/PREMIUM |
| `monthly_fee` | Decimal? | — | `:807` | |
| `onboarding_status` | String | `'ACTIVE'` | `:820` | setup gate, only two values ever written |
| `subscription_expires_at` | DateTime? | — | `:824` | never read by any enforcement path |
| `trial_ends_at` | DateTime? | — | `:825` | never read by any enforcement path |

Absent: `current_period_end` (the role `subscription_expires_at` can play), `grace_ends_at`,
`suspended_at`, any `subscription_events` / status-history table, any status enum.
Origin: status/plan as `TEXT NOT NULL DEFAULT` in `prisma/migrations/20260105152051_reset_and_sync/migration.sql:279-280`;
`onboarding_status` in `20260823_phase2_onboarding_status/migration.sql:2`;
`trial_ends_at` / `subscription_expires_at` nullable in `20260322100000_reconcile_v3_and_credit_fields/migration.sql:95-96`;
`subscription_status` retyped TEXT in `20261001080100_financial_fk_hardening_and_drift_cleanup/migration.sql:197`.

Related tables: `license_keys` (`schema.prisma:321-333`: `is_active`, `expires_at`, `license_type`,
`device_limit`, no `revoked_at`), `subscription_payments` (`:1059-1076`: `status` default `pending`,
`payment_proof(_url)`, `verified_at/by`), `restaurant_features` (`:786-791`).
Cloud counterparts with real CHECKs: `supabase/saas_schema.sql:66`
(`subscription_status CHECK (trial, active, expired)`), `:21` (`plan CHECK IN BASIC/STANDARD/PREMIUM`),
`:112` (payment status).

### Where `subscription_status` is written

| Site | Value |
|---|---|
| `src/api/services/onboarding/RestaurantProvisioningService.ts:128` | `data.subscriptionStatus` (`'trial' \| 'active'`, default `'trial'` at `:81`), `trial_ends_at = now+30d` `:130` |
| `src/api/server.ts:460` | `'active'` after a successful license check |
| `src/api/server.ts:470` | `'expired'` when the local license is expired/tampered |
| `src/api/server.ts:543` | `'active'` when syncing from cloud `license_keys` |
| `src/api/services/SuperAdminService.ts:153` | `'active'` (`licenses/apply`) |
| `src/api/services/SuperAdminService.ts:287` | `'active'` + `subscription_expires_at` (`payments/verify`) |
| `src/hq/hqApi.ts:148` | `'active'` — **cloud only, bypasses the backend and never writes the local row** |

Where it is read: `src/api/server.ts:431,439,453,467,1302`;
`src/api/routes/platformRoutes.ts:44,83,203`; client/HQ only (`src/features/saas-hq/SuperAdminView.tsx:144,259-260`,
`src/hq/HQDashboard.tsx:362-367`). **No server middleware reads it.**

### Value drift (must be normalized before any enforcement)

- Local code writes lowercase `trial`/`active`/`expired`; many test fixtures write uppercase `ACTIVE`
  (e.g. `tests/mission-031-b-wac.test.ts:41`, `tests/f03-void-lifecycle.test.ts:41`).
- `scripts/browser-smoke.cjs:33` writes `'ACTIVE'` into `onboarding_status`, which is a different field
  with different casing conventions.
- Cloud CHECK allows only `(trial, active, expired)` — the five-state lifecycle does not fit without a
  new CHECK/enum on both sides.
- Plan drift: `prisma/seed.ts:119` writes `'enterprise'`, `scripts/db-cleanup-demo.ts:40` writes
  `'ENTERPRISE'`, while cloud accepts only BASIC/STANDARD/PREMIUM.

---

## 2. Existing payment / subscription code

| Component | What it calls | Behaviour today |
|---|---|---|
| `src/auth/guards/SubscriptionGuard.tsx:41-75` | `GET /api/licensing/status` every N seconds; cloud polling `:58-64` | Client-only: flips local state to `expired`/`unlicensed`. No server write. |
| `src/client/RestaurantContext.tsx:37,96-105` | none | Computes `subscriptionStatus: 'expired'` from dates and writes it to **local storage only** — never to the server. |
| `src/shared/lib/cloudClient.ts:317,324,341,374,389-404` | Supabase `restaurants_cloud` | Registers tenants as `trial`; derives `expired` in memory from `trial_ends_at`/`subscription_expires_at` without persisting. |
| `src/api/services/platform/SupabaseAdminService.ts:160` | cloud `restaurants_cloud` insert | `trial` on create. |
| `src/api/services/SuperAdminService.ts:239-305` | cloud `subscription_payments` + local `restaurants` | `verifyPayment`: sets payment status/verified_at/by `:254-263`, +30 days `:271`, cloud status `active` `:274-280`, local `subscription_status='active'` `:284-290` (errors only warned `:291-293`). |
| `src/api/services/licensing/LicenseService.ts` + `license.lic` | on-disk ES256-signed license (`src/api/services/licensing/LicenseService.ts:33`, payload keys `:11-19`) | `evaluateLocalLicenseStatus` `:173-236`: missing → `unlicensed`, bad signature/tenant/hardware/clock → `tampered`, past `expires_at + grace_period_days` → `expired`. |
| `verifyLicensingMiddleware` | `server.ts:3042-3066` | 402 `LICENSING_LOCKOUT` when the license is not `active`; **skipped** when `req.restaurantId` is absent/`SYSTEM` (`:3045`) and when `NODE_ENV=test` (`:3049`); mounted **only** on `protectedApiRouter` (`:3074-3075`). |
| `PATCH /api/saas/payments/:paymentId/verify` | `server.ts:4867` | Notification-only; writes nothing. Role check accepts MANAGER as well as SUPER_ADMIN `:4876`. |

Net effect: the only *server-side* gate today is the license **file**, it covers only the protected
router, and no code path ever enforces `subscription_status`.

---

## 3. Super admin today

Platform identity: `platform_users` (`schema.prisma:1644-1667`, role `PlatformRole`
`{PLATFORM_OWNER, SUPPORT_ENGINEER, SUPPORT_AGENT}` `:1614-1616`), platform JWT issuer/audience
`fireflow-platform` / `fireflow-platform-api` (`src/api/services/platform/PlatformJwtService.ts:24-25`),
middleware `src/api/middleware/platformAuthMiddleware.ts:14-68` (+ Supabase fallback `:42-50`).

`src/api/routes/platformRoutes.ts` (mounted `server.ts:3386`):

| Route | Line | Can do to a restaurant |
|---|---|---|
| `GET /tenants` | `:31` | list all, incl. `is_active` `:42`, `subscription_status` `:44` |
| `GET /tenants/:id` | `:69` | detail + staff list |
| `PATCH /tenants/:id/suspend` | `:112-137` | `is_active=false` `:117` + audit `TENANT_SUSPENDED` `:120-131`. **Revokes no tokens, no sockets.** |
| `PATCH /tenants/:id/activate` | `:139-163` | `is_active=true` `:143` + audit |
| `PATCH /tenants/:id/plan` | `:165-192` | plan + `subscription_expires_at` only; **cannot set status** |
| `GET/POST /licenses` | `:198,215` | list/generate license keys |
| `GET /audit`, `/support/sessions*` | `:263,287,335,361` | audit read, scoped support sessions |

Also `POST /api/restaurants` (`server.ts:811`) creates a tenant, and `DELETE /api/restaurants/:id`
(`server.ts:1320`, PLATFORM_OWNER) **hard-cascades** staff + license_keys + restaurant with no audit row
— the one place that violates "never delete data".

Legacy SaaS surface `/api/super-admin` (`server.ts:3090`, guarded by staff-JWT `requireRole('SUPER_ADMIN')`,
`superAdminRoutes.ts:17-18`): license generate/apply/revoke/delete `:43,65,83,99`,
`POST /payments/verify` `:122` (the only place a local `subscription_status` is set to `active`),
`GET /restaurants` `:147`, provisioning `:170`, staff PIN reset `:279`.

Client UI: `src/features/saas-hq/SuperAdminView.tsx` has **no suspend/activate control** (`is_active` is
only a badge `:377`); `src/hq/*` writes `restaurants_cloud` directly with the anon key
(`hqApi.ts:71-80`, `:119-170`) and can approve a payment **without ever updating the local tenant row**.

---

## 4. Entry points into tenant data

**The single choke point**: `authMiddleware.ts:156-173` selects `restaurants.is_active` +
`onboarding_status` and returns 403 `RESTAURANT_INACTIVE` / `SETUP_INCOMPLETE`. It is mounted on
`protectedApiRouter` (`:3074`) together with `verifyLicensingMiddleware` (`:3075`), and covers the
sub-routers `/` delivery `:3077`, `/` customer `:3078`, `/analytics` `:3079`, `/accounting*` `:3080-3081`,
`/reports` `:3082`, `/orders` `:3083`, `/cashier*` `:3084-3085`, `/shifts` `:3086`, `/inventory` `:3087`,
`/suppliers` `:3088`, `/finance` `:3089`, `/super-admin` `:3090`, `/printers` `:3091`.
**Gap:** ~90 inline `app.<method>` routes apply `authMiddleware` individually and therefore skip
`verifyLicensingMiddleware` entirely.

| Entry point | File:line | `is_active` today | subscription today |
|---|---|---|---|
| Owner password login | `AuthController.ts:450` → `issueOwnerSession:622`, check `:665-668` | yes | **TODO(Task 04) at `:670-671`** |
| Owner restaurant selection | `AuthController.ts:555` → `:610` | yes | no |
| Owner refresh (cookie) | `ownerSessionRefresh.ts:121-128` (`RESTAURANT_INACTIVE`, `revokeFamily:false`) | yes | no |
| Staff PIN / email login | `AuthController.ts:212`, check `:286` | yes | no |
| Staff register (legacy) | `AuthController.ts:140-148` | yes | no |
| Staff refresh rotation | `server.ts:1678-1688` | yes | no |
| `/api/auth/verify-pin`, `/change-pin` | `server.ts:1339,863` | via middleware | no |
| Device pairing generate/verify | `server.ts:4586,4645` | generate via middleware | no |
| Public: `GET /api/menu_categories` | `server.ts:3834-3839` (tenant from query) | **no auth at all** | no |
| Public: `GET /api/orders/qr-status/:id` | `server.ts:5128-5133` | no | no |
| Public: `POST /api/orders/qr` | `server.ts:5153,5179-5190` (env or first restaurant) | no | no |
| Public: onboarding / verify-email / licensing routes | `server.ts:667,763,606,665,944,993,346-496` | no | licensing routes write status |
| Sockets | connect `server.ts:227-265`, room auth `:269-288` | **no DB status read at connect** | no |
| Outbox reader | `server.ts:140`, `OutboxReader.ts:23-25,44-58` | no | no |
| Integration dispatcher | `server.ts:142`, `IntegrationDispatcher.ts:25-27,42-50` | no | no |
| Fiscal delivery | `server.ts:197-198`, `FiscalDeliveryService.ts:27-29,44-52` | no | no |
| Owner invite dispatcher | `server.ts:203-206`, `OwnerInviteDispatcher.ts:60-62` | no | no |
| sync-agent | `sync-agent/index.js:31-33` | stub, heartbeat only | no |

---

## 5. Deactivation today, and the live session

Deactivation mechanisms: platform suspend `is_active=false` (`platformRoutes.ts:117`); license
expiry/tamper → `subscription_status='expired'` (`server.ts:470`); license revoke → local
`license_keys.is_active=false` (`SuperAdminService.ts:211`) with **no** effect on the tenant row;
staff `status` (`authMiddleware.ts:148-154`); owner `users.is_active`
(`ownerSessionRefresh.ts:74-82`, family revoked on refresh).
**Not present:** any code writing `subscription_status` to a suspended/disabled value, any
`suspended_at`, any mass revocation of `refresh_tokens`/`user_sessions` on suspend.

Effect on an already logged-in session:
- `is_active=false` — **immediate**, on the next request via `authMiddleware.ts:167`; owner refresh also
  403s (`ownerSessionRefresh.ts:124`) but deliberately keeps the family (`revokeFamily:false` `:127`).
- `subscription_status` change — **no effect at all**, never read per request. The access token is valid
  for up to 15 minutes anyway.
- Sockets and background workers keep acting for a suspended tenant.

---

## Proposal (nothing implemented here)

### A. Minimum schema — reuse existing columns

1. **Reuse `restaurants.subscription_status`** as the single lifecycle field. Convert free text into a
   Prisma enum `SubscriptionStatus { TRIAL, PENDING_REVIEW, ACTIVE, GRACE, SUSPENDED }` with
   `@default(TRIAL)`, and add `@@index([subscription_status])` (today: no index, no CHECK).
2. **Reuse `subscription_plan`** as-is (optionally normalize casing later; out of scope).
3. **Reuse `trial_ends_at`** (`:825`) for the 14-day trial end.
4. **Reuse `subscription_expires_at`** (`:824`) as the current period end — no new date column needed.
   Grace end is derived: `subscription_expires_at + GRACE_DAYS` (constant, not a column).
5. **Add `subscription_events`** (append-only history, the only new table):
   `id uuid pk, restaurant_id uuid FK restaurants onDelete Cascade, from_status text, to_status text,
   actor_type text, actor_id text null, reason text null, created_at timestamptz default now()` +
   `@@index([restaurant_id, created_at])`. Append-only: no update/delete route ever targets it.
6. **One-time value normalization** in the same migration (before the enum swap):
   `trial`→`TRIAL`, `active`/`ACTIVE`→`ACTIVE`, `expired`→`GRACE` (expired is a grace situation, not a
   hard stop, so it must not read as "blocked"), anything else →`TRIAL`. Cloud `restaurants_cloud` needs
   the same CHECK widened to the five values.
7. **Existing rows** (seeded demo tenant, ~40 test-created tenants, dev DB): seeded tenant has a valid
   `license.lic` and should be `ACTIVE` with `subscription_expires_at` = its license expiry;
   `trial` rows get `trial_ends_at = COALESCE(trial_ends_at, created_at + 14 days)`. Tests that wrote
   `ACTIVE` are already `ACTIVE` after normalization. Because a value flip is invisible until a check
   exists, the migration must land **together with** the enforcement function, never before it.

### B. One enforcement function

```ts
// src/api/services/tenant/getTenantAccess.ts
export type TenantAccessMode = 'FULL' | 'READ_ONLY' | 'BLOCKED';
export interface TenantAccess {
  mode: TenantAccessMode;
  status: SubscriptionStatus;
  reason: string;
  daysLeft: number | null;
}
export async function getTenantAccess(db, restaurantId: string): Promise<TenantAccess>;
```

Rules: `TRIAL | PENDING_REVIEW | ACTIVE` → `FULL`; `GRACE` → `FULL` with `reason` + `daysLeft` so the UI
can show a warning; `SUSPENDED` → `READ_ONLY` (reads and exports allowed, every mutation rejected with
`402 TENANT_SUSPENDED`); `is_active === false` (platform suspend, emergency) → `BLOCKED` (403), which
keeps today's behaviour intact. `daysLeft` derived from `trial_ends_at` (TRIAL) or
`subscription_expires_at` (ACTIVE/GRACE).

Hook points, cheapest first:

1. **Owner login** — `AuthController.issueOwnerSession` right where the TODO is (`:670-671`), after the
   membership is resolved and before the session is issued.
2. **Owner refresh** — `resolveOwnerRefreshTarget` (`ownerSessionRefresh.ts`), where `RESTAURANT_INACTIVE`
   already lives (`:121-128`); add a `TENANT_SUSPENDED` failure code (READ_ONLY, do not revoke the
   family, so an upgrade restores the session without a new login).
3. **Staff login** — `AuthController.login` next to the existing `is_active` check (`:286`).
4. **Per request** — one new `tenantAccessMiddleware` mounted beside `authMiddleware` on
   `protectedApiRouter` (`:3074-3075`), with a short in-process TTL cache keyed by restaurant id, that
   rejects **mutating** methods when mode is `READ_ONLY`. This is what makes suspension effective on a
   live session; login-time checks alone would only bind at the next login.
5. **Sockets** — at `io.on('connection')` (`server.ts:246-253`) and on `join` (`:269-288`); force a
   disconnect for `BLOCKED`, and stop emitting `db_change` for `READ_ONLY` writes.
6. **Background jobs** — `OutboxReader.claimBatch` (`OutboxReader.ts:68`), `IntegrationDispatcher`
   (`:42-50`) and `FiscalDeliveryService` (`:44-52`) must skip `READ_ONLY`/`BLOCKED` tenants; fiscal
   delivery for a suspended tenant is a legal obligation, so it should be **allowed** (exceptions list).
7. **Public endpoints** — `GET /api/menu_categories` (`server.ts:3834`) and the QR routes (`:5128`,
   `:5153`) currently have no tenant check at all; a suspended tenant's menu/QR must stop being served.
8. **Admin writes** — extend `platformRoutes.ts` with `PATCH /tenants/:id/status` (`:165` pattern),
   writing the new column **and** appending to `subscription_events` in one transaction.

**Plug-in points for later tasks (not now):** `payment_proofs` upload → the owner endpoint that
transitions `TRIAL → PENDING_REVIEW`; `SuperAdminService.verifyPayment` (`SuperAdminService.ts:239-305`)
already flips status to `active` — it must become `ACTIVE` + event, and `PATCH /saas/payments/:id/verify`
(`server.ts:4867`, currently notification-only) is the obvious UI action to extend; `src/hq/hqApi.ts:119-170`
must stop writing the cloud row without the backend.

### C. Does a live session feel the change immediately?

- **Read-only**: yes, at the next mutating request (middleware), plus socket/job suppression. Reads keep
  working, so the owner sees a banner instead of a wall.
- **Full block** (platform suspend / `is_active=false`): already immediate today via `authMiddleware:167`;
  the new middleware reuses that path rather than adding a second mechanism.
- **Access tokens** stay valid up to 15 minutes (`AuthController.ts:736`), so the very first request after
  a status flip can still succeed unless the middleware is what blocks it — another reason the check must
  be middleware-first, not login-only.
- **Refresh cookies** (7 days, `UserSessionService.ts:18`) should *not* be mass-revoked on suspension;
  `resolveOwnerRefreshTarget` returning `TENANT_SUSPENDED` with `revokeFamily:false` lets an upgraded
  tenant resume seamlessly.

### D. Risks

1. **Enum swap can brick tenants** if any row holds an unexpected string; normalize first and assert zero
   unmapped rows in the migration (dry-run SELECT in the release gate).
2. **Cloud/local divergence** worsens: `hqApi.ts:119-170` writes the cloud row directly, and
   `subscription_status` CHECK there allows only 3 values. Two writers, one enum, no audit.
3. **~40 test fixtures** write `ACTIVE`/`trial` in mixed case; the enum makes them fail loudly at insert
   time — good, but every suite must be updated in the same task.
4. **The bypass surface is large**: ~90 inline routes skip `verifyLicensingMiddleware`, three public routes
   have no auth at all, and workers/sockets never check status. A middleware-only plan leaves holes unless
   the inline routes are mounted through the protected router (or the middleware is applied app-wide).
5. **Read-only is easy to fake** if enforcement is a UI concern: it must be the middleware rejecting
   non-GET/HEAD methods, not a disabled button.
6. **Fiscal/legal** obligations may require outbound documents to continue during suspension; treat
   fiscal delivery as an explicit exception rather than a blanket job stop.
7. `DELETE /api/restaurants/:id` (`server.ts:1320`) deletes tenant data outright — it must be removed or
   converted to SUSPENDED before the lifecycle can claim "never delete data".

### E. Smallest safe order of work

1. **Normalize + enum + index + `subscription_events`** (additive migration, no enforcement yet) and
   prove drift with `prisma migrate diff --from-migrations … --to-schema-datamodel … --shadow-database-url fireflow_shadow`.
2. **`getTenantAccess`** + unit tests (pure function, no routes changed).
3. **Login/refresh checks** (owner `issueOwnerSession` TODO, `resolveOwnerRefreshTarget`, staff login) —
   READ_ONLY is returned as a *warning* here, not a block, so nothing breaks for existing tenants.
4. **`tenantAccessMiddleware`** on `protectedApiRouter` + extend to the inline routes; then enable the
   READ_ONLY rejection (feature flag by tenant first, globally second).
5. **Sockets + workers** suppression, with the fiscal exception.
6. **Public/QR endpoints** gating; remove `DELETE /api/restaurants/:id`.
7. Later: payment proof upload → `PENDING_REVIEW`, super admin approve/reject → `ACTIVE`/`GRACE`, each
   appending a `subscription_events` row.