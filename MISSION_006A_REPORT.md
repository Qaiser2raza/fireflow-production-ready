# FireFlow Mission 006A — Scoped Support Access Design

## 1. Executive Recommendation

Implement a **Support Session** model where:

1. Platform users authenticate via existing Supabase boundary (`req.platformUser`)
2. Platform users create time-limited support sessions for specific tenants
3. Support sessions carry a **scope** defining allowed operations
4. All tenant operations within a support session use the session's server-side `restaurant_id`
5. Every support action is attributed to the platform actor + session in `audit_logs`
6. AI agents NEVER create sessions; they operate only within human-created sessions

This is the smallest model that satisfies:
- Secure cross-tenant support
- Auditability
- AI agent safety
- Backward compatibility with existing tenant auth
- No new identity providers or frameworks

---

## 2. Trust Boundary

```
Platform Identity (Supabase / app_metadata)
        ?
Platform Authorization (requirePlatformRole)
        ?
Support Session Creation (POST /api/platform/support-sessions)
        ?
Support Session Validation (supportSessionMiddleware)
        ?
Tenant Boundary (session.restaurant_id)
        ?
Scoped Tenant Operations (scope-based access)
```

Key rule: **Platform authentication alone does not grant tenant access.** A support session must be explicitly created and validated.

---

## 3. Actor Model

| Actor | Platform Role | Can Create Sessions | Default Scope | Notes |
|---|---|---|---|---|
| **Platform Owner** | PLATFORM_OWNER | Yes — any tenant | ALL | Full platform authority |
| **Support Engineer** | SUPPORT_ENGINEER | Yes — assigned tenants | CONFIG, MENU, ORDERS, DEVICE, DIAGNOSTICS | Can perform approved operational corrections |
| **Support Agent** | SUPPORT_AGENT | Yes — assigned tenants | READ, DIAGNOSTICS | Read-only diagnostics |
| **AI Support Agent** | (none — not a platform role) | NO | N/A | Operates ONLY within sessions created by humans |
| **Tenant User** | (local JWT role) | NO | N/A | Operates only within their own tenant |

### AI Support Actor

AI does NOT receive a platform role. Instead:

```
Human Support Engineer
    ?
Creates support session with scope = [DIAGNOSTICS, MENU, CONFIG]
    ?
AI operates within that session
    ?
AI can suggest actions but cannot expand scope or extend expiry
```

This ensures AI never has unrestricted access and always operates under human oversight.

---

## 4. Support Session Model

### Conceptual Schema

```prisma
model support_sessions {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  platform_user_id  String   @db.Uuid
  restaurant_id     String   @db.Uuid
  scope             Json     // e.g., ["DIAGNOSTICS", "MENU", "CONFIG"]
  reason            String?
  created_at        DateTime @default(now()) @db.Timestamp(6)
  expires_at        DateTime @db.Timestamp(6)
  revoked_at        DateTime? @db.Timestamp(6)
  created_by        String   @db.Uuid  // platform_user_id who created it
  status            String   @default("ACTIVE") @db.VarChar(20)
  
  @@index([platform_user_id])
  @@index([restaurant_id])
  @@index([status])
}
```

### Field Meanings

| Field | Purpose |
|---|---|
| `id` | Session identifier |
| `platform_user_id` | Who created/is operating the session |
| `restaurant_id` | Tenant being supported (server-side, never client-supplied) |
| `scope` | Allowed operation categories |
| `reason` | Why support is needed |
| `created_at` | Session creation time |
| `expires_at` | Automatic expiry |
| `revoked_at` | Manual revocation (null if active) |
| `created_by` | Actor who created the session |
| `status` | ACTIVE, EXPIRED, REVOKED |

---

## 5. Scope Model

### Recommended Scopes (Smallest Practical Set)

