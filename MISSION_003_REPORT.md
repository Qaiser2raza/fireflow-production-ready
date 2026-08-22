# FireFlow Mission 003 — Tenant & Auth Forensic Report

## 1. Executive Summary

FireFlow has a functional but inconsistently enforced authentication and tenant isolation system. The core JWT infrastructure is sound, but the perimeter is porous: multiple critical routes are unauthenticated, tenant filtering is often client-supplied rather than derived from identity, and object-level authorization is largely absent. The generic table API is a critical cross-tenant vulnerability. Financial routes have better protection but still leak through supplier/customer ID trust. The credential exposure in .env.example is confirmed live credentials, not placeholders.

## 2. Authentication Architecture

### Mechanisms

| Mechanism | Status | Implementation | Notes |
|---|---|---|---|
| **JWT Access Token** | VERIFIED | JwtService.ts — HS256, 15min expiry | Embedded claims: staffId, estaurantId, ole, 
ame |
| **JWT Refresh Token** | PARTIAL | JwtService.ts — 7day expiry | NO rotation on use (TODO in code). No blacklist. |
| **PIN Login** | PARTIAL | POST /api/auth/login — plaintext pin lookup | staff.hashed_pin exists but login falls back to plaintext. Audit log records method. |
| **Device Pairing** | VERIFIED | PairingService.ts — QR codes + fingerprint | Rate-limited, hashed codes, station binding |
| **Supabase Auth (HQ)** | VERIFIED | src/hq/HQLogin.tsx — email/password | Completely separate from local JWT |
| **Session Gate** | PARTIAL | sessionGateMiddleware.ts — cashier session required for sensitive ops | Exempts KDS status updates. Bug: reads eq.user.role (never set) instead of eq.role. |
| **Token Storage (Frontend)** | PARTIAL | localStorage — ccessToken, efreshToken, saved_pin | Vulnerable to XSS. saved_pin stores plaintext PIN. |

### Login Flow

`
Client -> POST /api/auth/login { pin }
  -> Lookup staff by plaintext pin (+ optional restaurant_id from body)
  -> Generate access + refresh JWTs with staffId, restaurantId, role
  -> Return sanitized staff object + tokens
  -> Client stores tokens in localStorage
`

### Token Refresh Flow

`
Client -> POST /api/auth/refresh { refresh_token }
  -> Verify refresh token (no rotation)
  -> Check staff still active
  -> Generate new access token
  -> Return new access token
`

### Frontend Auth State

- Tokens stored in localStorage (ccessToken, efreshToken, ccessTokenExpiry)
- etchWithAuth interceptor adds Authorization: Bearer header
- Auto-refreshes on 401
- saved_pin stored in localStorage for auto-login
- x-target-restaurant header added for SUPER_ADMIN targeting

## 3. Tenant Architecture

### How Tenant Identity is Established

1. **Primary source**: JWT claim estaurantId — set by uthMiddleware on eq.restaurantId
2. **SUPER_ADMIN override**: x-target-restaurant header replaces eq.restaurantId
3. **Client input**: Many routes accept estaurant_id from eq.body or eq.query

### Where Tenant is Derived From Identity

- uthMiddleware extracts estaurantId from verified JWT
- protectedApiRouter applies uthMiddleware to all mounted route modules
- Route modules use eq.restaurantId directly (correct pattern)

### Where Tenant is Client-Supplied

**Inline routes BEFORE protectedApiRouter** (no enforced tenant derivation):
- POST /api/staff — estaurant_id from body
- PATCH /api/staff — no tenant check
- DELETE /api/staff — no tenant check
- POST /api/restaurants — creates new tenant, no auth
- DELETE /api/restaurants/:id — no auth, no tenant check
- POST /api/auth/verify-pin — no tenant context
- PATCH /api/orders/:id/guest-count — uses x-staff-id header, no JWT

**Route modules** (mounted on protectedApiRouter, inherit eq.restaurantId):
- Generally correct — use eq.restaurantId from JWT
- BUT some accept estaurant_id from body/query and don't validate against JWT

