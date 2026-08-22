# FireFlow Mission 004 — Managed SaaS Operating Model & Control Plane

## A. CURRENT REALITY

### What platform/SaaS/tenant management capabilities already exist

| Capability | Status | Evidence |
|---|---|---|
| **Tenant creation** | EXISTS — UNPROTECTED | POST /api/restaurants (server.ts:513) — no auth, no rate limit |
| **Staff creation** | EXISTS — UNPROTECTED | POST /api/staff (server.ts:544) — no auth, accepts plaintext PIN |
| **License management** | EXISTS — BASIC | SuperAdminService.ts + superAdminRoutes.ts — generate, apply, revoke, delete license keys. Cloud + local dual tracking. |
| **Subscription payments** | EXISTS — BASIC | GET /api/subscription_payments — queries Supabase cloud. POST /api/saas/payments/:id/verify — verifies/rejects payments. |
| **HQ Control Plane** | EXISTS — SEPARATE | src/hq/ — Vercel-deployed React app with Supabase auth. Tabs: overview, restaurants, payments, licenses. |
| **Feature flags** | EXISTS — PARTIAL | eatureFlags.ts — global + per-restaurant overrides persisted to Supabase estaurant_features table. |
| **Restaurant features DB** | EXISTS | estaurant_features model in Prisma schema — JSON features blob per restaurant. |
| **Order type defaults** | EXISTS | order_type_defaults table — per-restaurant tax/service charge/delivery fee defaults. |
| **Audit logging** | EXISTS — PARTIAL | udit_logs, pproval_logs, system_logs, security_events tables. Some routes log, many don't. |
| **Device pairing** | EXISTS | Pairing codes, registered devices, rate limiting. |
| **Health monitoring** | EXISTS — LOCAL ONLY | HealthMonitor.ts — checks database, memory, disk for the local server process. No tenant-level health. |
| **Configuration** | EXISTS — PARTIAL | operations/config endpoint exists but is in-memory. order_type_defaults persists to DB. No restaurant profile configuration API. |
| **Business profile** | EXISTS — PARTIAL | PATCH /api/restaurants/:id/profile exists but limited fields. |
| **FBR integration** | EXISTS — PARTIAL | FBR routes and service exist. Sync, void, stats, invoices. No full fiscal submission. |
| **QR ordering** | EXISTS — PARTIAL | QR PWA, QR order type (uncommitted migration), approval queue. Integration in progress. |
| **Backup/recovery** | MISSING | No backup code. INSTALL.md mentions ackup.bat script but not in repository. |
| **Support cases** | MISSING | No ticketing/case system. |
| **Tenant lifecycle** | MISSING | No ONBOARDING/CONFIGURATION/READY/ACTIVE/SUSPENDED/CLOSED states. |
| **Module registry** | MISSING | No module/entitlement system. |
| **AI support agents** | MISSING | No backend AI service. Frontend-only chatbot. |

### What already fits the managed SaaS model

| Fit Area | Evidence |
|---|---|
| **Local-first operational core** | POS, orders, KDS, inventory, accounting, delivery all work offline on local PostgreSQL |
| **Cloud SaaS metadata** | Supabase handles licensing, subscriptions, payments, HQ auth |
| **Tenant isolation model** | estaurants is tenant root. estaurant_id on most entities. |
| **Audit infrastructure** | Multiple audit tables exist. Some routes log. |
| **Super Admin view** | HQ app provides multi-tenant overview, license management, payment verification |
| **Device management** | Pairing codes, registered devices, fingerprinting |
| **Feature flag infrastructure** | eatureFlags.ts + estaurant_features table provide per-tenant toggles |
| **Order type defaults** | order_type_defaults allows per-tenant financial configuration |
| **Realtime sync** | Socket.IO enables cross-terminal updates within a tenant |

## B. BUSINESS MODEL FIT

The current architecture **partially** supports the managed SaaS model:

