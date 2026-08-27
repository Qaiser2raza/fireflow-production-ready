# FireFlow — ADR Index

This directory contains Architectural Decision Records for established decisions.
ADRs are written after the decision is made, documenting what was decided and why.

---

## ADR-001: Hybrid Local + Cloud Architecture

**Status**: Accepted
**Date**: 2026-01

**Decision**: FireFlow uses a hybrid architecture where operational data (orders, menu, inventory, accounting) runs on a local PostgreSQL database via Express API, while SaaS metadata (licenses, subscriptions, payments) is managed through Supabase cloud.

**Rationale**:
- Restaurants need offline-capable operations; local DB ensures POS works without internet
- SaaS features (licensing, multi-restaurant management) benefit from cloud sync
- Supabase provides auth, realtime, and managed database for cloud features
- Keeps operational data on-premise for performance and data sovereignty

**Consequences**:
- Two database connections to manage (Prisma local + Supabase client)
- Cloud data must sync back to local for UI consistency
- Offline mode is possible for core operations but not for SaaS features

---

## ADR-002: Restaurant-Scoped Multi-Tenancy

**Status**: Accepted
**Date**: 2026-01

**Decision**: Tenant isolation is implemented via `restaurant_id` on all operational entities, with tenant context derived from JWT claims (`req.restaurantId`).

**Rationale**:
- Single database can serve multiple restaurants (efficient for SaaS)
- JWT claims provide stateless tenant context
- Tenant-scoped unique constraints prevent cross-tenant duplication

**Consequences**:
- Auth middleware must be applied consistently to enforce tenant boundaries
- Cross-tenant operations (super admin) require explicit targeting and audit logging
- Some legacy routes still accept `restaurant_id` from client input (known debt)

---

## ADR-003: JWT Authentication with Device Pairing

**Status**: Accepted
**Date**: 2026-01

**Decision**: Authentication uses JWT access tokens + refresh tokens, with device pairing via QR codes and device fingerprinting for trusted terminals.

**Rationale**:
- JWT provides stateless auth suitable for desktop + mobile clients
- Refresh tokens enable long-lived sessions without re-login
- Device pairing allows trusted terminals to bypass repeated PIN entry
- Fingerprinting prevents unauthorized device reuse

**Consequences**:
- Token revocation requires a blacklist or short expiry
- Device pairing adds complexity but improves UX for restaurant terminals
- Plaintext PIN fallback remains during migration (known security debt)

---

## ADR-004: Order Type Strategy Pattern

**Status**: Accepted
**Date**: 2026-02

**Decision**: Order creation and lifecycle management use a strategy pattern with `BaseOrderService` abstract class and concrete implementations for DineIn, Takeaway, Delivery, and Reservation.

**Rationale**:
- Each order type has different lifecycle, validation, and side effects
- Strategy pattern keeps type-specific logic isolated
- `OrderServiceFactory` provides a single entry point for order creation
- Facilitates adding new order types (e.g., QR ordering) without modifying core logic

**Consequences**:
- Service layer is more complex but maintainable
- Frontend must understand order type differences for UI rendering
- Some order logic still lives in inline routes (known debt)

---

## ADR-005: Socket.IO Realtime Event Bridge

**Status**: Accepted
**Date**: 2026-02

**Decision**: Realtime updates use Socket.IO with restaurant-scoped rooms. Backend emits `db_change` events after mutations; frontend updates local state optimistically.

**Rationale**:
- Restaurant operations require immediate visibility across terminals (POS, KDS, logistics)
- Socket.IO provides fallback transports for unreliable networks
- Restaurant-scoped rooms prevent cross-tenant data leakage
- Frontend optimistic updates improve perceived performance

**Consequences**:
- Event naming and payload shape must be consistent across services
- Reconnection logic must rejoin rooms and resync state
- Socket events bypass HTTP auth; restaurant room membership is the security boundary

---

## ADR-006: Electron Desktop Deployment

**Status**: Accepted
**Date**: 2026-03

**Decision**: FireFlow is packaged as an Electron desktop app for Windows, with the Express server spawned as a child process and IPC for hardware integration (printers, secure store).

**Rationale**:
- Restaurants prefer desktop apps for reliability and hardware access
- Electron enables local printer integration (thermal, network)
- `electron-store` provides encrypted local storage for tokens and config
- Single installer simplifies deployment for non-technical users