| Scope | Meaning | Safe Operations | Protected Operations |
|---|---|---|---|
| `READ` | Inspect tenant data | View orders, menu, staff, inventory, reports | None |
| `CONFIG` | Modify configuration | Restaurant settings, tax rates, order type defaults | Accounting config, permissions |
| `MENU` | Modify menu | Categories, items, variants, prices, availability | None |
| `ORDERS` | View/modify orders | View orders, update status, reprint | Void/refund, settlement, financial adjustments |
| `DEVICE` | Manage devices | Printers, pairing codes, registered devices | None |
| `DIAGNOSTICS` | Run diagnostics | Health checks, logs, sync status, error inspection | None |

### Protected Scopes (Never Granted via Support Session)

| Protected Area | Why Protected |
|---|---|
| `FINANCIAL` | Transactions, settlements, cash sessions, payouts |
| `PERMISSIONS` | Staff roles, credentials, PINs |
| `DESTRUCTIVE` | Delete, hard delete, irreversible operations |
| `ACCOUNTING_CONFIG` | Chart of accounts, journal configuration |

### Scope Enforcement

Scope is checked by `supportSessionMiddleware` before allowing operations:

```typescript
if (!session.scope.includes(requiredScope)) {
  return res.status(403).json({ error: 'Operation not allowed in current support session scope' });
}
```

---

## 6. Lifetime / Revocation

### Session Creation

1. Platform user authenticates via Supabase ? `req.platformUser`
2. Platform user calls `POST /api/platform/support-sessions`
3. Backend validates:
   - Platform role has permission to create sessions
   - `restaurant_id` is a valid tenant
   - `scope` is within allowed scopes for the role
4. Backend creates session with `expires_at` (default: 4 hours)
5. Backend returns session ID + tenant info

### Session Validation

Every support operation requires:
1. Valid platform auth (`platformAuthMiddleware`)
2. Valid support session (`supportSessionMiddleware`)
3. Required scope for the operation

### Expiration

- Sessions auto-expire after configured time (default: 4 hours)
- `supportSessionMiddleware` checks `expires_at` on every request
- Expired sessions return 401

### Revocation

- Platform Owner can revoke any session
- Support Engineer can revoke their own sessions
- Revocation sets `revoked_at` timestamp
- Revoked sessions return 401

### Session Limits

- Maximum 5 active sessions per platform user
- Maximum 1 active session per tenant per platform user

---

## 7. Tenant Isolation

### How Tenant ID is Derived

**CRITICAL:** The tenant (`restaurant_id`) is established SERVER-SIDE from the support session, NEVER from client input.

```typescript
// supportSessionMiddleware
const session = await prisma.support_sessions.findUnique({
  where: { id: sessionId }
});

if (!session || session.status !== 'ACTIVE') {
  return res.status(401).json({ error: 'Invalid or expired support session' });
}

if (session.expires_at < new Date()) {
  return res.status(401).json({ error: 'Support session expired' });
}

// Server-side tenant binding
req.supportSession = session;
req.restaurantId = session.restaurant_id;  // NOT from client
```

### What This Prevents

| Attack Vector | Prevention |
|---|---|
| Client sends different `restaurant_id` | Ignored — session's `restaurant_id` is used |
| Platform user accesses tenant without session | Blocked — `supportSessionMiddleware` required |
| AI changes tenant target | Blocked — AI cannot create/alter sessions |
| Session reuse after revocation | Blocked — status check |
| Session use after expiry | Blocked — timestamp check |

---

## 8. Audit Model

### Existing Infrastructure Reuse

The existing `audit_logs` table already supports:

```prisma
model audit_logs {
  restaurant_id     String?      // Tenant being audited
  staff_id          String?      // Tenant staff (nullable for platform actions)
  action_type       String       // What happened
  entity_type       String       // What was affected
  entity_id         String?      // Which record
  details           Json?        // Additional context
  ip_address        String?      @db.Inet
  created_at        DateTime?    @default(now()) @db.Timestamp(6)
  from_state        String?
  performed_by_role String?      // WHO performed the action
  session_id        String?      // Session context
  to_state          String?
}
```

### Extension for Support Actions

Add two new fields to `audit_logs`:

| Field | Type | Purpose |
|---|---|---|
| `platform_actor_id` | String? | Platform user ID (if action performed by support) |
| `support_session_id` | String? | Support session ID (if action performed within a session) |

### Audit Record for Support Actions

