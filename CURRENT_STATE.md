# Current State

## Repository Snapshot

| Attribute | Value |
|---|---|
| **Branch** | `main` |
| **Ahead of remote** | 0 commits |
| **Working tree** | Clean except untracked `scripts/dev-set-owner-password.ts` |
| **Untracked** | `scripts/dev-set-owner-password.ts` (DEV ONLY helper, not committed) |
| **Latest commit** | `81e2bb5 feat(identity): cloud identity tables, financial FK hardening, drift cleanup` |
| **Node engines** | >=18.0.0 |
| **Database** | PostgreSQL via Prisma Client 6 |
| **Frontend** | React 19 + Vite 6 + Tailwind CSS 4 |
| **Backend** | Express 4 + Socket.IO 4 |
| **Desktop** | Electron 39 |
| **Cloud** | Supabase (SaaS licensing, payments, HQ) |

---

## Major Applications

| Application | Path | Status |
|---|---|---|
| **POS / Main App** | `src/client/` | VERIFIED — React app with HashRouter, role-based views |
| **HQ** | `src/hq/` | VERIFIED — Separate Vite build mode, Supabase auth |
| **PWA** | `pwa/` | PARTIAL — Menu browsing + cart, no checkout |
| **QR PWA** | `qr-pwa/` | PARTIAL — Table-specific ordering, tracking |
| **Electron Wrapper** | `electron-main.cjs`, `electron/` | VERIFIED — Spawns local server, IPC for printing |

---

## Backend

| Component | Status |
|---|---|
| **Express server** | VERIFIED — `src/api/server.ts`, 3,060 lines, 87 route definitions |
| **Route modules** | PARTIAL — Some routes extracted to `src/api/routes/`, many inline routes remain in `server.ts` |
| **Auth middleware** | PARTIAL — JWT + refresh exists, but many inline routes bypass `authMiddleware` |
| **Socket.IO** | VERIFIED — Restaurant-scoped rooms, `db_change` events, reconnection |
| **Services** | VERIFIED — Order services, accounting, journal, reports, delivery, pairing, licensing, printing |
| **Validation** | PARTIAL — Zod used on critical endpoints, not uniformly applied |
| **Rate limiting** | VERIFIED — `express-rate-limit` configured |
| **Error tracking** | PARTIAL — Sentry initialized but not fully instrumented |
| **Swagger / OpenAPI** | BROKEN — `openapi.json` describes Supabase/PostgREST, not current Express API |

---

## Frontend

| Component | Status |
|---|---|
| **App shell** | VERIFIED — `src/client/App.tsx`, context providers, routing |
| **Auth views** | VERIFIED — Login, registration, device pairing, session expired |
| **POS views** | VERIFIED — Dine-in, takeaway, delivery, variants, payment |
| **KDS** | VERIFIED — Kitchen display, item status, fire batches |
| **Logistics** | VERIFIED — Rider hub, shifts, settlements |
| **Finance** | VERIFIED — COA, journal entries, trial balance, reports |
| **Settings** | VERIFIED — Staff, printers, floor plan, features, business profile |
| **Super Admin** | VERIFIED — License management, restaurant overview |
| **Dashboard** | VERIFIED — Floor view, metrics, order command hub |
| **Customers** | VERIFIED — CRUD, addresses, credit ledgers |
| **Menu** | VERIFIED — Categories, items, variants, availability |
| **AI Assistant** | PARTIAL — Frontend-only Gemini chatbot (`AURAAssistant.tsx`) |

---

## Database

| Component | Status |
|---|---|
| **Schema** | VERIFIED — 47 models, 11 enums in `prisma/schema.prisma` |
| **Migrations** | VERIFIED — 26 committed migrations, 1 uncommitted |
| **Tenant root** | VERIFIED — `restaurants` model |
| **Order model** | VERIFIED — Base `orders` with 1:1 type extensions |
| **Accounting** | VERIFIED — COA, journal entries, journal entry lines, ledger entries |
| **Inventory** | VERIFIED — Items, purchase orders, recipes, stock counts, stock movements, WAC tracking; M030-M033 audit suites 171/171 PASS |
| **Audit** | VERIFIED — `audit_logs`, `approval_logs`, `system_logs`, `security_events` |
| **SaaS** | VERIFIED — `license_keys`, `subscription_payments`, `restaurant_features` |
| **QR ordering** | PARTIAL — QR order type added in uncommitted migration |

---

## Modules & Capabilities

| Capability | Status |
|---|---|
| **Tenant provisioning** | VERIFIED |
| **Authentication** | PARTIAL — JWT works, but plaintext PIN fallback and `saved_pin` in localStorage remain |
| **Business profile** | VERIFIED |
| **POS** | VERIFIED |
| **Orders** | VERIFIED |
| **KDS** | VERIFIED |
| **Menu** | VERIFIED |
| **Inventory** | VERIFIED — Stock counts, stock movements, WAC projections; all Phase A/B/C/D audit suites pass 171/171 |
| **Accounting/Finance** | VERIFIED — Dual ledger systems need consolidation |
| **Customers** | VERIFIED |
| **Delivery/Riders** | VERIFIED |
| **CMS** | MISSING |
| **Website** | MISSING — Only PWA menu browsing |
| **QR ordering/PWA** | PARTIAL — Integration in progress |
| **Reporting** | VERIFIED |
| **AI** | PARTIAL — Frontend-only chatbot, no backend intelligence |
| **Data retention/purge** | PARTIAL — Soft delete + 24h draft cleanup |

---

## Known Security Concerns

| Concern | Severity |
|---|---|
| `staff.pin` + `staff.hashed_pin` coexistence | HIGH |
| Plaintext PIN login fallback | HIGH |
| `saved_pin` in localStorage | HIGH |
| Inconsistent `authMiddleware` enforcement | CRITICAL |
| Generic table API with arbitrary filters | HIGH |
| Unauthenticated inline routes in `server.ts` | HIGH |
| Live Supabase credentials in `.env.example` | MEDIUM |

---

## Test Status

| Component | Status |
|---|---|
| **Test runner** | MISSING — `package.json` has placeholder scripts |
| **CI** | PARTIAL — Runs typecheck + build, no tests |
| **Project tests** | VERIFIED — 171 client-contract assertions across M030/M031/M032/M033 suites, all PASS |
| **Unit tests** | MISSING |
| **Coverage** | UNKNOWN — No coverage tooling configured |

