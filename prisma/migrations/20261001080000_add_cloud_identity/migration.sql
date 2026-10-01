-- Migration A: Additive Cloud Identity
-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'VIEWER');

-- CreateTable users
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50),
    "email_verified_at" TIMESTAMP(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(6),
    "last_login_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable memberships
CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'VIEWER',
    "staff_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable user_sessions
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "jti" VARCHAR(36) NOT NULL,
    "refresh_token_hash" VARCHAR(64) NOT NULL,
    "token_family_id" VARCHAR(36) NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "revoked_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" VARCHAR(255),
    "ip_address" VARCHAR(45),

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "memberships_user_id_restaurant_id_key" ON "memberships"("user_id", "restaurant_id");
CREATE UNIQUE INDEX "user_sessions_jti_key" ON "user_sessions"("jti");

-- Performance & Foreign Key Indexes
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");
CREATE INDEX "memberships_restaurant_id_idx" ON "memberships"("restaurant_id");
CREATE INDEX "memberships_staff_id_idx" ON "memberships"("staff_id");

CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");
CREATE INDEX "user_sessions_token_family_id_idx" ON "user_sessions"("token_family_id");
CREATE INDEX "user_sessions_refresh_token_hash_idx" ON "user_sessions"("refresh_token_hash");

-- Foreign Keys
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_restaurant_id_fkey" 
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_staff_id_fkey" 
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" 
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Additive payment column
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "provider_reference" VARCHAR(255);
