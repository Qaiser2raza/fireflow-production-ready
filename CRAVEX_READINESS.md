# Cravex Marketplace Readiness Audit

Audit date: 2026-06-25

## Executive Verdict

FireFlow has useful restaurant operating primitives for Cravex, but it is not yet marketplace-ready. Cravex should integrate through a new external API and event layer, not through the current internal CRUD routes.

Estimated backend readiness:

| Category | Estimate |
|---|---:|
| Already reusable with light wrapping | 35% |
| Requires modification/hardening | 40% |
| Requires new development | 25% |

These are architectural estimates based on source inspection, not implementation commitments.

## Existing APIs Usable by Cravex

Potentially reusable after authentication, tenant, validation, and documentation hardening:

- Restaurant profile: `/api/restaurants/:restaurantId/profile`
- Menu catalog: `/api/menu_items`, `/api/menu_categories`
- QR-style order creation: `/api/orders/qr`
- QR order status: `/api/orders/qr-status/:orderId`
- QR approval queue: `/api/orders/qr-pending`, `/api/orders/qr-approve`, `/api/orders/qr-reject`
- Order details: `/api/orders/:id`
- Delivery workflow routes under `src/api/routes/deliveryRoutes.ts`
- Customers and addresses under `src/api/routes/customerRoutes.ts`
- Reporting and financial summaries under `src/api/routes/reportRoutes.ts`, `analyticsRoutes.ts`, and finance/accounting routes
- SaaS/HQ licensing and restaurant subscription data through super admin/cloud services

Important caveat: many of these are internal operational APIs. Cravex should receive a versioned marketplace API, for example `/api/integrations/cravex/v1/*`.

## Existing Entities Reusable by Cravex

High reuse:
- `restaurants`
- `restaurant_features`
- `menu_categories`
- `menu_items`
- `menu_item_variants`
- `customers`
- `customer_addresses`
- `orders`
- `order_items`
- `delivery_orders`
- `transactions`
- `staff` for rider/restaurant operator mapping
- `stations` for prep routing visibility

Moderate reuse:
- `cashier_sessions`
- `rider_shifts`
- `rider_settlements`
- `ledger_entries`
- `journal_entries`
- `fbr_sync_logs`
- `audit_logs`
- `system_logs`

Low direct reuse:
- `tables`, `sections`, `dine_in_orders`, and KDS-only fire batch behavior unless Cravex supports dine-in QR ordering.

## Missing APIs

Cravex needs a clean external contract for:

- Merchant onboarding and marketplace publish/unpublish.
- Public restaurant availability, service hours, delivery radius/zones, pause status.
- Public catalog with variants, modifiers, availability, prices, taxes, fees, prep times, images.
- Marketplace cart quote: subtotal, tax, service fee, delivery fee, discount, ETA.
- External order creation with idempotency key.
- Order acceptance/rejection by restaurant.
- Order status timeline: received, accepted, preparing, ready, dispatched, delivered, cancelled.
- Driver assignment and delivery tracking exposed safely.
- Customer identity mapping between Cravex users and FireFlow customers.
- Refund/cancellation/void requests.
- Settlement summaries between Cravex and restaurant.
- Webhook registration and retry controls.

## Missing Events

FireFlow emits Socket.IO updates, but Cravex needs durable events. Add an outbox with at least:

- `restaurant.availability_changed`
- `catalog.item_created`
- `catalog.item_updated`
- `catalog.item_availability_changed`
- `order.created`
- `order.accepted`
- `order.rejected`
- `order.updated`
- `order.item_status_changed`
- `order.ready`
- `delivery.assigned`
- `delivery.dispatched`
- `delivery.delivered`
- `delivery.failed`
- `payment.captured`
- `payment.refunded`
- `settlement.created`

## Missing Webhooks

FireFlow currently lacks a dedicated webhook subsystem. Cravex requires:

- Per-integration webhook endpoints.
- Secret signing and timestamped signatures.
- Retry/backoff and dead-letter queue.
- Idempotent event delivery.
- Event replay by restaurant/order/date.
- Audit logs for webhook delivery.

## Required Integration Points

1. Tenant and integration identity:
   - Cravex API key per restaurant or marketplace account.
   - Mapping: Cravex merchant ID to FireFlow `restaurant_id`.

2. Catalog sync:
   - Pull endpoint for full catalog.
   - Push/outbox events for incremental updates.
   - Image URL strategy.

3. Order injection:
   - Idempotency keys.
   - Marketplace order number.
   - Customer/address payload.
   - Payment mode: prepaid, COD, wallet, third-party.
   - Delivery mode: restaurant rider, Cravex rider, pickup.

4. Operational acceptance:
   - Restaurant accepts/rejects order.
   - KDS/POS receives marketplace order without using public QR semantics as a hidden shortcut.

5. Delivery and rider:
   - Assignment, dispatch, location updates, delivered/failed status.

6. Accounting:
   - Commission, marketplace receivable/payable, settlement batch, payout reconciliation.

## Reusable Backend Estimate

| Backend area | Reuse | Modification | New dev |
|---|---:|---:|---:|
| Auth/tenant foundation | 40% | 50% | 10% |
| Restaurant/menu catalog | 55% | 30% | 15% |
| Orders/order items | 45% | 40% | 15% |
| QR public order flow | 35% | 40% | 25% |
| Delivery workflow | 50% | 35% | 15% |
| Customers/addresses | 60% | 25% | 15% |
| Accounting/settlement | 35% | 40% | 25% |
| Events/webhooks | 10% | 20% | 70% |

Overall estimate: 35% reusable, 40% modification, 25% new development.

## Recommendation

Build Cravex integration as an adapter layer around FireFlow, not as direct access to existing app routes. The most valuable first milestone is a durable marketplace order intake flow:

1. Create external catalog read API.
2. Add marketplace order create API with idempotency.
3. Add POS/KDS visibility for external orders.
4. Add event outbox and webhooks for status updates.
5. Add settlement/commission accounting.

