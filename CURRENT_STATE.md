# Current State

## Repository Snapshot

| Attribute | Value |
|---|---|
| **Branch** | `main` |
| **Ahead of remote** | 1 commit (unpublished) |
| **Working tree** | Modified: `.env.example`, `prisma/migrations/20260606092315_fix_printers_local_support/migration.sql`, `prisma/migrations/migration_lock.toml`, `src/api/server.ts` |
| **Untracked** | `prisma/migrations/20260816071149_add_qr_order_type/` |
| **Latest commit** | `c049769 fix: clear TypeScript validation errors` |
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
| **Inventory** | PARTIAL — Items, purchase orders, recipes. NO stock movements, batches, or auto-deduction |
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
| **Inventory** | PARTIAL — No stock movement tracking |
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
| **Project tests** | PARTIAL — 2 integration-style tests exist (`tests/`) but not wired into CI |
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
| `prisma/migrations/20260816071149_add_qr_order_type/` | New migration adding `QR` to `OrderType` and `PENDING_APPROVAL` to `OrderStatus` |
| `src/api/server.ts` | Added `import 'dotenv/config'` at top |
| `.env.example` | Contains live Supabase credentials |
| `prisma/migrations/20260606092315_fix_printers_local_support/migration.sql` | BOM/whitespace fix |

---

## Human Decisions Required

1. **Product scope priority**: Is FireFlow a local POS, hybrid SaaS, multi-product ecosystem, or all three? Which is the current primary focus?
2. **AI strategy**: Should FireFlow have a backend AI service layer, or remain a simple frontend chatbot?
3. **Enum reconciliation**: Which status enums are canonical — the ones in `schema.prisma` or the ones in `docs/ORDER_BOOKING_WORK_PROCESS.md`?
4. **`order_intelligence` table**: Is this table planned, deprecated, or actively being built?
5. **Supabase integration**: Is the current Supabase cloud integration production-ready, or still in development?
6. **`openapi.json`**: Should this be regenerated to match the Express API, or deleted as stale?
7. **Branch model**: Should the project use `main` or `develop` as the primary working branch?
