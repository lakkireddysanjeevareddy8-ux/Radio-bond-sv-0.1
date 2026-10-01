-- ============================================================================
-- FEATURE: TEST EMERGENCY SYSTEM (WSG-01)
-- Stores is_test flag on emergencies table to distinguish test runs from real incidents
-- ============================================================================

ALTER TABLE emergencies ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;

-- Create an index to quickly filter or badge test runs
CREATE INDEX IF NOT EXISTS idx_emergencies_is_test ON emergencies(device_id, is_test, created_at DESC);