---

## Deployment State

| Target | Status |
|---|---|
| **Local Windows** | VERIFIED — Electron wrapper + local PostgreSQL |
| **Web POS** | VERIFIED — Vite dev server on port 3000, proxy to 3001 |
| **HQ (Vercel)** | VERIFIED — `vercel.json` configured, separate build mode |
| **PWA** | PARTIAL — Exists but not fully integrated |
| **QR PWA** | PARTIAL — Exists but integration in progress |

---

## Uncommitted Work

| File | Nature |
|---|---|
| `scripts/dev-set-owner-password.ts` | DEV ONLY, never deploy. Sets `staff.email` / `password_hash` / `is_email_verified=true` on a signup owner. Refuses to run when `NODE_ENV=production` or `DATABASE_URL` is not localhost/127.0.0.1. Reads `OWNER_EMAIL` and `NEW_PASSWORD` from env only. Still useful for owners provisioned before Task 02. |
| `src/features/onboarding/RestaurantLanding.tsx` | Task 02 — signup form collects Password + Confirm password. |
| `src/features/onboarding/SetupTokenDisplay.tsx` | Task 02 — "Check your email" confirmation, PIN relabelled as the POS PIN for staff devices. |
| `src/api/server.ts` | Task 02 — `/api/onboarding/start` requires a password, rejects duplicate account emails with 409, per-IP signup limiter, `GET /api/auth/verify-email` link endpoint. |
| `src/api/services/onboarding/RestaurantProvisioningService.ts` | Task 02 — `ownerPassword` support, `users` + `memberships` creation, duplicate-email rejection, sanitized owner projection. Task 03 removed the TEMP `staff` credential dual-write. |
| `src/api/controllers/AuthController.ts` | Task 02 — exported `BCRYPT_COST`, shared `applyVerification`, `verifyEmailLink` GET handler. Task 03 — `users` login path, `loginOwner`, `selectRestaurant`, `issueOwnerSession`. |
| `src/api/services/EmailVerificationService.ts` | Task 02 — `logDevVerificationLink` (local dev only, silent in staging/production and when an email provider is configured). |
| `tests/signup-owner-password.test.ts` | Task 02 — 43 assertions, self-cleaning by id. |
| `src/api/services/auth/UserSessionService.ts` | Task 03 — NEW. `user_sessions` issue/rotate/revoke, sha256 hashes only, httpOnly cookie helpers, lockout constants. |
| `src/api/services/auth/JwtService.ts` | Task 03 — 5-minute `selection` token (sign + verify); never accepted as an access token. |
| `src/api/server.ts` | Task 03 — `/api/auth/select-restaurant`, cookie-driven owner refresh (`handleUserSessionRefresh`), logout revokes the user session, `USER_SESSION_ROTATED` audit. |
| `src/auth/views/LoginView.tsx` | Task 03 — restaurant picker for multi-workspace accounts. |
| `src/client/App.tsx`, `src/shared/types.ts`, `src/shared/lib/authInterceptor.ts` | Task 03 — selection hand-off, `LoginResult` type, cookie-based silent refresh. |
| `tests/owner-login-sessions.test.ts` | Task 03 — 65 assertions, self-cleaning by id. |
| `tests/_test-db-guard.ts`, `scripts/run-tests.ts` | Task 03c — NEW. Global disposable-test-database guard and sequential suite runner used by `npm test` / `npm run test:safe`. |
| `prisma/schema.prisma`, `prisma/migrations/20261003010000_tenant_subscription_status_enum/` | Task 04-1 — NEW. `SubscriptionStatus` / `SubscriptionActorType` enums on `restaurants.subscription_status` (+ index) and the append-only `subscription_events` table (FK RESTRICT). One additive migration with the pre-check query in a header comment and a fail-closed value map. |
| `src/api/services/tenant/getTenantAccess.ts` | Task 04-2 — NEW. `evaluateTenantAccess(row, now)` / `getTenantAccess(db, restaurantId, now?)`, `buildTenantAccessWarning()`, `GRACE_DAYS`/`TRIAL_DAYS` with env override, `TenantNotFoundError`. |
| `src/api/services/tenant/setSubscriptionStatus.ts` | Task 04-2 — NEW. Single writer: status change + `subscription_events` row in one transaction. |
| `src/api/controllers/AuthController.ts` | Task 04 — tenant access check in `issueOwnerSession` (the old `TODO(Task 04)` marker) and in the staff email/PIN login; `warning` field on both responses; `TENANT_BLOCKED` on BLOCKED. |
| `src/api/services/auth/ownerSessionRefresh.ts`, `src/api/server.ts` | Task 04 — `resolveOwnerRefreshTarget` derives tenant access (READ_ONLY keeps the family, BLOCKED ends it), refresh payload carries `tenantAccess` + `warning`; licensing routes stopped writing `subscription_status`. |
| `src/api/services/SuperAdminService.ts`, `src/api/services/onboarding/RestaurantProvisioningService.ts`, `prisma/seed.ts` | Task 04 — status writes go through the single writer or write the enum; provisioning = `TRIAL` + 14-day trial; demo/seed tenant = `ACTIVE`. |
| `tests/helpers/tenantFixtures.ts`, 34 suites, `tests/tenant-access-lifecycle.test.ts` | Task 04 — ONE shared status fixture helper for all suites; NEW 61-assertion lifecycle suite (fake clock, real tables, transactional writer, refresh behaviour). |
| `src/shared/lib/ownerSession.ts`, `src/client/App.tsx` | Task 03g (P1) — `readAccessTokenExpiry` / `storeAccessToken`: the stored access token's expiry now comes from the JWT's own `exp`; a stored token is never re-armed to now + 15 min, and a missing/invalid `exp` fails closed. |
| `src/shared/lib/authInterceptor.ts` | Task 03g (P2) — 410 now takes the same one-refresh/one-retry path as 401 (via an inner `send()` that cannot recurse); `session:expired` fires only when the refresh actually fails, at most once per dead session. |
| `tests/owner-client-token-lifecycle.test.ts` | Task 03g — NEW. 34 assertions, browser globals stubbed, no server/DB: expired stored JWT, missing `exp`, unreadable token, re-arm regression, 410?refresh?retry, failed refresh ? exactly one `session:expired`, 401 regression, no-loop guard. |

