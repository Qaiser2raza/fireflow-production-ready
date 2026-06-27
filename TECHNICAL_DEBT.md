# FireFlow Technical Debt Audit

Audit date: 2026-06-25

## Summary

FireFlow has accumulated product debt typical of a fast-moving pilot system: large orchestration files, mixed route styles, partial auth rollout, direct DB access in routes, compatibility fields, and weak automated verification. The most urgent debt is security and tenant enforcement, not visual or organizational cleanup.

## Critical Findings

| Finding | Evidence | Risk | Recommendation |
|---|---|---|---|
| Inconsistent auth/tenant enforcement | Many inline routes in `src/api/server.ts` lack `authMiddleware`, including menu/staff/tables/orders/customer/vendor/station CRUD and system routes. | Cross-tenant data exposure or unauthorized mutation in SaaS/marketplace mode. | Require auth by default. Allowlist public routes explicitly. Force tenant filters from `req.restaurantId`. |
| Destructive system endpoints are exposed in app server | `POST /api/system/reset-environment` and dev/reset style routes exist in `src/api/server.ts`. | Accidental or unauthorized operational data deletion. | Disable outside development; require super admin, tenant confirmation, and audit logs. |
| Plaintext PIN compatibility remains | `staff.pin` exists; login queries `pin`; audit marks `plaintext_fallback`; frontend staff form handles PIN. | Staff credential leakage and weak auth posture. | Complete bcrypt migration, stop returning/storing PINs, remove plaintext lookup after migration. |
| Generic table API remains | `GET /api/:table` allows whitelisted table access with arbitrary query filters. | Hard to enforce tenant and field-level authorization. | Replace with explicit service-backed endpoints or force tenant-scoped repository methods. |

## High Findings

| Finding | Evidence | Risk | Recommendation |
|---|---|---|---|
| `src/api/server.ts` is too large | 3,424 lines. | Route order bugs, duplicate behavior, difficult security review. | Move inline routes into route modules by domain. |
| Accounting services are too large | `AccountingService.ts` and `JournalEntryService.ts` are each about 1,534 lines. | Financial regressions are hard to isolate. | Split by sales, settlements, ledgers, reports, journal posting; add tests first. |
| Frontend app provider is overgrown | `src/client/App.tsx` is about 1,272 lines and manages auth, sync, socket, routing, state, and UI shell. | UI changes can break data sync/auth/session behavior. | Extract data providers and domain hooks. |
| Major UI modules are oversized | `POSView.tsx` 1,494 lines, `LogisticsHub.tsx` 1,478, `FinancialCommandCenter.tsx` 1,245, `CustomersView.tsx` 1,202. | Hard to safely reuse or adapt for RetailFlow. | Split into containers, hooks, panels, and service adapters. |
| Test scripts are placeholders | `package.json` has `test: echo 'Tests not configured yet'` and `lint: echo 'Linting not configured yet'`. | Refactoring risk is high. | Configure test runner and lint/typecheck CI. |
| API docs are not authoritative | `openapi.json` appears to describe Supabase/PostgREST rather than current Express API. | Integration teams will build against stale contracts. | Generate OpenAPI from Express routes/schemas. |

## Medium Findings

| Finding | Evidence | Risk | Recommendation |
|---|---|---|---|
| Many `any` usages | Widespread in shared types, frontend state, routes, services. | Contract drift and runtime errors. | Type critical DTOs first: orders, payments, sessions, accounting. |
| Duplicate order workflow paths | Inline order routes, `orderWorkflowRoutes`, `BaseOrderService`, QR order routes all manipulate order state. | State transitions diverge. | Centralize state transitions in service layer. |
| Client and server both calculate bill/tax pieces | `billEngine.ts` and backend recalculation both exist. | Total mismatch and accounting bugs. | Backend should be source of truth; client can preview using shared pure library. |
| Socket events are emitted from many places | Services/routes emit directly. | Event consistency and external integration are difficult. | Introduce event service/outbox; adapt Socket.IO and webhooks from it. |
| Encoding artifacts in docs/source comments | Several files display mojibake characters. | Documentation readability and potential UI artifacts. | Normalize file encoding to UTF-8 and avoid corrupted text. |
| Scratch/debug scripts are numerous at root | Many `debug_*`, `check_*`, `audit_*`, scratch files. | Operational confusion and accidental execution. | Move to `scripts/diagnostics` or archive with clear docs. |

## Low Findings

