-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PENDING_APPROVAL';

-- AlterEnum
ALTER TYPE "OrderType" ADD VALUE 'QR';

-- DropForeignKey
ALTER TABLE "approval_logs" DROP CONSTRAINT "approval_logs_order_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_session_id_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_status_updated_by_fkey";

-- DropIndex
DROP INDEX "printers_restaurant_id_ip_address_key";

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "session_id" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "license_keys" ALTER COLUMN "license_key" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "order_items" ALTER COLUMN "status_updated_by" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "printers" ADD COLUMN     "connection_type" VARCHAR(20) NOT NULL DEFAULT 'NETWORK',
ADD COLUMN     "printer_name" VARCHAR(100);

-- AlterTable
ALTER TABLE "registered_devices" ADD COLUMN     "station_id" UUID;

-- AddForeignKey
ALTER TABLE "approval_logs" ADD CONSTRAINT "approval_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "registered_devices" ADD CONSTRAINT "registered_devices_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
