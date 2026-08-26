---
status: REVISED v2 — five dispositions integrated; awaiting final implementation nod
mission: M018 F-02 — refund flow for settled orders
governing-constraint: >
  A refund is a money-moving reversal of a completed sale. It must ride the
  same discipline as settlement: deterministic idempotency, provider state
  machine (never forced), balanced mirror-image journals, durable events,
  audit with credential hygiene, and tenant isolation. It never deletes or
  resurrects anything, and it never mutates historical closed-session
  accounting.
owner: FireFlow team
last_reviewed: 2026-08-26
evidence-base: M018 audit + Phase A/B journal model (runtime-verified)
revision-notes: >
  v2 integrates the five co-CTO dispositions (time-window policy, day-close
  session-context model, structured reason form, refund-reconcile auth,
  instance-scoped events + separated ceremony), adds the concurrent-race
  invariant (R1) and the closure evidence matrix (§18).
---

# Design — Refund Flow (M018 F-02), rev 2

## 0. Current state (proven)

- Refunds are impossible today: `refund_transaction_id`/`void_notes` are
  schema-only and boundary-locked (403 at route AND service); no endpoint
  exists (M018 finding F-02, runtime-reproduced).
- `orders.payment_status` enum ALREADY contains `REFUNDED` and
  `PARTIALLY_PAID` — no enum migration.
- `transactions.status` is free-text VarChar(20) — reversal rows need no
  migration.
- Journal model to reverse is runtime-proven (M018 §E): per-tender asset
  debits (1000/1010/1040), credits to 4000 net, 2000 tax liability, 2010 SC,
  4010 delivery, 4900 discount debit, 4020 rounding.
- Provider rails: PaymentDispatcher + `payments`/`payment_attempts` (Phase B);
  reconcile endpoint pattern exists; MOCK_PAYMENT is the only registered
  provider (real provider stays gated on the duplicate-attempt race).

## 1. Who can refund

`MANAGER / ADMIN / SUPER_ADMIN` — **plus the money-movement PIN ceremony**:
server-side bcrypt re-verification of the SESSION manager's own PIN (identity
derived from the authenticated session, never client-supplied), structured
reason required (§5). A valid session alone is not consent; a refund moves
real money outward.

## 2. Full vs partial refund

**v1 scope: FULL-ORDER refund only** — one refund per settled order, reversing
the entire settled amount across all original tender lines 1:1.

**Partial refunds are a designed-for extension:** the `refunds` aggregate
carries `amount` + per-tender allocation payload consumed by the journal
builder; v2 adds per-line selection and the (already-existing)
`PARTIALLY_REFUNDED`-style order state without schema rework.

## 3. Refund idempotency key — and the race invariant (R1)

Deterministic: **`REFUND:{restaurantId}:{orderId}`** — v1 permits exactly one
refund per settled order. Three enforcement layers:

1. `refunds.refund_key` UNIQUE (storage),
2. provider-side idempotency key `refund:{refundId}` (provider dedupes),
3. fast-path: retry loads the existing aggregate and returns its current
   state verbatim — the provider is NEVER re-driven for an existing key.

**INVARIANT R1 — no refund race.** Two concurrent refunds for the same order
CANNOT become two independent provider operations: both requests compute the
same `refund_key`; the storage UNIQUE constraint admits exactly one INSERT;
the loser receives the winner's aggregate (settlement replay pattern) and
never reaches the provider. **The implementation suite must prove this with a
concurrent race (Promise.all), not merely assert the key shape.**

## 4. New aggregate: `refunds`

```prisma
model refunds {
  id                 String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  restaurant_id      String   @db.Uuid
  order_id           String   @db.Uuid
  refund_key         String   @unique @db.VarChar(100)   // REFUND:{tenant}:{order}
  amount             Decimal  @db.Decimal(10, 2)         // == settled total (v1)
  currency           String   @default("PKR") @db.VarChar(3)
  status             String   @default("PENDING") @db.VarChar(20) // PENDING|PROCESSING|COMPLETED|FAILED|UNKNOWN
  provider           String   @db.VarChar(50)            // 'CASH_DRAWER' | provider type
  external_reference String?  @db.VarChar(255)
  reason_code        String   @db.VarChar(40)            // structured, §5
  reason_detail      String?  @db.VarChar(255)           // optional bounded detail
  session_id         String?  @db.Uuid                   // session context the refund landed in (§7)
  requested_by       String   @db.Uuid                   // session manager (server-derived)
  created_at         DateTime @default(now()) @db.Timestamp(6)
  completed_at       DateTime? @db.Timestamp(6)
  @@index([restaurant_id]) @@index([order_id])
}
```

Additive migration; no existing table altered.

## 5. Reason form (disposition #3)

**Required structured code + optional bounded detail** — free-form-only
reasons are poor audit data:

```text
reason_code ∈ { CUSTOMER_REQUEST, ORDER_ERROR, FOOD_QUALITY,
                DUPLICATE_CHARGE, OTHER }        // VarChar(40), required
reason_detail    free text, 0..255 chars, optional
```

Both persist on the refund aggregate and flow into audit/outbox payloads.

