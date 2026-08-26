---
status: AUDIT COMPLETE — findings pending co-CTO disposition
audience:
  - founder
  - engineering
owner: FireFlow team
last_reviewed: 2026-08-26
source: co-CTO directive 2026-08-26 (settlement integrity audit: void/refund, tax liability, day-close)
evidence: tests/mission-018-settlement-integrity-audit.test.ts (35/35, gate step 17/17)
sensitivity: internal
---

# Mission 018 — Settlement Integrity Audit (Findings)

Per directive: current behavior PROVEN first, no implementation changed. Every
finding below is reproduced by the evidence suite at HEAD; every "verified"
item is a runtime assertion, not a code-reading claim.

## Verified GOOD (runtime-proven, no action)

| Area | Proven behavior |
|---|---|
| Void/cancel guards | PAID orders cannot be cancelled or voided (service-level blocks, both guard orders exercised: kitchen-fired→kitchen message, unfired→paid message) |
| Refund boundary | `refund_transaction_id`/`void_notes` unwritable via generic PATCH (403 REFUND_BOUNDARY_VIOLATION at route AND service layer) |
| Void audit | ORDER_VOIDED audit_logs row written; table released to AVAILABLE; FBR sync status flips to VOIDED when PENDING/FAILED |
| **Tax liability** | **A proper liability model already exists**: sale posts CR 2000 Tax Payable (liability) for the full tax amount under BOTH EXCLUSIVE and INCLUSIVE modes; revenue (4000) credited NET; SC → 2010 liability; discount → 4900 contra-revenue debit; delivery fee → 4010; per-tender asset side (1000 cash / 1010 card-digital / 1040 customer); journals balanced; imbalance beyond ±10 PKR throws JOURNAL_IMBALANCE |
| **Day-close** | IMPLEMENTED and correct: `POST /api/cashier/sessions/close` computes expected = opening_float + cash-account journal movement since opened_at; persists expected_cash/actual_cash/difference; writes a CASHIER_SESSION journal; double-close blocked; rider-shift-open gate (409); MANAGER cannot open sessions (403); cross-tenant close blocked |

## Findings (demonstrated gaps — implementation pending disposition)

### F-01 · SEVERE — any staff can hard-delete a SETTLED order — **REMEDIATED @ `368e391` (2026-08-26)**
`DELETE /api/orders/:id` (server.ts:1947) carried `authMiddleware` only — no
role guard, no PAID check. Runtime proof: a WAITER token deleted a settled
order → 200; the order AND its transaction rows were destroyed; **no audit
trail was written**. GL survives only as orphaned references.
**REMEDIATED:** role authorization (MANAGER/ADMIN/SUPER_ADMIN) + settled guard
(409 regardless of role — state guard precedes role guard, documented) + audit
rows for blocked, successful, and cross-tenant attempts. Acceptance matrix
regression-locked in the M018 suite section D (43/43).

### F-02 · No refund path exists for PAID orders
Refunds are impossible by design today: fields are schema-only
(`refund_transaction_id`, `void_notes` — unwritable via API), no dedicated
endpoint exists (POST /orders/:id/refund → 404). A real restaurant cannot
reverse a mistaken or returned sale. **Requires design + implementation with
reversing journals** (not in this audit's scope to invent).

### F-03 · Void is invisible to durable consumers and to the UI report
Voiding writes an audit_logs row but: (a) NO outbox event (F-03 class — void
never reaches future cloud/fiscal consumers); (b) `voided_at/voided_by/
void_reason/void_notes` columns are NEVER written while LossPreventionReport
READS them — that report is permanently empty; (c) `fire_batches` rows are not
cleared, so the KDS surface retains a voided order.

### F-04 · updateOrder hard-fails without order_type_defaults
Any status flip (incl. void/cancel) 500s with "No order type defaults found"
when the tenant lacks a defaults row for the order type. Latent fragility:
a tenant provisioned without defaults cannot void anything. (Also a fixture
trap — now documented here.)

### F-05 · Cross-tenant errors surface as 500 with internal messages
Tenant B closing tenant A's session is correctly BLOCKED (service-level tenant
check) but returns 500 "Access denied: Session does not belong to this
restaurant" — wrong status class (403/404 expected) and leaks internal error
text. Isolation holds; taxonomy doesn't.

### F-06 · Session-close journal is best-effort
`closeSession` wraps `recordSessionCloseJournal` in try/catch — if the journal
fails, the session STILL closes with no close journal (books close without the
event). Low likelihood; worth a deliberate decision.

### F-07 · Rounding tolerance is ±10 PKR
Journal imbalances up to 10 PKR are silently absorbed into account 4020.
Generous for a rounding account; needs a finance sign-off number.

### F-08 · Tax model gap (recorded, not invented): no remittance flow
Tax collected accumulates in 2000 forever — there is no tax-payment/remittance
transaction, no return-period concept, and no fiscal linkage from settle
(FiscalDocumentService reachable only via the connector route). The liability
model is right; the lifecycle after liability is absent.

## Disposition requested

| Finding | Proposed next step |
|---|---|
| F-01 | Immediate fix (small, hot-path-safe): role guard + PAID guard + audit log on DELETE |
| F-02 | Design refund flow (reversal journals + refund transaction + boundary rules) → implement |
| F-03 | Write voided_* fields + ORDER_VOIDED outbox event + clear fire_batches on void |
| F-04 | Decide: defaults required at provisioning, or updateOrder tolerant of missing defaults |
| F-05 | Map service AccessDenied → 403 with generic message |
| F-06 | Decide: blocking vs best-effort session-close journal |
| F-07 | Founder/finance sets tolerance |
| F-08 | Fold into the fiscal mission (already flagged in M017 memo) |
