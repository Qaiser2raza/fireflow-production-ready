# Project Constitution

## Identity

FireFlow is an AI-native Business Operating System for restaurants.
It combines deterministic restaurant operations with an AI assistance layer.

## Product Direction

- Initial focus: restaurant vertical (dine-in, takeaway, delivery, reservations)
- Foundation: managed SaaS Business Operating System; FireFlow SaaS Management/HQ is the platform control plane above the tenant layer
- Onboarding: FireFlow Support manages and assists initial tenant configuration
- Expansion path: modular architecture enabling future verticals (RetailFlow) and marketplace integrations (Cravex)
- Extensibility: modules, integrations, and custom services are configured per-tenant without forking the core
- AI is assistive, not authoritative

## Core Business Principles

1. Restaurant operations are deterministic and must never depend on AI for correctness.
2. Financial integrity is non-negotiable: backend is the source of truth.
3. Tenant data isolation is mandatory: no cross-tenant leakage.
4. Platform-managed tenant operations with enforced isolation, auditability, and supportability.
5. Audit trail for every financial and security-sensitive action.

## AI Principles

1. AI assists staff decisions; it does not make business-critical decisions.
2. AI has no authority over: financial transactions, permissions, security, order finalization, voiding, refunds.
3. AI recommendations must be clearly labeled as suggestions.
4. AI interactions must be logged but not relied upon for compliance.
5. The system must function fully without AI connectivity.

## Tenant / Business Isolation Principles

1. Every tenant (restaurant) is isolated by `restaurant_id`.
2. Tenant context is derived from authenticated identity, never from client input.
3. SaaS cloud data (licenses, subscriptions) is separate from operational data (orders, menu).
4. Cross-tenant operations (super admin) require explicit authorization and audit logging.

## Financial Integrity Principles

1. Backend calculates all financial totals: subtotal, tax, service charge, discount, delivery fee.
2. Frontend calculations are for preview only; backend recalculates on settlement.
3. All financial mutations use atomic database transactions.
4. Double-entry accounting is enforced: every debit has a corresponding credit.
5. Cashier sessions and rider shifts must balance before closing.
6. No financial record may be deleted; corrections use reversal entries.

## Architecture Principles

1. Modular backend services with clear domain boundaries.
2. Shared types and utilities between frontend and backend.
3. Realtime updates via Socket.IO with tenant-scoped rooms.
4. Local PostgreSQL for operational data; Supabase for SaaS metadata.
5. Electron for desktop deployment; web clients for mobile/HQ.
6. Provider-independent AI abstraction (no hard dependency on one LLM provider).

## Authority Boundaries

- **Founder** defines product direction, business model, and principle changes.
- **Agents** implement within these principles; they may propose changes but must not silently override them.
- **Code** is subordinate to this constitution. When code contradicts constitution, the constitution is authoritative and the code is buggy.
