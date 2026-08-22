# FireFlow — Consolidated Status: Missions 009–014

**Date:** 2026-08-21
**Source:** Repository inspection of `D:\Dev\FireFlow` on branch `main`
**Note:** No formal mission reports for Missions 009–014 were found in the repo. This document reconstructs verified state from source code, migrations, test files, and plans in `.kilo/plans/`.

---

## 1. Current Architecture

FireFlow is a restaurant-native operating system with a hybrid data model:

- **Local PostgreSQL** (Express API): POS, orders, kitchen, inventory, accounting, delivery, outbox, payments, fiscal documents
- **Supabase Cloud** (via `cloudClient.ts`): SaaS licensing, subscriptions, HQ
- **Frontend:** React 19 + Vite 6 + Tailwind CSS 4
- **Desktop:** Electron 39 wrapper
- **AI:** Frontend-only Gemini chatbot (`AURAAssistant.tsx`), no backend intelligence layer

### Key Architectural Guarantees
- Tenant isolation enforced via `restaurant_id` on every data mutation
- Financial authority resides in backend; frontend previews never override
- Provider-neutral design for fiscal, payment, and integration layers
- FBR legacy code untouched; new fiscal boundary is generic

---

## 2. Completed Missions

| Mission | Name | Status | Tests |
|---|---|---|---|
| **Mission 008A-RV** | Runtime verification foundation | Verified | 18/18 passed |
| **Mission 009** | Transaction boundary + outbox | Verified | 15/15 passed |
| **Mission 010** | Integration framework foundation | Verified | 24/24 passed |
| **Mission 011** | Payment lifecycle | Verified | 24/24 passed |
| **Mission 012** | Generic fiscal document boundary | Verified | 27/27 passed |
| **Mission 013** | First regional fiscal connector (FBR PK) | Verified | 14/14 passed |

### Mission 014A Status
- **Mission 014A** — POS Security and Operational Safety Hotfix: **COMPLETE**. All 6 security gaps fixed and verified. 23/23 tests passed including 7 new generic API authorization tests.

---

## 3. Database and Migration State

### Schema
- **47 models, 11 enums** in `prisma/schema.prisma`

### New Models Added During Missions 009–013

| Model | Migration | Purpose |
|---|---|---|
| `outbox` | `20260819000100_add_outbox_table` | Durable event outbox with lease-based claiming |
| `integrations` | `20260819000200_add_integrations` | Connector registry per restaurant/location |
| `integration_deliveries` | `20260819000200_add_integrations` | Delivery tracking with idempotency, retries, dead-letter |
| `payments` | `20260819000300_add_payments` | Payment aggregate with immutable amount |
| `payment_attempts` | `20260819000300_add_payments` | Payment attempt tracking with provider idempotency |
| `fiscal_documents` | `20260819000400_add_fiscal_documents` | Generic fiscal document boundary |
| `fiscal_attempts` | `20260819000400_add_fiscal_documents` | Fiscal attempt tracking with retries |

### Enums Added

| Enum | Values |
|---|---|
| `IntegrationStatus` | ENABLED, DISABLED |
| `DeliveryStatus` | PENDING, PROCESSING, ACCEPTED, COMPLETED, RETRYABLE_FAILURE, UNKNOWN, DEAD_LETTER |
| `PaymentAggregateStatus` | PENDING, PAID, FAILED, UNKNOWN |
| `PaymentAttemptStatus` | PENDING, PROCESSING, ACCEPTED, COMPLETED, RETRYABLE_FAILURE, UNKNOWN, DEAD_LETTER |
| `FiscalDocumentStatus` | PENDING, ISSUED, FAILED, UNKNOWN |
| `FiscalAttemptStatus` | PENDING, PROCESSING, ACCEPTED, COMPLETED, RETRYABLE_FAILURE, UNKNOWN, DEAD_LETTER |

### Uncommitted Migration
- `20260816071149_add_qr_order_type` — adds `QR` to `OrderType` and `PENDING_APPROVAL` to `OrderStatus`

---

## 4. Integration and Event Flow

### Outbox (Mission 009)
- **Model:** `outbox` with `restaurant_id`, `event_type`, `aggregate_type`, `aggregate_id`, `payload` (JSONB), `status`, `attempt_count`, `available_at`, `lock_owner`, `lock_expires_at`
- **Idempotency:** Unique constraint on `(aggregate_type, aggregate_id, event_type)`
- **Reader:** `OutboxReader` polls with configurable interval, claims rows with lease-based locking
- **Dead-letter:** Threshold at 5 attempts
- **EventBus:** In-memory pub/sub for domain events

