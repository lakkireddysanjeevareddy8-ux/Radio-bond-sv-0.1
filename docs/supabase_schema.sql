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
    is_test BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    event_time TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fetching active emergencies and filtering test runs
CREATE INDEX idx_emergencies_device_created ON emergencies(device_id, created_at DESC);
CREATE INDEX idx_emergencies_is_test ON emergencies(device_id, is_test, created_at DESC);

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

-- ============================================================================
-- 9. DEVICE HEALTH & SELF-TEST HEARTBEAT TABLE
-- Stores periodic hardware diagnostics (radar, mic, speaker, battery, connectivity)
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

CREATE INDEX IF NOT EXISTS idx_device_health_last_seen ON device_health(device_id, last_seen_at DESC);

ALTER TABLE device_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read device_health" ON device_health FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow anon insert device_health" ON device_health FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow anon update device_health" ON device_health FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Allow anon delete device_health" ON device_health FOR DELETE TO anon, authenticated USING (true);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE device_health;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE device_health REPLICA IDENTITY FULL;

-- ============================================================================
-- 10. QUIET HOURS & EMERGENCY BYPASS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS device_quiet_hours (
    device_id TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT false,
    start_time TEXT DEFAULT '22:00',
    end_time TEXT DEFAULT '07:00',
    emergency_bypass BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE device_quiet_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read device_quiet_hours" ON device_quiet_hours FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow anon upsert device_quiet_hours" ON device_quiet_hours FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- 11. GUEST & FAMILY SHARING POLICIES
-- ============================================================================
CREATE OR REPLACE FUNCTION is_device_caregiver(p_device_id TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM trusted_contacts
    WHERE device_id = p_device_id
      AND status = 'accepted'
      AND (contact_user_id = auth.uid() OR contact_email = (auth.jwt() ->> 'email'))
  );
$$;

DROP POLICY IF EXISTS "Caregivers can view shared devices" ON devices;
CREATE POLICY "Caregivers can view shared devices" ON devices FOR SELECT TO authenticated USING (is_device_caregiver(id));

DROP POLICY IF EXISTS "Caregivers can view shared telemetry" ON telemetry;
CREATE POLICY "Caregivers can view shared telemetry" ON telemetry FOR SELECT TO authenticated USING (is_device_caregiver(device_id));

DROP POLICY IF EXISTS "Caregivers can view shared device health" ON device_health;
CREATE POLICY "Caregivers can view shared device health" ON device_health FOR SELECT TO authenticated USING (is_device_caregiver(device_id));

DROP POLICY IF EXISTS "Caregivers can view shared emergencies" ON emergencies;
CREATE POLICY "Caregivers can view shared emergencies" ON emergencies FOR SELECT TO authenticated USING (is_device_caregiver(device_id));

-- ============================================================================
-- 12. APP-ONLY EMERGENCY & TRUSTED CONTACT SYSTEM TABLES (MIGRATION 09)
-- ============================================================================

-- Emergency Contacts
CREATE TABLE IF NOT EXISTS emergency_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    relationship TEXT NOT NULL,
    email TEXT NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emergency_contacts_owner ON emergency_contacts(owner_user_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_email ON emergency_contacts(email);

-- Contact Invitations
CREATE TABLE IF NOT EXISTS contact_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES emergency_contacts(id) ON DELETE CASCADE,
    invite_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_invitations_token ON contact_invitations(invite_token);
CREATE INDEX IF NOT EXISTS idx_contact_invitations_contact ON contact_invitations(contact_id, status);

-- Trusted Contact Users
CREATE TABLE IF NOT EXISTS trusted_contact_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES emergency_contacts(id) ON DELETE CASCADE,
    contact_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(contact_id, contact_user_id)
);

CREATE INDEX IF NOT EXISTS idx_trusted_contact_users_user ON trusted_contact_users(contact_user_id, status);

-- Notification Devices
CREATE TABLE IF NOT EXISTS notification_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
    push_token TEXT NOT NULL,
    device_name TEXT DEFAULT 'My Mobile Device',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, push_token)
);

CREATE INDEX IF NOT EXISTS idx_notification_devices_user ON notification_devices(user_id, is_active);