---

## 2026-10-02 — Task 03b: user sessions are bound to one restaurant

**Schema**: `user_sessions.restaurant_id UUID NULL` + `@@index([restaurant_id])` + FK to `restaurants`
`onDelete: Cascade` (sessions are disposable), back-relation `restaurants.user_sessions[]`
(`prisma/schema.prisma:879,1804-1818`). Nullable only so pre-03b rows can exist during rollout; a NULL
row is treated as invalid, never resolved from memberships. Migration
`prisma/migrations/20261002231500_bind_user_sessions_to_restaurant/migration.sql` — additive only, no
existing migration touched, no data rewritten.

**Issuance**: `AuthController.issueOwnerSession` stores the chosen `restaurant_id` on the row
(`src/api/controllers/AuthController.ts:680-688`), so the selection made at login is what every later
refresh uses. `UserSessionService.rotateUserRefreshToken` carries `restaurant_id` across rotations and
refuses an unbound row with the new `SESSION_RESTAURANT_UNBOUND` error, revoking the whole family first
(`src/api/services/auth/UserSessionService.ts:133-215`).

**Refresh**: the tenant comes from the session row, never from "most recently updated membership". The
rule was extracted from `handleUserSessionRefresh` into the testable
`resolveOwnerRefreshTarget` (`src/api/services/auth/ownerSessionRefresh.ts`), which re-checks that the
account is still active and verified and that the user **still holds a membership for that exact
restaurant**; otherwise it clears the cookie, revokes the family and forces re-login with
`MEMBERSHIP_REVOKED` / `ACCOUNT_INACTIVE` / `STAFF_INACTIVE`. `src/api/server.ts:1539-1571` now only maps
that verdict to an HTTP response.

**Verified**: `npx prisma validate` passes; `prisma migrate diff --from-migrations … --to-schema-datamodel
… --shadow-database-url …/fireflow_shadow --script` is empty ("This is an empty migration");
`npx tsc --noEmit` 0 errors; migration applied to `fireflow_test` with `npx prisma migrate deploy`;
`npm run test:safe -- tests/owner-login-sessions.test.ts` = 65/65 + 17 new 03b assertions = 82/82,
`tests/signup-owner-password.test.ts` = 43/43. New tests prove: the session row stores the selected
restaurant; after B's membership is touched more recently the refresh still resolves A; removing A's
membership fails the refresh with `MEMBERSHIP_REVOKED` instead of falling back to B; a NULL-restaurant
session is refused and its family revoked (both at resolve time and at rotation); a deactivated account
and an inactive staff profile fail closed.

**Next**: Task 04 — tenant status / trial check in `issueOwnerSession` and in
`resolveOwnerRefreshTarget` (after the membership is resolved, before the session/token is issued); the
TODO marker is at `AuthController.ts:670-671`. Then 04b (self-approval in
`orderWorkflowRoutes.ts:323-381`).

---

## 2026-10-02 — Task 03f: owners stay signed in across a page reload

**Cause**: the owner refresh token lives in the httpOnly `ff_user_refresh` cookie, so a reload starts with
no access token and no stored refresh token, and nothing ever re-established the session: the mount effect
only inspected `accessToken`/`accessTokenExpiry` (`src/client/App.tsx`, old lines 375-384) and
`setCurrentUser` was only ever called at login. The interceptor also bailed out before trying a cookie
refresh when storage was empty (old `authInterceptor.ts:24`).

**Single flight**: new `src/shared/lib/ownerSession.ts` owns the session refresh: a module-level promise
(`refreshOwnerSession`) means the bootstrap effect, React StrictMode's double mount and the interceptor all
share ONE `POST /api/auth/refresh` with `credentials: 'include'`, so a duplicated cookie can never look
like replay. `markSessionTerminated()` (logout, refresh failure, 410) bumps a generation counter so a
refresh that was already in flight cannot write its result or resurrect a logged-out session.

**One completion path**: `completeLogin(data)` in `src/client/App.tsx` holds everything login did after
the response (tenant storage, context restaurant, tokens + expiry, `staff`, `currentUser`, forced-setup
wizard, role default view, debounced initial data fetch). `login()` and `bootstrapSession()` both call it —
no duplicated logic. `bootstrapSession()` runs once on mount: with a still-valid access token it re-hydrates
from the stored identity, otherwise it refreshes once and completes the login. No `window.location.reload()`.
While `sessionBootstrapping` is true and there is no user, `AppContent` renders a neutral "Restoring your
session…" screen (`src/client/App.tsx`) instead of flashing the login form.

**Server**: `POST /api/auth/refresh` now returns the same shape as login — `buildOwnerSessionPayload` in
`src/api/services/auth/ownerSessionRefresh.ts` is shared by the refresh route (`src/api/server.ts`) and the
client can therefore use one code path. It returns `success`, `accessToken`, `staff`, `restaurant`,
`tokens.access_token`, `tokens.expires_in` plus the legacy `access_token`/`expires_in`. No hash, PIN or raw
token is ever in the body; the raw refresh token stays in the cookie. Rotation logic, schema and the PIN
flow are untouched.

**Logout**: now revokes server-side first (`POST /api/auth/logout` with `credentials: 'include'`), then
`markSessionTerminated()` + localStorage clear + state reset. The interceptor's 401 path refreshes and
retries the request exactly once, then ends the session.

**Verified**: `npx tsc --noEmit` 0 errors; `npm run test:safe -- tests/owner-session-refresh.test.ts`
(new, 16/16) proves the refresh response is login-shaped, carries the tenant/role/email, keeps the legacy
fields, and contains no raw refresh token, no password, no bcrypt hash, no PIN and no session token hash;
`tests/owner-login-sessions.test.ts` = 65/65 + 17 (03b) = 82/82; `tests/signup-owner-password.test.ts` =
43/43. Manual browser reload was not run (no server started).

**Multi-tab follow-up (NOT implemented)**: two tabs rotating the same cookie at the same instant can still
trip replay detection and revoke the whole family. The small server-side fix is a ~10 second rotation
leeway: in `rotateUserRefreshToken`, when the presented token is already revoked, accept it as a retry if
`revoked_at` is younger than the leeway and issue a fresh token instead of calling
`revokeUserSessionFamily`. It needs its own task, a cap on retries, and an audit event.

