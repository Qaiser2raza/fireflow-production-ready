# POS–Accounting Discovery and Gap Audit

**Project:** FireFlow Restaurant System  
**Mission Context:** Mission 014A security hardening; POS–accounting integration planned  
**Status:** Planning only — no code, schema, migration, configuration, or production-data changes  
**Date:** 2026-08-20  

---

## Executive Summary

FireFlow contains an **internal double-entry accounting engine** (`AccountingService` + `JournalEntryService`) with chart-of-accounts, journal entries, ledger entries, and cashier-session integration. No external accounting product (QuickBooks, Xero, Tally, SAP, NetSuite, ERP) is currently integrated.

A **generic integration framework** exists: `EventBus`, `outbox`, `integrations`, `integration_deliveries`, `IntegrationRegistry`, `IntegrationDispatcher`, `OutboxReader`, plus mock connectors (`MockConnector`, `MockPaymentProvider`, `MockFiscalProvider`). This framework is currently used for mock/internal connectors only; no production accounting connector is registered.

**Critical gaps:**  
- No confirmed external accounting target product, API, or sandbox.  
- `discount_max` exists in `order_type_defaults` but is **not enforced** in `recalculateTotals`.  
- Void/cancel logic lacks kitchen-state and payment-state guards.  
- Refund boundary is explicitly excluded from current scope.  
- Deployment topology (instances, Redis, workers) is **unknown**.  

**Recommendation:** Do not design or implement external accounting integration until the audit gaps below are resolved and an approved target design exists.

---

## 1. POS Transaction Lifecycle

### 1.1 Order States

Authoritative state field: `orders.status` (`OrderStatus` enum). Observed transitions in `BaseOrderService.updateOrder`:

```
ACTIVE -> CLOSED       (payment capture via /api/orders/:id/settle)
ACTIVE -> DELIVERED    (delivery handoff via Logistics Hub)
ACTIVE -> VOIDED       (updateOrder with status VOIDED)
ACTIVE -> CANCELLED    (updateOrder with status CANCELLED)
```

Additional state fields:
- `payment_status`: `UNPAID` / `PAID`
- `fbr_sync_status`: `PENDING` / `SYNCED` / `FAILED` / `VOIDED`
- `is_deleted`: soft-delete flag
- `deleted_at`, `deleted_by`, `deleted_reason`: soft-delete audit

**File references:**
- `src/api/services/orders/BaseOrderService.ts:160-415` — `updateOrder`
- `src/api/server.ts:1330-1450` — `/api/orders/:id/settle`
- `prisma/schema.prisma:447-528` — `orders` model

### 1.2 Payment Lifecycle

Payment capture occurs in `/api/orders/:id/settle`:
1. Validates `totalReceived > 0`.
2. Updates order: `status='CLOSED'`, `payment_status='PAID'`, `closed_at=now`, links `session_id`.
3. Creates one `transactions` record per payment line (supports split payments).
4. Clears dine-in table to `DIRTY`.
5. Calls `accounting.recordOrderSale` for normal POS orders.
6. For delivery orders settled via Logistics Hub, calls `recordRiderSettlementJournal` and creates a ledger entry.

**File references:**
- `src/api/server.ts:1330-1450`
- `src/api/services/AccountingService.ts:46-75` — `recordOrderSale`

### 1.3 Tax Calculation

Tax is calculated in `BaseOrderService.recalculateTotals` (`BaseOrderService.ts:469-622`):
- Source of truth: `order_type_defaults` (`tax_rate`, `tax_type`, `tax_enabled`, `svc_enabled`, `svc_rate`, `delivery_fee`, `discount_max`).
- Override priority: `order.tax_exempt` > `order.tax_type` > `config.tax_type`.
- Supports `INCLUSIVE` and `EXCLUSIVE` tax types.
- Discount is subtracted before tax: `taxable_amount = max(0, subtotal - discount)`.
- Service charge is calculated on net amount (tax extracted for INCLUSIVE).
- Rounding: line items to 2dp, grand total rounded to nearest 10.

**Gap:** `discount_max` from `order_type_defaults` is **not enforced** in `recalculateTotals`. Any discount value is accepted.

**File references:**
- `src/api/services/orders/BaseOrderService.ts:469-622`
- `prisma/schema.prisma:429-445` — `order_type_defaults`

### 1.4 Discount Audit

Current discount handling:
- `orders.discount` field: `Decimal(10, 2)`, default `0`.
- `order_type_defaults.discount_max`: `Decimal(5, 2)`, default `0`.
- `recalculateTotals` accepts `overrideBreakdown.discount` without validation against `discount_max`.
- Discount type (`flat`/`percent`) and reason are stored in `orders.breakdown` JSON.

