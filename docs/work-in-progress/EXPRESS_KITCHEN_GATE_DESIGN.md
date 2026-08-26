---
status: DRAFT — pending co-CTO review (no implementation before approval)
mission: Express cashier / kitchen-gate operating mode
governing-constraint: >
  Express cashier / kitchen-gate must be a restaurant-level operating mode on
  top of the unified payment path, never a bypass around PaymentDispatcher,
  settlement idempotency, accounting, or audit controls.
owner: FireFlow team
last_reviewed: 2026-08-26
---

# Design — Express Cashier / Kitchen-Gate Operating Mode

## 0. Current state (runtime-proven, file:line)

| Fact | Evidence |
|---|---|
| The settle route has NO server-side kitchen precondition | `server.ts:1975` settle route checks only tenant scope and the DELIVERY/logistics guard (~2024-2027); M017 Phase A/B suites settle orders in `ACTIVE` status with zero kitchen interaction (43+34 assertions, green) |
| Today's "kitchen gate" is a procedural UI convention | Payment flow is reached via the `BILL_REQUESTED` status transition (`FloorManagementView.tsx:166`, `OrderCommandHub.tsx:182`), settable by any sessioned staff through the generic order PATCH route |
| Kitchen readiness signal that exists | Per-item `item_status` (`DONE`/`SERVED`) and order status `SERVED` (`OrderDetailModal.tsx:63`) |
| Payment path (Phase B) | Method-routed: CASH synchronous; provider methods via PaymentDispatcher pre-commit; FAILED→402; UNKNOWN→409+reconcile; settlement_key idempotency |

**Consequence:** EXPRESS mode does not remove any server-side control (there is
none today). The design therefore ALSO introduces the option of a REAL
server-side kitchen gate for STANDARD mode — opt-in, default off — so the mode
pair is a genuine operating-mode choice rather than two flavors of UI hint.

## 1. Per-restaurant configuration

New additive columns on `restaurants` (one migration, no backfill needed):

```prisma
order_flow_mode        String  @default("STANDARD") @db.VarChar(20)   // STANDARD | EXPRESS
kitchen_gate_enforced  Boolean @default(false)                        // only meaningful in STANDARD
```

- `order_flow_mode = STANDARD` (default): today's behavior exactly. Payment is
  offered when staff move the order to `BILL_REQUESTED` (UI convention).
- `kitchen_gate_enforced = true` (STANDARD only): the settle route itself
  refuses payment until kitchen readiness (see §4). Opt-in per restaurant.
- `order_flow_mode = EXPRESS`: payment is available immediately at order
  creation. `kitchen_gate_enforced` is forced-inert (see §4); kitchen runs in
  parallel and is never a payment dependency.

Mode changes are a restaurant-level operating decision: `PATCH /api/restaurant/flow-mode`,
`requireRole(MANAGER, ADMIN, SUPER_ADMIN)`, tenant-scoped, audited (§11).
Changing mode does NOT require re-authentication; unlocking PAYMENT against a
gate does (§4, §3).

## 2. Payment methods permitted in express mode

**All methods the tenant already supports — unchanged.** The mode changes WHEN
payment becomes available, never WHICH methods exist or how they are routed.
CASH settles synchronously; CARD/RAAST/digital route through PaymentDispatcher
exactly as Phase B defines. No method allow-list changes in this design (a
per-tenant allowed-methods list is an orthogonal future feature and is
explicitly out of scope).

## 3. Cashier authorization requirements

| Action | Authorization |
|---|---|
| Settling in either mode | Unchanged: `authMiddleware` + `sessionGateMiddleware` (any sessioned staff), exactly as Phase B |
| Changing `order_flow_mode` / `kitchen_gate_enforced` | `MANAGER+` (requireRole) + `ORDER_FLOW_MODE_CHANGED` audit + outbox event |
| Manager payment-override (STANDARD + enforced gate stuck) | `MANAGER+` **plus fresh credential re-verification** — the override request must carry the manager's own PIN, verified server-side via bcrypt against that manager's `hashed_pin`; a valid session alone is insufficient. Override is per-order, requires a non-empty `reason`, and is audited (§11). It unlocks ONE settle attempt for that order; it is not a session-wide flag and not persisted as entitlement. |

## 4. What the kitchen gate means operationally, per mode

- **STANDARD (enforcement OFF — default, = today):** payment offered when staff
  move the order to `BILL_REQUESTED`. Server does not check kitchen state.
  Identical to current production behavior for every existing tenant.
- **STANDARD (enforcement ON — opt-in):** the settle route checks kitchen
  readiness before opening the Phase B routing: all fired `order_items` have
  `item_status IN ('DONE','SERVED')` (or the order status is `SERVED`).
  Not ready → `409 KITCHEN_GATE_NOT_RELEASED`. A manager-override (§3)
  supplied with the settle request (`paymentOverride: { pin, reason }`)
  satisfies the gate for that attempt and is audited.
- **EXPRESS:** payment available immediately at order creation. The gate check
  is definitionally skipped — not bypassed mid-flight, because the only gate
  that exists is this mode-defined precondition. Kitchen firing/cooking/
  clearing continues in parallel with zero coupling to payment.

**Placement:** the gate check sits at the TOP of the settle route, before the
Phase B method routing. It never touches provider calls, the commit
transaction, journals, or events. With enforcement OFF (default) and in
EXPRESS mode, the added code path is a constant-time no-op.

## 5. Kitchen-release eligibility

Unchanged in both modes: firing to kitchen (`fire_batches`) follows today's
rules (order exists, items present). EXPRESS does not auto-fire and does not
block firing; STANDARD's guards are untouched. Void/cancel fire-batch guards
(M018-verified) apply identically in both modes.

