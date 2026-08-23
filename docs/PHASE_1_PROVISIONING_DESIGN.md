# Phase 1 — Provisioning & Identity: Design Review

**Status:** APPROVED WITH CONDITIONS (CTO sign-off 2026-08-23) — implementation authorized after condition incorporation
**Baseline:** `main @ 2294229` (Phase 0 hygiene merged locally)
**Scope:** Vault "Create Restaurant": slug validation → tenant row → Supabase owner invitation → one-time MANAGER PIN → handover sheet
**Constraint (founder):** the Supabase invitation cannot join the PostgreSQL transaction; an explicit pending/compensation state is mandatory.
**Revision 2:** incorporates all seven CTO conditions and supersedes the open-decision table (§C of revision 1, preserved verbatim at the bottom for record).

---

## A. Inspection findings

### 1. Existing provisioning service and route

| Asset | Location | Behavior |
|---|---|---|
| `RestaurantProvisioningService.provisionRestaurant` | `src/api/services/onboarding/RestaurantProvisioningService.ts:15-179` | Single PG `$transaction` (:41): slug uniqueness check (:42) → `restaurants.create` (:49) → owner `staff.create` role MANAGER with PIN bcrypt-hashed cost 12 (:67-80) → section + table seeds (:82-100) → `order_type_defaults` ×3 (:102-116) → CoA ×5 system accounts (:118-136) → audit log `RESTAURANT_PROVISIONED` inside tx (:138-156). Returns `temporary_pin` in plaintext to caller (:163) |
| `POST /api/restaurants` | `src/api/server.ts:782` | Exposes provisioning; guards = `platformAuthMiddleware` + `requirePlatformRole('PLATFORM_OWNER')`; returns result incl. temporary PIN (:809+) |
| Super-admin routes | `src/api/routes/superAdminRoutes.ts:14-15` | License/payment/restaurant-overview only — **no provisioning route here yet**; note: guard is `requireRole('SUPER_ADMIN', 'MANAGER')`, i.e. tenant MANAGERs can reach license management today (pre-existing over-grant, see D-4) |
| Test usage | `tests/onboarding-saas.test.ts` | Calls the service directly ~11× as fixture builder; asserts slug-conflict and duplicate behaviors |

### 2. Tenant and owner data model

- `restaurants` (`prisma/schema.prisma:692`): `slug String? @unique` (:695), `owner_id String?` **dangling legacy field, no relation/FK** (:696), `subscription_status/plan/expires_at/trial_ends_at` (:702-719).
- `staff` (`prisma/schema.prisma:832`): plaintext `pin` NOT NULL (:837), `hashed_pin` nullable (:844), lockout fields `locked_until` / `failed_login_count` (:849-850), `@@unique([restaurant_id, name, role])` (:873). **No `must_change_pin`, no pin-expiry column.**
- Precedent for forced-change lifecycle already exists on platform users: `platform_users.must_change_password Boolean` (`schema.prisma:1423`) consumed by login flow (`PlatformAuthService.ts:333`).
- Cloud mirror: `restaurants_cloud` (Supabase) written by `cloudClient.registerRestaurant` (`src/shared/lib/cloudClient.ts:340-395`) with slug, trial dates, plan fee.

### 3. Supabase invitation integration and failure handling

- **No invitation implementation exists.** `inviteUserByEmail`: zero matches repo-wide.
- The only Supabase Auth usage server-side is token *verification*: `PlatformAuthService.verifySupabaseToken` → `client.auth.getUser(token)` (`PlatformAuthService.ts:563-576`), using a service-key client created at :12-24 (fails soft with console error when env missing).
- `registerRestaurant` inserts into `restaurants_cloud` (`cloudClient.ts:350-367`); failures collapse to generic string errors (:369-373); no retry, no idempotency key, no dedupe check before insert.
- Client-side orphan: `RegistrationView.tsx` still calls `registerRestaurant` but is unreachable since the F-1 button removal (see D-5).

### 4. PIN hashing, one-time use, expiry, lockout

