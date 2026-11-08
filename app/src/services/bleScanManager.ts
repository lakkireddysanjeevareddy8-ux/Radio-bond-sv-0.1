import { Platform } from 'react-native';
import { BluetoothService, DiscoveredBleDevice } from './bluetoothService';
import { NativeBluetoothService, DiscoveredNativeDevice } from './nativeBluetoothService';
import { ConnectionManager } from './ConnectionManager';

export interface ScanOptions {
  onDeviceFound: (device: DiscoveredBleDevice) => void;
  onError: (error: Error) => void;
  onTimeout?: () => void;
  targetNamePrefix?: string;
  triggerSource?: 'mount' | 'button' | 'refresh' | 'radar' | 'resume' | 'bt_state' | string;
}

export type ScanListener = (isScanning: boolean) => void;
export type CooldownListener = (secondsRemaining: number) => void;

/**
 * BleScanManager: Single Source of Truth for BLE Device Scanning.
 *
 * Guarantees:
 * - Only 1 scan runs at any time across the entire application.
 * - Enforces Android's rolling 30-second window quota (max 4 scan starts per 30s to stay under Android's 5 limit).
 * - Automatic 12-second timeout.
 * - Stops immediately when target device (WSG-01) is found.
 * - Stops in all exit paths: unmount, back navigation, app backgrounding, connecting, or error.
 * - Debounces and provides real-time cooldown countdown.
 */
export class BleScanManager {
  private static isScanning: boolean = false;
  private static scanStartTimestamps: number[] = [];
  private static timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private static cooldownTicker: ReturnType<typeof setInterval> | null = null;
  private static scanListeners: Set<ScanListener> = new Set();
  private static cooldownListeners: Set<CooldownListener> = new Set();

  private static readonly WINDOW_MS = 30000; // 30 seconds rolling window
  private static readonly MAX_SCANS_IN_WINDOW = 4; // Stay safely under Android limit of 5
  public static readonly SCAN_TIMEOUT_MS = 12000; // 12 seconds auto-stop

  public static getIsScanning(): boolean {
    return this.isScanning;
  }

  /**
   * Returns how many seconds remain before another scan is permitted under the 4-per-30s rule.
   * Returns 0 if scanning is currently allowed.
   */
  public static getCooldownSeconds(): number {
    const now = Date.now();
    // Clean up timestamps outside the rolling 30-second window
    this.scanStartTimestamps = this.scanStartTimestamps.filter((t) => now - t < this.WINDOW_MS);

    if (this.scanStartTimestamps.length >= this.MAX_SCANS_IN_WINDOW) {
      const oldest = this.scanStartTimestamps[0];
      const remainingMs = this.WINDOW_MS - (now - oldest);
      return Math.max(0, Math.ceil(remainingMs / 1000));
    }

    return 0;
  }

  public static recordScanStart(): void {
    const now = Date.now();
    this.scanStartTimestamps = this.scanStartTimestamps.filter((t) => now - t < this.WINDOW_MS);
    this.scanStartTimestamps.push(now);
    this.startCooldownTickerIfNeeded();
  }

  private static startCooldownTickerIfNeeded(): void {
    const cooldown = this.getCooldownSeconds();
    if (cooldown <= 0) {
      if (this.cooldownTicker) {
        clearInterval(this.cooldownTicker);
        this.cooldownTicker = null;
      }
      this.notifyCooldownListeners(0);
      return;
    }

    this.notifyCooldownListeners(cooldown);

    if (!this.cooldownTicker) {
      this.cooldownTicker = setInterval(() => {
        const remaining = this.getCooldownSeconds();
        this.notifyCooldownListeners(remaining);
        if (remaining <= 0) {
          if (this.cooldownTicker) {
            clearInterval(this.cooldownTicker);
            this.cooldownTicker = null;
          }
        }
      }, 1000);
    }
  }

  public static subscribeScanning(listener: ScanListener): () => void {
    this.scanListeners.add(listener);
    listener(this.isScanning);
    return () => {
      this.scanListeners.delete(listener);
    };
  }

  public static subscribeCooldown(listener: CooldownListener): () => void {
    this.cooldownListeners.add(listener);
    listener(this.getCooldownSeconds());
    return () => {
      this.cooldownListeners.delete(listener);
    };
  }

  private static notifyScanningListeners(scanning: boolean): void {
    try {
      ConnectionManager.setScanning(scanning);
    } catch (e) {
      console.warn('[scan] setScanning error:', e);
    }
    this.scanListeners.forEach((fn) => {
      try {
        fn(scanning);
      } catch (e) {
        console.warn('[scan] listener error:', e);
      }
    });
  }

  private static notifyCooldownListeners(seconds: number): void {
    this.cooldownListeners.forEach((fn) => {
      try {
        fn(seconds);
      } catch (e) {
        console.warn('[scan] cooldown listener error:', e);
      }
    });
  }

  /**
   * Always safe to call: stops active scan and clears timer.
   */
  public static async stopScan(reason = 'manual'): Promise<void> {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }

    if (!this.isScanning) {
      return;
    }

