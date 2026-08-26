---
status: DRAFT — pending co-CTO review (no implementation before approval)
mission: M018 F-02 — refund flow for settled orders
governing-constraint: >
  A refund is a money-moving reversal of a completed sale. It must ride the
  same discipline as settlement: deterministic idempotency, provider state
  machine (never forced), balanced mirror-image journals, durable events,
  audit with credential hygiene, and tenant isolation. It never deletes or
  resurrects anything.
owner: FireFlow team
last_reviewed: 2026-08-26
evidence-base: M018 audit (docs/MISSION_018_SETTLEMENT_INTEGRITY_AUDIT.md) + Phase A/B journal model (runtime-verified)
---

# Design — Refund Flow (M018 F-02)

## 0. Current state (proven)

- Refunds are impossible today: `refund_transaction_id`/`void_notes` are
  schema-only and boundary-locked (403 at route AND service); no endpoint
  exists (M018 finding F-02, runtime-reproduced).
- `orders.payment_status` enum ALREADY contains `REFUNDED` and
  `PARTIALLY_PAID` — the schema anticipated this flow; no enum migration.
- `transactions.status` is free-text VarChar(20) — reversal rows need no
  migration.
- The journal model to reverse is runtime-proven (M018 §E): per-tender asset
  debits (1000 cash / 1010 card-digital / 1040 customer), credits to 4000 net
  revenue, 2000 tax liability, 2010 SC liability, 4010 delivery, 4900
  discount debit, 4020 rounding.
- Provider rails: PaymentDispatcher + `payments`/`payment_attempts`
  aggregates (Phase B); reconcile endpoint exists; MOCK_PAYMENT is the only
  registered provider until the founder's real-provider decision (which
  itself stays gated on the duplicate-attempt race).

## 1. Who can refund

`MANAGER / ADMIN / SUPER_ADMIN` — **plus the established money-movement
ceremony**: server-side bcrypt re-verification of the SESSION manager's own
PIN (identity derived from the authenticated session, never client-supplied),
non-empty `reason` required. Identical posture to the M019 payment-override:
a refund moves real money outward; a valid session alone is not consent.

## 2. Full vs partial refund

**v1 scope: FULL-ORDER refund only** — one refund per settled order, reversing
the entire settled amount across all original tender lines.

**Partial refunds are a designed-for extension, not implemented in v1:** the
`refunds` aggregate carries `amount` and a per-tender allocation payload, and
the journal builder consumes allocations — so v2 adds per-line/partial
selection without schema rework. `PARTIALLY_PAID`-style `PARTIALLY_REFUNDED`
order state is the natural v2 extension (the enum value already exists).

## 3. Refund idempotency key

Deterministic, settlement-pattern: **`REFUND:{restaurantId}:{orderId}`** —
v1 permits exactly one refund per settled order. Enforced at three layers:
1. `refunds.refund_key` UNIQUE (storage — the settlement_key pattern),
2. provider-side idempotency key `refund:{refundId}` (provider dedupes),
3. fast-path: a retry loads the existing refund aggregate and returns its
   current state verbatim — the provider is NEVER re-driven for an existing
   key (Phase B fast-path pattern).

## 4. New aggregate: `refunds`

```prisma
model refunds {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  restaurant_id     String   @db.Uuid
  order_id          String   @db.Uuid
  refund_key        String   @unique @db.VarChar(100)   // REFUND:{tenant}:{order}
  amount            Decimal  @db.Decimal(10, 2)         // == settled total (v1)
  currency          String   @default("PKR") @db.VarChar(3)
  status            String   @default("PENDING") @db.VarChar(20) // PENDING|PROCESSING|COMPLETED|FAILED|UNKNOWN
  provider          String   @db.VarChar(50)            // 'CASH_DRAWER' | provider type
  external_reference String? @db.VarChar(255)
  reason            String   @db.VarChar(255)
  requested_by      String   @db.Uuid                   // session manager (server-derived)
  created_at        DateTime @default(now()) @db.Timestamp(6)
  completed_at      DateTime? @db.Timestamp(6)
  @@index([restaurant_id]) @@index([order_id])
}
```

Additive migration; no existing table touched. Per-tender allocation lives in
the reversal transaction rows + journal lines (v1 = 1:1 with original lines).

## 5. Mixed tender (CASH + CARD/RAAST/digital)

The refund reverses **each original tender line 1:1 to its own rail** — money
returns the way it arrived, never cash-back-for-card:
- Original CASH `transactions` row → CASH reversal row + cash-asset journal
  credit (drawer math via ledger drops correctly).
- Original CARD/RAAST/digital row → provider refund attempt through the
  PaymentDispatcher refund path + card-asset journal credit.

## 6. Which payment method receives the reversal

Always the **original method of each tender line** (see §5). Refund-to-
different-tender is explicitly out of scope (fraud surface, no operational
requirement yet).

## 7. Journal reversal — mirror image, reference_type `ORDER_REFUND`

The reversal journal is the exact mirror of the sale journal, keyed to the
refund aggregate (NOT the order — so the sale journal remains immutable
history):

| Sale line (ORDER_SALE) | Refund reversal (ORDER_REFUND) |
|---|---|
| DR 1000/1010/1040 per tender (asset in) | CR 1000/1010/1040 per tender (asset out) |
| CR 4000 net revenue | DR 4000 revenue reversal |
| CR 2000 Tax Payable | **DR 2000 Tax Payable (liability correctly reduced — tax is no longer owed on a refunded sale)** |
| CR 2010 SC Payable | DR 2010 SC Payable |
| CR 4010 Delivery Revenue | DR 4010 Delivery Revenue |
| DR 4900 Discount | CR 4900 Discount reversal |
| DR/CR 4020 Rounding | sign-flipped 4020 Rounding |

