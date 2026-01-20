-- AlterTable
ALTER TABLE "dine_in_orders" ADD COLUMN     "guest_count_history" JSONB;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "cost_price" DECIMAL(10,2),
ADD COLUMN     "is_guest_linked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "unit_cost" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "is_proforma_printed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sections" ADD COLUMN     "name_urdu" VARCHAR(50);
