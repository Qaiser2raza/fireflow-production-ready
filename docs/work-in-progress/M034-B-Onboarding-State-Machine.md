---
status: DRAFT
audience:
  - engineering
  - Kilo Code
  - product
owner: FireFlow team
last_reviewed: 2026-09-01
source: M034-B Onboarding State-Machine Design (reconnaissance-only; no production code)
sensitivity: internal
---

# M034-B — Onboarding State-Machine Design

> Design-only mission. No code changes in M034-B. This document is the
> contract that gates M034-D implementation, M034-F demo provisioning, and
> M034-G cloud deployment. It is grounded in the **verified current
> behavior** captured during M034-A and M034-B reconnaissance
> (`RestaurantProvisioningService.ts`, `server.ts`, `schema.prisma`,
> `authMiddleware.ts`, `OwnerInviteDispatcher.ts`).

---

## 0. Purpose & scope

Answer one question with code-level precision:

> **Exactly what server-side transaction, identity relationship, persisted
> state, and UI progression are required for a completely new person to
> create their restaurant and reach an operational FireFlow workspace
> without developer intervention?**

M034-B defines the **state machine, role/identity model, API contract,
persistence model, idempotency rules, and resume semantics** so M034-D can
implement against a frozen contract.

**Out of scope in M034-B:** writing production code, seeding FireFlow Café
(that is M034-F), and cloud deployment (M034-G).

---

## 1. Verified current state (what code actually does)

These are the anchors the design must preserve or intentionally change.

### 1.1 Identity domains (two, currently confusable by name)

```
PLATFORM IDENTITY                   TENANT / RESTAURANT IDENTITY
platform_users                        staff
  role: PLATFORM_OWNER                   role: MANAGER | ADMIN | CASHIER |
  (FireFlow SaaS operator)                   SERVER | WAITER | CHEF | RIDER
  platform_users.supabase_id @unique     role: free-text String (no enum)
  email UNIQUE-in-code only             @@unique([restaurant_id, name, role]) (no email unique)
  created by: ??? (code BLOCKS PLATFORM_OWNER — see 1.5)
                                      first staff seeded as role:'MANAGER'
                                      (RestaurantProvisioningService.ts:73-85, :77)
```

- **Tenant `SUPER_ADMIN`** is a *tenant-level* role on `staff` — the
  FireFlow-employee/Vault role that can retarget tenants via
  `x-target-restaurant` (`authMiddleware.ts:196-220`). It is **not** a
  platform role, and it is **not** restaurant-owner authority.
- **There is no `OWNER` tenant role today.** The restaurant creator is
  provisioned as `MANAGER` (`RestaurantProvisioningService.ts:77`).
- `PLATFORM_OWNER` is the SaaS operator identity. It is the **only** role
  that may call `POST /api/restaurants` (`server.ts:883`), which invokes the
  same provisioning transaction.

### 1.2 The single atomic provisioning transaction

`RestaurantProvisioningService.provisionRestaurant()`
(`RestaurantProvisioningService.ts:43-218`) performs **all** writes inside
one Prisma `$transaction`. Rollback is automatic on any throw — **there is
no partial-tenant cleanup path, because there is nothing to clean up**
(line 43 tx begins; line 218 callback ends; line 226 catch only logs).

DB writes, in order:

| # | Line | Table | Key effect |
|---|---|---|---|
| 1 | 44-49 | `restaurants` (read) | slug-uniqueness precheck **inside** the tx (race-safe) |
| 2 | 51-68 | `restaurants` | `onboarding_status:'SETUP_INCOMPLETE'`, trial/subs plan fields, currency/timezone |
| 3 | 70-71 | (CPU) | bcrypt owner PIN — **never persisted** |
| 4 | 73-85 | `staff` | first staff `role:'MANAGER'`, `must_change_pin:true`, `pin_expires_at:+7d`, plaintext `pin:''` |
| 5 | 89-95 | `owner_invites` | `state:'INVITE_PENDING'` |
| 6 | 97-105 | `sections` | default 'Main Dining' section |
| 7 | 107-115 | `tables` | default 'Table 1' |
| 8 | 117-131 | `order_type_defaults` | DINE_IN/TAKEAWAY/DELIVERY defaults |
| 9 | 142-150 | `chart_of_accounts` | 5 system accounts (REVENUE/COGS/EXPENSE/ASSET/LIABILITY) |
| 10 | 153-173 | `audit_logs` | `RESTAURANT_PROVISIONED` |
| 11 | 177-192 | `outbox` (row 1) | `RESTAURANT_CLOUD_REGISTER` (no secret in payload) |
| 12 | 194-208 | `outbox` (row 2) | `OWNER_INVITE_REQUESTED` |

