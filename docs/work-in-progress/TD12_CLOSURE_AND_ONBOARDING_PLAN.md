# TD-12 Closure & Onboarding Verdict Plan

---
status: ACTIVE — approved by co-CTO review 2026-08-26
owner: FireFlow team
gates: Phase T closure is HARD precondition for Phase O; Phase V unlocks on O4 verdict
supersedes: sequencing sections of NEXT_PHASE_PLAN_ONBOARDING_READINESS.md (that file keeps Track A hygiene detail)
---

## Objective

Close the TD-12 anonymous-write hole through founder runtime execution, then
generate trustworthy first real-world operational evidence via the
real-restaurant onboarding run — and let that verdict unlock the two gated
decisions: M017 Phase B dispatcher adoption (C1) and full RLS policy design (C2).

## Phase T — TD-12 Closure Window (founder-led, engineering on call)

| Step | Owner | Action | Exit criterion |
|---|---|---|---|
| T0 | Founder | Run STEP 0 capture block (runbook SQL Editor) → archive both grids beside `scratch/forensic_baseline_2026-08-25.json` | Grids archived; Q1 policy provenance answered |
| T1 | Founder | Run STEP 3 lockdown block (catalog-driven DO-loop policy drop + REVOKEs) → post-state grid archived | Post-state grid shows zero DML grants for anon/authenticated on all three tables |
| T2 | Engineering | `node scripts/probe-cloud-lockdown.cjs` | **EXIT=0 / LOCKED** — all six previously-open anonymous mutation cells now rejecting; any remaining skips honestly labeled |
| T3 | Founder→Node | Provision `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` in node `.env`; restart API | Verifier header reports `service_key_present=true` |
| T4 | Engineering | Re-run verifier → **service CONTROL = PASS**; targeted scratch evidence scripts smoke the three service-key dependents: `verifyPayment` path, license-generation path, `OwnerInviteDispatcher` | Control green + three smokes green |
| T5 | Engineering | Assemble closure package: T0 grids + T1 post-state grid + pre-lockdown probe output (2026-08-26 exit 2) + T2/T4 outputs; commit; update register TD-12 cell | Package ready for co-CTO final closure review |

**Failure handling:** any T2 hole ⇒ window repeats from T1 using the captured
policy names as forensics. No silent partial-lockdown state may pass as done.

**Gate:** co-CTO closure review → TD-12 CLOSED in register. Existence of
remediation tooling is NOT partial closure; only the runtime record counts.

## Phase O — Real-Restaurant Onboarding Run (HARD-gated on Phase T closure)

No onboarding run may occur while anonymous mutation holes are confirmed open —
doing so would contaminate the operational evidence the run exists to produce.

| Step | Owner | Action | Exit criterion |
|---|---|---|---|
| O0 | Engineering | Pre-flight: release gate green at HEAD; fresh one-time PINs via Vault reset-pin; `license.lic` present; dev DB acknowledged as run target; browser checklist extended with hardened-settle expectations | Checklist all-green, dated |
| O1 | Founder (+ eng support) | Execute onboarding script from `docs/work-in-progress/VISUAL_BROWSER_REVIEW_CHECKLIST.md`, incl. ≥1 mixed-tender settle AND a Billing-surface visit exercising the live A1 payment-proof route end-to-end (first real-world test of A1 outside synthetic suites) | Session completes; friction notes captured |
| O2 | Engineering | Post-run quantitative read-back (script below) | All assertions pass |
| O3 | Engineering | Assemble verdict inputs: wizard friction, staff/menu flows, billing-surface behavior, performance | Package to co-CTO |
| O4 | Co-CTO | Onboarding verdict: adopt / retire / strangle | Verdict recorded |

### O2 — quantitative authority-boundary assertion (A1 contract, end-to-end)

O2 is a **quantitative before/after count comparison**, never a qualitative
read of the run. It reuses the exact table set A1's own boundary suite proved:
`tests/mission-017-a1-payment-proof.test.ts` (Test 3 authority read-backs).

Pre-run baseline captured BEFORE O1 begins; post-run diff asserted AFTER O1:

| Baseline metric (pre-run count/snapshot) | Post-run requirement |
|---|---|
| `license_keys.count()` | UNCHANGED (delta = 0) |
| `restaurants.subscription_status` (value snapshot) | UNCHANGED |
| `journal_entries.count({restaurant_id})` | delta = ONLY legitimate settle journals posted during the run (each individually asserted below) |
| `ledger_entries.count({restaurant_id})` | same rule as journals |
| `transactions.count({restaurant_id})` | delta matches settled orders only |
| `integration_deliveries.count()` | UNCHANGED (delta = 0 — zero cloud dispatches) |

Plus positive assertions: per-method journal lines balance to settled totals;
`settlement_key` present on every settled order; `PAYMENT_COMPLETED` +
`ORDER_COMPLETED` outbox events present per settlement; the A1 proof row exists
with `status='pending'` and exactly ONE `PAYMENT_PROOF_SUBMITTED` outbox event;
no license/subscription/journal mutation traces back to the proof route.

Rationale: this makes O2 a real end-to-end confirmation of the A1 contract
("records payment evidence; does not confer payment authority") against a real
human run — not a fresh, less rigorous check invented under onboarding-day time
pressure.

## Phase V — Unlocked decisions (gated on O4 verdict)

- **C1**: M017 Phase B dispatcher adoption (+ provider decision).
- **C2**: full RLS policy set design (post-lockdown; consumes onboarding
  evidence + the frozen A1 cloud upsert-by-proof_key consumer contract).
- Hygiene wave (ADR-0009 canonicalization → G5 dead-surface sweep → TD-14
  remainder → TD-13 accessor consolidation) runs parallel-and-non-blocking,
  started only after T-closure, never delaying T or O.
