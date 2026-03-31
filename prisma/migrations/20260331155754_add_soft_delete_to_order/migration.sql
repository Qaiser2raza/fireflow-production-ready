-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "deleted_by" TEXT,
ADD COLUMN     "deleted_reason" TEXT,
ADD COLUMN     "is_deleted" BOOLEAN NOT NULL DEFAULT false;
