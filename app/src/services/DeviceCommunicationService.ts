import { DeviceSimulator } from '../simulator/DeviceSimulator';
import { Telemetry, EmergencyEvent, DeviceConfig, SafetyState } from '../types';
import { supabase } from './supabaseClient';

export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING';

export class DeviceCommunicationService {
  private simulator: DeviceSimulator | null = null;
  private channel: any = null;
  private status: ConnectionStatus = 'DISCONNECTED';
  
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
    this.setStatus('CONNECTING');

    // Query most recent telemetry row (if any)
    try {
      const { data: latestTelemetry } = await supabase
        .from('telemetry')
        .select('*')
        .eq('device_id', deviceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestTelemetry) {
        this.handleSupabaseTelemetry(latestTelemetry);
      }
    } catch (err) {
      console.warn('Initial telemetry fetch skipped:', err);
    }

    // Subscribe to Realtime inserts for telemetry and emergencies
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.setStatus('CONNECTED');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          this.setStatus('DISCONNECTED');
        }
      });
  }

  private handleSupabaseTelemetry(row: any) {
    if (!row) return;
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
    const emergency: EmergencyEvent = {
      id: row.id || `emg-${Date.now()}`,
      deviceId: row.device_id || row.deviceId || 'ESP32-LIVE',
      eventType: 'EMERGENCY',
      trigger: row.trigger || 'OTHER',
      keyword: row.keyword,
      confidence: row.confidence,
      timestamp: row.created_at || row.timestamp || new Date().toISOString(),
      status: row.status || 'ACTIVE',
      acknowledgedAt: row.acknowledged_at,
      resolvedAt: row.resolved_at,
    };
    this.onEmergencyEvent?.(emergency);
  }

  public disconnect() {
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