Every support action creates an `audit_logs` record with:

```typescript
{
  restaurant_id: session.restaurant_id,
  action_type: 'SUPPORT_' + operation,
  entity_type: targetEntityType,
  entity_id: targetEntityId,
  details: {
    platform_user_id: req.platformUser.id,
    platform_role: req.platformUser.role,
    support_session_id: session.id,
    scope: session.scope,
    changes: changeSummary
  },
  performed_by_role: 'SUPPORT_' + req.platformUser.role,
  support_session_id: session.id,
  platform_actor_id: req.platformUser.id
}
```

### What This Enables

- Full attribution: WHO did WHAT to WHICH tenant and WHY
- Session replay: reconstruct exactly what happened during a support session
- Compliance: immutable audit trail for platform actions
- AI accountability: AI actions are logged under the human-created session

---

## 9. AI Boundary

### AI Support Constraints

AI agents must NEVER:

1. Create support sessions
2. Extend their own session expiry
3. Increase their own scope
4. Select or change tenants
5. Perform protected operations (FINANCIAL, PERMISSIONS, DESTRUCTIVE)
6. Bypass scope checks
7. Log in as platform users

### AI Session Model

```
Human Support Engineer
    ?
Creates support session: { restaurant_id: X, scope: [DIAGNOSTICS, MENU], expires: 4h }
    ?
AI receives: { support_session_id: Y, scope: [DIAGNOSTICS, MENU], restaurant_id: X }
    ?
AI operates within session boundary
    ?
All AI actions logged with support_session_id + platform_actor_id
```

### AI Capability Token

Conceptually, AI receives a capability token:

```json
{
  "support_session_id": "uuid",
  "tenant_id": "uuid",
  "scope": ["DIAGNOSTICS", "MENU", "CONFIG"],
  "expires_at": "2026-08-16T23:00:00Z",
  "actor": "AI_SUPPORT",
  "created_by": "human-platform-user-id"
}
```

This token is NOT a platform identity. It is a time-limited, scoped capability that can be revoked.

---

## 10. Safe vs Protected Operations

### Safe Operations (Allowed with Appropriate Scope)

| Category | Example Operations | Required Scope |
|---|---|---|
| **Read/Diagnose** | View orders, menu, staff, inventory, reports, logs | READ |
| **Configuration** | Update restaurant settings, tax rates, order defaults | CONFIG |
| **Menu Management** | Create/update/delete categories, items, variants, prices | MENU |
| **Order Operations** | View orders, update status, reprint, reassign | ORDERS |
| **Device Management** | Test printers, manage pairing codes, view devices | DEVICE |
| **Health Checks** | Run diagnostics, view system status, check integrations | DIAGNOSTICS |

### Protected Operations (Never via Support Session)

| Category | Example Operations | Why Protected |
|---|---|---|
| **Financial** | Create transactions, settlements, payouts, refunds | Requires accounting authority |
| **Permissions** | Change staff roles, reset credentials, modify PINs | Security boundary |
| **Destructive** | Hard delete records, purge data, irreversible operations | Data integrity |
| **Accounting Config** | Modify chart of accounts, journal configuration | Financial integrity |
| **Tenant Lifecycle** | Suspend/close/archive tenant | Platform Owner only |
| **Integration Credentials** | Change FBR credentials, payment keys | Security/compliance |

### Dangerous Operations (Require Platform Owner Approval)

| Category | Example Operations | Approval Required |
|---|---|---|
| **Financial Corrections** | Reverse transactions, adjust settlements | Platform Owner |
| **Credential Changes** | Reset staff passwords, change owner email | Platform Owner |
| **Data Migration** | Import/export bulk data, restore records | Platform Owner |
| **Integration Changes** | Enable/disable FBR, change fiscal config | Platform Owner |

---

## 11. Tenant Problem Matrix

### Authentication/Login

