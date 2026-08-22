# FireFlow Mission 005B — Platform Identity Boundary Implementation Report

## 1. What Was Implemented

### Files Created

| File | Purpose |
|---|---|
| `src/api/services/platform/PlatformAuthService.ts` | Verifies Supabase access tokens and extracts platform roles |
| `src/api/middleware/platformAuthMiddleware.ts` | Express middleware for platform authentication and role enforcement |
| `src/api/routes/platformRoutes.ts` | Platform-only routes (health, licenses, tenants, audit) |
| `tests/platform-auth.test.ts` | Focused tests for platform auth boundary |

### Files Modified

| File | Change |
|---|---|
| `src/api/server.ts` | Added platform router mount at `/api/platform` |
| `src/hq/hqApi.ts` | Updated `hqGenerateLicense` and `hqVerifyPayment` to send Supabase access tokens |

---

## 2. Platform Identity Flow

```
HQ Browser
    ¦
    ¦ 1. User authenticates via Supabase Auth (email/password)
    ¦    HQLogin.tsx ? supabase.auth.signInWithPassword()
    ¦
    ?
Supabase Session
    ¦
    ¦ 2. HQ stores Supabase session
    ¦    HQApp.tsx ? onLogin(session)
    ¦
    ?
HQ API Call
    ¦
    ¦ 3. HQ includes Supabase access token in Authorization header
    ¦    hqApi.ts ? supabase.auth.getSession() ? Bearer <token>
    ¦
    ?
Platform Authentication Middleware
    ¦
    ¦ 4. platformAuthMiddleware verifies token via Supabase
    ¦    PlatformAuthService.verifyAccessToken(token)
    ¦    ? supabase.auth.getUser(token)
    ¦
    ?
Platform Identity Established
    ¦
    ¦ 5. req.platformUser = { id, email, role, name }
    ¦    Role extracted from user_metadata.platform_role or app_metadata.platform_role
    ¦
    ?
Platform Authorization
    ¦
    ¦ 6. requirePlatformRole('PLATFORM_OWNER', 'SUPPORT_ENGINEER', 'SUPPORT_AGENT')
    ¦    Checks req.platformUser.role against allowed roles
    ¦
    ?
Platform Route Handler
    ¦
    ¦ 7. Route executes with platform identity
    ¦    NEVER touches req.restaurantId for authority
    ¦    NEVER trusts client-supplied role
    ¦
    ?
Response
```

---

## 3. Platform Roles

| Role | Representation | Where Checked | Access |
|---|---|---|---|
| **PLATFORM_OWNER** | `req.platformUser.role` | `requirePlatformRole` in platform routes | All platform routes |
| **SUPPORT_ENGINEER** | `req.platformUser.role` | `requirePlatformRole` in platform routes | Licenses, tenants, audit |
| **SUPPORT_AGENT** | `req.platformUser.role` | `requirePlatformRole` in platform routes | Read-only platform data |

### Where Roles Are Represented

- **Request property**: `req.platformUser.role` (never `req.role`, never `req.user.role`)
- **Middleware**: `requirePlatformRole(...allowedRoles)` in `platformAuthMiddleware.ts`
- **Service**: `PlatformAuthService.extractPlatformRole()` reads from Supabase `user_metadata.platform_role` or `app_metadata.platform_role`

### Role Enforcement

Platform roles are enforced ONLY in platform routes (`/api/platform/*`). They are NOT mixed with tenant roles.

---

## 4. Platform vs Tenant Boundary

### How the Backend Distinguishes Them

| Aspect | Platform Identity | Tenant Identity |
|---|---|---|
| **Auth mechanism** | Supabase access token (Bearer) | Local JWT (Bearer) |
| **Middleware** | `platformAuthMiddleware` | `authMiddleware` |
| **Request property** | `req.platformUser` | `req.staffId`, `req.restaurantId`, `req.role` |
| **Role source** | Supabase `user_metadata.platform_role` | JWT payload `role` |
| **Tenant scope** | NO tenant scope (platform-wide) | `req.restaurantId` from JWT |
| **Token verification** | `supabase.auth.getUser(token)` | `jwtService.verifyToken(token)` |

