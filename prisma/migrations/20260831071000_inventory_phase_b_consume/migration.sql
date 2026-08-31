-- M031-B Phase B: Add CONSUME to StockMovementType enum + drop costing_method + widen actor columns to VARCHAR

ALTER TYPE "StockMovementType" ADD VALUE 'CONSUME';

-- Drop costing_method (removed from schema, WAC is the only costing method)
ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "costing_method";

-- Allow application actor IDs like 'system' / 'tester' in actor columns
ALTER TABLE "stock_movements" ALTER COLUMN "created_by" TYPE VARCHAR(120);
ALTER TABLE "stock_counts"   ALTER COLUMN "counted_by"  TYPE VARCHAR(120);
ALTER TABLE "stock_counts"   ALTER COLUMN "finalized_by" TYPE VARCHAR(120);