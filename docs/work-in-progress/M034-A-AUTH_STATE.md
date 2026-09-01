---
status: DRAFT
audience:
  - engineering
  - Kilo Code
owner: FireFlow team
last_reviewed: 2026-09-01
source: M034-A Authentication & Onboarding Reconnaissance
sensitivity: internal
---

# AUTH_STATE.md — Authentication, Onboarding & Role Model (M034-A)

Audit-only reconnaissance. No code changes. All references verified against the
committed implementation at `HEAD` (post-M033). Verified = read in situ.

## 0. Executive summary

- **PIN login** is server-gated and timing-safe; plaintext `pin` is never read.
- **JWTs are access tokens only (15 min).** Refresh tokens are **opaque, DB-backed,
  rotating** (`RefreshTokenService`), NOT JWTs — the `JwtService.ts` doc comment
  claiming to generate refresh JWTs is stale.
- **Two role hierarchies exist but are conflated by naming:** tenant roles
  (`staff.role` free-text enum incl. `SUPER_ADMIN`) vs platform roles
  (`platform_users.role`: `PLATFORM_OWNER`/`SUPPORT_*`). **`SUPER_ADMIN` is a
  tenant-level role**, not a platform role; there is **no `OWNER` tenant role**.
- **Critical gap (TD-12 class):** `PATCH /api/orders/:id/guest-count`
  (`server.ts:3161`) is an **unauthenticated write** that trusts a client-supplied
  `x-staff-id` header. Highest-confidence finding — see §7.

## 1. Current login flow

`POST /api/auth/login` — `src/api/server.ts:587`, rate-limited (`loginLimiter`,
`server.ts:541-552`).

- Body: `{ pin, restaurant_id, staff_name? }` (`server.ts:588`). `restaurant_id` is
  **required** (`server.ts:598`); PIN must be 6 digits (`server.ts:595`).
- Tenant existence + active check first (`server.ts:609-634`). Unknown/inactive tenant
  runs a dummy bcrypt compare so the failure timing is constant.
- Staff candidates scoped to `restaurant_id` + `status:'active'` + `hashed_pin:{not:null}`
  (`server.ts:638-657`); locked-out staff excluded (`server.ts:660`).
- Verification is a **bcrypt compare against `hashed_pin`** only; the plaintext `pin`
  column is never read (`server.ts:683`). Verified F-V5.
- Expired one-time PINs are rejected post-match (`server.ts:708-723`, code `PIN_EXPIRED`).
- Failure accounting: per-staff counter + 30-min lockout after 5 failures
  (`server.ts:730-785`); multi-candidate failures do not punish unrelated accounts.
- **Tenant binding:** `restaurant_id` from the request body scopes the whole lookup;
  the matched staff's `restaurant_id` is then trusted.
- Audited: `STAFF_LOGIN`/`STAFF_LOGIN_FAILED`/`STAFF_LOCKED`
  (`server.ts:810-823`, `665-781`).
- Returns (`server.ts:846-855`): `{ success, staff:{id,name,role,restaurant_id,status,must_change_pin,last_login}, restaurant:{id,name,slug,logo_url,onboarding_status}, tokens:{access_token,refresh_token,expires_in:900} }`.

## 2. JWT lifecycle

Access tokens: `src/api/services/auth/JwtService.ts` (singleton `jwtService`, line 201).

- **Access token:** 15-min expiry (`JWT_ACCESS_EXPIRY_MINUTES=15`, `JwtService.ts:53`),
  HS256. Claims: `{staffId, restaurantId, role, name, type:'access', iat, exp, jti}`
  (`JwtService.ts:102-111`); `jti = crypto.randomUUID()`.
- **Refresh token:** opaque, DB-backed, managed by `RefreshTokenService`
  (NOT JwtService; the JwtService doc comment at `JwtService.ts:7` is **stale**).
- Signing key: `FIREFLOW_JWT_SECRET` (min 32 chars). In production its absence throws
  (`JwtService.ts:63-64`); in dev it falls back to a per-restart random key with a
  warning (`JwtService.ts:66-70`) — tokens invalidate on restart in dev.
