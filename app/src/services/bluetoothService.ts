import { Platform, Linking } from 'react-native';
import { ProductDefinition, PRODUCT_CATALOG } from './productCatalog';
import { NativeBluetoothService } from './nativeBluetoothService';

export interface DiscoveredBleDevice {
  id: string;
  name: string;
  rssi?: number;
  serviceUuids?: string[];
  rawDevice: any;
  product: ProductDefinition;
  isNative?: boolean;
}

export interface BleCharacteristicWrapper {
  uuid: string;
  writeValue(bytes: Uint8Array | string): Promise<void>;
  writeValueWithResponse?(bytes: Uint8Array | string): Promise<void>;
  readValue(): Promise<Uint8Array>;
  monitor?(listener: (data: Uint8Array) => void): () => void;
}

export interface ConnectedBleSession {
  device: DiscoveredBleDevice;
  server: any;
  service: any;
  provisionChar: BleCharacteristicWrapper | any;
  statusChar?: BleCharacteristicWrapper | any;
  connectedAt: Date;
  isNative?: boolean;
}

export type BluetoothAdapterState = 'on' | 'off' | 'unauthorized' | 'unsupported' | 'unknown';

export type BluetoothErrorCode =
  | 'BLUETOOTH_UNAVAILABLE'
  | 'BLUETOOTH_DISABLED'
  | 'PERMISSION_DENIED'
  | 'PERMISSION_BLOCKED'
  | 'NO_DEVICE_FOUND'
  | 'DEVICE_NOT_FOUND'
  | 'CONNECTION_FAILED'
  | 'GATT_DISCOVERY_FAILED'
  | 'SERVICE_NOT_FOUND'
  | 'CHARACTERISTIC_NOT_FOUND'
  | 'USER_CANCELLED'
  | 'UNKNOWN_ERROR';

export class BluetoothError extends Error {
  public code: BluetoothErrorCode;
  constructor(code: BluetoothErrorCode, message: string) {
    super(message);
    this.name = 'BluetoothError';
    this.code = code;
  }
}

// In-memory developer simulation state (strictly disabled in production)
let fakeBluetoothOffState = false;

/**
 * Safety check: fake simulation is strictly restricted to development mode (__DEV__).
 * Never allow fake Bluetooth behavior to accidentally ship as production behavior.
 */
export const isFakeBluetoothOffEnabled = (): boolean => {
  try {
    return Boolean(typeof __DEV__ !== 'undefined' && __DEV__ && fakeBluetoothOffState);
  } catch {
    return false;
  }
};

export class BluetoothService {
  private static listeners: Set<(state: BluetoothAdapterState) => void> = new Set();
  private static nativeUnsub: (() => void) | null = null;

  /**
   * Set fake Bluetooth OFF simulation state.
   * Only active when __DEV__ is true.
   */
  public static setFakeBluetoothOff(enabled: boolean): void {
    fakeBluetoothOffState = Boolean(enabled);
    this.notifyListeners();
  }

  /**
   * Check if fake Bluetooth OFF simulation is currently active.
   */
  public static isFakeBluetoothOff(): boolean {
    return isFakeBluetoothOffEnabled();
  }

  /**
   * Queries the REAL operating-system Bluetooth adapter state.
   * On Android / iOS: queries real native Bluetooth radio state via BLE manager.
   * On Web / Windows: queries Web Bluetooth getAvailability() and Windows adapter status.
   */
  public static async getRealBluetoothState(): Promise<BluetoothAdapterState> {
    // 1. Real Native Mobile (Android / iOS)
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      try {
        const nativeState = await NativeBluetoothService.getState();
        return nativeState;
      } catch (err) {
        console.warn('[BluetoothService] Real native state query error:', err);
        return 'off';
      }
    }

    // 2. Real Web / Windows Desktop
    if (typeof navigator === 'undefined') return 'unsupported';
    const bluetooth = (navigator as any)?.bluetooth;
    if (!bluetooth) return 'unsupported';

    if (bluetooth.getAvailability) {
      try {
        const isAvail = await bluetooth.getAvailability();
        if (!isAvail) return 'off';
        // Web Bluetooth getAvailability() indicates only adapter hardware presence, NOT whether
        // the user has the physical radio toggled ON in Windows Action Center, nor does it allow
        // background scanning without a user gesture. We safely report 'unknown' to prompt user verification.
        return 'unknown';
      } catch (err) {
        console.warn('[BluetoothService] Real web availability query note:', err);
        return 'off';
      }
    }

