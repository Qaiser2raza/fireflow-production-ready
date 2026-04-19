-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "fired_at" TIMESTAMP(6),
ADD COLUMN     "skip_reason" "SkipReason",
ADD COLUMN     "status_updated_at" TIMESTAMP(6),
ADD COLUMN     "status_updated_by" TEXT;