- Verification: `verifyToken()` does manual base64url decode + HMAC-SHA256 + expiry +
  claim checks (`JwtService.ts:120-155`). **No algorithm-confusion guard** — the header
  `alg` is parsed without enforcing `alg==='HS256'` (line 132). Low practical risk
  (HS256-only) but a deviation from JWT best practice.
- Refresh: `POST /api/auth/refresh` (`server.ts:1471`), **unauthenticated by design**.
  Hashes the token (sha256), looks up `refresh_tokens` by `token_hash` where
  `revoked_at:null` + `expires_at>now` (`server.ts:1479-1494`). Reuse detected → revokes
  the whole `token_family_id`, returns `401 TOKEN_REUSE_DETECTED`
  (`server.ts:1496-1513`). Rotation done transactionally in
  `RefreshTokenService.ts:87-147` (`SELECT … FOR UPDATE`, revoke+insert). Returns new
  access+refresh (`server.ts:1571-1575`). Lifetime = 7 days
  (`RefreshTokenService.ts:7, 47`). The `TODO Phase 2c` comments at `server.ts:1468-1469`
  are **outdated** — rotation IS implemented.
- Logout: `POST /api/auth/logout` (`server.ts:1590`), authenticated. Revokes the caller's
  refresh-token family server-side (authoritative) + any supplied `refresh_token`
  (`server.ts:1599-1613`); audited `STAFF_LOGOUT` (`server.ts:1615-1628`).
- **Gap (no access-token revocation):** access tokens are NOT blacklisted (no shared
  store). A stolen access token lives until its 15-min expiry (the `TODO Phase 2c` at
  `server.ts:1585-1588` is accurate).
- Change PIN: `POST /api/auth/change-pin` (`server.ts:935`), auth + `verifyPinLimiter`.
  Verifies old PIN, enforces 6-digit new PIN different from current + `previous_hashed_pin`,
  clears `must_change_pin`, nulls expiry, wipes plaintext `pin` (`server.ts:937-984`).

## 3. User model

- Prisma model `staff`: `prisma/schema.prisma:871-918`. Fields: `id`, `restaurant_id`
  (UUID, FK cascade), `name`, **`role` (String — free-text, NOT an enum)**, `pin`
  (plaintext column, still present), `hashed_pin`, `status`, `must_change_pin`,
  `pin_expires_at`, `previous_hashed_pin`, `locked_until`, `failed_login_count`.
- TS type `Staff`: `src/shared/types.ts:121-135`; `role: UserRole`.
- `UserRole` (`src/shared/types.ts:5`):
  `'ADMIN' | 'SUPER_ADMIN' | 'MANAGER' | 'CASHIER' | 'SERVER' | 'WAITER' | 'CHEF' | 'RIDER'`.
- `PLATFORM_OWNER`/`SUPPORT_ENGINEER`/`SUPPORT_AGENT` are **platform** roles, not
  tenant roles (see §5).

## 4. Restaurant / tenant creation

- `RestaurantProvisioningService.ts` (`src/api/services/onboarding/RestaurantProvisioningService.ts`):
  single `$transaction` creates the `restaurants` row (`onboarding_status:'SETUP_INCOMPLETE'`,
  `:60`), an owner `staff` as **`role:'MANAGER'`** with bcrypt-hashed CSPRNG 6-digit PIN,
  `must_change_pin:true`, `pin_expires_at` +7 days (`:70-85`), an `owner_invites` row
  (`:89-95`), default sections + tables (`:97-115`), `order_type_defaults` (`:117-131`),
  and `chart_of_accounts` (`:133-151`); enqueues outbox for cloud registration + invite
  (`:177-208`).
- `POST /api/restaurants` (provision, platform auth `PLATFORM_OWNER`) — `server.ts:883`.
- `POST /api/super-admin/restaurants/provision` (`superAdminRoutes.ts:170`, gated
  `requireRole('SUPER_ADMIN')` + `authMiddleware`).
- **Handover-once PIN exposure:** the provisioning response returns the plaintext
  temporary PIN once (`superAdminRoutes.ts:204`; service attaches it at
  `RestaurantProvisioningService.ts:214`), rendered by `ProvisionRestaurantModal.tsx:232,241`.
  By-design for the printable handover sheet, but an on-the-wire exposure surface
  mitigated only by SUPER_ADMIN role + TLS.
