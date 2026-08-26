-- M018 F-02: Refund flow for settled orders (design:
-- docs/work-in-progress/REFUND_FLOW_DESIGN.md, rev2 APPROVED 2026-08-26).
--
-- Additive only. New `refunds` aggregate (design §4) carries the
-- deterministic refund_key UNIQUE — the storage layer of the three-layer
-- duplicate protection (design §3, invariant R1/R3). No existing table is
-- altered except the explicit policy column below.
CREATE TABLE "refunds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "refund_key" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'PKR',
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "provider" VARCHAR(50) NOT NULL,
    "external_reference" VARCHAR(255),
    "reason_code" VARCHAR(40) NOT NULL,
    "reason_detail" VARCHAR(255),
    "session_id" UUID,
    "requested_by" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(6),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refunds_refund_key_key" ON "refunds"("refund_key");
CREATE INDEX "refunds_restaurant_id_idx" ON "refunds"("restaurant_id");
CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- M018 F-02 disposition #1: explicit configurable refund window
-- (design §12). 7 days default; 0 = same business day only; large values
-- are explicit configuration, never an implicit unlimited.
ALTER TABLE "restaurants" ADD COLUMN "refund_window_days" INTEGER NOT NULL DEFAULT 7;