Cloud side-effects (Supabase user creation, invite email) happen **after**
the tx commits, asynchronously, by `OwnerInviteDispatcher` reading the
outbox/owner_invites rows (`OwnerInviteDispatcher.ts:75-101`).

### 1.3 Onboarding persistence has exactly two canonical states

`restaurants.onboarding_status` (`schema.prisma:749`) — only **two** values
appear in code:

- `'SETUP_INCOMPLETE'` — set at provisioning (`RestaurantProvisioningService.ts:60`);
  schema default for legacy tenants is `'ACTIVE'` (`schema.prisma:749`).
- `'ACTIVE'` — set **only** by `POST /api/onboarding/complete`
  (`server.ts:1085-1125`), via an **optimistic guarded** `updateMany`:
  ```ts
  await tx.restaurants.updateMany({
    where: { id: req.restaurantId!, onboarding_status: 'SETUP_INCOMPLETE' },
    data:  { onboarding_status: 'ACTIVE', updated_at: new Date() }
  });
  ```
  The only forward transition. No reverse in code. Second call → `409 ALREADY_ACTIVE`.

`staff.must_change_pin` (`schema.prisma:890`) is a **second independent** gate:
when `true` (and actor is not SUPER_ADMIN / support session), the setup gate
(`authMiddleware.ts:222-247`) returns `403 PIN_CHANGE_REQUIRED` on every
non-allowlisted endpoint. It is set at provisioning
(`RestaurantProvisioningService.ts:80`) and at super-admin PIN reset
(`superAdminRoutes.ts:302`); cleared by self-service
`POST /api/auth/change-pin` (`server.ts:988-995`).

### 1.4 Resume after browser close is already safe

`onboarding_status` and `must_change_pin` are **server-persisted** and
re-read by `authMiddleware` on every request from the trusted JWT's tenant
(`authMiddleware.ts:222-247`). Closing the browser loses nothing durable.
Login re-establishes the session; the setup gate re-derives the exact step
from `restaurant.onboarding_status` + `staff.must_change_pin`. The client
reads these only for routing convenience (`App.tsx:312`).

### 1.5 The critical self-service gap (the whole point of M034-B)

- `POST /api/restaurants` requires `PLATFORM_OWNER` (`server.ts:883`).
- `POST /api/platform/auth/create-account` **hard-blocks** `PLATFORM_OWNER`
  (`PlatformAuthService.ts:105-107`).
- **No code path can create a `PLATFORM_OWNER`.**
  `UNKNOWN` how the first platform row is bootstrapped (no seed/migration
  found). This is the **first open question** to resolve in M034-B approval.

Consequently, a brand-new customer **cannot self-serve** today: there is no
public "create restaurant" flow, and the tenant authority role is `MANAGER`
(not a dedicated owner role). M034-B must decide whether self-service goes
through a new public provisioning path (owner = `MANAGER`, no PLATFORM_OWNER
needed) or through a PLATFORM_OWNER gatekeeper.

### 1.6 Idempotency today (insufficient for self-service)

- Provisioning is idempotent **only by slug** (`RestaurantProvisioningService.ts:44-49`),
  and the slug is `name + 6 random hex` (`RestaurantProvisioningService.ts:251-257`).
  Re-running with an **explicit** identical slug → `400 "A restaurant with
  this slug already exists"`; with a different random slug → a brand-new
  tenant. There is **no idempotency key** and **no e-mail dedupe**.
- `POST /onboarding/complete` is idempotent via the guarded `updateMany`.
- Owner invite is idempotent **by `invite_id`** (`OwnerInviteDispatcher.ts:109`).

---

## 2. Proposed state machine

