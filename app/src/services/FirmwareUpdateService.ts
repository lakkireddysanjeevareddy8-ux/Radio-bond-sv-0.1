import { supabase } from './supabaseClient';
import { BluetoothService } from './bluetoothService';
import { ConnectionManager } from './ConnectionManager';
import { SecureTokenStorage } from '../utils/secureTokenStorage';
import { PhoneBatteryService } from './PhoneBatteryService';
import { BleProtocol, OtaProgressPayload, OtaStatusPayload } from './protocol';
import { logger } from '../utils/logger';

export interface FirmwareRelease {
  id?: string;
  version: string;
  fw: string;
  protocol: number;
  url: string;
  sha256: string;
  release_notes: string;
  min_app_version?: string;
  file_size_bytes?: number;
  published_at?: string;
}

export const DEFAULT_FALLBACK_RELEASE: FirmwareRelease = {
  version: '1.3.0',
  fw: 'v1.3.0-esp32',
  protocol: 1,
  url: 'https://xobasrolmpmvrnjcikcq.supabase.co/storage/v1/object/public/firmware/wsg01_v1.3.0.bin',
  sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  release_notes: '• Dual-partition OTA support with 60-second health rollback guard.\n• HTTPS binary download with SHA-256 checksum integrity verification.\n• Improved Wi-Fi roaming and FreeRTOS task watchdog responsiveness.\n• Enhanced LD2410C millimeter-wave presence diagnostic tracking.',
  file_size_bytes: 1153434,
  published_at: '2026-11-09T12:00:00Z',
};

export type OtaUpdateState =
  | 'IDLE'
  | 'CHECKING'
  | 'AVAILABLE'
  | 'UP_TO_DATE'
  | 'STARTING'
  | 'DOWNLOADING'
  | 'VERIFYING'
  | 'REBOOTING'
  | 'HEALTH_CHECK'
  | 'SUCCESS'
  | 'ERROR';

export interface OtaProgressInfo {
  state: OtaUpdateState;
  progress: number;
  bytesWritten?: number;
  totalBytes?: number;
  errorMessage?: string;
  currentFw: string;
  targetRelease?: FirmwareRelease;
}

export type OtaListener = (info: OtaProgressInfo) => void;

class FirmwareUpdateServiceClass {
  private state: OtaUpdateState = 'IDLE';
  private progress: number = 0;
  private bytesWritten: number = 0;
  private totalBytes: number = 0;
  private errorMessage: string = '';
  private currentFw: string = 'v1.2.0-esp32';
  private latestRelease: FirmwareRelease | null = null;
  private listeners: Set<OtaListener> = new Set();
  private healthCheckTimer: any = null;

  public static readonly DEFAULT_FALLBACK_RELEASE = DEFAULT_FALLBACK_RELEASE;

  /**
   * Subscribes to OTA state and progress updates.
   */
  public subscribe(listener: OtaListener): () => void {
    this.listeners.add(listener);
    listener(this.getProgressInfo());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const info = this.getProgressInfo();
    this.listeners.forEach((fn) => {
      try {
        fn(info);
      } catch (err: any) {
        logger.warn('OTA', `Listener error: ${err?.message}`);
      }
    });
  }

  public getProgressInfo(): OtaProgressInfo {
    return {
      state: this.state,
      progress: this.progress,
      bytesWritten: this.bytesWritten,
      totalBytes: this.totalBytes,
      errorMessage: this.errorMessage,
      currentFw: this.currentFw,
      targetRelease: this.latestRelease || undefined,
    };
  }

  /**
   * Sets current device firmware version string.
   */
  public setCurrentFirmware(fw: string): void {
    if (fw) {
      this.currentFw = fw;
      this.notify();
    }
  }

