-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "from_state" TEXT,
ADD COLUMN     "performed_by_role" TEXT,
ADD COLUMN     "session_id" TEXT,
ADD COLUMN     "to_state" TEXT;

-- AlterTable
ALTER TABLE "cashier_sessions" ADD COLUMN     "terminal_id" TEXT;

-- AlterTable
ALTER TABLE "customer_ledgers" ADD COLUMN     "flag_reason" TEXT,
ADD COLUMN     "flagged_for_review" BOOLEAN NOT NULL DEFAULT false;