**Next**: Task 04 — tenant status / trial check after membership resolution, in `issueOwnerSession`
(`AuthController.ts:670`) and in `resolveOwnerRefreshTarget`. Then 04b (self-approval in
`orderWorkflowRoutes.ts:323-381`).

---

## 2026-10-03 — Task 04-1 + 04-2: tenant status / trial lifecycle (schema, events, one enforcement function)

**Decisions taken by the owner**: the `restaurants` row in the main Postgres database is the single source of
truth for tenant status. Supabase (`restaurants_cloud`), `license.lic` and `src/hq/hqApi.ts` must NOT define or
write it. Status is DERIVED ON READ from the two existing date columns — there is no cron and no background job
yet. `GRACE_DAYS = 5`, overridable per deployment with `TENANT_GRACE_DAYS` (unusable values fall back to 5);
trial length is `TRIAL_DAYS = 14`, overridable with `TENANT_TRIAL_DAYS`.

### 04-1 — schema and data

- `SubscriptionStatus { TRIAL, PENDING_REVIEW, ACTIVE, GRACE, SUSPENDED }` on `restaurants.subscription_status`
  (was free TEXT with `trial`/`active`/`ACTIVE`/`expired` in circulation), plus
  `@@index([subscription_status])`. `subscription_plan`, `trial_ends_at` and `subscription_expires_at` are
  reused as-is.
- `SubscriptionActorType { SYSTEM, SUPER_ADMIN, OWNER }`.
- NEW append-only table `subscription_events(id, restaurant_id FK RESTRICT, from_status?, to_status,
  actor_type, actor_id?, reason?, created_at)` + `@@index([restaurant_id, created_at])`. No route updates or
  deletes a row; the FK is RESTRICT because lifecycle history outlives the tenant row.
- ONE additive migration `prisma/migrations/20261003010000_tenant_subscription_status_enum/migration.sql`:
  the pre-check `SELECT subscription_status ... GROUP BY` is a comment at the top, a `DO` block raises
  exception on ANY unmapped value, then the explicit map `trial -> TRIAL`, `active|ACTIVE -> ACTIVE`,
  `expired -> SUSPENDED`; `TRIAL` rows get `trial_ends_at = COALESCE(trial_ends_at, created_at + 14 days)`;
  the seeded demo tenant (`b1972d7d-8374-4b55-9580-95a15f18f656`) becomes `ACTIVE` with a 30-day period end.
  Existing migrations untouched.
- Signup provisioning now writes `TRIAL` with `trial_ends_at = now + 14 days` (was 30) and rejects any
  unrecognized status from an untyped caller (request body), so `POST /api/restaurants` cannot write garbage.
  Demo/super-admin provisioning writes `ACTIVE`.
- `prisma/seed.ts` writes the demo tenant as `ACTIVE` with a period end.
- `GET /api/licensing/status` and `POST /api/licensing/sync` no longer write `subscription_status`. A license
  is informational: only `subscription_plan` / `subscription_expires_at` are mirrored. `SuperAdminService`
  (license apply, payment verify) now goes through the single writer and appends an event.
- Test fixtures (34 suites, ~70 sites) were moved to the enum values through ONE shared helper,
  `tests/helpers/tenantFixtures.ts` (`ACTIVE`, `TRIAL`, `PENDING_REVIEW`, `GRACE`, `SUSPENDED` + date
  helpers). Local-DB dev scripts (`browser-smoke*.cjs`, `db-cleanup-demo.ts`, `create-*admin.ts`,
  `td12-functional-smokes.cjs`) were updated too.

### 04-2 — one enforcement function, no new blocking yet

- `src/api/services/tenant/getTenantAccess.ts`: `evaluateTenantAccess(row, now)` (pure, fake-clock testable)
  and `getTenantAccess(db, restaurantId, now?)` (reads the row, throws `TenantNotFoundError` when absent).
  Returns `{ mode, status, effectiveStatus, reason, daysLeft }`:
  `TRIAL|PENDING_REVIEW|ACTIVE` FULL until their end date; +`GRACE_DAYS` -> GRACE (FULL + warning); then
  SUSPENDED (READ_ONLY); stored `SUSPENDED` stays READ_ONLY; `is_active = false` -> BLOCKED. No end date on
  record -> FULL. `buildTenantAccessWarning()` returns the banner payload (null when fully entitled).
- Hooked into owner login (`issueOwnerSession`, replacing the `TODO(Task 04)` marker), owner refresh
  (`resolveOwnerRefreshTarget` -> `tenantAccess` on the resolution, `TENANT_BLOCKED` failure code) and staff
  email/PIN login. BLOCKED rejects with code `TENANT_BLOCKED`; GRACE and READ_ONLY add a `warning` field to the
  response and nothing else changes. A suspended tenant keeps its refresh family, so an upgrade restores the
  session without a new login. Reads are never rejected here.
- `src/api/services/tenant/setSubscriptionStatus.ts`: the single writer. Status change + `subscription_events`
  row in ONE transaction; a no-op transition writes no event; TRIAL/PENDING_REVIEW without a trial end gets
  now + `TRIAL_DAYS`. Used by `SuperAdminService`, ready for the payment-proof and admin routes.
- NOT done on purpose (later tasks): API-wide `tenantAccessMiddleware`, socket/worker suppression, public QR
  and menu gating, `DELETE /api/restaurants/:id`, cloud CHECK widening.

**Verified**: `npx prisma validate` OK; migration drift empty against `fireflow_shadow`
(`--from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma`); migration applied to
`fireflow_test` only (`migrate deploy`) — `fireflow_local` untouched. `npx tsc --noEmit` 0 errors (the
`prisma generate` EPERM on `query_engine-windows.dll.node` is the known dev-server lock; types still
regenerated). `tests/tenant-access-lifecycle.test.ts` NEW: 61/61, covering every transition with a fake clock
including both grace boundaries, BLOCKED precedence, the `TENANT_GRACE_DAYS` override and its fallback, the
real-table derivation, the transactional writer + event history, and refresh behaviour for a suspended tenant.
Unchanged suites still green: owner-session-refresh 16/16, owner-login-sessions 82/82 (cumulative),
signup-owner-password 43/43.