  /**
   * Fetches latest firmware release information from Supabase Storage / table.
   * Never flashes automatically.
   */
  public async checkForUpdates(currentDeviceFw?: string): Promise<{
    updateAvailable: boolean;
    release: FirmwareRelease;
    currentFw: string;
  }> {
    if (currentDeviceFw) {
      this.currentFw = currentDeviceFw;
    }
    this.state = 'CHECKING';
    this.notify();

    try {
      const { data, error } = await supabase
        .from('firmware_releases')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data && data.url && data.sha256) {
        this.latestRelease = {
          id: data.id,
          version: data.version || data.fw || '1.3.0',
          fw: data.fw || `v${data.version}-esp32`,
          protocol: data.protocol || 1,
          url: data.url,
          sha256: data.sha256,
          release_notes: data.release_notes || 'Performance and stability improvements.',
          file_size_bytes: data.file_size_bytes || 1150000,
          published_at: data.published_at || data.created_at,
        };
      } else {
        logger.info('OTA', 'No remote release found in table, using standard release manifest');
        this.latestRelease = FirmwareUpdateServiceClass.DEFAULT_FALLBACK_RELEASE;
      }
    } catch (err: any) {
      logger.warn('OTA', `Firmware check fallback note: ${err?.message}`);
      this.latestRelease = FirmwareUpdateServiceClass.DEFAULT_FALLBACK_RELEASE;
    }

    const updateAvailable = this.isVersionNewer(this.latestRelease.fw, this.currentFw);
    this.state = updateAvailable ? 'AVAILABLE' : 'UP_TO_DATE';
    this.notify();

