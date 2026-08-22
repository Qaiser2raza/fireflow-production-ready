# FireFlow Mission 005C — Platform Auth Security Verification

## A. Security Verdict

**PASS WITH CONDITIONS**

The platform identity boundary is structurally sound: Supabase tokens are verified server-side, platform identity is isolated from tenant JWT, and `x-target-restaurant` cannot create platform authority. However, there is **one CRITICAL condition** that must be corrected before this boundary can be considered production-secure: the platform role extraction trusts user-modifiable Supabase metadata.

---

## B. Authentication Trust Chain

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
    ¦    HQApp.tsx ? onLogin(data.session)
    ¦
    ?
HQ API Call
    ¦
    ¦ 3. HQ includes Supabase access token in Authorization header
    ¦    hqApi.ts ? supabase.auth.getSession() ? Bearer <token>
    ¦
    ?
Express Server
    ¦
    ¦ 4. Request arrives at /api/platform/*
    ¦    server.ts ? app.use('/api/platform', platformRoutes)
    ¦
    ?
platformAuthMiddleware
    ¦
    ¦ 5. Extracts Bearer token from Authorization header
    ¦    platformAuthMiddleware.ts:28
    ¦
    ?
PlatformAuthService.verifyAccessToken()
    ¦
    ¦ 6. Verifies token via Supabase:
    ¦    supabase.auth.getUser(token)
    ¦    PlatformAuthService.ts:49
    ¦
    ¦    Trust boundary: We trust Supabase's verification result.
    ¦    Supabase validates signature, expiry, and revocation.
    ¦
    ?
Platform Identity Established
    ¦
    ¦ 7. req.platformUser = { id, email, role, name }
    ¦    Role extracted from user_metadata / app_metadata
    ¦
    ?
Platform Authorization
    ¦
    ¦ 8. requirePlatformRole() checks req.platformUser.role
    ¦    Platform route handler executes
    ¦
    ?
Response
```

**Trust boundary**: The server trusts Supabase's `auth.getUser()` response. We do not verify the JWT signature locally. We rely on Supabase's auth infrastructure to validate the token.

---

## C. Platform Role Trust

### Where Platform Authority Comes From

Platform roles are extracted in `PlatformAuthService.extractPlatformRole()` (lines 75-86):

```typescript
const metadata = user.user_metadata || {};
const appMetadata = user.app_metadata || {};

const roleSource = metadata.platform_role || appMetadata.platform_role || metadata.role || appMetadata.role;
```

### Role Sources in Order of Precedence

1. `user_metadata.platform_role` — **USER MODIFIABLE**
2. `app_metadata.platform_role` — **NOT user modifiable** (admin/service only)
3. `user_metadata.role` — **USER MODIFIABLE**
4. `app_metadata.role` — **NOT user modifiable** (admin/service only)

### CRITICAL SECURITY CONCERN

**`user_metadata` IS modifiable by the authenticated user.**

Any authenticated Supabase user can modify their own `user_metadata` via the Supabase client:

```javascript
const { error } = await supabase.auth.updateUser({
  data: { platform_role: 'PLATFORM_OWNER' }
})
```

If a regular restaurant staff member obtains a valid Supabase account (e.g., through self-registration or compromised credentials), they can:
1. Set their own `user_metadata.platform_role = 'PLATFORM_OWNER'`
2. Call `/api/platform/*` endpoints with their Supabase access token
3. Pass `requirePlatformRole('PLATFORM_OWNER')` checks
4. Gain full platform access

**This is a CRITICAL privilege escalation vulnerability.**

### Why It's Not Immediately Exploited Today

- The HQ app uses Supabase Auth with email/password
- There is no public self-registration flow for HQ
- Only explicitly created Supabase users can log in
- But if a Supabase user is created for any tenant-related purpose, they could exploit this

---

## D. Credential Exposure

### Supabase Service-Role Key

| Question | Answer |
|---|---|
| Reaches browser? | **NO** — `PlatformAuthService` runs server-side only |
| Bundled into HQ frontend? | **NO** — HQ uses `VITE_SUPABASE_ANON_KEY`, not service key |
| Sent in API requests? | **NO** — only the user's access token is sent |
| Used server-side? | **YES** — `PlatformAuthService` uses it for `supabase.auth.getUser()` |

**The service-role key is safely contained server-side.**

### Supabase Anon Key

| Question | Answer |
|---|---|
| In frontend code? | **YES** — `hqApi.ts` and `HQLogin.tsx` use `VITE_SUPABASE_ANON_KEY` |
| In `.env.example`? | **YES** — already documented as live credentials in Mission 003 |
| Risk | **KNOWN** — anon key allows public operations per Supabase RLS policies |

**This is a pre-existing issue, not introduced by Mission 005B.**

### Local JWT Secret

| Question | Answer |
|---|---|
| In `.env.example`? | **NO** — `FIREFLOW_JWT_SECRET` is not present |
| In code? | **NO** — uses random key fallback (insecure but not exposed) |
| Risk | **MEDIUM** — tokens invalidate on restart |

**This is a pre-existing issue.**

---

## E. Platform/Tenant Separation

### Is the Boundary Real or Conceptual?

**The boundary is REAL at the code level, but VULNERABLE at the role level.**

### What Makes It Real

| Separation Aspect | Implementation | Status |
|---|---|---|
| Different auth mechanisms | Platform: Supabase token | Tenant: Local JWT | REAL |
| Different middleware | `platformAuthMiddleware` | `authMiddleware` | REAL |
| Different request properties | `req.platformUser` | `req.staffId`, `req.restaurantId` | REAL |
| Different role domains | Platform: PLATFORM_OWNER, SUPPORT_ENGINEER, SUPPORT_AGENT | Tenant: SUPER_ADMIN, MANAGER, etc. | REAL |
| Route isolation | `/api/platform/*` | `/api/*` (tenant routes) | REAL |
| Token verification | `supabase.auth.getUser()` | `jwtService.verifyToken()` | REAL |

### What Undermines It

| Vulnerability | Location | Severity |
|---|---|---|
| Platform role from user-modifiable metadata | `PlatformAuthService.ts:79` | CRITICAL |
| `user_metadata.role` accepted as platform role | `PlatformAuthService.ts:79` | CRITICAL |

### Can a Tenant JWT Authenticate as Platform?

**NO.** `platformAuthMiddleware` calls `supabase.auth.getUser(token)`. A tenant JWT is:
- Signed with `FIREFLOW_JWT_SECRET` (HMAC-SHA256)
- Not a Supabase JWT
- Will fail Supabase's verification
- Will return `{ valid: false }`

### Can a Tenant SUPER_ADMIN Access Platform Routes?

**NOT via JWT.** But if that same person has a Supabase account and modifies their `user_metadata.platform_role`, they CAN.

---

## F. /api/platform/* Review

| Route | Method | Middleware | Role Required | Status |
|---|---|---|---|---|
| `/api/platform/health` | GET | `platformAuthMiddleware` | Any platform role | Implemented |
| `/api/platform/licenses` | GET | `platformAuthMiddleware` + `requirePlatformRole` | PLATFORM_OWNER, SUPPORT_ENGINEER, SUPPORT_AGENT | Stub |
| `/api/platform/tenants` | GET | `platformAuthMiddleware` + `requirePlatformRole` | PLATFORM_OWNER, SUPPORT_ENGINEER, SUPPORT_AGENT | Stub |
| `/api/platform/tenants/:id` | GET | `platformAuthMiddleware` + `requirePlatformRole` | PLATFORM_OWNER, SUPPORT_ENGINEER, SUPPORT_AGENT | Stub |
| `/api/platform/audit` | GET | `platformAuthMiddleware` + `requirePlatformRole` | PLATFORM_OWNER, SUPPORT_ENGINEER | Stub |

### Middleware Chain Verification

1. `platformAuthMiddleware` runs first — verifies Supabase token, sets `req.platformUser`
2. `requirePlatformRole(...)` runs second — checks `req.platformUser.role`
3. Route handler runs third — has access to `req.platformUser`

**No tenant middleware touches these routes. No `authMiddleware` runs. No `x-target-restaurant` is read.**

---

## G. /api/super-admin/* Review

| Route | Method | Current Auth | Role Source | Classification |
|---|---|---|---|---|
| `/api/super-admin/licenses` | GET | `authMiddleware` + `requireRole('SUPER_ADMIN', 'MANAGER')` | Tenant JWT | KEEP AS TENANT |
| `/api/super-admin/licenses/generate` | POST | `authMiddleware` + `requireRole('SUPER_ADMIN', 'MANAGER')` | Tenant JWT | KEEP AS TENANT |
| `/api/super-admin/licenses/apply` | POST | `authMiddleware` + `requireRole('SUPER_ADMIN', 'MANAGER')` | Tenant JWT | KEEP AS TENANT |
| `/api/super-admin/licenses/:id/revoke` | PATCH | `authMiddleware` + `requireRole('SUPER_ADMIN', 'MANAGER')` | Tenant JWT | KEEP AS TENANT |
| `/api/super-admin/licenses` | DELETE | `authMiddleware` + `requireRole('SUPER_ADMIN', 'MANAGER')` | Tenant JWT | KEEP AS TENANT |
| `/api/super-admin/payments/verify` | POST | `authMiddleware` + `requireRole('SUPER_ADMIN', 'MANAGER')` | Tenant JWT | KEEP AS TENANT |
| `/api/super-admin/restaurants` | GET | `authMiddleware` + `requireRole('SUPER_ADMIN', 'MANAGER')` | Tenant JWT | KEEP AS TENANT |

### Overlap Analysis

| Platform Route | Super-Admin Route | Overlap? | Decision |
|---|---|---|---|
| `/api/platform/licenses` | `/api/super-admin/licenses` | Partial | SEPARATE — platform shows all tenants, super-admin shows tenant's own |
| `/api/platform/tenants` | `/api/super-admin/restaurants` | Partial | SEPARATE — platform shows all tenants, super-admin shows tenant's own |
| `/api/platform/audit` | None | No overlap | NEW |

**These routes serve different purposes:**
- `/api/super-admin/*` = tenant-level SUPER_ADMIN managing their own restaurant's SaaS metadata
- `/api/platform/*` = platform-level management of ALL tenants

**They should NOT be merged.** The `SUPER_ADMIN` tenant role is not the same as `PLATFORM_OWNER`.

### What About `x-target-restaurant`?

`authMiddleware` allows `SUPER_ADMIN` to override `req.restaurantId` via `x-target-restaurant` header. This means a tenant SUPER_ADMIN can already access other tenants' data through `/api/super-admin/*` routes. This is a **pre-existing Mission 003 finding** and is NOT addressed by this mission.

---

## H. Test Assessment

### Test File: `tests/platform-auth.test.ts`

| Test | Classification | Assessment |
|---|---|---|
| Missing Authorization header | Partially meaningful | Tests middleware rejection, but uses fake `res` object that always returns truthy `res.status(401)` check |
| Invalid token format | Partially meaningful | Tests rejection, but does not verify actual Supabase verification |
| Platform role enforcement | Meaningful | Tests `requirePlatformRole` middleware logic correctly |
| PlatformAuthService initialization | Minimal | Only checks that the service object exists |

### Test Gaps

| Gap | Severity | Why It Matters |
|---|---|---|
| No real Supabase token verification test | HIGH | Cannot verify that `supabase.auth.getUser()` is actually called correctly |
| No test for `user_metadata` role spoofing | CRITICAL | The main vulnerability is untested |
| No test for tenant JWT rejection | HIGH | Cannot verify tenant tokens are rejected |
| No test for expired token handling | MEDIUM | Cannot verify expiry handling |
| No test for `x-target-restaurant` ignoring | MEDIUM | Cannot verify platform auth ignores tenant headers |
| Mock `res` object is flawed | LOW | `res.status(401)` returns an object, so `res.status(401)` is always truthy |

### Test Quality Summary

**PARTIALLY MEANINGFUL** — The tests verify middleware flow logic but do not exercise real Supabase verification or the actual security boundaries. The most critical vulnerability (user_metadata role spoofing) is completely untested.

---

## I. Security Issues Found

### CRITICAL

| # | Issue | Location | Description |
|---|---|---|---|
| 1 | Platform role from user-modifiable metadata | `PlatformAuthService.ts:79` | `user_metadata.platform_role` can be set by the authenticated user. A malicious Supabase user can grant themselves `PLATFORM_OWNER`. |

### HIGH

| # | Issue | Location | Description |
|---|---|---|---|
| 2 | Service-role key fallback to anon key | `PlatformAuthService.ts:27` | If `SUPABASE_SERVICE_KEY` is not set, the code falls back to `SUPABASE_ANON_KEY`. The anon key has broader permissions and may allow reading user metadata. |
| 3 | No test coverage for role spoofing | `tests/platform-auth.test.ts` | The critical vulnerability is not tested. |

### MEDIUM

| # | Issue | Location | Description |
|---|---|---|---|
| 4 | Tests use flawed mock `res` object | `tests/platform-auth.test.ts:14` | `res.status(401)` returns an object, making status checks always truthy. |
| 5 | No test for real Supabase verification | `tests/platform-auth.test.ts` | Cannot verify actual token verification works. |

### LOW

| # | Issue | Location | Description |
|---|---|---|
| 6 | Platform health endpoint exposes user info | `platformRoutes.ts:15-22` | Returns `req.platformUser` details. Low risk for health endpoint but should be reviewed. |

---

## J. Required Corrections

### CRITICAL — Must Fix Before Production

1. **Remove `user_metadata` from platform role extraction**
   - Only use `app_metadata.platform_role` or `app_metadata.role`
   - `user_metadata` must NEVER be trusted for platform authority
   - File: `src/api/services/platform/PlatformAuthService.ts:75-86`

### HIGH — Should Fix Soon

2. **Remove anon-key fallback for platform auth**
   - Require `SUPABASE_SERVICE_KEY` explicitly
   - Fail closed if service key is not configured
   - File: `src/api/services/platform/PlatformAuthService.ts:27`

3. **Add real Supabase integration tests**
   - Test with actual Supabase test project
   - Test role spoofing attempt
   - Test tenant JWT rejection
   - File: `tests/platform-auth.test.ts`

### MEDIUM — Nice to Have

4. **Fix test mock `res` object**
   - Use proper Express mock or testing library
   - File: `tests/platform-auth.test.ts`

5. **Review platform health endpoint**
   - Consider whether user details should be exposed
   - File: `src/api/routes/platformRoutes.ts:15-22`

---

## K. Recommended Next Mission

**Mission 005D — Platform Role Hardening & Testing**

This mission should:

1. Fix `PlatformAuthService.extractPlatformRole()` to use ONLY `app_metadata` (never `user_metadata`)
2. Remove anon-key fallback; require `SUPABASE_SERVICE_KEY`
3. Add real Supabase integration tests with a test project
4. Test the actual security boundary: tenant JWT rejection, expired token rejection, role spoofing prevention
5. Verify `x-target-restaurant` cannot affect platform auth

This mission must complete before any support access, tenant lifecycle, or AI agent work begins, because those features depend on a trustworthy platform identity.
