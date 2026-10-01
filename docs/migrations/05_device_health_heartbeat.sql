-- ============================================================================
-- FEATURE: SELF-TEST HEARTBEAT & HARDWARE DIAGNOSTICS (WSG-01)
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_health (
    device_id TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    radar_status TEXT DEFAULT 'OK' CHECK (radar_status IN ('OK', 'DEGRADED', 'FAULT')),
    mic_level NUMERIC DEFAULT 0,
    speaker_status TEXT DEFAULT 'OK' CHECK (speaker_status IN ('OK', 'FAULT')),
    wifi_status TEXT DEFAULT 'CONNECTED' CHECK (wifi_status IN ('CONNECTED', 'CONNECTING', 'OFFLINE')),
    ble_status TEXT DEFAULT 'ADVERTISING' CHECK (ble_status IN ('CONNECTED', 'ADVERTISING', 'IDLE')),
    power_source TEXT DEFAULT 'MAINS' CHECK (power_source IN ('BATTERY', 'MAINS')),
    battery_pct INTEGER DEFAULT 100 CHECK (battery_pct >= 0 AND battery_pct <= 100),
    is_charging BOOLEAN DEFAULT false,
    rssi INTEGER DEFAULT -58,
    heartbeat_interval_min INTEGER DEFAULT 10,
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for instant lookup by device
CREATE INDEX IF NOT EXISTS idx_device_health_last_seen ON device_health(device_id, last_seen_at DESC);

-- Enable RLS (scoped identically to device_push_tokens)
ALTER TABLE device_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read device_health" ON device_health;
CREATE POLICY "Allow anon read device_health"
    ON device_health FOR SELECT
    TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "Allow anon insert device_health" ON device_health;
CREATE POLICY "Allow anon insert device_health"
    ON device_health FOR INSERT
    TO authenticated, anon
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update device_health" ON device_health;
CREATE POLICY "Allow anon update device_health"
    ON device_health FOR UPDATE
    TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "Allow anon delete device_health" ON device_health;
CREATE POLICY "Allow anon delete device_health"
    ON device_health FOR DELETE
    TO authenticated, anon
    USING (true);

-- Enable Supabase Realtime streaming for live health dashboard updates
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE device_health;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE device_health REPLICA IDENTITY FULL;
