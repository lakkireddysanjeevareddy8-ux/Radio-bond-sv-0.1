import { supabase } from './supabaseClient';
import {
  EmergencyContact,
  ContactInvitation,
  EmergencySettings,
  NotificationDevice,
  ContactInvitationStatus,
} from '../types';
import { Platform } from 'react-native';

const DEFAULT_SETTINGS: EmergencySettings = {
  userId: '',
  automaticEscalationEnabled: true,
  escalationDelaySeconds: 30,
  shareLocationOnEmergency: false,
  notifyOwner: true,
  escalationStrategy: 'all',
};

class EmergencyContactServiceClass {
  // =========================================================================
  // 1. EMERGENCY CONTACTS (OWNER MANAGEMENT)
  // =========================================================================

  /**
   * Fetch all emergency contacts for the authenticated owner,
   * along with their latest invitation status and linked user info.
   */
  public async getContacts(): Promise<{ data: EmergencyContact[]; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { data: [] };
      }

      // 1. Query emergency_contacts
      const { data: contacts, error } = await supabase
        .from('emergency_contacts')
        .select('*')
        .eq('owner_user_id', user.id)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('[EmergencyContactService] getContacts error:', error.message);
        return { data: [], error: error.message };
      }

      if (!contacts || contacts.length === 0) {
        return { data: [] };
      }

      const contactIds = contacts.map((c) => c.id);

      // 2. Query invitations for these contacts
      const { data: invitations } = await supabase
        .from('contact_invitations')
        .select('*')
        .in('contact_id', contactIds);

      // 3. Query linked trusted_contact_users
      const { data: linkedUsers } = await supabase
        .from('trusted_contact_users')
        .select('*')
        .in('contact_id', contactIds);

      const invMap = new Map<string, any>();
      (invitations || []).forEach((inv) => {
        invMap.set(inv.contact_id, inv);
      });

      const linkedMap = new Map<string, any>();
      (linkedUsers || []).forEach((u) => {
        linkedMap.set(u.contact_id, u);
      });

      const mapped: EmergencyContact[] = contacts.map((c) => {
        const inv = invMap.get(c.id);
        const linked = linkedMap.get(c.id);

        let invitationStatus: ContactInvitationStatus = 'pending';
        if (linked?.status === 'active' || inv?.status === 'accepted') {
          invitationStatus = 'accepted';
        } else if (inv?.status) {
          invitationStatus = inv.status;
        }

        return {
          id: c.id,
          ownerUserId: c.owner_user_id,
          name: c.name,
          relationship: c.relationship,
          email: c.email,
          isEnabled: Boolean(c.is_enabled),
          priority: Number(c.priority || 1),
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          invitationStatus,
          inviteToken: inv?.invite_token,
          linkedUserId: linked?.contact_user_id || null,
        };
      });

      return { data: mapped };
    } catch (err: any) {
      console.warn('[EmergencyContactService] getContacts unexpected error:', err);
      return { data: [], error: err.message };
    }
  }

  /**
   * Add a new emergency contact and automatically create an invitation.
   */
  public async addContact(params: {
    name: string;
    relationship: string;
    email: string;
    priority?: number;
    sendInvitation?: boolean;
  }): Promise<{ success: boolean; contact?: EmergencyContact; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { success: false, error: 'You must be signed in to add emergency contacts.' };
      }

      const cleanName = params.name.trim();
      const cleanRel = params.relationship.trim();
      const cleanEmail = params.email.trim().toLowerCase();
      const priority = Math.max(1, Math.min(10, params.priority || 1));

      if (!cleanName) return { success: false, error: 'Please enter contact name.' };
      if (!cleanRel) return { success: false, error: 'Please specify relationship.' };
      if (!cleanEmail || !cleanEmail.includes('@')) {
        return { success: false, error: 'Please enter a valid email address.' };
      }

      // Check for duplicate email under same owner
      const { data: existing } = await supabase
        .from('emergency_contacts')
        .select('id')
        .eq('owner_user_id', user.id)
        .eq('email', cleanEmail)
        .maybeSingle();

      if (existing) {
        return { success: false, error: `A contact with email "${cleanEmail}" already exists.` };
      }

      // 1. Insert emergency_contacts
      const { data: insertedContact, error: insertErr } = await supabase
        .from('emergency_contacts')
        .insert({
          owner_user_id: user.id,
          name: cleanName,
          relationship: cleanRel,
          email: cleanEmail,
          is_enabled: true,
          priority: priority,
        })
        .select()
        .single();

      if (insertErr || !insertedContact) {
        return { success: false, error: insertErr?.message || 'Failed to create emergency contact.' };
      }

      // 2. Generate secure contact invitation
      const inviteToken = `wsg_inv_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      const { data: insertedInv, error: invErr } = await supabase
        .from('contact_invitations')
        .insert({
          owner_user_id: user.id,
          contact_id: insertedContact.id,
          invite_token: inviteToken,
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (invErr) {
        console.warn('[EmergencyContactService] Invitation creation note:', invErr.message);
      }

      const newContact: EmergencyContact = {
        id: insertedContact.id,
        ownerUserId: user.id,
        name: insertedContact.name,
        relationship: insertedContact.relationship,
        email: insertedContact.email,
        isEnabled: Boolean(insertedContact.is_enabled),
        priority: Number(insertedContact.priority),
        createdAt: insertedContact.created_at,
        updatedAt: insertedContact.updated_at,
        invitationStatus: 'pending',
        inviteToken: insertedInv?.invite_token || inviteToken,
      };

      return { success: true, contact: newContact };
    } catch (err: any) {
      console.warn('[EmergencyContactService] addContact error:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Update an existing emergency contact.
   */
  public async updateContact(
    contactId: string,
    updates: Partial<{
      name: string;
      relationship: string;
      email: string;
      priority: number;
      isEnabled: boolean;
    }>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const payload: any = { updated_at: new Date().toISOString() };
      if (updates.name !== undefined) payload.name = updates.name.trim();
      if (updates.relationship !== undefined) payload.relationship = updates.relationship.trim();
      if (updates.email !== undefined) payload.email = updates.email.trim().toLowerCase();
      if (updates.priority !== undefined) payload.priority = updates.priority;
      if (updates.isEnabled !== undefined) payload.is_enabled = updates.isEnabled;

      const { error } = await supabase
        .from('emergency_contacts')
        .update(payload)
        .eq('id', contactId);

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Toggle enabled / disabled state for contact.
   */
  public async toggleContactEnabled(contactId: string, isEnabled: boolean): Promise<boolean> {
    const res = await this.updateContact(contactId, { isEnabled });
    return res.success;
  }

  /**
   * Remove an emergency contact (cascades to invitations & trusted_contact_users).
   */
  public async removeContact(contactId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('emergency_contacts')
        .delete()
        .eq('id', contactId);

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Revoke or resend invitation.
   */
  public async resendInvitation(contactId: string): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, error: 'Not authenticated.' };

      // Expire previous pending invitations
      await supabase
        .from('contact_invitations')
        .update({ status: 'expired' })
        .eq('contact_id', contactId)
        .eq('status', 'pending');

      const newToken = `wsg_inv_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      const { data, error } = await supabase
        .from('contact_invitations')
        .insert({
          owner_user_id: user.id,
          contact_id: contactId,
          invite_token: newToken,
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, token: data.invite_token };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // =========================================================================
  // 2. INVITATIONS & CONSENT (FOR TRUSTED CONTACTS)
  // =========================================================================

  /**
   * Query pending invitations addressed to the currently logged in user's email.
   */
  public async getPendingInvitationsForUser(): Promise<{
    data: Array<{
      invitationId: string;
      contactId: string;
      ownerUserId: string;
      contactName: string;
      relationship: string;
      ownerEmail?: string;
      createdAt: string;
      expiresAt: string;
    }>;
  }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !user.email) return { data: [] };

      const userEmail = user.email.toLowerCase().trim();

      // Find contacts records matching this email
      const { data: matchingContacts } = await supabase
        .from('emergency_contacts')
        .select('id, owner_user_id, name, relationship, email')
        .eq('email', userEmail);

      if (!matchingContacts || matchingContacts.length === 0) {
        return { data: [] };
      }

      const contactIds = matchingContacts.map((c) => c.id);

      // Find pending invitations for these contacts
      const { data: pendingInvs } = await supabase
        .from('contact_invitations')
        .select('*')
        .in('contact_id', contactIds)
        .eq('status', 'pending');

      if (!pendingInvs || pendingInvs.length === 0) {
        return { data: [] };
      }

      const results = pendingInvs.map((inv) => {
        const contact = matchingContacts.find((c) => c.id === inv.contact_id);
        return {
          invitationId: inv.id,
          contactId: inv.contact_id,
          ownerUserId: inv.owner_user_id,
          contactName: contact?.name || 'Contact',
          relationship: contact?.relationship || 'Emergency Contact',
          createdAt: inv.created_at,
          expiresAt: inv.expires_at,
        };
      });

      return { data: results };
    } catch (e) {
      console.warn('[EmergencyContactService] getPendingInvitationsForUser note:', e);
      return { data: [] };
    }
  }

  /**
   * Accept an invitation explicitly. Links the trusted contact's auth.users ID
   * with the owner's emergency contact entry and marks invitation as accepted.
   */
  public async acceptInvitation(invitationId: string, contactId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, error: 'Must be logged in to accept.' };

      // 1. Mark invitation accepted
      const { error: invErr } = await supabase
        .from('contact_invitations')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
        })
        .eq('id', invitationId);

      if (invErr) {
        return { success: false, error: invErr.message };
      }

      // 2. Insert into trusted_contact_users
      const { error: linkErr } = await supabase
        .from('trusted_contact_users')
        .upsert(
          {
            contact_id: contactId,
            contact_user_id: user.id,
            status: 'active',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'contact_id,contact_user_id' }
        );

      if (linkErr) {
        console.warn('[EmergencyContactService] Link user note:', linkErr.message);
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Decline / revoke invitation.
   */
  public async declineInvitation(invitationId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('contact_invitations')
        .update({ status: 'revoked' })
        .eq('id', invitationId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // =========================================================================
  // 3. EMERGENCY SETTINGS
  // =========================================================================

  /**
   * Fetch current emergency settings for the user.
   */
  public async getEmergencySettings(): Promise<EmergencySettings> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { ...DEFAULT_SETTINGS, userId: '' };

      const { data, error } = await supabase
        .from('emergency_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error || !data) {
        return { ...DEFAULT_SETTINGS, userId: user.id };
      }

      return {
        id: data.id,
        userId: data.user_id,
        automaticEscalationEnabled: Boolean(data.automatic_escalation_enabled),
        escalationDelaySeconds: (data.escalation_delay_seconds || 30) as 10 | 30 | 60 | 120,
        shareLocationOnEmergency: Boolean(data.share_location_on_emergency),
        notifyOwner: Boolean(data.notify_owner ?? true),
        escalationStrategy: (data.escalation_strategy || 'all') as 'all' | 'priority',
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (err) {
      console.warn('[EmergencyContactService] getEmergencySettings error:', err);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Save / update emergency settings for the authenticated user.
   */
  public async saveEmergencySettings(
    settings: Partial<EmergencySettings>
  ): Promise<{ success: boolean; data?: EmergencySettings; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, error: 'Not authenticated.' };

      const payload: any = {
        user_id: user.id,
        updated_at: new Date().toISOString(),
      };

      if (settings.automaticEscalationEnabled !== undefined) {
        payload.automatic_escalation_enabled = settings.automaticEscalationEnabled;
      }
      if (settings.escalationDelaySeconds !== undefined) {
        payload.escalation_delay_seconds = settings.escalationDelaySeconds;
      }
      if (settings.shareLocationOnEmergency !== undefined) {
        payload.share_location_on_emergency = settings.shareLocationOnEmergency;
      }
      if (settings.notifyOwner !== undefined) {
        payload.notify_owner = settings.notifyOwner;
      }
      if (settings.escalationStrategy !== undefined) {
        payload.escalation_strategy = settings.escalationStrategy;
      }

      const { data, error } = await supabase
        .from('emergency_settings')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        data: {
          id: data.id,
          userId: data.user_id,
          automaticEscalationEnabled: Boolean(data.automatic_escalation_enabled),
          escalationDelaySeconds: Number(data.escalation_delay_seconds) as any,
          shareLocationOnEmergency: Boolean(data.share_location_on_emergency),
          notifyOwner: Boolean(data.notify_owner),
          escalationStrategy: data.escalation_strategy as any,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // =========================================================================
  // 4. NOTIFICATION DEVICE REGISTRATION
  // =========================================================================

  /**
   * Registers a device push token in the notification_devices table.
   */
  public async registerNotificationDevice(
    pushToken: string,
    platform: 'android' | 'ios' | 'web',
    deviceName?: string
  ): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const devName =
        deviceName ||
        (Platform.OS === 'android'
          ? 'Android Phone'
          : Platform.OS === 'ios'
          ? 'iPhone'
          : 'Web Browser Client');

      const { error } = await supabase
        .from('notification_devices')
        .upsert(
          {
            user_id: user.id,
            platform,
            push_token: pushToken,
            device_name: devName,
            is_active: true,
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,push_token' }
        );

      if (error) {
        console.warn('[EmergencyContactService] registerNotificationDevice error:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[EmergencyContactService] registerNotificationDevice exception:', err);
      return false;
    }
  }

  // =========================================================================
  // 5. EMERGENCY AUDIT & NOTIFICATION HISTORY
  // =========================================================================

  /**
   * Fetches the user's emergency event history and corresponding notification audit logs.
   */
  public async getEmergencyHistory(): Promise<Array<{
    id: string;
    deviceId: string;
    eventType: string;
    severity: string;
    status: string;
    detectedAt: string;
    acknowledgedAt?: string;
    resolvedAt?: string;
    locationShared: boolean;
    source: string;
    notifications: Array<{
      id: string;
      recipientUserId: string;
      notificationType: string;
      status: string;
      sentAt: string;
      deliveredAt?: string;
      failedAt?: string;
      failureReason?: string;
    }>;
  }>> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('emergency_events')
        .select(`
          id,
          device_id,
          event_type,
          severity,
          status,
          detected_at,
          acknowledged_at,
          resolved_at,
          location_shared,
          source,
          emergency_notifications (
            id,
            recipient_user_id,
            notification_type,
            status,
            sent_at,
            delivered_at,
            failed_at,
            failure_reason
          )
        `)
        .eq('owner_user_id', user.id)
        .order('detected_at', { ascending: false })
        .limit(25);

      if (error || !data) {
        return [];
      }

      return data.map((ev: any) => ({
        id: ev.id,
        deviceId: ev.device_id,
        eventType: ev.event_type,
        severity: ev.severity,
        status: ev.status,
        detectedAt: ev.detected_at,
        acknowledgedAt: ev.acknowledged_at,
        resolvedAt: ev.resolved_at,
        locationShared: Boolean(ev.location_shared),
        source: ev.source || 'voice_keyword',
        notifications: (ev.emergency_notifications || []).map((n: any) => ({
          id: n.id,
          recipientUserId: n.recipient_user_id,
          notificationType: n.notification_type,
          status: n.status,
          sentAt: n.sent_at,
          deliveredAt: n.delivered_at,
          failedAt: n.failed_at,
          failureReason: n.failure_reason,
        })),
      }));
    } catch (err) {
      console.warn('[EmergencyContactService] getEmergencyHistory error:', err);
      return [];
    }
  }
}

export const EmergencyContactService = new EmergencyContactServiceClass();