Maps each design state to the **verified persistent state** (DB columns).
States in **bold** are durable; the rest are transient UI phases.

```
   ┌─────────────────────┐  no tenant yet / no identity
   │ NOT_REGISTERED      │  (no restaurants row, no staff row)
   └──────────┬──────────┘
              │  POST /onboarding/start  (atomic tx: §3)
              ▼
   ┌─────────────────────┐  restaurants.onboarding_status = 'SETUP_INCOMPLETE'
   │ RESTAURANT_CREATED  │  staff.must_change_pin = true, role = 'MANAGER'
   │ (= IDENTITY_CREATED)│  owner_invites.state = 'INVITE_PENDING'
   └──────────┬──────────┘
              │  POST /auth/change-pin  (must_change_pin -> false)
              ▼
   ┌─────────────────────┐  staff.must_change_pin = false
   │ PIN_SET             │  onboarding_status still 'SETUP_INCOMPLETE'
   └──────────┬──────────┘
              │  PATCH /onboarding/profile  (name/address/phone)
              ▼
   ┌─────────────────────┐  restaurants.name set (>=2 chars)
   │ BASIC_SETUP         │  onboarding_status still 'SETUP_INCOMPLETE'
   │ COMPLETE            │
   └──────────┬──────────┘
              │  POST /onboarding/complete  (guarded updateMany)
              ▼
   ┌─────────────────────┐  restaurants.onboarding_status = 'ACTIVE'
   │ READY_TO_OPERATE    │  TERMINAL
   └─────────────────────┘
```

**Legal transitions & guards:**

| From | Event (endpoint) | Guard (verified) | To | Idempotent? |
|---|---|---|---|---|
| NOT_REGISTERED | `POST /onboarding/start` | none (public) | RESTAURANT_CREATED | **needs idempotency key** (§5) |
| RESTAURANT_CREATED | `POST /auth/change-pin` | old_pin bcrypt match; new≠current/previous; 6-digit | PIN_SET | n/a (self-service) |
| PIN_SET | (re-change PIN) | same as above | PIN_SET | — |
| PIN_SET | `PATCH /onboarding/profile` | name ≥ 2 chars; allowlist {name,address,phone} | BASIC_SETUP_COMPLETE | effectively |
| BASIC_SETUP_COMPLETE | `POST /onboarding/complete` | `must_change_pin===false`; name ≥2; `updateMany where onboarding_status='SETUP_INCOMPLETE'` | READY_TO_OPERATE | **yes** (409 on 2nd call) |
| READY_TO_OPERATE | — | terminal | — | — |

**Transient UI-only phases** (no DB state, client-routed):
`CONFIGURING optional data` (tables/menu/staff/inventory/printers) — reachable from
BASIC_SETUP_COMPLETE; skippable; resumable indefinitely because the durable
state is still `SETUP_INCOMPLETE` until `COMPLETE` fires.

**Failure / recovery states:**
- `PIN_EXPIRED` at login (`server.ts:708-723`) → owner reset via
  `POST /super-admin/staff/:id/reset-pin` (`superAdminRoutes.ts:279`)
  (returns a fresh temp PIN once, revokes refresh tokens).
- Owner invite `INVITE_FAILED_RETRYING` / `INVITE_FAILED_MANUAL`
  (`OwnerInviteDispatcher.ts` state machine) → manual retry
  (`POST /super-admin/owner-invites/:id/retry`, `superAdminRoutes.ts:252`).
- `UNKNOWN` invite outcome is **never** recorded as definitive failure
  (`OwnerInviteDispatcher.ts:154-156`); max 5 attempts, then `MANUAL`.

**Resume on browser close / network loss:** always safe — durable state lives
in `restaurants.onboarding_status` + `staff.must_change_pin`, re-derived on
every request by `authMiddleware.ts:222-247`.

---

## 3. Atomic provisioning design (M034-B spec)

Preserve the existing single-transaction model
(`RestaurantProvisioningService.ts:43`), but expose it through a **public,
idempotent** entry point.

