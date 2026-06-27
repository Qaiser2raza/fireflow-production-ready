# RetailFlow Readiness Audit

Audit date: 2026-06-25

## Executive Verdict

RetailFlow can reuse FireFlow foundations, but it should not inherit FireFlow's restaurant-specific POS/KDS/floor model wholesale. The strongest reuse is in tenanting, auth, licensing, accounting, staff, customers, suppliers, inventory, reporting, and shared UI. RetailFlow needs a new retail catalog, barcode/SKU, stock movement, purchase, return, and checkout experience.

Estimated development savings if RetailFlow is built from FireFlow foundations: 35-50%, assuming tenant/auth/accounting/reporting are hardened before reuse.

## Module Classification

| Module | Classification | Reason |
|---|---|---|
| Auth/JWT/session infrastructure | EXTRACT | Needed by all products; requires consistent route protection. |
| Tenant model via `restaurants` | EXTRACT | Rename or generalize to `businesses`/`tenants` for multi-product use. |
| SaaS/HQ/licensing | REUSE | Product-level subscriptions, license keys, and billing are directly useful. |
| Staff/roles | EXTRACT | Staff exists, but roles need product-specific permission maps. |
| Device pairing | REUSE | Useful for retail terminals and back-office devices. |
| Shared UI primitives | EXTRACT | Buttons, inputs, modals, cards, badges can form a design system base. |
| API client/auth interceptor | EXTRACT | Good base, but should become product-neutral and tenant-aware. |
| Prisma schema as a whole | REWRITE | Use FireFlow schema as reference; do not reuse restaurant table names blindly. |
| Accounting service | EXTRACT | Valuable, but ledger abstractions must be clarified and tested. |
| Journal entry service | EXTRACT | Strong candidate for shared finance core. |
| Chart of accounts | REUSE | Retail and restaurant accounting both need COA. |
| Cashier sessions | REUSE | Retail shifts/register sessions map well. |
| Transactions/payments | REUSE | Payment concepts are shared. Add returns/refunds/change drawer controls. |
| Expenses | REUSE | Common business function. |
| Reports framework | EXTRACT | Report rendering/data patterns reusable; reports themselves vary by product. |
| Customers/customer ledger | REUSE | Retail customers, credit, loyalty, khata, statements are reusable. |
| Suppliers/supplier ledger | REUSE | Strong retail fit. |
| Inventory items | REUSE | Good seed, but RetailFlow needs SKU/barcode, units, variants, batches, expiry. |
| Purchase orders | REUSE | Strong retail fit after improving receiving and stock movements. |
| Recipe items | KEEP | Restaurant-specific ingredient recipe mapping. |
| Menu categories/items | REWRITE | Retail needs product catalog/SKU model rather than menu model. |
| Order base service | EXTRACT | Useful pattern; create retail sale/order services separately. |
| Dine-in service | KEEP | FireFlow-specific. |
| Takeaway service | KEEP | Restaurant-specific token semantics. |
| Delivery service | REUSE | Retail delivery can reuse parts, but fulfillment semantics differ. |
| Reservation service | KEEP | Restaurant-specific unless RetailFlow adds appointment-style services. |
| POS desktop/mobile views | REWRITE | Retail checkout requires barcode scan, quantity/weight, returns, discounts, inventory lookup. |
| Payment modal/settlement | REUSE | Reuse concepts and some code, but adapt UI to retail. |
| KDS | KEEP | Restaurant kitchen workflow. |
| Stations | KEEP | KDS prep stations; retail may need warehouse/stock locations instead. |
| Floor/table/sections | KEEP | Restaurant-specific. |
| QR table ordering | KEEP | Restaurant-specific. |
| Delivery/rider operations | REUSE | Useful for retail delivery fleet, with modified workflows. |
| FBR/tax integration | REUSE | Pakistan tax/fiscal integration may apply to retail. |
| Feature flags | EXTRACT | Product-neutral capability flags. |
| Offline cache/fetch retry | EXTRACT | Useful for retail terminals. |
| Cloud/Supabase client | REUSE | SaaS management and billing can be shared. |

## KEEP

Keep in FireFlow:
- KDS and kitchen station workflow.
- Table/floor/sections/guest count management.
- Dine-in order extension.
- Restaurant QR table ordering and approval queue.
- Fire batches and recall semantics.
- Restaurant menu recipe semantics where tied to kitchen preparation.

## REUSE

Reuse with limited adaptation:
- SaaS/HQ/license system.
- Cashier sessions and shift handling.
- Transactions, expenses, COA, journal reports.
- Customers and customer ledgers.
- Suppliers and supplier ledgers.
- Delivery/rider foundations.
- Tax/FBR service if applicable.
- Device pairing and terminal management.

## EXTRACT

Extract into Shared Core:
- Auth, tenant context, roles, permissions.
- API client, token refresh, tenant targeting.
- Prisma/service conventions.
- Accounting and reporting interfaces.
- Shared UI components.
- Feature flags and monitoring.
- Event/outbox layer once added.

## REWRITE

Rewrite for RetailFlow:
- Product catalog and SKU model.
- Barcode scanning and weighing workflows.
- Stock adjustments, transfers, batch/expiry, purchase receiving.
- Retail checkout UI.
- Returns/exchanges/refunds.
- Promotions/loyalty/coupons.
- Retail-specific reports: stock aging, shrinkage, margin by SKU, category turns.

## Estimated Development Savings

| Area | Savings |
|---|---:|
| Auth, SaaS, tenant, licensing | 60-75% |
| Accounting/finance | 50-65% |
| Staff/customer/supplier | 50-70% |
| Inventory/purchase foundation | 30-45% |
| POS frontend | 10-25% |
| Reporting | 35-50% |
| Delivery | 35-50% |

Overall savings: 35-50%.

## Recommendation

Do not start RetailFlow by forking the full FireFlow app. First extract and harden Shared Core around tenant/auth/accounting/customer/supplier/inventory/reporting. Then build RetailFlow as a sibling product with its own catalog and POS.