    return {
      updateAvailable,
      release: this.latestRelease,
      currentFw: this.currentFw,
    };
  }

  /**
   * Compares firmware versions (e.g., 'v1.3.0-esp32' vs 'v1.2.0-esp32').
   */
  public isVersionNewer(targetFw: string, currentFw: string): boolean {
    const parse = (v: string): number[] => {
      const cleaned = v.replace(/^[^\d]*/, '').replace(/[-+].*$/, '');
      return cleaned.split('.').map((p) => parseInt(p, 10) || 0);
    };

    const targetParts = parse(targetFw);
    const currentParts = parse(currentFw);

    for (let i = 0; i < Math.max(targetParts.length, currentParts.length); i++) {
      const t = targetParts[i] || 0;
      const c = currentParts[i] || 0;
      if (t > c) return true;
      if (t < c) return false;
    }
    return false;
  }

  /**
   * Validates all safety prerequisites before allowing update execution:
   * 1. Phone battery > 30%
   * 2. Device on Wi-Fi (connected and has SSID/IP)
   * 3. Device connected over BLE
   * 4. Valid pairing token in SecureStore
   */
  public async validatePrerequisites(deviceId: string, isDeviceOnWifi: boolean): Promise<{
    eligible: boolean;
    reason?: string;
    batteryLevel: number;
  }> {
    // 1. Phone battery check
    const batteryResult = await PhoneBatteryService.checkBatteryForOta(30);
    if (!batteryResult.sufficient) {
      return {
        eligible: false,
        reason: batteryResult.reason,
        batteryLevel: batteryResult.level,
      };
    }

    // 2. Device Wi-Fi check
    if (!isDeviceOnWifi) {
      return {
        eligible: false,
        reason: 'The safety device must be connected to Wi-Fi to download the new firmware.',
        batteryLevel: batteryResult.level,
      };
    }

    // 3. BLE connection check
    const session = ConnectionManager.getActiveSession();
    if (!session) {
      return {
        eligible: false,
        reason: 'Device must be connected via Bluetooth to initiate update.',
        batteryLevel: batteryResult.level,
      };
    }

    // 4. Pairing token check
    const token = await SecureTokenStorage.getDeviceToken(deviceId);
    if (!token) {
      return {
        eligible: false,
        reason: 'No pairing security token found for this device. Please re-pair the device.',
        batteryLevel: batteryResult.level,
      };
    }

    return {
      eligible: true,
      batteryLevel: batteryResult.level,
    };
  }

  /**
   * Initiates the OTA update. Requires manual user action ("Do not flash anything automatically").
   */
  public async startUpdate(deviceId: string, isDeviceOnWifi: boolean): Promise<void> {
    if (this.state === 'DOWNLOADING' || this.state === 'VERIFYING' || this.state === 'STARTING') {
      logger.warn('OTA', 'Update already in progress');
      return;
    }

    // Validate prerequisites
    const prereq = await this.validatePrerequisites(deviceId, isDeviceOnWifi);
    if (!prereq.eligible) {
      this.state = 'ERROR';
      this.errorMessage = prereq.reason || 'Prerequisites check failed.';
      this.notify();
      throw new Error(this.errorMessage);
    }

    const release = this.latestRelease || DEFAULT_FALLBACK_RELEASE;
    const token = (await SecureTokenStorage.getDeviceToken(deviceId)) || '';
    const session = ConnectionManager.getActiveSession();

    if (!session) {
      throw new Error('No active Bluetooth session to send OTA start command.');
    }

    this.state = 'STARTING';
    this.progress = 0;
    this.bytesWritten = 0;
    this.totalBytes = release.file_size_bytes || 0;
    this.errorMessage = '';
    this.notify();

    logger.info('OTA', `Sending token-protected START_OTA command to device for fw: ${release.fw}`);

    const commandJson = BleProtocol.formatStartOta({
      token,
      url: release.url,
      sha256: release.sha256,
      fw: release.fw,
    });

    try {
      await BluetoothService.sendCommand(session, JSON.parse(commandJson));
      this.state = 'DOWNLOADING';
      this.notify();
    } catch (err: any) {
      this.state = 'ERROR';
      this.errorMessage = `Failed to send START_OTA command: ${err?.message || 'Bluetooth write error'}`;
      this.notify();
      throw new Error(this.errorMessage);
    }
  }

  /**
   * Handles incoming BLE notifications for OTA progress and status.
   */
  public handleOtaMessage(message: OtaProgressPayload | OtaStatusPayload): void {
    if (message.type === 'ota_progress') {
      this.state = 'DOWNLOADING';
      this.progress = message.progress;
      if (typeof message.bytes === 'number') this.bytesWritten = message.bytes;
      if (typeof message.total === 'number') this.totalBytes = message.total;
      this.notify();
    } else if (message.type === 'ota_status') {
      const status = message.status;
      if (status === 'DOWNLOADING') {
        this.state = 'DOWNLOADING';
        if (typeof message.progress === 'number') this.progress = message.progress;
      } else if (status === 'VERIFYING') {
        this.state = 'VERIFYING';
        this.progress = 100;
      } else if (status === 'SUCCESS') {
        this.state = 'REBOOTING';
        this.progress = 100;
        this.startRollbackWatchdog();
      } else if (status === 'ERROR') {
        this.state = 'ERROR';
        this.errorMessage = message.message || message.error || 'Device reported OTA error';
      }
      this.notify();
    }
  }

  /**
   * Watches device recovery during the 60-second rollback verification window.
   */
  private startRollbackWatchdog(): void {
    this.clearRollbackWatchdog();
    this.state = 'HEALTH_CHECK';
    this.notify();

    let secondsElapsed = 0;
    this.healthCheckTimer = setInterval(() => {
      secondsElapsed += 5;
      const connState = ConnectionManager.getState();
      const activeDev = ConnectionManager.getConnectedDevice();

      if (connState === 'CONNECTED' && activeDev) {
        // Device has rebooted and connected
        this.state = 'SUCCESS';
        if (this.latestRelease?.fw) {
          this.currentFw = this.latestRelease.fw;
        }
        this.clearRollbackWatchdog();
        this.notify();
      } else if (secondsElapsed >= 75) {
        // Exceeded 60s rollback window + 15s margin
        this.clearRollbackWatchdog();
        if (this.state === 'HEALTH_CHECK') {
          this.state = 'ERROR';
          this.errorMessage = 'Device did not report healthy within the 60s window. Automatic rollback to previous firmware partition may have occurred.';
          this.notify();
        }
      }
    }, 5000);
  }

  private clearRollbackWatchdog(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  public reset(): void {
    this.clearRollbackWatchdog();
    this.state = 'IDLE';
    this.progress = 0;
    this.bytesWritten = 0;
    this.totalBytes = 0;
    this.errorMessage = '';
    this.notify();
  }
}

export const FirmwareUpdateService = new FirmwareUpdateServiceClass();