**Known debt / follow-ups**: `src/shared/types.ts` `subscriptionStatus` and the HQ/SuperAdminView client types
still speak the old lowercase cloud vocabulary (cloud-only, untouched); `docs/AUDIT_SUBSCRIPTION.md` remains a
read-only audit and is now partly implemented; suites that need a live API on :3001 (`tenant-isolation-api`,
`refresh-token-rotation`, `phase1-pin-hardening`, `f03-void-lifecycle`, `tenant-boundary`,
`phase1-provisioning`) and the pre-existing `staff.pin` plaintext assertion in `onboarding-saas.test.ts`
fail independently of this task.

**Next**: Task 04b — self-approval in `orderWorkflowRoutes.ts:323-381` (skip-approval needs a manager PIN and
must not allow self-approval). Then super admin + payment proofs, 05 emails, 06 `/r/:slug` routing, devices
07b-07e.

---

## 2026-10-03 — Task 04b: manager approval for every `SKIPPED` transition — no migration

**Why**: an order item could reach `SKIPPED` without any approval. `PATCH /api/orders/:orderId/items/:itemId/status`
only demanded approval for `SERVED ? SKIPPED`, and `BaseOrderService.updateOrder` silently converted a zeroed
`DONE`/`SERVED` item to `SKIPPED`. So a cashier could skip an item by simply zeroing its quantity, and no PIN,
no role check and no audit trail were involved.

- **`OrderWorkflowService.updateOrderItemStatus`** now reports `approval_required` for **every** state, so the
  status endpoint can no longer be used to skip from `DRAFT`/`PENDING`/`PREPARING`/`DONE`/`SERVED`. The mutation
  happens exclusively in `approveSkipOrVoid`.
- **`approveSkipOrVoid`** enforces, in order: the approver re-authenticates with **their own** 6-digit PIN
  (tenant-bound staff lookup `{ id, restaurant_id }`, bcrypt against `hashed_pin`; plaintext `pin` is never read),
  the same `RefundService` override pattern instead of `/api/auth/verify-pin` whose `requiredRole` came from the
  body and whose candidate search would accept another manager's PIN; wrong PINs feed the existing staff lockout
  and are audited as `APPROVAL_PIN_FAILED`; the item must belong to the approver's restaurant
  (`CROSS_TENANT_APPROVAL`); the approver may not be the last actor (`SELF_APPROVAL_FORBIDDEN`); only skippable
  source states are accepted (`INVALID_APPROVAL_ITEM`). Success clears the failure counter like a normal PIN login.
- **`BaseOrderService.updateOrder`** throws `403 SKIP_APPROVAL_REQUIRED` instead of silently zeroing to `SKIPPED`.
  This closes `PATCH /api/orders/:id` and the `POST /api/orders` upsert, which both delegate to the same method.
- **`orderWorkflowRoutes.ts`** — `POST /api/orders/skip-approval` takes `managerPin`; the role gate is
  `SKIP_APPROVAL_ROLES` (`MANAGER|ADMIN|SUPER_ADMIN`) read from the verified token, never from the body.
- **Defect found while verifying: `x-session-id` was not "metadata only".**
  `approval_logs.approved_by_session_id` is a **foreign key to `cashier_sessions.id`**, so an unverified client
  header either produced an FK-violation **500** or would attribute an approval to another tenant's session.
  `verifyApprovalSession` now resolves the reference against `cashier_sessions` where
  `{ id, restaurant_id = caller's tenant }` and answers `400 INVALID_SESSION_REFERENCE` otherwise
  (also audited as `unknown_session_reference`). It remains attribution only — the JWT plus the approver's
  own PIN are the only authorization factors.
- **Defect found while verifying: denial audits were rolled back.** `SKIP_APPROVAL_DENIED` rows were written
  inside the aborted `$transaction`, so every refused approval left no trace. Denials now carry an audit payload
  (`denial()`) that is written through `prisma` **after** the rollback and the error is rethrown unchanged.

**Verification**: `tests/order-skip-approval.test.ts` 53/53 (`npm run test:safe`, real tables on
`fireflow_test`) — role denial, all three approving roles with their own PIN, wrong/missing/other-manager PIN,
lockout counter, self-approval, cross-tenant target, unknown and foreign session references, denial audits
surviving rollback, all five source states, zero-quantity protection, and the untouched normal transitions.
`npx tsc --noEmit` clean; `git diff --check` clean (only pre-existing LF/CRLF warnings).
Unchanged suites still green: `phase2-service-support`, `service-tenant-isolation`, and all 25 assertions of
`mission-014A-pos-security` (its suite still exits non-zero on a pre-existing `outbox_restaurant_id_fkey`
teardown failure); `taxes-sc-logic` still fails independently on a `restaurants.default_delivery_fee` field
that does not exist in the schema.

**Known debt / follow-ups**: self-approval against the **order creator** is still not enforced — `orders` records
no creator identity, so creation-time approval was explicitly deferred rather than guessed. `approveSkipOrVoid`
still hardcodes `skip_reason: 'COMP'` and writes `performed_by_role: 'MANAGER'` regardless of the actual role.
`verification`/`void` reuse this same endpoint, so the approver-PIN and no-self-approval gates already cover them.

**Next**: super admin + payment proofs, 05 emails, 06 `/r/:slug` routing, devices 07b-07e.

---

## 2026-10-03 — Task 04b closure pass: complete the gate

**Why**: the final diff review of the original 04b uncovered **two server-side bypasses** and **one broken client contract** that directly contradicted the invariant *"every transition to `SKIPPED` requires approval"*. Leaving them as tech debt would have committed a partially closed security task.

- **Bypass 1 — `BaseOrderService.updateOrder` caller-supplied `SKIPPED` status.** The status weight of `SKIPPED` (7) beats every other weight, so a payload with `item_status: 'SKIPPED'` was written verbatim (a cashier could name the status).
- **Bypass 2 — omitted served lines.** Any `DONE`/`SERVED` item simply left out of the `items` array was implicitly zeroed to `SKIPPED` with only an `ITEM_QUANTITY_REDUCED` audit row — a third silent skip path.
- **Broken client contract — KDS `approveSkip` did not send the required `managerPin`.** The modal collected a PIN and folded it into the reason text (`PIN-verified: …`), but the hook never passed it, so every KDS approval returned `401 APPROVAL_PIN_REQUIRED`.

