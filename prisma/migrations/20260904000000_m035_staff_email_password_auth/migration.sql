-- M035 Phase 1/2: tenant staff email/password credentials and recovery tokens.
ALTER TABLE "staff"
  ADD COLUMN IF NOT EXISTS "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "email" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "password_hash" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "staff_email_idx" ON "staff"("email");

CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" VARCHAR(255) NOT NULL,
  "staff_id" UUID,
  "restaurant_id" UUID,
  "token" VARCHAR(255) NOT NULL,
  "expires_at" TIMESTAMP(6) NOT NULL,
  "used" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "email_verification_tokens_token_key" ON "email_verification_tokens"("token");
CREATE INDEX IF NOT EXISTS "email_verification_tokens_email_idx" ON "email_verification_tokens"("email");
CREATE INDEX IF NOT EXISTS "email_verification_tokens_staff_id_idx" ON "email_verification_tokens"("staff_id");
CREATE INDEX IF NOT EXISTS "email_verification_tokens_restaurant_id_idx" ON "email_verification_tokens"("restaurant_id");
CREATE INDEX IF NOT EXISTS "email_verification_tokens_used_expires_at_idx" ON "email_verification_tokens"("used", "expires_at");

CREATE TABLE IF NOT EXISTS "staff_password_reset_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "staff_id" UUID NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "token" VARCHAR(255) NOT NULL,
  "expires_at" TIMESTAMP(6) NOT NULL,
  "used" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_password_reset_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "staff_password_reset_tokens_token_key" ON "staff_password_reset_tokens"("token");
CREATE INDEX IF NOT EXISTS "staff_password_reset_tokens_staff_id_idx" ON "staff_password_reset_tokens"("staff_id");
CREATE INDEX IF NOT EXISTS "staff_password_reset_tokens_email_idx" ON "staff_password_reset_tokens"("email");
CREATE INDEX IF NOT EXISTS "staff_password_reset_tokens_used_expires_at_idx" ON "staff_password_reset_tokens"("used", "expires_at");
