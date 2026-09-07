import { create } from 'zustand';
import { Telemetry } from '../types';

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
}

interface DeviceStoreState {
  devices: SavedDevice[];
  activeDeviceId: string | null;

  // Actions
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
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
    }
  } catch (e) {
    console.warn('Could not persist devices to local storage:', e);
  }
};

export const useDeviceStore = create<DeviceStoreState>((set, get) => ({
  devices: loadPersistedDevices(),
  activeDeviceId: loadPersistedDevices()[0]?.deviceId || null,

  addOrUpdateDevice: (newDevice) => {
    set((state) => {
      const idx = state.devices.findIndex((d) => d.deviceId === newDevice.deviceId);
      let updated: SavedDevice[];
      if (idx >= 0) {
        updated = [...state.devices];
        updated[idx] = { ...updated[idx], ...newDevice };
      } else {
        updated = [...state.devices, newDevice];
      }
      persistDevices(updated);
      return {
        devices: updated,
        activeDeviceId: state.activeDeviceId || newDevice.deviceId,
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
