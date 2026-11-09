export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';

export type ConnectionManagerState =
  | 'IDLE'
  | 'SCANNING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'FAILED'
  | 'BLUETOOTH_OFF';

export interface ConnectedDeviceInfo {
  id: string;
  name: string;
  connectionType: 'BLE' | 'WIFI';
  model?: string;
  room?: string;
  rssi?: number;
  batteryLevel?: number;
  firmwareVersion?: string;
  ipAddress?: string;
  ssid?: string;
  rawDevice?: any;
  isEarbuds?: boolean;
}

export type ConnectionManagerListener = (
  state: ConnectionManagerState,
  reason: string
) => void;
