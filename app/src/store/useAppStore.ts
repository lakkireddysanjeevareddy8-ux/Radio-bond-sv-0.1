import { create } from 'zustand';
import { DeviceConfig, Telemetry, EmergencyEvent, SafetyState } from '../types';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { storage } from '../utils/storage';

export type HardwareMode = 'REAL_HARDWARE' | 'DEMO_SIMULATOR';

interface AppState {
  // Runtime Mode
  hardwareMode: HardwareMode;
  setHardwareMode: (mode: HardwareMode) => void;
  hasCompletedSafetyOnboarding: boolean;
  setHasCompletedSafetyOnboarding: (completed: boolean) => void;
  isStorageLoaded: boolean;
  initAppStore: () => Promise<boolean>;
  hasPrimedPermissions: {
    bluetooth: boolean;
    notifications: boolean;
    location: boolean;
  };
  setPermissionPrimed: (type: 'bluetooth' | 'notifications' | 'location') => void;

  // Device
  deviceConfig: DeviceConfig | null;
  setDeviceConfig: (config: DeviceConfig) => void;
  
  // Telemetry
  telemetry: Telemetry | null;
  setTelemetry: (telemetry: Telemetry | null) => void;
  
  // Connection
  isOnline: boolean;
  setIsOnline: (isOnline: boolean) => void;
  bluetoothStatus: 'CONNECTED' | 'DISCONNECTED';
  setBluetoothStatus: (status: 'CONNECTED' | 'DISCONNECTED') => void;
  wifiStatus: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'FAILED';
  setWifiStatus: (status: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'FAILED') => void;
  cloudStatus: 'CONNECTED' | 'DISCONNECTED';
  setCloudStatus: (status: 'CONNECTED' | 'DISCONNECTED') => void;
  fakeWifiConnected: boolean;
  setFakeWifiConnected: (fake: boolean) => void;

  // Events
  activeEmergency: EmergencyEvent | null;
  setActiveEmergency: (event: EmergencyEvent | null) => void;
  
  // Voice feedback
  voicePrompt: string | null;
  setVoicePrompt: (prompt: string | null) => void;

  // Mode (Legacy compatibility, kept in sync with hardwareMode)
  isSimulatorMode: boolean;
  setIsSimulatorMode: (isSimulator: boolean) => void;

  // Auth
  user: User | null;
  session: Session | null;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  initializeSupabase: () => void;
  signOut: () => Promise<void>;
}

const defaultConfig: DeviceConfig = {
  deviceId: 'WSG-000001',
  deviceName: 'Washroom Safety Guardian',
  stillnessThreshold: 25,
  responseTimeout: 15,
  voiceDetectionEnabled: true,
  speakerEnabled: true,
  emergencyKeywords: ['HELP', 'EMERGENCY', 'SAVE ME'],
  voiceSensitivity: 'Medium',
  emergencyEscalation: 'VOICE_AND_ALERT'
};

const CONFIG_STORAGE_KEY = 'washroom_safeguard_config_v1';
const ONBOARDING_STORAGE_KEY = 'washroom_safety_onboarding_v1';
const HARDWARE_MODE_STORAGE_KEY = 'washroom_hardware_mode_v1';
const PRIMED_PERMISSIONS_STORAGE_KEY = 'wsg_primed_permissions';

// Synchronous initial fallbacks (for web / immediate rendering before async hydrate)
const loadPersistedConfigSync = (): DeviceConfig => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
      if (raw) {
        return { ...defaultConfig, ...JSON.parse(raw) };
      }
    }
  } catch (e) {}
  return defaultConfig;
};

const loadPersistedOnboardingSync = (): boolean => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true';
    }
  } catch (e) {}
  return false;
};

const loadPersistedPrimedPermissionsSync = (): { bluetooth: boolean; notifications: boolean; location: boolean } => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(PRIMED_PERMISSIONS_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    }
  } catch {}
  return { bluetooth: false, notifications: false, location: false };
};

const loadPersistedHardwareModeSync = (): HardwareMode => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const mode = window.localStorage.getItem(HARDWARE_MODE_STORAGE_KEY);
      if (mode === 'DEMO_SIMULATOR' || mode === 'REAL_HARDWARE') {
        return mode;
      }
    }
  } catch (e) {}
  return 'REAL_HARDWARE';
};

const initialHardwareMode = loadPersistedHardwareModeSync();

