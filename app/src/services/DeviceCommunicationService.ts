import { DeviceSimulator } from '../simulator/DeviceSimulator';
import { Telemetry, EmergencyEvent, DeviceConfig, SafetyState } from '../types';

export type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING';

export class DeviceCommunicationService {
  private simulator: DeviceSimulator | null = null;
  private status: ConnectionStatus = 'DISCONNECTED';
  
  private onTelemetryUpdate?: (telemetry: Telemetry) => void;
  private onEmergencyEvent?: (event: EmergencyEvent) => void;
  private onStatusChange?: (status: ConnectionStatus) => void;
  private onVoicePrompt?: (message: string) => void;

  constructor() {}

  public setCallbacks(
    onTelemetryUpdate: (telemetry: Telemetry) => void,
    onEmergencyEvent: (event: EmergencyEvent) => void,
    onStatusChange: (status: ConnectionStatus) => void,
    onVoicePrompt: (message: string) => void
  ) {
    this.onTelemetryUpdate = onTelemetryUpdate;
    this.onEmergencyEvent = onEmergencyEvent;
    this.onStatusChange = onStatusChange;
    this.onVoicePrompt = onVoicePrompt;
  }

  // Uses Demo Mode by default right now.
  public async connectToDemoDevice(config: DeviceConfig) {
    this.setStatus('CONNECTING');
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.simulator = new DeviceSimulator(config);
    this.simulator.setCallbacks(
      (telemetry) => this.onTelemetryUpdate?.(telemetry),
      (event) => this.onEmergencyEvent?.(event),
      (message) => this.onVoicePrompt?.(message)
    );
    
    this.simulator.start();
    this.setStatus('CONNECTED');
  }

  public disconnect() {
    if (this.simulator) {
      this.simulator.stop();
      this.simulator = null;
    }
    this.setStatus('DISCONNECTED');
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.onStatusChange?.(status);
  }

  // --- Controls for Demo Mode ---
  public demoPersonEnters() { this.simulator?.simulatePersonEnters(); }
  public demoPersonLeaves() { this.simulator?.simulatePersonLeaves(); }
  public demoMovement() { this.simulator?.simulateMovement(); }
  public demoStops() { this.simulator?.simulateStops(); }
  public demoVoiceHelp() { this.simulator?.simulateVoiceHelp(); }
  public demoResponse() { this.simulator?.simulateResponse(); }
  public demoEmergencyButton() { this.simulator?.simulateEmergencyButton(); }
  
  public demoDeviceOffline() {
    this.simulator?.simulateOffline();
    this.setStatus('DISCONNECTED');
  }
  public demoDeviceOnline() {
    this.simulator?.simulateOnline();
    this.setStatus('CONNECTED');
  }
}

export const deviceService = new DeviceCommunicationService();
