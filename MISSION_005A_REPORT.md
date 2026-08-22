# FireFlow Mission 005A — Platform Identity & Control Plane Forensic Design

## 1. Current Architecture

### Authentication Architecture

FireFlow has **two separate, disconnected authentication systems**:

#### A. Local JWT System (Tenant Operations)

| Component | Location | Status |
|---|---|---|
| Login endpoint | POST /api/auth/login | VERIFIED — accepts PIN, returns access + refresh JWTs |
| JWT Service | src/api/services/auth/JwtService.ts | VERIFIED — HS256, 15min access, 7day refresh |
| Auth middleware | src/api/middleware/authMiddleware.ts | PARTIAL — extracts staffId, restaurantId, role from JWT |
| Role middleware | requireRole() in authMiddleware | PARTIAL — scattered usage |
| Session gate | src/api/middleware/sessionGate.ts | PARTIAL — requires cashier session for sensitive ops |
| Token storage | Frontend localStorage | VERIFIED — accessToken, refreshToken, saved_pin |
| PIN auth | staff.pin + staff.hashed_pin | PARTIAL — plaintext fallback still active |

Key facts:
- JWT payload contains: staffId, restaurantId, role, name, type (access/refresh)
- authMiddleware attaches claims to req.staffId, req.restaurantId, req.role
- SUPER_ADMIN can override tenant via x-target-restaurant header
- Refresh tokens are NOT rotated (TODO comment in code)
- No token revocation/blacklist exists
- saved_pin stored in localStorage for auto-login

#### B. Supabase Auth System (HQ/Control Plane)

| Component | Location | Status |
|---|---|---|
| HQ Login | src/hq/HQLogin.tsx | VERIFIED — Supabase signInWithPassword |
| HQ App | src/hq/ | VERIFIED — Vercel-deployed React app |
| Auth client | @supabase/supabase-js | VERIFIED — separate from local JWT |
| Session | Supabase session object | VERIFIED — managed by Supabase client |

Key facts:
- HQ uses Supabase Auth exclusively (email/password)
- No connection to local JWT system
- No shared identity between HQ and tenant operations
- HQ session is stored in Supabase client state
- No role hierarchy beyond Supabase's built-in roles

Interaction Between Systems: There is NO interaction. The two auth systems are completely separate.

### HQ / SaaS Control Plane

Current reality: The HQ app is a **separate Vercel-deployed React application** with its own Supabase authentication. It provides license management, subscription payments, and restaurant overview. The superAdminRoutes are mounted on the LOCAL Express API, not on the HQ app. This means HQ is purely a UI layer that calls local endpoints.

### Tenant Architecture

Tenant Root Model: restaurants is the tenant root, with staff, orders, menu_items, inventory_items, chart_of_accounts, cashier_sessions as children.

Tenant Identity Derivation:
- JWT claim restaurantId: YES — extracted by authMiddleware from token
- x-target-restaurant header: YES — SUPER_ADMIN override, role-gated
- req.body.restaurant_id: NO — client-supplied, security risk
- req.query.restaurant_id: NO — client-supplied, security risk
- req.params.restaurantId: PARTIAL — validated by belongsToRestaurant() middleware

Where Tenant is Correctly Derived:
- Route modules on protectedApiRouter inherit req.restaurantId from JWT
- Services use req.restaurantId directly
- belongsToRestaurant() validates URL param against JWT claim

Where Tenant is Client-Supplied:
- POST /api/restaurants — no restaurant_id required
- POST /api/staff — accepts restaurant_id from body
- PATCH /api/staff — no tenant check
- DELETE /api/staff — no tenant check
- POST /api/orders/upsert — body may contain restaurant_id
- financeRoutes.ts — accepts supplierId without ownership check
- Generic table API GET /api/:table — accepts restaurant_id from query

### Module / Feature Infrastructure

There is NO Module Registry or Dependency Resolver in the codebase.