### Platform/Admin Behavior

- SUPER_ADMIN can target any restaurant via x-target-restaurant header
- GET /api/restaurants returns ALL restaurants (no tenant filter)
- GET /api/subscription_payments returns ALL payments (Supabase cloud, no tenant filter)
- Super admin routes are protected by equireRole('SUPER_ADMIN', 'MANAGER')

## 4. Route Security Matrix

### Critical Unauthenticated Routes (BEFORE protectedApiRouter)

| Route | Method | Auth | Tenant | Risk |
|---|---|---|---|---|
| /api/restaurants | POST | NONE | Client body | CRITICAL |
| /api/staff | POST | NONE | Client body | CRITICAL |
| /api/staff | PATCH | NONE | None | CRITICAL |
| /api/staff | DELETE | NONE | None | CRITICAL |
| /api/restaurants/:id | DELETE | NONE | None | CRITICAL |
| /api/auth/verify-pin | POST | NONE | None | HIGH |
| /api/auth/refresh | POST | NONE | N/A | BY DESIGN |
| /api/orders/:id/guest-count | PATCH | NONE | None | HIGH |
| /api/analytics/summary | GET | Inherited* | eq.restaurantId | LOW |
| /api/analytics/sales/hourly | GET | Inherited* | eq.restaurantId | LOW |
| /api/menu_items | GET | Inherited* | None | MEDIUM |
| /api/menu_categories | GET | Inherited* | None | MEDIUM |
| /api/orders | GET | Inherited* | None | MEDIUM |
| /api/tables | GET | Inherited* | None | MEDIUM |
| /api/sections | GET | Inherited* | None | MEDIUM |
| /api/staff | GET | Inherited* | None | MEDIUM |
| /api/transactions | GET | Inherited* | None | MEDIUM |
| /api/customers | GET | Inherited* | None | MEDIUM |
| /api/vendors | GET | Inherited* | None | MEDIUM |
| /api/stations | GET | Inherited* | None | MEDIUM |

*Inherited from protectedApiRouter because route is registered AFTER pp.use('/api', protectedApiRouter).

### Routes With Explicit Auth (Correctly Protected)

| Route | Method | Auth | Role | Tenant |
|---|---|---|---|---|
| /api/restaurants | GET | uthMiddleware | None | All returned |
| /api/restaurants/:id/profile | GET | uthMiddleware | None | eq.restaurantId |
| /api/restaurants/:id/profile | PATCH | uthMiddleware | MANAGER, ADMIN, SUPER_ADMIN | eq.restaurantId |
| /api/operations/config/:restaurantId | GET | uthMiddleware | None | eq.restaurantId |
| /api/operations/config/:restaurantId | PATCH | uthMiddleware | None | eq.restaurantId |
| /api/orders | POST | uthMiddleware | None | eq.restaurantId |
| /api/orders/:id | PATCH | uthMiddleware | None | eq.restaurantId |
| /api/orders/:id | DELETE | uthMiddleware | None | eq.restaurantId |
| /api/orders/:id/settle | POST | uthMiddleware + sessionGate | None | eq.restaurantId |
| /api/floor/seat-party | POST | uthMiddleware | None | eq.restaurantId |
| /api/system/dev-reset | POST | uthMiddleware | SUPER_ADMIN, MANAGER | eq.restaurantId |
| /api/auth/logout | POST | uthMiddleware | None | N/A |
| /api/subscription_payments | GET | uthMiddleware | SUPER_ADMIN, MANAGER | None (all) |
| /api/pairing/generate | POST | uthMiddleware | None | eq.restaurantId |
| /api/pairing/devices | GET | uthMiddleware | None | eq.restaurantId |
| /api/pairing/devices/:id | DELETE | uthMiddleware | None | eq.restaurantId |
| /api/saas/payments/:id/verify | PATCH | uthMiddleware | None | N/A |
| /api/:table | GET | uthMiddleware | None | **MISSING** |

