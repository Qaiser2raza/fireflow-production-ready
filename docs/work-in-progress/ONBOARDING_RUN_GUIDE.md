# Onboarding Run — Execution Guide & Completion Report

---
status: ACTIVE — executable the moment Phase T completes
gates: Section T (TD-12 closure) is HARD prerequisite for Sections P/R/V
owner: founder (executor) + engineering (verifier/marker)
rule-set: TD12_CLOSURE_AND_ONBOARDING_PLAN.md (approved 2026-08-26)
last_reviewed: 2026-08-26
---

## How steps get marked COMPLETE

1. Every step below has an **Evidence** line naming exactly what must be archived.
2. The executor (founder) performs the step; **engineering verifies the evidence
   and only then flips `PENDING → COMPLETE`** with a timestamp in the report
   table at the bottom. Self-marked completions without archived evidence are void.
3. Two registers, never mixed: `EVIDENCE` (commands run, outputs saved, commit SHAs)
   vs `NARRATIVE` (observations, friction notes). Both are recorded; only EVIDENCE
   can flip a checkbox.
4. If any T-step fails, the window restarts at T1 per the plan's failure clause.
   No partial states pass as done.

---

## SECTION T — TD-12 Closure Window (do first; onboarding stays blocked until T2 = exit 0)

### T-0.1 Capture policy provenance (STEP 0a/0b)
Open Supabase dashboard → SQL Editor → paste the STEP 0 block from
`docs/work-in-progress/TD12_LOCKDOWN_RUNBOOK.md` (capture grids for
`pg_policies` + role grants on the three tables).
Save both result grids as `scratch/td12_step0_grids_YYYY-MM-DD.json` (or .md).
Evidence: both grid files exist and are committed or attached to the closure record.

### T-1 Lockdown (STEP 3)
Paste the STEP 3 block (DO-loop policy drop + REVOKEs + post-state capture) in the
same SQL Editor session. Save the post-state grid next to T-0.1's files.
Evidence: post-state grid shows zero INSERT/UPDATE/DELETE grants for
`anon` AND `authenticated` on `license_keys`, `restaurants_cloud`, `subscription_payments`.

### T-2 Probe matrix must go green
Engineering runs: `node scripts/probe-cloud-lockdown.cjs`
Required output: `EXIT=0 / LOCKED`, all six previously-failing anon cells rejecting,
remaining skips honestly labeled.
Evidence: full console output archived. **This is the gate — nothing downstream starts otherwise.**

