# A1 Spec — Payment-Proof Submission Route (v1, for co-CTO review)

## Status
CONDITIONALLY APPROVED shape; this spec resolves the three mandatory
clarifications (authenticity, two-layer idempotency, authority boundary) and
the TD-12 prerequisite. Implementation starts on co-CTO sign-off of THIS file.

## Contract sentence

> **A1 records payment evidence; it does not confer payment authority.**

## 1. Authenticity

- **Model: client-asserted, authenticated claim.** Today FireFlow has no
  integrated payment provider (only MockPaymentProvider); tenants pay HQ via
  offline transfer/cash. There is no independent runtime verification source,
  so pretending otherwise would forge trust.
- **Trust level:** AUTHENTICATED ACTOR CLAIM — JWT-authenticated tenant staff
  (authMiddleware) inside an OPEN cashier session context (sessionGate), but
  UNVERIFIED as a payment fact. The claim's evidentiary value comes from actor
  attribution (`submitted_by` staff id + timestamp + session), not from a
  payment system.
- **Explicitly prohibited from depending on an unverified claim:**
  subscription activation or status change; license activation/mutation;
  entitlement changes; revenue recognition (zero journal/ledger postings);
  ORDER_COMPLETED/PAYMENT_COMPLETED business events; any capability grant.
- **Conversion path:** evidence becomes authoritative ONLY through the
  existing HQ-mediated verification flow (`SuperAdminService.verifyPayment`),
  executed server-side under service-role credentials post-TD-12-lockdown.
  A1 output is an INPUT to that human process, never its trigger.

## 2. Local idempotency

- **Deterministic identity:** `proof_key =
  SHA-256(restaurant_id | billing_period | method | amount_minor |
  client_token)` — client supplies `client_token` (UUID generated when the
  form opens, persisted across retries); server derives and stores the key.
  Retries of the same logical submission collide; genuinely new submissions
  (different period/method/token) do not.
- **Storage enforcement (M017-A pattern reused):** unique index on
  `subscription_payments.proof_key` (local migration). Check-then-insert is
  forbidden; concurrent losers catch the attributed P2002
  (`isSettlementUniquenessConflict`-style attribution helper, target
  `proof_key`) and return the ORIGINAL record verbatim — zero side effects.
- **Outbox:** exactly one event row per proof via the existing aggregate
  triple unique (`subscription_payment_proofs`, proofId,
  `PAYMENT_PROOF_SUBMITTED`). Concurrent submits therefore yield
  `1 proof fact + 1 event`, never two.

## 3. Cloud idempotency (downstream contract)

- Outbox guarantees **at-least-once delivery**, not exactly-once effects;
  therefore the future cloud consumer MUST be key-idempotent:
  - payload carries `proof_key`;
  - cloud `subscription_payments` gains `UNIQUE(proof_key)` (migration owned
    by C2/lockdown follow-up);
  - consumer semantics = insert-if-absent, verify-match-if-present — safe
    under timeout, retry, duplicate delivery, worker restart.
- **Phased honesty:** cloud writes are impossible today (RLS blocks anon
  INSERT; service creds absent) and unsafe before lockdown. Accordingly:
  - A1-complete-now covers local duplicate tests, concurrency test,
    cloud-unavailable/local-success proof, boundary tests, mutation-prohibition
    tests, build/gate.
  - The downstream consumer + its duplicate-delivery test land with C2
    (post-lockdown); TD-12 lockdown verification gates that final checklist
    item. Spec freezes the consumer contract NOW so C2 cannot drift.

## 4. Authority boundary

- Route writes EXACTLY two things, atomically: the local proof row (status
  `PENDING`/unverified) + one outbox event. No other tables touched.
- Demonstrated, not asserted:
  - state read-backs after submit: `license_keys` count unchanged,
    `restaurants.subscription_status` unchanged, zero new
    `journal_entries`/`ledger_entries`, zero ORDER-lifecycle events;
  - cross-tenant token cannot submit or read another tenant's proofs
    (403/scoped-empty); unauthenticated → 401;
  - code-surface review: route body contains only proof-insert + outbox
    enqueue (+ replay read-back).
- If a proof later causes a subscription transition, that transition is the
  separate HQ verify flow — independently authorized, separately tested.

## 5. TD-12 prerequisite

- STEP 0 capture → policy drop/REVOKE lockdown → probe matrix ALL-REJECT is a
  **HARD PRECONDITION for the real-restaurant onboarding run.**
- Full RLS policy DESIGN/implementations remain the LATER milestone fed by
  onboarding evidence. Two milestones, deliberately separated.

## Data/model changes (local migration)

`subscription_payments` (local prisma model) gains:
`proof_key TEXT UNIQUE`, `billing_period VARCHAR(7)`, `reference_note
VARCHAR(255)`, `submitted_by UUID NULL`. Existing rows unaffected. Status
values reused (`PENDING`); no enum changes.

## Acceptance mapping (co-CTO checklist)

| Gate item | Coverage |
|---|---|
| spec reviewed | This document |
| local duplicate test | Sequential double-submit → verbatim original, 1 row, 1 event |
| local concurrent duplicate | Parallel submits → 1 winner, attributed-P2002 replay, 1 row, 1 event |
| outbox duplicate-delivery test | Local: aggregate-triple unique proven; consumer duplicate-delivery test lands with C2 (contract frozen here) |
| downstream idempotency test | Same phasing as above (upsert-by-proof_key contract frozen) |
| cloud-unavailable/local-success | Route performs ZERO cloud calls; full success with no Supabase config — asserted in test |
| authorization/tenant-boundary | 401 unauth; cross-tenant scoped-denied; own-tenant ok |
| proof cannot mutate license/subscription | State read-backs enumerated in §4 |
| TD-12 lockdown verified | Hard precondition for onboarding run (B1) |
| full build/release gate | Standard gate incl. db-guard |

## Open item for co-CTO (one line)

Client-supplied `client_token` (chosen: robust across retries/form reopens)
vs fully server-derived key without client input (weaker: distinct logical
submissions with identical period/method/amount would wrongly collide).
Confirm the chosen identity inputs.
