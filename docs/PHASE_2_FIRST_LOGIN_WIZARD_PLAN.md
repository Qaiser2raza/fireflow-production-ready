---
status: DRAFT
audience:
  - engineering
  - Kilo Code
owner: FireFlow team
last_reviewed: 2026-08-23
source: Master plan §5 row 2 + CTO review directives 2026-08-23
sensitivity: internal
---

# Phase 2 — First-Login Wizard & PIN Enforcement: Plan (rev. 2, awaiting authorization)

**Baseline:** `origin/main @ 50f094b` (Phase 1 complete). Planning only — nothing implemented.
**Rev. 2:** incorporates CTO review directives — distinct concern separation, exact login/reset/session behaviors, state-model mapping, audit rules, migration compatibility.

## A. Verified starting state

| Fact | Evidence |
|---|---|
| `must_change_pin` + `pin_expires_at` written at provisioning, never read by any auth path | grep: RestaurantProvisioningService.ts:79-80, superAdminRoutes.ts:199-200, ProvisionRestaurantModal.tsx only |
| Login response omits both flags | `sanitizedUser`, server.ts:783+ |
| Expired unused PINs still authenticate | login flow server.ts:561-691 |
| No manager-PIN reset exists | grep `reset-pin`: zero matches |
| Restaurants carry billing lifecycle only | schema.prisma:692-740 |
| Forced-change precedent works for platform users | PlatformAuthService.ts:333, schema.prisma:1423 |

## B. Four distinct concerns (never collapsed)

| Concern | Surface | Blocks what | Error/UX |
|---|---|---|---|
| PIN must be changed (`staff.must_change_pin`) | per-staff | All operations except change-pin + onboarding allowlist | Login succeeds; client forced into wizard step |
| PIN expired (`staff.pin_expires_at < now`) | per-staff | **Login itself — no session issued** | 403 `{ error: 'PIN_EXPIRED' }`; recovery = Vault reset |
| Owner invitation incomplete (`owner_invites.state`) | per-tenant cloud linkage | Nothing local; owner-side cloud features only | Vault badges (built in Slice B/C); manager unaffected |
| Setup incomplete (`restaurants.onboarding_status`) | whole tenant | All operational APIs for every staff member | 403 `SETUP_INCOMPLETE` outside allowlist |

Rationale for `PIN_EXPIRED` being distinguishable from generic 401: the code is only emitted **after successful bcrypt match**, so it leaks nothing to an attacker who cannot already authenticate; it lets the legitimate holder reach recovery instead of a dead end.

## C. Lifecycle state models (each state mapped to behavior + transitions)

### C.1 Restaurant onboarding (persisted, new column)

```text
ACTIVE ←→ SETUP_INCOMPLETE        (the only two persisted states)

SETUP_INCOMPLETE: setup-gate middleware active (allowlist below)
    transition → ACTIVE: single service function, transactional, audited,
                 requires: PIN changed (no staff with actor-relevant
                 must_change_pin) AND required profile fields present
ACTIVE:         normal operation
    transition → SETUP_INCOMPLETE: none in v1 (no demotion path; avoids
                 surprise tenant lockouts — revisit only if a real need appears)
```

Provisioning writes `SETUP_INCOMPLETE` for new tenants; migration default `ACTIVE` leaves existing rows untouched.

### C.2 Invite states — where they actually live

CTO-proposed model maps onto existing structures without new states:

| Proposed state | Lives in | Already implemented |
|---|---|---|
| PROVISIONING | transient inside the provisioning tx (not persisted) | Slice A |
| INVITE_PENDING / SENT / UNKNOWN / ACTION_REQUIRED | `owner_invites.state` | Slice B dispatcher |
| ACTIVE | `restaurants.onboarding_status = 'ACTIVE'` | this phase |

No new invite states; no duplicate lifecycle columns.

## D. Exact login & redirect behavior

1. Candidate selection unchanged (active, hash non-null, unlocked).
2. New expiry check **after** bcrypt success, before any token issuance:
   `403 { error: 'PIN_EXPIRED', message }`, audit `STAFF_LOGIN_FAILED { reason: 'pin_expired' }`. No session, no refresh family.
3. Successful auth issues tokens as today; response payload gains:
   ```json
   {
     "user": { ..., "must_change_pin": true|false },
     "restaurant": { ..., "onboarding_status": "SETUP_INCOMPLETE" | "ACTIVE" }
   }
   ```
4. Client redirect rule (App.tsx post-login branch): `must_change_pin || onboarding_status === 'SETUP_INCOMPLETE'` → render `FirstLoginWizard` full-screen; otherwise current view selection. Server gate remains authoritative; client check is convenience.

