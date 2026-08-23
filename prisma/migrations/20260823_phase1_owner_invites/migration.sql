-- Phase 1 provisioning & identity: forced-change flags + owner invite state
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "must_change_pin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "pin_expires_at" TIMESTAMP(6);

CREATE TABLE IF NOT EXISTS "owner_invites" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "restaurant_id" UUID NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "supabase_user_id" VARCHAR(255),
  "state" VARCHAR(30) NOT NULL DEFAULT 'INVITE_PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" VARCHAR(255),
  "invited_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT now(),
  CONSTRAINT "owner_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "owner_invites_restaurant_id_email_key" ON "owner_invites"("restaurant_id", "email");
CREATE INDEX IF NOT EXISTS "owner_invites_state_idx" ON "owner_invites"("state");
CREATE INDEX IF NOT EXISTS "owner_invites_restaurant_id_idx" ON "owner_invites"("restaurant_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'owner_invites_restaurant_id_fkey'
      AND conrelid = 'owner_invites'::regclass
  ) THEN
    ALTER TABLE "owner_invites" ADD CONSTRAINT "owner_invites_restaurant_id_fkey"
      FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