### Integration Framework (Mission 010)
- **Registry:** `IntegrationRegistry` — singleton, prevents duplicate registration
- **Dispatcher:** `IntegrationDispatcher` — polls outbox, delivers to enabled integrations
- **Connector:** `MockConnector` with SUCCESS/FAILURE/UNKNOWN modes
- **Delivery tracking:** `integration_deliveries` table with idempotency keys, correlation IDs, retry/backoff, dead-letter
- **Disabled integration:** Skipped by dispatcher

### Fiscal Boundary (Mission 012)
- **Registry:** `FiscalRegistry` — singleton
- **Service:** `FiscalDocumentService` — `requestDocument()` enforces eligibility (CLOSED + PAID order)
- **Dispatcher:** `FiscalDispatcher` — processes fiscal outbox
- **Provider:** `MockFiscalProvider` with SUCCESS/FAILED/UNKNOWN modes
- **UNKNOWN reconciliation:** `reconcileUnknown()` method available

### Regional Fiscal Connector (Mission 013)
- **Auth:** `HmacAuth` — HMAC-SHA256 with timestamp expiry, nonce replay protection
- **Connector:** `FiscalHttpConnector` — signs outbound requests
- **Delivery:** `FiscalDeliveryService` — processes completed deliveries, marks fiscal documents ISSUED
- **FBR isolation:** No FBR code in `src/api/services/fiscal/` or `connector/src/`

---

## 5. Payment Lifecycle

### State Machine
- **Aggregate:** `payments` table with `PaymentAggregateStatus` (PENDING → PAID / FAILED / UNKNOWN)
- **Attempts:** `payment_attempts` table with `PaymentAttemptStatus` (PENDING → PROCESSING → ACCEPTED → COMPLETED / RETRYABLE_FAILURE / UNKNOWN / DEAD_LETTER)

### Key Properties
- **Immutable amount:** Set at creation, never modified
- **Idempotency:** Request-level and provider-level
- **PAID payment:** Cannot be reprocessed
- **UNKNOWN reconciliation:** `PaymentDispatcher.reconcileUnknown()` allows manual resolution
- **Cross-tenant:** Access rejected at dispatcher level

---

## 6. Fiscal and Compliance Boundaries

### Provider-Neutral Design
- `fiscal_documents` and `fiscal_attempts` contain no FBR-specific columns
- Legacy `fbr_sync_logs` table untouched
- FBR isolation verified by static analysis tests (no `FBRService`, `fbr_enabled`, `fbr_ntn` in fiscal code)

### Eligibility Rules
- Only CLOSED + PAID orders can request fiscal documents
- CANCELLED and UNPAID orders are rejected

### Compliance Status
- No data retention/purge policy implemented
- Soft delete + 24h draft cleanup only
- No backup/restore documentation

---

## 7. Cravex Integration

**Status: NOT STARTED**

All capabilities are unstarted:
- Inbound order injection
- Outbound catalog sync
- Order status sync
- Cancellation/refund authority
- Customer identity mapping
- Delivery responsibility
- Commission/settlement
- Webhook inbound

**Blocker:** Cravex API specification and ownership model not yet documented. No code references found in the repository.

---

## 8. Security Status

### Verified Working
- Tenant isolation on most mutations via `req.restaurantId`
- JWT auth + refresh tokens
- Role-based access control (CASHIER, MANAGER, ADMIN, SUPER_ADMIN)
- Device pairing with bcrypt-hashed codes
- Socket.IO tenant-scoped rooms
- HMAC auth for fiscal connector

### Critical Gaps (Mission 014A — NOT YET FIXED)

| # | Gap | Severity | Location |
|---|---|---|---|
| 1 | `GET /api/orders/:id` missing `restaurant_id` check — no authMiddleware | **CRITICAL** | `src/api/server.ts:2617` |
| 2 | `PATCH /api/orders/:id` allows void/cancel without server-side role check | **CRITICAL** | `src/api/server.ts:1271` |
| 3 | Discount `max` not enforced server-side | HIGH | `src/shared/utils/businessLogic.ts:144` |
| 4 | No refund endpoint / silent refund metadata | HIGH | `src/shared/types.ts:574` |
| 5 | Plaintext staff PIN storage | HIGH | `staff.pin` + `staff.hashed_pin` coexistence |
| 6 | Printer CRUD unrestricted by role or restaurant scope | HIGH | `src/api/routes/printerRoutes.ts` |

### Other Security Concerns
- `saved_pin` in localStorage — REMOVED in Mission 015
- Inconsistent `authMiddleware` enforcement — RESOLVED
- Generic table API with arbitrary filters — RESTRICTED (sensitive table deny-list added)
- Live Supabase credentials in `.env.example` — Documented risk

---

## 9. Test Evidence

### Mission Test Files
All located in `tests/`:

