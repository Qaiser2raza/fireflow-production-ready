---
status: APPROVED rev1 — design phase only; production changes remain separately unauthorized
mission: M021 — provider-attempt single-claim race elimination
governing-constraint: >
  A real-money provider may not be activated while concurrent duplicate
  settlement attempts can create duplicate provider attempts. The fix must be
  layered (storage uniqueness, compare-and-set driver ownership,
  deterministic provider idempotency), must leave settlement semantics
  (settlement_key journal/event authority), FAILED ≠ UNKNOWN discipline,
  UNKNOWN-reconcile boundary, CASH inline handling, mixed-tender accounting,
  outbox idempotency, M019 gate precedence, F-01/F-02 boundaries and the
  TD-12 write boundary exactly intact — and must be proven by a wide
  concurrent RUNTIME race, never asserted from code shape.
owner: FireFlow team
last_reviewed: 2026-08-26
evidence-base: >
  Phase B orchestrator/dispatcher code paths (verified working tree
  7ea8474); prisma schema facts; F-02 R1 three-layer duplicate-protection
  mechanism runtime-proven in M020 (73/73).
revision-notes: >
  rev1 answers the twelve co-CTO design questions concretely, states the
  concurrency invariant PA-1, fixes the crash-window treatment on the
  already-proven F-02 resume model, and defines the m021 evidence matrix.
  Co-CTO review 2026-08-26: design APPROVED; implementation, migration
  application and provider activation remain gated.
---

# Design — Provider-Attempt Single-Claim Race Elimination (M021), rev 1

## 0. The disclosed defect (current, verified)

Phase B settlement is order-level idempotent but line-level racy:

- `SettleOrchestrator.resolveProviderLines` fast-path is a plain
  `findFirst` on `request_idempotency_key` followed by row creation — a
  classic check-then-act window. Two concurrent settles of the same order
  can both miss, both INSERT a `payments` aggregate, and both drive an
  attempt.
- The `payments` table carries **no unique constraint at all** (indexes
  only) — nothing in storage admits one aggregate per logical settle line.
- `PaymentDispatcher.startAttempt` derives the provider idempotency key
  **randomly per attempt** (`payment:{paymentId}:attempt:{uuid}`), so even
  retroactive dedupe of two aggregates is impossible downstream.
- Consequence: `orders.settlement_key` UNIQUE prevents duplicate
  settlement/journaling, but the orphaned second payments aggregate plus its
  second provider operation persist — a double charge against any
  real-money provider.

Formally recorded as a hard prerequisite in EXPRESS_KITCHEN_GATE_DESIGN §9
and REFUND_FLOW_DESIGN §0. This mission closes it before any provider
activation.

## 1. Fix shape — three layers, one unchanged authority

| Layer | Mechanism | Race closed |
|---|---|---|
| L1 storage | `payments.settle_line_key VARCHAR(120) NULL UNIQUE` | aggregate-creation |
| L2 execution | compare-and-set claim `PENDING\|PROCESSING → PROCESSING` | concurrent drive |
| L3 provider | deterministic key `payment:{paymentId}` | duplicate outward operation |

Authority unchanged: `orders.settlement_key` remains the sole
journal/event gate; the dispatcher API surface, reconcile endpoint and
outbox triple-uniqueness are untouched.

## 2. Claim identity and storage (Q1, Q2, Q7)

Claim identity = the logical settle line the orchestrator already keys:

    SETTLE_LINE:{tenantId}:{orderId}:{METHOD}

Persisted as a new nullable column `payments.settle_line_key`:

- Nullable because billing/A1/SaaS payment rows do not represent POS settle
  lines; Postgres UNIQUE ignores NULLs, so those rows are unaffected.
- Additive migration only: one `ALTER TABLE payments ADD COLUMN`, one
  `CREATE UNIQUE INDEX payments_settle_line_key_key`. No existing column or
  row is altered. Backfill is trivially empty (no historical duplicates are
  silently merged; if one ever existed the index creation would fail loudly,
  which is the correct outcome).
