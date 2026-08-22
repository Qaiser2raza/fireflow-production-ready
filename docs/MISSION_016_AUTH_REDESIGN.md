# Mission 016 — FireFlow-Owned Authentication Redesign

**Date:** 2026-08-21
**Status:** DESIGN PHASE — NOT IMPLEMENTED
**Branch:** main

**Constraint:** Do not implement until design is reviewed and approved.

---

## 1. CURRENT STATE

### 1.1 Authentication Architecture

FireFlow currently uses **two distinct authentication systems**:

| System | Audience | Method | Storage | Location |
|---|---|---|---|---|
| **Local POS Auth** | Restaurant staff | PIN (4–6 digits) + JWT | localStorage | `src/api/server.ts`, `src/api/services/auth/JwtService.ts` |
| **Platform Auth** | Platform owners, support | Supabase Auth (email/password) | Supabase session | `src/api/services/platform/PlatformAuthService.ts` |
| **HQ Portal Auth** | SaaS admins | Supabase Auth (email/password) | Supabase session | `src/hq/hqApi.ts` |

### 1.2 Current Supabase Auth Usage

Supabase Auth is used in exactly **three** places:

1. **`platformAuthService.ts`** — Verifies Supabase access tokens for `PLATFORM_OWNER`, `SUPPORT_ENGINEER`, `SUPPORT_AGENT` roles. Uses `SUPABASE_SERVICE_KEY` server-side.
2. **`hqApi.ts`** — HQ (Vercel) portal uses `VITE_SUPABASE_ANON_KEY` to call `supabase.auth.getSession()` and manage HQ admin sessions.
3. **`cloudClient.ts`** — Does NOT use Supabase Auth; uses PostgREST for licensing/subscription/payment data.

**Critical finding:** Supabase Auth is **not** used for restaurant owner, manager, or staff authentication. It is exclusively a platform/HQ admin authentication mechanism.

### 1.3 Existing Models

#### Local PostgreSQL Models (Prisma)

| Model | Purpose | Key Fields |
|---|---|---|
| `restaurants` | Tenant record | `id`, `name`, `slug`, `owner_id`, `subscription_status`, `subscription_plan`, `subscription_expires_at` |
| `staff` | POS users | `id`, `restaurant_id`, `name`, `role`, `pin` (plaintext legacy), `hashed_pin` (bcrypt), `status`, `last_login` |
| `license_keys` | License binding | `id`, `restaurant_id`, `license_key`, `is_active`, `activated_at`, `expires_at` |
| `cashier_sessions` | Cashier shifts | `id`, `restaurant_id`, `staff_id`, `opened_at`, `closed_at`, `status` |
| `support_sessions` | Platform support bridge | `id`, `platform_user_id`, `restaurant_id`, `scope`, `expires_at`, `status` |
| `audit_logs` | Security audit trail | `id`, `restaurant_id`, `staff_id`, `action_type`, `entity_type`, `entity_id`, `details` |
| `security_events` | Security incidents | `id`, `restaurant_id`, `event_type`, `severity`, `description`, `is_resolved` |

**No `users` table exists.** There is no separate authentication identity table — staff IS the identity.

**No `sessions` table exists** for web sessions. Sessions are entirely JWT-based.

#### Supabase Cloud Models (Not in local Prisma)

| Table | Purpose |
|---|---|
| `license_keys` | SaaS license generation and activation |
| `restaurants_cloud` | SaaS restaurant registry |
| `subscription_payments` | Payment proof records |

### 1.4 Login Flow (Current)

```
Browser (localStorage)
    ↓
POST /api/auth/login { pin, restaurant_id? }
    ↓
server.ts: Find staff by PIN + restaurant_id
    ↓
bcrypt.compare(pin, hashed_pin)
    ↓
On success: migrate plaintext pin → clear pin, set hashed_pin
    ↓
Generate JWT access (15min) + refresh (7 days)
    ↓
Return { staff, restaurant, tokens }
    ↓
Browser: localStorage.setItem('accessToken', ...)
         localStorage.setItem('refreshToken', ...)
         localStorage.setItem('saved_pin', pin)  ← REMOVED in Mission 015
```

### 1.5 Middleware Behavior