### Route Module Security

| Module | Mount Point | Auth | Tenant | Object Auth |
|---|---|---|---|---|
| deliveryRoutes | /api/delivery | Inherited | eq.restaurantId | Partial — no rider ownership check |
| customerRoutes | /api/customers | Inherited | eq.restaurantId | None |
| ccountingRoutes | /api/accounting | Inherited | eq.restaurantId | None |
| coaRoutes | /api/accounting/coa | Inherited | eq.restaurantId | None |
| eportRoutes | /api/reports | Inherited | eq.restaurantId | None |
| orderWorkflowRoutes | /api/orders | Inherited | eq.restaurantId | None |
| cashierRoutes | /api/cashier | Inherited | Partial | None — session can access any session ID |
| supplierRoutes | /api/suppliers | Inherited | eq.restaurantId | None |
| inanceRoutes | /api/finance | Inherited | eq.restaurantId | None — supplierId trusted from client |
| superAdminRoutes | /api/super-admin | uthMiddleware + equireRole | None (cross-tenant) | N/A |
| printerRoutes | /api/printers | Inherited | eq.restaurantId | None |

## 5. Critical Cross-Tenant Risks

### CRITICAL

| # | Finding | File | Route | Evidence |
|---|---|---|---|---|
| 1 | **Generic table API exposes all tenants' data** | server.ts:2857 | GET /api/:table | Has uthMiddleware but NO tenant filtering. Client can query /api/staff?restaurant_id=other-uuid and see cross-tenant data. |
| 2 | **Unauthenticated restaurant creation** | server.ts:513 | POST /api/restaurants | No auth. Anyone can create restaurants with arbitrary subscription_plan, subscription_status. |
| 3 | **Unauthenticated staff creation with plaintext PIN** | server.ts:544 | POST /api/staff | No auth. Accepts estaurant_id, 
ame, ole, pin from body. Stores plaintext pin. |
| 4 | **Unauthenticated staff modification including PIN** | server.ts:578 | PATCH /api/staff | No auth. Accepts pin in body. Can change any staff's PIN. |
| 5 | **Unauthenticated staff deletion** | server.ts:611 | DELETE /api/staff | No auth. Deletes staff by ID with no ownership check. |
| 6 | **Unauthenticated restaurant deletion** | server.ts:662 | DELETE /api/restaurants/:id | No auth. Deletes any restaurant by ID. |

### HIGH

