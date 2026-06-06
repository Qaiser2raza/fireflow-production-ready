-- ============================================================
-- FireFlow QR Self-Ordering Schema (Supabase Cloud)
-- Add to: supabase/saas_schema.sql
-- ============================================================

-- Stores HMAC secrets for each restaurant's table QR codes
-- Each restaurant gets one shared secret used to sign all table URLs
CREATE TABLE IF NOT EXISTS qr_table_secrets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants_cloud(restaurant_id) ON DELETE CASCADE,
    secret_hash     TEXT NOT NULL,       -- HMAC-SHA256 secret (stored securely)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    rotated_at      TIMESTAMPTZ,         -- When secret was last rotated
    UNIQUE(restaurant_id)
);

-- Incoming customer QR orders queue (cloud side)
-- Local POS server polls / subscribes to this table via Supabase Realtime
CREATE TABLE IF NOT EXISTS qr_orders_queue (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants_cloud(restaurant_id) ON DELETE CASCADE,
    table_number    INTEGER NOT NULL,
    table_label     TEXT,                       -- e.g. "Table 5", "Bar Seat 2"
    items           JSONB NOT NULL,             -- [{ menu_item_id, name, quantity, unit_price }]
    subtotal        DECIMAL(10,2) NOT NULL,
    notes           TEXT,                       -- Customer notes
    customer_name   TEXT,                       -- Optional
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at    TIMESTAMPTZ,               -- When cashier approved/rejected
    expires_at      TIMESTAMPTZ NOT NULL       -- Auto-expire unprocessed orders after 10 minutes
                        DEFAULT (now() + INTERVAL '10 minutes'),
    client_ip       TEXT,                       -- For geo/IP verification
    sig_verified    BOOLEAN NOT NULL DEFAULT false  -- Whether HMAC signature was verified
);

-- Index for fast polling by restaurant
CREATE INDEX IF NOT EXISTS idx_qr_orders_restaurant_status
    ON qr_orders_queue(restaurant_id, status, submitted_at DESC);

-- Row Level Security: only the service_role key (used by local POS server) can read/update
ALTER TABLE qr_orders_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_table_secrets ENABLE ROW LEVEL SECURITY;

-- Policy: anyone (anon) can INSERT orders (customers submitting)
CREATE POLICY "Anyone can submit QR orders" ON qr_orders_queue
    FOR INSERT TO anon WITH CHECK (true);

-- Policy: only service_role can SELECT, UPDATE (local POS reads via service key)
CREATE POLICY "Service role can manage QR orders" ON qr_orders_queue
    FOR ALL TO service_role USING (true);

CREATE POLICY "Service role can manage QR secrets" ON qr_table_secrets
    FOR ALL TO service_role USING (true);

-- Analytics cloud table (for remote owner dashboard)
CREATE TABLE IF NOT EXISTS restaurant_analytics_cloud (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants_cloud(restaurant_id) ON DELETE CASCADE,
    date            DATE NOT NULL,
    gross_revenue   DECIMAL(12,2) NOT NULL DEFAULT 0,
    net_revenue     DECIMAL(12,2) NOT NULL DEFAULT 0,
    cogs            DECIMAL(12,2) NOT NULL DEFAULT 0,
    expenses        DECIMAL(12,2) NOT NULL DEFAULT 0,
    net_profit      DECIMAL(12,2) NOT NULL DEFAULT 0,
    cash_position   DECIMAL(12,2) NOT NULL DEFAULT 0,
    order_count     INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(restaurant_id, date)
);

ALTER TABLE restaurant_analytics_cloud ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage analytics" ON restaurant_analytics_cloud
    FOR ALL TO service_role USING (true);

-- ============================================================
-- Menu Sync (Cloud PWA Menu)
-- ============================================================

CREATE TABLE IF NOT EXISTS menu_categories_cloud (
    id              UUID PRIMARY KEY,          -- Matches local POS ID
    restaurant_id   UUID NOT NULL REFERENCES restaurants_cloud(restaurant_id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_items_cloud (
    id              UUID PRIMARY KEY,          -- Matches local POS ID
    restaurant_id   UUID NOT NULL REFERENCES restaurants_cloud(restaurant_id) ON DELETE CASCADE,
    category_id     UUID REFERENCES menu_categories_cloud(id) ON DELETE SET NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    price           DECIMAL(10,2) NOT NULL,
    available       BOOLEAN NOT NULL DEFAULT true,
    image_url       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS for Menu tables
ALTER TABLE menu_categories_cloud ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items_cloud ENABLE ROW LEVEL SECURITY;

-- Anyone can read the menu (for the QR PWA)
CREATE POLICY "Anyone can read cloud menu categories" ON menu_categories_cloud FOR SELECT TO anon USING (true);
CREATE POLICY "Anyone can read cloud menu items" ON menu_items_cloud FOR SELECT TO anon USING (true);

-- Only service_role (local POS) can manage the menu
CREATE POLICY "Service role manages menu categories" ON menu_categories_cloud FOR ALL TO service_role USING (true);
CREATE POLICY "Service role manages menu items" ON menu_items_cloud FOR ALL TO service_role USING (true);

