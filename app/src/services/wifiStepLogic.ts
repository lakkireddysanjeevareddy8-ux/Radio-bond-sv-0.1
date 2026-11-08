/**
 * WifiStepStateMachine
 *
 * Encapsulates the complete Wi-Fi configuration step state machine:
 * 1. Initial GET_STATUS query (up to 3s).
 * 2. If CONNECTED: transitions to ALREADY_CONNECTED, skips form, auto-advances.
 * 3. If DISCONNECTED with saved network: transitions to RECONNECTING, polls every 3s up to 20s.
 *    If unreachable: falls back to FORM with saved SSID prefilled and error message.
 * 4. If DISCONNECTED with no saved network: directly transitions to FORM and starts SCAN_WIFI.
 * 5. GET_STATUS 3s timeout with no reply: falls back to FORM and starts SCAN_WIFI.
 * 6. FORGET_WIFI: forgets network on hardware and resets form.
 * 7. WIFI_NET scan aggregation and deduplication.
 */

export type WifiSubState =
  | 'CHECKING_STATUS'
  | 'ALREADY_CONNECTED'
  | 'RECONNECTING'
  | 'FORM'
  | 'WIFI_FAILED';

export interface WifiNetworkItem {
  ssid: string;
  rssi: number;
  sec: number;
}

export interface WifiStepState {
  subState: WifiSubState;
  savedSsid: string;
  connectedSsid: string;
  assignedIp?: string;
  rssi?: number;
  wifiSsid: string;
  wifiPass: string;
  errorMessage: string;
  reconnectElapsed: number;
  isScanning: boolean;
  scanTimedOut: boolean;
  networks: WifiNetworkItem[];
}

export interface WifiStepCallbacks {
  sendCommand: (cmd: { cmd: string; [key: string]: any }) => Promise<void>;
  onAdvanceToNextStep?: (ssid: string, ip?: string, rssi?: number) => void;
  onStateChange?: (state: WifiStepState) => void;
}

export class WifiStepStateMachine {
  private state: WifiStepState = {
    subState: 'CHECKING_STATUS',
    savedSsid: '',
    connectedSsid: '',
    assignedIp: undefined,
    rssi: undefined,
    wifiSsid: '',
    wifiPass: '',
    errorMessage: '',
    reconnectElapsed: 0,
    isScanning: false,
    scanTimedOut: false,
    networks: [],
  };

  private callbacks: WifiStepCallbacks;
  private statusCheckTimer: any = null;
  private reconnectInterval: any = null;
  private reconnectTimeout: any = null;
  private scanTimeout: any = null;
  private autoAdvanceTimer: any = null;

  constructor(callbacks: WifiStepCallbacks) {
    this.callbacks = callbacks;
  }

  public getState(): Readonly<WifiStepState> {
    return { ...this.state, networks: [...this.state.networks] };
  }

  private updateState(partial: Partial<WifiStepState>) {
    this.state = {
      ...this.state,
      ...partial,
    };
    this.callbacks.onStateChange?.(this.getState());
  }

  public clearAllTimers() {
    if (this.statusCheckTimer) {
      clearTimeout(this.statusCheckTimer);
      this.statusCheckTimer = null;
    }
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
  }

  /**
   * Starts the Wi-Fi step by issuing GET_STATUS and starting the 3s timeout.
   */
  public start() {
    this.clearAllTimers();
    this.updateState({
      subState: 'CHECKING_STATUS',
      errorMessage: '',
      scanTimedOut: false,
      networks: [],
    });

    this.callbacks.sendCommand({ cmd: 'GET_STATUS' }).catch(() => {});

    // 3-second timeout for initial status
    this.statusCheckTimer = setTimeout(() => {
      if (this.state.subState === 'CHECKING_STATUS') {
        this.updateState({ subState: 'FORM' });
        this.startScan();
      }
    }, 3000);
  }

  /**
   * Starts a Wi-Fi scan on the device.
   */
  public startScan() {
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }
    this.updateState({
      isScanning: true,
      scanTimedOut: false,
      networks: [],
    });

    this.callbacks.sendCommand({ cmd: 'SCAN_WIFI' }).catch(() => {});

