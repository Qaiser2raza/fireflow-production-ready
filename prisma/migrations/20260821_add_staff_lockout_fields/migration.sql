-- Add lockout fields to staff table
ALTER TABLE "staff" ADD COLUMN "locked_until" TIMESTAMP(6);
ALTER TABLE "staff" ADD COLUMN "failed_login_count" INTEGER NOT NULL DEFAULT 0;
