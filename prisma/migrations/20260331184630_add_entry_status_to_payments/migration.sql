-- AlterTable
ALTER TABLE "customer_ledgers" ADD COLUMN     "entry_status" TEXT NOT NULL DEFAULT 'provisional',
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by" TEXT;

-- AlterTable
ALTER TABLE "supplier_ledgers" ADD COLUMN     "entry_status" TEXT NOT NULL DEFAULT 'provisional',
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by" TEXT;