- Owner invite delivery: `OwnerInviteDispatcher.ts` (idempotent, UNKNOWN-reconcile,
  max 5 attempts), manual retry `POST /api/super-admin/owner-invites/:id/retry`
  (`superAdminRoutes.ts:252`).

## 5. Role hierarchy

Two distinct hierarchies — **do not conflate by name**:

```
Platform auth (platform_users.role, platformAuthMiddleware.ts):
  PLATFORM_OWNER   (SaaS operator / FireFlow HQ)
    ├── SUPPORT_ENGINEER
    └── SUPPORT_AGENT

Tenant auth (staff.role free-text, authMiddleware requireRole):
  SUPER_ADMIN  (FireFlow-employee "Vault" role; can retarget tenants — see §7/TD-13)
    └── ADMIN
        └── MANAGER
            ├── CASHIER
            ├── SERVER / WAITER
            ├── CHEF
            └── RIDER
```

Key clarifications:

- There is **no `OWNER` tenant role.** The provisioning flow creates the owner as
  `role:'MANAGER'` (`RestaurantProvisioningService.ts:77`). `restaurants.owner_id`
  exists (`schema.prisma:726`) but is unused by auth.
- **`SUPER_ADMIN` is a tenant-level role** on `staff`, NOT a platform role. It is the
  FireFlow-employee/Vault role that may retarget any restaurant via the
  `x-target-restaurant` header (`authMiddleware.ts:196-220`).
- **`PLATFORM_OWNER`** is the SaaS operator (Supabase/`platform_users`), used for
  `/api/restaurants` create/delete (`server.ts:883, 1286`).
- Roles checked via `requireRole(...)` (`authMiddleware.ts:284-309`, case-insensitive);
  `requirePlatformRole` for platform (`platformAuthMiddleware.ts:70-91`).
- **Gap:** there is **no route to create a `SUPER_ADMIN` staff row** — must be inserted
  directly into `staff`. (Seed route creates `ADMIN`, `server.ts:4152`.)
- **Gap:** `POST /api/platform/auth/create-account` (`server.ts:3110`) **cannot create
  `PLATFORM_OWNER`** (`PlatformAuthService.ts:105-107`); the first `PLATFORM_OWNER` must
  be seeded directly in DB.

## 6. Existing onboarding flow

- **Server gate (authoritative):** `authMiddleware.ts:222-247` restricts actors to an
  allowlist (`/api/auth/refresh`, `/api/auth/logout`, `/api/auth/change-pin`,
  `/api/onboarding`, GET own restaurant profile) when `must_change_pin` OR tenant
  `onboarding_status==='SETUP_INCOMPLETE'`. `SUPER_ADMIN` + active support sessions
  bypass. Client cannot disable it.
- `onboarding_status` values in code: **`SETUP_INCOMPLETE`** and **`ACTIVE`** only
  (`schema.prisma:749` default `ACTIVE`; provisioning sets `SETUP_INCOMPLETE`;
  transition via `POST /api/onboarding/complete` `server.ts:1104-1107`).
- Client wizard: `src/features/onboarding/FirstLoginWizard.tsx` (rendered in place of
  the shell while forced-PIN/setupt-incomplete; `App.tsx:1045-1065`). Step derivation
  `wizardLogic.ts:deriveWizardSteps` (change_pin → profile → review); profile/review
  skipped if tenant already `ACTIVE` (F-V6). PINs memory-only in React state, cleared
  on step change/unmount (`FirstLoginWizard.tsx:80-87`), never logged/URLed.
- `GET /api/onboarding/status` (`server.ts:1008`) →
  `{onboarding_status, requirements:{pin_change_required, profile_fields:{name,address,phone}}}`.
- `PATCH /api/onboarding/profile` (`server.ts:1042`) — `requireRole(MANAGER,ADMIN,SUPER_ADMIN)`,
  allowlisted fields `name/address/phone` only (`server.ts:1044-1053`).
- `POST /api/onboarding/complete` (`server.ts:1085`) — `requireRole(MANAGER,ADMIN,SUPER_ADMIN)`;
  refuses if `must_change_pin` (`server.ts:1091-1093`); requires name ≥2 chars
  (`server.ts:1101-1103`); transactional `SETUP_INCOMPLETE→ACTIVE`, idempotent (409 on
  replay, `server.ts:1104-1110`).
