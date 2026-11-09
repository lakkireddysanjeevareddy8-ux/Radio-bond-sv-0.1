-- Migration 10: Harden Row-Level Security (RLS) Policies
-- Replaces wide-open anon policies (USING true / WITH CHECK true) with strict
-- tenant and owner isolation to prevent unauthenticated read, overwrite, and deletion.

-- ============================================================================
-- 1. DEVICES TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Allow anon read devices" ON devices;
DROP POLICY IF EXISTS "Allow anon insert devices" ON devices;
DROP POLICY IF EXISTS "Allow anon update devices" ON devices;
DROP POLICY IF EXISTS "Allow anon delete devices" ON devices;

CREATE POLICY "Authenticated users can view owned or shared devices"
  ON devices FOR SELECT TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR is_device_caregiver(id)
    OR owner_user_id IS NULL
  );

CREATE POLICY "Users can insert devices they own"
  ON devices FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Owners can update devices they own"
  ON devices FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Owners can delete devices they own"
  ON devices FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY "Service role full access on devices"
  ON devices FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. EMERGENCIES TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Allow anon read emergencies" ON emergencies;
DROP POLICY IF EXISTS "Allow anon insert emergencies" ON emergencies;
DROP POLICY IF EXISTS "Allow anon update emergencies" ON emergencies;
DROP POLICY IF EXISTS "Allow anon delete emergencies" ON emergencies;

CREATE POLICY "Authenticated users can view emergencies for their devices"
  ON emergencies FOR SELECT TO authenticated
  USING (
    is_device_caregiver(device_id)
    OR EXISTS (SELECT 1 FROM devices d WHERE d.id = emergencies.device_id AND d.owner_user_id = auth.uid())
  );

CREATE POLICY "Authenticated users and devices can insert emergencies"
  ON emergencies FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Caregivers and owners can update emergencies"
  ON emergencies FOR UPDATE TO authenticated
  USING (
    is_device_caregiver(device_id)
    OR EXISTS (SELECT 1 FROM devices d WHERE d.id = emergencies.device_id AND d.owner_user_id = auth.uid())
  );

CREATE POLICY "Owners can delete emergencies"
  ON emergencies FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM devices d WHERE d.id = emergencies.device_id AND d.owner_user_id = auth.uid())
  );

CREATE POLICY "Service role full access on emergencies"
  ON emergencies FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. TELEMETRY TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Allow anon read telemetry" ON telemetry;
DROP POLICY IF EXISTS "Allow anon insert telemetry" ON telemetry;
DROP POLICY IF EXISTS "Allow anon update telemetry" ON telemetry;
DROP POLICY IF EXISTS "Allow anon delete telemetry" ON telemetry;

CREATE POLICY "Authenticated users can view telemetry for their devices"
  ON telemetry FOR SELECT TO authenticated
  USING (
    is_device_caregiver(device_id)
    OR EXISTS (SELECT 1 FROM devices d WHERE d.id = telemetry.device_id AND d.owner_user_id = auth.uid())
  );

CREATE POLICY "Authenticated devices can insert telemetry"
  ON telemetry FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Owners can delete telemetry for their devices"
  ON telemetry FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM devices d WHERE d.id = telemetry.device_id AND d.owner_user_id = auth.uid())
  );

CREATE POLICY "Service role full access on telemetry"
  ON telemetry FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 4. DEVICE_PUSH_TOKENS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Allow anon read device_push_tokens" ON device_push_tokens;
DROP POLICY IF EXISTS "Allow anon insert device_push_tokens" ON device_push_tokens;
DROP POLICY IF EXISTS "Allow anon update device_push_tokens" ON device_push_tokens;
DROP POLICY IF EXISTS "Allow anon delete device_push_tokens" ON device_push_tokens;

CREATE POLICY "Users can manage their own device_push_tokens"
  ON device_push_tokens FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role full access on device_push_tokens"
  ON device_push_tokens FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 5. DEVICE_HEALTH TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Allow anon read device_health" ON device_health;
DROP POLICY IF EXISTS "Allow anon insert device_health" ON device_health;
DROP POLICY IF EXISTS "Allow anon update device_health" ON device_health;
DROP POLICY IF EXISTS "Allow anon delete device_health" ON device_health;

CREATE POLICY "Caregivers and owners can view device_health"
  ON device_health FOR SELECT TO authenticated
  USING (
    is_device_caregiver(device_id)
    OR EXISTS (SELECT 1 FROM devices d WHERE d.id = device_health.device_id AND d.owner_user_id = auth.uid())
  );

CREATE POLICY "Authenticated devices can insert or update device_health"
  ON device_health FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Owners can manage device_health"
  ON device_health FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM devices d WHERE d.id = device_health.device_id AND d.owner_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM devices d WHERE d.id = device_health.device_id AND d.owner_user_id = auth.uid())
  );

CREATE POLICY "Service role full access on device_health"
  ON device_health FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 6. DEVICE_QUIET_HOURS TABLE
-- ============================================================================
DROP POLICY IF EXISTS "Allow anon read device_quiet_hours" ON device_quiet_hours;
DROP POLICY IF EXISTS "Allow anon upsert device_quiet_hours" ON device_quiet_hours;

CREATE POLICY "Caregivers and owners can view quiet_hours"
  ON device_quiet_hours FOR SELECT TO authenticated
  USING (
    is_device_caregiver(device_id)
    OR EXISTS (SELECT 1 FROM devices d WHERE d.id = device_quiet_hours.device_id AND d.owner_user_id = auth.uid())
  );

CREATE POLICY "Owners can manage quiet_hours"
  ON device_quiet_hours FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM devices d WHERE d.id = device_quiet_hours.device_id AND d.owner_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM devices d WHERE d.id = device_quiet_hours.device_id AND d.owner_user_id = auth.uid())
  );

CREATE POLICY "Service role full access on device_quiet_hours"
  ON device_quiet_hours FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 7. EMERGENCY_EVENTS TABLE (TIGHTEN OWNER CHECK)
-- ============================================================================
DROP POLICY IF EXISTS "Owners have full control over their emergency_events" ON emergency_events;

CREATE POLICY "Owners have full control over their emergency_events"
  ON emergency_events FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Authenticated users can create emergency_events"
  ON emergency_events FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "Service role full access on emergency_events"
  ON emergency_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

