-- Phase 2: restaurant onboarding lifecycle (additive, backward-compatible)
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "onboarding_status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
