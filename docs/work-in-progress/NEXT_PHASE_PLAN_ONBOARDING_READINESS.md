# Next Phase Plan — Onboarding Readiness Window

---
status: ACTIVE — execution window open
supersedes: plans/next-phase-onboarding-readiness.md (planning-session draft)
owner: FireFlow team
last_reviewed: 2026-08-26
---

## Objective

Make the real-restaurant onboarding run executable, meaningful, and
non-blocking — then let its verdict unlock the two gated decisions:
M017 Phase B (dispatcher adoption) and the full RLS policy set (TD-12 design).

## Master-plan alignment

- Slice C handover verified; Phase 2 wizard CLOSED (evidence-grade, 2026-08-26).
- M017 Phase A CLOSED (`e28f595`/`e81c853`).
- A1 payment-proof route LANDED and CLOSED (`7b3ca9c`, pushed to origin/main).
- This window bridges app-layer completion and first real-world evidence.

## Critical path

```
[A1] payment-proof route — DONE (7b3ca9c) ──────────────┐
                                                        ├──> ONBOARDING RUN (founder)
[T1] TD-12 STEP 0 capture > lockdown > probes (founder) ┘          |
                                                                   v
                                                     verdict: adopt/retire/strangle
                                                                   |
                                                    +---------------+----------------+
                                                    v                                v
                                           [C1] Phase B dispatcher         [C2] RLS policy design
                                           (needs provider decision)       (post-lockdown)
```

## Track A — engineering items

| # | Item | Status |
|---|---|---|
| A1 | Payment-proof submission route | **DONE** — `7b3ca9c`, gate 15/15, suite 51/51, transaction_id deviation closed |
| A2 | G5 dead-surface sweep | start-ready |
| A3 | ADR-0009 canonicalization (proposal → ACCEPTED) | start-ready |
| A4 | TD-14 remainder (COA-before-journals ordering in tenant-isolation-api.test.ts) | start-ready |
| A5 | TD-13 accessor consolidation (single context-derived tenant accessor) | after hygiene wave |

## Track B — founder actions

| # | Action | Unblocker |
|---|---|---|
| B1 | Supabase dashboard: TD-12 STEP 0 capture → STEP 3 lockdown SQL → probe re-run. Copy-paste blocks now in the runbook; automated verifier committed (`scripts/probe-cloud-lockdown.cjs`). Pre-lockdown live verdict 2026-08-26: exit 2, anon U+D open on all three tables. Post-lockdown target: exit 0 with service control green (requires `SUPABASE_SERVICE_KEY` configured same window). | Console access |
| B2 | Onboarding calendar slot (protected); script in VISUAL_BROWSER_REVIEW_CHECKLIST.md — extend with hardened-settle expectations before the date | None |

## Onboarding-run readiness package (engineering-prepared)

- Pre-flight: gate green on HEAD; fresh one-time PINs via reset-pin action;
  `license.lic` present; dev DB acknowledged as run target.
- During-run evidence: settle at least one mixed-tender order; afterwards
  engineering runs a read-back script asserting per-method journal lines,
  balanced totals, `settlement_key` present, both completion events in outbox.
- Verdict inputs captured: wizard friction, staff/menu flows, billing surface
  behavior, performance — feeds M017 Phase B + parity evidence.

## Sequencing

| Step | Owner | Blocked on |
|---|---|---|
| A3 → A2 → A4 hygiene wave | Engineering | Nothing |
| A5 | Engineering | After hygiene wave |
| B1 lockdown window | Founder | Console access (STEP 0/3 SQL ready to paste; STEP 4 verifier ready to run) |
| Onboarding run | Founder + Engineering support | B1 complete, B2 scheduled |
| C1 / C2 decisions | Co-CTO | Run verdict (+ provider decision for C1) |
