# Audit: Device System (Task 07a, READ-ONLY)

Date: 2026-10-02. Author: engineering agent. Scope: existing device, pairing, PIN-trust and KDS
code. No source file, schema or migration was modified. No test, seed or DB write was run.

Notes on inputs: `docs/AGENT_HANDOFF.md` and `docs/DEVICES_ROLES_DESIGN.md` do **not** exist in the
repository (both were supplied as pasted text); findings below were produced from the code, schema,
migrations and the existing `docs/DEVICE_PAIRING_*.md` (marked HISTORICAL in `docs/legacy/README.md:23`).

---

## 1. `registered_devices` — what it represents today

Represents **licensing / pairing-session devices**, not tenant authentication trust (comment in
`prisma/schema.prisma:637-638`). It is the older of the two device models.

Columns (`prisma/schema.prisma:639-664`):

| Column | Type / default | Line |
|---|---|---|
| `id` | `String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid` | `schema.prisma:640` |
| `restaurant_id` | `String @db.Uuid` NOT NULL | `:641` |
| `staff_id` | `String @db.Uuid` NOT NULL | `:642` |
| `device_name` | `VarChar(100)?` | `:643` |
| `device_fingerprint` | `VarChar(255)?` | `:644` |
| `user_agent` | `TEXT?` | `:645` |
| `platform` | `VarChar(50)?` | `:646` |
| `auth_token_hash` | `VarChar(100)` NOT NULL — bcrypt(12) device token hash | `:647` |
| `is_active` | `Boolean @default(true)` — the only "revoked" signal | `:648` |
| `last_sync_at` | `DateTime?` (closest thing to last-seen) | `:649` |
| `pairing_code_id` | `Uuid?` | `:650` |
| `created_at` / `updated_at` | `Timestamp(6)`; `updated_at` has **no** default and no `@updatedAt` | `:651-652` |
| `expires_at` | `DateTime?` | `:653` |
| `station_id` | `Uuid?` (added later, unused by code) | `:654` |

Relations: `pairing_codes?` (`:655`), `restaurants` Cascade (`:656`), `staff` Cascade (`:657`),
`stations?` (`:658`). Indexes: `@@unique([restaurant_id, staff_id, device_fingerprint])` (`:660`),
`@@index([is_active])` (`:661`), `@@index([restaurant_id])` (`:662`), `@@index([staff_id])` (`:663`).

Created by `prisma/migrations/20260120_add_registered_devices_security/migration.sql:32-57`.
Altered by `20260322100000_reconcile_v3_and_credit_fields/migration.sql:84-86` (added `expires_at`,
retyped `last_sync_at`, dropped `updated_at` default) and `20260816071149_add_qr_order_type/migration.sql:33,39`
(added `station_id` FK, `ON DELETE SET NULL`).

**No lifecycle column**: no `status`, `PENDING`, `approved_by`, `revoked_at` or `last_seen_at`.

**`auth_token_hash` is write-only**: the only references are the writes at
`src/api/services/pairing/PairingService.ts:260,279` and the schema line. No code ever validates it,
and the raw token is returned to the client once and then never checked again
(`PairingService.ts:212` generate → bcrypt at `:213` → response `auth_token` at `src/api/server.ts:4715`).
There is no token-validation endpoint (`/api/devices/validate-token` claimed in
`docs/DEVICE_PAIRING_PHASE_2A2_COMPLETE.md:225` does not exist).

---

## 2. `staff_devices` — what it represents today

Represents **tenant-authentication trust**: "this staff member has used a full credential login on this
browser, therefore PIN fast-auth is allowed here" (comments `prisma/schema.prisma:717-718`,
`src/api/services/auth/StaffDeviceService.ts:9-11`). Deliberately *not* the same thing as
`registered_devices`.

Columns (`prisma/schema.prisma:719-734`): `id` (`:720`), `staff_id` NOT NULL (`:721`), `restaurant_id`
NOT NULL (`:722`), `device_fingerprint VarChar(255)?` (`:723`), `device_name VarChar(100)?` (`:724`),
`last_used_at` (`:725`), `created_at`/`updated_at` (`:726-727`). Relations: `staff` Cascade (`:728`),
`restaurants` Cascade (`:729`). Constraints: `@@unique([staff_id, device_fingerprint])` (`:731` —
note: **no `restaurant_id`** in the key), `@@index([restaurant_id])` (`:732`), `@@index([staff_id])` (`:733`).

