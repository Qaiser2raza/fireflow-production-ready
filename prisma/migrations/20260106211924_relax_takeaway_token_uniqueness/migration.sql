/*
  Warnings:

  - A unique constraint covering the columns `[order_id,token_number]` on the table `takeaway_orders` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "takeaway_orders_token_number_key";

-- CreateIndex
CREATE UNIQUE INDEX "takeaway_orders_order_id_token_number_key" ON "takeaway_orders"("order_id", "token_number");
