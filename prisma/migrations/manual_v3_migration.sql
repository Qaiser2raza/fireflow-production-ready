-- Migration: Update to v3.0 Spec
-- Date: 2026-02-08
-- Purpose: Align schema with corrected blueprint

-- Step 1: Update OrderStatus enum
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";

CREATE TYPE "OrderStatus" AS ENUM (
  'ACTIVE',
  'READY', 
  'CLOSED',
  'CANCELLED',
  'VOIDED'
);

-- Step 2: Update ItemStatus enum  
ALTER TYPE "ItemStatus" RENAME TO "ItemStatus_old";

CREATE TYPE "ItemStatus" AS ENUM (
  'PENDING',
  'PREPARING',
  'DONE',
  'SERVED',
  'SKIPPED'
);

-- Step 3: Update PaymentStatus enum
ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";

CREATE TYPE "PaymentStatus" AS ENUM (
  'UNPAID',
  'PAID',
  'PARTIALLY_PAID',
  'REFUNDED'
);

-- Step 4: Add payment_status to orders (if not exists)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status "PaymentStatus" DEFAULT 'UNPAID';

-- Step 5: Add intelligence tracking fields to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS predicted_complete_time TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bottleneck_detected BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS force_settled_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS force_settled_by UUID;

-- Step 6: Add intelligence tracking fields to order_items  
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS predicted_ready_time TIMESTAMP;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS force_ready_at TIMESTAMP;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS force_ready_by UUID;

-- Step 7: Create order_intelligence table
CREATE TABLE IF NOT EXISTS order_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  -- Predictions
  predicted_complete_time TIMESTAMP NOT NULL,
  predicted_duration_mins INTEGER NOT NULL,
  prediction_confidence DECIMAL(5,4) DEFAULT 0.75,
  
  -- Actuals (for learning)
  actual_complete_time TIMESTAMP,
  actual_duration_mins INTEGER,
  prediction_accuracy DECIMAL(5,4),
  
  -- Anomaly detection
  is_anomaly BOOLEAN DEFAULT false,
  anomaly_type VARCHAR(50),
  anomaly_severity VARCHAR(20),
  
  -- Decision assistance
  recommendations_given JSONB[] DEFAULT ARRAY[]::JSONB[],
  recommendation_followed BOOLEAN,
  outcome_rating INTEGER CHECK (outcome_rating BETWEEN 1 AND 5),
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Step 8: Migrate existing data
-- Map old statuses to new statuses
UPDATE orders 
SET status = CASE 
  WHEN status IN ('DRAFT', 'CONFIRMED', 'PREPARING', 'FIRED') THEN 'ACTIVE'::text
  WHEN status IN ('BILL_REQUESTED', 'READY', 'SERVED') THEN 'READY'::text
  WHEN status = 'COMPLETED' THEN 'CLOSED'::text
  WHEN status = 'CANCELLED' THEN 'CANCELLED'::text
  WHEN status = 'VOIDED' THEN 'VOIDED'::text
  ELSE 'ACTIVE'::text
END
WHERE status IS NOT NULL;

UPDATE order_items
SET item_status = CASE
  WHEN item_status IN ('DRAFT', 'PENDING', 'FIRED') THEN 'PENDING'::text
  WHEN item_status = 'PREPARING' THEN 'PREPARING'::text
  WHEN item_status IN ('READY', 'DONE') THEN 'DONE'::text
  WHEN item_status = 'SERVED' THEN 'SERVED'::text
  ELSE 'PENDING'::text
END
WHERE item_status IS NOT NULL;

-- Set payment_status based on old status
UPDATE orders
SET payment_status = CASE
  WHEN status IN ('CLOSED', 'COMPLETED') THEN 'PAID'::text
  ELSE 'UNPAID'::text
END;

-- Step 9: Convert columns to use enums
ALTER TABLE orders ALTER COLUMN status TYPE "OrderStatus" USING status::"OrderStatus";
ALTER TABLE order_items ALTER COLUMN item_status TYPE "ItemStatus" USING item_status::"ItemStatus";

-- Step 10: Cleanup old enums
DROP TYPE "OrderStatus_old";
DROP TYPE "ItemStatus_old";  
DROP TYPE "PaymentStatus_old";

-- Step 11: Set defaults
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'ACTIVE'::"OrderStatus";
ALTER TABLE orders ALTER COLUMN payment_status SET DEFAULT 'UNPAID'::"PaymentStatus";
ALTER TABLE order_items ALTER COLUMN item_status SET DEFAULT 'PENDING'::"ItemStatus";

COMMIT;