- Login path is bcrypt-only: candidates filtered by `hashed_pin: { not: null }` (`server.ts:565`), verified via `bcrypt.compare` (:602); lockout after 5 failures → 30 min (:634-635, `STAFF_LOCKED` audit :636-650); counters reset on success (:690); env-tunable login/PIN rate limiters (:474-492).
- Gaps relevant to Phase 1:
  - `generateSecurePin()` uses **`Math.random()`** — not a CSPRNG despite the name (`RestaurantProvisioningService.ts:205-211`).
  - Provisioning writes the real PIN into plaintext `staff.pin` (:75) while login only reads `hashed_pin` — unnecessary secret retention (phase1 suite proves `pin=""` sentinel works for migrated users).
  - No one-time semantics beyond "caller shows it"; no expiry; no forced change.

### 5. Transaction boundaries today

Everything provisioning touches is local and joins one transaction; no external system is currently involved. Phase 1 introduces the first cross-system write (Supabase), which must stay outside the tx by constraint and by good practice (no network calls holding row locks).

### 6. Rollback/retry behavior when Supabase unavailable

- Today: none for cloud writes — single-shot, error swallowed to a string (`cloudClient.ts:388-394`).
- Existing reusable retry machinery: the **outbox table** (`schema.prisma:1194-1213`) has `status PENDING`, `attempt_count`, `available_at`, `last_error`, `lock_owner/lock_expires_at` — production-grade delayed-retry queue already cycled by `OutboxReader` (`OutboxReader.ts:10`, marks `processed_at` :146) and consumed by `IntegrationDispatcher` / fiscal dispatchers. Fiscal flows demonstrate the attempt-table pattern too (`FiscalDocumentService.ts:79-146`).
- Phase 1 should reuse this instead of inventing a new queue.

### 7. Audit events and secret/redaction requirements

- Patterns in place: `RESTAURANT_PROVISIONED` audit inside provisioning tx (`RestaurantProvisioningService.ts:138`); `STAFF_LOGIN_FAILED` / `STAFF_LOCKED` audits (`server.ts:584-681`); `system_logs` logger in SuperAdminService (`SuperAdminService.ts:109-115`).
- Redaction: staff responses strip `pin`/`hashed_pin` (`server.ts:851,890,2747`); generic table API blocks sensitive tables and strips sensitive field names (`server.ts:3689-3702`).
- Requirements carried into design: handover sheet data returned exactly once in the provision response; **never** place PIN/invite tokens in `audit_logs.details` or logs; invite state transitions auditable without secrets.

### 8. Licensing and activation gates

- `verifyLicensingMiddleware` guards all of `protectedApiRouter` including `/super-admin` (`server.ts:1863,1875`), keyed on the **actor's** `req.restaurantId`, skipped when `NODE_ENV=test` (:1837). It evaluates per-request against the license payload bound to one `restaurant_id` + hardware fingerprint (`LicenseService.ts:189-197`).
- Known hazard: `/api/licensing/status` evaluates an unordered `findFirst()` restaurant (`server.ts:370-381`) — the multi-tenant-dev-DB mismatch seen during the Phase 0 gate incident originates here. Creating additional tenant rows on one node DB will reproduce this class of issue outside test mode (see D-3).

### 9. Frontend Vault surface

- `SuperAdminView.tsx` (`src/features/saas-hq/`) has tabs `overview | restaurants | payments | licenses` (:48) and already fetches `/super-admin/restaurants` overview with staff/order counts (:92). "Create Restaurant" belongs as an action on the restaurants tab: modal wizard (details → review) → success screen rendering the printable handover sheet (PIN shown once, print button). Data fetching uses established `fetchWithAuth` pattern.

### 10. Tests and release-gate coverage needed

- Gate boots its own API server sequentially (`scripts/release-gate.cjs`) — a new `tests/phase1-provisioning.test.ts`-style sequential suite fits the established harness (cf. `phase1-pin-hardening.test.ts`, `mission-016b-boundary.test.ts`).
- Required cases: happy path (tenant+seeds+manager created, PIN hash-only, outbox rows enqueued); slug conflict 400; slug normalization; Supabase-down → tenant committed, invite stays `PENDING`, dispatcher retries then succeeds (mocked client), or surfaces `FAILED_MANUAL`; duplicate owner email idempotency; redaction assertions (no PIN anywhere in responses/logs/audits); licensing-exempt access control (non-SUPER_ADMIN rejected).
- Plus one-shot `scratch/*.cjs` DB-state evidence scripts per verification culture.

---

## B. Design proposal (for approval)

### B.1 Ownership of steps

