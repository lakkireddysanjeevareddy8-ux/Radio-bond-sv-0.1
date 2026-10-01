-- ============================================================================
-- MIGRATION 09: WSG-01 APP-ONLY EMERGENCY & TRUSTED CONTACT SYSTEM
-- ============================================================================
-- Creates the official standardized schema for app-only emergency notification
-- and escalation, trusted contacts, contact invitations, notification devices,
-- emergency settings, and emergency notifications with strict Row Level Security.
-- ============================================================================

-- 1. EMERGENCY CONTACTS TABLE
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

-- 2. CONTACT INVITATIONS TABLE
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
CREATE INDEX IF NOT EXISTS idx_contact_invitations_owner ON contact_invitations(owner_user_id);

-- 3. TRUSTED CONTACT USERS TABLE (Linked authenticated users)
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
CREATE INDEX IF NOT EXISTS idx_trusted_contact_users_contact ON trusted_contact_users(contact_id);

-- 4. NOTIFICATION DEVICES TABLE (Push tokens per user & device)
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
CREATE INDEX IF NOT EXISTS idx_notification_devices_token ON notification_devices(push_token);

-- 5. EMERGENCY SETTINGS TABLE
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

-- 6. STANDARDIZED EMERGENCY EVENTS TABLE
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
CREATE INDEX IF NOT EXISTS idx_emergency_events_status ON emergency_events(status, created_at DESC);

-- 7. EMERGENCY NOTIFICATIONS AUDIT TABLE
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
CREATE INDEX IF NOT EXISTS idx_emergency_notif_created ON emergency_notifications(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- 1. emergency_contacts RLS
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners have full control over emergency_contacts"
    ON emergency_contacts FOR ALL
    TO authenticated
    USING (owner_user_id = auth.uid())
    WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Invitees can view contact details matching their email"
    ON emergency_contacts FOR SELECT
    TO authenticated
    USING (
        lower(email) = lower(auth.jwt() ->> 'email')
    );

-- 2. contact_invitations RLS
ALTER TABLE contact_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners have full control over contact_invitations"
    ON contact_invitations FOR ALL
    TO authenticated
    USING (owner_user_id = auth.uid())
    WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Invitees can view invitations matching their contact record"
    ON contact_invitations FOR SELECT
    TO authenticated
    USING (
        contact_id IN (
            SELECT id FROM emergency_contacts WHERE lower(email) = lower(auth.jwt() ->> 'email')
        )
    );

CREATE POLICY "Invitees can accept invitations matching their contact record"
    ON contact_invitations FOR UPDATE
    TO authenticated
    USING (
        contact_id IN (
            SELECT id FROM emergency_contacts WHERE lower(email) = lower(auth.jwt() ->> 'email')
        )
    )
    WITH CHECK (
        status IN ('accepted', 'revoked')
    );

-- 3. trusted_contact_users RLS
ALTER TABLE trusted_contact_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view trusted_contact_users for their contacts"
    ON trusted_contact_users FOR SELECT
    TO authenticated
    USING (
        contact_id IN (
            SELECT id FROM emergency_contacts WHERE owner_user_id = auth.uid()
        )
    );

CREATE POLICY "Owners can remove trusted_contact_users for their contacts"
    ON trusted_contact_users FOR DELETE
    TO authenticated
    USING (
        contact_id IN (
            SELECT id FROM emergency_contacts WHERE owner_user_id = auth.uid()
        )
    );

CREATE POLICY "Contacts can view their own trusted_contact_user association"
    ON trusted_contact_users FOR SELECT
    TO authenticated
    USING (contact_user_id = auth.uid());

CREATE POLICY "Contacts can insert their accepted trusted_contact_user association"
    ON trusted_contact_users FOR INSERT
    TO authenticated
    WITH CHECK (
        contact_user_id = auth.uid() AND
        contact_id IN (
            SELECT id FROM emergency_contacts WHERE lower(email) = lower(auth.jwt() ->> 'email')
        )
    );

-- 4. notification_devices RLS
ALTER TABLE notification_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users have full control over their own notification_devices"
    ON notification_devices FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 5. emergency_settings RLS
ALTER TABLE emergency_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users have full control over their own emergency_settings"
    ON emergency_settings FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 6. emergency_events RLS
ALTER TABLE emergency_events ENABLE ROW LEVEL SECURITY;

-- Owner can insert and view their events
CREATE POLICY "Owners have full control over their emergency_events"
    ON emergency_events FOR ALL
    TO authenticated
    USING (owner_user_id = auth.uid() OR owner_user_id IS NULL)
    WITH CHECK (owner_user_id = auth.uid() OR owner_user_id IS NULL);

-- Active trusted contacts can view emergency events of owners who trust them
CREATE POLICY "Active trusted contacts can view emergencies"
    ON emergency_events FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM trusted_contact_users tcu
            JOIN emergency_contacts ec ON ec.id = tcu.contact_id
            WHERE ec.owner_user_id = emergency_events.owner_user_id
              AND tcu.contact_user_id = auth.uid()
              AND tcu.status = 'active'
              AND ec.is_enabled = true
        )
    );

-- Active trusted contacts can acknowledge emergencies
CREATE POLICY "Active trusted contacts can acknowledge emergencies"
    ON emergency_events FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM trusted_contact_users tcu
            JOIN emergency_contacts ec ON ec.id = tcu.contact_id
            WHERE ec.owner_user_id = emergency_events.owner_user_id
              AND tcu.contact_user_id = auth.uid()
              AND tcu.status = 'active'
        )
    )
    WITH CHECK (
        status IN ('acknowledged')
    );

-- 7. emergency_notifications RLS
ALTER TABLE emergency_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view notifications for their emergency events"
    ON emergency_notifications FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM emergency_events ee
            WHERE ee.id = emergency_notifications.emergency_event_id
              AND ee.owner_user_id = auth.uid()
        )
    );

CREATE POLICY "Recipients can view notifications delivered to them"
    ON emergency_notifications FOR SELECT
    TO authenticated
    USING (recipient_user_id = auth.uid());

CREATE POLICY "Recipients can update delivery status of their notifications"
    ON emergency_notifications FOR UPDATE
    TO authenticated
    USING (recipient_user_id = auth.uid())
    WITH CHECK (status IN ('delivered', 'opened'));

-- Allow service_role full bypass for Edge Functions
-- (In Supabase, service_role automatically bypasses RLS)

-- ============================================================================
-- SUPABASE REALTIME STREAMING CONFIGURATION
-- ============================================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE emergency_contacts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE contact_invitations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE trusted_contact_users;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE emergency_settings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE emergency_events;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE emergency_notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE emergency_contacts REPLICA IDENTITY FULL;
ALTER TABLE contact_invitations REPLICA IDENTITY FULL;
ALTER TABLE trusted_contact_users REPLICA IDENTITY FULL;
ALTER TABLE emergency_settings REPLICA IDENTITY FULL;
ALTER TABLE emergency_events REPLICA IDENTITY FULL;
ALTER TABLE emergency_notifications REPLICA IDENTITY FULL;
