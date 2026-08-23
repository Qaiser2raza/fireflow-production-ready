# Mission 017 Task 1 — Restaurant Core Workflow Audit

**Status:** AUDIT COMPLETE (read-only; zero code changes)
**Baseline audited:** `main @ ed93e1a` (tag `mission-016b-release-candidate`)
**Method:** full domain-table census (66 Prisma models), transaction-boundary map (43 `$transaction` sites), business-event emission survey, route-file enumeration (16 route modules), targeted service reads. Every claim cites `file:line`.

---

## Status legend

| Mark | Meaning |
|---|---|
| ✅ IMPLEMENTED | End-to-end functional with tests |
| 🟡 PARTIAL | Core path works; gaps or legacy duality documented |
| 🧱 SCAFFOLD-ONLY | Schema/engine exists, no production caller |
| ❌ MISSING | No implementation |

## Matrix

| # | Workflow | Status | Primary owner(s) | Tx boundary | Tests |
|---|---|---|---|---|---|
| 1 | Order → payment → completion | 🟡 **DUAL-REALITY** | `BaseOrderService` + inline `server.ts` transactions flow; `PaymentDispatcher` **orphaned** | order create: 1 tx (`BaseOrderService.ts:37`) incl. outbox; payments: none wired | rotation/isolation suites cover orders; mission-011 covers *dormant* engine only |
| 2 | Order → kitchen → fulfillment | ✅ | `OrderWorkflowService`, `fire_batches`, KDS socket events (`BaseOrderService.ts:767`) | fire/recall txs (`OrderWorkflowService.ts:53,174,303,475`) | tenant-isolation T7 |
| 3 | Cashier session → cash movement → close | ✅ | `CashierSessionService`, `CashierShiftLogService`, `sessionGate` middleware, `closeCashSession`→journal | shift-log tx (`CashierShiftLogService.ts:75`) | isolation T3/T4; phase2 T3/T4 |
| 4 | Inventory receipt → stock → consumption | ❌ **SCHEMA-ONLY** | *(no owner)* `inventory_items`, `recipe_items` have **zero API references** | n/a | none |
| 5 | Purchase → supplier → payable | 🧱 SCAFFOLD-ONLY | `supplierRoutes.ts` (130 L master-data + ledger pay); `purchase_orders(+items)` written **only by validation scripts** | supplier pay route | none |
| 6 | Sales → accounting → reconciliation | 🟡 | `AccountingService`, `JournalEntryService` (order-sale, float-issue, rider-debt journals), **Z-reports exist** (`accountingRoutes.ts:264,281`) | journal txs (`AccountingService.ts:347,1447`) | isolation T4/T5 |
| 7 | Refund / void / cancellation | 🟡 FRAGMENTED | void rules inline (`server.ts` cancel guards: fire-batch/paid checks); FBR void route exists; refunds blocked from generic update (`BaseOrderService.ts:173`) | per-route | partial via boundary suites |
| 8 | Fiscalization | ✅ | `FiscalDocumentService/Dispatcher/DeliveryService`, HMAC connector, `fiscal_documents/attempts`, reconcile endpoint (`fiscalConnectorRoutes.ts:11`) | doc create + outbox atomic (`FiscalDocumentService.ts:90`) | mission-012/013 suites |
| 9 | Delivery | ✅ | `deliveryRoutes` + `RiderShiftService`, atomic dispatch/settle txs, rider debt journaling | 5 tx sites (`deliveryRoutes.ts:122…525`) | rotation T8-T10; boundary suites |
| 10 | Restaurant setup / onboarding | 🟡 | `RestaurantProvisioningService` (atomic seed: CoA, section, table, order-type defaults); **owner-invitation flow missing by design deferral** | single provisioning tx (`RestaurantProvisioningService.ts:41`) | provisioning used as fixture by 4 suites |

---

## Cross-cutting findings

### F-01 · Payment engine is orphaned scaffolding — dual revenue reality (highest coherence risk)
`PaymentDispatcher` (208 L) implements a serious lifecycle: idempotency keys (`PaymentDispatcher.ts:50-77`), attempt state machine, provider timeout race (`:101-111`), unknown-outcome reconciliation (`:159`). The `payments`/`payment_attempts` tables and `MockPaymentProvider` are tested by `mission-011-payment-lifecycle.test.ts`.
**However**: `startAttempt` has **zero production callers**, and nothing in routes/services creates `prisma.payments` rows. The live POS money path is the legacy inline `transactions`-table flow in `server.ts`. Two payment realities coexist; only one has UI.

### F-02 · Inventory is a schema promise, not a system
`inventory_items` (L260) and `recipe_items` (L620) exist; `grep recipe_items\.|inventory_items\.` over `src/api` returns **nothing**. No receipt, deduction-on-sale, wastage, or stock-count workflow. Menu↔inventory linkage is defined but inert.

### F-03 · Business-event catalog is thin and asymmetric
Durable events (`outbox`): **ORDER_CREATED only** (`BaseOrderService.ts:136`) plus fiscal documents (`FiscalDocumentService.ts:90`). Everything else reaches clients exclusively as ephemeral `db_change` UI notifications — no durable event for PAYMENT_COMPLETED, ORDER_COMPLETED, CASH_CLOSED, REFUND_ISSUED, STOCK_* (n/a). Downstream consumers (accounting automation, future integrations) currently have almost nothing durable to subscribe to beyond orders/fiscal.

### F-04 · Accounting hooks are real but selective
Journals verified: order sale, cashier float issue, provisional rider debt, supplier bill (`AccountingService.ts`/`JournalEntryService.ts`). Cash-session close posts and feeds Z-reports. Coverage map of *which* flows post vs skip GL is undocumented outside code.

### F-05 · Refund/void semantics are split across three enforcement points
Generic update refuses refund fields (`BaseOrderService.ts:173`); cancellation guards live inline in `server.ts`; FBR void is its own route. One coherent refund/cancel service does not exist.

---

## Recommended next-domain decision input

| Candidate | Argument | Counter |
|---|---|---|
| **Order→Payment completion** (recommended) | Revenue path is the restaurant's spine; F-01 means today's money flow bypasses the engineered lifecycle. Unifying gives idempotency, attempts, and durable PAYMENT_COMPLETED events for free. | Touches hot POS path — needs careful migration behind feature parity tests |
| Inventory | Tables ready; greenfield clean | Zero current users; value unlocked best AFTER payments coherence (consumption needs completed sales) |
| Onboarding/invitations | Previously deferred deliberately | Product decision still pending |

**Recommendation:** Mission 017 execution phase = **Payments & Order Completion coherence** (adopt dispatcher onto the live path or consciously retire it), carrying a durable-event upgrade (PAYMENT_*/ORDER_COMPLETED into outbox) since the mechanism already exists.

---

*Audit performed under Mission 017 Task 1 mandate: inventory only — no implementation changes.*