Created by `prisma/migrations/20260904010000_m035_staff_device_binding/migration.sql:3-18`; FKs re-pointed
to `ON DELETE CASCADE ON UPDATE CASCADE` in
`prisma/migrations/20261001080100_financial_fk_hardening_and_drift_cleanup/migration.sql:139-145`.

No status, no `revoked_at` (revocation is a hard `deleteMany`, `StaffDeviceService.ts:62-68`), no
`last_seen_at`, no per-device attempt counter.

---

## 3. What the M035 device-binding work implemented

Commit `b1e0dbe feat(tenant): add device binding and trusted device fast-auth (M035-Phase2-C)`.

1. `staff_devices` table + unique `(staff_id, device_fingerprint)` + indexes —
   `prisma/migrations/20260904010000_m035_staff_device_binding/migration.sql:1-18`.
2. `StaffDeviceService`: `normalize` (`:16`, requires `/^[a-f0-9]{64}$/i`), `isTrusted` (`:24`),
   `trust` (`:30`), `touch` (`:47`), `list` (`:54`), `revoke` (`:62`, hard delete) —
   `src/api/services/auth/StaffDeviceService.ts`.
3. Login gate: PIN mode is refused with `403 DEVICE_NOT_TRUSTED` unless the device is trusted —
   `src/api/controllers/AuthController.ts:341-347`, before the PIN is ever compared.
4. Enrollment on successful full-credential login: staff password (`:370-371`) and owner session
   issuance (`:690-692`); invariant comment at `:368-369`.
5. List/revoke API: `GET`/`DELETE /api/auth/staff/:staffId/devices[/:deviceId]`
   (`src/api/server.ts:610-611` → `AuthController.listDevices` `:739`, `revokeDevice` `:760`,
   audit `STAFF_DEVICE_REVOKED` `:777`); self or MANAGER/ADMIN/SUPER_ADMIN only (`:739-757`).
6. Client fingerprint: `getTrustedDeviceFingerprint()` = SHA-256 over `deviceId|userAgent|W|H|tz`,
   seeded by a persistent random UUID in `localStorage['fireflow-device-id']` —
   `src/shared/lib/deviceFingerprint.ts:1,13-23`; sent on login (`src/auth/views/LoginView.tsx:111`).
7. UI: per-staff trusted device list + revoke in `src/features/settings/StaffView.tsx:290,306-323`.
8. Type `StaffDevice` — `src/shared/types.ts:798-803`; unit test `StaffDeviceService.test.ts:5,12`.

---

## 4. Device tokens / identifiers: generation, storage, hashing

**Licensing/pairing token** (registered_devices):
- Generated `crypto.randomBytes(32).toString('hex')` — `src/api/services/pairing/PairingService.ts:212`.
- Hashed bcrypt(12) — `:213`; stored in `registered_devices.auth_token_hash` (`:260,279`).
- Delivered once in the HTTP response body as `auth_token` (`src/api/server.ts:4715`) — **no cookie**,
  no session, no subsequent validation. A `sessionJwt` is created at `PairingService.ts:221-227` and
  discarded by the route (`server.ts:4694`).
- Client storage, plaintext: `localStorage['deviceAuthToken']` and `localStorage['deviceId']` —
  `src/auth/views/DevicePairingVerificationView.tsx:80-81`; Electron path uses `electron-store` keys
  `deviceAuthToken` / `deviceId` (`:76-77`) with a **hardcoded** store encryption key
  `'fireflow-secret-key-2026'` at `electron-main.cjs:11`. (Historical docs claim keytar/httpOnly cookie:
  `docs/DEVICE_PAIRING_QUICK_REF.md:173-176` — false.)
- Fingerprint used by this flow is a weak 32-bit DJB2-style hash rendered as hex —
  `src/shared/lib/deviceFingerprint.ts:4-10` (the comment at `DevicePairingVerificationView.tsx:46`
  claims SHA-256; it is not).

**PIN-trust identifier** (staff_devices): no secret at all — a SHA-256 device fingerprint stored
**in plaintext** (`staff_devices.device_fingerprint`), compared for equality
(`StaffDeviceService.ts:24-28`). It is an identifier, not a credential.

