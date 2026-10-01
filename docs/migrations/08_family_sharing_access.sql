-- ============================================================================
-- FEATURE 5: GUEST & FAMILY SHARING RLS POLICIES (WSG-01)
-- Allows shared family members and caregivers with 'accepted' status
-- to read devices, telemetry, device health, and emergencies while
-- restricting configuration changes and deletion strictly to the owner.
-- ============================================================================

-- 1. Helper function to check if the current user is an accepted caregiver for a device
CREATE OR REPLACE FUNCTION is_device_caregiver(p_device_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM trusted_contacts
    WHERE device_id = p_device_id
      AND status = 'accepted'
      AND (
        contact_user_id = auth.uid() OR
        contact_email = (auth.jwt() ->> 'email')
      )
  );
$$;

-- 2. Devices Table: Caregivers can view shared devices
DROP POLICY IF EXISTS "Caregivers can view shared devices" ON devices;
CREATE POLICY "Caregivers can view shared devices"
    ON devices FOR SELECT
    TO authenticated
    USING (
      is_device_caregiver(id)
    );

-- 3. Telemetry Table: Caregivers can view telemetry for shared devices
DROP POLICY IF EXISTS "Caregivers can view shared telemetry" ON telemetry;
CREATE POLICY "Caregivers can view shared telemetry"
    ON telemetry FOR SELECT
    TO authenticated
    USING (
      is_device_caregiver(device_id)
    );

-- 4. Device Health Table: Caregivers can view health diagnostics for shared devices
DROP POLICY IF EXISTS "Caregivers can view shared device health" ON device_health;
CREATE POLICY "Caregivers can view shared device health"
    ON device_health FOR SELECT
    TO authenticated
    USING (
      is_device_caregiver(device_id)
    );

-- 5. Emergencies Table: Caregivers can view emergencies and alarms for shared devices
DROP POLICY IF EXISTS "Caregivers can view shared emergencies" ON emergencies;
CREATE POLICY "Caregivers can view shared emergencies"
    ON emergencies FOR SELECT
    TO authenticated
    USING (
      is_device_caregiver(device_id)
    );