**`authMiddleware.ts`:**
- Extracts Bearer token from `Authorization` header
- Verifies JWT signature and expiry via `JwtService`
- Attaches `req.staffId`, `req.restaurantId`, `req.role`, `req.staff`
- Returns 401 for missing/invalid tokens, 410 for expired
- Allows public QR menu/order endpoints without auth
- Supports `x-target-restaurant` header for SUPER_ADMIN (deprecated, transitional)

**`platformAuthMiddleware.ts`:**
- Extracts Bearer token from `Authorization` header
- Calls `platformAuthService.verifyAccessToken(token)` → Supabase Auth
- Attaches `req.platformUser` with `id`, `email`, `role`
- Returns 401 for missing/invalid tokens

**`supportSessionMiddleware.ts`:**
- Extracts session ID from params or `x-support-session` header
- Validates via `SupportSessionService`
- Sets `req.restaurantId` from session (bypasses JWT tenant)

### 1.6 Onboarding Flow (Current)

**Current state: INCOMPLETE and MANUAL.**

1. **Platform owner** creates restaurant via `POST /api/restaurants` (requires `platformAuthMiddleware` + `PLATFORM_OWNER` role + Supabase Auth token)
2. **Platform owner** creates initial staff/owner via `POST /api/staff` (requires local `authMiddleware` + `MANAGER` role — circular dependency)
3. **Staff** logs in with PIN via `POST /api/auth/login`
4. **Frontend** calls `POST /api/system/seed-restaurant` to create default sections/tables/categories
5. **License activation** via `POST /api/licensing/activate` with cryptographic token

**Gaps:**
- No self-service restaurant registration
- No email invitation flow
- No owner account creation independent of platform owner
- No password/PIN reset
- No email verification
- `ActivationView.tsx` references `/api/setup/activate` and `/api/setup/create-manager` which **do not exist** in `server.ts`

### 1.7 Frontend Routes and Protection

**Current routing:** No formal router. `App.tsx` uses `activeView` state machine:
- `!currentUser` → `<LoginView>`
- `currentUser.role === 'SUPER_ADMIN'` → `SUPER_ADMIN` view
- Role-based menu items determine accessible views

**No route guards beyond:**
- `currentUser` null check (login gate)
- Role-based menu rendering
- Backend `authMiddleware` + `requireRole`

### 1.8 Existing Tests

| Test File | Coverage | Auth Relevance |
|---|---|---|
| `tenant-boundary.test.ts` | 253 lines | `authMiddleware`, `requireRole`, `platformAuthMiddleware`, `requirePlatformRole`, `supportSessionMiddleware`, PIN verification role checks |
| `platform-auth.test.ts` | 199 lines | Platform auth token validation, role enforcement, `x-target-restaurant` isolation |
| `service-tenant-isolation.test.ts` | 305 lines | Cross-tenant rejection in order, FBR, printer, accounting, journal, workflow services |
| `phase2-service-support.test.ts` | 500 lines | Support session bridge, cross-tenant updates, session revocation, scope enforcement |
| `support-session.test.ts` | 249 lines | Session creation, scope validation, middleware, revocation |
| `mission-014A-pos-security.test.ts` | 593 lines | Security gap regression tests including generic API authorization |
| `mission-010/011/012/013.test.ts` | Various | Integration, payment, fiscal tests with tenant isolation |

**No tests exist for:**
- Email/password authentication
- Password reset flow
- Account lockout
- Refresh token rotation
- Session revocation
- Onboarding flow end-to-end

---

## 2. SECURITY RISKS IN REPLACING SUPABASE AUTH

| Risk | Severity | Mitigation |
|---|---|---|
| **Platform admin lockout** | CRITICAL | Dual-run period; fallback to Supabase Auth if FireFlow auth fails |
| **HQ portal breakage** | HIGH | Migrate HQ to FireFlow auth before deprecating Supabase |
| **Token signature compatibility** | HIGH | Use distinct token types; never mix Supabase and FireFlow JWTs |
| **Secret exposure** | HIGH | Never store `SUPABASE_SERVICE_KEY` in browser; remove from `.env.example` |
| **Session fixation** | MEDIUM | Rotate session IDs on login; invalidate old sessions on password change |
| **Privilege escalation** | MEDIUM | Platform roles must be server-enforced; never accept from client |
| **Data loss during migration** | MEDIUM | Write-through migration; preserve Supabase user metadata |
| **Offline POS degradation** | LOW | JWT auth works offline; ensure no Supabase dependency for local auth |

