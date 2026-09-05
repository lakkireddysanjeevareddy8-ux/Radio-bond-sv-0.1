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

  // Auth
  user: User | null;
  session: Session | null;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  initializeSupabase: () => void;
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

export const useAppStore = create<AppState>((set, get) => ({
  // Device config (loaded later after auth)
  deviceConfig: defaultConfig,
  setDeviceConfig: (config) => set({ deviceConfig: config }),

  // Telemetry
  telemetry: null,
  setTelemetry: (telemetry) => set({ telemetry }),

  // Connection status
  isOnline: false,
  setIsOnline: (isOnline) => set({ isOnline }),

  // Emergency events
  activeEmergency: null,
  setActiveEmergency: (activeEmergency) => set({ activeEmergency }),

  // Voice feedback
  voicePrompt: null,
  setVoicePrompt: (voicePrompt) => set({ voicePrompt }),

  // Auth
  user: null,
  session: null,
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  initializeSupabase: async () => {
    // Get the current session (if any)
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) console.error('Supabase session fetch error:', error);
    if (session) {
      set({ user: session.user, session });
    }
    // Listen for auth state changes
    supabase.auth.onAuthStateChange((_event, newSession) => {
      set({ user: newSession?.user ?? null, session: newSession ?? null });
    });

    // Load pre‑provisioned device UUID from env and update config
    const deviceUuid = process.env.EXPO_PUBLIC_DEVICE_UUID;
    if (deviceUuid) {
      const current = get().deviceConfig;
      if (current) {
        set({ deviceConfig: { ...current, deviceId: deviceUuid } });
      }
    }
  },
}));