**Pairing code**: 6 uppercase hex chars from `crypto.randomBytes(4)` (`PairingService.ts:58`); stored
**both** plaintext (`pairing_codes.pairing_code`, `PairingService.ts:70`, `schema.prisma:539`) and
bcrypt-12 hashed (`:59,71`, `schema.prisma:542`); embedded in the QR URL in plaintext (`:86`).

**Other client-side identifiers**: `localStorage['trusted-pin:<email>']` UI hint only
(`LoginView.tsx:57,126,166`), `localStorage['x-terminal-id']` (`authInterceptor.ts:119`), owner refresh
cookie `ff_user_refresh` (Task 03, not a device credential), `localStorage.fireflow_token` read at
`src/operations/kds/KDSView.tsx:397` but **never written anywhere** (pre-existing bug).

---

## 5. Registration, approval, revocation today

- **Register**: manager/owner authenticates and calls `POST /api/pairing/generate`
  (`server.ts:4580`, `authMiddleware`, `pairingGenerateLimiter` 5/min) → `PairingService.generatePairingCode`
  (`:36`); code expires in 15 min (`:25,61`), attempt cap 5 (`:26,168-174`), fingerprint stickiness after
  the first attempt (`:179-189`), expired rows deleted by a 5-minute interval job (`:320-334`, `server.ts:4791`).
- **Complete**: `POST /api/pairing/verify` (`server.ts:4639`, **no auth**, 10/min per IP) →
  `verifyPairingCode` (`:129`) inserts a `registered_devices` row with `is_active: true` and
  deactivates the staff's previous sessions (`:232-239,260`).
- **List / revoke**: `GET /api/pairing/devices` (`server.ts:4740` → `listPairedDevices`
  `PairingService.ts:339-357`, filtered `is_active: true`), `DELETE /api/pairing/devices/:deviceId`
  (`server.ts:4763` → `disableDevice` `PairingService.ts:366-390`, sets `is_active = false`,
  audits `DEVICE_PAIR`).
- **Staff-device trust**: granted silently by a successful password/owner login, revoked by
  `DELETE /api/auth/staff/:staffId/devices/:deviceId` (hard delete).

**Pending / approval state: not present.** A pairing code immediately yields an `is_active = true`
device — usable credential, no human approval. `pairing_codes.is_used` only prevents code reuse;
`staff_devices` has no state at all (existence == trust). The M035 comment explicitly forbids treating
pairing as trust (`StaffDeviceService.ts:9-11`), so the two models are genuinely unlinked.

Dead client code: `src/features/settings/DeviceManagementView.tsx:26,42` calls `GET /api/devices` and
`DELETE /api/devices/:id`, which do not exist; `DevicePairingVerificationView` is unreachable because
`setShowDevicePairing` is only ever set to `false` (`src/client/App.tsx:995,1041,1045`);
`/api/pairing/generate` ignores `targetStaffId`/`durationHours` and drops `qr_payload`
(`server.ts:4602-4616`, UI expects it at `src/features/settings/QRCodePairing.tsx:121,166`).

---

## 6. PIN login and devices

PIN mode is refused unless the device is already trusted — `src/api/controllers/AuthController.ts:341-347`:

```ts
if (!device || !await this.staffDeviceService.isTrusted(staff.id, staff.restaurant_id, device.fingerprint)) {
  res.status(403).json({ error: 'PIN login is only permitted on paired, trusted devices...', code: 'DEVICE_NOT_TRUSTED' });
  return;
}
```

- A missing or malformed `device_fingerprint` yields `normalize() === null` (`StaffDeviceService.ts:16-17`)
  → `!device` → 403. **PIN without a trusted device is impossible today.**
- The gate runs before PIN comparison (`:349-365`), so it is not a credential oracle.
- Rate limiting: `loginLimiter` 5/15min per IP (`server.ts:559-570,601`), in-controller 5/15min per email
  (`AuthController.ts:226-236`), staff account lockout 5 failures → 30 min (`:296-301,356-361`).
  **No per-device limit or counter** exists.
- The client `trusted-pin:<email>` flag (`LoginView.tsx:57`) is a UI affordance only; the server never
  reads it.

---

## 7. Electron identification and sync-agent

- `electron/main.ts:18-67` forks `server.cjs`, creates a `BrowserWindow` with `contextIsolation: true`,
  `nodeIntegration: false`, `webSecurity: false`, and `preload.js`. It injects **no** device id,
  fingerprint or token and no auth headers.