**Status:** Unsafe — no authoritative policy enforcement.

**File references:**
- `src/api/services/orders/BaseOrderService.ts:518`
- `prisma/schema.prisma:439`, `464`

### 1.5 Void / Cancel / Delete Audit

- **Void/Cancel:** `BaseOrderService.updateOrder` (`BaseOrderService.ts:187-194`) releases table and sets `status=VOIDED/CANCELLED`. No kitchen-state or payment-state guard exists.
- **Delete:** `BaseOrderService.deleteOrder` (`BaseOrderService.ts:811-848`) soft-deletes by setting `is_deleted=true`, `deleted_at`, `deleted_by`, `deleted_reason`. Deletes related `order_items`, `fire_batches`, `order_intelligence`, `dine_in_orders`, `takeaway_orders`, `delivery_orders`, `reservation_orders`.
- **Recall:** `BaseOrderService.recallOrder` (`BaseOrderService.ts:624-809`) resets fired items to `DRAFT` and emits `RECALL_KITCHEN_ORDER`.

**Gap:** No authoritative kitchen-execution check or payment-state check before void/cancel.

**File references:**
- `src/api/services/orders/BaseOrderService.ts:187-194`, `811-848`
- `src/api/services/OrderWorkflowService.ts` — workflow transitions

---

## 2. Database Schema Map

### Key Tables

| Table | PK | Tenant Key | Business Date | Money Precision | Mutable After Close | Audit Relation |
|---|---|---|---|---|---|---|
| `orders` | `id` | `restaurant_id` | `created_at` | `Decimal(10,2)` | Yes (void/cancel fields) | `audit_logs` |
| `order_items` | `id` | `order_id->orders.restaurant_id` | `created_at` | `Decimal(10,2)` | Yes (status updates) | `audit_logs` |
| `transactions` | `id` | `restaurant_id` | `created_at` | `Decimal(10,2)` | No (immutable after create) | — |
| `payments` | `id` | `order_id->orders.restaurant_id` | — | — | — | — |
| `cashier_sessions` | `id` | `restaurant_id` | `opened_at` | `Decimal(10,2)` | Yes (close fields) | — |
| `chart_of_accounts` | `id` | `restaurant_id` | — | — | Yes | — |
| `journal_entries` | `id` | `restaurant_id` | `date` | `Decimal(10,2)` | No | — |
| `ledger_entries` | `id` | `restaurant_id` | — | `Decimal(10,2)` | No | — |
| `outbox` | `id` | `restaurant_id` | `occurred_at` | — | Yes (status/attempts) | — |
| `integrations` | `id` | `restaurant_id` | `created_at` | — | Yes | — |
| `integration_deliveries` | `id` | `restaurant_id` | `created_at` | — | Yes | — |
| `fiscal_documents` | `id` | `order_id->orders.restaurant_id` | — | — | Yes | — |
| `staff` | `id` | `restaurant_id` | `created_at` | — | Yes | `audit_logs` |
| `restaurants` | `id` | — | — | — | — | — |
| `audit_logs` | `id` | `restaurant_id` | `created_at` | — | No | — |

**File references:**
- `prisma/schema.prisma:33-51` — `audit_logs`
- `prisma/schema.prisma:53-72` — `cashier_sessions`
- `prisma/schema.prisma:92-130` — `chart_of_accounts`
- `prisma/schema.prisma:276-302` — `journal_entries`
- `prisma/schema.prisma:303-330` — `ledger_entries`
- `prisma/schema.prisma:394-427` — `order_items`
- `prisma/schema.prisma:429-445` — `order_type_defaults`
- `prisma/schema.prisma:447-528` — `orders`
- `prisma/schema.prisma:692-760` — `restaurants`
- `prisma/schema.prisma:832-873` — `staff`
- `prisma/schema.prisma:1019-1030` — `transactions`
- `prisma/schema.prisma:1172-1261` — `outbox`, `integrations`, `integration_deliveries`
- `prisma/schema.prisma:1265-1327` — `payments`
- `prisma/schema.prisma:1328-1376` — `fiscal_documents`

---

## 3. Existing Accounting System Identity

### Current Evidence

FireFlow has an **internal accounting engine**, not an external product:

- `AccountingService` (`src/api/services/AccountingService.ts`): creates ledger entries, records order sales, handles supplier bills/payments, generates P&L reports.
- `JournalEntryService` (`src/api/services/JournalEntryService.ts`): enforces double-entry rules, balanced journals, GL code conventions (1000 Cash, 1010 Card Receivable, 2000 Tax Payable, 4000 Revenue, etc.).
- `chart_of_accounts` table: per-restaurant COA.
- `journal_entries` table: stores balanced journal entries.
- `ledger_entries` table: stores individual debit/credit lines.

