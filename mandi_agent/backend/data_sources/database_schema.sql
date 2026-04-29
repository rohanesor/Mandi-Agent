-- =============================================================================
-- Mandi-Agent Database Schema for Supabase (PostgreSQL + pgvector)
-- =============================================================================
-- This schema defines all tables required by the Mandi-Agent platform.
-- Run this script in your Supabase SQL editor or via CLI.
-- =============================================================================

-- Enable pgvector extension for RAG embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- Farmer Profiles
-- =============================================================================

CREATE TABLE IF NOT EXISTS farmers (
    farmer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    language VARCHAR(3) NOT NULL DEFAULT 'hi',  -- ISO 639 code: kn, ta, te, hi, mr
    location TEXT NOT NULL,                      -- Village/taluka
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    block_id TEXT NOT NULL,                      -- 6km radius block identifier
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    village TEXT,
    fpo_id TEXT,                                  -- Farmer Producer Organization ID
    primary_crops TEXT[] NOT NULL DEFAULT '{}',
    land_size_hectares FLOAT,
    whatsapp_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_farmer_phone ON farmers(phone);
CREATE INDEX idx_farmer_block ON farmers(block_id);
CREATE INDEX idx_farmer_fpo ON farmers(fpo_id);
CREATE INDEX idx_farmer_location ON farmers USING GIST(ll_to_earth(latitude, longitude));

-- =============================================================================
-- Harvest Intents
-- =============================================================================

CREATE TABLE IF NOT EXISTS harvest_intents (
    intent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES farmers(farmer_id) ON DELETE CASCADE,
    crop TEXT NOT NULL,
    quantity_quintals FLOAT NOT NULL CHECK (quantity_quintals > 0),
    expected_harvest_date DATE NOT NULL,
    current_growth_stage TEXT NOT NULL,  -- flowering, fruiting, mature, etc.
    block_id TEXT NOT NULL,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, advised, harvested, cancelled
    actual_harvest_date DATE,
    actual_quantity_quintals FLOAT
);

CREATE INDEX idx_harvest_farmer ON harvest_intents(farmer_id);
CREATE INDEX idx_harvest_block_crop ON harvest_intents(block_id, crop);
CREATE INDEX idx_harvest_date ON harvest_intents(expected_harvest_date);
CREATE INDEX idx_harvest_status ON harvest_intents(status);

-- =============================================================================
-- Mandi Prices (from Agmarknet/eNAM)
-- =============================================================================

CREATE TABLE IF NOT EXISTS mandi_prices (
    price_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mandi_name TEXT NOT NULL,
    state TEXT NOT NULL,
    commodity TEXT NOT NULL,
    variety TEXT NOT NULL,
    min_price FLOAT NOT NULL CHECK (min_price >= 0),
    max_price FLOAT NOT NULL CHECK (max_price >= 0),
    modal_price FLOAT NOT NULL CHECK (modal_price >= 0),
    arrival_tonnes FLOAT,
    price_date DATE NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('agmarknet', 'enam')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_mandi_price_unique 
    ON mandi_prices(mandi_name, commodity, variety, price_date, source);
CREATE INDEX idx_mandi_commodity_date ON mandi_prices(commodity, price_date);
CREATE INDEX idx_mandi_state ON mandi_prices(state);

-- =============================================================================
-- Mandi Locations (for distance calculations)
-- =============================================================================

CREATE TABLE IF NOT EXISTS mandi_locations (
    mandi_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mandi_name TEXT UNIQUE NOT NULL,
    state TEXT NOT NULL,
    district TEXT,
    latitude FLOAT NOT NULL,
    longitude FLOAT NOT NULL,
    contact_phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mandi_location ON mandi_locations USING GIST(ll_to_earth(latitude, longitude));

-- =============================================================================
-- Price Forecasts
-- =============================================================================

CREATE TABLE IF NOT EXISTS price_forecasts (
    forecast_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crop TEXT NOT NULL,
    mandi_name TEXT NOT NULL,
    state TEXT NOT NULL,
    forecast_date DATE NOT NULL,
    predicted_price FLOAT NOT NULL CHECK (predicted_price >= 0),
    confidence FLOAT NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
    price_direction TEXT NOT NULL CHECK (price_direction IN ('rising', 'falling', 'stable')),
    reasoning TEXT,
    model_used TEXT NOT NULL,
    days_ahead INT NOT NULL CHECK (days_ahead >= 1 AND days_ahead <= 30),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_forecast_crop_mandi ON price_forecasts(crop, mandi_name, forecast_date);
CREATE INDEX idx_forecast_date ON price_forecasts(forecast_date);

-- =============================================================================
-- Spoilage Risk Assessments
-- =============================================================================

CREATE TABLE IF NOT EXISTS spoilage_risks (
    risk_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES farmers(farmer_id) ON DELETE CASCADE,
    crop TEXT NOT NULL,
    harvest_date DATE NOT NULL,
    transit_hours FLOAT NOT NULL,
    ambient_temp_celsius FLOAT NOT NULL,
    shelf_life_hours FLOAT NOT NULL,
    spoilage_probability FLOAT NOT NULL CHECK (spoilage_probability >= 0.0 AND spoilage_probability <= 1.0),
    risk_level TEXT NOT NULL CHECK (risk_level IN ('safe', 'moderate', 'high', 'critical')),
    recommendation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_spoilage_farmer ON spoilage_risks(farmer_id);
CREATE INDEX idx_spoilage_date ON spoilage_risks(harvest_date);
CREATE INDEX idx_spoilage_risk_level ON spoilage_risks(risk_level);

-- =============================================================================
-- Oversupply Alerts
-- =============================================================================

CREATE TABLE IF NOT EXISTS oversupply_alerts (
    alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    block_id TEXT NOT NULL,
    crop TEXT NOT NULL,
    harvest_window_start DATE NOT NULL,
    harvest_window_end DATE NOT NULL,
    projected_supply_quintals FLOAT NOT NULL,
    historical_absorption_quintals FLOAT NOT NULL,
    oversupply_ratio FLOAT NOT NULL,
    affected_farmer_ids UUID[] NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    recommended_action TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_oversupply_block_crop ON oversupply_alerts(block_id, crop);
CREATE INDEX idx_oversupply_severity ON oversupply_alerts(severity);
CREATE INDEX idx_oversupply_resolved ON oversupply_alerts(resolved);

-- =============================================================================
-- Cooperative Bundles
-- =============================================================================

CREATE TABLE IF NOT EXISTS bundles (
    bundle_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    block_id TEXT NOT NULL,
    crop TEXT NOT NULL,
    farmer_ids UUID[] NOT NULL,
    total_quantity_quintals FLOAT NOT NULL,
    target_mandi TEXT NOT NULL,
    target_mandi_lat FLOAT NOT NULL,
    target_mandi_lng FLOAT NOT NULL,
    delivery_window_start DATE NOT NULL,
    delivery_window_end DATE NOT NULL,
    forecast_price FLOAT NOT NULL,
    transport_saving_per_quintal FLOAT NOT NULL,
    status TEXT NOT NULL DEFAULT 'negotiating' 
        CHECK (status IN ('negotiating', 'confirmed', 'dispatched', 'completed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_bundle_block ON bundles(block_id);
CREATE INDEX idx_bundle_status ON bundles(status);
CREATE INDEX idx_bundle_crop ON bundles(crop);

-- =============================================================================
-- Farmer Advisories
-- =============================================================================

CREATE TABLE IF NOT EXISTS advisories (
    advisory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES farmers(farmer_id) ON DELETE CASCADE,
    crop TEXT NOT NULL,
    language VARCHAR(3) NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('harvest_now', 'hold_3_days', 'hold_7_days', 'redirect_mandi')),
    target_mandi TEXT,
    forecast_price FLOAT NOT NULL,
    spoilage_risk_pct FLOAT NOT NULL,
    bundle_available BOOLEAN DEFAULT FALSE,
    bundle_saving FLOAT,
    full_text_english TEXT NOT NULL,
    full_text_local TEXT NOT NULL,
    confidence FLOAT NOT NULL,
    guardrail_status TEXT NOT NULL CHECK (guardrail_status IN ('approved', 'review', 'flagged')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_advisory_farmer ON advisories(farmer_id);
CREATE INDEX idx_advisory_created ON advisories(created_at);
CREATE INDEX idx_advisory_decision ON advisories(decision);

-- =============================================================================
-- Voice Sessions
-- =============================================================================

CREATE TABLE IF NOT EXISTS voice_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES farmers(farmer_id) ON DELETE CASCADE,
    input_audio_url TEXT,
    input_text_local TEXT,
    input_text_english TEXT,
    detected_language VARCHAR(3) NOT NULL,
    intent TEXT,
    response_text_english TEXT,
    response_text_local TEXT,
    response_audio_url TEXT,
    processing_ms INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_voice_farmer ON voice_sessions(farmer_id);
CREATE INDEX idx_voice_created ON voice_sessions(created_at);

-- =============================================================================
-- RAG Documents (for semantic search)
-- =============================================================================

CREATE TABLE IF NOT EXISTS rag_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    embedding VECTOR(1024),  -- Cohere embed-multilingual-v3.0 dimension
    source TEXT,
    crop TEXT,
    mandi TEXT,
    state TEXT,
    district TEXT,
    season TEXT,
    month INT CHECK (month >= 1 AND month <= 12),
    year INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON rag_documents USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
CREATE INDEX idx_rag_crop ON rag_documents(crop);
CREATE INDEX idx_rag_state ON rag_documents(state);

-- =============================================================================
-- Advisory Logs (for tracking delivery)
-- =============================================================================

CREATE TABLE IF NOT EXISTS advisory_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL,
    advisory_id UUID NOT NULL,
    language VARCHAR(3) NOT NULL,
    channel TEXT NOT NULL DEFAULT 'whatsapp',
    delivered BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_advisory_log_farmer ON advisory_logs(farmer_id);
CREATE INDEX idx_advisory_log_advisory ON advisory_logs(advisory_id);

-- =============================================================================
-- FPO Reports
-- =============================================================================

CREATE TABLE IF NOT EXISTS fpo_reports (
    report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fpo_id TEXT NOT NULL,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    advisories_sent INT NOT NULL DEFAULT 0,
    bundles_formed INT NOT NULL DEFAULT 0,
    total_savings FLOAT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fpo_report_fpo ON fpo_reports(fpo_id);
CREATE INDEX idx_fpo_report_week ON fpo_reports(week_start, week_end);

-- =============================================================================
-- Semantic Search Function for RAG
-- =============================================================================

CREATE OR REPLACE FUNCTION match_rag_documents (
    query_embedding VECTOR(1024),
    match_threshold FLOAT,
    match_count INT,
    match_crop TEXT DEFAULT NULL,
    match_state TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    source TEXT,
    crop TEXT,
    mandi TEXT,
    state TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        rag_documents.id,
        rag_documents.content,
        rag_documents.source,
        rag_documents.crop,
        rag_documents.mandi,
        rag_documents.state,
        (1 - (rag_documents.embedding <=> query_embedding)) AS similarity
    FROM rag_documents
    WHERE (match_crop IS NULL OR rag_documents.crop = match_crop)
        AND (match_state IS NULL OR rag_documents.state = match_state)
        AND (1 - (rag_documents.embedding <=> query_embedding)) > match_threshold
    ORDER BY rag_documents.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- =============================================================================
-- Updated At Trigger Function
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to farmers table
CREATE TRIGGER update_farmer_updated_at
    BEFORE UPDATE ON farmers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Row Level Security (RLS) Policies
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE farmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE harvest_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisories ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;

-- Farmers can view their own data
CREATE POLICY farmers_select_own ON farmers
    FOR SELECT
    USING (auth.uid()::text = farmer_id::text);  -- Requires auth integration

-- Allow service role to access all data (for backend)
-- Note: Backend uses SUPABASE_SERVICE_KEY which bypasses RLS

-- =============================================================================
-- Sample Data Insertion (Optional - for testing)
-- =============================================================================

-- Uncomment below to insert sample mandi locations
-- INSERT INTO mandi_locations (mandi_name, state, district, latitude, longitude, contact_phone) VALUES
--     ('Vashi Navi Mumbai', 'Maharashtra', 'Navi Mumbai', 19.0664, 73.0154, '+912227560000'),
--     ('Koyambedu Chennai', 'Tamil Nadu', 'Chennai', 13.0627, 80.2058, '+914423740000'),
--     ('Yeshwanthpur Bangalore', 'Karnataka', 'Bangalore', 13.0294, 77.5407, '+918023370000'),
--     ('Kolar Tomato Market', 'Karnataka', 'Kolar', 13.1358, 78.1292, '+918152220000');

-- =============================================================================
-- End of Schema
-- =============================================================================