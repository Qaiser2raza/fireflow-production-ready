# Mission 014A — Security Remediation Report

**Date:** 2026-08-21
**Status:** IMPLEMENTATION IN PROGRESS
**Branch:** main

---

## CURRENT STATE

### Gap 1: `GET /api/orders/:id` — Unauthenticated, Cross-Tenant Data Leak
- **File:** `src/api/server.ts:2617`
- **Current code:** No `authMiddleware`. Queries `prisma.orders.findUnique({ where: { id } })` without `restaurant_id`.
- **Impact:** Anyone with network access can enumerate orders by UUID. Cross-tenant orders are fully exposed.

### Gap 2: `PATCH /api/orders/:id` — Void/Cancel Without Role Authorization
- **File:** `src/api/server.ts:1271`
- **Current code:** Has `authMiddleware` but no `requireRole`. Any authenticated staff can set `status: 'VOIDED'` or `'CANCELLED'`.
- **Impact:** Unauthorized voids/cancellations. No kitchen-state check, no manager approval, no audit.

### Gap 3: Discount `max` Not Enforced Server-Side
- **File:** `src/api/services/orders/BaseOrderService.ts:518`
- **Current code:** `const discountAmount = Number(overrideBreakdown?.discount ?? order.discount ?? 0);`
- **Impact:** Client can bypass `order_type_defaults.discount_max` by sending an inflated `breakdown.discount`.

### Gap 4: Silent Refund via Generic Order Update
- **File:** `src/api/server.ts:1271` (PATCH /api/orders/:id)
- **Current code:** No refund endpoint. Refund metadata (`void_notes`, `refund_transaction_id`) can be set through generic update.
- **Impact:** Refunds bypass payment service and accounting reversal.

### Gap 5: Plaintext Staff PIN Storage
- **File:** `prisma/schema.prisma:837` (`staff.pin`), `src/api/server.ts:504-534, 829-853`
- **Current code:** `staff.pin` stores plaintext. `staff.hashed_pin` is optional. Login falls back to plaintext comparison. Migration to hash occurs on successful login but plaintext is never removed.
- **Impact:** Credential exposure if database is compromised.

### Gap 6: Printer CRUD Unrestricted
- **File:** `src/api/routes/printerRoutes.ts`
- **Current code:** No `requireRole`. Any authenticated staff can CRUD printers across the restaurant. No station/location scope.
- **Impact:** Operational disruption, unauthorized printer access.

---

## RISKS

1. **Production data leak:** Gap 1 is actively exploitable in any deployed environment.
2. **Revenue leakage:** Gap 3 allows unauthorized discounts.
3. **Operational fraud:** Gap 2 allows unauthorized voids; Gap 6 allows printer sabotage.
4. **Credential compromise:** Gap 5 exposes plaintext PINs.
5. **Refund fraud:** Gap 4 bypasses financial controls.

---

## REQUIRED CHANGES

### Fix 1: Order-Read Tenant Isolation
- Add `authMiddleware` to `GET /api/orders/:id`.
- Replace `findUnique({ where: { id } })` with `findFirst({ where: { id, restaurant_id: req.restaurantId } })`.
- Apply same fix to all order-read endpoints that omit `restaurant_id`.
- Return `404 Not Found` for cross-tenant or missing records.

### Fix 2: Void/Cancel Authorization
- Add `requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN')` to `PATCH /api/orders/:id`.
- In `BaseOrderService.updateOrder()`, enforce:
  - `CANCELLED` only if order not fired and not paid.
  - `VOIDED` only with manager role + kitchen state check.
  - Audit all authorized status transitions.
- Add permission constants: `ORDER_CANCEL_BEFORE_KITCHEN`, `ORDER_VOID_AFTER_KITCHEN`, `ORDER_REOPEN`, `REFUND_CREATE`.

### Fix 3: Server-Side Discount Enforcement
- In `BaseOrderService.recalculateTotals()`, after computing `discountAmount`:
  - Fetch `order_type_defaults.discount_max` for the order's restaurant and type.
  - Reject if `discountAmount > maxAllowedDiscount`.
  - Reject if `discountAmount > subtotal`.
  - Reject negative/malformed values.
