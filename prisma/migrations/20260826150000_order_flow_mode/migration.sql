-- M019: Express cashier / kitchen-gate operating mode (design:
-- docs/work-in-progress/EXPRESS_KITCHEN_GATE_DESIGN.md, APPROVED 2026-08-26).
--
-- Additive, explicitly-persisted defaults (co-CTO disposition #1):
--   order_flow_mode       'STANDARD' — every existing tenant keeps today's
--                         behavior exactly; EXPRESS is opt-in per restaurant.
--   kitchen_gate_enforced false       — the server-side kitchen gate is
--                         opt-in within STANDARD; never inferred from null.
ALTER TABLE "restaurants" ADD COLUMN "order_flow_mode" VARCHAR(20) NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "restaurants" ADD COLUMN "kitchen_gate_enforced" BOOLEAN NOT NULL DEFAULT false;