| Component | Status | Evidence |
|---|---|---|
| Feature flags | EXISTS — CLIENT-SIDE ONLY | featureFlags.ts — global + per-restaurant overrides in memory |
| Restaurant features DB | EXISTS — UNUSED IN CODE | restaurant_features model in Prisma — JSON blob per restaurant |
| Order type defaults | EXISTS — USED | order_type_defaults table — per-tenant tax/service charge config |
| License keys | EXISTS — FUNCTIONAL | license_keys table + SuperAdminService |
| Subscription payments | EXISTS — FUNCTIONAL | subscription_payments table + Supabase cloud |
| Module registry | MISSING | No module/entitlement system found |
| Dependency resolver | MISSING | No dependency injection or module resolution found |

Conclusion: featureFlags.ts + restaurant_features table CAN become the foundation for tenant entitlements, but they are currently client-side only and not integrated with route authorization.

### Audit / Security Infrastructure

| Component | Status | Evidence |
|---|---|---|
| audit_logs | EXISTS — PARTIAL | restaurant_id, staff_id, action_type, entity_type, entity_id, details |
| approval_logs | EXISTS — FUNCTIONAL | Two-user approval pattern |
| system_logs | EXISTS | system_logs table in schema |
| security_events | EXISTS | security_events table in schema |
| Device pairing | EXISTS | pairing_codes, registered_devices — rate-limited, hashed |
| Platform action audit | MISSING | No audit trail for support/platform actions outside a tenant |
| AI action audit | MISSING | No audit trail for AI agent actions |
| Support session audit | MISSING | No support session model |

## 2. Current Identity Model

Platform Identity (Supabase Auth) is completely separate from Tenant Identity (Local JWT). There is NO interaction between them. The same role names (SUPER_ADMIN, MANAGER, ADMIN) exist in both systems but with DIFFERENT meanings. There is no mechanism to distinguish a platform SUPER_ADMIN from a tenant SUPER_ADMIN.

## 3. Current Control Plane

HQ/SuperAdmin provides: license generation/application/revocation/deletion, payment verification, restaurant list/overview. HQ does NOT provide: tenant health monitoring, diagnostics, support access sessions, controlled tenant targeting, audit trail for platform actions, support case management, backup/recovery, AI-assisted support, module/entitlement management, integration management.

HQ App Structure:
- src/hq/hq-main.tsx — Entry point
- src/hq/HQApp.tsx — App shell with Supabase auth
- src/hq/HQLogin.tsx — Supabase email/password login
- src/hq/HQDashboard.tsx — Main dashboard with tabs: overview, restaurants, payments, licenses

## 4. Gap Analysis

### Critical Gaps (Block Managed SaaS Model)

1. Platform identity separate from tenant identity — Same SUPER_ADMIN role in both systems
2. Unauthenticated tenant provisioning — POST /api/restaurants is public
3. No support access model — SUPER_ADMIN = unrestricted access
4. No tenant lifecycle — Only subscription_status (trial/active/expired)
5. No platform action audit trail — Audit logs are tenant-scoped only
6. No backup/recovery — None

### High Gaps

7. No tenant health model — Local HealthMonitor only
8. No integration extension boundary — FBR, payments hardcoded
9. No module/entitlement system — restaurant_features unused
10. Inconsistent auth enforcement — Many unauthenticated routes
11. Split auth systems — Local JWT + Supabase auth

### Medium Gaps

12. Configuration not persisted — operations/config in-memory
13. No support case system — None
14. No diagnostic/runbook system — None
15. No tenant-level alerting — None

## 5. Proposed Target Boundary

Platform Identity (Supabase Auth + Platform Roles)
        |
        v
Platform Authorization (requirePlatformRole)
        |
        v
Support Session / Tenant Scope (time-limited, auditable)
        |
        v
Tenant Boundary
        |
        v
Tenant Identity (Local JWT with staffId + restaurantId)
        |
        v
Restaurant Roles (SUPER_ADMIN, MANAGER, ADMIN, CASHIER, SERVER, WAITER, CHEF, RIDER)

Key Principles:
1. Platform Identity is SEPARATE from Tenant Identity
2. Platform Authorization is ROLE-BASED above tenant roles
3. Support Access is SCOPED and TEMPORARY
4. Tenant Isolation is ENFORCED at multiple layers

## 6. Support Access Design

Conceptual Model:
Platform Owner
    |
    +-- Support Engineer / Tenant Administrator
    |       |
    |       +-- Support Agent
    |               |
    |               +-- AI Support Agent
    |                       |
    +-----------------------+
                       |
                       v
                   Tenant