**No external accounting API endpoint, product name, version, sandbox, or authentication is configured.**

| Field | Current Evidence |
|---|---|
| Product name/edition | Unknown — internal engine only |
| Version | Unknown |
| Hosting model | Local PostgreSQL via Express API |
| Country/legal entity | Unknown |
| API documentation | Internal code only |
| Sandbox | Unknown |
| Import/export formats | Unknown |
| Webhook support | Internal EventBus only |
| Rate limits | Unknown |
| Authentication | Internal JWT + role checks |
| Accounting-period API | Unknown |
| Journal-entry API | Internal `JournalEntryService` |
| Reversal/adjustment capabilities | Unknown |
| External-reference support | `reference_type`, `reference_id` on ledger/journal entries |
| Idempotency support | `ledger_entries` checks existing `reference_id` + `reference_type='ORDER'` + `CREDIT` |

**Gap:** No external accounting system has been selected or configured.

---

## 4. Existing Integration Audit

### 4.1 Connectors and Registries

| Component | File | Status |
|---|---|---|
| `EventBus` | `src/shared/lib/EventBus.ts` | In-memory `EventEmitter`; no persistence |
| `OutboxReader` | `src/api/services/OutboxReader.ts` | Claims outbox rows, publishes to EventBus |
| `IntegrationRegistry` | `src/api/services/integration/IntegrationRegistry.ts` | Singleton registry for connectors |
| `IntegrationDispatcher` | `src/api/services/integration/IntegrationDispatcher.ts` | Polls outbox, dispatches to connectors |
| `MockConnector` | `src/api/services/integration/connectors/MockConnector.ts` | Mock connector for testing |
| `PaymentRegistry` | `src/api/services/payment/PaymentRegistry.ts` | Mock payment provider registered |
| `FiscalRegistry` | `src/api/services/fiscal/FiscalRegistry.ts` | Mock fiscal provider registered |

**No production accounting connector is registered.**

### 4.2 Outbox Schema

`outbox` table supports:
- `event_type`, `aggregate_type`, `aggregate_id`
- `status`: `PENDING`, `PROCESSING`, etc.
- `attempt_count`, `lock_owner`, `lock_expires_at`
- Idempotency via `integration_deliveries.[integration_id, outbox_id]` unique constraint

### 4.3 Scheduled Jobs

- `OutboxReader` polls every 1s by default.
- `IntegrationDispatcher` polls every 1s.
- `FiscalDeliveryService` processes completed fiscal deliveries.

**Gap:** No accounting-specific connector, export job, or reconciliation job exists.

---

## 5. Tax and Discount Findings

### 5.1 Tax

- Tax is configured per `order_type` in `order_type_defaults`.
- `tax_rate`: `Decimal(5,2)`, default `16`.
- `tax_type`: `INCLUSIVE` or `EXCLUSIVE`.
- `tax_enabled`: boolean.
- Tax calculation is deterministic and centralized in `recalculateTotals`.
- Historical orders store calculated `tax` and `tax_type`; no versioning of tax rules.

**Gap:** No tax-rule versioning; historical tax cannot be recalculated without current settings.

### 5.2 Discounts

- `discount_max` in `order_type_defaults` is **not enforced**.
- Discount values are accepted without validation in `recalculateTotals`.
- Discount type and reason stored in `orders.breakdown` JSON.

**Gap:** No authoritative discount policy enforcement.

---

## 6. Security and Privacy Observations

- **Tenant isolation:** `restaurant_id` is enforced on most queries via `authMiddleware` (`req.restaurantId`).
- **PIN exposure:** Debug logging of PINs has been removed in current session; bcrypt migration is in progress.
- **Audit logs:** `audit_logs` table captures actions with staff, restaurant, and details JSON.
- **Staff sanitization:** `pin` and `hashed_pin` are stripped from API responses.
- **Internal accounting:** No external data egress for accounting data currently occurs.
- **Gap:** No external accounting webhook verification, data-residency controls, or PII minimization policy for accounting exports.

---

## 7. Deployment Topology Evidence

| Item | Current Evidence |
|---|---|
| Application instances | Unknown |
| Worker processes | `OutboxReader` + `IntegrationDispatcher` run in-process |
| Database topology | Local PostgreSQL via Prisma |
| Shared cache / Redis | Unknown — `express-rate-limit` uses in-memory store |
| Queue infrastructure | Internal outbox + polling; no external queue |
| Deployment regions | Unknown |
| Network egress controls | Unknown |
| Clock synchronization | Unknown |
| Backup/restore | Unknown |
| Log retention | `EnterpriseLogger` flushes to `logs/` every 30s |
| Monitoring | Sentry initialized; `HealthMonitor` present |

