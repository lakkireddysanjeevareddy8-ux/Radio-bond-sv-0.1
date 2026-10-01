import { DeviceSimulator } from '../simulator/DeviceSimulator';
import { Telemetry, EmergencyEvent, DeviceConfig, SafetyState, DeviceHealth } from '../types';
import { supabase } from './supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { EmergencyPushService } from './EmergencyPushService';

export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING';

export class DeviceCommunicationService {
  private simulator: DeviceSimulator | null = null;
  private channel: any = null;
  private status: ConnectionStatus = 'DISCONNECTED';
  private heartbeatTimer: any = null;
  private lastTelemetryTime: number = 0;
  private static readonly STALE_HEARTBEAT_MS = 15000; // 15s timeout for 3s telemetry interval

  // Hardware Diagnostics & Heartbeat Watchdog
  private currentDeviceId: string = '';
  private lastHealthHeartbeatTime: number = 0;
  private expectedHeartbeatIntervalMs: number = 10 * 60 * 1000; // 10 min default
  private offlineNotificationDispatched: boolean = false;
  
  private onTelemetryUpdate?: (telemetry: Telemetry) => void;
  private onEmergencyEvent?: (event: EmergencyEvent) => void;
  private onEmergencyResolved?: () => void;
  private onStatusChange?: (status: ConnectionStatus) => void;
  private onVoicePrompt?: (message: string) => void;
  private lastConfig?: DeviceConfig;

  constructor() {}

  public setCallbacks(
    onTelemetryUpdate: (telemetry: Telemetry) => void,
    onEmergencyEvent: (event: EmergencyEvent) => void,
    onStatusChange: (status: ConnectionStatus) => void,
    onVoicePrompt: (message: string) => void,
    onEmergencyResolved?: () => void
  ) {
    this.onTelemetryUpdate = onTelemetryUpdate;
    this.onEmergencyEvent = onEmergencyEvent;
    this.onStatusChange = onStatusChange;
    this.onVoicePrompt = onVoicePrompt;
    this.onEmergencyResolved = onEmergencyResolved;

    if (this.simulator) {
      this.simulator.setCallbacks(
        (telemetry) => this.onTelemetryUpdate?.(telemetry),
        (event) => this.onEmergencyEvent?.(event),
        (message) => this.onVoicePrompt?.(message),
        () => this.onEmergencyResolved?.()
      );
    }
  }

  // Demo Simulator Mode
  public connectToDemoDevice(config: DeviceConfig) {
    if (useAppStore.getState().hardwareMode === 'REAL_HARDWARE') {
      console.warn('[DeviceCommunicationService] connectToDemoDevice blocked: Application is in REAL_HARDWARE mode.');
      return;
    }
    this.stopHeartbeatWatchdog();
    this.lastConfig = config;
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }

    if (!this.simulator) {
      this.simulator = new DeviceSimulator(config);
      this.simulator.setCallbacks(
        (telemetry) => this.onTelemetryUpdate?.(telemetry),
        (event) => this.onEmergencyEvent?.(event),
        (message) => this.onVoicePrompt?.(message),
        () => this.onEmergencyResolved?.()
      );
      this.simulator.start();
    } else {
      this.simulator.start();
    }
    