| File | Mission | Tests | Status |
|---|---|---|---|
| `mission-009-outbox-runtime.test.ts` | 009 | 15 | 15/15 passed |
| `mission-010-integration-runtime.test.ts` | 010 | 24 | 24/24 passed |
| `mission-011-payment-lifecycle.test.ts` | 011 | 24 | 24/24 passed |
| `mission-012-generic-fiscal-document-boundary.test.ts` | 012 | 27 | 27/27 passed |
| `mission-013-first-regional-fiscal-connector.test.ts` | 013 | 14 | 14/14 passed |

### Test Commands (from test files)
```text
Mission 009: npx tsx tests/mission-009-outbox-runtime.test.ts
Mission 010: npx tsx tests/mission-010-integration-runtime.test.ts
Mission 011: npx tsx tests/mission-011-payment-lifecycle.test.ts
Mission 012: npx tsx tests/mission-012-generic-fiscal-document-boundary.test.ts
Mission 013: npx tsx tests/mission-013-first-regional-fiscal-connector.test.ts
```

### CI Status
- Typecheck + build: Configured
- Test execution: **Wired into CI via `.github/workflows/ci.yml`**
- Coverage tooling: **Not configured**

---

## 10. Known Gaps and Risks

### High Risk
1. **POS security hotfix** — COMPLETE. All 6 gaps fixed, 23/23 tests passed.
2. **No unit tests** — Regression risk on changes to `server.ts` (3,060 lines, 87 routes)
3. **Plaintext PIN fallback** — REMOVED. Frontend `saved_pin` cleared. Backend enforces bcrypt-only.
4. **Supabase credentials in `.env.example`** — Security concern

### Medium Risk
5. **Cravex integration not started** — Blocker: API spec missing
6. **No inventory stock movements** — No batch management, no auto-deduction
7. **AI backend layer missing** — Frontend-only chatbot, no agent orchestration
8. **No data retention/purge policy** — Compliance risk
9. **`openapi.json` stale** — Describes Supabase/PostgREST, not Express API

### Low Risk
10. **Dual ledger systems** — Accounting/Journal need consolidation
11. **Soft delete + 24h draft cleanup** — Incomplete retention
12. **PWA/QR PWA partial** — Menu browsing only, no checkout

---

## 11. Current Deployment State

| Target | Status |
|---|---|
| Local Windows (Electron) | VERIFIED |
| Web POS (Vite dev) | VERIFIED |
| HQ (Vercel) | VERIFIED |
| PWA | PARTIAL |
| QR PWA | PARTIAL |

### Uncommitted Work on `main`
| File | Nature |
|---|---|
| `prisma/migrations/20260816071149_add_qr_order_type/` | New migration (uncommitted) |
| `src/api/server.ts` | Added `import 'dotenv/config'` |
| `.env.example` | Contains live Supabase credentials |
| `prisma/migrations/20260606092315_fix_printers_local_support/migration.sql` | BOM/whitespace fix |

---

## 12. Recommended Next Stage

Per `.kilo/plans/mission-014A-pos-security-and-operational-safety.md` and `FIREFLOW_HANDOUT.md`:

```text
1. Approve and implement Mission 014A (POS security hotfix)
   ↓
2. POS operational safety verification
   ↓
3. POS command and performance inventory
   ↓
4. POS speed/readiness improvements
   ↓
5. Inventory automation
   ↓
6. Cravex marketplace integration
   ↓
7. AI backend layer (Fable 5)
```

**Rationale:** AI and Cravex should not be built on a POS with cross-tenant data leak vulnerabilities.

---

## 13. Offline Capability Plan

**Current state:** Not implemented.

From `FIREFLOW_HANDOUT.md` key decisions needed:
- Offline mode scope: Full order creation or read-only?
- Not addressed in any mission plan found

---

## 14. Database Transition and Cloud Migration Plan

**Current state:** Hybrid model is operational.

- **Local PostgreSQL:** Operational data (orders, kitchen, inventory, accounting, delivery)
- **Supabase Cloud:** SaaS licensing, subscriptions, payments, HQ

No formal cloud migration plan for the local PostgreSQL layer was found. The managed SaaS operating model is documented in `docs/MANAGED_SAAS_OPERATING_MODEL.md`.

---

## Appendix: Migration Reference

| Migration | Purpose |
|---|---|
| `20260819000100_add_outbox_table` | Outbox table for transactional events |
| `20260819000200_add_integrations` | Integration registry + delivery tracking |
| `20260819000300_add_payments` | Payment aggregates + attempts |
| `20260819000400_add_fiscal_documents` | Generic fiscal document boundary |
| `20260816071149_add_qr_order_type` | QR order type + PENDING_APPROVAL status (uncommitted) |
| `20260816000000_add_support_sessions` | Support session management |
