import { create } from 'zustand';
import { Contact } from '../types';

interface ContactStoreState {
  contacts: Contact[];
  addContact: (newContact: {
    name: string;
    phone: string;
    relationship?: string;
    isPrimary?: boolean;
  }) => void;
  removeContact: (id: string) => void;
  setPrimaryContact: (id: string) => void;
  updateContact: (id: string, updates: Partial<Contact>) => void;
  getPrimaryContact: () => Contact | undefined;
}

const STORAGE_KEY = 'washroom_safeguard_contacts_v1';

const DEFAULT_CONTACTS: Contact[] = [
  { id: '1', name: 'Jane Doe', phone: '+1 555-0101', relationship: 'Family Member', isPrimary: true },
  { id: '2', name: 'John Smith', phone: '+1 555-0102', relationship: 'Caregiver', isPrimary: false },
];

const loadPersistedContacts = (): Contact[] => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    }
  } catch (e) {
    console.warn('Could not load contacts from local storage:', e);
  }
  return DEFAULT_CONTACTS;
};

const persistContacts = (contacts: Contact[]) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
    }
  } catch (e) {
    console.warn('Could not persist contacts to local storage:', e);
  }
};

export const useContactStore = create<ContactStoreState>((set, get) => ({
  contacts: loadPersistedContacts(),

  addContact: (newContact) => {
    set((state) => {
      const isFirst = state.contacts.length === 0;
      const makePrimary = isFirst || Boolean(newContact.isPrimary);

      const created: Contact = {
        id: `contact_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: newContact.name.trim(),
        phone: newContact.phone.trim(),
        relationship: newContact.relationship?.trim() || 'Emergency Contact',
        isPrimary: makePrimary,
      };

      let updatedList: Contact[];
      if (makePrimary) {
        updatedList = [
          created,
          ...state.contacts.map((c) => ({ ...c, isPrimary: false })),
        ];
      } else {
        updatedList = [...state.contacts, created];
      }

      persistContacts(updatedList);
      return { contacts: updatedList };
    });
  },

  removeContact: (id: string) => {
    set((state) => {
      const filtered = state.contacts.filter((c) => c.id !== id);
      const hadPrimary = state.contacts.some((c) => c.id === id && c.isPrimary);

      // If we deleted the primary contact and have others left, promote the first remaining
      let updated = filtered;
      if (hadPrimary && filtered.length > 0) {
        updated = filtered.map((c, idx) => ({
          ...c,
          isPrimary: idx === 0,
        }));
      }

      persistContacts(updated);
      return { contacts: updated };
    });
  },

  setPrimaryContact: (id: string) => {
    set((state) => {
      const updated = state.contacts.map((c) => ({
        ...c,
        isPrimary: c.id === id,
      }));
      persistContacts(updated);
      return { contacts: updated };
    });
  },

  updateContact: (id: string, updates: Partial<Contact>) => {
    set((state) => {
      let updated: Contact[];
      if (updates.isPrimary) {
        updated = state.contacts.map((c) =>
          c.id === id
            ? { ...c, ...updates, isPrimary: true }
            : { ...c, isPrimary: false }
        );
      } else {
        updated = state.contacts.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        );
      }
      persistContacts(updated);
      return { contacts: updated };
    });
  },

  getPrimaryContact: () => {
    const { contacts } = get();
    return contacts.find((c) => c.isPrimary) || contacts[0];
  },
}));
