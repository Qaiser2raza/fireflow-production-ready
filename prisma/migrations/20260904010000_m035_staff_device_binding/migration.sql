-- M035 Phase 2-C: dedicated trusted devices for tenant PIN fast-auth.
-- This table is intentionally separate from registered_devices (licensing pairing).
CREATE TABLE "staff_devices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "staff_id" UUID NOT NULL,
  "restaurant_id" UUID NOT NULL,
  "device_fingerprint" VARCHAR(255) NOT NULL,
  "device_name" VARCHAR(100),
  "last_used_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_devices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_devices_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_devices_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "staff_devices_staff_id_device_fingerprint_key" ON "staff_devices"("staff_id", "device_fingerprint");
CREATE INDEX "staff_devices_restaurant_id_idx" ON "staff_devices"("restaurant_id");
CREATE INDEX "staff_devices_staff_id_idx" ON "staff_devices"("staff_id");
