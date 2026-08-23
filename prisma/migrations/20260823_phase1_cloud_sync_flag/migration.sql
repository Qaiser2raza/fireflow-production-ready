-- Phase 1 slice B: durable marker for restaurants_cloud mirror registration
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "cloud_synced_at" TIMESTAMP(6);
