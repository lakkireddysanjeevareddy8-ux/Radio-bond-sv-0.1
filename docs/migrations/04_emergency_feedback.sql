-- ============================================================================
-- FEATURE 4: FALSE-ALARM FEEDBACK LOOP
-- ============================================================================

ALTER TABLE emergencies
ADD COLUMN IF NOT EXISTS feedback_status TEXT CHECK (feedback_status IN ('CONFIRMED_REAL', 'FALSE_ALARM', 'NOT_SURE')),
ADD COLUMN IF NOT EXISTS feedback_notes TEXT,
ADD COLUMN IF NOT EXISTS feedback_submitted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_emergencies_feedback ON emergencies(device_id, feedback_status);
