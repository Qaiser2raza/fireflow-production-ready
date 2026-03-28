-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('INCLUSIVE', 'EXCLUSIVE');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "tax_exempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tax_type" "TaxType" NOT NULL DEFAULT 'INCLUSIVE';

-- CreateTable
CREATE TABLE "order_type_defaults" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "order_type" "OrderType" NOT NULL,
    "tax_enabled" BOOLEAN NOT NULL DEFAULT true,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 16,
    "tax_type" "TaxType" NOT NULL DEFAULT 'INCLUSIVE',
    "svc_enabled" BOOLEAN NOT NULL DEFAULT false,
    "svc_rate" DECIMAL(5,2) NOT NULL DEFAULT 6,
    "delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_max" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_type_defaults_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_type_defaults_restaurant_id_order_type_key" ON "order_type_defaults"("restaurant_id", "order_type");

-- AddForeignKey
ALTER TABLE "order_type_defaults" ADD CONSTRAINT "order_type_defaults_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
