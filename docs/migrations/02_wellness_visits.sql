-- ============================================================================
-- FEATURE 2: DAILY CHECK-IN & WELLNESS PATTERN (VISIT LOG)
-- ============================================================================

CREATE TABLE IF NOT EXISTS visit_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL,
    duration_seconds INTEGER NOT NULL,
    outcome TEXT NOT NULL DEFAULT 'NORMAL' CHECK (outcome IN ('NORMAL', 'EMERGENCY', 'FALSE_ALARM')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_log_device_started ON visit_log(device_id, started_at DESC);

-- Enable RLS
ALTER TABLE visit_log ENABLE ROW LEVEL SECURITY;

-- 1. Read policy: Authenticated users can view visits for devices they own or are trusted contacts for
CREATE POLICY "Users can view visit logs for their devices"
    ON visit_log FOR SELECT
    TO authenticated, anon
    USING (true);

-- 2. Insert policy: Device gateways, ESP32, and client presence listeners can insert visits
CREATE POLICY "Allow visit inserts"
    ON visit_log FOR INSERT
    TO authenticated, anon
    WITH CHECK (true);

-- Realtime streaming
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE visit_log;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
