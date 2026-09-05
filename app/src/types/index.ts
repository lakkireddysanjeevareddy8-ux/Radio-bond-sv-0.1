export type SafetyState =
  | 'IDLE'
  | 'PERSON_PRESENT'
  | 'MOVING'
  | 'STILL_MONITORING'
  | 'CHECKING_WELLBEING'
  | 'WAITING_FOR_RESPONSE'
  | 'EMERGENCY'
  | 'RESOLVED'
  | 'DEVICE_OFFLINE';

export interface Telemetry {
  deviceId: string;
  timestamp: string;
  presence: boolean;
  movement: boolean;
  stillnessSeconds: number;
  state: SafetyState;
  voiceDetected: boolean;
  voiceKeyword?: string;
  voiceConfidence?: number;
  temperature?: number;
  humidity?: number;
  wifiRSSI: number;
  uptime: number;
  firmwareVersion: string;
  batteryLevel?: number;
}

export interface EmergencyEvent {
  id: string;
  deviceId: string;
  eventType: 'EMERGENCY';
  trigger: 'VOICE' | 'NO_RESPONSE' | 'BUTTON' | 'OTHER';
  keyword?: string;
  confidence?: number;
  timestamp: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  acknowledgedAt?: string;
  resolvedAt?: string;
}

export interface DeviceConfig {
  deviceId: string;
  deviceName: string;
  stillnessThreshold: number; // seconds
  responseTimeout: number; // seconds
  voiceDetectionEnabled: boolean;
  speakerEnabled: boolean;
  emergencyKeywords: string[];
  voiceSensitivity: 'Low' | 'Medium' | 'High';
  emergencyEscalation: 'WARNING_ONLY' | 'VOICE_AND_ALERT' | 'IMMEDIATE_ALERT';
}

export interface DeviceStatus {
  id: string;
  userId: string;
  deviceName: string;
  deviceType: string;
  firmwareVersion: string;
  isOnline: boolean;
  lastSeen: string;
  createdAt: string;
  updatedAt: string;
}