**What fits well:**
- The hybrid local + cloud boundary is correct for a restaurant SaaS
- The tenant root model (estaurants) is sound
- The HQ app proves the control-plane concept is viable
- License keys + subscription payments provide the SaaS revenue mechanism
- Audit tables provide the compliance foundation

**What does NOT fit:**
- The platform layer is NOT truly "above" tenants. The HQ is a separate app with separate auth (Supabase), not a unified control plane.
- FireFlow Support does not exist as a controlled access model. The current SUPER_ADMIN role is an unrestricted internal admin, not a support/operations role with scoped capabilities.
- There is NO managed onboarding. Tenants are created via unauthenticated public endpoints.
- There is NO tenant lifecycle management.
- There is NO support access boundary. "Open Tenant" would mean using the current SUPER_ADMIN credentials, not a controlled support session.
- There is NO platform-level health view. HealthMonitor only sees the local server.
- There is NO backup/recovery infrastructure.
- There is NO integration extension boundary. FBR is hardcoded in routes, not a configurable module.

## C. ARCHITECTURAL GAPS

### CRITICAL

| # | Gap | Impact |
|---|---|---|
| 1 | **No managed onboarding** | Tenants self-register via unauthenticated public endpoints. No support-assisted configuration. |
| 2 | **No tenant lifecycle** | No ONBOARDING ? CONFIGURATION ? READY ? ACTIVE ? SUSPENDED/CLOSED states. Cannot track tenant health or status. |
| 3 | **No controlled support access** | SUPER_ADMIN is all-powerful. No scoped support viewer/engineer/owner roles. No audit trail for support actions. |
| 4 | **Unauthenticated provisioning endpoints** | POST /api/restaurants, POST /api/staff, DELETE /api/restaurants/:id are public. Anyone can create/modify/delete tenants. |
| 5 | **No platform-level tenant view** | HQ shows restaurants, but no health, configuration status, module status, diagnostics. |

### HIGH

| # | Gap | Impact |
|---|---|---|
| 6 | **No backup/recovery** | No automated backups, no point-in-time recovery, no tenant-level recovery. Data loss risk. |
| 7 | **No integration extension boundary** | FBR, payments, printers are hardcoded. Cannot add tenant-specific integrations without core forks. |
| 8 | **No tenant health model** | Cannot answer "what is wrong with this restaurant?" systematically. |
| 9 | **Inconsistent auth enforcement** | See Mission 003. Many routes lack auth, allowing cross-tenant access. |
| 10 | **No module/entitlement system** | Cannot enable/disable features per tenant programmatically. estaurant_features exists but is unused in code. |

### MEDIUM

| # | Gap | Impact |
|---|---|---|
| 11 | **Configuration not persisted** | operations/config is in-memory. order_type_defaults persists, but other config doesn't. |
| 12 | **No support case system** | Cannot track tenant issues, escalations, or resolution history. |
| 13 | **No diagnostic/runbook system** | Support cannot run automated checks against a tenant. |
| 14 | **Split auth systems** | Local JWT + Supabase auth are separate. No unified identity for platform support. |
| 15 | **No tenant-level alerting** | HealthMonitor alerts on local server health only. No per-tenant warnings. |

### FUTURE

| # | Gap | Impact |
|---|---|---|
| 16 | **AI agent control plane** | No backend AI service for support diagnostics, configuration validation, or automated troubleshooting. |
| 17 | **Multi-tenant batch operations** | Cannot apply configuration changes, feature flags, or modules across multiple tenants. |
| 18 | **Point-in-time recovery** | No PITR capability. |
| 19 | **Tenant data portability** | No export/import tenant data. |
| 20 | **Marketplace/Cravex integration** | No external API surface for marketplace order injection. |

## D. REUSE MAP

