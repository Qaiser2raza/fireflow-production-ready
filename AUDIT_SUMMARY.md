# FireFlow Ecosystem Audit Summary

Audit date: 2026-06-25

Scope: determine whether FireFlow can evolve into a multi-product ecosystem consisting of FireFlow, RetailFlow, and Cravex Marketplace. This audit is read-only with respect to production code; only audit documents were created.

## Executive Verdict

FireFlow can evolve into a multi-product ecosystem, but it should not be refactored directly into Shared Core yet. The codebase has real domain assets: a normalized Prisma schema, restaurant-scoped entities, a working order abstraction, accounting services, delivery/KDS/POS modules, SaaS licensing, and reusable UI primitives. The current risk is that these assets are mixed with product-specific assumptions, inline route logic, inconsistent tenant enforcement, and large UI/API files.

Recommended next step: deploy Fire Grill only after closing the critical tenant/auth and operational reset risks. In parallel, start a small Shared Core extraction plan around stable backend services and types, not a broad rewrite.

## High-Level Scores

| Area | Readiness | Notes |
|---|---:|---|
| FireFlow restaurant product | 75% | Feature-rich and pilot-oriented, but needs hardening around route security and test coverage. |
| Shared Core extraction | 55% | Good domain candidates exist, but route/API and frontend state are tightly coupled. |
| Cravex Marketplace integration | 45% | Menu/customer/order/payment primitives are usable; marketplace APIs, events, webhooks, merchant catalog boundaries are missing. |
| RetailFlow reuse | 50% | Auth, tenanting, accounting, inventory seeds, suppliers, customers, staff, reporting are reusable; restaurant-specific POS/KDS/floor logic should remain FireFlow-specific. |
| Technical debt posture | Medium-high risk | Large files, partial modularization, auth inconsistencies, plaintext PIN compatibility, and weak test scripts are the main blockers. |

## Most Important Findings

1. FireFlow is partially modular, not fully modular. Domain services exist under `src/api/services`, route modules exist under `src/api/routes`, shared frontend utilities exist under `src/shared`, and product UI is grouped under `src/operations` and `src/features`. However, `src/api/server.ts` is still a 3,424-line mixed entry point containing many inline routes.

2. Tenant boundaries are modeled consistently in the database through `restaurant_id`, but enforcement is inconsistent. `authMiddleware` attaches `req.restaurantId`, yet many routes accept `restaurant_id` from query/body or are registered without auth.

3. The strongest Shared Core candidates are auth/JWT, tenant context, Prisma client, accounting/journal services, reporting primitives, customer/supplier ledgers, staff/roles, feature flags, cloud licensing client, and generic UI controls.

4. RetailFlow should reuse accounting, customers, staff, suppliers, inventory ledgers, reporting, SaaS/HQ, auth, and device/licensing infrastructure. It should rewrite restaurant table/floor/KDS-specific flows and most POS interaction logic.

5. Cravex can reuse FireFlow menu, customer, order, delivery, and payment concepts, but it needs new integration contracts: public catalog APIs, order injection APIs, webhook/event outbox, merchant availability, delivery quotation, settlement, and marketplace identity mapping.

## Recommended Sequence

1. Hardening sprint before deployment:
   - Apply `authMiddleware` and tenant checks consistently.
   - Remove or lock down destructive/system reset endpoints.
   - Stop returning staff PINs to frontend paths.
   - Replace plaintext PIN fallback with a migration deadline.
   - Configure real test/lint scripts.

2. Shared Core preparation:
   - Create a tenant-aware API/service pattern.
   - Extract domain interfaces from `BaseOrderService`, accounting, ledgers, customer, supplier, staff, and reports.
   - Add contract tests around orders, settlements, accounting, and tenant isolation.

3. Cravex integration:
   - Build an event/outbox layer first.
   - Add public marketplace APIs as a separate surface, not by exposing internal CRUD endpoints.
   - Introduce API keys/webhooks per merchant/restaurant.

4. RetailFlow planning:
   - Reuse the core tenant/accounting/customer/supplier/inventory/reporting substrate.
   - Build a new RetailFlow POS and catalog model for barcode/SKU/stock workflows.

## Deliverables

- `ARCHITECTURE_AUDIT.md`
- `CRAVEX_READINESS.md`
- `RETAILFLOW_READINESS.md`
- `TECHNICAL_DEBT.md`
- `AUDIT_SUMMARY.md`