---

## 3. PROPOSED AUTHENTICATION DESIGN

### 3.1 Design Principles

1. **FireFlow owns all authentication.** No external auth provider dependency for POS, platform, or HQ.
2. **PIN + optional email/password** for POS staff. Email/password for platform/HQ admins.
3. **Short-lived access tokens** (15 min) + **rotating refresh tokens** (7 days, single-use).
4. **HttpOnly, Secure, SameSite cookies** for browser-based sessions where possible.
5. **Server-side session store** for revocation, audit, and concurrent session management.
6. **Tenant identity from authenticated session**, never from browser input.
7. **No plaintext secrets** in any storage layer.

### 3.2 Token Model

| Token | Lifetime | Storage | Rotation | Purpose |
|---|---|---|---|---|
| **Access Token** | 15 minutes | Memory (React state) + `Authorization` header | N/A | API authentication |
| **Refresh Token** | 7 days | HttpOnly cookie (`refresh_token`) | Rotated on every use | Obtain new access token |
| **Session Token** | 4 hours (support sessions) | Database (`support_sessions`) | N/A | Platform support bridge |

**Access Token Payload (JWT):**
```json
{
  "staffId": "uuid",
  "restaurantId": "uuid",
  "role": "MANAGER",
  "type": "access",
  "jti": "uuid",
  "iat": 1234567890,
  "exp": 1234567890 + 900
}
```

**Refresh Token Payload (JWT):**
```json
{
  "staffId": "uuid",
  "restaurantId": "uuid",
  "role": "MANAGER",
  "type": "refresh",
  "jti": "uuid",
  "iat": 1234567890,
  "exp": 1234567890 + 604800,
  "family": "uuid"
}
```

### 3.3 Session and Refresh Token Model

**New table: `auth_sessions`**

```prisma
model auth_sessions {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  staff_id      String   @db.Uuid
  restaurant_id String   @db.Uuid
  family_id     String   @db.Uuid
  jti           String   @unique
  expires_at    DateTime @db.Timestamp(6)
  revoked_at    DateTime? @db.Timestamp(6)
  user_agent    String?
  ip_address    String?
  created_at    DateTime @default(now()) @db.Timestamp(6)

  @@index([staff_id])
  @@index([restaurant_id])
  @@index([family_id])
  @@index([jti])
}
```

**Refresh token flow:**
1. Client sends `POST /api/auth/refresh` with HttpOnly cookie containing refresh token JWT
2. Server verifies JWT signature and expiry
3. Server checks `auth_sessions` for `jti` + `family_id` + not revoked + not expired
4. Server revokes old session (mark `revoked_at`)
5. Server creates new access token + new refresh token (new `jti`, same `family_id`)
6. Server stores new refresh token session in `auth_sessions`
7. Server sets new HttpOnly cookie

**Revocation:**
- Logout: Revoke all sessions for staff + clear cookie
- Password change: Revoke all sessions for staff
- Security event: Revoke specific session by `jti`

### 3.4 Token Storage Strategy

| Token | Browser Storage | Rationale |
|---|---|---|
| Access Token | **Memory only** (React state/context) | Not persisted; lost on refresh → triggers silent refresh |
| Refresh Token | **HttpOnly cookie** (`refresh_token`) | Not accessible to JS; auto-sent by browser; CSRF protection via `SameSite: Strict` |
| Restaurant context | **Memory + ephemeral state** | Derived from JWT `restaurantId` claim, never from localStorage alone |

**`fetchWithAuth` interceptor:**
- Reads access token from React context (memory)
- On 401, attempts silent refresh using HttpOnly cookie
- On refresh failure, redirects to login
- Never stores access token in localStorage

### 3.5 Login Flow (Proposed)

```
POST /api/auth/login
  { pin | email + password, restaurant_id? }
    ↓
Verify credential (bcrypt for PIN, bcrypt for password)
    ↓
Check staff.active === 'active'
    ↓
Create auth_sessions record (family_id, jti, expires_at)
    ↓
Generate access token (15min) + refresh token (7d, new family)
    ↓
Set HttpOnly cookie: refresh_token={refresh_jwt}; SameSite=Strict; Secure
    ↓
Return { staff, restaurant, access_token }
    ↓
Browser: store access_token in React context (memory)
```