Capability Matrix:
- Platform Owner: All tenants, all actions including create/delete tenant
- Support Engineer: Assigned tenants, config/features/diagnostics, dangerous writes allowed
- Support Agent: Assigned tenants, diagnostics only, no writes
- AI Support Agent: Scoped tenant data, safe ops only

Implementation Approach (simplest path using existing infrastructure):
1. Platform auth — Supabase auth in HQ app (already exists)
2. Platform roles — Store in Supabase platform_users table or custom claims
3. Support sessions — New support_sessions table in local DB
4. Platform API access — New platformAuthMiddleware
5. Audit trail — Extend audit_logs with platform_actor_id and platform_action fields

What Remains Protected:
- Financial records: no support/agent can modify transactions
- Permissions: no support/agent can change staff roles without Platform Owner
- Credentials: no support/agent can access or change passwords/PINs
- Tenant deletion: requires Platform Owner + explicit approval
- Accounting configuration: requires Platform Owner
- Integration credentials: requires Platform Owner

## 7. Tenant Lifecycle Design

Proposed Lifecycle:
PROVISIONING ? ONBOARDING ? CONFIGURATION ? READY ? ACTIVE ? SUSPENDED ? CLOSED ? ARCHIVED

Implementation Approach:
- Add lifecycle_state, lifecycle_entered_at, lifecycle_entered_by, lifecycle_reason to restaurants table
- OR create separate tenant_lifecycle table
- State transitions requiring platform authorization tracked in audit_logs

Current vs Target:
- Tenant creation: unauthenticated public ? platform-authenticated
- Initial state: subscription_status = trial ? lifecycle_state = PROVISIONING
- Activation: automatic on license ? support-assisted READY ? ACTIVE
- Suspension: no mechanism ? SUSPENDED with reason
- Closure: no mechanism ? CLOSED ? ARCHIVED

## 8. Onboarding Design

Proposed Managed Onboarding Flow:
Platform ? Create tenant ? PROVISIONING ? Support configures ? CONFIGURATION ? AI-assisted validation ? READY ? Tenant confirmation ? ACTIVE

How It Fits Existing Architecture:
- Create tenant: POST /api/restaurants (public) ? must become platform-authenticated
- Configure restaurant: PATCH /api/restaurants/:id/profile (limited fields)
- Configure menu: POST /api/menu_categories, POST /api/menu_items (works, no bulk import)
- Configure tables: POST /api/tables, POST /api/sections (works)
- Configure staff: POST /api/staff (works, no bulk import)
- Configure tax: order_type_defaults table (works)
- Validate: None ? need diagnostic runbooks
- Activate: No mechanism ? need lifecycle state transition

AI-Assisted Onboarding: AI can extract menu data, identify configuration problems, propose values, detect duplicates, validate configuration. But AI must not approve sensitive changes without human review.

## 9. Module / Integration Design

Current Integration Architecture:
- FBR: Hardcoded in fbrRoutes.ts + FBRService.ts
- Payments: Hardcoded in transactions + CashierSessionService
- Printers: PrinterService + printers table (closest to modular)
- Supabase: cloudClient.ts direct REST
- Socket.IO: socketClient.ts (functional but not integration-aware)

Proposed Module Boundary:
CORE (FireFlow restaurant operations)
    ?
MODULE / INTEGRATION / EXTENSION BOUNDARY
    ?
Tenant-specific configuration

Reuse of Existing Infrastructure (DO NOT create new module system):
1. restaurant_features table — Already stores JSON per tenant; can store enabled integrations
2. order_type_defaults table — Template for per-tenant config tables
3. featureFlags.ts — Global + per-tenant override pattern; move to server-side
4. printers table — Models hardware integration per tenant

Proposed Evolution:
- Phase 1: Activate restaurant_features server-side
- Phase 2: Add tenant_integrations table (if needed)
- Phase 3: Create IntegrationService
- Phase 4: Move FBR config to tenant_integrations
- Phase 5: Core services consult integration config

What NOT To Do:
- never create if (restaurant_id === "specific-client") in core
- never create tenant-specific forks
- never hardcode integration logic in core services