Balanced by construction (mirror of a proven-balanced journal);
`JOURNAL_IMBALANCE` throw applies identically. Ledger entries are written per
tender method so Calculated Cash / day-close math moves correctly. The
original ORDER_SALE journal is NEVER edited or deleted (immutability
invariant) — reversal is a new, linked fact.

## 8. Provider says UNKNOWN

Identical discipline to Phase B (invariant E2 extended to refunds): the refund
aggregate lands in `UNKNOWN`, the order's `payment_status` is NOT yet flipped
to REFUNDED, no reversal journal is posted, and resolution happens ONLY
through the reconcile mechanism — extended to refunds
(`POST /api/refunds/:id/reconcile`, same tenant-scoped pattern). Reconciled
PAID → reversal journal + order REFUNDED + events; reconciled FAILED → refund
FAILED, order remains PAID, retry allowed (new attempt, same refund_key rules).

## 9. Does a refund require provider reconciliation?

- **CASH refunds: no** — synchronous, like cash settlement (drawer operation).
- **Provider-mediated refunds: yes, on UNKNOWN only** — PAID and FAILED are
  terminal; only UNKNOWN waits for reconciliation. The reconcile endpoint is
  the single resolution mechanism; nothing else may convert UNKNOWN.

## 10. Audit / events

| Event | Where | Payload (facts only — never credentials/PIN) |
|---|---|---|
| `ORDER_REFUND_COMPLETED` | audit_logs + outbox (instance-scoped aggregate = refund audit-row id, per the M019 repeatable-event lesson) | orderId, refundId, tenantId, amount, per-tender allocation, actor + role, reason, correlation |
| `ORDER_REFUND_FAILED` / `ORDER_REFUND_UNKNOWN` | audit_logs (+outbox on terminal states) | same shape + error code |
| `REFUND_REQUESTED` (audit-only) | audit_logs | actor, role, PIN-verified: true, reason — the ceremony record |

Order state after completion: `payment_status = REFUNDED`, order remains
CLOSED — **a refund never deletes, voids, or resurrects the order** (F-01
boundary preserved). Kitchen/void semantics untouched.

## 11. Failure AFTER provider-side acceptance

Provider returns PAID but our commit fails (crash, constraint): the refund
aggregate already persists with the provider `external_reference`. Retry with
the same deterministic key → fast-path loads the aggregate → completes from
persisted state; the provider sees the same provider-idempotency key and
dedupes on its side. **No double reversal is possible** — the same three-layer
guarantee as settlement (deterministic key + storage unique + provider
idempotency), plus the M019 instance-scoped outbox pattern for events.

## 12. Retry without double reversal (summary)

Deterministic `refund_key` → one aggregate → provider idempotency key →
fast-path from persisted state → instance-scoped outbox events. A retried
refund is always the SAME refund, never a second one.

## 13. Tenant isolation / authorization chain

`POST /api/orders/:id/refund` → authenticated session → own tenant (order
lookup tenant-scoped) → MANAGER+ → PIN re-verification (session manager) →
non-empty reason → refund proceeds. `POST /api/refunds/:id/reconcile` →
tenant-scoped via the refund aggregate. No client-supplied tenant or manager
identifier participates anywhere. Cross-tenant probes: standard 404-oracle +
audit.

## 14. New surfaces summary

| Surface | Change |
|---|---|
| `prisma/schema.prisma` + migration | additive `refunds` table (§4); no existing table altered |
| `POST /api/orders/:id/refund` | NEW — MANAGER+ + PIN ceremony + reason |
| `POST /api/refunds/:id/reconcile` | NEW — tenant-scoped UNKNOWN resolution |
| `PaymentDispatcher` | refund path (attempt state machine reuse; provider `refund` capability) |
| `MockPaymentProvider` | refund modes (SUCCESS/FAILED/UNKNOWN) for evidence |
| `JournalEntryService` | `recordOrderRefundJournal` — mirror-image builder (§7) |
| POS UI | refund action on settled orders (manager ceremony) |

## 15. Explicit non-goals (v1)

- Partial / per-line refunds (schema designed-for; logic v2)
- Refund to a different tender than the original
- Gateway fee handling / settlement-fee netting
- Refund of logistics-settled delivery orders (rider receivable reversal —
  separate flow, follows after v1 proves the core)
- Any change to PaymentDispatcher's existing payment attempt semantics

## 16. Open questions for co-CTO disposition

1. **Refund window:** should refunds be time-bounded (e.g., same business day only) in v1, or unrestricted? Proposed: unrestricted in v1 (reporting surfaces abuse; no operational requirement to bound yet).
2. **Refunded orders in day-close:** refunded cash leaves the drawer — confirm the CR cash ledger treatment should reduce Calculated Cash for the session containing the refund (proposed: yes, by created_at as today).
3. **Refund reason:** free-text required (proposed, 255 chars) vs enum reasons + free note.
4. **Who may reconcile refund UNKNOWN:** MANAGER+ (proposed — mirrors payment reconcile posture).
5. **Event naming:** `ORDER_REFUND_COMPLETED` / `ORDER_REFUND_FAILED` / `ORDER_REFUND_UNKNOWN` — confirm or rename.