**Transaction boundary (must be atomic):**
```
in one PG tx:
  create restaurants.onboarding_status='SETUP_INCOMPLETE'
  create staff (first tenant authority, role per §4, must_change_pin=true, +7d expiry)
  create owner_invites.state='INVITE_PENDING'
  create default sections + tables
  create order_type_defaults (3 rows)
  create chart_of_accounts (5 system rows)
  audit_logs RESTAURANT_PROVISIONED
  (2 outbox rows: RESTAURANT_CLOUD_REGISTER, OWNER_INVITE_REQUESTED)
commit → async cloud side-effects via OwnerInviteDispatcher
```

**Invariant:** if any write throws, the entire tenant is rolled back — no
half-created tenant, no compensating delete needed.

**Demo note (M034-F, do NOT execute here):** FireFlow Café uses the *same*
transaction shape, keyed by a deterministic slug (`fireflow-cafe`) and a
`demo_provision_run_id` idempotency key, with `upsert`-style guards so
re-running the demo seeder produces a stable, reproducible tenant.

---

## 4. Role / identity model (reconciled)

```
Platform
└── PLATFORM_OWNER            (platform_users)  — SaaS operator
        │  manages platform (licenses, billing, ALL tenants)
        │  may call POST /api/restaurants (server.ts:883)
        │
        ▼
Restaurant (tenant)
├── Restaurant Owner / Primary Administrator  (product term, UI)
│       ↳ persisted as staff.role = 'MANAGER' (current), with must_change_pin=true
│       ↳ M034-B DECISION POINT: keep MANAGER, or add a distinct ownership flag
├── MANAGER        (staff.role) — current tenant authority; can complete setup
├── ADMIN          (staff.role) — full tenant ops (created by seed-restaurant, server.ts:4148)
├── CASHIER / SERVER / WAITER / CHEF / RIDER (staff.role)
└── SUPER_ADMIN    (staff.role) — FireFlow-employee Vault role (retarget tenants), NOT restaurant owner
```

**Naming collision to eliminate in product UI:**
- `staff.role === 'SUPER_ADMIN'` → relabel **FireFlow Staff / Vault** in the UI.
- `platform_users.role === 'PLATFORM_OWNER'` → relabel **Platform Administrator**.
- The restaurant creator → **Restaurant Owner** (product term), backed today by
  `staff.role = 'MANAGER'`.

**Open questions for approval (block M034-D):**
1. Do we introduce a dedicated `OWNER` tenant role, or keep `MANAGER` as the
   de-facto owner and represent "ownership" with a boolean/flag? (Recommendation:
   keep `MANAGER`; add a `primary_administrator` boolean on `staff` if the auth
   model needs it — avoids an RBAC role that the existing authorization
   surface does not yet require.)
2. How is the first `PLATFORM_OWNER` bootstrapped? (Currently unresolvable in
   code — `PlatformAuthService.ts:105-107` hard-blocks it.) Acceptable answer:
   first row created out-of-band (DB/migration) once, thereafter via platform
   login + platform route. Self-service onboarding must **not** require a
   `PLATFORM_OWNER`.

---

## 5. Proposed onboarding API contract (frozen in M034-B)

> These endpoints do **not** all exist yet. M034-B *defines* them; M034-D
> *implements* them. Existing endpoints keep their current signatures.

| Method | Path | Purpose | Auth | Idempotent |
|---|---|---|---|---|
| `POST` | `/onboarding/start` | Create tenant + owner in one atomic tx; return one-time setup token/PIN. **New.** | none (public) | **yes** (idempotency key required) |
| `POST` | `/onboarding/verify-setup-token` | Validate the one-time token, return tenant + owner identity. **New.** | none (public, token-bound) | yes |
| `POST` | `/auth/login` | (existing) PIN login | none | read |
| `POST` | `/auth/change-pin` | (existing) owner changes temp PIN | allowlisted | n/a |
| `GET`  | `/onboarding/status` | (existing) returns onboarding_status + requirements | allowlisted | yes |
| `PATCH`| `/onboarding/profile` | (existing) set name/address/phone | allowlisted `MANAGER+` | effectively |
| `POST` | `/onboarding/complete` | (existing) flip SETUP_INCOMPLETE→ACTIVE | allowlisted `MANAGER+` | **yes** |
| `GET`  | `/onboarding/resume` | (new, optional) server-returned current step for return visitors | allowlisted | yes |

