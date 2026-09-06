import { SafetyStateMachine } from './SafetyStateMachine';
import { DeviceConfig, Telemetry, EmergencyEvent } from '../types';

export class DeviceSimulator {
  private stateMachine: SafetyStateMachine;
  private config: DeviceConfig;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  
  private onTelemetryUpdate?: (telemetry: Telemetry) => void;
  private onEmergencyEvent?: (event: EmergencyEvent) => void;
  private onVoicePrompt?: (message: string) => void;

  private isOffline: boolean = false;
  private uptime: number = 0;
  
  constructor(config: DeviceConfig) {
    this.config = config;
    this.stateMachine = new SafetyStateMachine(config);
  }

  public setCallbacks(
    onTelemetryUpdate: (telemetry: Telemetry) => void,
    onEmergencyEvent: (event: EmergencyEvent) => void,
    onVoicePrompt: (message: string) => void
  ) {
    this.onTelemetryUpdate = onTelemetryUpdate;
    this.onEmergencyEvent = onEmergencyEvent;
    this.onVoicePrompt = onVoicePrompt;
  }

  public start() {
    this.stop();
    this.tickInterval = setInterval(() => this.tick(), 1000);
  }

  public stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  public simulatePersonEnters() {
    this.stateMachine.dispatch('PERSON_ENTERS');
    this.emitTelemetry();
  }
  
  public simulatePersonLeaves() {
    this.stateMachine.dispatch('PERSON_LEAVES');
    this.emitTelemetry();
  }

  public simulateMovement() {
    this.stateMachine.dispatch('MOVEMENT_DETECTED');
    this.emitTelemetry();
  }

  public simulateStops() {
    this.stateMachine.dispatch('MOVEMENT_STOPPED');
    this.emitTelemetry();
  }

  public simulateVoiceHelp() {
    this.stateMachine.dispatch('VOICE_EMERGENCY_DETECTED');
    this.emitTelemetry();
    this.emitEmergency('VOICE', 'HELP', 0.92);
  }

  public simulateResponse() {
    this.stateMachine.dispatch('RESPONSE_RECEIVED');
    this.emitTelemetry();
  }

  public simulateOffline() {
    this.isOffline = true;
    // Don't emit telemetry when offline
  }

  public simulateOnline() {
    this.isOffline = false;
    this.emitTelemetry();
  }
  
  public simulateEmergencyButton() {
    this.stateMachine.dispatch('VOICE_EMERGENCY_DETECTED'); // reuse state for now
    this.emitTelemetry();
    this.emitEmergency('BUTTON');
  }

  private tick() {
    this.uptime++;
    if (this.isOffline) return;

    const prevState = this.stateMachine.getState();
    this.stateMachine.dispatch('TICK');
    const newState = this.stateMachine.getState();

    // Trigger voice prompt transition
    if (prevState !== 'CHECKING_WELLBEING' && newState === 'CHECKING_WELLBEING') {
      if (this.onVoicePrompt) {
        this.onVoicePrompt('Are you okay?');
      }
    }

    // Trigger emergency transition due to timeout
    if (prevState === 'WAITING_FOR_RESPONSE' && newState === 'EMERGENCY') {
      this.emitEmergency('NO_RESPONSE');
    }

    this.emitTelemetry();
  }

  private emitTelemetry() {
    if (this.isOffline || !this.onTelemetryUpdate) return;

    this.onTelemetryUpdate({
      deviceId: this.config.deviceId,
      timestamp: new Date().toISOString(),
      presence: this.stateMachine.getPresence(),
      movement: this.stateMachine.getMovement(),
      stillnessSeconds: this.stateMachine.getStillnessSeconds(),
      state: this.stateMachine.getState(),
      voiceDetected: false,
      wifiRSSI: -65,
      uptime: this.uptime,
      firmwareVersion: '1.0.0-sim',
    });
  }

  private emitEmergency(trigger: 'VOICE' | 'NO_RESPONSE' | 'BUTTON' | 'OTHER', keyword?: string, confidence?: number) {
    if (!this.onEmergencyEvent) return;

    this.onEmergencyEvent({
      id: Math.random().toString(36).substring(7),
      deviceId: this.config.deviceId,
      eventType: 'EMERGENCY',
      trigger,
      keyword,
      confidence,
      timestamp: new Date().toISOString(),
      status: 'ACTIVE',
    });
  }
}