### 3.6 Logout and Revocation

```
POST /api/auth/logout
    ↓
Revoke all auth_sessions for staff_id
    ↓
Clear refresh_token HttpOnly cookie
    ↓
Audit log: STAFF_LOGOUT
    ↓
Return 204
```

### 3.7 Password/PIN Reset

**PIN reset (staff-initiated):**
- Requires current PIN + new PIN (4–6 digits)
- No email/SMS (POS environment may be offline)
- Rate limited: 5 attempts per 15 minutes per staff ID
- Audit logged

**Password reset (email-based, future):**
- `POST /api/auth/forgot-password` → generate reset token (15min, single-use)
- `POST /api/auth/reset-password` → verify token + set new password
- Requires SMTP infrastructure (not currently present)

**Platform admin reset:**
- `POST /api/admin/staff/:id/reset-pin` → MANAGER+ can reset staff PIN
- Audit logged

### 3.8 Rate Limiting and Account Lockout

| Action | Limit | Lockout |
|---|---|---|
| PIN login attempts | 5 per 15 min per staff ID | 30 min lockout after 5 failures |
| Password login attempts | 5 per 15 min per IP + staff ID | 30 min lockout after 5 failures |
| Refresh token attempts | 10 per 15 min per family ID | Revoke family after 10 failures |
| Password/PIN reset | 3 per hour per staff ID | 1 hour lockout |
| Pairing code generation | 5 per minute per IP | Existing |

**Account lockout fields (new on `staff` model):**
```prisma
model staff {
  // ... existing fields
  locked_until        DateTime?
  failed_login_count  Int        @default(0)
}
```

### 3.9 Tenant and Role Resolution

- **Tenant identity:** Always from verified JWT `restaurantId` claim or `support_sessions.restaurant_id`
- **Never trust:** `req.body.restaurant_id`, `req.query.restaurant_id`, `x-target-restaurant` (deprecated)
- **Role hierarchy:** `SUPER_ADMIN` > `ADMIN` > `MANAGER` > `CASHIER` > `SERVER`/`WAITER` > `CHEF` > `RIDER`
- **Platform roles:** `PLATFORM_OWNER` > `SUPPORT_ENGINEER` > `SUPPORT_AGENT` (separate namespace)

### 3.10 License Verification

**Current:** License verified via `verifyLicensingMiddleware` on `protectedApiRouter`. Uses local cryptographic signature + optional cloud sync.

**Proposed:** No change to license verification logic. License check remains on `protectedApiRouter`. New auth system does not replace licensing.

### 3.11 Initial Restaurant Provisioning

**Proposed self-service onboarding:**

```
Step 1: POST /api/onboarding/register
  { name, phone, address, slug, owner_name, owner_pin }
    ↓
Create restaurant (trial status, 30 days)
Create owner staff record (role: MANAGER, hashed_pin)
Generate license_keys record (local)
    ↓
Return { restaurant_id, staff_id, message }

Step 2: POST /api/onboarding/activate
  { restaurant_id, license_key }
    ↓
Validate license key (local + cloud)
Activate license
Set subscription_status = 'active'
    ↓
Return { success, plan, expires_at }

Step 3: POST /api/system/seed-restaurant
  (existing endpoint, now available without platform auth)
    ↓
Create default sections, tables, categories, stations
    ↓
Return { success }
```

**Optional email verification** (future, requires SMTP):
- Send verification link to owner email
- Block operational access until verified
- Allow 14-day grace period

### 3.12 Audit Events

New audit event types:
- `STAFF_REGISTERED` — Owner/staff created
- `STAFF_LOGIN` — Successful login (with `mfa_used`, `session_id`)
- `STAFF_LOGIN_FAILED` — Failed login attempt (with `reason`, `ip`, `user_agent`)
- `STAFF_LOGOUT` — Logout initiated
- `STAFF_LOCKED` — Account locked after failed attempts
- `STAFF_UNLOCKED` — Account unlocked by admin or timer
- `PASSWORD_CHANGED` — Password/PIN changed
- `PASSWORD_RESET_REQUESTED` — Reset requested
- `PASSWORD_RESET_COMPLETED` — Reset completed
- `SESSION_REVOKED` — Session explicitly revoked
- `LICENSE_ACTIVATED` — License activated for restaurant
- `ONBOARDING_STARTED` — Registration initiated
- `ONBOARDING_COMPLETED` — All steps completed