| Problem | Support Can Diagnose | Support Can Fix | Tenant Can Fix | Requires Platform Owner |
|---|---|---|---|---|
| Login failure | Yes — inspect staff records, device pairing | Yes — reset pairing, unlock account | Yes — PIN reset if device available | No |
| Wrong role | Yes — inspect role assignments | Yes — reassign role | Yes — if they have permission | No |
| Device pairing issue | Yes — inspect paired devices | Yes — regenerate pairing code | Yes — re-pair device | No |
| Owner access lost | Yes — verify ownership | No — credential reset requires approval | No | Yes |

### Menu/Configuration

| Problem | Support Can Diagnose | Support Can Fix | Tenant Can Fix | Requires Platform Owner |
|---|---|---|---|---|
| Missing item | Yes — inspect menu | Yes — add/restore item | Yes — if they have access | No |
| Incorrect price | Yes — audit price history | Yes — correct price | Yes — if they have access | No |
| Wrong category | Yes — inspect categories | Yes — reassign category | Yes — if they have access | No |
| Duplicate items | Yes — detect duplicates | Yes — merge/remove duplicates | Yes — if they have access | No |
| QR menu broken | Yes — inspect QR config | Yes — regenerate QR codes | Yes — if they have access | No |

### POS/Orders

| Problem | Support Can Diagnose | Support Can Fix | Tenant Can Fix | Requires Platform Owner |
|---|---|---|---|---|
| Order stuck | Yes — inspect order state, KDS status | Yes — advance status, clear stuck state | Yes — if they have access | No |
| Order not reaching KDS | Yes — inspect routing, station config | Yes — fix routing, reassign station | Yes — if they have access | No |
| Duplicate order | Yes — audit order creation | Yes — void duplicate (non-financial) | Yes — if they have access | No |
| Settlement problem | Yes — inspect session | No — financial correction | No | Yes |
| Table/order mismatch | Yes — inspect table state | Yes — correct table assignment | Yes — if they have access | No |

### KDS/Devices

| Problem | Support Can Diagnose | Support Can Fix | Tenant Can Fix | Requires Platform Owner |
|---|---|---|---|---|
| Station offline | Yes — check device status | Yes — restart service, re-pair | Yes — restart terminal | No |
| Printer issue | Yes — test connection, inspect config | Yes — reconfigure, test print | Yes — if they have access | No |
| Routing issue | Yes — inspect station mapping | Yes — fix routing rules | Yes — if they have access | No |
| Order stuck in kitchen | Yes — inspect KDS state | Yes — advance/recall items | Yes — if they have access | No |

### Accounting/Financial

| Problem | Support Can Diagnose | Support Can Fix | Tenant Can Fix | Requires Platform Owner |
|---|---|---|---|---|
| Settlement mismatch | Yes — audit entries | No — financial correction | No | Yes |
| Cash session discrepancy | Yes — inspect session | No — financial correction | No | Yes |
| Journal posting problem | Yes — inspect journal entries | No — accounting config change | No | Yes |
| Supplier/payment issue | Yes — inspect ledgers | No — financial correction | No | Yes |

### Inventory

| Problem | Support Can Diagnose | Support Can Fix | Tenant Can Fix | Requires Platform Owner |
|---|---|---|---|---|
| Incorrect stock | Yes — audit stock levels | Yes — correct stock counts | Yes — if they have access | No |
| Consumption issue | Yes — analyze recipe usage | Yes — adjust recipes | Yes — if they have access | No |
| Recipe mismatch | Yes — inspect recipes | Yes — correct recipes | Yes — if they have access | No |
| Purchase discrepancy | Yes — inspect purchase orders | No — financial correction | No | Yes |

### Delivery

| Problem | Support Can Diagnose | Support Can Fix | Tenant Can Fix | Requires Platform Owner |
|---|---|---|---|---|
| Rider issue | Yes — inspect rider status | Yes — reassign, adjust shift | Yes — if they have access | No |
| Delivery state problem | Yes — inspect delivery records | Yes — correct state | Yes — if they have access | No |
| Settlement problem | Yes — inspect settlements | No — financial correction | No | Yes |

### SaaS/Integrations