| Desired Capability | Existing FireFlow Asset | Reuse Strategy |
|---|---|---|
| **Tenant provisioning** | POST /api/restaurants + LicenseService | Wrap existing creation in authenticated platform endpoint. Add lifecycle states. |
| **License management** | SuperAdminService + LicenseService + license_keys table | Already functional. Extend with module/entitlement tracking. |
| **Subscription management** | subscription_payments (local + Supabase) | Already functional. Add automated expiry/suspension. |
| **Feature flags** | eatureFlags.ts + estaurant_features table | Activate and extend. Currently client-side only. |
| **Configuration** | order_type_defaults table + operations/config endpoint | Persist config to DB. Extend to full restaurant profile. |
| **Health monitoring** | HealthMonitor.ts | Extend from local server to tenant-level checks. |
| **Audit/Compliance** | udit_logs, pproval_logs, system_logs, security_events | Already comprehensive. Extend with platform/support action logging. |
| **Device management** | pairing_codes, egistered_devices | Already functional. Extend to platform-level device inventory. |
| **FBR integration** | FBRService + brRoutes | Already partial. Wrap as configurable integration module. |
| **Payment integration** | 	ransactions, CashierSessionService | Already functional. Abstract as payment module. |
| **Printing** | PrinterService + printers table | Already functional. Extend as configurable integration. |
| **Realtime** | Socket.IO + restaurant-scoped rooms | Already functional. Extend for platform diagnostics. |
| **HQ app** | src/hq/ + Vercel deployment | Already functional. Evolve into full control plane. |
| **Reports** | ReportsService + 10+ report files | Already functional. Expose to platform for tenant diagnostics. |
| **Order abstraction** | BaseOrderService + OrderServiceFactory | Already functional. Use for support order inspection. |
| **Accounting** | AccountingService + JournalEntryService | Already functional. Use for financial diagnostics. |

## E. PROPOSED CONTROL-PLANE BOUNDARY

`
+-------------------------------------------------------------+
|  FireFlow Platform Layer (SaaS HQ / Control Plane)           |
|  +---------------------------------------------------------+  |
|  | Platform Auth (Supabase)                                |  |
|  | Platform Viewer / Support Agent / Support Engineer /    |  |
|  | Platform Owner                                          |  |
|  +---------------------------------------------------------+  |
|  | Tenant Management                                       |  |
|  |  - Provisioning                                         |  |
|  |  - Lifecycle states                                     |  |
|  |  - Configuration assistance                             |  |
|  |  - Health monitoring                                    |  |
|  |  - Diagnostics                                          |  |
|  |  - Support cases                                        |  |
|  |  - Module/entitlement management                        |  |
|  +---------------------------------------------------------+  |
|  | AI Support Layer                                        |  |
|  |  - Inspect tenant state                                 |  |
|  |  - Diagnose problems                                    |  |
|  |  - Propose configuration                                |  |
|  |  - Execute safe operations                              |  |
|  |  - Escalate dangerous operations                        |  |
|  +---------------------------------------------------------+  |
+-------------------------------------------------------------+
|  Tenant Boundary                                            |
+-------------------------------------------------------------+
|  FireFlow Tenant Application (Local PostgreSQL + Express)   |
|  +---------------------------------------------------------+  |
|  | POS / Orders / KDS / Menu / Inventory / Accounting     |  |
|  | Delivery / Customers / Reports / Settings               |  |
|  +---------------------------------------------------------+  |
+-------------------------------------------------------------+
`

**Platform ends, tenant begins at:**
- Platform manages tenant metadata, subscriptions, licenses, features, health, and support
- Tenant application manages operational data (orders, menu, inventory, accounting)
- Platform NEVER directly mutates tenant operational data without explicit support action
- Tenant NEVER accesses platform management functions

## F. PROPOSED SUPPORT/AGENT BOUNDARY

`
Platform Owner
    |
    +-- Support Engineer / Tenant Administrator
    |       |
    |       +-- Support Agent
    |               |
    |               +-- AI Agent
    |                       |
    +-----------------------+
                       |
                       v
                   Tenant
`

### Capability Levels

