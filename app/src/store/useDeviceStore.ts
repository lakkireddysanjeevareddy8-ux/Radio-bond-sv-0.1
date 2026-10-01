import { create } from 'zustand';
import { Telemetry, UserDeviceRole } from '../types';
import { storage } from '../utils/storage';
import { supabase } from '../services/supabaseClient';

export interface SavedDevice {
  deviceId: string;
  name: string;
  model: string;
  room: string;
  ipAddress?: string;
  isOnline: boolean;
  lastSeen: string;
  firmwareVersion: string;
  sensor: string; // 'LD2410C'
  connectionType: 'WIFI' | 'BLE';
  telemetry?: Telemetry;
  userRole?: UserDeviceRole;
  isShared?: boolean;
}

interface DeviceStoreState {
  devices: SavedDevice[];
  activeDeviceId: string | null;

  // Actions
  initDeviceStore: () => Promise<void>;
  loadSharedDevices: () => Promise<void>;
  addOrUpdateDevice: (device: SavedDevice) => void;
  removeDevice: (deviceId: string) => void;
  setActiveDeviceId: (deviceId: string) => void;
  updateDeviceTelemetry: (deviceId: string, telemetry: Telemetry) => void;
  getActiveDevice: () => SavedDevice | undefined;
}

const STORAGE_KEY = 'washroom_safeguard_devices_v1';

const loadPersistedDevices = (): SavedDevice[] => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    }
  } catch (e) {
    console.warn('Could not load saved devices from local storage:', e);
  }
  return [];
};

const persistDevices = (devices: SavedDevice[]) => {
  storage.setJSON(STORAGE_KEY, devices);
};

export const useDeviceStore = create<DeviceStoreState>((set, get) => ({
  devices: loadPersistedDevices(),
  activeDeviceId: loadPersistedDevices()[0]?.deviceId || null,

  initDeviceStore: async () => {
    try {
      const loaded = await storage.getJSON<SavedDevice[]>(STORAGE_KEY, []);
      if (Array.isArray(loaded) && loaded.length > 0) {
        set({
          devices: loaded,
          activeDeviceId: get().activeDeviceId || loaded[0]?.deviceId || null,
        });
      }
      // Query shared devices for authenticated caregiver
      await get().loadSharedDevices();
    } catch (e) {
      console.warn('[useDeviceStore] init error:', e);
    }
  },

  loadSharedDevices: async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !user.email) return;

      const userEmail = user.email.toLowerCase().trim();

      // Find accepted invitations for this user
      const { data: contactRows, error: contactErr } = await supabase
        .from('trusted_contacts')
        .select('device_id, owner_user_id, contact_name, status')
        .or(`contact_user_id.eq.${user.id},contact_email.eq.${userEmail}`)
        .eq('status', 'accepted');

      if (contactErr || !contactRows || contactRows.length === 0) {
        return;
      }

      const deviceIds = contactRows.map((r: any) => r.device_id).filter(Boolean);
      if (deviceIds.length === 0) return;

      // Query devices table for these deviceIds
      const { data: deviceRows, error: devErr } = await supabase
        .from('devices')
        .select('*')
        .in('id', deviceIds);

      if (devErr || !deviceRows) return;

      const sharedDevices: SavedDevice[] = deviceRows.map((d: any) => ({
        deviceId: d.id,
        name: d.name || d.device_name || `WSG-${d.id.slice(0, 6)}`,
        model: 'WSG-01 Caregiver Unit',
        room: 'Shared Washroom',
        isOnline: true,
        lastSeen: d.last_seen ? new Date(d.last_seen).toLocaleTimeString() : new Date().toLocaleTimeString(),
        firmwareVersion: d.firmware_version || 'v1.0.0-esp32',
        sensor: 'LD2410C',
        connectionType: 'WIFI',
        userRole: 'SHARED_VIEWER',
        isShared: true,
      }));

      set((state) => {
        const deviceMap = new Map(state.devices.map((dev) => [dev.deviceId, dev]));
        sharedDevices.forEach((shared) => {
          const existing = deviceMap.get(shared.deviceId);
          if (existing) {
            if (existing.userRole !== 'OWNER') {
              deviceMap.set(shared.deviceId, { ...existing, ...shared });
            }
          } else {
            deviceMap.set(shared.deviceId, shared);
          }
        });

        const merged = Array.from(deviceMap.values());
        persistDevices(merged);
        return {
          devices: merged,
          activeDeviceId: state.activeDeviceId || merged[0]?.deviceId || null,
        };
      });
    } catch (e) {
      console.warn('[useDeviceStore] loadSharedDevices error:', e);
    }
  },

  addOrUpdateDevice: (newDevice) => {
    set((state) => {
      const idx = state.devices.findIndex((d) => d.deviceId === newDevice.deviceId);
      const normalizedDevice: SavedDevice = {
        ...newDevice,
        userRole: newDevice.userRole || 'OWNER',
        isShared: newDevice.isShared ?? false,
      };

      let updated: SavedDevice[];
      if (idx >= 0) {
        updated = [...state.devices];
        updated[idx] = { ...updated[idx], ...normalizedDevice };
      } else {
        updated = [...state.devices, normalizedDevice];
      }
      persistDevices(updated);
      return {
        devices: updated,
        activeDeviceId: state.activeDeviceId || normalizedDevice.deviceId,
      };
    });
  },

  removeDevice: (deviceId) => {
    set((state) => {
      const updated = state.devices.filter((d) => d.deviceId !== deviceId);
      persistDevices(updated);
      return {
        devices: updated,
        activeDeviceId: state.activeDeviceId === deviceId ? updated[0]?.deviceId || null : state.activeDeviceId,
      };
    });
  },

  setActiveDeviceId: (activeDeviceId) => {
    set({ activeDeviceId });
  },

  updateDeviceTelemetry: (deviceId, telemetry) => {
    set((state) => {
      const updated = state.devices.map((d) =>
        d.deviceId === deviceId
          ? {
              ...d,
              telemetry,
              isOnline: true,
              lastSeen: new Date().toLocaleTimeString(),
            }
          : d
      );
      return { devices: updated };
    });
  },

  getActiveDevice: () => {
    const { devices, activeDeviceId } = get();
    return devices.find((d) => d.deviceId === activeDeviceId) || devices[0];
  },
}));