### 3.13 Recovery After Partial Onboarding

**Scenarios:**
1. **Restaurant created, owner not created:** Admin can re-run owner creation or platform can complete
2. **Owner created, license not activated:** Owner can retry activation; grace period (7 days)
3. **License activated, seed not run:** Owner can run seed on first login
4. **All partial:** Atomic transaction wrapper for onboarding steps; rollback on failure

**Recovery endpoint:**
```
GET /api/onboarding/status/:restaurantId
  → Returns completion status of each onboarding step
POST /api/onboarding/resume
  → Resumes from last incomplete step
```

### 3.14 Migration of Existing Supabase Auth Users

**Platform users (PLATFORM_OWNER, SUPPORT_ENGINEER, SUPPORT_AGENT):**
1. Export Supabase Auth users (`auth.users` table) via Supabase API
2. Import into FireFlow `staff` table with `restaurant_id = null` (platform scope)
3. Hash passwords using bcrypt (Supabase stores bcrypt hashes; re-hash on first login)
4. Generate FireFlow JWTs for each user
5. Invalidate Supabase sessions
6. Update `platformAuthMiddleware` to use FireFlow JWT instead of Supabase Auth

**HQ portal users:**
1. Same migration path
2. Update `hqApi.ts` to use FireFlow `/api/auth/login` + JWT
3. Remove direct Supabase client calls from HQ

**Restaurant staff (already local):**
- No migration needed; already use local PIN + JWT
- Migrate remaining plaintext PINs via existing script

### 3.15 Local Development Behavior

- **No Supabase required** for local development
- Mock platform auth service returns `PLATFORM_OWNER` for development
- License verification uses local-only mode
- Seed data includes default platform admin user
- `.env` can set `FIREFLOW_DEV_MODE=true` to bypass certain checks

### 3.16 Staging and Production Behavior

| Environment | Auth Provider | Session Store | SMTP | Monitoring |
|---|---|---|---|---|
| **Local** | FireFlow JWT + mock platform | SQLite/PostgreSQL | Mock | Console |
| **Staging** | FireFlow JWT + FireFlow platform auth | PostgreSQL | SendGrid/Mailgun | Sentry |
| **Production** | FireFlow JWT + FireFlow platform auth | PostgreSQL | SendGrid/Mailgun | Sentry + PagerDuty |

---

## 4. DATABASE DESIGN

### 4.1 New Tables

```prisma
model auth_sessions {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  staff_id      String   @db.Uuid
  restaurant_id String   @db.Uuid
  family_id     String   @db.Uuid
  jti           String   @unique
  expires_at    DateTime @db.Timestamp(6)
  revoked_at    DateTime? @db.Timestamp(6)
  user_agent    String?
  ip_address    String?
  created_at    DateTime @default(now()) @db.Timestamp(6)

  @@index([staff_id])
  @@index([restaurant_id])
  @@index([family_id])
  @@index([jti])
}

model password_resets {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  staff_id    String   @db.Uuid
  token       String   @unique
  expires_at  DateTime @db.Timestamp(6)
  used_at     DateTime? @db.Timestamp(6)
  ip_address  String?
  created_at  DateTime @default(now()) @db.Timestamp(6)

  @@index([staff_id])
  @@index([token])
}

model onboarding_steps {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  restaurant_id    String   @db.Uuid @unique
  restaurant_created Boolean @default(false)
  owner_created     Boolean @default(false)
  license_activated Boolean @default(false)
  seeded            Boolean @default(false)
  email_verified    Boolean @default(false)
  completed_at      DateTime? @db.Timestamp(6)
  created_at        DateTime @default(now()) @db.Timestamp(6)
  updated_at        DateTime @default(now()) @db.Timestamp(6)

  @@index([restaurant_id])
}
```

### 4.2 Modified Tables