```
Vault UI (SuperAdminView)
   │ POST /api/super-admin/restaurants/provision   [SUPER_ADMIN only]
   ▼
STEP 1 · LOCAL PG TRANSACTION (all-or-nothing, unchanged scope)
   slug validate+reserve → restaurants row → manager staff row
   (CSPRNG PIN, bcrypt-only storage, must_change_pin=true, pin_expires_at)
   (+ seeds as today) → audit RESTAURANT_PROVISIONED (no secrets)
   → outbox.enqueue(OWNER_INVITE_REQUESTED)
   → outbox.enqueue(RESTAURANT_CLOUD_REGISTER)
   COMMIT
   ▼
HTTP 201 + handover sheet payload (PIN displayed ONCE)
   ▼ (async, outside any tx)
STEP 2 · OUTBOX DISPATCHER (existing OutboxReader cadence)
   RESTAURANT_CLOUD_REGISTER → upsert restaurants_cloud (idempotent by restaurant_id)
   OWNER_INVITE_REQUESTED    → Supabase auth.admin invite-by-email
                               (idempotent: lookup-by-email first; store supabase_user_id)
   success → CLOUD_SYNCED / INVITE_SENT   failure → attempt_count++, available_at backoff, last_error
   terminal failure (duplicate email etc.) → INVITE_FAILED_MANUAL, surfaced in Vault with Retry
```

### B.2 Explicit states (no implied atomicity)

| State | Meaning | Where visible |
|---|---|---|
| `PROVISIONED` (local) | Tenant + manager exist; PIN issued, unused | Vault list |
| `INVITE_PENDING` | Outbox event not yet delivered to Supabase | Vault badge "invite pending" |
| `INVITE_UNKNOWN` | Provider call timed out / result unknowable — **not** a failure; reconciled by lookup before any duplicate create | Vault badge "verifying" |
| `INVITE_SENT` | Supabase user created / invite email dispatched (provider response accepted) | Vault |
| `INVITE_FAILED_RETRYING` | Transient error with known-negative outcome; backoff in progress | Vault badge + last_error |
| `INVITE_FAILED_MANUAL` | Terminal negative outcome needing human (e.g. email exists) | Vault alert + manual actions |

Timeout/exception classification mirrors the proven unknown-outcome pattern in `PaymentDispatcher` (`PaymentDispatcher.ts:101-111,159`): an unresolved outcome transitions to `INVITE_UNKNOWN`, and reconciliation (provider lookup by idempotency key/email) decides `SENT` vs retry — a timeout must never auto-become `FAILED`, and never re-create blindly.

Tenant operation is never blocked by invite state in Phase 1 (manager holds the printed PIN); Phase 2's `SETUP_INCOMPLETE` wizard will own the activation gate afterwards.

If the 201 handover response is lost, the PIN is unrecoverable by design; recovery is a Vault-side manager-PIN reset (new controlled path), never re-emission of the original secret.

### B.3 Schema additions (migration `20260823_phase1_owner_invites`)

1. `staff.must_change_pin Boolean @default(false)` — mirrors proven `platform_users.must_change_password`.
2. `staff.pin_expires_at DateTime?` — unused-PIN expiry (7 days per D-2).
3. New table `owner_invites`: `restaurant_id`, `email`, `supabase_user_id?`, `state` (enum-like string), `attempt_count`, `last_error?` (**sanitized: error codes only, never provider bodies/tokens**), `invited_at?`, timestamps; **partial unique index allowing only one non-terminal invite per restaurant** (`unique where state not in ('FAILED_MANUAL','SENT')`-style) to make duplicate-active-invitation prevention DB-enforced.
4. Stop writing real values to `staff.pin` for newly provisioned users (`pin=""` sentinel, matching phase1-migrated shape).

### B.4 Security decisions embedded (condition-hardened)

- PIN generation uses `crypto.randomInt(0, 1_000_000)` formatted zero-padded to 6 digits (~19.9 bits CSPRNG entropy); the PIN value is **never** used as a lookup key anywhere (lookup is by restaurant_id + bcrypt compare only). PIN is stored ONLY as bcrypt hash + flags; plaintext exists solely in the 201 response for the handover sheet, and never in DB rows, outbox payloads, logs, audit details, error messages, or retry records.
- Handover sheet rendered client-side from the single 201 response; nothing re-fetchable later; endpoint refuses to return the PIN ever again.
- Outbox payloads carry identifiers/routing only (`restaurant_id`, `invite_id`, `email`) — no secrets, no credentials, no tokens; consumer preserves tenant context and dedupes on `invite_id` idempotency key.
- Audit details contain emails/ids/state transitions only.
- Provisioning route lives under `/super-admin` with an additional `requireRole('SUPER_ADMIN')` guard (D-4, required): tenant MANAGER rejection is an explicit test case. Actor licensing still applies naturally via `protectedApiRouter`; target tenant needs no license to be provisioned.

