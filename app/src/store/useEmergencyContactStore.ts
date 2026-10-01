import { create } from 'zustand';
import { EmergencyContact, EmergencySettings } from '../types';
import { EmergencyContactService } from '../services/EmergencyContactService';
import { storage } from '../utils/storage';

interface EmergencyContactState {
  contacts: EmergencyContact[];
  settings: EmergencySettings;
  pendingInvitations: Array<{
    invitationId: string;
    contactId: string;
    ownerUserId: string;
    contactName: string;
    relationship: string;
    createdAt: string;
    expiresAt: string;
  }>;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadAll: () => Promise<void>;
  addContact: (params: {
    name: string;
    relationship: string;
    email: string;
    priority?: number;
  }) => Promise<{ success: boolean; error?: string }>;
  updateContact: (
    contactId: string,
    updates: Partial<{
      name: string;
      relationship: string;
      email: string;
      priority: number;
      isEnabled: boolean;
    }>
  ) => Promise<{ success: boolean; error?: string }>;
  toggleEnabled: (contactId: string, isEnabled: boolean) => Promise<boolean>;
  removeContact: (contactId: string) => Promise<{ success: boolean; error?: string }>;
  resendInvitation: (contactId: string) => Promise<{ success: boolean; token?: string; error?: string }>;
  acceptInvitation: (invitationId: string, contactId: string) => Promise<{ success: boolean; error?: string }>;
  declineInvitation: (invitationId: string) => Promise<{ success: boolean; error?: string }>;
  saveSettings: (partial: Partial<EmergencySettings>) => Promise<boolean>;
}

const DEFAULT_SETTINGS: EmergencySettings = {
  userId: '',
  automaticEscalationEnabled: true,
  escalationDelaySeconds: 30,
  shareLocationOnEmergency: false,
  notifyOwner: true,
  escalationStrategy: 'all',
};

const CONTACTS_CACHE_KEY = 'wsg_emergency_contacts_cache';
const SETTINGS_CACHE_KEY = 'wsg_emergency_settings_cache';

export const useEmergencyContactStore = create<EmergencyContactState>((set, get) => ({
  contacts: [],
  settings: DEFAULT_SETTINGS,
  pendingInvitations: [],
  isLoading: false,
  error: null,

  loadAll: async () => {
    set({ isLoading: true, error: null });
    try {
      // Load cached first
      const cachedContacts = await storage.getJSON<EmergencyContact[]>(CONTACTS_CACHE_KEY, []);
      const cachedSettings = await storage.getJSON<EmergencySettings>(SETTINGS_CACHE_KEY, DEFAULT_SETTINGS);
      if (cachedContacts && cachedContacts.length > 0) {
        set({ contacts: cachedContacts, settings: cachedSettings });
      }

      // Fetch fresh data
      const [contactsRes, settingsData, invRes] = await Promise.all([
        EmergencyContactService.getContacts(),
        EmergencyContactService.getEmergencySettings(),
        EmergencyContactService.getPendingInvitationsForUser(),
      ]);

      const freshContacts = contactsRes.data || [];
      set({
        contacts: freshContacts,
        settings: settingsData,
        pendingInvitations: invRes.data || [],
        isLoading: false,
        error: contactsRes.error || null,
      });

      await Promise.all([
        storage.setJSON(CONTACTS_CACHE_KEY, freshContacts),
        storage.setJSON(SETTINGS_CACHE_KEY, settingsData),
      ]);
    } catch (err: any) {
      console.warn('[useEmergencyContactStore] loadAll error:', err);
      set({ isLoading: false, error: err.message });
    }
  },

  addContact: async (params) => {
    set({ isLoading: true, error: null });
    const res = await EmergencyContactService.addContact(params);
    set({ isLoading: false });

    if (res.success && res.contact) {
      const updated = [...get().contacts, res.contact].sort((a, b) => a.priority - b.priority);
      set({ contacts: updated });
      await storage.setJSON(CONTACTS_CACHE_KEY, updated);
      return { success: true };
    }
    return { success: false, error: res.error };
  },

  updateContact: async (contactId, updates) => {
    const res = await EmergencyContactService.updateContact(contactId, updates);
    if (res.success) {
      const updated = get().contacts.map((c) =>
        c.id === contactId ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
      ).sort((a, b) => a.priority - b.priority);

      set({ contacts: updated });
      await storage.setJSON(CONTACTS_CACHE_KEY, updated);
      return { success: true };
    }
    return { success: false, error: res.error };
  },

  toggleEnabled: async (contactId, isEnabled) => {
    // Optimistic update
    const previous = get().contacts;
    const optimistic = previous.map((c) => (c.id === contactId ? { ...c, isEnabled } : c));
    set({ contacts: optimistic });

    const ok = await EmergencyContactService.toggleContactEnabled(contactId, isEnabled);
    if (!ok) {
      set({ contacts: previous }); // Revert
      return false;
    }
    await storage.setJSON(CONTACTS_CACHE_KEY, optimistic);
    return true;
  },

  removeContact: async (contactId) => {
    const res = await EmergencyContactService.removeContact(contactId);
    if (res.success) {
      const filtered = get().contacts.filter((c) => c.id !== contactId);
      set({ contacts: filtered });
      await storage.setJSON(CONTACTS_CACHE_KEY, filtered);
      return { success: true };
    }
    return { success: false, error: res.error };
  },

  resendInvitation: async (contactId) => {
    const res = await EmergencyContactService.resendInvitation(contactId);
    if (res.success) {
      const updated = get().contacts.map((c) =>
        c.id === contactId ? { ...c, invitationStatus: 'pending' as const, inviteToken: res.token } : c
      );
      set({ contacts: updated });
      await storage.setJSON(CONTACTS_CACHE_KEY, updated);
    }
    return res;
  },

  acceptInvitation: async (invitationId, contactId) => {
    const res = await EmergencyContactService.acceptInvitation(invitationId, contactId);
    if (res.success) {
      // Remove from pending invitations
      const filtered = get().pendingInvitations.filter((i) => i.invitationId !== invitationId);
      set({ pendingInvitations: filtered });
    }
    return res;
  },

  declineInvitation: async (invitationId) => {
    const res = await EmergencyContactService.declineInvitation(invitationId);
    if (res.success) {
      const filtered = get().pendingInvitations.filter((i) => i.invitationId !== invitationId);
      set({ pendingInvitations: filtered });
    }
    return res;
  },

  saveSettings: async (partial) => {
    const previous = get().settings;
    const next = { ...previous, ...partial };
    set({ settings: next });

    const res = await EmergencyContactService.saveEmergencySettings(partial);
    if (!res.success) {
      set({ settings: previous });
      return false;
    }
    if (res.data) {
      set({ settings: res.data });
      await storage.setJSON(SETTINGS_CACHE_KEY, res.data);
    }
    return true;
  },
}));