| Problem | Support Can Diagnose | Support Can Fix | Tenant Can Fix | Requires Platform Owner |
|---|---|---|---|---|
| Subscription issue | Yes — inspect license/subscription | Yes — extend trial, apply license | No | Yes |
| Entitlement issue | Yes — inspect feature flags | Yes — enable features | No | Yes |
| FBR sync failure | Yes — inspect FBR logs | Yes — retry sync, reconfigure | Yes — if they have access | No |
| Printer integration | Yes — inspect printer config | Yes — reconfigure | Yes — if they have access | No |

---

## 12. x-target-restaurant Recommendation

### Current State

`x-target-restaurant` is a tenant-level mechanism that allows a tenant `SUPER_ADMIN` to override `req.restaurantId` and access other tenants' data via `/api/super-admin/*` routes.

### Recommendation: **TRANSITION**

1. **Short term**: Keep `x-target-restaurant` for backward compatibility with existing tenant SUPER_ADMIN workflows
2. **Medium term**: Restrict `x-target-restaurant` to platform-authenticated requests only (require `platformAuthMiddleware`)
3. **Long term**: Remove `x-target-restaurant` entirely; replace with support sessions

### Rationale

- `x-target-restaurant` was designed for tenant SUPER_ADMINs, not platform support
- It has no scope, no expiration, no audit trail
- It conflates tenant authority with platform authority
- Support sessions provide a cleaner, auditable, scoped replacement

---

## 13. Backup/Recovery Boundary

### Support/AI Must NEVER:

1. Restore production data without Platform Owner approval
2. Perform point-in-time recovery
3. Delete or modify backup data
4. Bypass audit trail during recovery
5. Roll back financial records without explicit approval
6. Restore individual tenant data without tenant + platform authorization

### Recovery Authorization Model

| Recovery Action | Required Authorization |
|---|---|
| Platform-wide backup | Platform Owner |
| Tenant-level restore | Platform Owner + Tenant Owner confirmation |
| Financial record recovery | Platform Owner + audit trail preservation |
| Point-in-time recovery | Platform Owner only |
| Backup verification | Support Engineer |

---

## 14. Custom Integration Boundary

### How FBR and Tenant Services Fit

Support sessions can:
- View integration configuration
- Test integration connectivity
- Retry failed operations
- Update non-sensitive configuration

Support sessions CANNOT:
- Access integration credentials/secrets
- Modify fiscal/regulatory settings without approval
- Change payment processor configurations
- Install custom code

### Integration Model

```
Tenant
  +-- Integration Config (encrypted/sealed)
  ¦   +-- FBR credentials
  ¦   +-- Payment provider keys
  ¦   +-- Printer configurations
  ¦   +-- Custom service endpoints
  ¦
  +-- Integration State
      +-- FBR sync status
      +-- Last successful operation
      +-- Error logs
      +-- Health status
```

Support can inspect and fix **state** but cannot modify **credentials** without Platform Owner approval.

---

## 15. Existing Code Reuse

### What Can Be Reused As-Is

| Component | Reuse Strategy |
|---|---|
| `PlatformAuthService` | Platform identity — no change needed |
| `platformAuthMiddleware` | Platform auth — no change needed |
| `requirePlatformRole` | Platform authorization — no change needed |
| `audit_logs` table | Add `platform_actor_id` and `support_session_id` fields |
| `authMiddleware` | Tenant auth — no change needed |
| `x-target-restaurant` | Temporary bridge — restrict later |
| `superAdminRoutes` | Gradually migrate to support sessions |
| `restaurants` table | Add `lifecycle_state` fields (future) |

### What Needs Adaptation

| Component | Adaptation |
|---|---|
| `audit_logs` | Add platform action fields |
| `superAdminRoutes` | Migrate to platform auth + support sessions |
| `restaurants` | Add `lifecycle_state` for onboarding tracking |

### What Must Be Created

| Component | Purpose |
|---|---|
| `support_sessions` table | Time-limited, scoped support access |
| `supportSessionMiddleware` | Validate support session + scope |
| `SupportSessionService` | Create, validate, revoke sessions |
| Support session routes | `/api/platform/support-sessions/*` |
| HQ support UI | Select tenant, create session, view diagnostics |

---

## 16. New Things Actually Required