**Idempotency contract for `POST /onboarding/start`** (the gap):
- Client supplies `Idempotency-Key` (UUIDv4) **or** a deterministic key
  (client-generated identity token). The server records the key against the
  `(tenant, owner_staff)` pair (a new `onboarding_provisionings` row OR reuse
  the existing `outbox` idempotency uniqueness at `schema.prisma:1321`).
- Same key → returns the **existing** tenant + owner (no duplicate).
- Different key → new tenant.
- If the tx fails mid-way, the key row is rolled back too (same tx), so a
  retry with the same key re-runs cleanly.

**No endpoint in this flow creates a `PLATFORM_OWNER` or `SUPER_ADMIN` staff.**
That boundary is intentional and enforced in M034-D via `requireRole`/route
structure.

---

## 6. Persistence model (verified)

**Tables that define onboarding state:**
- `restaurants.onboarding_status` — `SETUP_INCOMPLETE | ACTIVE` (`schema.prisma:749`)
- `staff.must_change_pin` — bool, default false (`schema.prisma:890`)
- `staff.pin_expires_at` — timestamp (provisioned +7d, `RestaurantProvisioningService.ts:81`)
- `owner_invites.state` — `INVITE_PENDING | INVITE_UNKNOWN | INVITE_FAILED_RETRYING | INVITE_SENT | INVITE_FAILED_MANUAL` (`schema.prisma:1527`)
- `order_type_defaults` — `@@unique([restaurant_id, order_type])` (`schema.prisma:447`)
- `chart_of_accounts` — seeded 5 system rows (`schema.prisma:109`)

**Uniqueness relevant to onboarding:**
- `restaurants.slug @unique` (`schema.prisma:725`)
- `staff @@unique([restaurant_id, name, role])` (`schema.prisma:915`)
- `owner_invites @@unique([restaurant_id, email])` (`schema.prisma:1534`)
- `outbox @@unique([aggregate_type, aggregate_id, event_type])` (`schema.prisma:1321`)
- `platform_users.supabase_id @unique` (`schema.prisma:1543`); `email` unique-in-code only (`PlatformAuthService.ts:115-121`)

**Failure atomicity:** confirmed — the provisioning tx (`RestaurantProvisioningService.ts:43-218`)
is all-or-nothing; no partial-cleanup path exists because none is needed.

---

## 7. Resume / recovery semantics (frozen)

| Scenario | Behavior |
|---|---|
| Browser closed mid-wizard | Durable state (`onboarding_status`, `must_change_pin`) survives; login + `authMiddleware` gate re-derives step. No duplicate tenant. |
| Network loss during `/onboarding/complete` | Safe — guarded `updateMany` makes it idempotent; a retry either flips to `ACTIVE` or returns `409 ALREADY_ACTIVE`. |
| Re-run `/onboarding/start` with same idempotency key | Returns existing tenant + owner (no duplicate). |
| Owner PIN expires before first change | Login returns `401 PIN_EXPIRED` (`server.ts:708-723`); owner reset via super-admin reset-pin. |
| Owner invite never receives email | `OwnerInviteDispatcher` retries up to 5 (`OwnerInviteDispatcher.ts:22`), `UNKNOWN` not treated as failure (`:154-156`); then `INVITE_FAILED_MANUAL`; super-admin can `POST /api/super-admin/owner-invites/:id/retry` (`superAdminRoutes.ts:252`). |
| Provisioning throws mid-transaction | PG rolls back the entire tx; nothing written; no orphan. (Catch only logs, `RestaurantProvisioningService.ts:226-232`.) |

---

## 8. FireFlow Café demo (design only — M034-F implements)

**Not provisioned in M034-B.** Defined here so the provisioning contract (§3)
and persistence model (§6) can be validated against it.

- **Tenant:** `slug='fireflow-cafe'`, `name='FireFlow Café'`, PKR, Asia/Karachi,
  `onboarding_status='ACTIVE'` (demo ships ready-to-operate).
- **First authority:** seeded owner as `staff.role='MANAGER'`, **or** via the
  new `POST /onboarding/start` with a fixed idempotency key so re-seeding is
  safe.
