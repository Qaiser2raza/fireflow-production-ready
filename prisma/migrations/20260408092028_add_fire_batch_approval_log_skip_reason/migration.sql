-- CreateEnum
CREATE TYPE "SkipReason" AS ENUM ('CUSTOMER_CANCELLED', 'WRONG_ITEM', 'OUT_OF_STOCK', 'COMP');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'BILL_REQUESTED';

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "fire_batch_id" UUID;

-- CreateTable
CREATE TABLE "fire_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "recalled_from_batch_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "recalled_at" TIMESTAMP(3),
    "recalled_by" UUID,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fire_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "action_type" VARCHAR(50) NOT NULL,
    "target_entity_type" VARCHAR(50) NOT NULL,
    "target_entity_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "approved_by_user_id" UUID NOT NULL,
    "approved_by_session_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fire_batches_order_id_idx" ON "fire_batches"("order_id");

-- CreateIndex
CREATE INDEX "fire_batches_created_at_idx" ON "fire_batches"("created_at");

-- CreateIndex
CREATE INDEX "approval_logs_restaurant_id_idx" ON "approval_logs"("restaurant_id");

-- CreateIndex
CREATE INDEX "approval_logs_target_entity_id_idx" ON "approval_logs"("target_entity_id");

-- CreateIndex
CREATE INDEX "approval_logs_created_at_idx" ON "approval_logs"("created_at");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_fire_batch_id_fkey" FOREIGN KEY ("fire_batch_id") REFERENCES "fire_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fire_batches" ADD CONSTRAINT "fire_batches_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fire_batches" ADD CONSTRAINT "fire_batches_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fire_batches" ADD CONSTRAINT "fire_batches_recalled_by_fkey" FOREIGN KEY ("recalled_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fire_batches" ADD CONSTRAINT "fire_batches_recalled_from_batch_id_fkey" FOREIGN KEY ("recalled_from_batch_id") REFERENCES "fire_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_logs" ADD CONSTRAINT "approval_logs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_logs" ADD CONSTRAINT "approval_logs_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_logs" ADD CONSTRAINT "approval_logs_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_logs" ADD CONSTRAINT "approval_logs_approved_by_session_id_fkey" FOREIGN KEY ("approved_by_session_id") REFERENCES "cashier_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
