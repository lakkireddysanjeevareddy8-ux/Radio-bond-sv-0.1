import { SafetyState, DeviceConfig, Telemetry } from '../types';

type Action = 
  | 'PERSON_ENTERS' 
  | 'PERSON_LEAVES' 
  | 'MOVEMENT_DETECTED' 
  | 'MOVEMENT_STOPPED'
  | 'VOICE_EMERGENCY_DETECTED'
  | 'RESPONSE_RECEIVED'
  | 'TICK';

export class SafetyStateMachine {
  private state: SafetyState = 'IDLE';
  private stillnessSeconds: number = 0;
  private responseSeconds: number = 0;
  private config: DeviceConfig;
  private presence: boolean = false;
  private movement: boolean = false;

  constructor(config: DeviceConfig) {
    this.config = config;
  }

  public getState(): SafetyState {
    return this.state;
  }

  public getStillnessSeconds(): number {
    return this.stillnessSeconds;
  }
  
  public getPresence(): boolean {
    return this.presence;
  }

  public getMovement(): boolean {
    return this.movement;
  }

  public setConfig(config: DeviceConfig) {
    this.config = config;
  }

  public dispatch(action: Action) {
    switch (this.state) {
      case 'IDLE':
        if (action === 'PERSON_ENTERS') {
          this.presence = true;
          this.movement = true;
          this.state = 'PERSON_PRESENT';
        }
        break;

      case 'PERSON_PRESENT':
      case 'MOVING':
        if (action === 'PERSON_LEAVES') {
          this.reset();
        } else if (action === 'MOVEMENT_DETECTED') {
          this.movement = true;
          this.stillnessSeconds = 0;
          this.state = 'MOVING';
        } else if (action === 'MOVEMENT_STOPPED') {
          this.movement = false;
          this.stillnessSeconds = 0;
          this.state = 'STILL_MONITORING';
        } else if (action === 'VOICE_EMERGENCY_DETECTED') {
          this.state = 'EMERGENCY';
        }
        break;

      case 'STILL_MONITORING':
        if (action === 'PERSON_LEAVES') {
          this.reset();
        } else if (action === 'MOVEMENT_DETECTED') {
          this.movement = true;
          this.stillnessSeconds = 0;
          this.state = 'MOVING';
        } else if (action === 'TICK') {
          this.stillnessSeconds++;
          if (this.stillnessSeconds >= this.config.stillnessThreshold) {
            this.state = 'CHECKING_WELLBEING';
            this.responseSeconds = 0;
          }
        } else if (action === 'VOICE_EMERGENCY_DETECTED') {
          this.state = 'EMERGENCY';
        }
        break;

      case 'CHECKING_WELLBEING':
      case 'WAITING_FOR_RESPONSE':
        if (action === 'RESPONSE_RECEIVED' || action === 'MOVEMENT_DETECTED') {
          this.movement = true;
          this.stillnessSeconds = 0;
          this.state = 'MOVING';
        } else if (action === 'TICK') {
          this.responseSeconds++;
          if (this.state === 'CHECKING_WELLBEING') {
             this.state = 'WAITING_FOR_RESPONSE';
          }
          if (this.responseSeconds >= this.config.responseTimeout) {
            this.state = 'EMERGENCY';
          }
        } else if (action === 'VOICE_EMERGENCY_DETECTED') {
          this.state = 'EMERGENCY';
        }
        break;

      case 'EMERGENCY':
        if (action === 'PERSON_LEAVES') {
           this.reset();
        }
        break;
        
      case 'RESOLVED':
        if (action === 'PERSON_LEAVES') {
          this.reset();
        } else if (action === 'MOVEMENT_DETECTED') {
          this.movement = true;
          this.stillnessSeconds = 0;
          this.state = 'MOVING';
        }
        break;
    }
  }

  public resolveEmergency() {
    if (this.state === 'EMERGENCY') {
       this.state = 'RESOLVED';
    }
  }

  private reset() {
    this.presence = false;
    this.movement = false;
    this.stillnessSeconds = 0;
    this.responseSeconds = 0;
    this.state = 'IDLE';
  }
}
