# Managed SaaS Operating Model

## Overview

FireFlow is a managed, AI-assisted SaaS Business Operating System for restaurants. FireFlow Support/SaaS Management operates above the tenant layer and assists with onboarding, configuration, troubleshooting, integrations, and ongoing tenant operations.

This document describes the target operating model. It does not describe the current implementation in full — see ARCHITECTURE.md and CURRENT_STATE.md for current reality.

---

## 1. Managed Onboarding

FireFlow onboarding is initially managed by FireFlow Support.

A restaurant does NOT independently configure the entire system.

### Onboarding Lifecycle

`
PROVISIONING ? ONBOARDING ? CONFIGURATION ? READY ? ACTIVE
`

| State | Meaning | Actor |
|---|---|---|
| **PROVISIONING** | Tenant record created in platform | Platform / Automation |
| **ONBOARDING** | FireFlow Support is setting up the restaurant | Support Engineer |
| **CONFIGURATION** | Menu, staff, tables, integrations being configured | Support Engineer + AI |
| **READY** | Configured, awaiting tenant confirmation | Support Engineer |
| **ACTIVE** | Fully operational | — |

### AI-Assisted Onboarding

AI may assist FireFlow Support by:
- Extracting menu data from images/PDFs
- Identifying configuration problems
- Proposing configuration values
- Detecting duplicates
- Identifying missing information
- Validating configuration
- Diagnosing tenant problems

Human/authorized platform staff remain responsible for approval of sensitive changes.

### What Onboarding Includes

- Restaurant identity (name, contact, location, hours)
- Tax/service charge configuration
- Tables/sections
- Menu categories and items
- Prices and modifiers
- Kitchen configuration (stations, routing)
- Delivery configuration
- Payment configuration
- Staff accounts
- Integrations (FBR, payment providers, etc.)

---

## 2. SaaS Management HQ / Control Plane

The SaaS management platform provides a platform-level view of ALL tenants.

### Platform Capabilities

- Tenant list/search
- Tenant status and lifecycle state
- Subscription/plan management
- Modules/entitlements
- Configuration status
- Tenant health
- Support cases
- Integrations
- Devices/services
- Diagnostics
- Controlled support access
- Audit history
- Backup/recovery status

### Control Plane Applications

| Application | Purpose | Technology |
|---|---|---|
| **HQ (Control Plane)** | Platform management, tenant overview, license management | React + Vite, deployed on Vercel |
| **Support Terminal** | Scoped access to tenant diagnostics and configuration | Same codebase as HQ, role-gated |
| **AI Assistant (Support)** | Diagnostics, configuration validation, troubleshooting | Backend AI service (future) |

### Platform-to-Tenant Boundary

`
+-------------------------------------------------------------+
|  FireFlow Platform (HQ / Control Plane)                     |
|  - Platform auth (Supabase)                                 |
|  - Tenant management                                        |
|  - License/subscription management                          |
|  - Support access                                           |
|  - AI support agents                                        |
|  - Diagnostics                                              |
+-------------------------------------------------------------+
|  TENANT BOUNDARY                                            |
+-------------------------------------------------------------+
|  FireFlow Tenant Application (Local PostgreSQL + Express)   |
|  - POS / Orders / KDS / Menu / Inventory / Accounting      |
|  - Delivery / Customers / Reports / Settings               |
+-------------------------------------------------------------+
`

**Platform NEVER directly mutates tenant operational data without explicit support action.**

**Tenant NEVER accesses platform management functions.**

---

## 3. Support Access Model

### Roles

| Role | Scope | Access |
|---|---|---|
| **Platform Viewer** | Read-only platform visibility | All tenants, read-only |
| **Support Agent** | Diagnose tenants | Assigned tenants, inspect operational data, run diagnostics |
| **Support Engineer / Tenant Administrator** | Perform authorized corrections | Assigned tenants, fix configuration, retry operations, adjust features |
| **Platform Owner** | Highest platform authority | All tenants, all actions, financial/legal oversight |

### Support Session Model

Support access to a tenant is NOT permanent credential sharing.

1. Support authenticates to HQ with platform credentials
2. Support selects tenant to assist
3. System creates a time-limited support session (e.g., 4 hours)
4. Support session is scoped to the tenant's data
5. All support actions are audited with actor, action, timestamp, tenant
6. Support session can be revoked by Platform Owner at any time
7. Support session expires automatically

### Audit Requirements

All sensitive platform/support actions must be auditable:
- Who accessed which tenant
- What actions were performed
- What configuration was changed
- What data was inspected
- When the session started/ended

---

## 4. AI Agent Operating Model

AI agents operate as part of FireFlow Support and troubleshooting.

### Capability Tiers

#### READ

Generally safe when properly tenant-scoped.

- Inspect tenant configuration
- Inspect orders and order history
- Inspect menu and inventory
- Inspect health and diagnostics
- Inspect logs and events
- Inspect integrations
- Identify anomalies and problems

#### SAFE WRITE

May be automatically executable if policy permits.

- Retry idempotent operations
- Rerun safe provisioning steps
- Refresh/recheck health
- Apply non-destructive configuration fixes
- Merge duplicate menu items
- Correct obvious configuration errors