**Consequences**:
- Electron app is Windows-focused (primary market)
- Server runs in-process; crash recovery requires watchdog or restart logic
- Updates require rebuilding and redistributing the Electron app

---

## ADR-007: Backend-as-Source-of-Truth for Financial Calculations

**Status**: Accepted
**Date**: 2026-03

**Decision**: All financial calculations (tax, service charge, discount, delivery fee, totals) are performed on the backend. Frontend `billEngine.ts` is for preview only.

**Rationale**:
- Financial integrity requires a single source of truth
- Client-side calculations can be tampered with or drift from backend logic
- Backend has access to authoritative config (order type defaults, restaurant settings)

**Consequences**:
- Frontend must wait for backend response to show final totals
- `billEngine.ts` must be kept in sync with backend logic
- Settlement endpoint recalculates and validates all amounts

---

## ADR-008: Soft Delete with Audit Trail

**Status**: Accepted
**Date**: 2026-03

**Decision**: Orders and other entities use soft delete (`deleted_at`, `is_deleted`) rather than hard delete. All mutations are logged in `audit_logs` or `system_logs`.

**Rationale**:
- Restaurant operations require auditability for disputes and compliance
- Soft delete preserves data for reporting and recovery
- Audit trail is required for financial and security compliance

**Consequences**:
- Queries must filter out soft-deleted records
- Database grows over time; retention policy needed
- No physical deletion means GDPR "right to be forgotten" requires special handling

---

## ADR-0009: Authority Model per Data Domain

**Status**: Accepted
**Date**: 2026-08-26

**Decision**: Every data domain is assigned exactly one authority posture:

1. **LOCAL-AUTHORITATIVE** — operational truth lives in the node's PostgreSQL.
   Orders, order items, fire batches, tables/floor, menu catalog, customers,
   cashier sessions & shift logs, transactions, journal entries & ledgers,
   fiscal documents & attempts, rider shifts, staff identity & PIN hashes,
   audit/system logs, outbox.
   Written only through FireFlow backend services inside Prisma transactions.
   Cloud never holds operational data. Cravex/AI read via FireFlow contracts only.
   Posted accounting records immutable; corrections are reversals.

2. **CLOUD-AUTHORITATIVE** — SaaS truth lives in Supabase; service role is the only writer.
   License keys & entitlement state, `restaurants_cloud` subscription/billing
   mirror, `subscription_payments`, owner identity (Supabase Auth), platform
   support sessions.
   No client — anonymous or authenticated tenant — writes these tables, ever
   (TD-12 lockdown enforces; RLS: reads scoped, writes service-role-only).
   Server-side writers require `SUPABASE_SERVICE_KEY`; absence = loud
   configuration failure, never anon fallback (fail-closed, per G2).
   Cross-system flows (provisioning ? cloud registration) propagate via the
   durable outbox + dispatcher (ADR-7 pattern), idempotent by key, UNKNOWN-
   reconciling — never ad-hoc client writes, never inside a PG transaction.
   Licensing enforcement is local-cryptographic (`license.lic`) so an offline
   kitchen keeps running; cloud is the issuance/mirror plane, not the runtime gate.

3. **SERVER-FED LOCAL CACHE** — server response is truth; storage mirrors for boot UX.
   `currentRestaurant` / `restaurant_id` device binding, ops config cache,
   user preferences, theme.
   Context/state hydrates ONLY from server responses at lifecycle events
   (login/expiry/logout) — the F-V15 invariant generalized to every cache.
   Storage never feeds render directly except as documented boot-time fallback;
   pre-auth rendering of tenant-scoped data is forbidden (TD-13).

**Rationale**:
- F-V15, G3, and TD-12 all trace to one ambiguity — which side of the hybrid
  split is authoritative for each domain. This ADR names the rule once.
- Eliminates the "convenience path" anti-pattern where client code reaches
  directly into cloud or local tables outside the declared writer class.
- Makes future domains (inventory, Cravex, AI memory) explicitly declare their
  posture before implementation.

**Consequences**:
- TD-12 lockdown, G2 signing gate, G5 dead-surface sweep, and the F-V15
  invariant become instances of this ADR rather than one-off rulings.
- HQ console (`src/hq/hqApi.ts`) must move behind a service-key API before it
  can write again — it currently violates R1 by construction.
- Future domains must declare their posture here before implementation.
