-- CreateEnum for new simplified enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderStatus_new') THEN
    CREATE TYPE "OrderStatus_new" AS ENUM ('ACTIVE', 'READY', 'CLOSED', 'CANCELLED', 'VOIDED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ItemStatus_new') THEN
    CREATE TYPE "ItemStatus_new" AS ENUM ('PENDING', 'PREPARING', 'DONE', 'SERVED', 'SKIPPED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentStatus_new') THEN
    CREATE TYPE "PaymentStatus_new" AS ENUM ('UNPAID', 'PAID', 'PARTIALLY_PAID', 'REFUNDED');
  END IF;
END $$;

-- Add new columns to orders table
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_status_new" "PaymentStatus_new" DEFAULT 'UNPAID';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "predicted_complete_time" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "bottleneck_detected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "force_settled_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "force_settled_by" UUID;

-- Add new columns to order_items table
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "predicted_ready_time" TIMESTAMP(3);
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "force_ready_at" TIMESTAMP(3);
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "force_ready_by" UUID;

-- Create order_intelligence table
CREATE TABLE IF NOT EXISTS "order_intelligence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "predicted_complete_time" TIMESTAMP(3),
    " bottleneck_detected" BOOLEAN NOT NULL DEFAULT false,
    "force_settled_at" TIMESTAMP(3),
    "force_settled_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_intelligence_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on order_id
CREATE UNIQUE INDEX IF NOT EXISTS "order_intelligence_order_id_key" ON "order_intelligence"("order_id");

-- Add foreign key constraint
ALTER TABLE "order_intelligence" ADD CONSTRAINT "order_intelligence_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing data from old status to new status
-- Map old OrderStatus values to new ones
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "status_new" "OrderStatus_new";

UPDATE "orders"
SET "status_new" = CASE
    WHEN "status" IN ('DRAFT', 'CONFIRMED', 'PREPARING', 'FIRED') THEN 'ACTIVE'::"OrderStatus_new"
    WHEN "status" IN ('READY', 'SERVED', 'BILL_REQUESTED') THEN 'READY'::"OrderStatus_new"
    WHEN "status" = 'COMPLETED' THEN 'CLOSED'::"OrderStatus_new"
    WHEN "status" = 'CANCELLED' THEN 'CANCELLED'::"OrderStatus_new"
    WHEN "status" = 'VOIDED' THEN 'VOIDED'::"OrderStatus_new"
    ELSE 'ACTIVE'::"OrderStatus_new"
END;

-- Map old ItemStatus values to new ones  
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "item_status_new" "ItemStatus_new";

UPDATE "order_items"
SET "item_status_new" = CASE
    WHEN "item_status" IN ('PENDING', 'DRAFT', 'FIRED') THEN 'PENDING'::"ItemStatus_new"
    WHEN "item_status" = 'PREPARING' THEN 'PREPARING'::"ItemStatus_new"
    WHEN "item_status" IN ('READY', 'DONE') THEN 'DONE'::"ItemStatus_new"
    WHEN "item_status" = 'SERVED' THEN 'SERVED'::"ItemStatus_new"
    ELSE 'PENDING'::"ItemStatus_new"
END;

-- Set payment_status based on order status
UPDATE "orders"
SET "payment_status_new" = CASE
    WHEN "status_new" = 'CLOSED'::"OrderStatus_new" THEN 'PAID'::"PaymentStatus_new"
    ELSE 'UNPAID'::"PaymentStatus_new"
END;

-- Drop old status columns and rename new ones
ALTER TABLE "orders" DROP COLUMN IF EXISTS "status";
ALTER TABLE "orders" RENAME COLUMN "status_new" TO "status";
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"OrderStatus_new";

ALTER TABLE "orders" RENAME COLUMN "payment_status_new" TO "payment_status";
ALTER TABLE "orders" ALTER COLUMN "payment_status" SET DEFAULT 'UNPAID'::"PaymentStatus_new";

ALTER TABLE "order_items" DROP COLUMN IF EXISTS "item_status";
ALTER TABLE "order_items" RENAME COLUMN "item_status_new" TO "item_status";
ALTER TABLE "order_items" ALTER COLUMN "item_status" SET DEFAULT 'PENDING'::"ItemStatus_new";

-- Drop old enum types and rename new ones
DROP TYPE IF EXISTS "OrderStatus";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";

DROP TYPE IF EXISTS "ItemStatus";
ALTER TYPE "ItemStatus_new" RENAME TO "ItemStatus";

DROP TYPE IF EXISTS "PaymentStatus";
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";

-- Convert type column to enum (if not already)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderType') THEN
        CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'TAKEAWAY', 'DELIVERY', 'RESERVATION');
    END IF;
END $$;

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "type_new" "OrderType";

UPDATE "orders"
SET "type_new" = "type"::"OrderType";

ALTER TABLE "orders" DROP COLUMN IF EXISTS "type";
ALTER TABLE "orders" RENAME COLUMN "type_new" TO "type";
ALTER TABLE "orders" ALTER COLUMN "type" SET NOT NULL;
