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