## 6. FAILED / UNKNOWN provider states in express mode

**Identical to Phase B — no express-specific handling exists or is permitted:**
- FAILED → whole settle rejected `402 PAYMENT_FAILED`; order stays open;
  attempt → DEAD_LETTER; zero journals/events. Staff may retry or switch tender.
- UNKNOWN → settle refused `409 PAYMENT_UNKNOWN` + paymentId; order untouched;
  resolution ONLY via the existing tenant-scoped reconcile endpoint, then
  re-settle via the orchestrator fast-path.
- EXPRESS never force-completes, never falls back to cash automatically, never
  suppresses the reconcile loop, never marks UNKNOWN as paid.

## 7. Offline behavior

No change. Today there is no offline settlement (settle requires the server);
express mode does not introduce one. Offline the payment button may render but
settlement cannot complete; already-committed facts propagate via outbox as
today. A queued-offline-payments design is a separate future mission and is
explicitly out of scope.

## 8. Mixed-tender orders

Fully supported in both modes with zero special-casing: Phase B already
resolves per-line (CASH inline + dispatcher lines) and journals per method.
An express mixed CASH+CARD settle at creation time is byte-identical to a
standard-mode mixed settle except for when the UI offered it.

## 9. Duplicate / retry behavior

Identical to Phase B in both modes: `settlement_key` replay returns the
original verbatim with `X-Settlement-Replay`; provider attempts use
deterministic per-line idempotency keys with the PAID fast-path. Express adds
no new idempotency surface. **The known concurrent duplicate provider-attempt
race remains a hard prerequisite before any real-money provider** — this design
neither worsens nor addresses it.

## 10. Interaction with settlement (Phase B) and refund (F-02)

- **Settlement:** the mode changes only WHEN payment unlocks. The settle
  request/response contract, routing, idempotency, accounting, and events are
  bit-identical across modes.
- **Refund (F-02):** refunds operate on settled orders regardless of the mode
  the sale occurred in. Settle-time events carry `orderFlowMode` (§11) purely
  as reporting metadata; refund logic never branches on it.

## 11. Audit / outbox events

| Event | Where | Payload (sanitized facts only) |
|---|---|---|
| `ORDER_FLOW_MODE_CHANGED` | audit_logs + outbox (aggregate `restaurants`) | old mode, new mode, enforcement flag, changed-by, reason |
| `ORDER_PAYMENT_OVERRIDE` | audit_logs + outbox (aggregate `orders`) | order id, manager id, reason, gate state at override time — never credentials |
| `PAYMENT_COMPLETED` | unchanged | + additive field `orderFlowMode` (settle-time value) |
| `ORDER_COMPLETED` | unchanged | unchanged |
| void/cancel events | unchanged by this design (F-03 owns them) |

No event is suppressed in express mode. No PIN/credential material enters any
payload (invariant 8).

## 12. Tenant isolation

Mode is a per-restaurant column; every read/write is tenant-scoped through the
existing `authMiddleware` context. The mode-change and override routes are
tenant-scoped like all others. Express adds no cross-tenant surface, no shared
state, and no new socket room semantics. Cross-tenant mode probing returns the
standard 404-oracle.

## 13. Migration / default behavior for existing restaurants

One additive migration:
`ALTER TABLE restaurants ADD COLUMN order_flow_mode VARCHAR(20) NOT NULL DEFAULT 'STANDARD'; ADD COLUMN kitchen_gate_enforced BOOLEAN NOT NULL DEFAULT false;`

**Every existing tenant lands in STANDARD with enforcement OFF — i.e., exactly
today's behavior, zero functional change.** Rationale: the default must never
surprise an operating restaurant; express is an opt-in operating style for
counter-service premises. New tenants: the Vault provisioning form gains the
mode selector (default STANDARD); `kitchen_gate_enforced` defaults false and is
settable per restaurant.

## 14. New/changed surfaces summary

| Surface | Change |
|---|---|
| `prisma/schema.prisma` + migration | two additive `restaurants` columns |
| `PATCH /api/restaurant/flow-mode` | NEW — MANAGER+, tenant-scoped, audited |
| Settle route (top) | kitchen-gate precondition — active ONLY when STANDARD+enforced; constant-time no-op otherwise |
| `paymentOverride` in settle body | NEW optional field — consumed only by the enforced gate; bcrypt re-verification; audited |
| Vault provisioning form | mode selector (default STANDARD) |
| POS UI | EXPRESS: payment offered at creation; STANDARD: unchanged |

## 15. Open questions for co-CTO disposition

1. **Enforcement default:** confirm STANDARD ships with `kitchen_gate_enforced=false` (today's behavior) rather than on-by-default. On-by-default would break counter-service tenants that never use KDS.
2. **Override credential form:** manager PIN re-entry verified server-side (proposed). Alternative: full re-login. PIN re-entry is the POS-native choice.
3. **Mode-change authorization:** MANAGER+ without re-auth (proposed — it is a configuration act, not a money-movement act). Re-auth is reserved for the payment override.
4. **Readiness definition:** "all fired items DONE/SERVED, or order SERVED" (proposed) — confirm this matches the operational intent, or whether BILL_REQUESTED should factor in.
5. **Event naming:** `ORDER_FLOW_MODE_CHANGED` / `ORDER_PAYMENT_OVERRIDE` — confirm or rename.

## 16. Explicit non-goals

- No per-tenant allowed-method lists (orthogonal, future)
- No offline settlement / queued payments (future mission)
- No changes to PaymentDispatcher, SettlementGuards, journals, or outbox
  settlement events (constraint honored by construction)
- No swimlane diagram in this doc — produced AFTER design approval, per review
  instruction