- `electron-main.cjs:6-37` exposes only an electron-store IPC bridge (`store-get`/`store-set`/`store-delete`,
  hardcoded `encryptionKey` at `:11`); the rest of the file is printer handling (`:40+`).
- Device identity therefore comes only from the renderer (localStorage + userAgent/screen/timezone) and is
  sent as `device_fingerprint` in the JSON body (`LoginView.tsx:111`,
  `DevicePairingVerificationView.tsx:282`).
- `sync-agent/` is unrelated to pairing: `sync-agent/index.js:1-43` boots a Prisma client, an ioredis
  connection, a BullMQ queue (`sync-queue`) and a 10-second heartbeat — no workers, no device logic.
  Plus `package.json`, `package-lock.json`, `Dockerfile`, `docker-compose.yml`.

---

## 8. Existing routes, services and middleware for devices

Routes (all inline in `src/api/server.ts`; nothing in `src/api/routes/*` except the staff-device pair):

| Method | Path | Line | Auth |
|---|---|---|---|
| POST | `/api/pairing/generate` | `server.ts:4580` | `authMiddleware` + limiter (`:4557-4563`) |
| POST | `/api/pairing/verify` | `server.ts:4639` | **none** + limiter (`:4565-4571`) |
| GET | `/api/pairing/devices` | `server.ts:4740` | `authMiddleware` (stale TODO at `:4738`) |
| DELETE | `/api/pairing/devices/:deviceId` | `server.ts:4763` | `authMiddleware` |
| GET | `/api/auth/staff/:staffId/devices` | `server.ts:610` → `AuthController.ts:739` | `authMiddleware` + role |
| DELETE | `/api/auth/staff/:staffId/devices/:deviceId` | `server.ts:611` → `AuthController.ts:760` | `authMiddleware` + role |
| POST | `/api/auth/verify-pin` | `server.ts:1338` | `authMiddleware` (second-person PIN oracle, action-agnostic) |

Services: `src/api/services/pairing/PairingService.ts` (`:36,129,320,339,366`),
`src/api/services/auth/StaffDeviceService.ts` (`:16,24,30,47,54,62`), `AuthController` wiring
(`:9,39,49,250,341,371,609,690,739,760`). Middleware: only the generic `authMiddleware`
(`src/api/middleware/authMiddleware.ts`) — **there is no device-auth middleware and no device-token
verification anywhere**. Unused: `src/api/schemas/pairingSchemas.ts:3`. Client:
`src/features/settings/QRCodePairing.tsx`, `DeviceManagementView.tsx` (dead),
`DevicePairingVerificationView.tsx` (unreachable), `StaffView.tsx:290`.

---

## 9. KDS authentication and station routing

- **Authentication**: ordinary person login — `KDSView` uses `fetchWithAuth` with the tenant access token
  (`src/operations/kds/KDSView.tsx:5`; `authInterceptor.ts:60-71`) and the shared `fetchInitialData`
  (`KDSView.tsx:8,97`). No device token, no PIN, no KDS-specific credential.
- **Routing**: `order_items.station_id` (`schema.prisma:419`, legacy text `station` at `:429`), populated
  in `src/api/services/orders/BaseOrderService.ts:90,409,771` and `src/operations/pos/POSView.tsx:116,425,517`.
  All station filtering is **client-side**: `KDSView.tsx:15-19` (`isItemForStation`, with a name fallback
  that can match a mismatched id), `:22-30`, `:41-52` (`'ALL'` short-circuit), `:414-418`.
- **Realtime**: no `order:created`; a single `db_change` socket event bound at
  `src/shared/lib/socketClient.ts:72-75`, consumed at `src/client/App.tsx:405`, room `restaurant:<id>`
  (`App.tsx:393`, authorized `server.ts:268-289`), emitted by `src/api/routes/orderWorkflowRoutes.ts:74-80,157,261-278`.
  Safety net: 15s refetch (`KDSView.tsx:93-100`).
- **Server enforcement**: none beyond restaurant scope. `GET /api/orders` filters only on `restaurant_id`
  and returns every station's items (`server.ts:3895-3923`, `?station_id=` from `App.tsx:134` is ignored);
  `PATCH /api/orders/:orderId/items/:itemId/status` (`orderWorkflowRoutes.ts:213-305`) checks only
  order/tenant (`src/api/services/OrderWorkflowService.ts:321-327,420-431`). Any authenticated user of
  the restaurant can read and bump every station.

