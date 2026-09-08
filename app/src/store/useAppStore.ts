import { create } from 'zustand';
import { DeviceConfig, Telemetry, EmergencyEvent, SafetyState } from '../types';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';

interface AppState {
  // Device
  deviceConfig: DeviceConfig | null;
  setDeviceConfig: (config: DeviceConfig) => void;
  
  // Telemetry
  telemetry: Telemetry | null;
  setTelemetry: (telemetry: Telemetry) => void;
  
  // Connection
  isOnline: boolean;
  setIsOnline: (isOnline: boolean) => void;

  // Events
  activeEmergency: EmergencyEvent | null;
  setActiveEmergency: (event: EmergencyEvent | null) => void;
  
  // Voice feedback
  voicePrompt: string | null;
  setVoicePrompt: (prompt: string | null) => void;

  // Mode
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
  deviceId: 'DEMO-DEVICE',
  deviceName: 'Bathroom Safety Device',
  stillnessThreshold: 15,
  responseTimeout: 10,
  voiceDetectionEnabled: true,
  speakerEnabled: true,
  emergencyKeywords: ['HELP', 'EMERGENCY', 'SAVE ME'],
  voiceSensitivity: 'Medium',
  emergencyEscalation: 'VOICE_AND_ALERT'
};

const CONFIG_STORAGE_KEY = 'washroom_safeguard_config_v1';

const loadPersistedConfig = (): DeviceConfig => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
      if (raw) {
        return { ...defaultConfig, ...JSON.parse(raw) };
      }
    }
  } catch (e) {
    console.warn('Could not load config from local storage:', e);
  }
  return defaultConfig;
};

const persistConfig = (config: DeviceConfig) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    }
  } catch (e) {
    console.warn('Could not persist config to local storage:', e);
  }
};

const defaultTelemetry: Telemetry = {
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
};

export const useAppStore = create<AppState>((set, get) => ({
  // Device config
  deviceConfig: loadPersistedConfig(),
  setDeviceConfig: (config) => {
    persistConfig(config);
    set({ deviceConfig: config });
  },

  // Telemetry
  telemetry: defaultTelemetry,
  setTelemetry: (telemetry) => set({ telemetry }),

  // Connection status (default online in simulator mode)
  isOnline: true,
  setIsOnline: (isOnline) => set({ isOnline }),

  // Emergency events
  activeEmergency: null,
  setActiveEmergency: (activeEmergency) => set({ activeEmergency }),

  // Voice feedback
  voicePrompt: null,
  setVoicePrompt: (voicePrompt) => set({ voicePrompt }),

  // Mode
  isSimulatorMode: true,
  setIsSimulatorMode: (isSimulatorMode) => set({ isSimulatorMode }),

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
