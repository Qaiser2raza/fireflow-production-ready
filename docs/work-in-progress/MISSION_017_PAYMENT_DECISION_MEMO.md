---
status: DRAFT
audience:
  - founder
  - engineering
owner: FireFlow team
last_reviewed: 2026-08-25
source: Mission 017 Task 1 audit (F-01..F-05); Fable 5 riders (journal-termination, cash semantics)
sensitivity: internal
---

# Mission 017 — Payment Coherence Decision Memo (DRAFT)

**Question:** the repo has two payment realities — the engineered but orphaned
`PaymentDispatcher` engine and the live inline `transactions` settle path.
Adopt, retire, or strangler?

**Gate:** verdict is provisional until the real-restaurant onboarding run
happens (unscheduled). Nothing here substitutes for watching the legacy path
carry real orders.

## Evidence base

- Audit: `docs/MISSION_017_WORKFLOW_AUDIT.md` F-01 (dispatcher zero callers),
  F-03 (only ORDER_CREATED + fiscal events are durable), F-04 (selective GL).
- Live path read this session: `POST /api/orders/:id/settle`
  (`server.ts:1974-2094`) — one `$transaction`: order → CLOSED/PAID,
  per-line `transactions.create`, table → DIRTY, journal posting via
  `accounting.recordOrderSale` or rider-settlement branch, gated by
  `sessionGateMiddleware` (open cashier session required).
- Dispatcher: idempotency keys, attempt state machine, provider timeout race →
  UNKNOWN reconciliation, provider abstraction; tested 24/24 by mission-011;
  no accounting integration; `payments`/`payment_attempts` unwritten in prod.

## Parity matrix (incl. journal-termination rider)

| Dimension | Legacy settle path | Dispatcher engine |
|---|---|---|
| Journal termination (ADR-007) | **Yes** — `recordOrderSale` / rider journals inside same tx | **No accounting integration** |
| Idempotency | **None server-side** — repeat POST re-closes and duplicates transactions | Idempotency keys first-class |
| Attempt/UNKNOWN outcomes | N/A — synchronous only | State machine + timeout race + reconciliation |
| Provider abstraction | None (method strings) | `PaymentProvider` port + Mock |
| Split payments | Supported (`paymentLines`) | Modeled per-attempt |
| Cashier-session binding | Enforced (`sessionGateMiddleware`) | Not modeled |
| Durable business events | None (ephemeral socket only) | Emits lifecycle events internally |
| Tenant isolation | Verified by suites | Tested (dormant) |
| UI integration | Live POS/logistics flows | None |

New findings beyond the audit (this session's reads, corrected during Phase A):

- **Settle idempotency gap confirmed** — no server-side guard existed; a repeat
  POST re-closed the order and duplicated transaction rows. Fixed in Phase A.
- **Split-payment "mis-journaling" RETRACTED**: deeper inspection shows both
  `recordOrderSale` (ledger) and `recordOrderSaleJournal` (GL) already iterate
  ALL paid transactions per method (`JournalEntryService.ts:239-273` maps
  CASH→1000, CREDIT→1040, digital→1010 with per-line `meta.paymentMethod`);
  the settle route's `paymentLines[0].method` override is only the
  zero-transactions fallback, which settle never produces. Verified by the
  mixed-tender drill (60 CASH + 50 CARD → two correctly attributed journal
  lines, balanced 110/110). My earlier parity-matrix row was wrong.
- **Fiscal linkage does not exist yet**: POS settle creates no fiscal documents
  (`FiscalDocumentService.create` is reachable only via the connector route).
  Tender-type-as-compliance-field therefore has nothing to consume today;
  recorded as an input to the fiscal mission, not built here.

## Cash-semantics analysis (CTO rider)

Cash has no provider timeout and no unknown outcome — routing it through the
attempt state machine is ceremony without value. Card/digital (future) has
exactly those problems. A single uniform pipeline either over-engineers cash
or under-engineers providers. Conclusion: **method-routed completion** —
synchronous commit for CASH, dispatcher attempts for provider-mediated methods,
both terminating in the same journal-posting + durable-event contract.

## Options

- **A. Adopt now** — wire dispatcher onto the live route, big parity cutover on
  the revenue spine. Costliest; buys attempt machinery before any provider exists.
- **B. Retire** — delete engine; keep legacy with patches (idempotency guard,
  split-method journals, durable events). Cheapest now; re-pays the engine cost
  when the first real provider arrives.
- **C. Strangler (recommended)** — two small phases:
  - **Phase A (legacy-hardening, hot-path-safe):** inside the existing settle
    transaction add (a) idempotency guard (reject if already PAID; client
    replay-safe key optional), (b) per-line journal methods for splits, (c)
    outbox events `PAYMENT_COMPLETED` + `ORDER_COMPLETED` (mechanism exists,
    order-created precedent at `BaseOrderService.ts:136`). No schema change.
  - **Phase B (engine adoption when a real provider lands):** introduce
    `PaymentDispatcher` behind the same route for non-CASH methods; cash keeps
    Phase-A synchronous completion. The dual-reality ends because both paths
    share the event+journal contract, verified by one parity suite.

## Recommendation

**C**, with Phase A as the M017 execution core. It directly serves the
non-negotiable carried from prior sessions — `PAYMENT_COMPLETED` /
`ORDER_COMPLETED` originate from the coherent path only, never bolted onto
legacy — while keeping the hot path's blast radius minimal.

## Acceptance criteria (whichever option wins)

1. Parity suite: settle idempotent under duplicate submit; journals balance per
   payment method for splits; `PAYMENT_COMPLETED`/`ORDER_COMPLETED` present in
   outbox within the settle transaction; delivery/logistics branch unchanged.
2. Journal termination proven: every completed payment produces balanced
   journal entries (audit-verified like ORD-215748-Z52).
3. Onboarding run executed on the winning path before release claim.

## Open inputs

- Real-restaurant onboarding run (calendar slot — keeps losing to infra work).
- Founder decision on first target provider (Phase B trigger).