    console.log(`[scan] stop: ${reason}`);
    this.isScanning = false;
    this.notifyScanningListeners(false);

    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      try {
        NativeBluetoothService.stopScan();
      } catch (e) {
        console.warn('[scan] stopScan error:', e);
      }
    }
  }

  /**
   * Main scan entry point. All triggers (mount, resume, button, refresh, radar) MUST call this.
   */
  public static async startScan(options: ScanOptions): Promise<boolean> {
    const source = options.triggerSource || 'manual';

    // 1. Guard against concurrent scans
    if (this.isScanning) {
      console.log(`[scan] start ignored: already scanning (source: ${source})`);
      return false;
    }

    // 2. Cooldown guard: 4 scans per 30 seconds
    const cooldownSec = this.getCooldownSeconds();
    if (cooldownSec > 0) {
      console.log(`[scan] throttled: Please wait ${cooldownSec}s before scanning again (source: ${source})`);
      this.startCooldownTickerIfNeeded();
      options.onError(new Error(`THROTTLED:${cooldownSec}`));
      return false;
    }

    // 3. Web Auto-scan guard: Web Bluetooth cannot scan in background without user gesture
    if (Platform.OS === 'web' && (source === 'mount' || source === 'resume' || source === 'bt_state')) {
      console.log(`[scan] auto-scan skipped on web (requires user gesture, source: ${source})`);
      this.isScanning = false;
      this.notifyScanningListeners(false);
      return false;
    }

    // 4. Preflight: Bluetooth ON
    const isAvail = await BluetoothService.isBluetoothAvailable();
    if (!isAvail) {
      console.log(`[scan] error: Bluetooth is disabled (source: ${source})`);
      options.onError(new Error('BLUETOOTH_DISABLED'));
      return false;
    }

    // 4. Preflight: Runtime Permissions
    if (Platform.OS !== 'web') {
      const hasPerm = await NativeBluetoothService.requestPermissions();
      if (!hasPerm) {
        console.log(`[scan] error: Bluetooth permissions not granted (source: ${source})`);
        options.onError(new Error('PERMISSION_DENIED'));
        return false;
      }
    }

    // 5. Ensure any previous native scan is fully stopped
    await this.stopScan('pre-start cleanup');

    // 6. Record timestamp for rolling window
    this.recordScanStart();
    console.log(
      `[scan] start (attempt ${this.scanStartTimestamps.length}/${this.MAX_SCANS_IN_WINDOW} in 30s window, source: ${source})`
    );
    this.isScanning = true;
    this.notifyScanningListeners(true);

    // 7. Auto-stop timer: 12 seconds
    this.timeoutTimer = setTimeout(async () => {
      console.log('[scan] timeout: 12s scan window expired');
      await this.stopScan('12s timeout expired');
      options.onTimeout?.();
    }, this.SCAN_TIMEOUT_MS);

    // 8. Platform scan invocation
    if (Platform.OS !== 'web') {
      const runNativeScan = async () => {
        await NativeBluetoothService.startScan(
          async (nativeDev) => {
            const lowerName = (nativeDev.name || '').toLowerCase();
            const isTarget =
              lowerName.startsWith('wsg') ||
              lowerName.includes('washroom') ||
              lowerName.includes('safeguard');

            // If WSG-01 target device is found, auto-stop immediately
            if (isTarget) {
              console.log(`[scan] target device found: "${nativeDev.name}", auto-stopping scan immediately`);
              await BleScanManager.stopScan('target device found');
            }

            options.onDeviceFound({
              ...nativeDev,
              isNative: true,
            });
          },
          async (err) => {
            console.warn('[scan] native scan error callback:', err.message);
            await BleScanManager.stopScan('scan error');
            options.onError(err);
          },
          {
            targetNamePrefix: options.targetNamePrefix || 'WSG-01',
            timeoutMs: this.SCAN_TIMEOUT_MS,
          }
        );
      };

      try {
        await runNativeScan();
      } catch (err: any) {
        console.log('[scan] error during native startDeviceScan:', err?.message || err);
        await this.stopScan('error on start');

        // Catch Android rate limit / registration failure and attempt one automatic retry after 1s
        const msg = String(err?.message || '').toLowerCase();
        if (
          msg.includes('cannot start') ||
          msg.includes('registration_failed') ||
          msg.includes('scan_failed')
        ) {
          console.log('[scan] waiting 1s before auto-retrying scan once...');
          await new Promise((r) => setTimeout(r, 1000));
          const retryCooldown = this.getCooldownSeconds();
          if (retryCooldown === 0) {
            try {
              this.recordScanStart();
              console.log(
                `[scan] start (retry attempt ${this.scanStartTimestamps.length}/${this.MAX_SCANS_IN_WINDOW})`
              );
              this.isScanning = true;
              this.notifyScanningListeners(true);
              await runNativeScan();
              return true;
            } catch (retryErr: any) {
              console.log('[scan] error on retry attempt:', retryErr?.message || retryErr);
              await this.stopScan('retry failed');
              options.onError(new Error('SCAN_LIMIT_REACHED'));
              return false;
            }
          } else {
            options.onError(new Error('SCAN_LIMIT_REACHED'));
            return false;
          }
        } else {
          options.onError(err);
          return false;
        }
      }
    } else {
      // Web platform (user-gesture browser device chooser)
      try {
        const found = await BluetoothService.scanNearbyDevices();
        await this.stopScan('web chooser finished');
        if (found) {
          options.onDeviceFound(found);
        } else {
          options.onTimeout?.();
        }
      } catch (webErr: any) {
        await this.stopScan('web error');
        options.onError(webErr);
      }
    }

    return true;
  }
}