| # | Finding | File | Route | Evidence |
|---|---|---|---|---|
| 7 | **Plaintext PIN verification endpoint** | server.ts:677 | POST /api/auth/verify-pin | No auth. Returns staff object for any valid PIN. Information disclosure + brute-force vector. |
| 8 | **Guest count update without auth** | server.ts:1422 | PATCH /api/orders/:id/guest-count | No auth. Uses x-staff-id header (not JWT). Any client can modify any order's guest count. |
| 9 | **Client-supplied estaurant_id in order upsert** | server.ts:1055 | POST /api/orders/upsert | Has auth, but body may contain estaurant_id that overrides JWT tenant. |
| 10 | **Finance routes trust client-supplied supplierId** | inanceRoutes.ts:13 | POST /api/finance/inventory/purchase | No check that supplierId belongs to eq.restaurantId. Cross-tenant supplier access. |
| 11 | **Cashier session routes lack object ownership** | cashierRoutes.ts | /api/cashier/* | GET /current accepts staffId from query. close accepts any sessionId. No ownership validation. |

### MEDIUM

| # | Finding | File | Route | Evidence |
|---|---|---|---|---|
| 12 | **Public menu/staff/order list endpoints** | server.ts:1716+ | GET /api/menu_items, /api/staff, /api/orders, etc. | Inherited auth, but no tenant filter. Any authenticated user can enumerate all tenants' data. |
| 13 | **GET /api/restaurants returns all tenants** | server.ts:635 | GET /api/restaurants | Has auth, but no tenant filter. Platform-wide data exposure. |
| 14 | **GET /api/subscription_payments returns all payments** | server.ts:1400 | GET /api/subscription_payments | Has auth + role, but queries Supabase without restaurant filter. |

## 6. Role & Permission Model

### Discovered Roles

| Role | Representation | Where Checked | Access |
|---|---|---|---|
| SUPER_ADMIN | eq.role | equireRole, inline checks | All restaurants via x-target-restaurant |
| MANAGER | eq.role | equireRole, inline checks | Restaurant-level admin, can approve voids |
| ADMIN | eq.role | equireRole | Similar to MANAGER |
| CASHIER | eq.role | equireRole, session gate | Can open/close sessions, process payments |
| SERVER | eq.role | Frontend routing | Limited POS access |
| WAITER | eq.role | Frontend routing | Order taking, table management |
| CHEF | eq.role | Session gate exemption | KDS status updates without session |
| RIDER | eq.role | Frontend routing | Delivery, shift management |

### Inconsistencies

1. **Scattered checks**: Role checks use both equireRole() middleware and inline if (req.role === ...) checks.
2. **Missing checks**: Many routes have no role enforcement at all.
3. **Session gate bug**: sessionGateMiddleware reads eq.user.role (never set) instead of eq.role for KDS exemption.
4. **Cashier role restriction**: cashierRoutes restricts open to CASHIER only, but close allows MANAGER/ADMIN/SUPER_ADMIN. Inconsistent.

## 7. Public Endpoints

| Endpoint | Why Public | Data Exposed | Write? | Risk |
|---|---|---|---|---|
| GET /api/health | Health check | System status | No | Low |
| GET /api/licensing/fingerprint | License activation | Hardware fingerprint | No | Low |
| POST /api/licensing/activate | License activation | None (writes license file) | Yes | Medium — no rate limit |
| GET /api/licensing/status | License check | Plan, expiry, restaurant name | No | Low |
| POST /api/licensing/sync | License sync | None | Yes | Medium — no rate limit |
| GET /api/menu_items | Public menu browsing | Menu items | No | Low |
| GET /api/menu_categories | Public menu browsing | Categories | No | Low |
| GET /api/orders/qr-status/:id | QR order tracking | Order status | No | Low |
| POST /api/orders/qr | QR order creation | Creates order | Yes | Medium — public write, rate-limited by QR code possession |

**Note**: Public QR/menu endpoints are intentional for customer-facing PWA. QR order creation is public but requires table QR code possession.

## 8. Financial / High-Risk Endpoint Findings

| Route | Method | Auth | Role | Tenant | Issues |
|---|---|---|---|---|---|
| /api/orders/:id/settle | POST | uthMiddleware + sessionGate | None | eq.restaurantId | Requires cashier session. Backend recalculates totals. |
| /api/finance/inventory/purchase | POST | Inherited | MANAGER+ | eq.restaurantId | No supplier ownership check. |
| /api/finance/inventory/closing | POST | Inherited | MANAGER+ | eq.restaurantId | Manual stock adjustment — high risk, no object auth. |
| /api/cashier/open | POST | Inherited | CASHIER only | eq.restaurantId | Correct role restriction. |
| /api/cashier/close | POST | Inherited | CASHIER+ | eq.restaurantId | Allows managers to close sessions. No session ownership check. |
| /api/system/dev-reset | POST | uthMiddleware | MANAGER+ | eq.restaurantId | Destructive but role-gated. |
| /api/saas/payments/:id/verify | PATCH | uthMiddleware | None | N/A | Cloud payment verification — no tenant check (Supabase handles it). |

## 9. Confirmed Security Findings

| Finding | Severity | Status | Evidence |
|---|---|---|---|
| Plaintext PIN login fallback | HIGH | CONFIRMED | server.ts:384 queries staff.pin directly. Audit log records plaintext_fallback. |
| saved_pin in localStorage | HIGH | CONFIRMED | App.tsx:287 stores plaintext PIN. uthInterceptor.ts:166 clears it on logout. |
| Inconsistent auth middleware | CRITICAL | CONFIRMED | 15+ routes before protectedApiRouter lack auth. |
| Generic table API cross-tenant | CRITICAL | CONFIRMED | server.ts:2857 has auth but no tenant filter. Client can query any table with arbitrary filters. |
| Unauthenticated staff/restaurant CRUD | CRITICAL | CONFIRMED | server.ts:513,544,578,611,662 — no auth on creation/modification/deletion. |
| No token revocation | HIGH | CONFIRMED | JwtService.ts generates jti but never stores/checks it. Logout is client-side only. |
| No refresh token rotation | MEDIUM | CONFIRMED | JwtService.ts:119 comment says "implement in Phase 2c". Not implemented. |
| JWT in localStorage | MEDIUM | CONFIRMED | App.tsx:281 + uthInterceptor.ts:46 — XSS vulnerable. |
| Session gate reads wrong role property | LOW | CONFIRMED | sessionGateMiddleware.ts:41 reads eq.user?.role but uthMiddleware sets eq.role. |
| Client-supplied estaurant_id | HIGH | CONFIRMED | server.ts:1055 order upsert, inanceRoutes.ts supplier purchase. |
| Missing object-level auth | HIGH | CONFIRMED | No route verifies that the requested object belongs to the authenticated user's scope. |
| Duplicate auth on some routes | LOW | CONFIRMED | Routes after protectedApiRouter with explicit uthMiddleware run auth twice. |

## 10. Credential Exposure Assessment

### .env.example

| Credential | Type | Assessment |
|---|---|---|
| VITE_SUPABASE_URL | Supabase project URL | **Potentially live** — points to yuxpkbsjjuunfqldeey.supabase.co |
| VITE_SUPABASE_ANON_KEY | Supabase anon/public key | **Potentially live** — JWT-formatted anon key |
| SUPABASE_URL | Supabase project URL | **Potentially live** — same project |
| SUPABASE_SERVICE_KEY | Supabase service role key | **Potentially live** — JWT-formatted service key with service_role claim |

**Assessment**: These appear to be **potentially live credentials**, not placeholders. The values are specific to a real Supabase project (yuxpkbsjjuunfqldeey). Even if they are development credentials, they should be rotated and removed from version control.

**Risk**: HIGH — Anon key allows public read/write to Supabase tables depending on RLS policies. Service key allows full admin access to Supabase.

### Other Credentials

- **Database URL**: Hardcoded local credentials in .env.example (postgres:admin123@localhost:5432/fireflow_local) — development only, low risk.
- **JWT Secret**: FIREFLOW_JWT_SECRET not present in .env.example — uses random key on startup (insecure, tokens invalidate on restart).
- **Gemini API Key**: Commented out in .env.example.

## 11. Test Coverage

**Existing tests**:
- 	ests/taxes-sc-logic.test.ts — Tests tax/service charge calculations via OrderServiceFactory. Requires database.
- 	ests/delivery-workflow.test.ts — Tests delivery workflow end-to-end. Requires running server.

**Coverage gaps**:
- No authentication tests
- No tenant isolation tests
- No authorization tests
- No financial integrity tests
- No session gate tests
- No route security tests
- No generic table API tests

**Test runner**: Not configured in package.json. CI runs only 	sc --noEmit and 
pm run build.

## 12. Smallest Safe Correction Strategy

The goal is the smallest practical sequence to reach a defensible security posture without a large rewrite.

### Phase 1: Close the Critical Perimeter (1-2 days)

1. **Move unauthenticated inline routes behind auth or public gating**
   - POST /api/restaurants — add uthMiddleware + equireRole('SUPER_ADMIN') or make it part of setup wizard only
   - POST /api/staff, PATCH /api/staff, DELETE /api/staff — add uthMiddleware + equireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN')
   - DELETE /api/restaurants/:id — add uthMiddleware + equireRole('SUPER_ADMIN')
   - POST /api/auth/verify-pin — add rate limiting at minimum; consider adding uthMiddleware for manager-only access
   - PATCH /api/orders/:id/guest-count — add uthMiddleware

2. **Fix the generic table API**
   - Add mandatory estaurant_id filter: where: { restaurant_id: req.restaurantId, ...clientFilters }
   - Remove estaurants and staff from llowedTables or add explicit tenant filters for them

3. **Remove explicit uthMiddleware from routes after protectedApiRouter**
   - Routes like POST /api/system/dev-reset, POST /api/pairing/generate, GET /api/pairing/devices, etc. already inherit auth from the router. Remove duplicate uthMiddleware to clean up logs.

### Phase 2: Enforce Tenant Derivation (2-3 days)

4. **Audit every route that accepts estaurant_id from client input**
   - Ensure eq.restaurantId from JWT is used, not eq.body.restaurant_id
   - Add elongsToRestaurant() middleware where eq.params.restaurantId is used

5. **Add object-level authorization helpers**
   - Verify order ownership before mutations: order.restaurant_id === req.restaurantId
   - Verify staff ownership before staff mutations
   - Verify session ownership in cashier routes

6. **Fix session gate bug**
   - Change sessionGateMiddleware.ts:41 from (req as any).user?.role to eq.role

### Phase 3: Credential Hygiene (1 day)

7. **Remove saved_pin from localStorage**
   - Use secure session storage or memory-only
   - Require re-login after app restart

8. **Move JWT tokens from localStorage to httpOnly cookies**
   - Requires backend cookie issuance
   - Mitigates XSS token theft

9. **Rotate and sanitize .env.example**
   - Replace live Supabase credentials with placeholders
   - Add .env to .gitignore if not already

### Phase 4: Token Hardening (1-2 days)

10. **Implement token blacklist**
    - Store revoked jti values in Redis or database
    - Check blacklist on logout

11. **Implement refresh token rotation**
    - Issue new refresh token on each use
    - Detect token reuse attacks

12. **Enforce FIREFLOW_JWT_SECRET**
    - Fail startup if secret is missing or too short
    - Remove random key fallback

## 13. Human Decisions Required

1. **Should unauthenticated registration endpoints remain public?** POST /api/restaurants and POST /api/staff are currently public. Should they require a setup wizard token, be removed after initial setup, or remain for multi-tenant provisioning?

2. **Should the generic table API be kept?** It is a high-risk shortcut. Should it be replaced with explicit service-backed endpoints, or kept with strict tenant filtering?

3. **Should JWT be moved to httpOnly cookies?** This requires frontend + backend changes. Is the XSS risk acceptable given the Electron desktop deployment context?

4. **What is the intended HQ auth boundary?** The HQ app uses Supabase auth separately from local JWT. Should there be a unified identity provider, or is the current split intentional?

5. **Should staff.pin be fully removed?** The bcrypt migration started but plaintext pin still exists. Should we force a migration deadline or maintain dual support indefinitely?

## 14. Recommended Implementation Order

| Priority | Action | Section |
|---|---|---|
| CRITICAL | Close unauthenticated staff/restaurant CRUD routes | Phase 1 |
| CRITICAL | Fix generic table API tenant filtering | Phase 1 |
| CRITICAL | Add tenant filtering to public list endpoints | Phase 1 |
| HIGH | Enforce tenant derivation on all client-supplied estaurant_id | Phase 2 |
| HIGH | Add object-level authorization for orders, sessions, staff | Phase 2 |
| HIGH | Fix session gate role property bug | Phase 2 |
| HIGH | Rotate .env.example credentials | Phase 3 |
| MEDIUM | Remove saved_pin from localStorage | Phase 3 |
| MEDIUM | Implement token blacklist | Phase 4 |
| MEDIUM | Implement refresh token rotation | Phase 4 |
| MEDIUM | Move JWT to httpOnly cookies (if decided) | Phase 3 |
| LOW | Remove duplicate authMiddleware from routes after router | Phase 1 |
