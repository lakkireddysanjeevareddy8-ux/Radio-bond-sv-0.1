-- ============================================================================
-- FEATURE: QUIET HOURS WITH EMERGENCY BYPASS (WSG-01)
-- Allows users to silence routine maintenance and non-emergency notifications
-- during sleep while guaranteeing life-safety alarms always bypass.
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_quiet_hours (
    device_id TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT false,
    start_time TEXT DEFAULT '22:00',
    end_time TEXT DEFAULT '07:00',
    emergency_bypass BOOLEAN DEFAULT true, -- strictly true by design
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE device_quiet_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read device_quiet_hours" ON device_quiet_hours;
CREATE POLICY "Allow anon read device_quiet_hours"
    ON device_quiet_hours FOR SELECT
    TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "Allow anon upsert device_quiet_hours" ON device_quiet_hours;
CREATE POLICY "Allow anon upsert device_quiet_hours"
    ON device_quiet_hours FOR ALL
    TO authenticated, anon
    USING (true)
    WITH CHECK (true);