| Level | Read | Safe Write | Dangerous Write | Example Actions |
|---|---|---|---|---|
| **Platform Owner** | All tenants | All | All | Create tenant, delete tenant, change ownership, revoke licenses |
| **Support Engineer** | Assigned tenants | Config, features, diagnostics | Financial, destructive | Fix configuration, retry sync, adjust features, reset stuck state |
| **Support Agent** | Assigned tenants | Diagnostics only | None | View logs, inspect orders, run diagnostics, propose fixes |
| **AI Agent** | Scoped tenant data | Safe ops only | None | Inspect config, propose menu fixes, detect duplicates, validate settings |

### What Remains Protected

- **Financial records**: No support/agent can modify transactions, journal entries, or settlements
- **Permissions**: No support/agent can change staff roles or permissions without Platform Owner
- **Credentials**: No support/agent can access or change passwords/PINs
- **Tenant deletion**: Requires Platform Owner + explicit approval
- **Accounting configuration**: Requires Platform Owner
- **Integration credentials**: Requires Platform Owner

## G. TENANT LIFECYCLE

### Proposed States

`
ONBOARDING ? CONFIGURATION ? READY ? ACTIVE ? SUSPENDED ? CLOSED
                |              |        |          |
                |              |        |          +---> ARCHIVED
                |              |        +---> ACTIVE (resumed)
                |              +---> ACTIVE (if auto-activated)
                +---> PROVISIONING_FAILED ? ARCHIVED
`

| State | Meaning | Who Can Transition |
|---|---|---|
| **PROVISIONING** | Tenant record created, awaiting setup | Platform / Automation |
| **ONBOARDING** | FireFlow Support is configuring tenant | Support Engineer |
| **CONFIGURATION** | Tenant config being finalized | Support Engineer |
| **READY** | Configured, awaiting tenant activation | Tenant Owner / Support |
| **ACTIVE** | Fully operational | — |
| **SUSPENDED** | Temporarily disabled (non-payment, abuse) | Platform Owner / Support Engineer |
| **CLOSED** | Permanently closed | Platform Owner |
| **ARCHIVED** | Data preserved, no operations | Platform Owner |

### Lifecycle Transitions

| From | To | Trigger | Actor |
|---|---|---|---|
| (none) | PROVISIONING | Tenant record created | Platform / API |
| PROVISIONING | ONBOARDING | License applied, support assigned | Support Engineer |
| ONBOARDING | CONFIGURATION | Basic identity configured | Support Engineer |
| CONFIGURATION | READY | Menu, staff, config complete | Support Engineer |
| READY | ACTIVE | Tenant confirmed ready | Tenant Owner |
| ACTIVE | SUSPENDED | Payment failure, policy violation | Platform Owner / Automation |
| SUSPENDED | ACTIVE | Issue resolved, payment received | Platform Owner / Support |
| ACTIVE | CLOSED | Tenant request, non-payment | Platform Owner |
| CLOSED | ARCHIVED | Retention period elapsed | Platform Owner |
| ANY | PROVISIONING_FAILED | Setup error | Automation / Support |

### Current Reality vs Target

| Aspect | Current | Target |
|---|---|---|
| Tenant creation | Unauthenticated public endpoint | Authenticated platform endpoint |
| Initial state | 	rial | PROVISIONING |
| Activation | Automatic on license apply | Support-assisted READY ? ACTIVE |
| Suspension | No mechanism | SUSPENDED with reason |
| Closure | No mechanism | CLOSED ? ARCHIVED |
| History | No audit of state changes | Full audit trail in udit_logs |

## H. BACKUP/RECOVERY MODEL

### Requirements

| Requirement | Description | Priority |
|---|---|---|
| **Platform backups** | Reliable automated database backups | CRITICAL |
| **Point-in-time recovery** | Recover to earlier point when infrastructure permits | HIGH |
| **Tenant-level recovery** | Recover individual tenant without full platform restore | HIGH |
| **Financial/audit protection** | Financial records must not be casually rolled backward | CRITICAL |
| **Backup verification** | Proven restore capability required | HIGH |

### Current Reality