- Winner's INSERT creates the aggregate PENDING. Every loser receives
  Prisma `P2002`, fetches the winner's row by the same key, and converges
  (§4). Retries converge on the identical key because it is deterministic
  in tenant, order and method (Q7).

## 3. Single-driver execution claim (Q3)

Inside `PaymentDispatcher.startAttempt`, immediately before any provider
contact:

    UPDATE payments SET status='PROCESSING'
      WHERE id=? AND restaurant_id=? AND status IN ('PENDING','PROCESSING')

`updateMany().count === 0` ⇒ the caller lost ownership: it reads back the
row and classifies from persisted state (terminal → verbatim result;
non-terminal → converged classification). Two drivers reaching the provider
for one aggregate is structurally impossible: the second cannot hold the
claim. Combined with L1, two aggregates cannot exist; combined with L3, even
a resumed drive cannot duplicate money movement. That conjunction is the
database invariant behind PA-1 (§10).

## 4. Deterministic provider idempotency

Provider idempotency key becomes `payment:{paymentId}` — stable across all
drives of one aggregate — replacing the random per-attempt UUID. The
existing `@@unique([provider, provider_idempotency_key])` on attempts stays
satisfied: `startAttempt`'s current guards mean one aggregate yields at most
one live attempt, and distinct aggregates have distinct ids by construction.

## 5. Crash windows (Q4) and stuck-PROCESSING reconciliation (Q6)

Identical recovery model to the runtime-proven F-02 §11 mechanism — no new
recovery concept is introduced:

- **Crash before provider invocation:** aggregate left PROCESSING. Any later
  settle claims it via the L2 CAS (which deliberately admits PROCESSING) and
  drives under the SAME deterministic key; the provider collapses it into
  the original logical operation. Exactly one movement.
- **Crash during invocation:** the dispatcher's 10s timeout promise resolves
  UNKNOWN; the aggregate lands UNKNOWN; M017-B reconcile applies unchanged.
- **Crash after provider acceptance, before commit:** aggregate COMPLETED/
  PAID. Retry's fast-path returns `paidLines`; the settlement transaction
  completes once under `settlement_key`. One journal, one event.