```prisma
model staff {
  // ... existing fields
  locked_until       DateTime?
  failed_login_count Int        @default(0)
  password_hash      String?    // For email/password (future)
  email              String?    @unique // For password reset, notifications
  email_verified     Boolean?   @default(false)
}

model restaurants {
  // ... existing fields
  onboarding_completed Boolean @default(false)
}
```

### 4.3 Migration Files

| Migration | Purpose |
|---|---|
| `20260821_add_auth_sessions` | Create `auth_sessions` table |
| `20260821_add_password_resets` | Create `password_resets` table |
| `20260821_add_onboarding_steps` | Create `onboarding_steps` table |
| `20260821_add_staff_auth_fields` | Add `locked_until`, `failed_login_count`, `password_hash`, `email` to `staff` |
| `20260821_add_restaurant_onboarding` | Add `onboarding_completed` to `restaurants` |
| `20260821_migrate_platform_users` | Migrate Supabase platform users to local staff |

---

## 5. MIGRATION PLAN

### Phase 1: Parallel Infrastructure (Week 1–2)
1. Create new database tables (`auth_sessions`, `password_resets`, `onboarding_steps`)
2. Implement FireFlow JWT service enhancements (rotation, revocation)
3. Implement new login endpoints (`/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`)
4. Implement onboarding endpoints (`/api/onboarding/*`)
5. Add staff auth fields (`email`, `password_hash`, `locked_until`, `failed_login_count`)
6. Write comprehensive tests

### Phase 2: Dual-Run Period (Week 3–4)
1. Deploy new auth endpoints alongside existing Supabase Auth
2. Platform middleware supports **both** Supabase Auth AND FireFlow JWT
3. HQ portal can use either auth system
4. New platform users created via FireFlow auth
5. Existing Supabase users can log in via either system
6. Monitor for 2 weeks

### Phase 3: Supabase Auth Deprecation (Week 5–6)
1. Migrate remaining Supabase platform users to FireFlow
2. Update HQ portal to use FireFlow auth exclusively
3. Remove Supabase Auth dependency from `platformAuthService.ts`
4. Remove Supabase client from platform routes
5. Remove `SUPABASE_SERVICE_KEY` from platform auth requirements

### Phase 4: Cleanup (Week 7)
1. Remove Supabase Auth SDK from platform dependencies
2. Remove `.env` variables: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (keep `SUPABASE_ANON_KEY` for HQ if needed, or migrate HQ fully)
3. Update documentation
4. Archive Supabase user data (read-only backup)

---

## 6. ROLLBACK PLAN

| Failure Scenario | Rollback Action |
|---|---|
| New login endpoints broken | Revert to existing `/api/auth/login` (PIN-only, no changes) |
| JWT rotation causing logout loops | Disable rotation; keep existing 7-day refresh tokens |
| Platform auth failure | Re-enable Supabase Auth fallback in `platformAuthMiddleware` |
| Database migration failure | Prisma migrate to previous migration; data preserved in old tables |
| HQ portal breakage | HQ falls back to Supabase Auth (dual-run period) |
| Production lockout | Emergency admin endpoint to bypass auth (IP-whitelisted, time-limited) |

**Rollback triggers:**
- >5% authentication failure rate in production
- Platform admin unable to access any route
- Data inconsistency in `auth_sessions` table
- Security vulnerability in new auth code

---

## 7. SECURITY THREATS AND CONTROLS

| Threat | Control |
|---|---|
| **Credential stuffing** | Rate limiting + account lockout + bcrypt (cost 12) |
| **Token theft** | Short-lived access tokens + HttpOnly refresh cookies + SameSite |
| **Session fixation** | Rotate `jti` on every refresh; new `family_id` on password change |
| **Privilege escalation** | Server-side role enforcement; never trust client role claims |
| **Cross-tenant access** | `restaurantId` from verified JWT; never from request body/query |
| **Replay attacks** | Unique `jti` per token; revoked tokens stored in DB |
| **Brute force PIN** | 4–6 digit PIN + bcrypt + rate limiting + account lockout |
| **Insider threat** | Comprehensive audit logging; support sessions scoped and time-limited |
| **Data breach** | No plaintext passwords/PINs; hashed with bcrypt; no long-lived tokens in localStorage |
| **Supply chain** | Minimal external auth dependencies; self-hosted JWT verification |

