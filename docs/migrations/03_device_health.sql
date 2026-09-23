-- ============================================================================
-- FEATURE 3: DEVICE HEALTH & BATTERY MONITORING
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_health (
    device_id TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    battery_pct INTEGER DEFAULT 100 CHECK (battery_pct >= 0 AND battery_pct <= 100),
    rssi INTEGER DEFAULT -60,
    power_source TEXT DEFAULT 'MAINS' CHECK (power_source IN ('BATTERY', 'MAINS')),
    is_charging BOOLEAN DEFAULT false,
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE device_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read device health"
    ON device_health FOR SELECT
    TO authenticated, anon
    USING (true);

CREATE POLICY "Allow update device health"
    ON device_health FOR ALL
    TO authenticated, anon
    USING (true);

-- Enable Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE device_health;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