### Minimum Viable Implementation

| New Component | Priority | Purpose |
|---|---|---|
| `support_sessions` table | CRITICAL | Persist support sessions |
| `supportSessionMiddleware` | CRITICAL | Validate session + scope before tenant operations |
| `SupportSessionService` | CRITICAL | Create, revoke, expire sessions |
| Platform support routes | CRITICAL | Create/list/revoke sessions |
| `audit_logs` extension | HIGH | Track platform actions |
| HQ support UI | MEDIUM | Select tenant, create session |
| Scope enforcement helpers | MEDIUM | Check scope before operations |
| Support session documentation | MEDIUM | Runbooks for support team |

### What We Are NOT Building

- No new identity provider
- No new database
- No microservices
- No AI infrastructure (yet)
- No backup system (yet)
- No complex IAM framework

---

## 17. Security Invariants

1. **Tenant JWT cannot create support authority** — support sessions require platform auth
2. **Tenant SUPER_ADMIN cannot create platform support authority** — platform roles come from Supabase app_metadata only
3. **Platform auth alone does not grant tenant access** — support session required
4. **Support session tenant_id is server-side** — client cannot change tenant target
5. **AI cannot create support sessions** — only human platform users can
6. **AI cannot extend/expand its own session** — session is immutable after creation
7. **Expired/revoked sessions cannot authorize requests** — checked on every request
8. **Financial/destructive operations require explicit scope** — not granted by default
9. **Every support action is attributable** — logged with platform actor + session ID
10. **Support sessions are time-limited** — auto-expire, max 24 hours

---

## 18. Migration Path

### Phase 1: Support Session Foundation (This Mission's Implementation)

1. Create `support_sessions` table
2. Create `supportSessionMiddleware`
3. Create `SupportSessionService`
4. Add support session routes to `/api/platform/*`
5. Add `platform_actor_id` and `support_session_id` to `audit_logs`

### Phase 2: HQ Integration

1. Update HQ app with support session UI
2. Add tenant selector + session creation flow
3. Add diagnostics dashboard scoped to session

### Phase 3: Route Migration

1. Migrate `/api/super-admin/*` routes to platform auth
2. Replace `x-target-restaurant` with support sessions for platform access
3. Deprecate old superAdminRoutes

### Phase 4: AI Integration

1. AI agents receive session-bound capability tokens
2. AI operates only within human-created sessions
3. All AI actions logged under parent session

### Backward Compatibility

- Existing tenant routes remain unchanged
- Existing tenant JWT auth remains unchanged
- `x-target-restaurant` remains for backward compatibility during transition
- No breaking changes to POS, KDS, or other tenant operations

---

## 19. Risks / Open Decisions

| Risk/Decision | Severity | Status |
|---|---|---|
| **Support session scope granularity** | MEDIUM | Current 6-scope model is minimal but may need expansion |
| **Session duration policy** | LOW | 4 hours is reasonable but may need adjustment |
| **AI session creation authority** | HIGH | Must remain human-only; needs clear enforcement |
| **Audit log schema change** | LOW | Adding nullable columns is backward compatible |
| **HQ UI complexity** | MEDIUM | Support session management UI must be simple |
| **Tenant notification** | LOW | Should tenants be notified of support sessions? |
| **Concurrent sessions** | LOW | Should we allow multiple simultaneous support sessions on one tenant? |
| **Session auto-completion** | LOW | Should sessions auto-close after period of inactivity? |

---

## 20. Recommended Next Mission

**Mission 006B — Support Session Implementation Plan**

This mission should produce an implementation-ready plan for:

1. Creating `support_sessions` table with migration
2. Implementing `SupportSessionService`
3. Implementing `supportSessionMiddleware`
4. Creating support session routes under `/api/platform/support-sessions`
5. Extending `audit_logs` with `platform_actor_id` and `support_session_id`
6. Updating HQ app with minimal support session UI
7. Defining scope enforcement helpers
8. Migration path for `/api/super-admin/*` routes

The plan must preserve existing tenant auth, avoid breaking changes, and keep the implementation small enough for a single developer + AI agents to execute quickly.