#### DANGEROUS WRITE

Requires explicit authorization/approval.

- Financial corrections
- Deleting business records
- Changing owner/contact
- Changing permissions/roles
- Changing sensitive credentials
- Changing accounting configuration
- Refunds
- Tenant deletion
- Destructive recovery

### AI Agent Constraints

- AI agents must NOT receive unrestricted permanent access to the entire platform/database
- AI agents operate within scoped tenant sessions
- All AI recommendations are logged
- Dangerous writes require human approval
- AI interactions are distinguishable from human actions in audit logs

---

## 5. Tenant Health

### Health Categories

| Category | Possible States |
|---|---|
| **AUTH** | HEALTHY, WARNING, ERROR, UNKNOWN |
| **CONFIGURATION** | HEALTHY, WARNING, ERROR, UNKNOWN |
| **MENU** | HEALTHY, WARNING, ERROR, UNKNOWN |
| **ORDERS** | HEALTHY, WARNING, ERROR, UNKNOWN |
| **KDS** | HEALTHY, WARNING, ERROR, UNKNOWN |
| **PAYMENTS** | HEALTHY, WARNING, ERROR, UNKNOWN |
| **ACCOUNTING** | HEALTHY, WARNING, ERROR, UNKNOWN |
| **INVENTORY** | HEALTHY, WARNING, ERROR, UNKNOWN |
| **DELIVERY** | HEALTHY, WARNING, ERROR, UNKNOWN |
| **DEVICES** | HEALTHY, WARNING, ERROR, UNKNOWN |
| **INTEGRATIONS** | HEALTHY, WARNING, ERROR, UNKNOWN |
| **SUBSCRIPTION** | HEALTHY, WARNING, ERROR, UNKNOWN |

### Health Assessment

- **HEALTHY**: All checks passing, no anomalies
- **WARNING**: Degraded but functional, attention recommended
- **ERROR**: Broken or failing, intervention required
- **UNKNOWN**: Insufficient data to assess

### Current Reality

| Category | Current Status |
|---|---|
| AUTH | PARTIAL — JWT works, but plaintext PIN fallback, no tenant-level auth health |
| CONFIGURATION | PARTIAL — order_type_defaults persists, but other config is in-memory |
| MENU | VERIFIED — Menu CRUD works, no health checks |
| ORDERS | VERIFIED — Order lifecycle works, no health checks |
| KDS | VERIFIED — KDS works, no health checks |
| PAYMENTS | PARTIAL — Transactions exist, no payment gateway health |
| ACCOUNTING | VERIFIED — Double-entry works, no health checks |
| INVENTORY | PARTIAL — Items exist, no stock movement tracking |
| DELIVERY | VERIFIED — Delivery workflow works, no health checks |
| DEVICES | VERIFIED — Pairing works, no health checks |
| INTEGRATIONS | PARTIAL — FBR partial, no health monitoring |
| SUBSCRIPTION | PARTIAL — License check works, no expiry alerts |

### Missing Health Infrastructure

- No automated health checks per tenant
- No health history/trending
- No alerting for tenant-specific issues
- No diagnostic runbooks

---

## 6. Tenant Problem Taxonomy

### Access

| Problem | Current Support | Gap |
|---|---|---|
| Login failure | Manual PIN check | No automated diagnostic |
| Staff access | Manual staff table check | No role health check |
| Wrong role | Manual role update | No role validation |
| Device pairing | Manual device management | No pairing health check |
| Owner access | Manual credential reset | No secure reset flow |

### Menu

| Problem | Current Support | Gap |
|---|---|---|
| Missing item | Manual menu check | No duplicate detection |
| Incorrect price | Manual price check | No price validation |
| Wrong category | Manual category check | No category health |
| Modifiers | Manual variant check | No modifier validation |
| QR menu problems | Manual QR check | No QR menu health |
| Duplicate items | Manual detection | No automated duplicate detection |

### Orders/POS

| Problem | Current Support | Gap |
|---|---|---|
| Order stuck | Manual order check | No stuck-order detection |
| Order not reaching KDS | Manual KDS check | No KDS routing health |
| Duplicate order | Manual check | No duplicate detection |
| Settlement problem | Manual settlement check | No settlement validation |
| QR order issue | Manual QR check | No QR order health |
| Table/order state mismatch | Manual check | No state consistency check |

### KDS/Devices

| Problem | Current Support | Gap |
|---|---|---|
| Station offline | Manual station check | No station health monitoring |
| Printer issue | Manual printer check | No printer health monitoring |
| Routing issue | Manual routing check | No routing validation |
| Order stuck in kitchen | Manual KDS check | No stuck-item detection |

### Accounting

| Problem | Current Support | Gap |
|---|---|---|
| Settlement mismatch | Manual audit | No automated reconciliation |
| Cash session discrepancy | Manual session check | No session balance validation |
| Journal posting problem | Manual journal check | No posting health check |
| Supplier/payment issue | Manual ledger check | No supplier ledger health |

### Inventory