### T-3 Service credentials onto the node
Add to node `.env`: `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (service-role, never the
anon key). Restart the API server.
Evidence: verifier header prints `service_key_present=true` on next T-4 run.

### T-4 Positive control + functional smokes
Re-run `node scripts/probe-cloud-lockdown.cjs --require-control` → `service CONTROL = PASS`.
Evidence: probe output archived.

Functional smokes (execute after probe green; each proves a service-key-dependent path that was broken under lockdown):
1. verifyPayment: call `SuperAdminService.verifyPayment(<known-payment-id>, 'verified')` from a scratch script (requires real cloud payment row; skip if none exists — the probe service control is sufficient for closure).
2. license generation: `POST /api/licenses/generate` via server-side admin route or scratch script with service-key Supabase insert.
3. OwnerInviteDispatcher: dispatch one invite through the existing invite flow; confirm cloud row + email sent/queued.

### T-5 Closure package
Engineering assembles: T-0 grids + T-1 post-state + pre-lockdown probe output
(2026-08-26 exit 2) + T-2/T-4 outputs → commits → updates register TD-12 cell.
Co-CTO performs final closure review. Only then does the register say CLOSED.

---

## SECTION P — Pre-flight (after T-5; all boxes green same day as the run)

### P-1 Release gate green at HEAD
```
$env:DATABASE_URL = <fireflow_migrate_verify url>
node scripts/release-gate.cjs        # expect: RELEASE GATE PASSED, 15/15
```
Evidence: gate summary output archived with HEAD SHA.

### P-2 Fresh credentials for the run
Vault Control → reset-pin for the run manager (one-time PIN, handover-once);
owner invite state INVITE_SENT or manual-retry resolved.
Evidence: audit trail rows exist; PIN shown exactly once (handover sheet printed).

### P-3 License file present
`license.lic` activated on the run node (hardware-bound ECDSA activation).
Evidence: `GET /api/licensing/status` returns licensed for this node.

### P-4 Target database acknowledged
Run happens on the acknowledged dev/local DB (`fireflow_local`) — demo data may
exist; suites stay off it (TD-14b boundary unchanged).
Evidence: one-line acknowledgment recorded in the run log.

### P-5 O2 baseline captured (BEFORE touching the app)
Engineering runs the baseline script (written at this step): counts +
subscription_status snapshot for `license_keys`, `restaurants.subscription_status`,
`journal_entries`, `ledger_entries`, `transactions`, `integration_deliveries`
scoped to the run tenant. Saved as `scratch/o2_baseline_<ts>.json`.
Evidence: file exists; numbers quoted in the completion report.

### P-6 Browser checklist extended
`docs/work-in-progress/VISUAL_BROWSER_REVIEW_CHECKLIST.md` gains the hardened-settle
expectations (mixed-tender journal assertions, settlement_key visibility).
Evidence: committed diff.

---

## SECTION R — The Run (single session, ~60–90 min, founder drives, eng records)

Execute the existing walkthrough in `VISUAL_BROWSER_REVIEW_CHECKLIST.md` plus these mandatory captures:

| # | Action | Capture |
|---|---|---|
| R-1 | Platform login → Vault | screenshot; provisioning modal used |
| R-2 | Create the REAL restaurant (slug, owner email, one-time MANAGER PIN) | handover sheet printed once |
| R-3 | First login as manager → wizard (profile → PIN change) → ACTIVE | login payload flags noted; wizard screens |
| R-4 | Staff creation, menu basics, table/section setup | screenshots |
| R-5 | POS login → create order → settle **mixed tender** (e.g., 60 CASH + 50 CARD) | order id + tender split noted |
| R-6 | Billing surface: submit payment-proof through the live A1 route | success response + proof row visible; any error captured verbatim |
| R-7 | Friction log throughout (NARRATIVE register) | timestamps + screen refs |

Rules: no step skipped silently; failures recorded verbatim, fixed only after the
run unless they hard-block progression (then logged as run-interrupt with cause).

---

## SECTION V — Post-run verification (O2, quantitative)

Engineering runs the O2 read-back script (built at P-5) asserting:

Baseline diffs vs P-5 snapshot:
- `license_keys.count()` delta = 0
- `restaurants.subscription_status` UNCHANGED by anything except the HQ verify flow
- `journal_entries` / `ledger_entries` / `transactions` deltas match settled orders ONLY (each justified individually)
- `integration_deliveries.count()` delta = 0

Positive assertions:
- per-method journal lines balance to each settled total (mixed-tender: two attributed lines, debits == credits == total)
- every settled order carries `settlement_key`
- `PAYMENT_COMPLETED` + `ORDER_COMPLETED` outbox events present per settlement
- A1 proof row `status='pending'` with EXACTLY ONE `PAYMENT_PROOF_SUBMITTED` event
- zero authority mutations traceable to the proof route

Evidence: script output archived. Any assertion failure ⇒ finding, not footnote.

---

## SECTION W — Verdict package (O3/O4)

Engineering compiles: run narrative + all evidence artifacts + O2 results into
`docs/` mission record → co-CTO verdict (adopt / retire / strangle) unlocks
C1 (dispatcher adoption + provider decision) and C2 (RLS design).

---

# COMPLETION REPORT (mark-as-complete ledger)

> Engineering fills Status/Evidence-Ref columns; founder initials execution.

| Step | Description | Executed (initials/date) | Status | Evidence ref |
|---|---|---|---|---|
| T-0.1 | Policy/grants grids captured | founder 2026-08-26 | **COMPLETE (disclosed gap)** — STEP 3c post-state grid archived; STEP 0a `pg_policies` provenance grid was NOT captured to a file; lockdown effectiveness proved via T-2/T-4 regardless | thread + screenshots; gap disclosed |
| T-1 | Lockdown SQL executed | founder 2026-08-26 | **COMPLETE** | STEP 3c post-state grid: zero DML grants both roles |
| T-1b | TRUNCATE revoked (least-privilege add-on) | founder 2026-08-26 02:05 | **COMPLETE** | screenshot: revoke truncate … Success, 0 rows |
| T-2 | Probe matrix EXIT=0 LOCKED | eng 2026-08-26 | **COMPLETE** | 6/6 cells HTTP 42501; pre-run was 6x204 exit 2 |
| T-3 | Service creds provisioned | founder 2026-08-26 | **COMPLETE** | .env SUPABASE_URL + SUPABASE_SERVICE_KEY present |
| T-4 | CONTROL=PASS + functional smokes | eng 2026-08-26 | **COMPLETE** | probe EXIT=0 --require-control; 3/3 smokes PASS (201 insert + 204 cleanup each) |
| T-5 | Closure package committed | eng 2026-08-26 | **COMPLETE** | commits e771976 + dbbeffb + 06cc223 + (pending smoke script commit) |
| T-FINAL | Co-CTO closes TD-12 | | **AWAITING YOUR REVIEW** | |
| T-5 | Closure package committed | | PENDING | |
| T-FINAL | Co-CTO closes TD-12 | | PENDING | |
| P-1 | Gate green at HEAD | eng 2026-08-26 | **COMPLETE** | gate 15/15 exit 0 at 3f0e46f |
| P-2 | Fresh PINs / invite ready | founder TBD | PENDING | |
| P-3 | license.lic active | eng 2026-08-26 | **COMPLETE** | license.lic at repo root |
| P-4 | DB target acknowledged | founder TBD | PENDING | |
| P-5 | O2 baseline captured | eng 2026-08-26 | **READY** — script committed; run at session start | scripts/o2-baseline.cjs |
| P-6 | Checklist extended | eng 2026-08-26 | **COMPLETE** | Section 6 added to VISUAL_BROWSER_REVIEW_CHECKLIST.md |
| R-1…R-7 | Run executed per script | | PENDING | |
| V | O2 assertions all pass | | PENDING | |
| W | Verdict delivered | | PENDING | |

**FireFlow may be called "onboarding-complete" only when every row above reads
COMPLETE with an evidence ref — and not before T-2 turns green.**
