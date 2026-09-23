import { create } from 'zustand';
import { TrustedContact } from '../types';
import { supabase } from '../services/supabaseClient';
import { storage } from '../utils/storage';

interface TrustedContactStoreState {
  trustedContacts: TrustedContact[];
  isLoading: boolean;
  error: string | null;

  loadContactsForDevice: (deviceId: string) => Promise<void>;
  inviteContact: (deviceId: string, email: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  removeContact: (contactId: string) => Promise<{ success: boolean; error?: string }>;
  acceptInvite: (contactId: string) => Promise<{ success: boolean; error?: string }>;
}

const STORAGE_KEY_PREFIX = 'wsg_trusted_contacts_';

export const useTrustedContactStore = create<TrustedContactStoreState>((set, get) => ({
  trustedContacts: [],
  isLoading: false,
  error: null,

  loadContactsForDevice: async (deviceId: string) => {
    if (!deviceId) return;
    set({ isLoading: true, error: null });

    try {
      // 1. Fetch from Supabase
      const { data, error } = await supabase
        .from('trusted_contacts')
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const mapped: TrustedContact[] = data.map((row: any) => ({
          id: String(row.id),
          deviceId: row.device_id,
          ownerUserId: row.owner_user_id,
          contactUserId: row.contact_user_id,
          contactEmail: row.contact_email,
          contactName: row.contact_name,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));

        set({ trustedContacts: mapped, isLoading: false });
        await storage.setJSON(STORAGE_KEY_PREFIX + deviceId, mapped);
        return;
      }

      // Fallback to local storage cache if offline or table not yet configured
      const cached = await storage.getJSON<TrustedContact[]>(STORAGE_KEY_PREFIX + deviceId, []);
      set({ trustedContacts: cached, isLoading: false });
    } catch (err: any) {
      console.warn('[TrustedContacts] Error loading contacts:', err);
      const cached = await storage.getJSON<TrustedContact[]>(STORAGE_KEY_PREFIX + deviceId, []);
      set({ trustedContacts: cached, isLoading: false, error: err.message });
    }
  },

  inviteContact: async (deviceId: string, email: string, name?: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ownerId = user?.id || '00000000-0000-0000-0000-000000000000';

      const newRecord = {
        device_id: deviceId,
        owner_user_id: ownerId,
        contact_email: cleanEmail,
        contact_name: name?.trim() || null,
        status: 'pending',
      };

      const { data, error } = await supabase
        .from('trusted_contacts')
        .insert(newRecord)
        .select()
        .single();

      if (error) {
        console.warn('[TrustedContacts] Supabase insert note:', error.message);
      }

      // Add to local state (optimistic & offline-friendly)
      const contactObj: TrustedContact = {
        id: data ? String(data.id) : `tc_${Date.now()}`,
        deviceId,
        ownerUserId: ownerId,
        contactEmail: cleanEmail,
        contactName: name?.trim() || null,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      const updated = [contactObj, ...get().trustedContacts.filter((c) => c.contactEmail !== cleanEmail)];
      set({ trustedContacts: updated });
      await storage.setJSON(STORAGE_KEY_PREFIX + deviceId, updated);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to send invite' };
    }
  },

  removeContact: async (contactId: string) => {
    try {
      const target = get().trustedContacts.find((c) => c.id === contactId);
      const deviceId = target?.deviceId;

      await supabase.from('trusted_contacts').delete().eq('id', contactId);

      const filtered = get().trustedContacts.filter((c) => c.id !== contactId);
      set({ trustedContacts: filtered });
      if (deviceId) {
        await storage.setJSON(STORAGE_KEY_PREFIX + deviceId, filtered);
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to remove contact' };
    }
  },

  acceptInvite: async (contactId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      await supabase
        .from('trusted_contacts')
        .update({
          status: 'accepted',
          contact_user_id: user?.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId);

      const updated = get().trustedContacts.map((c) =>
        c.id === contactId ? { ...c, status: 'accepted' as const, contactUserId: user?.id } : c
      );
      set({ trustedContacts: updated });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to accept invite' };
    }
  },
}));
