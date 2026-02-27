-- ============================================================
-- Fireflow SaaS Cloud Schema
-- ============================================================
-- This schema runs in Supabase PostgreSQL (separate from local DB)
-- Purpose: License management, subscriptions, and payments tracking
-- 
-- IMPORTANT: This is for SaaS operations ONLY
-- Operational data (orders, staff, tables) stays in local PostgreSQL
-- ============================================================

-- ============================================================
-- 1. LICENSE KEYS TABLE
-- ============================================================
CREATE TABLE license_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- License key unique identifier (e.g., "FIREFLOW-ABC123-XYZ789")
  key VARCHAR(50) NOT NULL UNIQUE,
  
  -- Subscription plan tier associated with this key
  plan VARCHAR(20) NOT NULL CHECK (plan IN ('BASIC', 'STANDARD', 'PREMIUM')),
  
  -- License key status
  status VARCHAR(20) NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'active', 'revoked')),
  
  -- Restaurant UUID (from local DB) when activated, NULL until activation
  restaurant_id UUID REFERENCES restaurants_cloud(restaurant_id),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit trail
  created_by VARCHAR(100),
  revoked_by VARCHAR(100),
  revoked_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT check_activation_date CHECK (
    (status = 'unused' AND activated_at IS NULL) OR
    (status != 'unused' AND activated_at IS NOT NULL)
  )
);

CREATE INDEX idx_license_keys_key ON license_keys(key);
CREATE INDEX idx_license_keys_restaurant ON license_keys(restaurant_id);
CREATE INDEX idx_license_keys_status ON license_keys(status);

-- ============================================================
-- 2. CLOUD RESTAURANTS TABLE
-- ============================================================
-- Mirrors restaurant records from local DB but tracks SaaS aspects
CREATE TABLE restaurants_cloud (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference to local DB restaurant
  restaurant_id UUID NOT NULL UNIQUE,
  
  -- Restaurant information
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  city VARCHAR(100),
  slug VARCHAR(100) UNIQUE,
  
  -- Subscription details
  subscription_plan VARCHAR(20) NOT NULL DEFAULT 'BASIC' CHECK (subscription_plan IN ('BASIC', 'STANDARD', 'PREMIUM')),
  subscription_status VARCHAR(20) NOT NULL DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'expired')),
  
  -- Trial period (30 days from registration)
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  
  -- Paid subscription expiry
  subscription_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Billing
  monthly_fee DECIMAL(10, 2) NOT NULL DEFAULT 4999.00,
  currency VARCHAR(3) NOT NULL DEFAULT 'PKR',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Additional tracking
  notes TEXT,
  
  CONSTRAINT check_subscription_dates CHECK (
    subscription_status = 'trial' OR trial_ends_at IS NULL
  )
);

CREATE INDEX idx_restaurants_cloud_restaurant_id ON restaurants_cloud(restaurant_id);
CREATE INDEX idx_restaurants_cloud_slug ON restaurants_cloud(slug);
CREATE INDEX idx_restaurants_cloud_status ON restaurants_cloud(subscription_status);
CREATE INDEX idx_restaurants_cloud_plan ON restaurants_cloud(subscription_plan);

-- ============================================================
-- 3. SUBSCRIPTION PAYMENTS TABLE
-- ============================================================
-- Tracks manual payment submissions and verification
CREATE TABLE subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference to cloud restaurant
  restaurant_id UUID NOT NULL REFERENCES restaurants_cloud(restaurant_id) ON DELETE CASCADE,
  
  -- Payment details
  amount DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'BANK_TRANSFER',
  payment_proof_url VARCHAR(500),
  
  -- Payment tracking
  transaction_id VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  
  -- Admin notes
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit trail
  verified_by VARCHAR(100),
  
  CONSTRAINT check_verified_date CHECK (
    (status = 'pending' AND verified_at IS NULL) OR
    (status != 'pending' AND verified_at IS NOT NULL)
  )
);

CREATE INDEX idx_payments_restaurant ON subscription_payments(restaurant_id);
CREATE INDEX idx_payments_status ON subscription_payments(status);
CREATE INDEX idx_payments_created ON subscription_payments(created_at);

-- ============================================================
-- 4. ROW LEVEL SECURITY (RLS) - Optional but Recommended
-- ============================================================
-- Enable RLS for additional security
ALTER TABLE license_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurants_cloud ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

-- Policies: Allow anonymous users to check license keys (no auth required for onboarding)
CREATE POLICY "Allow checking license keys"
  ON license_keys
  FOR SELECT
  USING (status = 'unused');

-- Policies: Allow reading own restaurant cloud record
CREATE POLICY "Allow reading own restaurant"
  ON restaurants_cloud
  FOR SELECT
  USING (true); -- In production, add auth.uid() matching logic

-- Policies: Allow reading own payments
CREATE POLICY "Allow reading own payments"
  ON subscription_payments
  FOR SELECT
  USING (true);

-- ============================================================
-- 5. FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_restaurants_cloud_updated_at
  BEFORE UPDATE ON restaurants_cloud
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 6. SAMPLE DATA (Optional - for testing)
-- ============================================================
-- Uncomment to seed test data

-- INSERT INTO license_keys (key, plan, status, created_by)
-- VALUES
--   ('FIREFLOW-BASIC-001', 'BASIC', 'unused', 'admin'),
--   ('FIREFLOW-STANDARD-001', 'STANDARD', 'unused', 'admin'),
--   ('FIREFLOW-PREMIUM-001', 'PREMIUM', 'unused', 'admin');
