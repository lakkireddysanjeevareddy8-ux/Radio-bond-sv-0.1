import { Platform, Linking } from 'react-native';
import { ProductDefinition, PRODUCT_CATALOG } from './productCatalog';
import { NativeBluetoothService, base64ToBytes, bytesToBase64 } from './nativeBluetoothService';
import { EscalationLogEntry, EscalationConfig, EmergencyEvent } from '../types';
import { useAppStore } from '../store/useAppStore';
import { useConnectionStore } from '../store/useConnectionStore';
import { EmergencyPushService } from './EmergencyPushService';
import { storage } from '../utils/storage';
import { logger } from '../utils/logger';
import { BleProtocol, parseBleMessage, BLE_UUIDS, BLE_ERROR_CODES } from './protocol';

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
  eventLogChar?: BleCharacteristicWrapper | any;
  configChar?: BleCharacteristicWrapper | any;
  connectedAt: Date;
  isNative?: boolean;
}

export type BluetoothAdapterState = 'on' | 'off' | 'unauthorized' | 'unsupported' | 'unknown';

export type BluetoothErrorCode =
  | 'BLUETOOTH_UNAVAILABLE'
  | 'BLUETOOTH_DISABLED'
  | 'BLE_NOT_CONNECTED'
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
  private static lastEffectiveState: BluetoothAdapterState | null = null;
  private static activeSession: ConnectedBleSession | null = null;

  // Active BLE characteristic monitor references to prevent duplicate listeners across rerenders
  private static activeEventMonitorCleanup: (() => void) | null = null;
  private static activeStatusMonitorCleanup: (() => void) | null = null;
  private static activeMonitoredSessionId: string | null = null;
  private static emergencyListeners: Set<(event: EmergencyEvent) => void> = new Set();
  private static notificationListeners: Set<(notification: any, source: 'event' | 'status') => void> = new Set();
  private static lastHandledEmergencyMarker: number = 0;
  private static isInitialBufferBaseline: boolean = true;
  private static incomingBufferByChar: Map<string, string> = new Map();
  private static markerInitialized: boolean = false;

  /**
   * Registers a listener for all incoming parsed BLE notifications (Event and Status).
   */
  public static addNotificationListener(
    listener: (notification: any, source: 'event' | 'status') => void
  ): () => void {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  /**
   * Sends a JSON command to the WSG-01 device over BLE provisionChar (COMMAND characteristic).
   * Masks any sensitive credentials (passwords) from logs.
   */
  public static async sendCommand(
    session: ConnectedBleSession | null | undefined,
    cmdObj: Record<string, any>
  ): Promise<boolean> {
    const targetSession = session || this.activeSession;
    if (!targetSession?.provisionChar) {
      logger.warn('BLE_CMD', `Cannot send command ${cmdObj.cmd}: provisionChar not found`);
      return false;
    }

    const payload = JSON.stringify(cmdObj);
    const sanitized = { ...cmdObj };
    if ('pass' in sanitized) sanitized.pass = '***';
    if ('password' in sanitized) sanitized.password = '***';
    logger.info('BLE_CMD', `Writing command to ${targetSession.device.id}: ${cmdObj.cmd}`, sanitized);

    try {
      const char = targetSession.provisionChar;
      if (typeof char.writeValueWithResponse === 'function') {
        await char.writeValueWithResponse(payload);
      } else {
        await char.writeValue(payload);
      }
      logger.info('BLE_CMD', `Command ${cmdObj.cmd} sent successfully`);
      return true;
    } catch (err: any) {
      logger.error('BLE_CMD', `Failed to send command ${cmdObj.cmd}`, logger.serializeError(err));
      throw err;
    }
  }

  /**
   * Returns the currently active connected BLE session, if any.
   */
  public static getActiveSession(): ConnectedBleSession | null {
    return this.activeSession;
  }

  /**
   * Sets the currently active connected BLE session.
   */
  public static setActiveSession(session: ConnectedBleSession | null): void {
    this.activeSession = session;
  }

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
      if (this.lastEffectiveState === null) {
        this.lastEffectiveState = initialState;
      }
      try {
        listener(initialState);
      } catch { }
    });

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all registered listeners of effective Bluetooth state changes.
   * Only fires when the effective state actually transitions to a new state.
   */
  public static async notifyListeners(): Promise<void> {
    const effectiveState = await this.getEffectiveBluetoothState();
    if (this.lastEffectiveState === effectiveState) {
      return;
    }
    this.lastEffectiveState = effectiveState;
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
        } catch { }
      }

      if (isIosWeb) {
        try {
          window.location.href = 'App-Prefs:Bluetooth';
          return;
        } catch { }
      }

      // 3. Windows Desktop & local bridge fallback
      try {
        fetch('http://127.0.0.1:5005/open?target=bluetooth').catch(() => { });
      } catch { }

      try {
        const a = document.createElement('a');
        a.href = 'ms-settings:bluetooth';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch { }
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
      } catch { }
    }
    return list;
  }

  /**
   * Connects to the device GATT server smoothly on both Native Mobile and Web.
   */
  public static async connectGatt(
    discovered: DiscoveredBleDevice
  ): Promise<ConnectedBleSession> {
    logger.info('BLE_CONN', `connectGatt initiated for ${discovered.name || discovered.id} (${discovered.id})`, {
      id: discovered.id,
      name: discovered.name,
      isNative: discovered.isNative,
    });
    // 1. Native Mobile GATT connection
    if (discovered.isNative || Platform.OS === 'android' || Platform.OS === 'ios') {
      const nativeSession = await NativeBluetoothService.connectGatt(
        discovered as any,
        discovered.product
      );
      const session: ConnectedBleSession = {
        device: discovered,
        server: nativeSession.server,
        service: nativeSession.service,
        provisionChar: nativeSession.provisionChar,
        statusChar: nativeSession.statusChar,
        eventLogChar: nativeSession.eventLogChar,
        configChar: nativeSession.configChar,
        connectedAt: nativeSession.connectedAt,
        isNative: true,
      };
      this.activeSession = session;
      logger.info('BLE_CONN', `Native GATT session created for ${discovered.id}`);
      this.startDeviceEventMonitoring(session);
      return session;
    }

    // 2. Web Bluetooth GATT connection
    const raw = discovered.rawDevice;
    let server: any = null;
    let service: any = null;
    let provisionChar: any = null;
    let statusChar: any = null;
    let eventLogChar: any = null;
    let configChar: any = null;

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
          } catch { }

          try {
            const eventLogUuid = (discovered.product.bleEventLogCharUuid || 'beb5483e-36e1-4688-b7f5-ea07361b26aa').toLowerCase();
            eventLogChar = await service.getCharacteristic(eventLogUuid);
          } catch { }

          try {
            const configUuid = (discovered.product.bleConfigCharUuid || 'beb5483e-36e1-4688-b7f5-ea07361b26ab').toLowerCase();
            configChar = await service.getCharacteristic(configUuid);
          } catch { }
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
        if (c.writeValueWithResponse) {
          await c.writeValueWithResponse(bytes);
        } else if (c.writeValue) {
          await c.writeValue(bytes);
        } else if (c.writeValueWithoutResponse) {
          await c.writeValueWithoutResponse(bytes);
        }
      },
      writeValueWithResponse: async (data: Uint8Array | string) => {
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        if (c.writeValueWithResponse) {
          await c.writeValueWithResponse(bytes);
        } else if (c.writeValue) {
          await c.writeValue(bytes);
        } else if (c.writeValueWithoutResponse) {
          await c.writeValueWithoutResponse(bytes);
        }
      },
      readValue: async () => {
        const dataView: DataView = await c.readValue();
        return new Uint8Array(dataView.buffer);
      },
      monitor: (listener: (data: Uint8Array) => void) => {
        if (c.addEventListener) {
          console.log(`[event] subscribed ${c.uuid}`);
          const handler = (evt: any) => {
            const dv = evt.target?.value;
            if (dv) {
              const bytes = new Uint8Array(dv.buffer);
              const b64 = bytesToBase64(bytes);
              console.log(`[event] raw received ${b64}`);
              listener(bytes);
            }
          };
          c.startNotifications().then(() => {
            c.addEventListener('characteristicvaluechanged', handler);
          }).catch(() => { });
          return () => {
            try {
              c.removeEventListener('characteristicvaluechanged', handler);
              c.stopNotifications().catch(() => { });
            } catch { }
          };
        }
        return () => { };
      },
    });

    if (raw && typeof raw.addEventListener === 'function') {
      try {
        raw.addEventListener('gattserverdisconnected', () => {
          console.log('[conn] Web GATT disconnected event');
          this.activeSession = null;
          try {
            const { ConnectionManager } = require('./ConnectionManager');
            ConnectionManager.handleBleDisconnect(discovered.id, 'Web GATT disconnected');
          } catch {}
        }, { once: true });
      } catch (e) {
        console.warn('[conn] Could not attach gattserverdisconnected:', e);
      }
    }

    const webSession: ConnectedBleSession = {
      device: discovered,
      server,
      service,
      provisionChar: provisionChar ? wrapWebChar(provisionChar) : provisionChar,
      statusChar: statusChar ? wrapWebChar(statusChar) : undefined,
      eventLogChar: eventLogChar ? wrapWebChar(eventLogChar) : undefined,
      configChar: configChar ? wrapWebChar(configChar) : undefined,
      connectedAt: new Date(),
      isNative: false,
    };
    this.activeSession = webSession;
    this.startDeviceEventMonitoring(webSession);
    return webSession;
  }

  /**
   * Reads circular buffer of escalation events over BLE event log characteristic.
   */
  public static async readEscalationLogs(session: ConnectedBleSession | null): Promise<EscalationLogEntry[]> {
    if (!session?.eventLogChar) return [];
    try {
      const bytes: Uint8Array = await session.eventLogChar.readValue();
      const text = new TextDecoder().decode(bytes);
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        return data.map((item: any, idx: number) => ({
          id: item.id || `log-${idx}-${item.timestamp || Date.now()}`,
          timestamp: item.timestamp ? new Date(item.timestamp).toISOString() : new Date().toISOString(),
          fromState: item.from || item.fromState || 'IDLE',
          toState: item.to || item.toState || 'IDLE',
          trigger: item.trigger || 'UNKNOWN',
          stillnessSeconds: Number(item.stillness_seconds || item.stillnessSeconds || 0),
        }));
      }
    } catch (e) {
      console.warn('[BLE] Could not read escalation logs over BLE:', e);
    }
    return [];
  }

  /**
   * Configures T1 threshold, repeat interval, and alarm volume over BLE.
   */
  public static async writeEscalationConfig(
    session: ConnectedBleSession | null,
    config: EscalationConfig
  ): Promise<boolean> {
    if (!session) {
      logger.warn('BLE_CMD', 'writeEscalationConfig failed: no active session');
      return false;
    }
    const payload = BleProtocol.formatSetEscalationConfig({
      t1: config.t1Seconds,
      repeat: config.repeatIntervalSec,
      volume: config.alarmVolume,
    });
    logger.info('BLE_CMD', `Writing escalation config to ${session.device.id}`, config);

    try {
      if (session.configChar) {
        if (session.configChar.writeValueWithResponse) {
          await session.configChar.writeValueWithResponse(payload);
        } else {
          await session.configChar.writeValue(payload);
        }
        logger.info('BLE_CMD', 'writeEscalationConfig succeeded via configChar');
        return true;
      } else if (session.provisionChar) {
        if (session.provisionChar.writeValueWithResponse) {
          await session.provisionChar.writeValueWithResponse(payload);
        } else {
          await session.provisionChar.writeValue(payload);
        }
        logger.info('BLE_CMD', 'writeEscalationConfig succeeded via provisionChar');
        return true;
      }
    } catch (err) {
      logger.error('BLE_CMD', 'Failed to write escalation config', logger.serializeError(err));
      console.error('[BLE] Failed to write escalation config:', err);
    }
    return false;
  }

  /**
   * Reads current escalation config from ESP32 over BLE.
   */
  public static async readEscalationConfig(
    session: ConnectedBleSession | null
  ): Promise<EscalationConfig | null> {
    if (!session?.configChar) {
      logger.warn('BLE_CMD', 'readEscalationConfig failed: configChar not found');
      return null;
    }
    try {
      logger.info('BLE_CMD', `Reading escalation config from ${session.device.id}`);
      const bytes: Uint8Array = await session.configChar.readValue();
      const text = new TextDecoder().decode(bytes);
      const data = JSON.parse(text);
      logger.info('BLE_CMD', 'readEscalationConfig succeeded', data);
      return {
        t1Seconds: Number(data.t1 || 300),
        repeatIntervalSec: Number(data.repeat || 15),
        alarmVolume: Number(data.volume || 80),
      };
    } catch (e) {
      logger.error('BLE_CMD', 'Could not read escalation config over BLE', logger.serializeError(e));
      console.warn('[BLE] Could not read escalation config over BLE:', e);
    }
    return null;
  }

  /**
   * Ensures an active, connected BLE session is available.
   * If an active session exists and is connected, reuses it.
   * Otherwise, attempts to reconnect using the known device ID or fast targeted scan.
   */
  public static async ensureActiveSession(): Promise<ConnectedBleSession> {
    // 1. Check if activeSession exists and is still connected
    if (this.activeSession) {
      if (this.activeSession.server && typeof this.activeSession.server.isConnected === 'function') {
        try {
          const isConn = await this.activeSession.server.isConnected();
          if (isConn) {
            this.startDeviceEventMonitoring(this.activeSession);
            return this.activeSession;
          }
        } catch {
          // connection check failed
        }
      } else if (!this.activeSession.isNative && this.activeSession.server?.connected) {
        this.startDeviceEventMonitoring(this.activeSession);
        return this.activeSession;
      }
    }

    console.log('[WSG-01] No active connected BLE session. Reconnecting to WSG-01...');

    const defaultProduct = PRODUCT_CATALOG.find((p) => p.id === 'wsg-01') || PRODUCT_CATALOG[0];

    // Retrieve previously paired device identifier
    let preferredId: string | undefined;
    try {
      const { useDeviceStore } = require('../store/useDeviceStore');
      const activeDev = useDeviceStore.getState().getActiveDevice();
      if (activeDev?.deviceId && !activeDev.deviceId.startsWith('wsg-01')) {
        preferredId = activeDev.deviceId;
      } else if (useDeviceStore.getState().devices?.[0]?.deviceId) {
        const firstId = useDeviceStore.getState().devices[0].deviceId;
        if (!firstId.startsWith('wsg-01')) {
          preferredId = firstId;
        }
      }
    } catch { }

    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      const nativeSession = await NativeBluetoothService.reconnectOrScan(preferredId, defaultProduct);
      const session: ConnectedBleSession = {
        device: {
          id: nativeSession.device.id,
          name: nativeSession.device.name,
          rssi: nativeSession.device.rssi,
          serviceUuids: nativeSession.device.serviceUuids,
          rawDevice: nativeSession.device.rawDevice,
          product: defaultProduct,
          isNative: true,
        },
        server: nativeSession.server,
        service: nativeSession.service,
        provisionChar: nativeSession.provisionChar,
        statusChar: nativeSession.statusChar,
        eventLogChar: nativeSession.eventLogChar,
        configChar: nativeSession.configChar,
        connectedAt: nativeSession.connectedAt,
        isNative: true,
      };

      this.activeSession = session;
      this.startDeviceEventMonitoring(session);
      return session;
    }

    throw new BluetoothError('BLE_NOT_CONNECTED', 'WSG-01 is not connected. Please reconnect the device.');
  }

  /**
   * Trigger Test Emergency sequence on the device over BLE (authenticated with pairing token).
   * MUST write exclusively to provisionChar (beb5483e-36e1-4688-b7f5-ea07361b26a8).
   */
  public static async triggerTestEmergency(
    session?: ConnectedBleSession | null,
    token: string = 'wsg_secure_token'
  ): Promise<boolean> {
    console.log('[WSG-01] TEST_EMERGENCY BUTTON PRESSED');
    console.log('[TEST DEBUG 2] triggerTestEmergency entered');
    console.log('[TEST DEBUG 3] activeSession exists =', Boolean(this.activeSession));

    let targetSession = session || this.activeSession;

    // Check if current session is still connected
    if (targetSession?.server && typeof targetSession.server.isConnected === 'function') {
      try {
        const isConn = await targetSession.server.isConnected();
        if (!isConn) {
          console.log('[WSG-01] Existing BLE session disconnected. Triggering reconnect...');
          targetSession = null;
        }
      } catch {
        targetSession = null;
      }
    }

    // If no active session, attempt real reconnect
    if (!targetSession) {
      try {
        console.log('[WSG-01] Obtaining/reconnecting BLE GATT session...');
        targetSession = await this.ensureActiveSession();
      } catch (reconnErr: any) {
        console.log('[WSG-01] BLE session state: DISCONNECTED');
        console.error('[WSG-01] BLE WRITE FAILED');
        console.error('[WSG-01] Error:', reconnErr?.message || reconnErr);
        throw new BluetoothError(
          'BLE_NOT_CONNECTED',
          'WSG-01 is not connected. Please reconnect the device.'
        );
      }
    }

    console.log('[TEST DEBUG 4] device ID =', targetSession.device.id);
    let serverConnected = false;
    try {
      serverConnected = targetSession.server && typeof targetSession.server.isConnected === 'function'
        ? await targetSession.server.isConnected()
        : Boolean(targetSession.server?.connected);
    } catch {
      serverConnected = false;
    }
    console.log('[TEST DEBUG 5] server connected =', serverConnected);
    console.log('[TEST DEBUG 6] provisionChar exists =', Boolean(targetSession.provisionChar));

    console.log('[WSG-01] BLE session state: CONNECTED');
    console.log('[WSG-01] Device:', targetSession.device.name);
    console.log('[WSG-01] Device ID:', targetSession.device.id);

    // Ensure event monitoring is actively attached so notifications are captured
    this.startDeviceEventMonitoring(targetSession);

    // CONTRACT RULE: TEST_EMERGENCY MUST ONLY be written to provisionChar
    const targetChar = targetSession.provisionChar;
    if (!targetChar) {
      console.error('[WSG-01] BLE WRITE FAILED');
      console.error('[WSG-01] Error: provisionChar is missing on BLE session');
      throw new BluetoothError(
        'CHARACTERISTIC_NOT_FOUND',
        'WSG-01 command characteristic was not found on device.'
      );
    }

    // Verify characteristic UUID matches contract: beb5483e-36e1-4688-b7f5-ea07361b26a8
    const normTargetUuid = targetChar.uuid.toLowerCase().replace(/[^a-f0-9]/g, '');
    const expectedProvUuid = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'.toLowerCase().replace(/[^a-f0-9]/g, '');
    if (normTargetUuid !== expectedProvUuid) {
      console.error('[WSG-01] BLE WRITE FAILED');
      console.error('[WSG-01] Error: Target characteristic UUID does not match provisionChar contract:', targetChar.uuid);
      throw new BluetoothError(
        'CHARACTERISTIC_NOT_FOUND',
        `Contract violation: Characteristic UUID ${targetChar.uuid} is not provisionChar.`
      );
    }

    console.log('[TEST DEBUG 7] provisionChar UUID =', targetChar.uuid);
    console.log('[WSG-01] Command characteristic:', 'provisionChar');
    console.log('[WSG-01] Command characteristic UUID:', targetChar.uuid);

    const payload = BleProtocol.formatTestEmergency(token);
    const payloadBytes = new TextEncoder().encode(payload);
    console.log('[TEST DEBUG 9] payload byte length =', payloadBytes.length);
    console.log('[WSG-01] Payload:', payload);
    console.log('[WSG-01] Sending TEST_EMERGENCY...');

    logger.info('BLE_CMD', `Sending TEST_EMERGENCY to ${targetSession.device.id}`, {
      deviceId: targetSession.device.id,
      payload,
    });

    try {
      if (typeof targetChar.writeValueWithResponse === 'function') {
        console.log('[TEST DEBUG 8] write method = writeValueWithResponse');
        console.log('[WSG-01] BLE WRITE (writeValueWithResponse)');
        await targetChar.writeValueWithResponse(payload);
      } else {
        console.log('[TEST DEBUG 8] write method = writeValue');
        console.log('[WSG-01] BLE WRITE (writeValue)');
        await targetChar.writeValue(payload);
      }
      logger.info('BLE_CMD', `TEST_EMERGENCY write successful for ${targetSession.device.id}`);
      console.log('[WSG-01] BLE WRITE SUCCESS');
      return true;
    } catch (e: any) {
      logger.error('BLE_CMD', `TEST_EMERGENCY write failed for ${targetSession.device.id}`, logger.serializeError(e));
      console.error('[WSG-01] BLE WRITE FAILED');
      console.error('[WSG-01] Error:', e?.message || e);
      throw e;
    }
  }

  /**
   * Cancel Test Emergency sequence on the device over BLE.
   * MUST write exclusively to provisionChar.
   */
  public static async cancelTestEmergency(
    session?: ConnectedBleSession | null,
    token: string = 'wsg_secure_token'
  ): Promise<boolean> {
    console.log('[WSG-01] CANCEL_TEST requested');
    const targetSession = session || this.activeSession;
    if (!targetSession) {
      console.warn('[WSG-01] No active BLE session available for CANCEL_TEST');
      return false;
    }
    const payload = BleProtocol.formatCancelTest(token);
    try {
      const targetChar = targetSession.provisionChar;
      if (targetChar) {
        if (typeof targetChar.writeValueWithResponse === 'function') {
          await targetChar.writeValueWithResponse(payload);
        } else {
          await targetChar.writeValue(payload);
        }
        return true;
      } else {
        console.error('[WSG-01] provisionChar not found on session for CANCEL_TEST');
      }
    } catch (e) {
      console.error('[WSG-01] Failed to cancel test emergency:', e);
    }
    return false;
  }

  /**
   * Safely decodes incoming BLE notification data from Uint8Array, string, or base64.
   */
  public static decodeBleNotificationData(data: Uint8Array | string | any): string {
    if (!data) return '';
    let str = '';
    if (data instanceof Uint8Array) {
      try {
        str = new TextDecoder('utf-8').decode(data).trim();
      } catch {
        str = String.fromCharCode.apply(null, Array.from(data)).trim();
      }
    } else if (typeof data === 'string') {
      str = data.trim();
    } else if (typeof data === 'object') {
      try {
        return JSON.stringify(data);
      } catch {
        return String(data);
      }
    } else {
      str = String(data).trim();
    }

    // If string is Base64 encoded JSON, decode it to string
    if (str && !str.startsWith('{') && !str.startsWith('[') && /^[A-Za-z0-9+/=]+$/.test(str) && str.length % 4 === 0) {
      try {
        const decodedBytes = base64ToBytes(str);
        const secondStr = new TextDecoder('utf-8').decode(decodedBytes).trim();
        if (secondStr.startsWith('{') || secondStr.startsWith('[')) {
          str = secondStr;
        }
      } catch { }
    }

    return str;
  }

  private static async ensureMarkerLoaded(): Promise<void> {
    if (this.markerInitialized) return;
    this.markerInitialized = true;
    try {
      const saved = await storage.getItem('wsg_last_handled_emergency_marker');
      if (saved) {
        this.lastHandledEmergencyMarker = Number(saved) || 0;
      }
    } catch {}
  }

  /**
   * Processes incoming BLE notifications from Event Characteristic or Status Characteristic.
   */
  private static handleIncomingBleNotification(
    session: ConnectedBleSession,
    data: Uint8Array | string | any,
    source: 'event' | 'status'
  ): void {
    const rawStr = this.decodeBleNotificationData(data);
    if (!rawStr) return;
    console.log('EVENT raw:', rawStr);

    const charKey = `${session.device.id}_${source}`;
    let candidate = rawStr;
    const existingChunk = this.incomingBufferByChar.get(charKey);
    if (existingChunk) {
      candidate = existingChunk + rawStr;
    }

    const msg = parseBleMessage(candidate);
    if (msg.kind === 'malformed') {
      // If it looks like a partial fragment of a JSON object/array, buffer it for next chunk
      if ((candidate.startsWith('{') || candidate.startsWith('[')) && candidate.length < 4096) {
        this.incomingBufferByChar.set(charKey, candidate);
      } else {
        this.incomingBufferByChar.delete(charKey);
      }
      logger.warn('BLE_NOTIF', `Malformed BLE payload on ${source}: ${msg.error}`, { candidate });
      console.log(`[event] parse error ${msg.error} | raw: ${candidate}`);
      return;
    }

    // Valid JSON received, clear the chunk buffer
    this.incomingBufferByChar.delete(charKey);

    const parsed = msg.raw;
    logger.info('BLE_NOTIF', `Parsed notification from ${source}`, parsed);
    console.log(`[event] parsed ${JSON.stringify(parsed)}`);

    // Check for outdated protocol version
    if (msg.kind === 'outdated_protocol') {
      logger.error('DEVICE', `Device firmware update needed: protocol ${msg.protocol} < ${msg.minSupported}`);
      useAppStore.getState().setDeviceError({
        code: 'FW_UPDATE_NEEDED',
        message: 'Device firmware update needed',
        timestamp: new Date().toISOString(),
      });
    }

    // Dispatch to registered notification listeners
    this.notificationListeners.forEach((listener) => {
      try {
        listener(parsed, source);
      } catch (lErr) {
        console.warn('[BLE] Notification listener callback error:', lErr);
      }
    });

    // Device error reporting: check if device returned an error payload
    if (msg.kind === 'device_error') {
      const errCode = String(msg.data.error || msg.data.code || 'DEV-501');
      const errMsg = String(msg.data.message || 'Device reported error');
      logger.error('DEVICE', `Device reported error: [${errCode}] ${errMsg}`, parsed);
      useAppStore.getState().setDeviceError({
        code: errCode,
        message: errMsg,
        timestamp: new Date().toISOString(),
      });
    } else if (!Array.isArray(parsed)) {
      const normType = String(parsed?.type || '').toUpperCase();
      const normStatus = String(parsed?.status || '').toUpperCase();
      if (normType === 'ERROR' || normStatus === 'ERROR' || Boolean(parsed?.error)) {
        const errCode = String(parsed.code || parsed.error || 'DEV-501');
        const errMsg = String(parsed.message || parsed.error || 'Device reported error');
        logger.error('DEVICE', `Device reported error: [${errCode}] ${errMsg}`, parsed);
        useAppStore.getState().setDeviceError({
          code: errCode,
          message: errMsg,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Update real hardware ID if present in status / heartbeat
    const reportedDevId = parsed?.device_id || parsed?.deviceId;
    if (reportedDevId && reportedDevId !== 'WSG-000001') {
      const currentConfig = useAppStore.getState().deviceConfig;
      if (currentConfig && currentConfig.deviceId !== reportedDevId) {
        console.log(`[device] learned real hardware ID from BLE notification: ${reportedDevId}`);
        useAppStore.getState().setDeviceConfig({
          ...currentConfig,
          deviceId: reportedDevId,
        });
        const conn = useConnectionStore.getState().connectedDevice;
        if (conn && conn.id !== reportedDevId) {
          useConnectionStore.setState({
            connectedDevice: { ...conn, id: reportedDevId },
          });
        }
      }
    }

    // A. Array handling: Circular buffer escalation history
    if (Array.isArray(parsed)) {
      const mapped = parsed.map((item: any, idx: number) => ({
        id: item.id || `log-${idx}-${item.timestamp || item.timestampMs || Date.now()}`,
        timestamp: (item.timestamp || item.timestampMs) ? new Date(item.timestamp || item.timestampMs).toISOString() : new Date().toISOString(),
        fromState: item.from || item.fromState || 'IDLE',
        toState: item.to || item.toState || 'IDLE',
        trigger: item.trigger || 'UNKNOWN',
        stillnessSeconds: Number(item.stillness_seconds || item.stillnessSec || item.stillnessSeconds || 0),
      }));
      useAppStore.getState().setEscalationLogs(mapped);

      // Baseline check on initial connection: ignore existing historical buffer
      if (this.isInitialBufferBaseline) {
        const maxTs = Math.max(0, ...parsed.map((item: any) => Number(item.timestamp || item.timestampMs || 0)));
        this.lastHandledEmergencyMarker = Math.max(this.lastHandledEmergencyMarker, maxTs);
        storage.setItem('wsg_last_handled_emergency_marker', String(this.lastHandledEmergencyMarker)).catch(() => {});
        console.log(`[event] ignored (already handled / initial history) - baseline established with ${parsed.length} entries (marker: ${this.lastHandledEmergencyMarker})`);
        this.isInitialBufferBaseline = false;
        return;
      }

      // Check newest entry for new emergency
      if (parsed.length > 0) {
        const newest = parsed[parsed.length - 1];
        const toState = String(newest.to || newest.toState || '').toUpperCase();
        if (toState === 'ALARM' || toState === 'EMERGENCY') {
          const itemTs = Number(newest.timestamp || newest.timestampMs || 0);
          const itemEventId = `emg_${session.device.id}_${itemTs || Date.now()}`;

          if (itemTs > 0 && itemTs <= this.lastHandledEmergencyMarker) {
            console.log(`[event] ignored (already handled / initial history) - timestamp ${itemTs} <= marker ${this.lastHandledEmergencyMarker}`);
            return;
          }

          if (EmergencyPushService.isEventAlreadyProcessed(itemEventId)) {
            console.log(`[event] ignored (already handled / initial history) - event ID ${itemEventId} already processed`);
            return;
          }

          // Mark and persist
          this.lastHandledEmergencyMarker = Math.max(this.lastHandledEmergencyMarker, itemTs);
          storage.setItem('wsg_last_handled_emergency_marker', String(this.lastHandledEmergencyMarker)).catch(() => {});
          EmergencyPushService.markEventProcessed(itemEventId);

          const trigger = String(newest.trigger || 'ALARM');
          const isTestEmergency = trigger.includes('TEST');
          const emergencyEvent: EmergencyEvent = {
            id: itemEventId,
            eventId: itemEventId,
            deviceId: session.device.id,
            deviceName: session.device.name || 'Washroom Safety Guardian',
            type: 'EMERGENCY',
            eventType: 'EMERGENCY',
            trigger: trigger,
            source: isTestEmergency ? 'test' : 'manual_device_trigger',
            severity: 'CRITICAL',
            status: 'ACTIVE',
            timestamp: itemTs ? new Date(itemTs).toISOString() : new Date().toISOString(),
            isTestAlert: isTestEmergency,
            isTest: isTestEmergency,
            presenceDuration: Number(newest.stillness_seconds || newest.stillnessSec || 20),
            metadata: {
              bleReceived: true,
              sourceCharacteristic: source,
              ...newest,
            },
          };

          console.log(`[event] showing emergency UI: ${itemEventId}`);
          EmergencyPushService.handleIncomingPush(emergencyEvent);
          useAppStore.getState().setActiveEmergency(emergencyEvent);
          this.emergencyListeners.forEach((listener) => {
            try { listener(emergencyEvent); } catch (e) { console.warn('[event] listener error:', e); }
          });
          return;
        }
      }
      return;
    }

    // B. Single object handling (TEST_EMERGENCY, Status Characteristic, etc.)
    const normType = String(parsed.type || '').toUpperCase();
    const normStatus = String(parsed.status || '').toUpperCase();
    const normState = String(parsed.state || '').toUpperCase();
    const normEvent = String(parsed.event || '').toUpperCase();

    const isTestEmergency =
      normEvent === 'TEST_EMERGENCY' ||
      normStatus === 'TEST_EMERGENCY' ||
      (normType === 'STATUS' && normStatus === 'TEST_EMERGENCY') ||
      Boolean(parsed.is_test && (normState === 'EMERGENCY' || normStatus === 'EMERGENCY'));

    const isGeneralEmergency =
      normType === 'EMERGENCY' ||
      normStatus === 'EMERGENCY' ||
      normStatus === 'ALARM' ||
      normState === 'EMERGENCY' ||
      normEvent === 'EMERGENCY' ||
      normEvent === 'ALARM';

    if (isTestEmergency || isGeneralEmergency) {
      const devId = parsed.deviceId || parsed.device_id || session.device.id || 'WSG-000001';
      const devName = parsed.deviceName || parsed.name || session.device.name || 'Washroom Safety Guardian';
      const eventTimestamp = parsed.timestamp
        ? (typeof parsed.timestamp === 'number' ? new Date().toISOString() : String(parsed.timestamp))
        : new Date().toISOString();
      const eventId = String(
        parsed.eventId ||
        parsed.event_id ||
        parsed.id ||
        `emg_${devId}_${parsed.timestamp || Date.now()}`
      );

      if (EmergencyPushService.isEventAlreadyProcessed(eventId)) {
        console.log(`[event] ignored (already handled / initial history) - event ID ${eventId} already processed`);
        return;
      }
      EmergencyPushService.markEventProcessed(eventId);

      const trigger = isTestEmergency ? 'TEST' : (parsed.trigger || (parsed.state === 'EMERGENCY' ? 'VOICE' : 'OTHER'));
      const triggerSource = isTestEmergency ? 'device' : (parsed.source || 'manual_device_trigger');

      const emergencyEvent: EmergencyEvent = {
        id: eventId,
        eventId: eventId,
        deviceId: devId,
        deviceName: devName,
        type: 'EMERGENCY',
        eventType: 'EMERGENCY',
        trigger: trigger,
        source: triggerSource as any,
        severity: 'CRITICAL',
        status: 'ACTIVE',
        timestamp: eventTimestamp,
        isTestAlert: isTestEmergency,
        isTest: isTestEmergency,
        presenceDuration: Number(parsed.stillness_seconds || parsed.presenceDuration || 20),
        metadata: {
          bleReceived: true,
          sourceCharacteristic: source,
          ...parsed,
        },
      };

      console.log(`[event] showing emergency UI: ${emergencyEvent.eventId}`);
      EmergencyPushService.handleIncomingPush(emergencyEvent);
      useAppStore.getState().setActiveEmergency(emergencyEvent);

      // Notify any registered external listeners
      this.emergencyListeners.forEach((listener) => {
        try {
          listener(emergencyEvent);
        } catch (e) {
          console.warn('[event] listener error:', e);
        }
      });
    } else if (
      parsed.test_cancelled ||
      normEvent === 'TEST_CANCELLED' ||
      normEvent === 'WSG01_CANCEL' ||
      normType === 'WSG01_CANCEL' ||
      (normStatus === 'OK' && parsed.test_cancelled)
    ) {
      console.log('[WSG BLE EVENT] Emergency cancelled by device notification');
      useAppStore.getState().setActiveEmergency(null);
    }
  }

  /**
   * Starts monitoring WSG-01 Event Characteristic and Status Characteristic.
   * Prevents duplicate subscriptions across rerenders.
   */
  public static startDeviceEventMonitoring(
    session?: ConnectedBleSession | null,
    onEmergency?: (event: EmergencyEvent) => void
  ): (() => void) | null {
    const targetSession = session || this.activeSession;
    if (!targetSession) {
      logger.warn('BLE_MONITOR', 'Cannot start event monitoring: No active BLE session');
      console.warn('[WSG BLE EVENT] Cannot start event monitoring: No active BLE session');
      return null;
    }

    if (onEmergency) {
      this.emergencyListeners.add(onEmergency);
    }

    this.isInitialBufferBaseline = true;
    this.ensureMarkerLoaded().catch(() => {});

    const sessionId = targetSession.device.id + '_' + (targetSession.connectedAt ? targetSession.connectedAt.getTime() : '0');
    if (this.activeMonitoredSessionId === sessionId && this.activeEventMonitorCleanup) {
      logger.info('BLE_MONITOR', `Event monitoring already active for session ${sessionId}`);
      console.log('[WSG BLE EVENT] Event monitoring already active for session:', sessionId);
      return () => {
        if (onEmergency) this.emergencyListeners.delete(onEmergency);
      };
    }

    // Clean up any previous listener before establishing a new one (prevents duplicate listeners)
    this.stopDeviceEventMonitoring();
    this.activeMonitoredSessionId = sessionId;

    logger.info('BLE_MONITOR', `Starting event and status monitors for ${targetSession.device.id}`);
    console.log('[WSG BLE EVENT] Starting event and status characteristic monitors for device:', targetSession.device.id);

    // 1. Subscribe to Event Characteristic (beb5483e-36e1-4688-b7f5-ea07361b26aa)
    if (targetSession.eventLogChar && typeof targetSession.eventLogChar.monitor === 'function') {
      try {
        const unsubEvent = targetSession.eventLogChar.monitor((data: Uint8Array) => {
          this.handleIncomingBleNotification(targetSession, data, 'event');
        });
        this.activeEventMonitorCleanup = unsubEvent;
        logger.info('BLE_MONITOR', `Subscribed to Event Characteristic (${targetSession.eventLogChar.uuid})`);
        console.log(`[event] subscribed ${targetSession.eventLogChar.uuid}`);
      } catch (err) {
        logger.error('BLE_MONITOR', 'Failed to monitor Event Characteristic', logger.serializeError(err));
        console.error('[WSG BLE EVENT] Failed to monitor Event Characteristic:', err);
      }
    } else {
      logger.warn('BLE_MONITOR', 'Event Characteristic not available on session for monitoring');
      console.warn('[WSG BLE EVENT] Event Characteristic not available on session for monitoring');
    }

    // 2. Subscribe to Status Characteristic (beb5483e-36e1-4688-b7f5-ea07361b26a9)
    if (targetSession.statusChar && typeof targetSession.statusChar.monitor === 'function') {
      try {
        const unsubStatus = targetSession.statusChar.monitor((data: Uint8Array) => {
          this.handleIncomingBleNotification(targetSession, data, 'status');
        });
        this.activeStatusMonitorCleanup = unsubStatus;
        logger.info('BLE_MONITOR', `Subscribed to Status Characteristic (${targetSession.statusChar.uuid})`);
        console.log(`[event] subscribed ${targetSession.statusChar.uuid}`);
      } catch (err) {
        logger.error('BLE_MONITOR', 'Failed to monitor Status Characteristic', logger.serializeError(err));
        console.error('[WSG BLE EVENT] Failed to monitor Status Characteristic:', err);
      }
    }

    return () => {
      if (onEmergency) this.emergencyListeners.delete(onEmergency);
    };
  }

  /**
   * Ensures GATT session is discovered and event characteristic monitoring is running.
   * Can be called safely from any connection flow.
   */
  public static async ensureSessionAndMonitoring(
    deviceInfo: { id: string; name: string; rawDevice?: any; connectionType?: string }
  ): Promise<ConnectedBleSession | null> {
    if (deviceInfo.connectionType && deviceInfo.connectionType !== 'BLE') {
      return null;
    }

    // 1. If active session already exists for this device, ensure event monitors are running
    if (this.activeSession && this.activeSession.device.id === deviceInfo.id) {
      this.startDeviceEventMonitoring(this.activeSession);
      return this.activeSession;
    }

    // 2. If raw device exists, build session and discover characteristics
    if (deviceInfo.rawDevice) {
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        try {
          const rawDev = deviceInfo.rawDevice;
          if (Platform.OS === 'android' && typeof rawDev.requestMTU === 'function') {
            try {
              await rawDev.requestMTU(512);
              console.log('[NativeBLE] Negotiated MTU 512 for device:', deviceInfo.id);
            } catch (e) {}
          }
          const nativeSession = await NativeBluetoothService.buildSessionFromConnectedDevice(
            rawDev,
            PRODUCT_CATALOG[0]
          );
          const session: ConnectedBleSession = {
            device: {
              id: deviceInfo.id,
              name: deviceInfo.name,
              rssi: -50,
              rawDevice: rawDev,
              product: PRODUCT_CATALOG[0],
              isNative: true,
            },
            server: nativeSession.server,
            service: nativeSession.service,
            provisionChar: nativeSession.provisionChar,
            statusChar: nativeSession.statusChar,
            eventLogChar: nativeSession.eventLogChar,
            configChar: nativeSession.configChar,
            connectedAt: nativeSession.connectedAt,
            isNative: true,
          };
          this.activeSession = session;
          this.startDeviceEventMonitoring(session);
          return session;
        } catch (err) {
          console.warn('[BluetoothService] ensureSessionAndMonitoring native note:', err);
        }
      }
    }

    return null;
  }

  /**
   * Stop active BLE event and status monitoring and clean up subscriptions.
   */
  public static stopDeviceEventMonitoring(): void {
    logger.info('BLE_MONITOR', 'stopDeviceEventMonitoring called');
    if (this.activeEventMonitorCleanup) {
      try {
        this.activeEventMonitorCleanup();
        console.log('[WSG BLE EVENT] Cleaned up Event Characteristic monitor');
      } catch (cleanupErr) {
        logger.warn('BLE_MONITOR', 'Error cleaning up Event Characteristic monitor', logger.serializeError(cleanupErr));
      }
      this.activeEventMonitorCleanup = null;
    }
    if (this.activeStatusMonitorCleanup) {
      try {
        this.activeStatusMonitorCleanup();
        console.log('[WSG BLE EVENT] Cleaned up Status Characteristic monitor');
      } catch (cleanupErr) {
        logger.warn('BLE_MONITOR', 'Error cleaning up Status Characteristic monitor', logger.serializeError(cleanupErr));
      }
      this.activeStatusMonitorCleanup = null;
    }
    this.activeMonitoredSessionId = null;
  }

  /**
   * Monitor real WSG-01 emergency events transmitted over BLE status/event notification characteristics.
   * Backward compatibility alias for startDeviceEventMonitoring.
   */
  public static monitorDeviceEmergency(
    session: ConnectedBleSession | null,
    onEmergency: (event: any) => void
  ): (() => void) | null {
    return this.startDeviceEventMonitoring(session, onEmergency);
  }

  /**
   * Safely disconnects a GATT session.
   */
  public static disconnect(session: ConnectedBleSession | null): void {
    if (!session) return;
    logger.info('BLE_CONN', `BluetoothService.disconnect called for ${session.device?.name || session.device?.id}`);

    this.stopDeviceEventMonitoring();
    this.emergencyListeners.clear();

    if (this.activeSession === session) {
      this.activeSession = null;
    }

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