## 10. Backup Boundary

Responsibility Model:
- Platform (FireFlow/SaaS): Platform-wide backups, infrastructure, retention policies
- Tenant (Restaurant): Local data awareness, NOT backup responsibility in SaaS model
- Operational DB (Platform): Local PostgreSQL backups (per-tenant)
- SaaS Metadata (Platform): Supabase backups
- Audit/Financial (Platform): Special handling, immutable retention

Authorization Requirements:
- Backup creation: Platform automation
- Restore operation: Platform Owner approval required
- Tenant-level restore: Platform Engineer + explicit tenant authorization
- Financial record recovery: Platform Owner + audit trail immutable
- Point-in-time recovery: Platform Owner approval + time range specification

Current Reality: NO backup code exists. NO automated backups. NO restore capability. NO backup verification. This is a CRITICAL gap.

## 11. Security Model

How Target Architecture Addresses Mission 003 Findings:
- Unauthenticated tenant creation: CRITICAL ? Platform auth required
- Unauthenticated staff/restaurant CRUD: CRITICAL ? All CRUD behind auth; platform actions audited
- Generic table API cross-tenant: CRITICAL ? Mandatory restaurant_id filter; platform targeting via explicit header
- Client-supplied restaurant_id: HIGH ? Tenant derived exclusively from JWT + platform session
- No token revocation: HIGH ? Platform can revoke support sessions immediately; implement JWT blacklist
- No refresh token rotation: MEDIUM ? Implement rotation for both tenant and platform tokens
- Plaintext PIN: HIGH ? Remove plaintext path; support uses secure reset flow
- Saved PIN in localStorage: HIGH ? Remove saved_pin; device pairing replaces auto-login
- Inconsistent auth enforcement: CRITICAL ? Consistent auth on all routes
- Session gate bug: LOW ? Fix req.user.role to req.role
- JWT in localStorage: MEDIUM ? Evaluate per context; Electron desktop reduces XSS

New Security Requirements:
- Platform authentication: CRITICAL
- Support access sessions: CRITICAL
- Tenant action audit trail: HIGH
- Integration credential isolation: HIGH
- AI agent scope enforcement: HIGH
- Platform-to-tenant encryption: MEDIUM

## 12. Migration Strategy

Principle: EXISTING ? ADAPT ? EXTEND ? ONLY THEN REPLACE

What Can Be Reused As-Is:
- Local JWT system: Keep for tenant operations; extend with object-level auth
- Prisma schema: Keep structure; add lifecycle fields to restaurants
- Audit tables: Keep; extend with platform action fields
- Order abstraction: Keep BaseOrderService + OrderServiceFactory
- Socket.IO: Keep; extend for platform diagnostics
- Electron wrapper: Keep; platform does not replace desktop
- HQ app: Keep as UI shell; add platform roles
- SuperAdminService: Keep; extend with lifecycle management
- Feature flags: Keep; move to server-side

What Should Be Adapted:
- authMiddleware: Add platformAuthMiddleware for HQ routes; keep existing for tenant routes
- featureFlags.ts: Move initialization to server-side; load from DB
- restaurant_features: Activate; use for integration config
- restaurants table: Add lifecycle_state, lifecycle_entered_at
- subscription_payments: Keep; add automated expiry/suspension
- cloudClient.ts: Keep; abstract to IntegrationClient interface

What Must Eventually Be Replaced:
- Unauthenticated provisioning routes ? Platform-authenticated provisioning API
- staff.pin plaintext field ? Remove; use hashed_pin only
- saved_pin in localStorage ? Remove; use device pairing
- Generic table API ? Replace with explicit service-backed endpoints
- Client-supplied restaurant_id ? Remove; derive from identity only

What Must NOT Be Touched:
- src/api/server.ts core order/finance logic
- Prisma schema core models
- Electron wrapper
- Frontend folder structure
- Legacy documents

## 13. Recommended Minimal Architecture

Smallest Safe Architecture for Managed SaaS:

