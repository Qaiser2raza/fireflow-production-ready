-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIVE', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "movement_type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(10,4) NOT NULL,
    "unit_cost" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "reference_type" VARCHAR(50) NOT NULL,
    "reference_id" UUID,
    "po_line_id" UUID,
    "stock_count_line_id" UUID,
    "operation_key" VARCHAR(120) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "counted_by" UUID,
    "finalized_by" UUID,
    "finalized_at" TIMESTAMP(3),
    "operation_key" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stock_count_id" UUID NOT NULL,
    "inventory_item_id" UUID NOT NULL,
    "expected_quantity" DECIMAL(10,4) NOT NULL,
    "counted_quantity" DECIMAL(10,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_restaurant_id_operation_key_key" ON "stock_movements"("restaurant_id", "operation_key");
CREATE INDEX "stock_movements_restaurant_id_inventory_item_id_created_at_idx" ON "stock_movements"("restaurant_id", "inventory_item_id", "created_at");
CREATE INDEX "stock_movements_restaurant_id_reference_type_reference_id_idx" ON "stock_movements"("restaurant_id", "reference_type", "reference_id");
CREATE UNIQUE INDEX "stock_counts_operation_key_key" ON "stock_counts"("operation_key");
CREATE INDEX "stock_counts_restaurant_id_status_idx" ON "stock_counts"("restaurant_id", "status");
CREATE UNIQUE INDEX "stock_count_lines_stock_count_id_inventory_item_id_key" ON "stock_count_lines"("stock_count_id", "inventory_item_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_po_line_id_fkey" FOREIGN KEY ("po_line_id") REFERENCES "purchase_order_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_count_line_id_fkey" FOREIGN KEY ("stock_count_line_id") REFERENCES "stock_count_lines"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_stock_count_id_fkey" FOREIGN KEY ("stock_count_id") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;