-- Emergency Settings
CREATE TABLE IF NOT EXISTS emergency_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    automatic_escalation_enabled BOOLEAN NOT NULL DEFAULT true,
    escalation_delay_seconds INTEGER NOT NULL DEFAULT 30 CHECK (escalation_delay_seconds IN (10, 30, 60, 120)),
    share_location_on_emergency BOOLEAN NOT NULL DEFAULT false,
    notify_owner BOOLEAN NOT NULL DEFAULT true,
    escalation_strategy TEXT NOT NULL DEFAULT 'all' CHECK (escalation_strategy IN ('all', 'priority')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emergency_settings_user ON emergency_settings(user_id);

-- Standardized Emergency Events
CREATE TABLE IF NOT EXISTS emergency_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL DEFAULT 'emergency',
    severity TEXT NOT NULL DEFAULT 'critical' CHECK (severity IN ('critical', 'warning', 'info')),
    status TEXT NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'active', 'acknowledged', 'escalating', 'resolved', 'cancelled', 'failed')),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    location_lat DOUBLE PRECISION,
    location_lng DOUBLE PRECISION,
    location_accuracy DOUBLE PRECISION,
    location_shared BOOLEAN NOT NULL DEFAULT false,
    source TEXT NOT NULL DEFAULT 'voice_keyword' CHECK (source IN ('voice_keyword', 'manual_device_trigger', 'fall_or_immobility', 'future_sensor_trigger', 'test', 'sensor', 'app')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emergency_events_owner ON emergency_events(owner_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emergency_events_device ON emergency_events(device_id, status, created_at DESC);

-- Emergency Notifications Audit Log
CREATE TABLE IF NOT EXISTS emergency_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    emergency_event_id UUID NOT NULL REFERENCES emergency_events(id) ON DELETE CASCADE,
    recipient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES emergency_contacts(id) ON DELETE SET NULL,
    notification_type TEXT NOT NULL DEFAULT 'push' CHECK (notification_type = 'push'),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'failed')),
    provider_message_id TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emergency_notif_event ON emergency_notifications(emergency_event_id, status);
CREATE INDEX IF NOT EXISTS idx_emergency_notif_recipient ON emergency_notifications(recipient_user_id, status);

-- Enable RLS
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE trusted_contact_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners have full control over emergency_contacts" ON emergency_contacts FOR ALL TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "Invitees can view contact details matching their email" ON emergency_contacts FOR SELECT TO authenticated USING (lower(email) = lower(auth.jwt() ->> 'email'));

CREATE POLICY "Owners have full control over contact_invitations" ON contact_invitations FOR ALL TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "Invitees can view invitations matching their contact record" ON contact_invitations FOR SELECT TO authenticated USING (contact_id IN (SELECT id FROM emergency_contacts WHERE lower(email) = lower(auth.jwt() ->> 'email')));
CREATE POLICY "Invitees can accept invitations matching their contact record" ON contact_invitations FOR UPDATE TO authenticated USING (contact_id IN (SELECT id FROM emergency_contacts WHERE lower(email) = lower(auth.jwt() ->> 'email'))) WITH CHECK (status IN ('accepted', 'revoked'));

CREATE POLICY "Owners can view trusted_contact_users for their contacts" ON trusted_contact_users FOR SELECT TO authenticated USING (contact_id IN (SELECT id FROM emergency_contacts WHERE owner_user_id = auth.uid()));
CREATE POLICY "Owners can remove trusted_contact_users for their contacts" ON trusted_contact_users FOR DELETE TO authenticated USING (contact_id IN (SELECT id FROM emergency_contacts WHERE owner_user_id = auth.uid()));
CREATE POLICY "Contacts can view their own trusted_contact_user association" ON trusted_contact_users FOR SELECT TO authenticated USING (contact_user_id = auth.uid());
CREATE POLICY "Contacts can insert their accepted trusted_contact_user association" ON trusted_contact_users FOR INSERT TO authenticated WITH CHECK (contact_user_id = auth.uid() AND contact_id IN (SELECT id FROM emergency_contacts WHERE lower(email) = lower(auth.jwt() ->> 'email')));

CREATE POLICY "Users have full control over their own notification_devices" ON notification_devices FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users have full control over their own emergency_settings" ON emergency_settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owners have full control over their emergency_events" ON emergency_events FOR ALL TO authenticated USING (owner_user_id = auth.uid() OR owner_user_id IS NULL) WITH CHECK (owner_user_id = auth.uid() OR owner_user_id IS NULL);
CREATE POLICY "Active trusted contacts can view emergencies" ON emergency_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM trusted_contact_users tcu JOIN emergency_contacts ec ON ec.id = tcu.contact_id WHERE ec.owner_user_id = emergency_events.owner_user_id AND tcu.contact_user_id = auth.uid() AND tcu.status = 'active' AND ec.is_enabled = true));
CREATE POLICY "Active trusted contacts can acknowledge emergencies" ON emergency_events FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM trusted_contact_users tcu JOIN emergency_contacts ec ON ec.id = tcu.contact_id WHERE ec.owner_user_id = emergency_events.owner_user_id AND tcu.contact_user_id = auth.uid() AND tcu.status = 'active')) WITH CHECK (status IN ('acknowledged'));

CREATE POLICY "Owners can view notifications for their emergency events" ON emergency_notifications FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM emergency_events ee WHERE ee.id = emergency_notifications.emergency_event_id AND ee.owner_user_id = auth.uid()));
CREATE POLICY "Recipients can view notifications delivered to them" ON emergency_notifications FOR SELECT TO authenticated USING (recipient_user_id = auth.uid());
CREATE POLICY "Recipients can update delivery status of their notifications" ON emergency_notifications FOR UPDATE TO authenticated USING (recipient_user_id = auth.uid()) WITH CHECK (status IN ('delivered', 'opened'));

-- Enable Supabase Realtime
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE emergency_contacts; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE contact_invitations; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE trusted_contact_users; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE emergency_settings; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE emergency_events; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE emergency_notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;


