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
  eventId?: string; // Standardized unique emergency event ID (emg_xxxxxx)
  deviceId: string;
  deviceName?: string;
  type?: 'EMERGENCY';
  eventType: 'EMERGENCY';
  trigger: 'VOICE' | 'NO_RESPONSE' | 'BUTTON' | 'OTHER';
  severity?: 'CRITICAL' | 'WARNING' | 'INFO';
  presenceDuration?: number; // In seconds
  keyword?: string;
  confidence?: number;
  timestamp: string;
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  acknowledgedAt?: string;
  resolvedAt?: string;
  isTestAlert?: boolean;
}

export interface EmergencyPushPayload {
  type: 'EMERGENCY';
  eventId: string;
  deviceId: string;
  deviceName: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  timestamp: string;
  presenceDuration: number;
  trigger?: string;
  isTest?: boolean;
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

export interface Contact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  isPrimary: boolean;
}

