-- ============================================================================
-- FEATURE 1: TRUSTED CONTACTS & CAREGIVER COLLABORATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS trusted_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contact_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    contact_email TEXT NOT NULL,
    contact_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(device_id, contact_email)
);

CREATE INDEX IF NOT EXISTS idx_trusted_contacts_device ON trusted_contacts(device_id, status);
CREATE INDEX IF NOT EXISTS idx_trusted_contacts_email ON trusted_contacts(contact_email);
CREATE INDEX IF NOT EXISTS idx_trusted_contacts_user ON trusted_contacts(contact_user_id);

-- Enable RLS
ALTER TABLE trusted_contacts ENABLE ROW LEVEL SECURITY;

-- 1. Device Owner can view, invite, update, and remove trusted contacts for their devices
CREATE POLICY "Owners can view trusted contacts"
    ON trusted_contacts FOR SELECT
    TO authenticated
    USING (owner_user_id = auth.uid());

CREATE POLICY "Owners can insert trusted contacts"
    ON trusted_contacts FOR INSERT
    TO authenticated
    WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Owners can update trusted contacts"
    ON trusted_contacts FOR UPDATE
    TO authenticated
    USING (owner_user_id = auth.uid());

CREATE POLICY "Owners can delete trusted contacts"
    ON trusted_contacts FOR DELETE
    TO authenticated
    USING (owner_user_id = auth.uid());

-- 2. Invited Contact can view invitations sent to their email or user_id
CREATE POLICY "Contacts can view their own invitations"
    ON trusted_contacts FOR SELECT
    TO authenticated
    USING (
        contact_user_id = auth.uid() OR
        contact_email = (auth.jwt() ->> 'email')
    );

-- 3. Invited Contact can accept or reject their invitation
CREATE POLICY "Contacts can update their invitation status"
    ON trusted_contacts FOR UPDATE
    TO authenticated
    USING (
        contact_user_id = auth.uid() OR
        contact_email = (auth.jwt() ->> 'email')
    )
    WITH CHECK (
        status IN ('accepted', 'rejected')
    );

-- Enable Supabase Realtime for instant invite sync
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE trusted_contacts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