**What changed** (still no schema, no migration, no role/auth/session changes):

- `BaseOrderService.updateOrder`:
  - A pre-flight pass (`resolveItemMatches` + `assertNoUnapprovedSkip`) runs **inside the transaction before any write**, using the *identical* smart-matching logic the write loop uses. It refuses all three paths with `403 SKIP_APPROVAL_REQUIRED` and carries an `audit` payload.
  - The silent omitted-line conversion (`item_status: 'SKIPPED'` at line 451 in the old code) is replaced with a throw that produces the same `audit` payload — defense in depth.
  - The transaction is wrapped in a try/catch so the refusal is audited **after the rollback** (the exact pattern fixed in `OrderWorkflowService`).
  - Atomicity preserved: the throw rolls back the *entire* `updateOrder` transaction, so a refused skip leaves no partial edits (proven by test `a refused skip rolls the whole order update back`).

- `OrderWorkflowService` (no new behavior, documentation only): the existing `verifyApprovalSession` + `auditApprovalDenial` pattern already covers the approval endpoint.

- KDS client (`src/operations/kds/hooks/useOrderWorkflow.ts`, `ManagerApprovalModal.tsx`):
  - `approveSkip` now accepts an optional `managerPin` and sends it in the body to `/api/orders/skip-approval`.
  - The modal forwards the collected PIN instead of folding it into the reason.

**Verification**: `tests/order-skip-approval.test.ts` **73/73** (`npm run test:safe`) — adds 20 assertions covering:
  - caller-supplied `SKIPPED` refused + audited against the actor
  - omitted `DONE`/`SERVED` refused + audited
  - atomicity: a refused skip rolls back the whole order update (status + other items)
  - `DENY_SKIP` accepted, item untouched, approval log + audit recorded
  - KDS contract: the exact payload the live hook sends succeeds through the live endpoint
  - cross-tenant denial strengthened: asserts actor/tenant/entity relationship, proves victim tenant audit space untouched
  - all original 53 assertions preserved

`npx tsc --noEmit` clean; `git diff --check` clean (only pre-existing LF?CRLF warnings).

**Remaining recorded items** (explicitly NOT fixed in this pass):
- `skip_reason: 'COMP'` and `performed_by_role: 'MANAGER'` hardcoded — separate data-model question.
- Creator-based self-approval deferred — `orders` has no creator identity.
- `UpdateOrderDTO.authorized_by` is not populated by the order-update route (pre-existing); the refusal audit may have `staff_id: null` in production when the route doesn't pass it. The mechanism works when the actor is known (proven by test passing `authorized_by`).

**Files changed in this closure pass**:
- `src/api/services/orders/BaseOrderService.ts` (pre-flight + durable refusal + atomicity)
- `src/operations/kds/hooks/useOrderWorkflow.ts` (accept and send `managerPin`)
- `src/operations/kds/components/ManagerApprovalModal.tsx` (forward PIN)
- `tests/order-skip-approval.test.ts` (+20 assertions)

---

## 2026-10-03 — Task 03g (Phase A): client token lifecycle — no migration

**Why**: a browser console investigation showed an auth storm in the dev app: repeated
`410 Gone` on authenticated GETs, `No valid access token`, `Got 401, attempting token refresh...`,
`/api/auth/logout` 401 and a misleading "session expired". Root cause was entirely client side; the
tenant row was healthy (`is_active`, `TRIAL`, trial end in the future ? `getTenantAccess` = FULL) and
Task 04 played no part.

- **P1 — an expired access token was re-armed on every mount.** `bootstrapSession`
  (`src/client/App.tsx:419-427`) passed a token from storage into `completeLogin`, which wrote
  `accessTokenExpiry = Date.now() + 15 min` (`App.tsx:313-314`) regardless of the JWT's own `exp`.
  An already-expired token therefore stayed "valid" locally for 15 more minutes on every reload and
  the server kept answering 410 (`authMiddleware.ts:107`). `getValidAccessToken` also failed OPEN
  when `accessTokenExpiry` was absent.
  **Fix**: `readAccessTokenExpiry()` decodes the token's `exp` (no signature check — the server stays
  the authority); `storeAccessToken()` stores that expiry and refuses to store a token without a
  readable `exp`; `getValidAccessToken()` fails closed on an unreadable/absent expiry and treats the
  stored hint as a maximum, never an extension. `App.tsx` no longer computes expiry at all.
- **P2 — 410 was terminal.** `fetchWithAuth` refreshed only on 401 (`:96-108`); the 410 branch
  (`:110-116`) cleared the session and fired `session:expired` even when the httpOnly refresh cookie
  was still valid.
  **Fix**: 401 and 410 share one path — one refresh, one retry, through an inner `send()` that calls
  plain `fetch` and therefore cannot recurse. The session is terminated (and `session:expired`
  emitted, at most once) only when the refresh itself fails.
- **Deliberately NOT done**: no change to `UserSessionService`, `user_sessions`, the Prisma schema,
  migrations, database data or refresh-token rotation semantics. A rotation leeway was rejected for
  now: it changes reuse-detection semantics, `revoked_at` cannot distinguish rotation from logout,
  and UA+IP are signals, not device identity. `USER_REFRESH_LEEWAY_MS` is not implemented at all.

**Verified**: `npx prisma validate` OK; `npx tsc --noEmit` 0 errors;
`tests/owner-client-token-lifecycle.test.ts` NEW 34/34 (stubbed browser globals, no server, no DB
writes) plus unchanged suites: owner-session-refresh 16/16, owner-login-sessions 82/82 cumulative,
signup-owner-password 43/43, tenant-access-lifecycle 61/61. No migration was created or applied.

**Next (Phase B)**: add the missing owner-cookie concurrency test — two simultaneous refreshes with
the same valid token must yield exactly one rotation, one rejection and a still-valid family — to
prove that the observed family destruction is stale-cookie REPLAY, not an ordinary race. Only then
decide on leeway with explicit state (`revoked_reason`, `rotated_to_id`) behind
`USER_REFRESH_LEEWAY_MS=0`.

---

## 2026-10-03 — Task 03g (Phase B): owner-refresh concurrency — defect found, ordered fix, suite GREEN

