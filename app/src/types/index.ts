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
  batteryPct?: number;
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
  feedbackStatus?: EmergencyFeedbackStatus;
  feedbackNotes?: string;
  feedbackSubmittedAt?: string;
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

// Feature 1: Trusted Contacts & Caregivers
export type TrustedContactStatus = 'pending' | 'accepted' | 'rejected';

export interface TrustedContact {
  id: string;
  deviceId: string;
  ownerUserId: string;
  contactUserId?: string | null;
  contactEmail: string;
  contactName?: string | null;
  status: TrustedContactStatus;
  createdAt: string;
  updatedAt?: string;
}

// Feature 2: Daily Check-in & Wellness Visits
export type VisitOutcome = 'NORMAL' | 'EMERGENCY' | 'FALSE_ALARM';

export interface VisitRecord {
  id: string;
  deviceId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  outcome: VisitOutcome;
  createdAt: string;
}

export interface WellnessStats {
  todayVisitCount: number;
  avgDurationSeconds: number;
  lastVisitEndedAt: string | null;
  interVisitAvgMinutes: number;
  hasAnomaly: boolean;
  anomalyReason?: string;
}

// Feature 3: Battery & Device Health Monitoring
export type PowerSourceType = 'BATTERY' | 'MAINS';

export interface DeviceHealth {
  deviceId: string;
  batteryPct: number;
  rssi: number;
  powerSource: PowerSourceType;
  isCharging: boolean;
  lastSeenAt: string;
  updatedAt: string;
}

// Feature 4: False Alarm Feedback
export type EmergencyFeedbackStatus = 'CONFIRMED_REAL' | 'FALSE_ALARM' | 'NOT_SURE';

export interface EmergencyFeedback {
  status: EmergencyFeedbackStatus;
  notes?: string;
  submittedAt: string;
}