---

## 10. Existing audit trail for device / override events

`audit_logs.action_type` (`schema.prisma:33-51`) is free text; device-relevant rows actually written:
`DEVICE_PAIR` (`PairingService.ts:94,293,389`), `STAFF_DEVICE_REVOKED` (`AuthController.ts:777`),
plus auth/lockout rows `STAFF_LOGIN` (`AuthController.ts:404`), `USER_LOGIN` (`:704`), `STAFF_LOGIN_FAILED`
(`server.ts:1390,1438,1453`), `STAFF_LOCKED` (`:1416`), `STAFF_PIN_CHANGED` (`:917`),
`ORDER_PAYMENT_OVERRIDE` (`server.ts:2445-2454`), `KITCHEN_GATE_BLOCKED` (`:2414-2429`),
`MANAGER_APPROVE_SKIP`/`MANAGER_DENY_SKIP` (`OrderWorkflowService.ts:554`).

Gaps: device **enrolment** is not audited (`AuthController.ts:370-371,690-692`) and `DEVICE_NOT_TRUSTED`
rejections are not audited (`:342-346`). There is **no `device_audit` table** and no device_id column on
`audit_logs`. `security_events` (`schema.prisma:936-947`) has **no write path at all** (only a
read-blocklist entry at `server.ts:4929`). Manager override exists only partially: skip/void approval
requires no PIN and does not require a distinct approver (`orderWorkflowRoutes.ts:323-381`,
`OrderWorkflowService.ts:467-617`), the kitchen-gate override compares the caller's own PIN
(`server.ts:2410`), and `src/operations/kds/components/ManagerApprovalModal.tsx` — which collects a
manager PIN — is **never rendered** and its own comments admit the PIN is not validated
(`:76-77,220`). Client type `src/lib/auditLog.ts:9-21` has drifted from the values written server-side.

---

## Gap table (design requirement → reality)