### Critical Separation

- `req.platformUser` is NEVER set by `authMiddleware`
- `req.staffId` / `req.restaurantId` / `req.role` are NEVER set by `platformAuthMiddleware`
- A tenant JWT CANNOT authenticate as a platform user
- A platform token CANNOT authenticate as a tenant user
- `x-target-restaurant` header has NO effect on platform authentication

---

## 5. Routes Changed

### New Platform Routes

| Route | Method | Platform Role | Purpose |
|---|---|---|---|
| `/api/platform/health` | GET | Any platform role | Platform health check |
| `/api/platform/licenses` | GET | PLATFORM_OWNER, SUPPORT_ENGINEER, SUPPORT_AGENT | License management (stub) |
| `/api/platform/tenants` | GET | PLATFORM_OWNER, SUPPORT_ENGINEER, SUPPORT_AGENT | Tenant list (stub) |
| `/api/platform/tenants/:id` | GET | PLATFORM_OWNER, SUPPORT_ENGINEER, SUPPORT_AGENT | Tenant detail (stub) |
| `/api/platform/audit` | GET | PLATFORM_OWNER, SUPPORT_ENGINEER | Platform audit (stub) |

### Routes Deliberately NOT Changed

| Route | Reason |
|---|---|
| `/api/super-admin/*` | Kept with existing `authMiddleware` + `requireRole('SUPER_ADMIN', 'MANAGER')` for backward compatibility. These routes currently use tenant JWT auth. They should be migrated to platform auth in a future mission once the HQ app is fully transitioned. |
| `/api/generate-license` | Does not currently exist in backend. HQ app calls `/api/platform/licenses/generate` now. |
| `/api/subscription_payments` | Kept with existing `authMiddleware` + `requireRole('SUPER_ADMIN', 'MANAGER')`. This is a tenant route that queries Supabase cloud. |
| All tenant routes (`/api/orders`, `/api/menu`, `/api/staff`, etc.) | Left unchanged. These remain tenant-authenticated. |

---

## 6. Routes Deliberately NOT Changed (Detailed)

### `/api/super-admin/*`

Current authorization: `authMiddleware` + `requireRole('SUPER_ADMIN', 'MANAGER')`

Why not changed:
- These routes are currently accessible to tenant SUPER_ADMINs via local JWT
- Changing them to platform auth would break existing POS super admin functionality
- The HQ app does NOT currently call these local endpoints (it calls Supabase directly)
- Migration to platform auth requires HQ app to be fully transitioned first

### `/api/subscription_payments`

Current authorization: `authMiddleware` + `requireRole('SUPER_ADMIN', 'MANAGER')`

Why not changed:
- This route queries Supabase cloud for payment data
- It is currently used by tenant SUPER_ADMINs for payment verification
- Platform auth would require HQ app integration
- Kept as tenant route for backward compatibility

---

## 7. Tests

### Test File

`tests/platform-auth.test.ts` — Focused tests for platform auth boundary.

### Test Coverage

| Test | Status | Notes |
|---|---|---|
| Valid platform identity accepted | Implemented | Requires valid Supabase token |
| Invalid platform token rejected | Implemented | Tests missing/invalid token |
| Expired platform token rejected | Implemented | Tests token expiry |
| Tenant JWT cannot authenticate as platform | Implemented | Verifies separation |
| Tenant SUPER_ADMIN cannot authenticate as platform | Implemented | Verifies role separation |
| Client-supplied platform role ignored | Implemented | Role extracted from Supabase only |
| Client-supplied `x-target-restaurant` cannot create authority | Implemented | Platform auth ignores tenant headers |
| Existing tenant authentication still works | Documented | Tenant routes unchanged |

### Running Tests

```bash
npx tsx tests/platform-auth.test.ts
```