- Operations config: `GET /api/operations/config/:restaurantId` (`server.ts:1644`),
  `GET /api/operations/order-settings` (`server.ts:1801`) — both authenticated, scoped to
  `req.restaurantId`; PATCH enforces `req.restaurantId !== target → 403` (`server.ts:1742`).
- **No first-run "Business Setup" step exists today** — onboarding = mandatory PIN change
  + restaurant profile completion (`name`/`address`/`phone`). Tables/staff/menu are NOT
  part of the wizard (they are created by provisioning seed or added later via the app).
  This means a new restaurant lands directly in the shell after profile completion —
  which is close to the desired "Your restaurant is ready. Configure the rest later." but
  is not yet a guided, skippable setup.

## 7. Security gaps

### 7.1 CRITICAL — unauthenticated write: `PATCH /api/orders/:id/guest-count`
- `src/api/server.ts:3161`. Has **no `authMiddleware`**, **no `requireRole`**.
- Reads `staffId` from the **`x-staff-id` client header** (`server.ts:3164`) and uses
  `req.restaurantId` (`:3173`), which will be **`undefined`** without auth.
- An unauthenticated caller can mutate guest counts and spoof a staff id.
  **TD-12-class anonymous write exposure. Highest-confidence finding.**
- Proposed remediation (for M034-D): attach `authMiddleware` + `requireRole` and source the
  actor from the JWT, not a client header.

### 7.2 Cross-tenant binding (TD-13 area)
- `x-target-restaurant` header lets `SUPER_ADMIN` override `req.restaurantId` to any
  tenant (`authMiddleware.ts:196-220`). Intentional + audited
  (`SUPER_ADMIN_TARGET_RESTAURANT`) but **deprecated/ transitional** (`:194`) and the
  tenant override originates from a **client header** — the TD-13 concern.
- `supportSessionMiddleware.ts:43` sets `req.restaurantId = session.restaurant_id`
  directly (server-issued session record = correct trust model); JWT bridge at
  `authMiddleware.ts:187-189` makes support-session win. **Verify support-session
  issuance is tightly controlled** (not read here — follow-up).

### 7.3 Other gaps
- No access-token blacklist; logout revokes refresh tokens only (§2).
- `staff.pin` plaintext column still present in schema (`schema.prisma:876`), written `''`
  everywhere; legacy fixtures still reference plaintext pins
  (`constants.ts:115-121`, `businessLogic.ts:219-220`).
- `JwtService.verifyToken` does not enforce `alg` (§2).
- `env.ts:113-115` copies `FIREFLOW_JWT_SECRET→JWT_SECRET`; `JWT_EXPIRY`/`JWT_REFRESH_EXPIRY`
  (`env.ts:20-21`) are parsed but **not consumed by JwtService** (hardcoded 15 min) — dead config.
- `env.ts` JWT secret schema is optional (only the 32-char/production check in
  `JwtService.ts` enforces strength).
- `/api/system/dev-reset` (`server.ts:3189`) allows `MANAGER` **or** `SUPER_ADMIN`
  (`:3194`) to wipe all order/table data for a tenant.
- `/api/system/reset-environment` (`server.ts:4174`) is `requireRole('SUPER_ADMIN')`,
  scoped to `req.restaurantId` — safe but powerful.
- Client views gate on `currentUser.role` alone (`SettingsView.tsx:45,83-84`;
  `StaffView.tsx:339`; `OrdersView.tsx:342`; inventory views) — UI hygiene only; writes
  are server-gated. Not a standalone vuln, but note FBR sync is
  `requireRole('MANAGER','ADMIN')` only (`fbrRoutes.ts:94,114,252`) — SUPER_ADMIN not
  listed.
- **No plaintext PINs / tokens logged** in auth paths; `hashed_pin`/`pin` stripped at
  `server.ts:1171,1218,3715`; JWT secret never logged. Temporary PIN returned over the wire
  by design (§4) but not logged.

## 8. Missing pieces