| Design requirement (`DEVICES_ROLES_DESIGN.md`) | State | Files | Effort |
|---|---|---|---|
| Device lifecycle `PENDING → ACTIVE → REVOKED` | **Missing** (only `is_active`, `is_used`) | `schema.prisma:639-664,719-734`; `PairingService.ts:232-239,379`; `StaffDeviceService.ts:62` | S (add status columns) |
| Single-use hashed pairing codes | **Partial**: bcrypt hash + `is_used` + 15-min expiry + 5 attempts, but plaintext code also stored and put in the QR URL | `PairingService.ts:58-86,163-198`; `schema.prisma:536-554` | S (drop plaintext column/column type) |
| Approval step (manager approves PENDING) | **Missing** — pairing yields an active device immediately | `server.ts:4639-4738`; `PairingService.ts:129-303` | M |
| Revocation | **Partial**: soft `is_active=false` for pairing devices; hard delete for staff devices; no permanent `revoked_at`, no re-pair rule | `PairingService.ts:366-390`; `AuthController.ts:760-779` | S |
| Device token that actually authenticates | **Missing** — `auth_token_hash` is write-only, no validation endpoint/middleware | `PairingService.ts:212-213,260,279`; `server.ts:4694-4715` | M |
| Device-bound PIN (PIN only on paired ACTIVE device) | **Exists** for staff_devices (M035), but trust is implicit and granted by any full login, not by pairing | `AuthController.ts:341-347,368-374`; `StaffDeviceService.ts` | S (link to lifecycle) |
| Device type (POS/KDS/printer/rider) + capabilities | **Missing** — no type column or enum anywhere | `schema.prisma:1198-1749` (no device enum); `registered_devices.station_id` unused | M |
| Station scope for KDS | **Missing server-side**; client-side filter only | `KDSView.tsx:15-52`; `server.ts:3895-3923`; `OrderWorkflowService.ts:321-327` | M |
| Manager override (second person's PIN, audited) | **Missing / unsafe**: skip-approval needs no PIN and allows self-approval; modal unrendered | `orderWorkflowRoutes.ts:323-381`; `OrderWorkflowService.ts:467-617`; `ManagerApprovalModal.tsx` | L |
| Last-seen heartbeat | **Missing** — `registered_devices.last_sync_at` and `staff_devices.last_used_at` are the only candidates, neither updated on normal requests | `schema.prisma:649,725`; `StaffDeviceService.ts:47-52` | S |
| Per-device PIN lockout / rate limit | **Missing** (IP + email + per-staff only) | `server.ts:559-583`; `AuthController.ts:226-236,356-361` | S |
| Device audit trail (`device_audit`) | **Missing**; `audit_logs` has device rows but no device_id and no approval/enrolment events | `audit_logs` `schema.prisma:33-51`; `AuthController.ts:342-347,370-371` | S (extend audit_logs) |
| KDS device-only mode (no person login) | **Missing** — KDS requires a staff/owner login | `KDSView.tsx:5,8` | M (needs a working device token) |
| Owner remote view (no pairing) | **Exists** — Task 03 owner login needs no device | `AuthController.ts:548,609,690` | — |
| QR customer sessions never get device privileges | **N/A today** (QR ordering has no device credential) | — | — |

---

## Minimum extension plan (reuse, do not fork)

Do **not** add a `devices` table. Extend `registered_devices` and retire its write-only token path, and
treat `staff_devices` as the PIN-trust projection of a `registered_devices` row.

1. **Lifecycle on `registered_devices`** (one migration, additive):
   - `status String @default("PENDING")` with values `PENDING | ACTIVE | REVOKED` (Prisma enum or CHECK).
     Mapping to existing columns: `status == 'ACTIVE'` ⇔ today `is_active = true` (`:648`);
     `status == 'REVOKED'` is the new permanent tombstone replacing soft `is_active = false`.
   - `approved_by UUID?` (staff), `approved_at DateTime?`, `revoked_at DateTime?`, `revoked_by UUID?`
     — new, no existing column maps; `pairing_codes.used_by` (`:544`) is the *generator*, not the approver.
   - `last_seen_at DateTime?` — rename/extend `last_sync_at` (`:649`) rather than adding a second
     heartbeat column; keep `last_sync_at` for sync-agent semantics or migrate it.
   - `device_type String?` — `registered_devices.station_id` (`:654`) already links to `stations` and is
     unused, so keep it and add a type discriminator (`POS | MANAGER_CONSOLE | WAITER | KDS | EXPO |
     PRINTER | RIDER`).
   - `paired_by` is already `staff_id` (`:642`); no new column needed.
2. **Make `pairing_codes` create PENDING, not ACTIVE devices**: `/api/pairing/verify`
   (`server.ts:4639`) inserts `status = 'PENDING'`; add `POST /api/pairing/devices/:id/approve` guarded by
   `requireRole(MANAGER/ADMIN/OWNER)` that flips it to ACTIVE. Reuse `pairing_codes` as the
   `device_pairing_codes` of the design: it already has `expires_at`, `is_used`, `attempt_count`,
   `hashed_code` — only `code_hash` naming and the stored plaintext column differ.
3. **Turn `auth_token_hash` into the real credential**: add a `deviceAuthMiddleware` that hashes the
   incoming device token (bcrypt compare against `auth_token_hash`) and resolves
   `{ restaurant_id, staff_id, device_type, station_id, status }`. Deliver it as an httpOnly cookie
   (`ff_device`, `SameSite=Lax`, `Secure` in production, `Path=/`) mirroring
   `USER_REFRESH_COOKIE` from Task 03 (`AuthController.ts:687`) instead of
   `localStorage['deviceAuthToken']` (`DevicePairingVerificationView.tsx:80`). Store SHA-256 (not bcrypt)
   if device tokens must be looked up per request; bcrypt is fine if lookup is by device id from the
   cookie pair. Never validate a REVOKED device.
4. **Fold `staff_devices` into the same lifecycle** rather than adding a third model: keep the table
   (M035 behaviour, unique `(staff_id, device_fingerprint)`, `AuthController.ts:341-347` gate) but add
   `device_id UUID?` FK to `registered_devices`, and make revocation there set the parent to REVOKED so a
   PIN stop cannot be bypassed by re-pairing. Flag: this **changes M035 semantics** — today a password
   login silently re-enrols any fingerprint (`:370-371`), which would silently re-activate a revoked
   device unless enrolment is blocked while the parent status is REVOKED. Also fix the unique key to
   include `restaurant_id` (`schema.prisma:731`) in the same migration if data allows.
5. **Station scope for KDS** (Task 08, listed here for completeness): `registered_devices.station_id`
   already exists — enforce it in `GET /api/orders` (`server.ts:3895-3923`, honour the ignored
   `?station_id=`) and in `PATCH /api/orders/:orderId/items/:itemId/status`
   (`orderWorkflowRoutes.ts:213-305`): a KDS device may mutate only items of its own `station_id`;
   "All kitchen" is read-only. No new tables.
6. **Audit**: add `device_id UUID?` to `audit_logs` and emit `DEVICE_PAIRED`, `DEVICE_APPROVED`,
   `DEVICE_REVOKED`, `DEVICE_PIN_ENROLLED`, `DEVICE_NOT_TRUSTED`, `DEVICE_LAST_SEEN` — this replaces the
   proposed `device_audit` table without duplicating it. Also fix the drifted client union
   `src/lib/auditLog.ts:9-21`.
7. **Manager override**: reuse `POST /api/auth/verify-pin` (`server.ts:1338`) but bind its result to a
   single action (short-lived, single-use token carrying `restaurant_id, device_id, action,
   resource_id`), require the approver to differ from the actor, and audit
   `restaurant/device/original actor/approver/action/resource/amount/time` as the design requires.

**Do not duplicate**: pairing code generation/expiry/attempt limits (`PairingService.ts`), the M035
PIN trust gate (`AuthController.ts:341`), `staff_devices`, the `staff_id`-scoped device list/revoke UI
(`StaffView.tsx:290`), and the owner `user_sessions` refresh cookie pattern.

**Must be replaced (not extended)**: the write-only `auth_token` + `localStorage` storage
(`DevicePairingVerificationView.tsx:76-81`), the plaintext `pairing_codes.pairing_code`
(`PairingService.ts:70`), and the hardcoded electron-store key (`electron-main.cjs:11`). All three are
security defects the new design must fix rather than build on.

---

## Risks

1. **Currently paired devices would break.** `disableDevice` sets `is_active = false`
   (`PairingService.ts:379`); migrating to a `status` column must backfill
   `status = CASE WHEN is_active THEN 'ACTIVE' ELSE 'REVOKED' END` or every paired device silently
   becomes unusable. Un-revoked rows must also be forced through approval or grandfathered as ACTIVE.
2. **Revocation semantics change.** Today `staff_devices` rows are hard-deleted
   (`StaffDeviceService.ts:62`) and a password login re-enrols any fingerprint
   (`AuthController.ts:370-371`); after linking to a lifecycle, a revoked device that a manager
   re-pairs gets a *new* credential while the old PIN trust must be destroyed, not recreated.
3. **Client tokens in `localStorage` and a hardcoded electron-store key** mean existing installs hold
   tokens that must be invalidated once the httpOnly cookie path lands; the paired-device list will
   briefly show devices that can no longer authenticate.
4. **Approving pairs is a behaviour change for POS rollout**: after approval lands, a code verified by a
   new device grants nothing until a manager taps approve — the only current UI is the dead
   `DeviceManagementView` / unreachable `DevicePairingVerificationView`, so the approval screen must ship
   in the same task or pairing becomes unusable.
5. **Schema/DB drift already exists** on `registered_devices` FKs (`pairing_code_id`, `station_id` have
   `ON DELETE SET NULL` in the DB but no `onDelete` in the schema) and on timestamp precision
   (`expires_at`, `last_sync_at` `TIMESTAMP(3)`); any new migration must be proven drift-free with
   `prisma migrate diff --from-migrations ... --to-schema-datamodel ...` against `fireflow_shadow`
   first, and must not modify existing migrations.
6. **Station scoping is a breaking authorization change** for anyone relying on "any staff can bump any
   station" (`OrderWorkflowService.ts:321-327`); KDS clients currently filter client-side only
   (`KDSView.tsx:15-52`), so server enforcement can make existing screens appear empty until the client
   sends its device station.
7. **Financial-table rule**: none of these tables are financial, so RESTRICT/CASCADE rules are
   unaffected — but `registered_devices.restaurant_id` and `staff_id` are `ON DELETE CASCADE`
   (`schema.prisma:656-657`), so any new device→order/payment relation must use RESTRICT.
8. **No test coverage**: `StaffDeviceService.test.ts` covers only fingerprint shape; pairing has no test
   suite. Any change must add suites that run only under `npm run test:safe` (the guard rejects every
   database not ending in `_test`), and must never be exercised against `fireflow_local`.
