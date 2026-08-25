---
status: REVIEW
audience:
  - product
  - founder
owner: FireFlow team
last_reviewed: 2026-08-24
source: Phase 1 Slice C + Phase 2 release condition (TD-5)
revision: 2 - rebuilt from live review session 2026-08-24
sensitivity: internal
---

# Visual / Browser Review — Founder Pass (v2, 2026-08-24)

Automated suites already prove behavior (gate 13/13 local). **This pass judges visuals, wording, and interaction flow only.**
This revision reflects the live dev environment as verified on 2026-08-24, including two traps that cost time (Sections P2 and P3).

---

## P1. Start the stack (order matters)

```powershell
# Terminal 1 — API on :3001. MUST be test mode (see P2):
$env:NODE_ENV = "test"
npm run server

# Terminal 2 — web app (Vite):
npm run dev
```

Open the shown localhost URL (usually http://localhost:3000) in Chrome/Edge.

## P2. TRAP — server must run in test mode

The dev `license.lic` on this machine is bound to a tenant that no longer exists in the dev database.
If the server runs in plain dev mode, **every Vault/API call fails with `LICENSING_LOCKOUT`
("License belongs to a different restaurant ID")** and Create Restaurant shows a red license-locked banner.

- Symptom: red `LICENSING_LOCKOUT` banner in the Create Restaurant modal, or 402 errors in DevTools console.
- Fix: stop the server (Ctrl+C), restart exactly as in P1 (`$env:NODE_ENV = "test"` then `npm run server`).
- Why this is OK for the review: `NODE_ENV=test` is the same mode the release gate runs in. Production nodes
  activate a real license via `/api/licensing/activate`; license issuance is a cloud/HQ operation by design.

## P3. TRAP — login screen has no restaurant selector (finding F-V1)

The login screen is a PIN pad only. The client sends the tenant from `localStorage`, which is set only
after a successful login. On a fresh browser, no login can ever succeed until the context is seeded once.

One-time bootstrap (per browser profile), DevTools console on the login screen:

```js
localStorage.setItem('restaurant_id', '372d000b-5ebd-41bb-8cf0-e08c23ce4020'); location.reload();
```

That ID is **Fireflow HQ** — the Vault tenant. After reload, the seed admin PIN logs in as SUPER_ADMIN and lands in Vault Control.
(If the pad "silently resets", the context is missing or the PIN/tenant pair is wrong — re-run the line above.)

## P4. Current test fixtures (verified in DB, 2026-08-24)

| Fixture | Detail |
|---|---|
| **Fireflow HQ** | SUPER_ADMIN account "Super Admin", seed admin PIN (see `scripts/create-custom-admin.ts` — never store PINs in this doc), lands in Vault Control |
| **Blue Vault Cafe** | Provisioned 2026-08-24. Manager `sheri`, one-time PIN redacted from this doc (invariant 8) — obtain via the reset-pin support action when needed; forces change at first login, 7-day expiry. Tenant is `SETUP_INCOMPLETE` — wizard will force |
| Tenant A / Tenant B | Gate-fixture tenants, ignore |

> If the one-time PIN was consumed or expired before Section 4, ask the assistant to run the reset-pin support action again (it is API-only today — finding F-V4).

---

## Progress record (already executed 2026-08-24)

| # | Result | Note |
|---|---|---|
| 1.1 | PASS | Register New Restaurant button gone |
| 1.2 | PASS (with polish note) | Wrong PIN resets pad; feedback too subtle → F-V2 |
| 2.1 | PASS | Restaurants tab lists tenants with chips |
| 2.2 | PASS | Modal renders all fields |
| 2.3 | PASS | Empty submit blocked, name required |
| 2.4–2.6 | RETRY ADVISED | First attempt blocked by P2 trap (environmental, not a UI bug). Blue Vault Cafe provisioned successfully once test mode was on; confirm the handover view appears for the next provisioning |
| 2.7–2.9 | PENDING | Print sheet, Done, PIN-gone checks |
| 3.1 | PASS | `OWNER: PENDING` amber badge on Blue Vault Cafe |
| 3.2 | ACCEPTABLE | Dispatcher events PROCESSED; invite stays PENDING without Supabase creds — expected locally |
| 3.3–3.4 | SKIP | Artificial retry states not reachable locally |
| 5.1 | EXECUTED (API) | Reset-pin works; no Vault UI button for it → F-V4 |

---

## Section 4 — First-login wizard (Phase 2) — THE MAIN REMAINING PASS

Use **Blue Vault Cafe** with the current one-time PIN (obtain via reset-pin action). Log out of Vault first.

| # | Step | Expect |
|---|---|---|
| 4.1 | Log out; log in as manager `sheri` (restaurant: Blue Vault Cafe, current one-time PIN) | **Full-screen wizard replaces the entire app** — no sidebar, no POS, no way into operations |
| 4.2 | Wizard header | "Welcome, sheri" + "Blue Vault Cafe — First-login setup"; progress dots show 3 steps |
| 4.3 | Enter wrong old PIN / non-matching confirmation / 5-digit new PIN | Clear inline errors; never crashes |
| 4.4 | Set a valid new PIN (SAVE IT) | Step ticks green; moves to Restaurant details |
| 4.5 | Details step | Address + phone inputs; helper text explains name/city pre-configured |
| 4.6 | Save details (or skip blank) | Moves to Finish setup review |
| 4.7 | Click Complete setup | Green success panel, then normal manager workspace |
| 4.8 | Log out; log back in with the NEW PIN | Straight into app — no wizard again |
| 4.9 | Fresh run: click Log out instead mid-wizard, log back in with the same one-time PIN | Wizard resumes at the right remaining step |
| 4.10 | While still restricted, paste a bookmarked operational URL | Wizard still shown; no operational screen reachable |

## Section 2b — Handover re-check (optional, needs test mode per P2)

Provision one more clearly-test tenant (e.g. `Second Review Cafe`) and verify:

| # | Step | Expect |
|---|---|---|
| 2.4r | Submit valid form | Spinner, then handover view (green check, big PIN, red only-once warning, expiry ≈ 7 days) |
| 2.7 | Print handover sheet | Clean black-on-white print preview; no dark theme, no buttons |
| 2.8 | Done — I saved the PIN | Modal closes; tenant appears in list with OWNER: PENDING |
| 2.9 | Refresh page | PIN nowhere in the UI anymore |

## Section 5 — Reset path (partially done)

| # | Step | Expect |
|---|---|---|
| 5.1 | DONE via API 2026-08-24 | Produced one-time PIN (redacted — F-V4: no UI button yet) |
| 5.2 | After 4.4, try logging in with the same one-time PIN again | Rejected — one-time PIN consumed by first use |

---

## Section 6 — Onboarding-run hardened-settle verification (Phase O)

Execute during the onboarding run after at least one mixed-tender order is settled.

| # | Step | Expect |
|---|---|---|
| 6.1 | Settle an order with mixed tender (e.g., 60 CASH + 50 CARD) | Order moves to CLOSED/PAID; cashier session remains open |
| 6.2 | Inspect the settlement in the UI or API | `settlement_key` present on the order/settlement record |
| 6.3 | Journal visibility (engineering read-back) | Per-method journal lines balance: CASH line == cash total, CARD line == card total; combined debits == combined credits == order total |
| 6.4 | Outbox events present | `PAYMENT_COMPLETED` + `ORDER_COMPLETED` events both in `outbox` for this settlement |
| 6.5 | A1 payment-proof route (Billing surface) | Submit a proof through the live Billing UI → row `status='pending'` locally, exactly one `PAYMENT_PROOF_SUBMITTED` outbox event |
| 6.6 | Authority boundary (engineering read-back) | `license_keys.count()` unchanged; `restaurants.subscription_status` unchanged; `journal_entries`/`ledger_entries`/`transactions` deltas match ONLY settled orders from this run; `integration_deliveries.count()` unchanged |

> 6.3 and 6.6 are quantitative assertions executed by engineering via the O2 baseline script — they are not visual judgments. The founder confirms the mixed-tender settle happened; engineering diffs the captured baseline against post-run state.

---

## Findings log (recorded during this review)

| ID | Finding | Disposition |
|---|---|---|
| F-V1 | Fresh browser cannot log in — no tenant selector / context bootstrap | Product gap; candidate: device-bound context or HQ surface (Phase 5-6 decision) |
| F-V2 | Failed-login feedback too subtle (silent pad reset) | UI polish item |
| F-V3 | Vault (license manager) is itself gated by tenant licensing — chicken-and-egg on unlicensed nodes | Design issue; founder decision: separate HQ API deferred to Phase 5-6 |
| F-V4 | Staff PIN reset is API-only; no Vault UI button | Small Slice C follow-up |
| TD-11 | release-gate GitHub workflow fails in CI only (support-bridge Prisma errors under `prisma db push`); passes locally 13/13 | Debt register entry; investigate after review |
| — | Legacy seeders (`scripts/create-custom-admin.ts` etc.) write plaintext `pin` only; unusable under bcrypt auth | Debt register entry |
| — | CI workflow fixed 2026-08-24: healthcheck quoting + real typecheck (`4dc58b1`, `6f8ab8f`); CI workflow now green | Closed |
| F-V15 | RESOLVED BY INSTRUMENTATION (2026-08-25): login writes `currentRestaurant` to localStorage but NEVER updates `RestaurantContext` state — hydration happens exclusively at provider mount (stack-proven via Storage hooks). **FIXED**: `App.tsx login()` now calls `setCurrentRestaurant(restaurant)` from the server response payload (context = render-time truth; storage = boot cache + device binding). Logout contract pinned: session secrets cleared, tenant binding retained as untrusted device config (see TD-13). Verified via CDP: T1 fresh-profile login → Billing FULL_RENDER without reload; T2 tokens cleared + binding retained; T3 zero tenant data pre-auth. | Fixed — regression contract T1–T5 below |

## Sign-off

### F-V15 auth-lifecycle contract (pinned 2026-08-25 — change deliberately, never implicitly)

| # | Assertion | Status |
|---|---|---|
| T1 | Fresh profile → PIN login → context populated WITHOUT reload; Billing renders tenant view | PASS (CDP, `scratch/fv15_t1_verify.mjs`) |
| T2 | Logout → access/refresh tokens cleared; `currentRestaurant`/`restaurant_id` binding retained | PASS |
| T3 | Post-logout UI renders zero tenant-scoped data (LoginView takes no tenant props) | PASS |
| T4 | Login to DIFFERENT tenant → binding + context overwritten from response payload | By construction (single `setCurrentRestaurant(restaurant)` from response); browser run pending second tenant creds |
| T5 | Fresh profile with NO binding → login blocked, no tenant context | Current F-V1 behavior — intentionally pinned; Phase 5-6 device-bound-context decision changes a recorded contract, not an implicit one |

- Record results (pass/fail + screenshots) in this file or reply inline by step number.
- Anything judged "wrong look/feel" becomes a UI polish item; behavior bugs go to engineering with the step number.
- On full pass: mark TD-5 visual portion resolved; production release approval proceeds separately.

**Reviewer:** ____________  **Date:** ____________  **Result:** ☐ All pass ☐ Issues noted below