## 6. Mixed tender + reversal rails

The refund reverses **each original tender line 1:1 to its own rail** — money
returns the way it arrived:
- Original CASH row → CASH reversal row + cash-asset journal credit (drawer
  math moves via ledger; §7).
- Original CARD/RAAST/digital row → provider refund attempt through the
  PaymentDispatcher refund path + card-asset journal credit.

Refund-to-different-tender is explicitly out of scope (fraud surface).

## 7. Session context and day-close interaction (disposition #2)

**Historical closed-session accounting is NEVER mutated.** The day-close model
(expected = opening + cash-account journal movement since `opened_at`) is
left untouched; refunds are made COMPATIBLE with it by construction:

- The refund route requires an OPEN cashier session (`sessionGateMiddleware`,
  same as settlement). A cash refund is a drawer event; it can only happen
  inside a session context.
- The refund's journal + ledger rows carry `created_at = refund time` and
  `session_id` = the open session — so a within-session refund reduces that
  session's expected cash at ITS close (visible, auditable, no retroactive
  edit of any closed session).
- A refund AFTER a session closed (but before the next opens) is refused for
  the CASH rail: `409 REFUND_NO_OPEN_SESSION` — the drawer is not accountable
  outside a session, and silently landing the movement in tomorrow's session
  would misstate it. Card/digital rails do not touch the drawer and MAY
  proceed without a session (provider rail is not drawer-bound).
- Net effect: **every cash refund lands in exactly one open session's
  accounting; closed sessions are immutable; the variance the co-CTO asked
  for is the natural expected-cash delta at the containing session's close.**

## 8. Journal reversal — mirror image, reference_type `ORDER_REFUND`

Mirror of the sale journal, keyed to the refund aggregate (the sale journal
remains immutable history — never edited, never deleted):

| Sale line (ORDER_SALE) | Refund reversal (ORDER_REFUND) |
|---|---|
| DR 1000/1010/1040 per tender (asset in) | CR 1000/1010/1040 per tender (asset out) |
| CR 4000 net revenue | DR 4000 revenue reversal |
| CR 2000 Tax Payable | **DR 2000 Tax Payable (liability correctly reduced)** |
| CR 2010 SC Payable | DR 2010 SC Payable |
| CR 4010 Delivery Revenue | DR 4010 Delivery Revenue |
| DR 4900 Discount | CR 4900 Discount reversal |
| DR/CR 4020 Rounding | sign-flipped 4020 Rounding |

Balanced by construction; `JOURNAL_IMBALANCE` throw applies identically.
Ledger entries per tender method keep Calculated Cash / day-close correct.

## 9. Provider UNKNOWN (disposition #4 extended)

The refund aggregate lands in `UNKNOWN`; the order's `payment_status` is NOT
flipped; NO reversal journal is posted. Resolution ONLY via
`POST /api/refunds/:id/reconcile` — **`MANAGER+` PLUS the money-movement PIN
ceremony** (disposition #4: reconcile resolves provider state; it must not
become a journal-mutation side door; tenant/actor session-derived).
Reconciled PAID → reversal journal + order REFUNDED + events; reconciled
FAILED → refund FAILED, order remains PAID, retry permitted under R1 rules.

> Asymmetry note for the hygiene backlog: the PAYMENT reconcile route (M017-B)
> is currently auth-only without the PIN ceremony. Refund reconcile is
> specified stricter per this disposition; payment reconcile should be
> tightened to match in a hygiene bundle (flagged, not in scope here).

## 10. Audit / events (disposition #5)

| Event | Where | Notes |
|---|---|---|
| `REFUND_REQUESTED` | audit_logs ONLY (the ceremony record) | actor, role, PIN-verified: true, reason_code/detail, session context |
| `ORDER_REFUND_COMPLETED` | audit_logs + outbox | instance-scoped |
| `ORDER_REFUND_FAILED` | audit_logs (+outbox terminal) | instance-scoped |
| `ORDER_REFUND_UNKNOWN` | audit_logs (+outbox) | instance-scoped |

All refund outbox events use **instance-scoped aggregates** (aggregate_id =
the refund's own audit-row id per event, per the M019 repeatable-event
lesson). Payloads: orderId, refundId, tenantId, amount, per-tender
allocation, reason_code, actor + role, correlation — **never PIN/credential
material**. The ceremony (PIN verification) is represented by the separate
`REFUND_REQUESTED` audit record, not embedded in the business events.

## 11. Failure AFTER provider-side acceptance

Provider returns PAID but our commit fails: the refund aggregate already
persists with the provider `external_reference`. Retry with the same
deterministic key → fast-path loads the aggregate → completes from persisted
state; the provider sees the same provider-idempotency key and dedupes.
**No double reversal is possible** (R1 + §3 layers).

## 12. Refund time-window policy (disposition #1)

**Explicit, configurable, server-enforced, audited — never unlimited-by-
default:**

- Additive column `restaurants.refund_window_days INT NOT NULL DEFAULT 7`.
- Server enforcement in the refund route: refundable iff
  `order.closed_at >= now - refund_window_days` (window `0` = same business
  day only; large values are explicit configuration, not an implicit
  unlimited).
