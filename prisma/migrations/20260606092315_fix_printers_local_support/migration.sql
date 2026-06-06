-- Fix printers table for LOCAL printer support
-- 1. Make ip_address nullable
ALTER TABLE printers ALTER COLUMN ip_address DROP NOT NULL;

-- 2. Drop old unique constraint on (restaurant_id, ip_address)
ALTER TABLE printers DROP CONSTRAINT IF EXISTS "printers_restaurant_id_ip_address_key";

-- 3. Add unique constraint on (restaurant_id, name) instead
ALTER TABLE printers ADD CONSTRAINT "printers_restaurant_id_name_key" UNIQUE (restaurant_id, name);