- **Staff matrix:** Owner/Manager, Manager, Cashier, Waiter, Chef (5 roles,
  each with a distinct demo PIN reset to a known value).
- **Tables:** T1–T6 (capacities 2/2/4/4/6/6) in a `Dining` section.
- **Menu:** Breakfast/Appetizers/Burgers/Pizza/Main/Pasta/Beverages/Desserts
  with the items your proposal lists.
- **Inventory:** ~8 stocked items, seeded `current_stock` + `average_unit_cost`
  (so WAC projection is exercised), a few `stock_movements` (RECEIVE +
  CONSUMPTION) to populate history.
- **Orders:** a mix of OPEN/active + CLOSED/PAID orders with order_items +
  line items, to populate COGS journal entries.
- **Idempotency:** re-running the demo seeder must **not** produce duplicate
  `FireFlow Café (2)` — same `idempotency key` + `slug` + guarded upserts.

---

## 9. Open questions blocking M034-D (must resolve in M034-B approval)

1. **PLATFORM_OWNER bootstrap** — how is the first platform row created?
   (Code-blocked today.) Decision: out-of-band, once.
2. **Owner role identity** — keep `MANAGER` as the de-facto owner (with a
   product "Restaurant Owner" label) or introduce a distinct role/flag?
   (Recommendation: keep MANAGER; add `primary_administrator` boolean if needed.)
3. **`POST /onboarding/start` idempotency key** — own `onboarding_provisionings`
   table, or reuse `outbox` idempotency uniqueness (`schema.prisma:1321`)?
4. **Self-service PIN delivery** — email invite vs. one-time setup token shown
   in the browser exactly once (handover semantics like provisioning).
5. **seed-restaurant inconsistency** — it creates an `ADMIN` staff **without**
   `must_change_pin` (`server.ts:4148-4157`), diverging from provisioning
   (`RestaurantProvisioningService.ts:80`). M034-D should align it.

---

## 10. Alignment with TD-19 (M034-C gate)

M034-C (fix the unauthenticated `PATCH /api/orders/:id/guest-count`,
`server.ts:3161`) is a **hard prerequisite** to M034-D. The onboarding
provisioner and every post-setup endpoint must assume an authenticated,
tenant-scoped actor; TD-19 proves the current code does not. M034-C commits
first, M034-D implements against the contract here.

---

## Appendix A — State → durable-fields mapping

| Design state | `restaurants.onboarding_status` | `staff.must_change_pin` | owner invite state |
|---|---|---|---|
| NOT_REGISTERED | (no row) | (no row) | (no row) |
| RESTAURANT_CREATED | `SETUP_INCOMPLETE` | `true` | `INVITE_PENDING` |
| PIN_SET | `SETUP_INCOMPLETE` | `false` | `INVITE_PENDING`/`SENT` |
| BASIC_SETUP_COMPLETE | `SETUP_INCOMPLETE` | `false` | `SENT` |
| READY_TO_OPERATE | `ACTIVE` | `false` | `SENT` (terminal tx) |

## Appendix B — Verified reference (code anchors)

| Concern | Anchor |
|---|---|
| Atomic provisioning tx | `RestaurantProvisioningService.ts:43-218` |
| Owner as MANAGER + must_change_pin | `RestaurantProvisioningService.ts:73-85` (:77 role, :80 pin flag, :81 expiry) |
| onboarding_status default/transition | `schema.prisma:749`; `server.ts:1085,1104-1107` |
| Setup gate (authMiddleware) | `authMiddleware.ts:222-247` (allowlist `233-238`) |
| PIN expiry rejection | `server.ts:708-723` |
| Idempotent complete | `server.ts:1104-1109` (guarded updateMany) |
| Owner invite state machine | `OwnerInviteDispatcher.ts:22,75-101,113-156,228-254` |
| Staff role free-text, no enum | `schema.prisma:875` |
| PLATFORM_OWNER hard-block | `PlatformAuthService.ts:105-107` |
| seed-restaurant idempotency | `server.ts:3990-4004` (+upserts) |
| seed-restaurant missing must_change_pin | `server.ts:4148-4157` |
| Unauthenticated guest-count write (TD-19) | `server.ts:3161` |