    this.setStatus('CONNECTED');
  }

  // Live Hardware / Supabase Mode
  public async connectToSupabaseDevice(deviceId: string) {
    this.disconnect();
    this.currentDeviceId = deviceId;
    this.setStatus('CONNECTING');
    this.startHeartbeatWatchdog();

    // 1. Fetch most recent telemetry row (if any)
    try {
      const { data: latestTelemetry } = await supabase
        .from('telemetry')
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestTelemetry) {
        const rowTime = new Date(latestTelemetry.created_at || latestTelemetry.timestamp).getTime();
        if (Date.now() - rowTime < DeviceCommunicationService.STALE_HEARTBEAT_MS) {
          this.handleSupabaseTelemetry(latestTelemetry);
        } else {
          console.log('[Heartbeat] Stored telemetry is older than 15s. Awaiting live broadcast.');
        }
      }
    } catch (err) {
      console.warn('Initial telemetry fetch skipped:', err);
    }

    // 2. Fetch initial device health diagnostic row
    try {
      const { data: healthRow } = await supabase
        .from('device_health')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (healthRow) {
        this.handleSupabaseHealth(healthRow);
      }
    } catch (healthErr) {
      console.warn('Initial device health fetch skipped:', healthErr);
    }

    // 3. Subscribe to Realtime inserts for telemetry, emergencies, and health
    this.channel = supabase
      .channel(`device-live-${deviceId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'telemetry', filter: `device_id=eq.${deviceId}` },
        (payload) => {
          this.handleSupabaseTelemetry(payload.new);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'emergencies', filter: `device_id=eq.${deviceId}` },
        (payload) => {
          this.handleSupabaseEmergency(payload.new);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'emergency_events', filter: `device_id=eq.${deviceId}` },
        (payload) => {
          this.handleSupabaseEmergency(payload.new);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'device_health', filter: `device_id=eq.${deviceId}` },
        (payload) => {
          this.handleSupabaseHealth(payload.new);
        }
      )
      .subscribe((status) => {
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          this.setStatus('DISCONNECTED');
        }
      });
  }

  private startHeartbeatWatchdog() {
    this.stopHeartbeatWatchdog();
    this.heartbeatTimer = setInterval(() => {
      // 1. Telemetry staleness
      if (this.lastTelemetryTime > 0 && Date.now() - this.lastTelemetryTime > DeviceCommunicationService.STALE_HEARTBEAT_MS) {
        if (this.status === 'CONNECTED') {
          this.setStatus('DISCONNECTED');
        }
      }

      // 2. Self-test Heartbeat staleness (> 2x expected heartbeat interval)
      const timeoutMs = 2 * this.expectedHeartbeatIntervalMs;
      if (this.lastHealthHeartbeatTime > 0 && Date.now() - this.lastHealthHeartbeatTime > timeoutMs) {
        if (!this.offlineNotificationDispatched) {
          this.offlineNotificationDispatched = true;
          useAppStore.getState().setIsOnline(false);
          const minutesOffline = Math.round((Date.now() - this.lastHealthHeartbeatTime) / 60000);
          EmergencyPushService.dispatchLowPriorityOfflineNotification(
            this.currentDeviceId || 'WSG-000001',
            useAppStore.getState().deviceConfig?.deviceName || 'Washroom Safety Guardian',
            minutesOffline
          );
        }
      }
    }, 4000);
  }

  private stopHeartbeatWatchdog() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private handleSupabaseHealth(row: any) {
    if (!row) return;
    this.lastHealthHeartbeatTime = Date.now();
    this.offlineNotificationDispatched = false;
    if (row.heartbeat_interval_min) {
      this.expectedHeartbeatIntervalMs = Number(row.heartbeat_interval_min) * 60 * 1000;
    }
    const health: DeviceHealth = {
      deviceId: row.device_id || this.currentDeviceId,
      radarStatus: row.radar_status || 'OK',
      micLevel: Number(row.mic_level ?? 0),
      speakerStatus: row.speaker_status || 'OK',
      wifiStatus: row.wifi_status || 'CONNECTED',
      bleStatus: row.ble_status || 'ADVERTISING',
      powerSource: row.power_source || 'MAINS',
      batteryPct: Number(row.battery_pct ?? 100),
      isCharging: Boolean(row.is_charging),
      rssi: Number(row.rssi ?? -58),
      heartbeatIntervalMin: Number(row.heartbeat_interval_min ?? 10),
      lastSeenAt: row.last_seen_at || row.updated_at || new Date().toISOString(),
      updatedAt: row.updated_at,
    };
    useAppStore.getState().setDeviceHealth(health);
    useAppStore.getState().setIsOnline(true);
  }

  private handleSupabaseTelemetry(row: any) {
    if (!row) return;
    this.lastTelemetryTime = Date.now();
    const telemetry: Telemetry = {
      deviceId: row.device_id || row.deviceId || 'ESP32-LIVE',
      timestamp: row.created_at || row.timestamp || new Date().toISOString(),
      presence: Boolean(row.presence),
      movement: Boolean(row.movement),
      stillnessSeconds: Number(row.stillness_seconds ?? row.stillnessSeconds ?? 0),
      state: (row.state as SafetyState) || 'IDLE',
      voiceDetected: Boolean(row.voice_detected ?? row.voiceDetected),
      voiceKeyword: row.voice_keyword || row.voiceKeyword,
      voiceConfidence: row.voice_confidence ?? row.voiceConfidence,
      temperature: row.temperature,
      humidity: row.humidity,
      wifiRSSI: row.wifi_rssi ?? row.wifiRSSI ?? -60,
      uptime: row.uptime ?? 0,
      firmwareVersion: row.firmware_version ?? row.firmwareVersion ?? 'v1.0.0-esp32',
      batteryLevel: row.battery_level ?? row.batteryLevel,
    };
    this.onTelemetryUpdate?.(telemetry);
    this.setStatus('CONNECTED');
  }

  private handleSupabaseEmergency(row: any) {
    if (!row) return;
    const eventId = String(row.id || `emg_${Date.now()}`);

    // Deduplicate against push notifications that arrived first
    try {
      const { EmergencyPushService } = require('./EmergencyPushService');
      if (EmergencyPushService.isEventAlreadyProcessed(eventId)) {
        console.log(`[DeviceCommunicationService] Skipping already-processed emergency event: ${eventId}`);
        return;
      }
      EmergencyPushService.markEventProcessed(eventId);
    } catch {}

    const rawStatus = String(row.status || 'active').toLowerCase();
    let normalizedStatus: any = 'active';
    if (rawStatus === 'acknowledged') normalizedStatus = 'acknowledged';
    else if (rawStatus === 'resolved') normalizedStatus = 'resolved';
    else if (rawStatus === 'cancelled') normalizedStatus = 'cancelled';
    else if (rawStatus === 'escalating') normalizedStatus = 'escalating';
    else if (rawStatus === 'detected') normalizedStatus = 'detected';

    const emergency: EmergencyEvent = {
      id: eventId,
      eventId: eventId,
      ownerUserId: row.owner_user_id,
      deviceId: row.device_id || row.deviceId || 'WSG-000001',
      deviceName: row.device_name || row.deviceName || 'Washroom Safety Guardian',
      type: 'EMERGENCY',
      eventType: 'EMERGENCY',
      trigger: row.trigger || (row.source === 'voice_keyword' ? 'VOICE' : 'OTHER'),
      source: row.source || (row.trigger === 'VOICE' ? 'voice_keyword' : 'manual_device_trigger'),
      severity: (row.severity as any) || 'CRITICAL',
      presenceDuration: Number(row.presence_duration ?? 0),
      keyword: row.keyword,
      confidence: row.confidence,
      timestamp: row.detected_at || row.event_time || row.created_at || row.timestamp || new Date().toISOString(),
      detectedAt: row.detected_at,
      status: normalizedStatus,
      acknowledgedAt: row.acknowledged_at,
      resolvedAt: row.resolved_at,
      locationLat: row.location_lat,
      locationLng: row.location_lng,
      locationAccuracy: row.location_accuracy,
      locationShared: Boolean(row.location_shared),
      metadata: row.metadata || {},
    };

    this.onEmergencyEvent?.(emergency);

    // If event is active / detected, start escalation countdown
    if (normalizedStatus === 'active' || normalizedStatus === 'detected') {
      try {
        const { EscalationEngineService } = require('./EscalationEngineService');
        EscalationEngineService.startEscalation(emergency);
      } catch (escErr) {
        console.warn('[DeviceCommunicationService] Escalation engine error:', escErr);
      }
    }
  }

  /**
   * Create an emergency event explicitly (from real BLE event, local trigger, or test)
   */
  public async createEmergencyEvent(params: {
    deviceId: string;
    trigger: string;
    source?: any;
    severity?: 'CRITICAL' | 'WARNING' | 'INFO';
    isTest?: boolean;
    metadata?: Record<string, any>;
  }): Promise<EmergencyEvent> {
    const eventId = `emg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const user = useAppStore.getState().user;

    const event: EmergencyEvent = {
      id: eventId,
      eventId: eventId,
      ownerUserId: user?.id,
      deviceId: params.deviceId,
      deviceName: useAppStore.getState().deviceConfig?.deviceName || 'Washroom Safety Guardian',
      type: 'EMERGENCY',
      eventType: 'EMERGENCY',
      trigger: params.trigger,
      source: params.source || 'manual_device_trigger',
      severity: params.severity || 'CRITICAL',
      status: 'active',
      timestamp: new Date().toISOString(),
      isTest: params.isTest,
      isTestAlert: params.isTest,
      metadata: params.metadata || {},
    };

    // 1. Dispatch locally
    this.onEmergencyEvent?.(event);

    // 2. Persist to Supabase if connected
    try {
      await supabase.from('emergency_events').insert({
        id: eventId.startsWith('emg_') ? undefined : eventId,
        owner_user_id: user?.id,
        device_id: params.deviceId,
        event_type: 'emergency',
        severity: (params.severity || 'CRITICAL').toLowerCase(),
        status: 'active',
        source: params.source || 'manual_device_trigger',
        metadata: params.metadata || {},
      });

      // Also insert into legacy emergencies table for ESP32 compatibility
      await supabase.from('emergencies').insert({
        device_id: params.deviceId,
        trigger: params.trigger,
        status: 'ACTIVE',
        is_test: Boolean(params.isTest),
      });
    } catch (e) {
      console.warn('[DeviceCommunicationService] Could not persist emergency event to Supabase:', e);
    }

    // 3. Start escalation
    try {
      const { EscalationEngineService } = require('./EscalationEngineService');
      EscalationEngineService.startEscalation(event);
    } catch {}

    return event;
  }

  /**
   * STEP 9: Acknowledge emergency (ACTIVE -> ACKNOWLEDGED)
   * Stops escalation countdown immediately.
   */
  public async acknowledgeEmergency(eventId: string, deviceId?: string): Promise<boolean> {
    try {
      const { EscalationEngineService } = require('./EscalationEngineService');
      EscalationEngineService.stopEscalation();

      if (this.simulator) {
        return true;
      }

      // Update emergency_events
      await supabase
        .from('emergency_events')
        .update({
          status: 'acknowledged',
          acknowledged_at: new Date().toISOString(),
        })
        .eq('id', eventId);

      // Update legacy emergencies
      const numId = Number(eventId);
      const query = supabase.from('emergencies').update({
        status: 'ACKNOWLEDGED',
        acknowledged_at: new Date().toISOString(),
      });

      if (!isNaN(numId)) {
        await query.eq('id', numId);
      } else {
        await query.eq('id', eventId);
      }
      return true;
    } catch (err) {
      console.warn('Backend acknowledge error:', err);
      return false;
    }
  }

  /**
   * Cancel emergency (e.g. false alarm).
   * Stops escalation countdown immediately.
   */
  public async cancelEmergency(eventId: string, deviceId?: string): Promise<boolean> {
    try {
      const { EscalationEngineService } = require('./EscalationEngineService');
      EscalationEngineService.stopEscalation();

      const { EmergencySoundService } = require('./EmergencySoundService');
      EmergencySoundService.stopAll();

      if (this.simulator) {
        this.onEmergencyResolved?.();
        return true;
      }

      await supabase
        .from('emergency_events')
        .update({
          status: 'cancelled',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', eventId);

      const numId = Number(eventId);
      const query = supabase.from('emergencies').update({
        status: 'CANCELLED',
        resolved: true,
        resolved_at: new Date().toISOString(),
      });

      if (!isNaN(numId)) {
        await query.eq('id', numId);
      } else {
        await query.eq('id', eventId);
      }

      this.onEmergencyResolved?.();
      return true;
    } catch (err) {
      console.warn('Backend cancel error:', err);
      return false;
    }
  }

  /**
   * STEP 10: Resolve emergency on backend (ACTIVE / ACKNOWLEDGED -> RESOLVED)
   * Stops escalation countdown immediately.
   */
  public async resolveEmergency(eventId: string, deviceId?: string): Promise<boolean> {
    try {
      const { EscalationEngineService } = require('./EscalationEngineService');
      EscalationEngineService.stopEscalation();

      if (this.simulator) {
        this.onEmergencyResolved?.();
        return true;
      }

      // Update emergency_events
      await supabase
        .from('emergency_events')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', eventId);

      const numId = Number(eventId);
      const query = supabase.from('emergencies').update({
        status: 'RESOLVED',
        resolved: true,
        resolved_at: new Date().toISOString(),
      });

      if (!isNaN(numId)) {
        await query.eq('id', numId);
      } else {
        await query.eq('id', eventId);
      }
      this.onEmergencyResolved?.();
      return true;
    } catch (err) {
      console.warn('Backend resolve error:', err);
      return false;
    }
  }

  public disconnect() {
    this.stopHeartbeatWatchdog();
    this.lastTelemetryTime = 0;
    this.lastHealthHeartbeatTime = 0;
    this.offlineNotificationDispatched = false;
    if (this.simulator) {
      this.simulator.stop();
      this.simulator = null;
    }
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.setStatus('DISCONNECTED');
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.onStatusChange?.(status);
  }

  // Ensure simulator is active whenever demo methods are called
  public ensureSimulator() {
    if (useAppStore.getState().hardwareMode === 'REAL_HARDWARE') {
      return;
    }
    if (!this.simulator) {
      const cfg: DeviceConfig = this.lastConfig || {
        deviceId: 'DEMO-DEVICE',
        deviceName: 'Bathroom Safety Device',
        stillnessThreshold: 15,
        responseTimeout: 10,
        voiceDetectionEnabled: true,
        speakerEnabled: true,
        emergencyKeywords: ['HELP', 'EMERGENCY', 'SAVE ME'],
        voiceSensitivity: 'Medium',
        emergencyEscalation: 'VOICE_AND_ALERT',
      };
      this.connectToDemoDevice(cfg);
    }
  }

  // --- Controls for Demo Mode ---
  public demoPersonEnters() { 
    this.ensureSimulator();
    this.simulator?.simulatePersonEnters(); 
  }
  public demoPersonLeaves() { 
    this.ensureSimulator();
    this.simulator?.simulatePersonLeaves(); 
  }
  public demoMovement() { 
    this.ensureSimulator();
    this.simulator?.simulateMovement(); 
  }
  public demoStops() { 
    this.ensureSimulator();
    this.simulator?.simulateStops(); 
  }
  public demoVoiceHelp() { 
    this.ensureSimulator();
    this.simulator?.simulateVoiceHelp(); 
  }
  public demoResponse() { 
    this.ensureSimulator();
    this.simulator?.simulateResponse(); 
  }
  public demoEmergencyButton() { 
    this.ensureSimulator();
    this.simulator?.simulateEmergencyButton(); 
  }
  
  public demoDeviceOffline() {
    this.ensureSimulator();
    this.simulator?.simulateOffline();
    this.setStatus('DISCONNECTED');
  }
  public demoDeviceOnline() {
    this.ensureSimulator();
    this.simulator?.simulateOnline();
    this.setStatus('CONNECTED');
  }
}

export const deviceService = new DeviceCommunicationService();
