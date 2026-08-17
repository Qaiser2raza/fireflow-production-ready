-- CreateEnum
CREATE TYPE "SupportSessionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "support_sessions" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "platform_user_id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "revoked_at" TIMESTAMP(6),
    "created_by" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "support_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_sessions_platform_user_id_idx" ON "support_sessions"("platform_user_id");

-- CreateIndex
CREATE INDEX "support_sessions_restaurant_id_idx" ON "support_sessions"("restaurant_id");

-- CreateIndex
CREATE INDEX "support_sessions_status_idx" ON "support_sessions"("status");

-- Add platform support fields to audit_logs
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "platform_actor_id" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "support_session_id" TEXT;