    this.scanTimeout = setTimeout(() => {
      this.updateState({
        isScanning: false,
        scanTimedOut: true,
      });
    }, 10000);
  }

  /**
   * Handles incoming BLE notification messages.
   */
  public handleNotification(data: any) {
    if (!data) return;

    // Outdated firmware protocol check
    if (
      data.error === 'FW_UPDATE_NEEDED' ||
      data.code === 'FW_UPDATE_NEEDED' ||
      (typeof data.protocol === 'number' && data.protocol < 1)
    ) {
      this.clearAllTimers();
      this.updateState({
        subState: 'WIFI_FAILED',
        errorMessage: 'Device firmware update needed',
      });
      return;
    }

    const type = String(data.type || data.cmd || '').toUpperCase();
    const normStatus = String(data.status || '').toUpperCase();
    const normState = String(data.state || '').toUpperCase();

    // 1. WIFI_STATUS
    if (type === 'WIFI_STATUS' || type === 'STATUS') {
      if (normStatus === 'CONNECTED' || normState === 'WIFI_CONNECTED') {
        this.clearAllTimers();
        const activeSsid = data.ssid || this.state.wifiSsid || 'Wi-Fi Network';
        const activeIp = data.ip && data.ip !== '0.0.0.0' ? data.ip : undefined;
        this.updateState({
          subState: 'ALREADY_CONNECTED',
          connectedSsid: activeSsid,
          assignedIp: activeIp,
          rssi: data.rssi,
        });

        // Auto-advance after 2.5s
        this.autoAdvanceTimer = setTimeout(() => {
          this.callbacks.onAdvanceToNextStep?.(activeSsid, activeIp, data.rssi);
        }, 2500);
        return;
      }

      if (normStatus === 'AUTH_FAILED') {
        this.clearAllTimers();
        this.updateState({
          subState: 'WIFI_FAILED',
          errorMessage: 'Wi-Fi connection failed: Incorrect Wi-Fi password.',
        });
        return;
      }

      if (normStatus === 'NO_SSID' || normStatus === 'SSID_NOT_FOUND') {
        this.clearAllTimers();
        this.updateState({
          subState: 'WIFI_FAILED',
          errorMessage: 'Wi-Fi connection failed: Network not found (make sure it is 2.4 GHz).',
        });
        return;
      }

      if (normStatus === 'WIFI_TIMEOUT' || normStatus === 'TIMEOUT') {
        this.clearAllTimers();
        this.updateState({
          subState: 'WIFI_FAILED',
          errorMessage: 'Wi-Fi connection timed out.',
        });
        return;
      }

      if (normStatus === 'FAILED' || normState === 'WIFI_FAILED') {
        this.clearAllTimers();
        this.updateState({
          subState: 'WIFI_FAILED',
          errorMessage: 'Wi-Fi connection failed.',
        });
        return;
      }

      if (normStatus === 'DISCONNECTED' || normState === 'WIFI_DISCONNECTED') {
        const savedNet = data.saved ? String(data.saved).trim() : '';

        if (savedNet.length > 0 && this.state.subState === 'CHECKING_STATUS') {
          if (this.statusCheckTimer) {
            clearTimeout(this.statusCheckTimer);
            this.statusCheckTimer = null;
          }
          this.updateState({
            savedSsid: savedNet,
            subState: 'RECONNECTING',
            reconnectElapsed: 0,
          });
          this.startReconnectPolling(savedNet);
          return;
        } else if (this.state.subState === 'CHECKING_STATUS') {
          if (this.statusCheckTimer) {
            clearTimeout(this.statusCheckTimer);
            this.statusCheckTimer = null;
          }
          this.updateState({ subState: 'FORM' });
          this.startScan();
          return;
        }
      }
    }

    // 2. WIFI_SCAN
    if (type === 'WIFI_SCAN') {
      const scanStatus = String(data.status || '').toUpperCase();
      if (scanStatus === 'SCANNING') {
        this.updateState({ isScanning: true, scanTimedOut: false });
      } else if (scanStatus === 'DONE') {
        if (this.scanTimeout) {
          clearTimeout(this.scanTimeout);
          this.scanTimeout = null;
        }
        this.updateState({ isScanning: false });
      }
      return;
    }

    // 3. WIFI_NET
    if (type === 'WIFI_NET') {
      const netSsid = data.ssid ? String(data.ssid).trim() : '';
      if (netSsid.length > 0) {
        const rssi = typeof data.rssi === 'number' ? data.rssi : -70;
        const sec = typeof data.sec === 'number' ? data.sec : 1;
        const currentNetworks = [...this.state.networks];
        const idx = currentNetworks.findIndex((n) => n.ssid === netSsid);
        if (idx >= 0) {
          currentNetworks[idx] = { ssid: netSsid, rssi, sec };
        } else {
          currentNetworks.push({ ssid: netSsid, rssi, sec });
        }
        currentNetworks.sort((a, b) => b.rssi - a.rssi);
        this.updateState({ networks: currentNetworks });
      }
    }
  }

  /**
   * Starts reconnect polling for saved network (every 3s, timeout at 20s).
   */
  private startReconnectPolling(savedNetwork: string) {
    this.clearAllTimers();
    let elapsed = 0;
    this.updateState({
      subState: 'RECONNECTING',
      savedSsid: savedNetwork,
      reconnectElapsed: 0,
    });

    this.reconnectInterval = setInterval(() => {
      elapsed += 3;
      this.updateState({ reconnectElapsed: elapsed });
      this.callbacks.sendCommand({ cmd: 'GET_STATUS' }).catch(() => {});
    }, 3000);

    this.reconnectTimeout = setTimeout(() => {
      if (this.reconnectInterval) {
        clearInterval(this.reconnectInterval);
        this.reconnectInterval = null;
      }
      this.updateState({
        subState: 'FORM',
        wifiSsid: savedNetwork,
        errorMessage: `Saved network "${savedNetwork}" could not be reached.`,
      });
      this.startScan();
    }, 20000);
  }

  /**
   * Forgets the current Wi-Fi network and reverts to the scan list/form.
   */
  public async useDifferentNetwork(): Promise<void> {
    this.clearAllTimers();
    try {
      await this.callbacks.sendCommand({ cmd: 'FORGET_WIFI' });
    } catch {}

    this.updateState({
      savedSsid: '',
      connectedSsid: '',
      wifiSsid: '',
      wifiPass: '',
      errorMessage: '',
      subState: 'FORM',
    });
    this.startScan();
  }

  /**
   * Selects a network from the scan list.
   */
  public selectNetwork(net: WifiNetworkItem) {
    this.updateState({
      wifiSsid: net.ssid,
      errorMessage: '',
    });
  }

  /**
   * Cleans up all timers on unmount.
   */
  public dispose() {
    this.clearAllTimers();
  }
}