**Purpose**: prove (or disprove) that two concurrent refreshes with the SAME still-valid owner refresh
token are handled by the current transaction. `tests/owner-refresh-concurrency.test.ts` (NEW, test file
only) runs 5 rounds: one owner + one tenant + one live session per round, `Promise.all` of two
`rotateUserRefreshToken(sameToken)` calls, then assertions on exactly-one-success, the loser's error
code, family liveness, successor binding and successor reuse.

**Defect found (RED, deterministic on round 1, 3/3 runs)**: exactly one rotation won, but the loser
returned `TOKEN_REUSE_DETECTED`, which revoked the whole family — so the successor the winner had just
created was already dead (2/2 sessions revoked). Root cause: `rotateUserRefreshToken` read the row with
an unlocked `findSessionByToken` and decided "theft" from that read, OUTSIDE the rotation transaction.
When the loser's read landed after the winner's conditional claim committed, the loser saw
`revoked_at` set and nuked the family. The transaction protected the write; nothing protected the read.
The cold connection pool made the first race after a server start deterministic — exactly when the
owner reloads the app. This, not browser stale-cookie replay alone, produced the 2026-10-03 storm in
`fireflow_local` (15 of 22 `user_sessions` revoked seconds after sign-in).

**Fix (approved, ordering only)**: `rotateUserRefreshToken` now captures `requestStartedAt` before any
database work and classifies a revoked token by ORDERING rather than from an unlocked read:
revoked BEFORE this request arrived -> genuine replay, family revoked, `TOKEN_REUSE_DETECTED`
(unchanged); revoked AT/AFTER it -> this request raced a rotation that succeeded, so it is a plain
loser: `INVALID_REFRESH_TOKEN`, no token, family untouched. The conditional
`updateMany ... where revoked_at = null` inside the transaction remains the authoritative single-winner
claim. Tenant binding, expiry, unbound-session kill, account/membership validation and logout are
untouched. **No leeway, no `USER_REFRESH_LEEWAY_MS`, no `revoked_reason`, no `rotated_to_id`, no schema
change, no migration.** The loser path issues nothing, so even a same-millisecond misclassification
grants no access and the next attempt with the stale token is detected as replay.

**Suite now asserts both halves**: the 5-round race (one rotation, one `INVALID_REFRESH_TOKEN` loser, no
family revocation, successor usable and still tenant-bound) AND a control proving genuine replay of an
already rotated token still returns `TOKEN_REUSE_DETECTED`, revokes the family and kills the successor.
The pre-existing replay assertions in `tests/owner-login-sessions.test.ts` are retained unchanged.

**Verified**: `npx tsc --noEmit` 0 errors; `tests/owner-refresh-concurrency.test.ts` 59/59 and stable
over 4 consecutive runs (round 1 included); owner-session-refresh 16/16; owner-login-sessions 82/82
cumulative (its reuse-detection assertions unchanged and green); owner-client-token-lifecycle 34/34;
signup-owner-password 43/43; tenant-access-lifecycle 61/61. Files changed in this phase:
`src/api/services/auth/UserSessionService.ts`, `tests/owner-refresh-concurrency.test.ts`,
`CURRENT_STATE.md`. Nothing committed.

**Next (Phase C decision input)**: with ordering fixed, re-check the browser behaviour. If legitimate
stale-cookie replays are still observed, the design must be explicit state (`revoked_reason`,
`rotated_to_id`) behind `USER_REFRESH_LEEWAY_MS=0` — not an inferred window.

---

## 2026-10-02 — Task 03c: test-database safety boundary + non-destructive seed

**Why**: suites and the seed sweep data with broad `deleteMany` calls (`tests/mission-031-b-wac.test.ts`
wipes every restaurant, `prisma/seed.ts` wiped ~35 tables), so a misdirected run destroyed real
development data in `fireflow_local`.

**Global guard**: `tests/_test-db-guard.ts` is imported as the FIRST import by every suite that must be
protected, and is loaded once globally by the runner. It refuses to start when `NODE_ENV=production`,
loads `.env.test` when `DATABASE_URL` is unset (never overriding an exported value), and hard-fails
unless the target database satisfies the same disposable policy the release gate enforces (TD-14b):
`*_test`, `*_verify`, or `fireflow_gate`. The predicates are reused from `scripts/release-gate.cjs`
(`extractDbName`, `isAllowedGateDb`) rather than duplicated, so gate and suites cannot drift.
`tests/mission-031-b-wac.test.ts` keeps its unconditional tenant wipe; the guard is what makes it safe.

**Runner**: `npm test` / `npm run test:safe` run `scripts/run-tests.ts` (global setup = guard, then each
`tests/*.test.ts` suite sequentially in its own process). `npm run pretest[:safe]` runs the guard alone.
Single suite: `npm run test:safe -- tests/owner-login-sessions.test.ts`. `.env.test` (git-ignored, holds
the local password) points at `fireflow_test`, which the owner created and migrated (55 migrations, last
`20261001080100_financial_fk_hardening_and_drift_cleanup`). The guard applies only to suites; other
suites still load `.env` through `dotenv/config`, which cannot override the guard's value.

**Seed**: `prisma/seed.ts` no longer wipes by default. `shouldWipe()` wipes only when
`CONFIRM_WIPE` is exactly the target database name and `NODE_ENV` is not `production`; the deletes moved
into `wipeAll()`. Otherwise the seed is additive: the restaurant is upserted by its fixed id
(order-type defaults are upserts already) and each child group (stations, categories, menu items,
sections + tables, staff, customers, vendors) is created only when that table has no rows for the
restaurant. Re-running is therefore a no-op instead of a duplicate-key crash.

**Verified**: guard refuses `fireflow_local` (exit 1, names the database, before Prisma connects), refuses
`NODE_ENV=production`, accepts `fireflow_test` from `.env.test`; `npm run test:safe --
tests/owner-login-sessions.test.ts tests/signup-owner-password.test.ts` = 65/65 and 43/43 on
`fireflow_test`, "All 2 suite(s) passed"; `tests/mission-031-b-wac.test.ts` aborts on `fireflow_local`
without touching a row; seed prints `Skipping wipe: CONFIRM_WIPE is not set to ...` by default and wipes
only after an exact-name confirmation (both proven against a non-existent database, so no real data was
touched); `scratch/verify-seed-refactor.cjs` confirms no BOM, no replacement characters, and all 14
Urdu `name_urdu` strings unchanged. No migration was added or changed.