Stuck-PROCESSING is therefore always machine-resolvable within bounded time
(the owning request's own timeout bounds its lifetime); a racing reader that
loses the CAS classifies from persisted state and never waits, polls, or
re-drives blindly. Human reconcile stays reserved for UNKNOWN only (Q6).

## 6. FAILED vs UNKNOWN (Q5)

Untouched by design: FAILED maps to DEAD_LETTER attempt + settle `402`,
order stays ACTIVE, retry semantics as today; UNKNOWN maps to settle `409`
with paymentId and is resolvable exclusively through the reconcile ceremony.
M021 adds no new terminal states.

## 7. Mixed tender and CASH purity (Q8, Q9)

- Mixed tender: the claim is PER LINE, not per order. An N-line order holds
  N independent single-claim aggregates, each singly driven; the
  order-level `settlement_key` UNIQUE remains the sole journal/event gate,
  so partial-line races still converge to one settlement outcome.
- CASH: `isProviderMediated` filtering is untouched — cash never enters the
  orchestrator, never receives a settle_line_key, never creates a payments
  row or attempt. Concurrent CASH-only settles produce zero provider
  machinery (asserted at runtime, matrix row 11).

## 8. Interaction with existing mechanisms (Q10)

- `settlement_key`: unchanged semantics and precedence — final authority.
- `PaymentDispatcher`: internal claim/key change only; public method
  signatures preserved (`startAttempt`, `reconcileUnknown`).
- Reconcile route: reused as-is; UNKNOWN boundary not weakened.
- Outbox: PAYMENT_COMPLETED emission stays inside the settlement transaction
  keyed by the existing triple-uniqueness; M021 emits nothing new.
- M019 gate: still evaluated before any provider invocation; read-only over
  the unified path.
- F-01 settled-order deletion boundary and F-02 refund flow: untouched; the
  refunds aggregate keeps its own independent idempotency surface.

## 9. Tenant isolation (Q11)

The claim key embeds the JWT-derived tenant id; every lookup and the L2 CAS
are additionally scoped by `restaurant_id`. Cross-tenant probes keep the
404 oracle and audited-attempt posture. No client-supplied identifier can
select another tenant's claim.

## 10. Invariant PA-1 (stated for runtime proof)

> **PA-1 (single provider-operation authority).** For every logical line
> `SETTLE_LINE:{tenant}:{order}:{METHOD}`, at most ONE `payments` aggregate
> can exist (L1 storage UNIQUE); at most ONE execution can hold its
> PENDING→PROCESSING claim (L2 compare-and-set); every drive of that
> aggregate presents the ONE deterministic provider idempotency key
> `payment:{paymentId}` (L3 provider dedupe).
>
> Therefore N concurrent or retried settles converge to exactly one
> provider operation, exactly one authoritative attempt, and exactly one
> settlement/journal/event outcome.

PA-1 is a RUNTIME invariant: closure requires the wide-race evidence of
§12, not code inspection.

## 11. Acceptance criteria (co-CTO bar, non-negotiable)

| Proof | Required result |
|---|---|
| 8× concurrent CARD settle | 1 `payments` row |
| Provider attempts | 1 row / 1 mock send |
| Provider idempotency | Same deterministic key |
| Successful settlement | 1 journal + 1 completion event |
| Concurrent responses | One authoritative success; rest converge to replay/known state |
| Sequential retry | Zero additional provider calls |
| PROCESSING crash/resume | One provider operation |
| UNKNOWN | 409 → reconcile → fast-path |
| FAILED | 402, no settlement side effects |
| Mixed CASH + CARD | One provider operation; cash remains inline |
| CASH-only race | Zero provider aggregates/calls |
| Cross-tenant | 404 oracle + audit |
| M019 gate | Still precedes provider invocation |
| M020 refund | Remains green |

## 12. Evidence plan — tests/mission-021-provider-race.test.ts (Q12)

Registered in `scripts/release-gate.cjs` when implementation begins.

1. PA-R1 wide race: 8× `Promise.all` concurrent CARD settles on one order →
   assert 1 payments row, 1 attempt row, 1 mock send call bearing the
   deterministic key, exactly one non-replay 200, 1 ORDER_SALE journal, 1
   PAYMENT_COMPLETED event; losers converge (replay 200, or 409-with-
   paymentId whose immediate follow-up settle replays 200).
2. Sequential retry after success → verbatim replay; zero new rows/calls.
3. Crash matrix: (a) forced PROCESSING + fresh settle resumes → single
   provider op; (b) timeout→UNKNOWN→reconcile→fast-path re-settle; (c)
   accepted-before-commit (PAID aggregate, absent journal) → retry completes
   with exactly one journal/event.
4. FAILED ≠ UNKNOWN end-to-end (402 vs 409, attempt terminal states).
5. Mixed-tender concurrent settle (CASH+CARD): card singly claimed; cash
   inline; exactly one balanced journal covering both rails.
6. CASH-only race: zero payments/attempts rows, zero provider calls.
7. Cross-tenant settle probe → 404 oracle + audited block.
8. Regressions inside the suite: `X-Settlement-Replay` header behavior;
   M019 gate precedence; m020 suite green in-gate.

Evidence standard: named assertions with counts; the race rows must fail on
unpatched HEAD (defect reproduced first) and pass only with the fix.

## 13. Implementation and rollout order (gated)

1. Migration `*_m021_provider_claim/migration.sql`: additive column +
   unique index (applied ONLY after implementation authorization).
2. Orchestrator: deterministic key construction, INSERT-first with P2002
   convergence, classification of winner state.
3. Dispatcher: L2 CAS in `startAttempt`; deterministic provider key swap.
4. m021 suite + release-gate registration; full gate green.
5. Diff gate → commit → separate push authorization.

## 14. Explicit scope guard

Out of scope unless a concrete dependency is demonstrated later: the
payment-reconcile PIN asymmetry, historical server.ts encoding cleanup,
commit-scope hygiene, and all other register items. No weakening of any
invariant listed in §8 is permitted to simplify the race fix.