- Exceeded → `403 REFUND_WINDOW_EXCEEDED` + `REFUND_REQUESTED`-class audit
  record of the blocked attempt (blocked money-movement attempts are signals,
  per the F-01 precedent).
- Configurable via the existing restaurant configuration route (same
  MANAGER+ posture as `order_flow_mode`).

## 13. Tenant isolation / authorization chain

`POST /api/orders/:id/refund` → authenticated session → own tenant (order
lookup tenant-scoped) → MANAGER+ → PIN ceremony → structured reason →
session-context check (§7) → window check (§12) → proceed.
`POST /api/refunds/:id/reconcile` → tenant-scoped via the refund aggregate →
MANAGER+ + PIN ceremony. No client-supplied tenant or manager identifier
participates anywhere. Cross-tenant probes: standard 404-oracle + audit.

## 14. New surfaces summary

| Surface | Change |
|---|---|
| `prisma/schema.prisma` + migration | additive `refunds` table + `restaurants.refund_window_days` |
| `POST /api/orders/:id/refund` | NEW — MANAGER+ + PIN ceremony + structured reason + session/window enforcement |
| `POST /api/refunds/:id/reconcile` | NEW — MANAGER+ + PIN ceremony, tenant-scoped |
| `PaymentDispatcher` | refund path (attempt state machine reuse; provider `refund` capability) |
| `MockPaymentProvider` | refund modes (SUCCESS/FAILED/UNKNOWN) for evidence |
| `JournalEntryService` | `recordOrderRefundJournal` — mirror-image builder (§8) |
| Restaurant config route | `refundWindowDays` field (MANAGER+, audited) |
| POS UI | refund action on settled orders (manager ceremony) |

## 15. Explicit non-goals (v1)

- Partial / per-line refunds (schema designed-for; logic v2)
- Refund to a different tender than the original
- Gateway fee handling / settlement-fee netting
- Refund of logistics-settled delivery orders (rider receivable reversal —
  separate flow, after v1 proves the core)
- Any change to PaymentDispatcher's existing payment attempt semantics
- Retroactive mutation of closed-session accounting (forbidden, §7)

## 16. Open questions — DISPOSITIONED by co-CTO (2026-08-26)

| # | Question | Disposition |
|---|---|---|
| 1 | Refund time-window | **Explicit configurable policy, server-enforced, audited; never silently unlimited** → §12 (`refund_window_days`, default 7, 0=same-day) |
| 2 | Day-close interaction | **Never mutate historical closed sessions** → §7 (open-session requirement for the cash rail; variance = natural expected-cash delta at containing session's close) |
| 3 | Reason form | **Structured code + optional bounded detail** → §5 |
| 4 | Refund-reconcile auth | **MANAGER+ + money-movement PIN ceremony**; reconcile must not permit arbitrary journal mutation → §9 |
| 5 | Event names | Accepted; **all refund events instance-scoped; ceremony separately audited** → §10 |

## 17. Binding invariants

**R1 — no refund race:** concurrent refunds of one order converge to ONE
aggregate/provider operation via the deterministic key + storage UNIQUE;
proven by a concurrent-race test (§3).
**R2 — closed sessions are immutable:** no refund path edits historical
session accounting; cash refunds require an open session context (§7).
**R3 — three-layer duplicate protection is a hard invariant:** deterministic
identity → storage uniqueness → provider idempotency (implementation
asserted at every layer, §3, §11).
**R4 — UNKNOWN discipline:** order stays PAID, no reversal journal, until
reconciliation resolves; reconcile is ceremony-gated (§9).
**R5 — boundary preservation:** refunds never delete/void/resurrect orders
(F-01), never touch PaymentDispatcher's payment-attempt semantics, and never
branch on kitchen/flow mode.

## 18. Closure evidence matrix (implementation bar)

| # | Required proof |
|---|---|
| 1 | MANAGER+ authorization; non-manager denial |
| 2 | Wrong PIN denial; missing reason denial |
| 3 | Cross-tenant denial |
| 4 | Full refund of a CASH order |
| 5 | Full refund of a digital/card order |
| 6 | Mixed-tender 1:1 reversal |
| 7 | Correct tax/revenue/discount/tender reversal journal |
| 8 | Original sale journal immutable |
| 9 | Successful refund → order `REFUNDED` |
| 10 | Provider FAILED → no reversal journal |
| 11 | Provider UNKNOWN → order remains PAID, no reversal journal |
| 12 | UNKNOWN → reconcile → exactly one resulting reversal |
| 13 | Sequential duplicate refund → same refund identity |
| 14 | **Concurrent duplicate refund → exactly one refund/provider operation (R1 race test)** |
| 15 | Crash/retry after provider acceptance → persisted fast-path, no second reversal |
| 16 | Closed/day-close interaction (§7: in-session reduces expected cash; no-session cash refund refused) |
| 17 | Refund time-window enforcement (inside passes; outside 403 + audited block) |
| 18 | Audit + outbox events emitted, instance-scoped, ceremony separated |