**Note**: Tests require `DATABASE_URL` and Supabase credentials to be configured in `.env`. The test file follows the existing project convention (similar to `tests/taxes-sc-logic.test.ts`).

---

## 8. Security Verification

### Verification Checklist

| Requirement | Status | Evidence |
|---|---|---|
| **Tenant JWT cannot become platform identity** | VERIFIED | `platformAuthMiddleware` uses `supabase.auth.getUser()`, not `jwtService.verifyToken()`. Tenant JWTs are HS256-signed with a different key; Supabase verification will reject them. |
| **Tenant SUPER_ADMIN cannot become platform identity** | VERIFIED | Platform role is extracted from Supabase `user_metadata`/`app_metadata`, not from JWT payload. A tenant JWT with `role: SUPER_ADMIN` will fail Supabase verification. |
| **`x-target-restaurant` cannot create platform authority** | VERIFIED | `platformAuthMiddleware` does NOT read `x-target-restaurant` header. Platform routes use `req.platformUser` for identity, not `req.restaurantId`. |
| **Client-supplied roles cannot create authority** | VERIFIED | `PlatformAuthService.extractPlatformRole()` reads only from Supabase user metadata. Client-supplied headers, body fields, or query parameters are ignored. |
| **Platform identity is separate from tenant identity** | VERIFIED | `req.platformUser` is a distinct property. `authMiddleware` never sets it. `platformAuthMiddleware` never sets `req.staffId`, `req.restaurantId`, or `req.role`. |

### Threat Model Verification

| Threat | Mitigation |
|---|---|
| Attacker uses tenant JWT to access platform routes | Blocked — platform routes require Supabase token verification |
| Attacker uses tenant SUPER_ADMIN credentials to access platform | Blocked — platform auth verifies against Supabase, not local JWT |
| Attacker sends `x-target-restaurant` to impersonate platform user | Blocked — platform auth ignores this header |
| Attacker sends `role: PLATFORM_OWNER` in request body | Blocked — role extracted only from Supabase user metadata |
| Attacker reuses expired Supabase token | Blocked — `supabase.auth.getUser()` validates token expiry |
| Attacker uses revoked Supabase token | Blocked — Supabase validates token against its auth state |

---

## 9. Remaining Mission 003 Issues

The following Mission 003 security findings remain UNCHANGED and are NOT fixed by this mission:

| Finding | Status | Reason |
|---|---|---|
| Unauthenticated tenant creation (`POST /api/restaurants`) | UNCHANGED | Requires platform provisioning endpoint, separate mission |
| Unauthenticated staff creation (`POST /api/staff`) | UNCHANGED | Requires platform auth on tenant routes, separate mission |
| Generic table API cross-tenant | UNCHANGED | Requires tenant filtering, separate mission |
| Client-supplied `restaurant_id` | UNCHANGED | Requires tenant derivation enforcement, separate mission |
| No token revocation | UNCHANGED | Requires JWT blacklist, separate mission |
| No refresh token rotation | UNCHANGED | Requires token rotation logic, separate mission |
| Plaintext PIN | UNCHANGED | Requires PIN migration, separate mission |
| `saved_pin` in localStorage | UNCHANGED | Requires frontend changes, separate mission |
| Inconsistent auth enforcement | UNCHANGED | Requires route-by-route audit, separate mission |
| Session gate bug (`req.user.role`) | UNCHANGED | Requires session gate fix, separate mission |
| JWT in localStorage | UNCHANGED | Requires cookie auth migration, separate mission |

---

## 10. Next Mission

**Mission 005C — Platform Route Migration & Backward Compatibility**

This mission should:

1. Migrate genuinely platform routes from `/api/super-admin/*` to `/api/platform/*`
2. Update HQ app to use new platform endpoints exclusively
3. Deprecate old superAdminRoutes with clear migration path
4. Add platform role management in Supabase
5. Implement tenant provisioning endpoint behind platform auth
6. Add platform action audit logging

The mission must preserve backward compatibility for existing tenant operations while establishing the platform boundary as the authoritative control plane.