- Ensure server calculation is authoritative; never trust client `max`.

### Fix 4: Refund Boundary
- Do not add a full refund endpoint in this hotfix.
- Prevent `PATCH /api/orders/:id` from setting refund-related fields (`refund_transaction_id`, `void_notes` with refund intent).
- Validate that refund state can only be set through explicit payment service boundary.
- Add regression test proving generic update cannot mark refund.

### Fix 5: PIN Hardening
- Remove plaintext fallback paths in `server.ts:504-534, 829-853`.
- Enforce bcrypt-only verification.
- After successful bcrypt verification, if `hashed_pin` exists, clear `staff.pin` (set to empty string or null).
- Add migration to remove plaintext PINs from existing staff records.
- Rate-limit PIN verification attempts.
- Audit successful and failed PIN verifications.

### Fix 6: Printer CRUD Authorization
- Add `requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN')` to all printer CRUD routes.
- Enforce `restaurant_id` scope on every query (already present in some routes).
- Add station/location ownership check where applicable.
- Sanitize printer configuration output (exclude credentials).
- Add audit logging for printer CRUD.

---

## TEST PLAN

### Test File: `tests/mission-014A-pos-security.test.ts`
Run against isolated PostgreSQL database `fireflow_test_014A`.

### Gap 1 Tests
- [ ] Unauthenticated `GET /api/orders/:id` returns `401`
- [ ] Authenticated cross-tenant `GET /api/orders/:id` returns `404`
- [ ] Same-tenant `GET /api/orders/:id` returns `200` with order data
- [ ] Non-existent order returns `404`

### Gap 2 Tests
- [ ] CASHIER role cannot void/cancel order
- [ ] MANAGER role can void/cancel with valid kitchen state
- [ ] Wrong restaurant void rejected
- [ ] Void on already-paid order rejected
- [ ] Audit log created for authorized void/cancel
- [ ] Client-side PIN alone cannot authorize void

### Gap 3 Tests
- [ ] Discount exceeding `discount_max` rejected
- [ ] Discount exceeding subtotal rejected
- [ ] Negative/malformed discount rejected
- [ ] Valid discount within max succeeds
- [ ] Server-enforced max from `order_type_defaults`

### Gap 4 Tests
- [ ] `PATCH /api/orders/:id` cannot set `refund_transaction_id`
- [ ] `PATCH /api/orders/:id` cannot set refund metadata in `void_notes`
- [ ] Refund state requires payment service coordination (verified by absence of direct update path)

### Gap 5 Tests
- [ ] No plaintext PIN remains in `staff.pin` after migration
- [ ] Correct PIN verifies successfully
- [ ] Incorrect PIN fails
- [ ] Failed attempts rate-limited
- [ ] Approval audited in `audit_logs`
- [ ] Cross-tenant PIN verification fails

### Gap 6 Tests
- [ ] Cross-tenant printer CRUD rejected
- [ ] Unauthorized role rejected
- [ ] Valid manager can create/update/delete printer within restaurant
- [ ] Printer credentials not exposed in API response

### Regression Tests
Run all existing mission tests:
```text
Mission 008A-RV: 18/18
Mission 009: 15/15
Mission 010: 24/24
Mission 011: 24/24
Mission 012: 27/27
Mission 013: 14/14
```

---

## IMPLEMENTATION ORDER

1. Fix 1 (order-read isolation)
2. Fix 2 (void/cancel authorization)
3. Fix 3 (discount enforcement)
4. Fix 4 (refund boundary)
5. Fix 5 (PIN hardening)
6. Fix 6 (printer authorization)

Each fix independently testable and rollback-safe.

---

## EXIT CRITERIA

- All 6 gaps resolved
- New security tests pass
- All prior mission regressions pass
- No plaintext PIN path remains in active storage
- Cross-tenant order reads blocked
- Discount limits enforced server-side
- Void/cancel authorization server-side only
- Refund state requires explicit payment service coordination
- Printer scope enforced at every boundary