## E. Restricted sessions — exact endpoint access

When `must_change_pin` or tenant `SETUP_INCOMPLETE`, the session token works ONLY on:

| Allowed | Endpoint |
|---|---|
| Auth hygiene | `/api/auth/refresh`, `/api/auth/logout` |
| PIN setup | `POST /api/auth/change-pin` |
| Wizard data | `GET /api/onboarding/status`, `PATCH /api/onboarding/profile` |
| Profile reads needed by wizard | `GET /api/restaurants/:id/profile` |

Everything else on `protectedApiRouter` → `403 { error: 'SETUP_INCOMPLETE' | 'PIN_CHANGE_REQUIRED' }` via one setup-gate middleware (single exemption list, mounted once). Exemption list is code-reviewed as security surface.

`change-pin` requirements: verify old PIN (bcrypt), reject reuse of the currently-active issued PIN, enforce minimum length 6 digits + rate-limited like verify-pin, clear `must_change_pin`, set fresh `pin_expires_at = null`.

## F. Vault PIN reset (closes the Slice B promise)

- `POST /api/super-admin/staff/:id/reset-pin` — `requireRole('SUPER_ADMIN')`.
- Design choice: **immediate new CSPRNG one-time PIN** (handover-once, identical semantics to Slice A) rather than an emailed reset token — provisioned managers may not have accepted their email/invite yet, so email delivery cannot be assumed. One-time-token-by-email stays available for a future phase if owners request it.
- Effects, all in one transaction: new hash written (`pin=""` sentinel preserved), `must_change_pin=true`, `pin_expires_at = now + 7d`, `failed_login_count=0`, `locked_until=null`, **all `refresh_tokens` for that staff revoked** (family kill — matches platform change-password precedent, PlatformAuthService.ts:390-396), audit `STAFF_PIN_RESET` with actor/target only.
- Response: 201 handover payload `{ temporary_pin, expires_at }` exactly once; never retrievable again.
- Tenant scoping: SUPER_ADMIN is cross-tenant by charter (audited impersonation precedent, authMiddleware.ts:191); route lives under `/super-admin` mount; target staff existence validated; MANAGER receives 403.

## G. Audit events & redaction

New events (details contain ids/codes only — never PINs, hashes, or tokens):
`STAFF_LOGIN_FAILED{reason:'pin_expired'}` · `STAFF_PIN_CHANGED` (self) · `STAFF_PIN_RESET` · `ONBOARDING_PROFILE_UPDATED` · `ONBOARDING_COMPLETED`.

## H. Invite-failure interplay (explicitly out of blocking scope)

Invite PENDING/UNKNOWN/ACTION_REQUIRED never blocks manager login or wizard completion — the manager holds the printed PIN; the invitation is an owner-cloud concern tracked by the Slice B dispatcher and surfaced in the Vault. If the founder wants invitations to gate `ACTIVE` later, that is a deliberate scope addition requiring its own review.

## I. Migration impact & backward compatibility

- One additive migration: `restaurants.onboarding_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'`.
- Existing tenants: default ACTIVE → zero behavioral change (regression suites prove it).
- Provisioning service: single-line change writing `SETUP_INCOMPLETE` for new tenants.
- Both existing login code paths (server.ts ~555-774 staff login and ~1000-1120 second block) receive identical minimal guards; unification explicitly out of scope.

## J. Focused tests & release-gate additions (`phase2-wizard.test.ts`)

1. Fresh provision → `SETUP_INCOMPLETE`; operational call 403; each allowlist endpoint passes; completion flips to ACTIVE; operations succeed.
2. Direct-API skip: order/menu/staff mutations blocked while incomplete (sample across routers).
3. Login payload exposes `must_change_pin` + `onboarding_status`; change-pin clears flag; wrong-old-PIN rejected; issued-PIN reuse rejected; rate limit fires.
4. Expired-unused PIN: login 403 `PIN_EXPIRED`, no tokens, audit reason; Vault reset then login works.
5. Reset: SUPER_ADMIN ok / MANAGER 403; old refresh family dead after reset (reuse-detection asserts); old PIN dead; new PIN authenticates and is flagged must-change; handover secret exactly once.
6. Migration compat: legacy tenant (created before migration) logs in and operates normally.
7. Distinct-error assertions: PIN_EXPIRED ≠ SETUP_INCOMPLETE ≠ PIN_CHANGE_REQUIRED responses.

Gate registration alongside existing suites; full sequential gate must pass before any push.

## K. Non-goals

MFA · multi-user wizard management · licensing changes · payment/inventory/Cravex/FBR/AI work · login-path unification · email-based reset tokens · demotion ACTIVE→SETUP_INCOMPLETE.