**Known limitation**: only the three suites listed above import the guard so far. Other suites are safe
when run through `npm test` / `npm run test:safe` (the runner guards globally) but a direct
`npx tsx tests/<other>.test.ts` still relies on `dotenv/config`; adding `import './_test-db-guard';` as
the first line of each remaining suite is the follow-up.

---

## 2026-10-02 — Task 03: owner login on users + memberships + user_sessions

**Flow now**: `POST /api/auth/login` (password mode) looks up `users` by lowercased email first. A hit
takes the owner path: lockout check, bcrypt compare against a cost-14 dummy hash for unknown emails
(identical 401 "Invalid credentials" either way), `is_active`, `email_verified_at`, then memberships.
0 -> 403 `NO_MEMBERSHIP`; 1 -> session; 2+ -> `requires_restaurant_selection` plus a 5-minute signed
`selection_token` and no session. `POST /api/auth/select-restaurant` verifies that token and that the
user holds a membership for the requested restaurant. Session issuance resolves `memberships.staff_id`
to the staff row and returns the exact staff-login response shape with an access token carrying the
same claims and 15-minute expiry, so the rest of the app is unchanged. The refresh token (32 random
bytes) is stored only as a SHA-256 hash in `user_sessions` and travels only in the httpOnly
`ff_user_refresh` cookie (secure in production, sameSite lax, path `/api/auth`). `POST /api/auth/refresh`
routes a cookie to family rotation with theft detection (a revoked token revokes the family); logout
revokes the cookie's session. Staff PIN login and the legacy staff email/password path are untouched.

**Verified**: `npx prisma validate` passes; `npx tsc --noEmit -p tsconfig.json` reports 0 errors;
`tests/owner-login-sessions.test.ts` = 65/65; `tests/signup-owner-password.test.ts` = 43/43 (its three
dual-write assertions were inverted because Task 03 removed the dual-write); zero rows left behind
(`scratch/check-login-residue.cjs`). Pre-existing failure unchanged:
`tests/onboarding-saas.test.ts` "PIN is hashed in DB".

**Known limitations for the next tasks**:
- `user_sessions` has no `restaurant_id`, so a refresh re-resolves the tenant from memberships
  (most recently updated) — a multi-workspace account needs a schema decision.
- Selection tokens are stateless: choosing the same restaurant twice mints two sessions.
- `scripts/dev-set-owner-password.ts` now only serves legacy `staff` accounts; signup owners are set up
  through the browser flow.

**Next**: Task 04 — the tenant status / trial check belongs in `AuthController.issueOwnerSession`
(marked `TODO(Task 04)`, after the membership is resolved and before the session is issued); the same
check is needed in `handleUserSessionRefresh` in `server.ts`.

---

## 2026-10-02 — Task 02: signup with owner-chosen password

**Flow now**: signup form asks for password + confirmation (min 10, must match, must not equal the
email) -> `POST /api/onboarding/start` validates again server-side -> one transaction creates the
restaurant, the owner `staff` row, `users`, `memberships` (OWNER, linked to the owner staff row), the
`owner_invites` row and the single-use `email_verification_tokens` row -> the response carries only
restaurant id/slug/name, the setup token and the one-time POS PIN (`verification_required: true`) ->
in local development the verification URL is printed to the server console -> opening
`GET /api/auth/verify-email?token=...` sets `users.email_verified_at` and `staff.is_email_verified`
and marks the invite VERIFIED -> Email & Password login then succeeds.

**Identity model**: provisioning paths that pass no password (super admin vault, demo tenant) keep
their PIN-only behaviour and create no `users` row. A second signup with an existing account email is
rejected (`409 EMAIL_ALREADY_REGISTERED`) before any tenant row is created; adding a workspace to an
existing account remains a later task.

**Verified**: `npx prisma validate` passes; `npx tsc --noEmit -p tsconfig.json` reports 0 errors;
`tests/signup-owner-password.test.ts` = 46 passed / 0 failed and leaves zero rows behind
(`scratch/check-signup-residue.cjs`). Known pre-existing failure, untouched by this task:
`tests/onboarding-saas.test.ts` "PIN is hashed in DB" expects the plaintext PIN in `staff.pin`, which
the Phase 1 hash-only design deliberately does not store.

**Next**: superseded by Task 03 below (owner login now runs on `users` + `memberships` +
`user_sessions`, and the TEMP `staff` dual-writes were removed).

---

## 2026-10-02 — Task 1: dev owner password helper

**Changed**: `scripts/dev-set-owner-password.ts` (new, untracked). Owner lookup order: unique
`owner_invites.email` -> that restaurant's single `MANAGER` staff; fallback `staff.email`; last
resort only when the database holds exactly one restaurant. Any ambiguity prints the reason and
exits. bcrypt cost 14 (same as `AuthController`). Also clears `failed_login_count` / `locked_until`
and sets `must_change_password = false`.

**Verified**: `npx tsc --noEmit` on the file is clean; `npx prisma validate` passes. No schema change,
so no migration and no drift check required.

**Next**: Task 2 (CTO to write) — signup lets the owner choose their own password and verify email;
move owner login onto `users` + `memberships`. The `users`, `memberships`, `user_sessions` tables
exist but are still unused by code.

---

## Managed SaaS Model

The target operating model is documented in `docs/MANAGED_SAAS_OPERATING_MODEL.md`.

## Human Decisions Required

1. **Product scope priority**: Is FireFlow a local POS, hybrid SaaS, multi-product ecosystem, or all three? Which is the current primary focus?
2. **AI strategy**: Should FireFlow have a backend AI service layer, or remain a simple frontend chatbot?
3. **Enum reconciliation**: Which status enums are canonical — the ones in `schema.prisma` or the ones in `docs/ORDER_BOOKING_WORK_PROCESS.md`?
4. **`order_intelligence` table**: Is this table planned, deprecated, or actively being built?
5. **Supabase integration**: Is the current Supabase cloud integration production-ready, or still in development?
6. **`openapi.json`**: Should this be regenerated to match the Express API, or deleted as stale?
7. **Branch model**: Should the project use `main` or `develop` as the primary working branch?