---

## 8. TEST PLAN

### Unit Tests
- [ ] `JwtService` — generate, verify, expiry, signature, type enforcement
- [ ] `AuthService` — login, logout, refresh, lockout, unlock
- [ ] `OnboardingService` — register, activate, seed, status, resume
- [ ] `PasswordResetService` — request, verify, complete, expiry
- [ ] `PlatformAuthService` — FireFlow JWT verification (Supabase fallback removed)

### Integration Tests
- [ ] Login with valid PIN → access + refresh tokens
- [ ] Login with valid email/password → access + refresh tokens
- [ ] Login with invalid credentials → lockout after 5 attempts
- [ ] Refresh token rotation → old token invalid, new token valid
- [ ] Logout → all sessions revoked, cookie cleared
- [ ] Cross-tenant access → rejected
- [ ] Platform admin → can create restaurants, manage staff
- [ ] Onboarding flow → complete all steps, verify state transitions
- [ ] Partial onboarding recovery → resume from incomplete step
- [ ] License verification → unlicensed/expired/tampered blocked

### Security Tests
- [ ] Token replay → rejected
- [ ] Expired token → 401/410
- [ ] Tampered token → 401
- [ ] Missing token → 401
- [ ] Wrong token type (refresh as access) → 401
- [ ] HttpOnly cookie → not accessible via `document.cookie`
- [ ] SameSite cookie → not sent on cross-site requests
- [ ] Rate limit → 429 after threshold
- [ ] Account lockout → 403 after 5 failures

### Migration Tests
- [ ] Existing PIN login still works during dual-run
- [ ] Supabase platform users can log in via FireFlow auth
- [ ] Supabase platform users can still log in via Supabase (dual-run)
- [ ] HQ portal works with FireFlow auth
- [ ] All 127 existing mission tests still pass

---

## 9. REQUIRED DECISIONS

1. **Should platform users (PLATFORM_OWNER, SUPPORT) have email/password auth, or continue with PIN?**
   - **Recommendation:** Email/password for platform/HQ; PIN for POS staff.

2. **Should we keep Supabase Auth for HQ portal only, or migrate HQ to FireFlow auth?**
   - **Recommendation:** Migrate HQ to FireFlow auth; eliminate Supabase Auth dependency entirely.

3. **Should refresh tokens be stored in HttpOnly cookies or continue in Authorization header?**
   - **Recommendation:** HttpOnly cookies for browser; Authorization header for Electron/native.

4. **Should we implement email verification during onboarding?**
   - **Recommendation:** Optional in Phase 1; required in Phase 2 (requires SMTP).

5. **Should we support concurrent sessions per staff member?**
   - **Recommendation:** Yes, with configurable limit (default: 3 active sessions).

6. **Should password reset be email-based or admin-only?**
   - **Recommendation:** Email-based when SMTP available; admin-only fallback for POS environment.

7. **Should we preserve the `saved_pin` auto-login feature?**
   - **Recommendation:** No. Auto-login via PIN is a security risk. Use session persistence instead.

8. **Should the `x-target-restaurant` header be fully removed?**
   - **Recommendation:** Yes, after support session bridge is fully operational.

---

## 10. IMPLEMENTATION BOUNDARIES

**IN SCOPE for Mission 016:**
- FireFlow-owned JWT authentication service
- Platform auth migration (Supabase → FireFlow)
- HQ portal auth migration
- Session store and refresh token rotation
- Account lockout and rate limiting
- Onboarding endpoints
- Password/PIN reset infrastructure
- Audit events for auth lifecycle

**OUT OF SCOPE (do not implement now):**
- Cravex integration
- Email/SMS delivery (requires external service)
- MFA/TOTP (future phase)
- SSO/SAML/OAuth (future phase)
- Password-based login for POS staff (PIN remains primary; password optional future)
- Production deployment

---

## 11. NEXT STEPS AFTER REVIEW

1. **Security review** of this design document
2. **Architecture review** by team leads
3. **Decision resolution** on required decisions above
4. **Implementation plan** broken into phases
5. **Test plan** finalized with QA
6. **Migration rehearsal** on staging environment
7. **Production rollout** with dual-run period
