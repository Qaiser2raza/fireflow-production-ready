# ADR-0009: Authority Model per Data Domain

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
   Cross-system flows (provisioning → cloud registration) propagate via the
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

**Rules**:
- R1. One writer class per domain: local services (1), HQ/service-role APIs (2),
  authenticated server responses (3). Anything else is a bug or a hole.
- R2. Every cross-domain flow declares its direction and mechanism (direct call,
  outbox event, or cache refresh) — no convenience paths around boundaries.
- R3. "Verified" claims name which layers were probed: app authz, socket scope,
  DB RLS/policies, API contract (C4 doctrine). Layer probes live in the
  release gate.
- R4. Schema drift between `supabase/*.sql` and live cloud is debt; migrations/
  tooling are the single source of truth once service credentials exist (G4).
