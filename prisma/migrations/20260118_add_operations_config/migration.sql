-- AddColumn operations config to restaurants
ALTER TABLE "restaurants" ADD COLUMN "tax_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "restaurants" ADD COLUMN "tax_rate" NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "restaurants" ADD COLUMN "service_charge_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "restaurants" ADD COLUMN "service_charge_rate" NUMERIC(5,2) NOT NULL DEFAULT 5;
ALTER TABLE "restaurants" ADD COLUMN "default_delivery_fee" NUMERIC(10,2) NOT NULL DEFAULT 250;
ALTER TABLE "restaurants" ADD COLUMN "default_guest_count" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "restaurants" ADD COLUMN "default_rider_float" NUMERIC(10,2) NOT NULL DEFAULT 5000;

-- Add category_id to menu_items if it doesn't exist
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "category_id" UUID;

-- Add customer_id to delivery_orders and takeaway_orders
ALTER TABLE "delivery_orders" ADD COLUMN IF NOT EXISTS "customer_id" UUID;
ALTER TABLE "takeaway_orders" ADD COLUMN IF NOT EXISTS "customer_id" UUID;

-- Make delivery fields nullable
ALTER TABLE "delivery_orders" ALTER COLUMN "customer_name" DROP NOT NULL;
ALTER TABLE "delivery_orders" ALTER COLUMN "delivery_address" DROP NOT NULL;