**Gap:** Production topology is unknown, which affects outbox processing, rate limiting, and integration reliability design.

---

## 8. Gap Register

| Area | Current Evidence | Status | Gap | Owner | Decision Needed |
|---|---|---|---|---|---|
| External accounting product | None | Unknown | Product/interface not confirmed | Finance/IT | Yes |
| Accounting API | None | Unknown | No external API endpoints configured | Finance/IT | Yes |
| Tax rule versioning | Current settings only | Partial | Historical tax cannot be versioned | Tax owner | Yes |
| Discount enforcement | `discount_max` exists | Unsafe | Not enforced in `recalculateTotals` | Product/Finance | Yes |
| Void/cancel guards | Table release only | Partial | No kitchen/payment state checks | CTO/Operations | Yes |
| Refund boundary | Excluded from scope | Blocked | Provider/accounting workflow absent | CTO/Finance | Yes |
| Outbox delivery guarantee | `OutboxReader` + `IntegrationDispatcher` | Partial | No dead-letter handling or monitoring | Engineering | Yes |
| Rate limiter topology | `express-rate-limit` in-memory | Partial | Production shared store unknown | Platform | Yes |
| Deployment topology | Unknown | Unknown | Instances, Redis, workers unconfirmed | Platform | Yes |
| Reconciliation spec | None | Unknown | Frequency, format, variance rules undefined | Finance | Yes |
| Account mappings | Internal GL codes exist | Partial | External accounting COA mapping unavailable | Finance | Yes |
| External connector | None | Missing | No accounting connector implemented | Engineering | Yes |

---

## 9. Deliverables Checklist

| # | Deliverable | Current State |
|---|---|---|
| 1 | Current-state architecture diagram | Partial — internal engine mapped; external target unknown |
| 2 | POS transaction lifecycle map | Complete — see Section 1 |
| 3 | Accounting-system capability matrix | Blocked — no external system confirmed |
| 4 | Database and field ownership map | Complete — see Section 2 |
| 5 | Payment and settlement flow | Partial — internal flow mapped; provider/settlement unknown |
| 6 | Tax and discount policy document | Partial — tax logic documented; discount policy missing |
| 7 | Void/correction/refund decision table | Partial — void/cancel mapped; refund boundary excluded |
| 8 | Security and privacy assessment | Partial — internal audit present; external export unknown |
| 9 | Integration gap register | Complete — see Section 8 |
| 10 | Target-state architecture options | Not started — requires external accounting decision |
| 11 | Reconciliation specification | Not started — requires Finance input |
| 12 | Implementation backlog with estimates | Not started |
| 13 | Test and acceptance plan | Not started |
| 14 | Rollback and recovery plan | Not started |

---

## 10. Recommended Next Steps

1. **Confirm accounting target:** Finance/IT to specify external accounting product, version, environment, API docs, sandbox, and authentication.
2. **Resolve discount policy:** Product/Finance to define `discount_max` semantics, scope, and enforcement rules.
3. **Resolve void/cancel policy:** CTO/Operations to approve kitchen-state and payment-state guards.
4. **Confirm deployment topology:** Platform to document instances, Redis availability, workers, and regions.
5. **Define reconciliation spec:** Finance to specify frequency, format, variance rules, and exception ownership.
6. **Only then:** Select connector architecture and request implementation authorization.

---

## Appendix A — File Reference Index

| File | Relevance |
|---|---|
| `src/api/services/AccountingService.ts` | Internal accounting engine, ledger entries, order sale recording |
| `src/api/services/JournalEntryService.ts` | Double-entry journal posting, GL codes, balance guards |
| `src/api/services/orders/BaseOrderService.ts` | Order lifecycle, tax/discount calc, void/cancel/delete |
| `src/api/services/OrderWorkflowService.ts` | Order state transitions |
| `src/api/server.ts` | Settlement endpoint, auth middleware, accounting routes |
| `src/shared/lib/EventBus.ts` | In-memory domain event bus |
| `src/api/services/OutboxReader.ts` | Outbox polling and EventBus publication |
| `src/api/services/integration/IntegrationRegistry.ts` | Connector registry |
| `src/api/services/integration/IntegrationDispatcher.ts` | Outbox dispatch to connectors |
| `src/api/services/integration/connectors/MockConnector.ts` | Mock connector for testing |
| `src/api/services/payment/PaymentRegistry.ts` | Mock payment provider |
| `src/api/services/fiscal/FiscalRegistry.ts` | Mock fiscal provider |
| `prisma/schema.prisma` | Full database schema |
| `src/config/env.ts` | Environment configuration |
| `package.json` | Dependencies and scripts |
