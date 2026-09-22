-- ============================================================================
-- WASHROOM SAFETY MONITOR - COMPLETE DATABASE SCHEMA SETUP
-- Run this in Supabase SQL Editor to reset & create all required tables,
-- columns, indexes, RLS policies, and Realtime streaming.
-- ============================================================================

-- 1. CLEANUP PREVIOUS TABLES (Cascades to remove broken foreign keys & policies)
DROP TABLE IF EXISTS emergencies CASCADE;
DROP TABLE IF EXISTS telemetry CASCADE;
DROP TABLE IF EXISTS devices CASCADE;

-- ============================================================================
-- 2. DEVICES TABLE
-- Supports both standard UUIDs and custom string IDs (e.g., 'demo-device-uuid')
-- ============================================================================
CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'ESP32 SafeGuard',
    device_name TEXT,
    firmware_version TEXT DEFAULT 'v1.0.0-esp32',
    last_seen TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 3. TELEMETRY TABLE
-- Stores radar mmWave, movement, stillness, and safety states from ESP32
-- ============================================================================
CREATE TABLE telemetry (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
    presence BOOLEAN DEFAULT false,
    movement BOOLEAN DEFAULT false,
    stillness_seconds INTEGER DEFAULT 0,
    state TEXT DEFAULT 'IDLE',
    wifi_rssi INTEGER DEFAULT -60,
    uptime INTEGER DEFAULT 0,
    firmware_version TEXT DEFAULT 'v1.0.0-esp32',
    battery_level INTEGER,
    voice_detected BOOLEAN DEFAULT false,
    voice_keyword TEXT,
    voice_confidence NUMERIC,
    temperature NUMERIC,
    humidity NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for instant fetching of the latest device telemetry
CREATE INDEX idx_telemetry_device_created ON telemetry(device_id, created_at DESC);

-- ============================================================================
-- 4. EMERGENCIES TABLE
-- Stores safety panic alerts, prolonged stillness triggers, and manual SOS
-- ============================================================================
CREATE TABLE emergencies (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
    trigger TEXT NOT NULL DEFAULT 'MANUAL',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    keyword TEXT,
    confidence NUMERIC,
    resolved BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    event_time TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fetching active emergencies
CREATE INDEX idx_emergencies_device_created ON emergencies(device_id, created_at DESC);

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- Allows the ESP32 (using public anon key) and the React Native app full access
-- ============================================================================

-- Devices table RLS
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read devices" ON devices FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow anon insert devices" ON devices FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow anon update devices" ON devices FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Allow anon delete devices" ON devices FOR DELETE TO anon, authenticated USING (true);

-- Telemetry table RLS
ALTER TABLE telemetry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read telemetry" ON telemetry FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow anon insert telemetry" ON telemetry FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow anon update telemetry" ON telemetry FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Allow anon delete telemetry" ON telemetry FOR DELETE TO anon, authenticated USING (true);

-- Emergencies table RLS
ALTER TABLE emergencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read emergencies" ON emergencies FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow anon insert emergencies" ON emergencies FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow anon update emergencies" ON emergencies FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Allow anon delete emergencies" ON emergencies FOR DELETE TO anon, authenticated USING (true);

-- ============================================================================
-- 6. ENABLE SUPABASE REALTIME
-- Streams telemetry & emergencies live to your React Native app
-- ============================================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE devices;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE telemetry;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE emergencies;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Set replica identity to FULL so realtime updates send complete records
ALTER TABLE devices REPLICA IDENTITY FULL;
ALTER TABLE telemetry REPLICA IDENTITY FULL;
ALTER TABLE emergencies REPLICA IDENTITY FULL;

-- ============================================================================
-- 7. SEED INITIAL REGISTERED DEVICES
-- Pre-registers common device IDs so foreign key checks always succeed
-- ============================================================================
INSERT INTO devices (id, name, device_name, firmware_version, created_at)
VALUES 
    ('demo-device-uuid', 'Master Bathroom SafeGuard', 'ESP32 SafeGuard (Demo)', 'v1.0.0-esp32', now()),
    ('esp32-washroom-01', 'Guest Washroom Guard', 'ESP32 SafeGuard (Unit 1)', 'v1.0.0-esp32', now()),
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Elderly Suite SafeGuard', 'ESP32 SafeGuard (Suite)', 'v1.0.0-esp32', now())
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name, 
    last_seen = now();

-- Initial test telemetry record
INSERT INTO telemetry (device_id, presence, movement, stillness_seconds, state, wifi_rssi, uptime, firmware_version)
VALUES ('demo-device-uuid', false, false, 0, 'SAFE', -58, 60, 'v1.0.0-esp32');

-- ============================================================================
-- 8. DEVICE PUSH TOKENS TABLE
-- Stores physical device FCM / APNs / Expo push tokens tied to paired WSG-01 devices
-- ============================================================================
CREATE TABLE IF NOT EXISTS device_push_tokens (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id TEXT,
    device_id TEXT REFERENCES devices(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    push_token TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'expo',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(device_id, push_token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_device_active ON device_push_tokens(device_id, active);

ALTER TABLE device_push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read device_push_tokens" ON device_push_tokens FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow anon insert device_push_tokens" ON device_push_tokens FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow anon update device_push_tokens" ON device_push_tokens FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Allow anon delete device_push_tokens" ON device_push_tokens FOR DELETE TO anon, authenticated USING (true);
