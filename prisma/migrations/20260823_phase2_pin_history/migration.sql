-- Phase 2: one-slot PIN history so a recently used PIN cannot be reused
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "previous_hashed_pin" TEXT;