    return 'unknown';
  }

  /**
   * Central effective Bluetooth state function (Requirement D).
   *
   * Logic:
   * if (fakeBluetoothOff === true) {
   *     return "off";
   * }
   * return REAL_OS_BLUETOOTH_STATE;
   *
   * Every Bluetooth connection/scan flow must use this effective state.
   */
  public static async getEffectiveBluetoothState(): Promise<BluetoothAdapterState> {
    // A. If developer fake Bluetooth OFF simulation is active (dev-only), immediately return "off"
    if (isFakeBluetoothOffEnabled()) {
      return 'off';
    }

    // B. Otherwise, query and return the REAL OS Bluetooth adapter state
    return await this.getRealBluetoothState();
  }

  /**
   * Checks if effective Bluetooth state is usable for scanning.
   */
  public static async isBluetoothAvailable(): Promise<boolean> {
    const effectiveState = await this.getEffectiveBluetoothState();
    return effectiveState === 'on' || (Platform.OS === 'web' && effectiveState === 'unknown');
  }

  /**
   * Subscribe to effective Bluetooth state transitions.
   * Fires whenever real OS Bluetooth toggles or when fake simulation is toggled in dev.
   */
  public static addBluetoothStateListener(
    listener: (state: BluetoothAdapterState) => void
  ): () => void {
    this.listeners.add(listener);

    // Setup native subscription if not already active
    if (!this.nativeUnsub && (Platform.OS === 'android' || Platform.OS === 'ios')) {
      this.nativeUnsub = NativeBluetoothService.onStateChange(() => {
        this.notifyListeners();
      });
    }

    // Emit current state immediately to the new listener
    this.getEffectiveBluetoothState().then((initialState) => {
      try {
        listener(initialState);
      } catch {}
    });

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all registered listeners of effective Bluetooth state changes.
   */
  public static async notifyListeners(): Promise<void> {
    const effectiveState = await this.getEffectiveBluetoothState();
    this.listeners.forEach((fn) => {
      try {
        fn(effectiveState);
      } catch (e) {
        console.warn('[BluetoothService] Listener error:', e);
      }
    });
  }

  /**
   * Request Bluetooth scanning and connection permissions.
   */
  public static async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      return await NativeBluetoothService.requestPermissions();
    }
    return true; // Web uses user-gesture browser permission prompt
  }

  /**
   * Prompts OS (Android Mobile/Tablet, iOS Mobile/Tablet, Windows Desktop) to open Bluetooth settings if disabled.
   */
  public static openSystemBluetoothSettings(): void {
    // 1. Native Android & iOS
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      NativeBluetoothService.openSettings();
      return;
    }

    // 2. Web on Mobile / Tablet / Desktop
    if (typeof window !== 'undefined') {
      const userAgent = (navigator.userAgent || '').toLowerCase();
      const isAndroidWeb = /android/i.test(userAgent);
      const isIosWeb = /iphone|ipad|ipod/i.test(userAgent);

      if (isAndroidWeb) {
        try {
          window.location.href = 'intent:#Intent;action=android.settings.BLUETOOTH_SETTINGS;end;';
          return;
        } catch {}
      }

      if (isIosWeb) {
        try {
          window.location.href = 'App-Prefs:Bluetooth';
          return;
        } catch {}
      }

      // 3. Windows Desktop & local bridge fallback
      try {
        fetch('http://127.0.0.1:5005/open?target=bluetooth').catch(() => {});
      } catch {}

      try {
        const a = document.createElement('a');
        a.href = 'ms-settings:bluetooth';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch {}
    }
  }

  /**
   * Continuous device scanner: emits discovered devices as they advertise.
   */
  public static async startDeviceScan(
    onDeviceFound: (device: DiscoveredBleDevice) => void,
    onError: (error: Error) => void,
    options?: { serviceUuids?: string[]; timeoutMs?: number; targetNamePrefix?: string }
  ): Promise<void> {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      await NativeBluetoothService.startScan(
        (nativeDev) => {
          onDeviceFound({
            ...nativeDev,
            isNative: true,
          });
        },
        onError,
        options
      );
      return;
    }

    // Web cannot do background continuous scans; user must invoke scanNearbyDevices()
    onError(new Error('Continuous scanning without user interaction is not supported by Web Bluetooth.'));
  }

  /**
   * Stop active scanner.
   */
  public static stopScan(): void {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      NativeBluetoothService.stopScan();
    }
  }

  /**
   * Performs genuine Bluetooth Low Energy discovery specifically targeting the WSG-01 product.
   */
  public static async scanForProduct(product: ProductDefinition): Promise<DiscoveredBleDevice> {
    const isAvail = await this.isBluetoothAvailable();
    if (!isAvail) {
      this.openSystemBluetoothSettings();
      throw new BluetoothError('BLUETOOTH_DISABLED', 'Bluetooth is turned off.');
    }

    // Native Android / iOS BLE discovery
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      return new Promise<DiscoveredBleDevice>((resolve, reject) => {
        let isResolved = false;

        const timeoutId = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            NativeBluetoothService.stopScan();
            reject(
              new BluetoothError(
                'NO_DEVICE_FOUND',
                `No ${product.name} detected. Ensure device is powered on and in pairing range.`
              )
            );
          }
        }, 12000);

        NativeBluetoothService.startScan(
          (device) => {
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeoutId);
              NativeBluetoothService.stopScan();
              resolve({
                ...device,
                isNative: true,
              });
            }
          },
          (err) => {
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeoutId);
              reject(err);
            }
          },
          {
            serviceUuids: [product.bleServiceUuid],
            targetNamePrefix: 'WSG-01',
            timeoutMs: 12000,
          }
        ).catch((err) => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeoutId);
            reject(err);
          }
        });
      });
    }

    // Web Bluetooth path
    return this.scanNearbyDevices();
  }

  /**
   * Fast Pair / Discovery scan:
   * On Web: Prompts user with browser device picker.
   * On Native: Scans for nearby WSG-01 devices and returns first discovered match.
   */
  public static async scanNearbyDevices(): Promise<DiscoveredBleDevice> {
    const isAvailable = await this.isBluetoothAvailable();
    if (!isAvailable) {
      this.openSystemBluetoothSettings();
      throw new BluetoothError('BLUETOOTH_DISABLED', 'Bluetooth is turned off.');
    }

    // Native Mobile
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      const defaultProduct = PRODUCT_CATALOG.find((p) => p.id === 'wsg-01') || PRODUCT_CATALOG[0];
      return this.scanForProduct(defaultProduct);
    }

    // Web Bluetooth API
    const bluetooth = (navigator as any)?.bluetooth;
    if (!bluetooth) {
      throw new BluetoothError(
        'BLUETOOTH_UNAVAILABLE',
        'Bluetooth is not supported in this browser. Please use Chrome on Android or Edge on Windows.'
      );
    }

    let rawDevice: any;
    try {
      rawDevice = await bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          'battery_service',
          'device_information',
          'generic_access',
          'generic_attribute',
          '0000180f-0000-1000-8000-00805f9b34fb',
          '0000180a-0000-1000-8000-00805f9b34fb',
          '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
          '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
        ],
      });
    } catch (err: any) {
      const msg = String(err.message || '').toLowerCase();
      if (msg.includes('user cancelled') || err.name === 'NotFoundError') {
        throw new BluetoothError('USER_CANCELLED', 'Device selection was cancelled.');
      }
      if (msg.includes('adapter') || msg.includes('disabled') || msg.includes('turned off')) {
        this.openSystemBluetoothSettings();
        throw new BluetoothError('BLUETOOTH_DISABLED', 'Bluetooth is turned off.');
      }
      throw err;
    }

    if (!rawDevice) {
      throw new BluetoothError('NO_DEVICE_FOUND', 'No device was selected.');
    }

    const devName = rawDevice.name ? rawDevice.name.trim() : 'Nearby Bluetooth Device';
    const defaultProduct = PRODUCT_CATALOG.find((p) => p.id === 'wsg-01') || PRODUCT_CATALOG[0];

    return {
      id: rawDevice.id || `ble-${Math.random().toString(36).substring(2, 9)}`,
      name: devName,
      rssi: -45,
      rawDevice,
      product: {
        ...defaultProduct,
        name: devName,
      },
      isNative: false,
    };
  }

  /**
   * Enumerate paired audio/Bluetooth devices on the system (earbuds, headsets, safety gadgets)
   * Only used in Web/Windows desktop environment.
   */
  public static async getSystemBluetoothDevices(): Promise<DiscoveredBleDevice[]> {
    const list: DiscoveredBleDevice[] = [];
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const seen = new Set<string>();
        for (const d of devs) {
          // Strictly exclude microphones and audio inputs; only consider output audio for Windows earbuds mode
          if (d.kind === 'audiooutput') {
            const label = d.label || '';
            const lowerLabel = label.toLowerCase();
            if (
              label &&
              !seen.has(label) &&
              !lowerLabel.includes('mic') &&
              !lowerLabel.includes('array') &&
              !lowerLabel.includes('realtek')
            ) {
              seen.add(label);
              list.push({
                id: d.deviceId || `sys-${Math.random().toString(36).substring(2, 7)}`,
                name: label,
                rssi: -38,
                rawDevice: null,
                product: {
                  id: 'wsg-audio',
                  name: label,
                  model: 'Bluetooth Audio Device',
                  category: 'Safety',
                  image: require('../../assets/wsg01_product.jpg'),
                  tagline: 'Paired System Audio',
                  description: 'Connected Audio / Safety Device',
                  features: [],
                  specs: {} as any,
                  bleServiceUuid: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
                  bleProvisionCharUuid: 'beb5483e-36e1-4688-b7f5-ea07361b26a8',
                  bleStatusCharUuid: 'beb5483e-36e1-4688-b7f5-ea07361b26a9',
                  firmwareFamily: 'ESP32-LD2410C',
                  defaultPort: 80,
                },
                isNative: false,
              });
            }
          }
        }
      } catch {}
    }
    return list;
  }

  /**
   * Connects to the device GATT server smoothly on both Native Mobile and Web.
   */
  public static async connectGatt(
    discovered: DiscoveredBleDevice
  ): Promise<ConnectedBleSession> {
    // 1. Native Mobile GATT connection
    if (discovered.isNative || Platform.OS === 'android' || Platform.OS === 'ios') {
      const nativeSession = await NativeBluetoothService.connectGatt(
        discovered as any,
        discovered.product
      );
      return {
        device: discovered,
        server: nativeSession.server,
        service: nativeSession.service,
        provisionChar: nativeSession.provisionChar,
        statusChar: nativeSession.statusChar,
        connectedAt: nativeSession.connectedAt,
        isNative: true,
      };
    }

    // 2. Web Bluetooth GATT connection
    const raw = discovered.rawDevice;
    let server: any = null;
    let service: any = null;
    let provisionChar: any = null;
    let statusChar: any = null;

    if (raw && raw.gatt) {
      try {
        server = await raw.gatt.connect();
      } catch (gattErr: any) {
        console.warn('Web GATT handshake note:', gattErr);
      }

      if (server && server.connected) {
        try {
          // Strictly verify WSG-01 primary service UUID - NEVER fall back to generic services
          service = await server.getPrimaryService(discovered.product.bleServiceUuid.toLowerCase());
          if (!service) {
            throw new Error(
              `WSG-01 Service Not Found: Device does not expose the required safety service (${discovered.product.bleServiceUuid}).`
            );
          }

          // Strictly verify WSG-01 provisioning characteristic
          provisionChar = await service.getCharacteristic(
            discovered.product.bleProvisionCharUuid.toLowerCase()
          );
          if (!provisionChar) {
            throw new Error(
              `WSG-01 Characteristic Not Found: Required provisioning characteristic (${discovered.product.bleProvisionCharUuid}) was not found.`
            );
          }

          try {
            statusChar = await service.getCharacteristic(
              discovered.product.bleStatusCharUuid.toLowerCase()
            );
          } catch {}
        } catch (servErr: any) {
          console.warn('[WebBLE] Service discovery error:', servErr);
          throw new Error(
            servErr.message || 'WSG-01 GATT service verification failed. Ensure the physical ESP32 device is running WSG-01 firmware.'
          );
        }
      }
    }

    // Uniform wrapper for web characteristics
    const wrapWebChar = (c: any): BleCharacteristicWrapper => ({
      uuid: c.uuid,
      writeValue: async (data: Uint8Array | string) => {
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        if (c.writeValueWithoutResponse) {
          await c.writeValueWithoutResponse(bytes);
        } else {
          await c.writeValue(bytes);
        }
      },
      writeValueWithResponse: async (data: Uint8Array | string) => {
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        if (c.writeValueWithResponse) {
          await c.writeValueWithResponse(bytes);
        } else {
          await c.writeValue(bytes);
        }
      },
      readValue: async () => {
        const dataView: DataView = await c.readValue();
        return new Uint8Array(dataView.buffer);
      },
    });

    return {
      device: discovered,
      server,
      service,
      provisionChar: provisionChar ? wrapWebChar(provisionChar) : provisionChar,
      statusChar: statusChar ? wrapWebChar(statusChar) : undefined,
      connectedAt: new Date(),
      isNative: false,
    };
  }

  /**
   * Safely disconnects a GATT session.
   */
  public static disconnect(session: ConnectedBleSession | null): void {
    if (!session) return;

    if (session.isNative) {
      NativeBluetoothService.disconnect(session as any);
      return;
    }

    try {
      if (session.server && session.server.connected) {
        session.server.disconnect();
      }
    } catch (e) {
      console.warn('Error disconnecting Web BLE GATT:', e);
    }
  }
}

// Attach to window in development mode for easy developer console testing
if (typeof window !== 'undefined' && typeof __DEV__ !== 'undefined' && __DEV__) {
  (window as any).BluetoothService = BluetoothService;
}