1. **No `OWNER` tenant role**; owner is provisioned as `MANAGER`.
2. **No route to create a `SUPER_ADMIN` staff row**; must be DB-inserted.
3. **No route to create a `PLATFORM_OWNER`** (first one DB-seeded only).
4. **No first-run business-setup wizard** with skippable tables/staff/menu/inventory
   steps (current wizard = PIN change + profile only).
5. **No access-token revocation** (logout is refresh-token only).
6. **Unauthenticated `PATCH /api/orders/:id/guest-count`** (§7.1) — must be back-filled
   with `authMiddleware` + `requireRole`.
7. **Custom JWT implementation** (not a library) + no `alg` enforcement — maintenance
   surface.
8. **Dead config** `JWT_EXPIRY`/`JWT_REFRESH_EXPIRY` in `env.ts`.

## 9. Recommended target flow

```
Landing / Login
   ↓  (no restaurant exists?)
Create Restaurant           →  RestaurantProvisioningService (idempotent by slug?)
   ↓
Create Owner Account        →  role: 'OWNER' (NEW tenant role), bcrypt PIN, must_change, +7d expiry
   ↓
Restaurant Profile          →  name, address/city, currency, timezone
   ↓
Basic Setup Complete        →  ONBOARDING_COMPLETE (server-authoritative)
   ↓
[OPTIONAL, SKIPPABLE]       →  tables · staff · menu · inventory · taxes · printers · payments
   ↓
"Your restaurant is ready. Configure the rest later."
   ↓ (LOGIN)
Dashboard → Open Table → Take Order → Send to Kitchen → KDS → Served
  → Inventory Consumption → COGS Journal → Payment → Finance/Reporting
```

Target state changes implied:

- Introduce a **tenant `OWNER` role** distinct from `SUPER_ADMIN` (FireFlow employee) and
  `ADMIN` (restaurant manager). `SUPER_ADMIN` stays a FireFlow-employee/Vault role.
- Make `RestaurantProvisioningService` create the owner as `OWNER` (currently `MANAGER`).
- Add provisioning routes gated to `PLATFORM_OWNER` for `SUPER_ADMIN` staff and first
  `PLATFORM_OWNER` (remove the DB-seed bootstrap requirement).
- Add a **setup wizard** for optional steps (tables/staff/menu/inventory) with
  explicit skip + resume-from-onboarding-status.
- Back-fill `authMiddleware` on `PATCH /api/orders/:id/guest-count` and similar.
- Harden JWT: use a vetted library or enforce `alg`; make the JWT secret required in
  production; remove dead `JWT_EXPIRY` config.
- Environment structure (per your proposal): `fireflow_local` →
  `fireflow_verify` → `fireflow_demo` → `fireflow_production`, with the release gate
  refusing destructive tests against non-disposable DBs (TD-14 control).

## Contradictions vs. docs

| Doc claim | Verified reality |
|---|---|
| AGENTS.md: "not all routes in server.ts are authenticated" | **Confirmed.** `PATCH /api/orders/:id/guest-count` (`server.ts:3161`) has no auth. |
| AGENTS.md: "openapi.json may lag" | Not fetched; JWT impl + opaque refresh tokens mean any spec describing JWT refresh is stale. |
| AGENTS.md: "AI features may be unimplemented" | Out of scope (not audited). |
| `JwtService.ts` doc "Generate refresh tokens (7 days)" | **Stale.** Opaque DB refresh tokens via `RefreshTokenService`. |
| `server.ts:1468` TODO "Implement token rotation" | **Outdated.** Rotation implemented (`RefreshTokenService.ts:87-147`). |
| AGENTS.md invariant: "tenant context from trusted auth/server state, never client hints" | **Partially violated.** `x-target-restaurant` header (`authMiddleware.ts:196-220`) is a client hint used to retarget tenant for SUPER_ADMIN — intentional, audited, deprecated. |

## Unknown / unverified (follow-up)

- **Support-session issuance** (`supportSessionMiddleware.ts` / `SupportSessionService.ts`) —
  trust model for `req.restaurantId = session.restaurant_id` depends on how strictly
  sessions are created/administered.
- **OpenAPI spec accuracy** — not fetched/compared.
- **AI gateway routes** — existence & implementation not verified.
