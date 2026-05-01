-- ============================================================================
-- Mandi-Agent: Truck Agency Schema
-- Run this in your Supabase SQL editor (or migration tool)
-- ============================================================================

-- ── truck_agencies ──────────────────────────────────────────────────────────
-- Populated by the KisanSabha scraper (n8n + backend) every 6 hours.
-- Source: https://kisansabha.in/Directory.aspx?Category=Transporter

CREATE TABLE IF NOT EXISTS truck_agencies (
    -- Internal IDs
    agency_id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    kisansabha_id       TEXT        NOT NULL UNIQUE,   -- stable hash: KS-<md5>

    -- Directory info
    name                TEXT        NOT NULL,
    state               TEXT        NOT NULL,
    city                TEXT        NOT NULL,
    phone               TEXT        DEFAULT '',
    whatsapp            TEXT        DEFAULT '',

    -- KisanSabha category
    category_type       SMALLINT    NOT NULL,           -- 18=Booking Agent, 19=Broker, 20=Truck Owner, 21=Transporter
    category_name       TEXT        NOT NULL DEFAULT 'Transporter',

    -- Quality signals
    rating              NUMERIC(3,1) NOT NULL DEFAULT 4.0 CHECK (rating >= 0 AND rating <= 5),
    total_trips         INTEGER      NOT NULL DEFAULT 0,
    vehicle_types       TEXT[]       DEFAULT '{}',
    price_per_km        NUMERIC(8,2),

    -- Location (lat/lon from geocoder, populated asynchronously)
    lat                 NUMERIC(9,6),
    lon                 NUMERIC(9,6),

    -- Meta
    profile_url         TEXT         DEFAULT '',
    verified            BOOLEAN      NOT NULL DEFAULT false,
    source              TEXT         NOT NULL DEFAULT 'kisansabha',
    last_scraped_at     TIMESTAMPTZ  DEFAULT now(),
    created_at          TIMESTAMPTZ  DEFAULT now()
);

-- Fast lookups
CREATE INDEX IF NOT EXISTS idx_truck_agencies_state     ON truck_agencies (state);
CREATE INDEX IF NOT EXISTS idx_truck_agencies_category  ON truck_agencies (category_type);
CREATE INDEX IF NOT EXISTS idx_truck_agencies_rating    ON truck_agencies (rating DESC);

-- PostGIS index (if extension available) for geospatial queries
-- CREATE INDEX IF NOT EXISTS idx_truck_agencies_geo ON truck_agencies USING GIST (ST_MakePoint(lon, lat));

COMMENT ON TABLE truck_agencies IS
    'Transporter directory entries scraped from KisanSabha every 6 hours via n8n + backend scraper.';


-- ── scraper_logs ────────────────────────────────────────────────────────────
-- Audit trail for every scraper run (success/failure)

CREATE TABLE IF NOT EXISTS scraper_logs (
    id          BIGSERIAL    PRIMARY KEY,
    source      TEXT         NOT NULL DEFAULT 'kisansabha',
    status      TEXT         NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
    agencies_scraped INTEGER  DEFAULT 0,
    error       TEXT,
    ran_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scraper_logs_ran_at ON scraper_logs (ran_at DESC);

COMMENT ON TABLE scraper_logs IS
    'Audit log of KisanSabha scraper runs triggered by n8n.';


-- ── truck_bookings ──────────────────────────────────────────────────────────
-- Tracks every truck booking made through the cooperative deal flow

CREATE TABLE IF NOT EXISTS truck_bookings (
    booking_id          TEXT        PRIMARY KEY,          -- BKG-XXXXXXXX
    deal_id             TEXT        NOT NULL,
    agency_id           TEXT        REFERENCES truck_agencies(agency_id),
    kisansabha_id       TEXT,
    agency_name         TEXT        NOT NULL,

    -- Cargo
    crop                TEXT        NOT NULL,
    weight_tons         NUMERIC(6,2) NOT NULL,
    farmer_count        INTEGER     NOT NULL DEFAULT 1,

    -- Route
    pickup_block        TEXT        NOT NULL,
    destination_mandi   TEXT        NOT NULL,

    -- Assignment
    driver_name         TEXT        NOT NULL,
    driver_phone        TEXT        NOT NULL,
    vehicle_no          TEXT        NOT NULL,
    pickup_time         TEXT,
    eta_mandi           TEXT,
    estimated_cost      NUMERIC(10,2),

    -- Lifecycle
    status              TEXT        NOT NULL DEFAULT 'confirmed'
                                    CHECK (status IN ('confirmed', 'departed', 'delivered', 'cancelled')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_truck_bookings_deal_id   ON truck_bookings (deal_id);
CREATE INDEX IF NOT EXISTS idx_truck_bookings_agency_id ON truck_bookings (agency_id);
CREATE INDEX IF NOT EXISTS idx_truck_bookings_created   ON truck_bookings (created_at DESC);

COMMENT ON TABLE truck_bookings IS
    'Truck bookings made through the Virtual Cooperative deal flow. Linked to KisanSabha agencies.';


-- ── RPC: upsert_truck_agencies ───────────────────────────────────────────────
-- Called by the n8n workflow after a successful scrape

CREATE OR REPLACE FUNCTION upsert_truck_agencies(agencies JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    agency JSONB;
    count  INTEGER := 0;
BEGIN
    FOR agency IN SELECT * FROM jsonb_array_elements(agencies) LOOP
        INSERT INTO truck_agencies (
            kisansabha_id, name, state, city, phone, whatsapp,
            category_type, category_name, rating, profile_url, verified, source, last_scraped_at
        )
        VALUES (
            agency->>'kisansabha_id',
            agency->>'name',
            agency->>'state',
            agency->>'city',
            COALESCE(agency->>'phone', ''),
            COALESCE(agency->>'whatsapp', ''),
            (agency->>'category_type')::SMALLINT,
            COALESCE(agency->>'category_name', 'Transporter'),
            COALESCE((agency->>'rating')::NUMERIC, 4.0),
            COALESCE(agency->>'profile_url', ''),
            COALESCE((agency->>'verified')::BOOLEAN, false),
            COALESCE(agency->>'source', 'kisansabha'),
            now()
        )
        ON CONFLICT (kisansabha_id) DO UPDATE SET
            name             = EXCLUDED.name,
            state            = EXCLUDED.state,
            city             = EXCLUDED.city,
            phone            = EXCLUDED.phone,
            whatsapp         = EXCLUDED.whatsapp,
            category_type    = EXCLUDED.category_type,
            category_name    = EXCLUDED.category_name,
            rating           = EXCLUDED.rating,
            profile_url      = EXCLUDED.profile_url,
            verified         = EXCLUDED.verified,
            last_scraped_at  = now();

        count := count + 1;
    END LOOP;
    RETURN count;
END;
$$;

COMMENT ON FUNCTION upsert_truck_agencies IS
    'Batch upsert truck agencies from KisanSabha scraper. Called by n8n after each scrape.';


-- ── Row-Level Security ───────────────────────────────────────────────────────

ALTER TABLE truck_agencies   ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_bookings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_logs     ENABLE ROW LEVEL SECURITY;

-- Public read for truck agencies (farmers browse them)
CREATE POLICY "Public can read truck_agencies"
    ON truck_agencies FOR SELECT USING (true);

-- Backend service key can do all operations
CREATE POLICY "Service role full access to truck_agencies"
    ON truck_agencies FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to truck_bookings"
    ON truck_bookings FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to scraper_logs"
    ON scraper_logs FOR ALL USING (auth.role() = 'service_role');
