-- Migration: Add device pairing security models
-- Migration name: add_registered_devices_security

-- Enhance pairing_codes with security fields
ALTER TABLE pairing_codes
  ADD COLUMN IF NOT EXISTS hashed_code VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_used BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS used_by UUID,
  ADD COLUMN IF NOT EXISTS verified_fingerprint VARCHAR(255),
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;

-- Alter restaurant_id to NOT NULL if not already
ALTER TABLE pairing_codes ALTER COLUMN restaurant_id SET NOT NULL;

-- Drop old constraint and add new unique constraint
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'pairing_codes' AND constraint_name = 'pairing_codes_pairing_code_key') THEN
    ALTER TABLE pairing_codes DROP CONSTRAINT pairing_codes_pairing_code_key;
  END IF;
END $$;

-- Add unique constraint for (restaurant_id, pairing_code)
ALTER TABLE pairing_codes ADD CONSTRAINT pairing_codes_restaurant_pairing_code_unique UNIQUE (restaurant_id, pairing_code);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_pairing_codes_restaurant_id ON pairing_codes (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_pairing_codes_expires_at ON pairing_codes (expires_at);

-- Create registered_devices table (NEW)
CREATE TABLE IF NOT EXISTS registered_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  staff_id UUID NOT NULL,
  device_name VARCHAR(100) NOT NULL,
  device_fingerprint VARCHAR(255) NOT NULL,
  user_agent TEXT,
  platform VARCHAR(50),
  auth_token_hash VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMP(6),
  pairing_code_id UUID,
  created_at TIMESTAMP(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT now(),
  
  CONSTRAINT registered_devices_restaurant_fk FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  CONSTRAINT registered_devices_staff_fk FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  CONSTRAINT registered_devices_pairing_code_fk FOREIGN KEY (pairing_code_id) REFERENCES pairing_codes(id) ON DELETE SET NULL,
  
  UNIQUE (restaurant_id, staff_id, device_fingerprint)
);

-- Create indexes on registered_devices
CREATE INDEX IF NOT EXISTS idx_registered_devices_restaurant_id ON registered_devices (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_registered_devices_staff_id ON registered_devices (staff_id);
CREATE INDEX IF NOT EXISTS idx_registered_devices_is_active ON registered_devices (is_active);