| Component | Status | Evidence |
|---|---|---|
| **Backup code** | MISSING | No backup scripts in src/ or scripts/ (except ackup.bat mentioned in INSTALL.md) |
| **Automated backups** | MISSING | No cron jobs, no scheduled tasks in code |
| **Point-in-time recovery** | MISSING | No WAL archiving, no PITR configuration |
| **Tenant-level recovery** | MISSING | No export/import per tenant |
| **Backup verification** | MISSING | No restore testing |
| **Financial protection** | PARTIAL | Soft delete + audit logs exist, but no backup-specific protection |

### Gap Analysis

The current architecture has NO backup/recovery infrastructure. This is a CRITICAL gap for a managed SaaS.

**What exists that can be reused:**
- Prisma schema is well-structured for selective tenant export
- soft delete pattern on orders preserves historical data
- udit_logs and journal_entries provide reconstruction data
- scripts/ directory could host backup utilities

**What must be built:**
- Automated PostgreSQL backup scheduler
- Backup storage management (local + cloud)
- Tenant-level export/import
- Restore verification pipeline
- Financial record preservation rules during recovery

## I. EXTENSION/INTEGRATION MODEL

### Current Integration Architecture

| Integration | Implementation | Status |
|---|---|---|
| **FBR** | Hardcoded in brRoutes.ts + FBRService.ts | PARTIAL |
| **Payments** | Hardcoded in 	ransactions + CashierSessionService | PARTIAL |
| **Printers** | PrinterService + printers table + Electron IPC | VERIFIED |
| **Supabase** | cloudClient.ts — direct REST calls | PARTIAL |
| **Socket.IO** | socketClient.ts — realtime events | VERIFIED |
| **Google Gemini** | Direct frontend call in AURAAssistant.tsx | PARTIAL |
| **Sentry** | errorTracking.ts — initialized | PARTIAL |

### Proposed Extension Boundary

`
CORE (FireFlow restaurant operations)
    ?
MODULE / INTEGRATION / EXTENSION BOUNDARY
    ?
Tenant-specific configuration
`

**Principles:**
1. Core never contains if (restaurant_id === "specific-client") logic
2. Integrations are configured per-tenant via database records
3. Integration modules register themselves and declare required configuration
4. Platform can enable/disable integrations per tenant
5. Integrations must not break core operations if misconfigured

### Existing Extension Points

| Point | Current State | Potential |
|---|---|---|
| estaurant_features JSON | Exists but unused | Store enabled integrations per tenant |
| order_type_defaults | Persists per-tenant | Template for other per-tenant config tables |
| printers table | Exists with routing | Model for other hardware integrations |
| br_enabled, br_ims_url, br_ntn on estaurants | Hardcoded FBR fields | Extract to 	enant_integrations table |
| cloudClient.ts | Supabase-specific | Abstract to IntegrationClient interface |

### Gap: No Module Registry

The codebase has NO module registry or dependency resolver. Integrations are:
- Hardcoded in routes (brRoutes.ts)
- Wired directly into services (FBRService.ts)
- Not discoverable or configurable per-tenant

**Recommended evolution (not implementation):**
- Introduce 	enant_integrations table: id, estaurant_id, integration_type, config_json, enabled, created_at
- Move FBR, payment, printer configs into this table
- Create IntegrationService that loads enabled integrations per tenant
- Core services consult IntegrationService instead of hardcoded configs

## J. SECURITY CONSEQUENCES

Cross-referencing Mission 003 findings against the new managed SaaS model:

### Findings That MUST Change Because the Security Boundary Changed