export const useAppStore = create<AppState>((set, get) => ({
  // Runtime Mode
  hardwareMode: initialHardwareMode,
  setHardwareMode: (mode) => {
    storage.setItem(HARDWARE_MODE_STORAGE_KEY, mode);
    const isSim = mode === 'DEMO_SIMULATOR';
    set({
      hardwareMode: mode,
      isSimulatorMode: isSim,
      fakeWifiConnected: false,
      telemetry: isSim ? get().telemetry : null,
      isOnline: isSim ? true : false,
    });
  },

  isStorageLoaded: false,
  initAppStore: async () => {
    try {
      const [onboardingVal, configVal, modeVal, primedVal] = await Promise.all([
        storage.getItem(ONBOARDING_STORAGE_KEY),
        storage.getJSON<DeviceConfig | null>(CONFIG_STORAGE_KEY, null),
        storage.getItem(HARDWARE_MODE_STORAGE_KEY),
        storage.getJSON<{ bluetooth: boolean; notifications: boolean; location: boolean } | null>(PRIMED_PERMISSIONS_STORAGE_KEY, null),
      ]);

      const isCompleted = onboardingVal === 'true';
      const updates: Partial<AppState> = {
        isStorageLoaded: true,
        hasCompletedSafetyOnboarding: isCompleted,
      };

      if (configVal) {
        updates.deviceConfig = { ...defaultConfig, ...configVal };
      }
      if (modeVal === 'DEMO_SIMULATOR' || modeVal === 'REAL_HARDWARE') {
        updates.hardwareMode = modeVal as HardwareMode;
        updates.isSimulatorMode = modeVal === 'DEMO_SIMULATOR';
      }
      if (primedVal) {
        updates.hasPrimedPermissions = primedVal;
      }

      set(updates);
      return isCompleted;
    } catch (e) {
      console.warn('[useAppStore] initAppStore error:', e);
      set({ isStorageLoaded: true });
      return get().hasCompletedSafetyOnboarding;
    }
  },

  hasCompletedSafetyOnboarding: loadPersistedOnboardingSync(),
  setHasCompletedSafetyOnboarding: (completed) => {
    storage.setItem(ONBOARDING_STORAGE_KEY, completed ? 'true' : 'false');
    set({ hasCompletedSafetyOnboarding: completed });
  },

  hasPrimedPermissions: loadPersistedPrimedPermissionsSync(),
  setPermissionPrimed: (type) => {
    const current = get().hasPrimedPermissions;
    const next = { ...current, [type]: true };
    storage.setJSON(PRIMED_PERMISSIONS_STORAGE_KEY, next);
    set({ hasPrimedPermissions: next });
  },

  // Device config
  deviceConfig: loadPersistedConfigSync(),
  setDeviceConfig: (config) => {
    storage.setJSON(CONFIG_STORAGE_KEY, config);
    set({ deviceConfig: config });
  },

  // Telemetry: null in REAL_HARDWARE mode until live data arrives from device
  telemetry: initialHardwareMode === 'DEMO_SIMULATOR' ? {
    deviceId: 'DEMO-DEVICE',
    timestamp: new Date().toISOString(),
    presence: false,
    movement: false,
    stillnessSeconds: 0,
    state: 'IDLE',
    voiceDetected: false,
    wifiRSSI: -58,
    uptime: 0,
    firmwareVersion: '1.0.0-sim',
  } : null,
  setTelemetry: (telemetry) => set({ telemetry }),

  // Connection status: strictly independent
  isOnline: initialHardwareMode === 'DEMO_SIMULATOR',
  setIsOnline: (isOnline) => set({ isOnline }),
  bluetoothStatus: 'DISCONNECTED',
  setBluetoothStatus: (bluetoothStatus) => set({ bluetoothStatus }),
  wifiStatus: 'DISCONNECTED',
  setWifiStatus: (wifiStatus) => set({ wifiStatus }),
  cloudStatus: 'DISCONNECTED',
  setCloudStatus: (cloudStatus) => set({ cloudStatus }),
  fakeWifiConnected: false,
  setFakeWifiConnected: (fakeWifiConnected) => {
    // Only permit fake Wi-Fi in DEMO_SIMULATOR mode
    if (get().hardwareMode !== 'DEMO_SIMULATOR') {
      console.warn('[Store] fakeWifiConnected rejected: Application is in REAL_HARDWARE mode.');
      set({ fakeWifiConnected: false });
      return;
    }
    set({ fakeWifiConnected });
  },

  // Emergency events
  activeEmergency: null,
  setActiveEmergency: (activeEmergency) => set({ activeEmergency }),

  // Voice feedback
  voicePrompt: null,
  setVoicePrompt: (voicePrompt) => set({ voicePrompt }),

  // Simulator mode toggle (syncs with hardwareMode)
  isSimulatorMode: initialHardwareMode === 'DEMO_SIMULATOR',
  setIsSimulatorMode: (isSimulatorMode) => {
    const mode = isSimulatorMode ? 'DEMO_SIMULATOR' : 'REAL_HARDWARE';
    get().setHardwareMode(mode);
  },

  // Auth
  user: null,
  session: null,
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  initializeSupabase: async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) console.error('Supabase session fetch error:', error);
      if (session) {
        set({ user: session.user, session });
      }
      supabase.auth.onAuthStateChange((_event, newSession) => {
        set({ user: newSession?.user ?? null, session: newSession ?? null });
      });

      const deviceUuid = process.env.EXPO_PUBLIC_DEVICE_UUID;
      if (deviceUuid) {
        const current = get().deviceConfig;
        if (current) {
          set({ deviceConfig: { ...current, deviceId: deviceUuid } });
        }
      }
    } catch (e) {
      console.warn('Supabase auth init note:', e);
    }
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null });
  },
}));
