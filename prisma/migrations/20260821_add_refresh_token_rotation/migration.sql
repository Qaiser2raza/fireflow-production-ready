-- Create refresh_tokens table for staff authentication
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "token_family_id" VARCHAR(36) NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "staff_id" UUID NOT NULL,
  "restaurant_id" UUID NOT NULL,
  "expires_at" TIMESTAMP(6) NOT NULL,
  "revoked_at" TIMESTAMP(6),
  "replaced_by_hash" VARCHAR(64),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "refresh_tokens_token_family_id_idx" ON "refresh_tokens"("token_family_id");
CREATE INDEX IF NOT EXISTS "refresh_tokens_staff_id_idx" ON "refresh_tokens"("staff_id");
CREATE INDEX IF NOT EXISTS "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");
CREATE INDEX IF NOT EXISTS "refresh_tokens_revoked_at_idx" ON "refresh_tokens"("revoked_at");

ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Extend platform_sessions with refresh token rotation fields
ALTER TABLE "platform_sessions" ADD COLUMN IF NOT EXISTS "refresh_token_hash" VARCHAR(64);
ALTER TABLE "platform_sessions" ADD COLUMN IF NOT EXISTS "token_family_id" VARCHAR(36);
ALTER TABLE "platform_sessions" ADD COLUMN IF NOT EXISTS "replaced_by_jti" VARCHAR(36);

CREATE INDEX IF NOT EXISTS "platform_sessions_token_family_id_idx" ON "platform_sessions"("token_family_id");