| Finding | Current | SaaS Model Impact | Required Change |
|---|---|---|---|
| **Unauthenticated tenant creation** | POST /api/restaurants is public | CRITICAL — Anyone can create tenants, consume licenses, pollute platform | MUST require platform authentication. Tenant creation is a platform operation, not a self-service operation. |
| **Unauthenticated staff creation** | POST /api/staff is public | CRITICAL — Platform support creates staff, not public | MUST require auth + role. |
| **Unauthenticated restaurant deletion** | DELETE /api/restaurants/:id is public | CRITICAL | MUST require SUPER_ADMIN or Platform Owner. |
| **Generic table API** | GET /api/:table has auth but no tenant filter | HIGH — Platform support needs tenant-scoped access, not cross-tenant enumeration | MUST enforce estaurant_id = req.restaurantId for all tables. Platform support uses explicit tenant targeting via x-target-restaurant. |
| **Client-supplied estaurant_id** | Many routes accept from body/query | HIGH — In SaaS model, tenant is NEVER from client input | MUST derive tenant exclusively from authenticated identity + optional platform targeting header. |
| **No token revocation** | Logout is client-side only | HIGH — Support may need to revoke access immediately | Implement token blacklist/revocation for platform actions. |
| **No refresh token rotation** | Static refresh tokens | HIGH — Long-lived tokens increase blast radius | Implement rotation. |
| **JWT in localStorage** | XSS vulnerable | MEDIUM — Electron desktop reduces XSS risk, but HQ is web | Evaluate per deployment context. HQ web app should use httpOnly cookies. |
| **Plaintext PIN** | staff.pin + fallback login | HIGH — Support may need to reset PINs securely | Remove plaintext path. Implement PIN reset via authenticated support flow. |
| **Session gate bug** | Reads eq.user.role instead of eq.role | LOW — Support operations may bypass session gate | Fix bug. Ensure support operations have explicit session/support context. |
| **Saved PIN in localStorage** | Plaintext PIN stored client-side | HIGH — Same as plaintext PIN | Remove saved_pin. Implement secure auto-login via device pairing. |

### New Security Requirements for Managed SaaS

| Requirement | Description | Priority |
|---|---|---|
| **Platform authentication** | Separate from tenant auth. Supabase auth for HQ is a start, but needs role hierarchy. | CRITICAL |
| **Support access sessions** | Support access to tenant must be time-limited, auditable, and revocable. Not permanent credential sharing. | CRITICAL |
| **Tenant action audit trail** | Every platform/support action on a tenant must be logged with actor, action, timestamp, and tenant. | HIGH |
| **Integration credential isolation** | Tenant-specific integration credentials (FBR, payments) must be isolated per tenant. | HIGH |
| **Platform-to-tenant encryption** | Platform diagnostic data crossing tenant boundary must be encrypted. | MEDIUM |
| **AI agent scope enforcement** | AI agents must have explicit capability tokens, not unrestricted access. | HIGH |

## K. OPEN FOUNDER DECISIONS

1. **Tenant provisioning model**: Should FireFlow Support create all tenants (white-glove), or should there be a self-service signup flow with support oversight? The current unauthenticated public endpoint is clearly wrong, but what is the intended model?

2. **Platform identity boundary**: Should the HQ app remain a separate Supabase-authenticated app, or should it be unified into the local Express API with a platform auth layer? The current split has security and UX implications.

3. **Support access model**: Should support access tenants via a separate "support mode" in the POS, or exclusively through the HQ control plane? The current SUPER_ADMIN role is insufficient for scoped support.

4. **Onboarding depth**: How much configuration does FireFlow Support perform vs. what the restaurant owner does? The mission mentions "managed onboarding" but the division of labor is not specified.

5. **Integration strategy**: Should FBR, payment gateways, and other integrations be tenant-configurable modules, or remain platform-managed? This affects the extension boundary design.

6. **Backup responsibility**: Who manages backups — the platform (SaaS model) or the tenant (local model)? The mission says backup is "first-class SaaS requirement" but the local-first architecture complicates this.

7. **AI agent scope**: Should AI agents have read-only access, or can they execute safe write operations? The mission suggests both, but the approval boundary is not defined.

8. **Multi-tenant vs. single-tenant deployment**: The current architecture supports multi-tenant (single DB, multiple restaurants). Should this remain, or should enterprise tenants get isolated deployments?