### B.5 Licensing-status scoping (Condition 4 — dual-mode contract)

`GET /api/licensing/status` is consumed **unauthenticated** by the boot path (`SubscriptionGuard.tsx:43,98`, tamper/activation screen), so identity-based scoping must be dual-mode:

| Request context | Behavior |
|---|---|
| Authenticated (`req.restaurantId` present) | Evaluate strictly that restaurant's license binding — no `findFirst()` |
| Unauthenticated, exactly one local restaurant | Legacy behavior preserved (unambiguous single node = production/pilot shape) |
| Unauthenticated, zero or multiple restaurants | Evaluate signature/fingerprint/clock/expiry from the license payload only; return payload metadata; **never** bind to an arbitrary first row (no unordered `findFirst()` when identity is ambiguous) |

Same rule applied to `POST /api/licensing/sync` (`server.ts:427` has the identical unordered findFirst hazard). Pilot boundary documented here satisfies Condition 7; production entitlement isolation remains a Phase 5 follow-up task (tracked in §E).

---

## C. CTO decisions (signed 2026-08-23) — supersede revision-1 open questions

| # | Decision | Ruling |
|---|---|---|
| D-1 | Owner identity source of truth | **Approved:** Supabase Auth from day one |
| D-2 | One-time PIN expiry window | **Approved:** 7 days unused → expired; `must_change_pin=true` |
| D-3 | Multi-tenant-per-node licensing | **Approved for pilot only**, with explicit boundary documentation + Phase 5 production follow-up task |
| D-4 | SUPER_ADMIN-only provisioning | **Approved and required** — manager rejection must be tested |
| D-5 | Delete orphaned `RegistrationView.tsx` | **Approved** — dependency search confirmed zero references (no import/route/lazy/test); removal in implementation commit |

### Conditions of approval (binding)

1. PIN stored as bcrypt hash + flags only; returned once in the 201 handover response; never in DB rows, outbox payloads, logs, audit details, errors, or retry records. Lost-response recovery = controlled Vault reset, never re-emission.
2. CSPRNG generation; explicit format/entropy; PIN never a lookup key.
3. External calls outside the tx; idempotent dispatcher; unknown-outcome reconciliation instead of duplicate creation.
4. SUPER_ADMIN guard on `/api/super-admin/*` provisioning + tenant-manager rejection test; `/api/licensing/status` tenant-scoped; no unordered cross-tenant `findFirst()` where identity is required (dual-mode design §B.5).
5. Outbox payloads: identifiers/routing only; consumer preserves tenant context, uses idempotency keys.
6. `owner_invites` per §B.3 incl. unique-active-invite constraint and sanitized errors; timeout ≠ FAILED.
7. Pilot boundary documented here; Phase 5 follow-up task: "production entitlement isolation — per-tenant license binding on multi-tenant nodes".

## E. Follow-up task register

| ID | Task | Target phase |
|---|---|---|
| FU-1 | Production entitlement isolation: per-tenant license binding when a node legitimately hosts multiple tenants | Phase 5 enrollment |
| FU-2 | Release-gate occupied-port fail-fast before boot | hygiene backlog |
| FU-3 | Review remaining `/api/super-admin/*` role surface (MANAGER currently allowed on licenses/payments) | separate hygiene pass |

## F. Implementation checklist (slices)

1. **Slice A (local core):** migration (§B.3) → service hardening (CSPRNG, sentinel plaintext, flags, outbox enqueue, owner_invites row inside tx) → `POST /api/super-admin/restaurants/provision` (SUPER_ADMIN) → licensing-status dual-mode scoping → delete `RegistrationView.tsx` → slice-A tests.
2. **Slice B (cloud):** `OwnerInviteDispatcher` consuming the two outbox events against Supabase (idempotent, backoff, UNKNOWN reconciliation, terminal classification) + retry route + dispatcher tests with mocked client.
3. **Slice C (Vault UI):** Create Restaurant modal, state badges, printable handover sheet, manual reset/retry actions.
4. Every slice: full release gate green before any push.
