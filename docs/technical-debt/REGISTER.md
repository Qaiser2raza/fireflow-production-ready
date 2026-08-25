---
status: CANONICAL
audience:
  - engineering
  - Kilo Code
owner: FireFlow team
last_reviewed: 2026-08-23
source: CTO directive 2026-08-23 + verified incidents
sensitivity: internal
---

# FireFlow Technical Debt Register

Known debt is recorded here, not silently forgotten. Add entries with classification; never fix opportunistically outside an authorized mission.

| ID | Item | Classification | Origin | Target |
|---|---|---|---|---|
| TD-1 | Occupied-port guard in `scripts/release-gate.cjs`: fail fast when :3001 is already listening before boot. Two false-negative gate runs caused by stale non-test servers (PID 4108 on 2026-08-23; orphaned node child surviving `Stop-Process` on `npx.cmd` same day). Windows cleanup must kill the full process tree (`taskkill /T /F`). | hygiene · test-infra reliability | Phase 0 / Slice B verification | hygiene backlog |
| TD-2 | `/api/super-admin/*` mount still allows tenant `MANAGER` role on licenses/payments routes (only provisioning is SUPER_ADMIN-restricted per D-4). Review the whole surface. | security review (low urgency — Vault UI only) | Phase 1 design D-4/FU-3 | separate hygiene pass |
| TD-3 | Payment dual-reality findings from M017 audit (F-01: `PaymentDispatcher.startAttempt` has zero production callers; payments table unwritten by production code). | documented finding | docs/MISSION_017_WORKFLOW_AUDIT.md | Mission 017 execution (Payments & Order Completion coherence) |
| TD-4 | Inventory domain inert: zero API references to `inventory_items` / `recipe_items`. | documented finding | docs/MISSION_017_WORKFLOW_AUDIT.md (F-02) | deferred mission |
| TD-5 | Missing browser automation: no browser-capable runner; manual founder UI passes remain UX-only judgments. Plan §8 requires browser-smoke scenarios per new surface. Step-by-step manual review script ready: `docs/work-in-progress/VISUAL_BROWSER_REVIEW_CHECKLIST.md` (covers Slice C handover + Phase 2 wizard). | verification gap | master plan §9 / verification requirements | founder visual pass pending; long-term runner with first user-facing phase |
| TD-6 | CI/deployment gaps: no hosted CI running the release gate on push. RESOLVED 2026-08-24/25: GitHub Actions `CI` + `release-gate` workflows run on every push; green continuously from `4dc58b1`/`6f8ab8f` through `406ffa6`+ (migrate-deploy fix `bc3ef9b` closed the CI-only failure, see TD-11). | process gap | master plan §8 | closed — evidence: hosted runs for `406ffa6`, `0aa9a6d`, `049993b` |
| TD-7 | Supabase owner lookup via bounded `listUsers` scan (pilot-scale). Replace with dedicated lookup endpoint when fleet grows. | accepted pilot limitation | Phase 1 slice B | HQ-API phase |
| TD-8 | Production entitlement isolation: license binding assumes one licensed restaurant per node; multi-tenant nodes out of scope for pilot. CTO-approved pilot boundary (D-3). | approved boundary | Phase 1 condition 7 / FU-1 | Phase 5 enrollment |
| TD-9 | Remaining test-suite teardown patterns use ad-hoc delete chains instead of a shared fixture helper. | maintainability | Phase 1 suites | hygiene backlog |
| TD-10 | Legacy scratch scripts and modified files in working tree unrelated to missions (`scripts/check-db.ts` deletion, `migrate-pins-to-bcrypt.ts`, enum-check scripts, `opencode.json`) — classify, keep, or remove deliberately. | housekeeping | standing observation | hygiene backlog |
| TD-11 | Release-gate GitHub workflow failed in CI only (support-bridge Prisma errors under `prisma db push`) while passing locally 13/13. RESOLVED by commit `bc3ef9b`: gate now enforces `prisma migrate deploy` and support_sessions columns aligned to UUID schema; hosted gates green through `406ffa6`. | test-infra · resolved | visual review checklist (2026-08-25) | closed — evidence: hosted run for `406ffa6` |
| TD-12 | `restaurants_cloud` AND `license_keys` are anon-readable AND anon-writeable via the publishable client key (G4 probe 2026-08-25: anon `PATCH license_keys` returned 204 including a full `status` flip unused→active→reverted; anon `PATCH restaurants_cloud` returned 204). Read exposure exposes tenant billing rows (`monthly_fee`, `currency`, `trial_ends_at`, plan, status); write exposure allows license-key activation/claim forgery and subscription forgery from any browser. Harmless today (demo rows only); BLOCKER before any real tenant syncs or keys ship. Fix: restrictive RLS (authenticated, owner-scoped reads; service-role-only writes); server-side sync is immune (service key bypasses RLS). Bundle with F-V3 Vault-licensing cloud-auth posture. | classified 2026-08-25 (F-V14 probe; write exposure via F-V3 G4 probe) | F-V14 / F-V3 | TD-12 lockdown runbook (`docs/work-in-progress/TD12_LOCKDOWN_RUNBOOK.md`, founder SQL blocks ready) + automated STEP 4 verifier `scripts/probe-cloud-lockdown.cjs` (pre-lockdown live run 2026-08-26: exit 2, anon U+D open on all 3 tables, zero mutations; service control + authenticated cells pending founder creds) |
| TD-13 | Pre-auth tenant binding: PIN-only login selects the tenant PIN space from localStorage `restaurant_id` before any authentication; on a shared/compromised profile the binding can be redirected (attacker still needs a valid target-tenant PIN). ACCEPTED interim risk with mitigations: per-IP login limiter + per-account lockout; zero tenant data/name rendered pre-auth (`LoginView` takes no tenant props, verified T3); binding overwritten from login response (F-V15 fix). Deliberate device-bound-context design is the Phase 5-6 decision (F-V1); this row keeps the accidental architecture visible until then. | accepted risk 2026-08-25 (F-V15 × F-V1 synthesis) | F-V15 / F-V1 | Phase 5-6 device-bound-context decision |
| TD-14 | Test teardown chains delete `chart_of_accounts` BEFORE `journal_entry_lines`/`journal_entries`/`ledger_entries`, causing P2003 FK failures whenever a swept restaurant legitimately holds journals (exposed locally when the gate ran against dev DB containing Bisto Lahore walkthrough journals). Fixed in `refresh-token-rotation.test.ts`; SAME latent ordering exists in `tenant-isolation-api.test.ts` (~lines 49-53) and possibly other copied chains. Also: sweeps that iterate ALL restaurants can touch real founder data on dev DBs — suites should scope cleanup to their own fixtures or run against verify DBs. **TD-14b CLOSED 2026-08-25**: the destructive-run risk is now a structural control — `scripts/release-gate.cjs` asserts `DATABASE_URL` targets an approved disposable DB (`*_verify`, CI `fireflow_gate`) BEFORE any boot/sweep and hard-fails otherwise; negative suite `tests/gate-db-guard.test.ts` proves refusal (13 assertions incl. live dev-URL run). Remaining cleanup-ordering instances stay open above. | test-infra · hygiene (M017-A gate run 2026-08-25) | TD-9 | hygiene backlog (ordering instances); boundary CLOSED |

## Rules

1. New debt discovered during a task gets a row here before task close.
2. Debt fixed under an authorized mission gets its row marked resolved with evidence link.
3. This register is `CANONICAL`; changes belong in commit messages referencing the originating task.
