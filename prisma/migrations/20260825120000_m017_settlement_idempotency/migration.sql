-- M017 Phase A: settlement idempotency (storage-layer enforced).
-- Deterministic settlement identity derived from stable inputs of the settle
-- request (tenant-scoped order id): 'SETTLE:<restaurant_id>:<order_id>'.
-- The unique index makes a double-settle impossible at the storage layer;
-- application code treats the violation as a replay and returns the original
-- result verbatim with zero side effects.
ALTER TABLE "orders" ADD COLUMN "settlement_key" TEXT;

CREATE UNIQUE INDEX "orders_settlement_key_key" ON "orders"("settlement_key");
