/*
  Warnings:

  - The `status_updated_by` column on the `order_items` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "approval_logs" ADD COLUMN     "order_id" UUID;

-- AlterTable
ALTER TABLE "order_items" DROP COLUMN "status_updated_by",
ADD COLUMN     "status_updated_by" UUID;

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "session_id" TYPE UUID USING "session_id"::UUID;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "cashier_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_status_updated_by_fkey" FOREIGN KEY ("status_updated_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_logs" ADD CONSTRAINT "approval_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