| Finding | Evidence | Risk | Recommendation |
|---|---|---|---|
| Mixed naming conventions | `restaurant_id`, `restaurantId`, `currentRestaurant`, `x-target-restaurant`. | Developer friction and integration bugs. | Standardize DTO boundaries. |
| Some generated/archive files remain in root | `_ARCHIVE_MIGRATION`, backups, local artifacts. | Noise in audits and onboarding. | Keep archives outside runtime tree. |
| Root contains untracked `Microsoft/` directory | `git status --short` shows `?? Microsoft/`. | Workspace noise; unknown generated cache. | Review manually before ignoring/removing. |

## Large Files

Top large files found:

| File | Approx. lines |
|---|---:|
| `src/api/server.ts` | 3,424 |
| `src/api/services/AccountingService.ts` | 1,534 |
| `src/api/services/JournalEntryService.ts` | 1,534 |
| `src/operations/pos/POSView.tsx` | 1,494 |
| `src/operations/logistics/LogisticsHub.tsx` | 1,478 |
| `src/client/App.tsx` | 1,272 |
| `src/operations/finance/FinancialCommandCenter.tsx` | 1,245 |
| `src/operations/customers/CustomersView.tsx` | 1,202 |
| `src/operations/menu/MenuView.tsx` | 976 |
| `src/operations/reports/ManagementReports.tsx` | 885 |

## Circular Dependencies

No automated circular dependency tool was run during this audit. Manual inspection shows likely cycle risk around:

- Shared frontend context importing operations and operations importing app context.
- Services importing shared utilities that also assume app/API environment.
- Server importing many services and route modules while services emit Socket.IO behavior.

Recommendation: add a dependency graph check such as Madge or dependency-cruiser after test/lint setup.

## Duplicate Logic

Likely duplicate or overlapping areas:

- Order creation/update in inline routes and `BaseOrderService`.
- Customer creation/upsert in order service and customer routes.
- Tax/bill calculations in frontend and backend.
- Reporting calculations spread across report services and dashboard endpoints.
- Delivery status/accounting effects in delivery routes and accounting service.

## Dead Code / Archive Risk

Potential dead or stale areas:

- `.bak`, `_restore`, `_new`, and archive migration files.
- Root debug/check/audit scripts.
- `openapi.json` if it no longer reflects current Express APIs.
- Older PWA folders may overlap: `pwa`, `qr-pwa`, and `public/pwa`.

These should be classified before deletion; this audit did not remove anything.

## Security Concerns

- Plaintext PIN field and fallback login.
- PIN auto-login via `saved_pin` in local storage.
- Unauthenticated inline routes.
- Public QR/menu routes need signed scope and rate limiting beyond generic assumptions.
- Super admin target restaurant header needs strict audit logging.
- Generic table endpoint can become a privilege escalation path.
- File upload/static assets should be reviewed for MIME, size, and path safety.

## Performance Bottlenecks

- Large frontend provider fetches many resources at once on login/sync.
- Dashboard/report endpoints may do heavy aggregation in app memory.
- Generic CRUD and route-level Prisma calls may lack pagination and tenant indexes in all paths.
- Socket events can cause full re-fetch/debounce behavior.
- Large React components increase render/debug complexity.

## Database Anti-Patterns

- Optional tenant IDs on some entities.
- Overloaded `ledger_entries.account_id`.
- Some delete cascades are manual in services rather than declarative and tested.
- Token generation for takeaway queries all tokens for a day, which may race under concurrency.
- Mixed local/cloud schemas and stale OpenAPI make schema ownership unclear.

## Scalability Risks

- No durable event outbox for Cravex/webhooks.
- Socket-only realtime model is not enough for external marketplace integrations.
- Route-level tenant checks are inconsistent.
- Single Express server owns API, sockets, health, static PWA, licensing, system utilities, and QR flows.
- No configured automated test/lint pipeline.

## Priority Remediation Plan

1. Security hardening:
   - Auth by default.
   - Tenant guard everywhere.
   - Lock destructive endpoints.
   - Finish PIN hashing migration.

2. Verification:
   - Configure test/lint/typecheck.
   - Add integration tests for auth, tenant isolation, order settlement, delivery settlement, KDS status.

3. API modularization:
   - Move inline routes out of `server.ts`.
   - Remove generic table API from production surface.
   - Generate current OpenAPI.

4. Shared Core preparation:
   - Extract typed DTOs and service interfaces.
   - Split accounting and order workflow services after tests are in place.

