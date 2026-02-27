-- CreateTable: rider_shifts
-- This table tracks rider shift sessions for delivery staff
-- Part of the shift-based financial architecture

CREATE TABLE IF NOT EXISTS "rider_shifts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "opened_by" UUID NOT NULL,
    "closed_by" UUID,
    "opened_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(6),
    "opening_float" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "closing_cash_received" DECIMAL(10,2),
    "expected_cash" DECIMAL(10,2),
    "cash_difference" DECIMAL(10,2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,

    CONSTRAINT "rider_shifts_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraints
ALTER TABLE "rider_shifts" 
    ADD CONSTRAINT "rider_shifts_restaurant_id_fkey" 
    FOREIGN KEY ("restaurant_id") 
    REFERENCES "restaurants"("id") 
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rider_shifts" 
    ADD CONSTRAINT "rider_shifts_rider_id_fkey" 
    FOREIGN KEY ("rider_id") 
    REFERENCES "staff"("id") 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "rider_shifts_restaurant_id_idx" ON "rider_shifts"("restaurant_id");
CREATE INDEX IF NOT EXISTS "rider_shifts_rider_id_idx" ON "rider_shifts"("rider_id");
CREATE INDEX IF NOT EXISTS "rider_shifts_status_idx" ON "rider_shifts"("status");

-- Add the rider_shift_id column to orders table if it doesn't exist
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "rider_shift_id" UUID;

-- Add foreign key for orders.rider_shift_id
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'orders_rider_shift_id_fkey'
    ) THEN
        ALTER TABLE "orders" 
            ADD CONSTRAINT "orders_rider_shift_id_fkey" 
            FOREIGN KEY ("rider_shift_id") 
            REFERENCES "rider_shifts"("id") 
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Add index on orders.rider_shift_id
CREATE INDEX IF NOT EXISTS "orders_rider_shift_id_idx" ON "orders"("rider_shift_id");
