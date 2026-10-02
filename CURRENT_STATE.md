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
| `src/api/services/onboarding/RestaurantProvisioningService.ts` | Task 02 — `ownerPassword` support, `users` + `memberships` creation, TEMP `staff` credential dual-write, duplicate-email rejection, sanitized owner projection. |
| `src/api/controllers/AuthController.ts` | Task 02 — exported `BCRYPT_COST`, shared `applyVerification` (sets `users.email_verified_at` and `staff.is_email_verified`), `verifyEmailLink` GET handler. |
| `src/api/services/EmailVerificationService.ts` | Task 02 — `logDevVerificationLink` (local dev only, silent in staging/production and when an email provider is configured). |
| `tests/signup-owner-password.test.ts` | Task 02 — 46 assertions, self-cleaning by id. |

**TEMP markers to remove in Task 03**: the `staff.email` / `staff.password_hash` / `staff.is_email_verified`
dual-write in `RestaurantProvisioningService`, and the `staff.is_email_verified` write in
`AuthController.applyVerification`.

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

**Next**: Task 03 — move login onto `users` + `user_sessions`, delete the TEMP `staff` dual-writes,
and decide how staff sessions and user sessions relate.

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