+-------------------------------------------------------------+
| FireFlow Platform Layer                                    |
|  +---------------------------------------------------------+ |
|  | HQ App (Vercel)                                        | |
|  | - Supabase Auth                                        | |
|  | - Platform roles (Viewer, Support, Engineer, Owner)    | |
|  | - Tenant management UI                                 | |
|  +---------------------------------------------------------+ |
|  | Platform API (local Express, NEW middleware)           | |
|  | - platformAuthMiddleware                               | |
|  | - supportSessionMiddleware                             | |
|  | - tenantLifecycleMiddleware                            | |
|  | - platformAuditMiddleware                              | |
|  +---------------------------------------------------------+ |
+-------------------------------------------------------------+
                            |
                            v
+-------------------------------------------------------------+
| Tenant Boundary                                           |
+-------------------------------------------------------------+
| FireFlow Tenant Application (UNCHANGED CORE)              |
|  +---------------------------------------------------------+ |
|  | Local Express API                                      | |
|  | - authMiddleware (existing JWT)                        | |
|  | - tenant routes (existing)                             | |
|  | - Object-level auth (NEW)                              | |
|  +---------------------------------------------------------+ |
|  | PostgreSQL (local)                                     | |
|  | - All operational data                                 | |
|  | - support_sessions (NEW)                               | |
|  | - tenant_lifecycle (NEW fields on restaurants)         | |
|  +---------------------------------------------------------+ |
+-------------------------------------------------------------+
                            |
                            v
+-------------------------------------------------------------+
| SaaS Metadata (Supabase)                                   |
|  - Platform users/roles                                     |
|  - License keys                                             |
|  - Subscription payments                                    |
|  - restaurant_features (activations)                        |
+-------------------------------------------------------------+

What This Reuses:
- HQ app (src/hq/) — Platform UI shell; add platform role tabs
- Supabase auth — Platform identity
- Local JWT — Tenant identity (unchanged)
- authMiddleware — Tenant auth (unchanged)
- SuperAdminService — Platform operations; extend with lifecycle
- featureFlags.ts — Feature enablement; move to server-side
- restaurant_features — Integration config + feature flags
- Audit tables — Extend with platform action fields
- order_type_defaults — Template for per-tenant config

What This Adds (Minimum):
- platformAuthMiddleware — Platform auth for HQ routes (CRITICAL)
- supportSessionMiddleware — Scoped tenant access for support (CRITICAL)
- support_sessions table — Time-limited support sessions (CRITICAL)
- lifecycle_state on restaurants — Tenant lifecycle tracking (HIGH)
- Platform audit fields on audit_logs — Platform action logging (HIGH)
- Server-side FeatureFlagService — Activate feature flags (MEDIUM)
- tenant_integrations table (optional) — Configurable integrations (MEDIUM)

What This Does NOT Add:
- No new databases
- No microservices
- No new frontend framework
- No AI infrastructure (yet)
- No backup infrastructure (yet — separate mission)
- No new module registry (reuse existing)

## 14. Founder Decisions Required

1. Platform identity boundary: Should HQ remain a separate Supabase-authenticated app, or should platform auth be unified into the local Express API?

2. Support access model: Should support access tenants through the HQ control plane exclusively, or through a separate "support mode" in the POS?

3. Tenant provisioning model: Should FireFlow Support create all tenants (white-glove), or should there be a self-service signup flow with support oversight?

4. Onboarding depth: How much configuration does FireFlow Support perform vs. what the restaurant owner does?

5. Integration strategy: Should FBR, payment gateways, and other integrations be tenant-configurable modules, or remain platform-managed?

6. Backup responsibility: Who manages backups — the platform (SaaS model) or the tenant (local model)?

7. AI agent scope: Should AI agents have read-only access, or can they execute safe write operations?

8. Multi-tenant vs. single-tenant deployment: Should multi-tenant (single DB) remain, or should enterprise tenants get isolated deployments?

## 15. Recommended Next Mission

Mission 005B — Platform Identity & Support Access Implementation Plan

This mission should produce an implementation-ready plan for:
1. Closing unauthenticated provisioning endpoints
2. Implementing platform authentication middleware
3. Designing the support session model
4. Adding tenant lifecycle states to restaurants
5. Extending audit logs for platform actions
6. Defining the support access API boundary

The plan should identify exact files to modify, new files to create, database changes needed, and the migration path from current to target — all while preserving the existing architecture and folder structure.
