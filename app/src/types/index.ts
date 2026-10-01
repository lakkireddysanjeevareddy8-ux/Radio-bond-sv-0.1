export type SafetyState =
  | 'IDLE'
  | 'PERSON_PRESENT'
  | 'MOVING'
  | 'STILL_MONITORING'
  | 'CHECKING_WELLBEING'
  | 'WAITING_FOR_RESPONSE'
  | 'INACTIVE_DETECTED'
  | 'NO_RESPONSE'
  | 'ALARM'
  | 'EMERGENCY'
  | 'RESOLVED'
  | 'DEVICE_OFFLINE';

export interface EscalationLogEntry {
  id?: string;
  timestamp: string;
  fromState: SafetyState | string;
  toState: SafetyState | string;
  trigger: string;
  stillnessSeconds: number;
}

export interface EscalationConfig {
  t1Seconds: number; // default 300 (5 min)
  repeatIntervalSec: number; // default 15
  alarmVolume: number; // 0-100, default 80
}

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

export type EmergencyEventStatus =
  | 'detected'
  | 'active'
  | 'acknowledged'
  | 'escalating'
  | 'resolved'
  | 'cancelled'
  | 'failed'
  | 'ACTIVE'
  | 'ACKNOWLEDGED'
  | 'RESOLVED';

export type EmergencyEventSource =
  | 'voice_keyword'
  | 'manual_device_trigger'
  | 'fall_or_immobility'
  | 'future_sensor_trigger'
  | 'test'
  | 'sensor'
  | 'app';

export interface EmergencyEvent {
  id: string;
  eventId?: string; // Standardized unique emergency event ID (emg_xxxxxx)
  ownerUserId?: string;
  deviceId: string;
  deviceName?: string;
  type?: 'EMERGENCY';
  eventType: 'EMERGENCY';
  trigger: 'VOICE' | 'NO_RESPONSE' | 'BUTTON' | 'OTHER' | 'TEST' | string;
  source?: EmergencyEventSource;
  severity?: 'CRITICAL' | 'WARNING' | 'INFO';
  presenceDuration?: number; // In seconds
  keyword?: string;
  confidence?: number;
  timestamp: string;
  detectedAt?: string;
  status: EmergencyEventStatus;
  acknowledgedAt?: string;
  resolvedAt?: string;
  isTestAlert?: boolean;
  isTest?: boolean;
  locationLat?: number;
  locationLng?: number;
  locationAccuracy?: number;
  locationShared?: boolean;
  metadata?: Record<string, any>;
  feedbackStatus?: EmergencyFeedbackStatus;
  feedbackNotes?: string;
  feedbackSubmittedAt?: string;
  escalationCountdown?: number;
  notifiedContacts?: Array<{
    contactId: string;
    name: string;
    status: 'pending' | 'sent' | 'delivered' | 'failed';
    priority?: number;
  }>;
}

// WSG-01 App-Only Emergency & Trusted Contact Types
export type ContactInvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface EmergencyContact {
  id: string;
  ownerUserId: string;
  name: string;
  relationship: string;
  email: string;
  isEnabled: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
  invitationStatus?: ContactInvitationStatus;
  inviteToken?: string;
  linkedUserId?: string | null;
}

export interface ContactInvitation {
  id: string;
  ownerUserId: string;
  contactId: string;
  inviteToken: string;
  status: ContactInvitationStatus;
  expiresAt: string;
  acceptedAt?: string;
  createdAt: string;
}

export interface TrustedContactUser {
  id: string;
  contactId: string;
  contactUserId: string;
  status: 'active' | 'inactive' | 'revoked';
  createdAt: string;
  updatedAt: string;
}

export interface NotificationDevice {
  id: string;
  userId: string;
  platform: 'android' | 'ios' | 'web';
  pushToken: string;
  deviceName: string;
  isActive: boolean;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmergencySettings {
  id?: string;
  userId: string;
  automaticEscalationEnabled: boolean;
  escalationDelaySeconds: 10 | 30 | 60 | 120;
  shareLocationOnEmergency: boolean;
  notifyOwner: boolean;
  escalationStrategy: 'all' | 'priority';
  createdAt?: string;
  updatedAt?: string;
}

export interface EmergencyNotification {
  id: string;
  emergencyEventId: string;
  recipientUserId?: string;
  contactId?: string;
  notificationType: 'push';
  status: 'pending' | 'sent' | 'delivered' | 'opened' | 'failed';
  providerMessageId?: string;
  sentAt?: string;
  deliveredAt?: string;
  openedAt?: string;
  failedAt?: string;
  failureReason?: string;
  createdAt: string;
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

export interface QuietHoursConfig {
  enabled: boolean;
  startTime: string; // HH:MM in 24h format (e.g. '22:00')
  endTime: string;   // HH:MM in 24h format (e.g. '07:00')
  emergencyBypass: boolean; // Strictly true (life-safety sirens always bypass)
}

export interface DeviceConfig {
  deviceId: string;
  deviceName: string;
  stillnessThreshold: number; // seconds
  responseTimeout: number; // seconds
  t1ThresholdSeconds?: number; // T1 Inactivity threshold in seconds (default 300 = 5 min)
  repeatIntervalSeconds?: number; // Repeat check-in interval in seconds (default 15)
  alarmVolume?: number; // 0 - 100 (default 80)
  voiceDetectionEnabled: boolean;
  speakerEnabled: boolean;
  emergencyKeywords: string[];
  voiceSensitivity: 'Low' | 'Medium' | 'High';
  emergencyEscalation: 'WARNING_ONLY' | 'VOICE_AND_ALERT' | 'IMMEDIATE_ALERT';
  quietHours?: QuietHoursConfig;
}

export type UserDeviceRole = 'OWNER' | 'SHARED_VIEWER';

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
  userRole?: UserDeviceRole;
  isShared?: boolean;
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
  radarStatus?: 'OK' | 'DEGRADED' | 'FAULT';
  micLevel?: number;
  speakerStatus?: 'OK' | 'FAULT';
  wifiStatus?: 'CONNECTED' | 'CONNECTING' | 'OFFLINE';
  bleStatus?: 'CONNECTED' | 'ADVERTISING' | 'IDLE';
  heartbeatIntervalMin?: number;
  lastSeenAt: string;
  updatedAt?: string;
}

// Feature 4: False Alarm Feedback
export type EmergencyFeedbackStatus = 'CONFIRMED_REAL' | 'FALSE_ALARM' | 'NOT_SURE';

export interface EmergencyFeedback {
  status: EmergencyFeedbackStatus;
  notes?: string;
  submittedAt: string;
}


