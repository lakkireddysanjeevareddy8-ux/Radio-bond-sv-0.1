import { SafetyState, DeviceConfig } from '../types';

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
    switch (action) {
      case 'PERSON_ENTERS':
        this.presence = true;
        this.movement = true;
        this.stillnessSeconds = 0;
        this.responseSeconds = 0;
        this.state = 'PERSON_PRESENT';
        break;

      case 'PERSON_LEAVES':
        this.reset();
        break;

      case 'MOVEMENT_DETECTED':
        this.presence = true;
        this.movement = true;
        this.stillnessSeconds = 0;
        this.responseSeconds = 0;
        this.state = 'MOVING';
        break;

      case 'MOVEMENT_STOPPED':
        this.presence = true;
        this.movement = false;
        this.stillnessSeconds = 0;
        this.responseSeconds = 0;
        this.state = 'STILL_MONITORING';
        break;

      case 'VOICE_EMERGENCY_DETECTED':
        this.presence = true;
        this.state = 'EMERGENCY';
        break;

      case 'RESPONSE_RECEIVED':
        this.presence = true;
        this.movement = true;
        this.stillnessSeconds = 0;
        this.responseSeconds = 0;
        this.state = 'MOVING';
        break;

      case 'TICK':
        if (this.state === 'STILL_MONITORING') {
          this.stillnessSeconds++;
          if (this.stillnessSeconds >= this.config.stillnessThreshold) {
            this.state = 'CHECKING_WELLBEING';
            this.responseSeconds = 0;
          }
        } else if (this.state === 'CHECKING_WELLBEING' || this.state === 'WAITING_FOR_RESPONSE') {
          this.stillnessSeconds++;
          this.responseSeconds++;
          this.state = 'WAITING_FOR_RESPONSE';
          if (this.responseSeconds >= this.config.responseTimeout) {
            this.state = 'EMERGENCY';
          }
        } else if (this.state === 'EMERGENCY') {
          this.stillnessSeconds++;
        }
        break;
    }
  }

  public resolveEmergency() {
    this.state = 'RESOLVED';
  }

  public reset() {
    this.presence = false;
    this.movement = false;
    this.stillnessSeconds = 0;
    this.responseSeconds = 0;
    this.state = 'IDLE';
  }
}