| Problem | Current Support | Gap |
|---|---|---|
| Incorrect stock | Manual stock check | No stock health validation |
| Consumption issue | Manual recipe check | No consumption analysis |
| Recipe mismatch | Manual recipe check | No recipe validation |
| Purchase/closing discrepancy | Manual check | No automated reconciliation |

### Delivery

| Problem | Current Support | Gap |
|---|---|---|
| Rider issue | Manual rider check | No rider health monitoring |
| Delivery state problem | Manual order check | No delivery state validation |
| Settlement problem | Manual settlement check | No rider settlement health |

### SaaS

| Problem | Current Support | Gap |
|---|---|---|
| Subscription issue | Manual license check | No automated expiry alert |
| Entitlement issue | Manual feature check | No entitlement validation |
| Tenant suspension | Manual status change | No suspension automation |
| Module unavailable | Manual check | No module health monitoring |

### Integrations

| Problem | Current Support | Gap |
|---|---|---|
| FBR sync failure | Manual FBR check | No FBR health monitoring |
| Payment provider issue | Manual transaction check | No payment gateway health |
| WhatsApp/SMS failure | Manual notification check | No notification health |
| Fiscal printer issue | Manual print check | No printer integration health |
| Local service failure | Manual check | No integration health framework |

---

## 7. Backup and Recovery

### Requirements

1. **Platform backups**: Reliable automated database backups
2. **Point-in-time recovery**: Recover to earlier point when infrastructure permits
3. **Tenant-level recovery**: Recover individual tenant without full platform restore
4. **Financial/audit protection**: Financial records must not be casually rolled backward
5. **Backup verification**: Proven restore capability required

### Current Reality

- No backup code in repository
- No automated backup scheduler
- No backup storage management
- No restore verification
- No tenant-level export/import

### Gap

This is a CRITICAL gap for a managed SaaS. The current architecture has no recovery infrastructure.

### Architectural Requirements (Not Implementation)

- Backup must preserve tenant isolation
- Financial/audit records require special handling during recovery
- Recovery involving financial data must be controlled and auditable
- Tenant-level recovery must be possible without affecting other tenants
- Backup verification must be part of the deployment pipeline

---

## 8. Extension/Integration Model

### Principle

FireFlow must support tenant-specific requirements without creating tenant-specific forks of FireFlow core.

### Preferred Model

`
CORE
  ?
MODULE / INTEGRATION / EXTENSION BOUNDARY
  ?
Tenant-specific configuration
`

### Current State

| Integration | Implementation | Gap |
|---|---|---|
| FBR | Hardcoded in brRoutes.ts + FBRService.ts | Not configurable per-tenant |
| Payments | Hardcoded in 	ransactions + CashierSessionService | Not modular |
| Printers | PrinterService + printers table | Closest to modular model |
| Supabase | cloudClient.ts direct REST | Not abstracted |
| Socket.IO | socketClient.ts | Functional but not integration-aware |

### Proposed Evolution

1. Introduce 	enant_integrations table: id, estaurant_id, integration_type, config_json, enabled, created_at
2. Move FBR, payment, printer configs into this table
3. Create IntegrationService that loads enabled integrations per tenant
4. Core services consult IntegrationService instead of hardcoded configs
5. Integration modules declare required configuration schema
6. Platform can enable/disable integrations per tenant

### What NOT To Do

- Never create business logic like if (restaurant_id === "specific-client") inside FireFlow core
- never create tenant-specific forks
- never hardcode integration logic in core services

---

## 9. Security Consequences of Managed SaaS Model

The managed SaaS model changes the security boundary:

| Change | Impact |
|---|---|
| Platform is now a target | Platform auth must be stronger than tenant auth |
| Support access is required | Need scoped, auditable support sessions |
| Tenant creation is privileged | Public provisioning endpoints MUST be closed |
| Cross-tenant diagnostics required | Need controlled tenant targeting, not unrestricted enumeration |
| AI agents need access | Need capability-based access control, not role-based only |
| Backup/recovery is critical | Need access controls for restore operations |

### Required Security Evolution

1. **Close unauthenticated provisioning endpoints** — tenant creation is a platform operation
2. **Implement support access sessions** — time-limited, auditable, revocable
3. **Enforce tenant derivation from identity** — never from client input
4. **Add object-level authorization** — verify ownership before mutations
5. **Implement token revocation** — for immediate access termination
6. **Add platform action audit trail** — log all support/agent actions
7. **Rotate exposed credentials** — .env.example contains live Supabase credentials

---

## 10. Implementation Principles

1. **Preserve existing architecture** — do not rewrite FireFlow to fit the model
2. **Evolve, don't replace** — extend existing systems (licensing, audit, features) rather than building new ones
3. **Platform above tenants** — platform manages metadata; tenants manage operations
4. **Support is scoped** — never give support unrestricted access; use sessions and capability tokens
5. **AI assists, never decides** — AI can propose, diagnose, and execute safe operations; humans approve dangerous ones
6. **Audit everything** — platform actions, support actions, and AI actions must all be auditable
7. **Tenant isolation is sacred** — even platform operations must respect tenant boundaries unless explicitly targeting a tenant

---

*Last updated: 2026-08-16*
