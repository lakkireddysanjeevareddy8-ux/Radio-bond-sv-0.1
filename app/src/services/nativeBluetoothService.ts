import { Platform, PermissionsAndroid, Linking } from 'react-native';
import { BleManager, Device, State, Characteristic, BleError } from 'react-native-ble-plx';
import { ProductDefinition, PRODUCT_CATALOG } from './productCatalog';
import { useConnectionStore } from '../store/useConnectionStore';
import { logger } from '../utils/logger';

// Base64 helper utilities (pure JS for Hermes / React Native compatibility)
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

export function bytesToBase64(bytes: Uint8Array): string {
  let output = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++];
    const b2 = i < bytes.length ? bytes[i++] : NaN;
    const b3 = i < bytes.length ? bytes[i++] : NaN;

    const e1 = b1 >> 2;
    const e2 = ((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4);
    const e3 = isNaN(b2) ? 64 : ((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6);
    const e4 = isNaN(b2) || isNaN(b3) ? 64 : b3 & 63;

    output +=
      B64_CHARS.charAt(e1) +
      B64_CHARS.charAt(e2) +
      B64_CHARS.charAt(e3) +
      B64_CHARS.charAt(e4);
  }
  return output;
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const bytes: number[] = [];
  let i = 0;
  while (i < clean.length) {
    const e1 = B64_CHARS.indexOf(clean.charAt(i++));
    const e2 = B64_CHARS.indexOf(clean.charAt(i++));
    const e3 = B64_CHARS.indexOf(clean.charAt(i++));
    const e4 = B64_CHARS.indexOf(clean.charAt(i++));

    const b1 = (e1 << 2) | (e2 >> 4);
    const b2 = ((e2 & 15) << 4) | (e3 >> 2);
    const b3 = ((e3 & 3) << 6) | e4;

    bytes.push(b1);
    if (e3 !== 64) bytes.push(b2);
    if (e4 !== 64) bytes.push(b3);
  }
  return new Uint8Array(bytes);
}

export interface BleCharacteristicWrapper {
  uuid: string;
  writeValue(data: Uint8Array | string): Promise<void>;
  writeValueWithResponse?(data: Uint8Array | string): Promise<void>;
  readValue(): Promise<Uint8Array>;
  monitor?(listener: (data: Uint8Array) => void): () => void;
}

export interface DiscoveredNativeDevice {
  id: string;
  name: string;
  rssi?: number;
  serviceUuids?: string[];
  rawDevice: Device;
  product: ProductDefinition;
}

export interface ConnectedNativeSession {
  device: DiscoveredNativeDevice;
  server: Device;
  service: any;
  provisionChar: BleCharacteristicWrapper;
  statusChar?: BleCharacteristicWrapper;
  eventLogChar?: BleCharacteristicWrapper;
  configChar?: BleCharacteristicWrapper;
  connectedAt: Date;
  isNative: boolean;
}

class NativeBluetoothServiceClass {
  private manager: BleManager | null = null;
  private isScanning = false;

  public getManager(): BleManager {
    if (!this.manager) {
      this.manager = new BleManager();
    }
    return this.manager;
  }

  public async isDeviceConnected(deviceId: string): Promise<boolean> {
    if (!deviceId) return false;
    try {
      const mgr = this.getManager();
      return await mgr.isDeviceConnected(deviceId);
    } catch (e) {
      console.warn('[NativeBLE] isDeviceConnected check error:', e);
      return false;
    }
  }

  public async connectedDevices(serviceUuids: string[]): Promise<Device[]> {
    try {
      const mgr = this.getManager();
      return await mgr.connectedDevices(serviceUuids);
    } catch (e) {
      console.warn('[NativeBLE] connectedDevices query error:', e);
      return [];
    }
  }

  /**
   * Request necessary Android runtime permissions for Bluetooth scanning and connection.
   */
  public async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true; // iOS handles Bluetooth permissions via Info.plist dialog automatically on request
    }

    try {
      const apiLevel = Number(Platform.Version);

      if (apiLevel >= 31) {
        // Android 12+ (API 31+) requires BLUETOOTH_SCAN & BLUETOOTH_CONNECT
        const permissionsToRequest = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ];

        const granted = await PermissionsAndroid.requestMultiple(permissionsToRequest);

        const scanGranted =
          granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
        const connectGranted =
          granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;

        return scanGranted && connectGranted;
      } else {
        // Android 11 and lower requires location permissions for BLE discovery
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission for Bluetooth',
            message: 'Android requires location access to discover nearby Washroom Safety devices via Bluetooth.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (e) {
      console.warn('[NativeBLE] Permission request error:', e);
      return false;
    }
  }

  /**
   * Query the physical Bluetooth radio power state.
   */
  public async getState(): Promise<'on' | 'off' | 'unauthorized' | 'unsupported' | 'unknown'> {
    try {
      const mgr = this.getManager();
      let state: State = await mgr.state();
      if (state === State.Unknown) {
        // Wait a brief moment on initial startup for OS Bluetooth adapter to report state
        await new Promise((r) => setTimeout(r, 200));
        state = await mgr.state();
      }

      let res: 'on' | 'off' | 'unauthorized' | 'unsupported' | 'unknown' = 'off';
      switch (state) {
        case State.PoweredOn:
          res = 'on';
          break;
        case State.PoweredOff:
        case State.Resetting:
          res = 'off';
          break;
        case State.Unauthorized:
          res = 'unauthorized';
          break;
        case State.Unsupported:
          res = 'unsupported';
          break;
        default:
          res = 'off';
          break;
      }
      logger.info('BLE_RADIO', `Native BLE adapter state queried: ${res} (raw: ${state})`);
      return res;
    } catch (err) {
      logger.error('BLE_RADIO', 'Error querying native BLE state', logger.serializeError(err));
      console.warn('[NativeBLE] Error checking state:', err);
      return 'off';
    }
  }

  /**
   * Listen for real-time operating system Bluetooth adapter power state transitions.
   */
  public onStateChange(
    listener: (state: 'on' | 'off' | 'unauthorized' | 'unsupported' | 'unknown') => void
  ): () => void {
    try {
      const mgr = this.getManager();
      const subscription = mgr.onStateChange((state: State) => {
        let mapped: 'on' | 'off' | 'unauthorized' | 'unsupported' | 'unknown' = 'off';
        switch (state) {
          case State.PoweredOn:
            mapped = 'on';
            break;
          case State.PoweredOff:
          case State.Resetting:
            mapped = 'off';
            break;
          case State.Unauthorized:
            mapped = 'unauthorized';
            break;
          case State.Unsupported:
            mapped = 'unsupported';
            break;
          default:
            mapped = 'off';
            break;
        }
        logger.info('BLE_RADIO', `Native BLE onStateChange transition: ${mapped} (raw: ${state})`);
        listener(mapped);
      }, true);

      return () => {
        try {
          subscription.remove();
        } catch (unsubErr) {
          logger.warn('BLE_RADIO', 'Error removing onStateChange subscription', logger.serializeError(unsubErr));
        }
      };
    } catch (err) {
      logger.error('BLE_RADIO', 'onStateChange setup error', logger.serializeError(err));
      console.warn('[NativeBLE] onStateChange setup error:', err);
      return () => {};
    }
  }

  /**
   * Check if Bluetooth radio is currently powered ON.
   */
  public async isAvailable(): Promise<boolean> {
    const state = await this.getState();
    return state === 'on';
  }

  /**
   * Open the native Android Bluetooth settings screen using official Android intent.
   */
  public openSettings(): void {
    if (Platform.OS === 'android') {
      try {
        if ((Linking as any).sendIntent) {
          (Linking as any)
            .sendIntent('android.settings.BLUETOOTH_SETTINGS')
            .catch(() => {
              Linking.openSettings().catch(() => {});
            });
          return;
        }
      } catch {}
      Linking.openSettings().catch(() => {});
      return;
    }

    if (Platform.OS === 'ios') {
      Linking.openURL('App-Prefs:Bluetooth').catch(() => {
        Linking.openSettings().catch(() => {});
      });
      return;
    }
  }

  /**
   * Start scanning for real nearby BLE devices.
   * If serviceUuids is specified, filters scans to target devices.
   */
  public async startScan(
    onDeviceFound: (device: DiscoveredNativeDevice) => void,
    onError: (error: Error) => void,
    options?: { serviceUuids?: string[]; timeoutMs?: number; targetNamePrefix?: string }
  ): Promise<void> {
    const hasPerm = await this.requestPermissions();
    if (!hasPerm) {
      onError(new Error('PERMISSION_DENIED'));
      return;
    }

    const isAvail = await this.isAvailable();
    if (!isAvail) {
      onError(new Error('BLUETOOTH_DISABLED'));
      return;
    }

    this.stopScan();

    const mgr = this.getManager();
    this.isScanning = true;
    const seenIds = new Set<string>();

    const targetServiceUuids = options?.serviceUuids || null;
    const prefix = (options?.targetNamePrefix || 'WSG-01').toLowerCase();

    logger.info('BLE_SCAN', `Native startDeviceScan started`, {
      targetServiceUuids,
      targetNamePrefix: options?.targetNamePrefix,
      timeoutMs: options?.timeoutMs,
    });

    mgr.startDeviceScan(
      targetServiceUuids,
      { allowDuplicates: false },
      (error: BleError | null, device: Device | null) => {
        if (error) {
          logger.error('BLE_SCAN', `Native BLE scan error callback: ${error.message}`, logger.serializeError(error));
          console.warn('[NativeBLE] Scan error:', error);
          this.isScanning = false;
          onError(new Error(error.message || 'BLE_SCAN_ERROR'));
          return;
        }

        if (device && !seenIds.has(device.id)) {
          seenIds.add(device.id);

          const devName = device.name || device.localName || '';
          const lowerName = devName.toLowerCase();

          // Prioritize WSG-01 devices or check if matches prefix / service UUID
          const isTargetProduct =
            lowerName.startsWith(prefix) ||
            lowerName.includes('wsg') ||
            lowerName.includes('washroom') ||
            lowerName.includes('safeguard');

          const matchedProduct: ProductDefinition =
            PRODUCT_CATALOG.find((p) => p.id === 'wsg-01') || PRODUCT_CATALOG[0];

          logger.info('BLE_SCAN', `Discovered BLE device: ${devName || 'Unnamed'} (${device.id}) RSSI: ${device.rssi}`, {
            id: device.id,
            name: devName,
            rssi: device.rssi,
            serviceUUIDs: device.serviceUUIDs,
            isTargetProduct,
          });

          // Associate discovered native device
          const nativeDevice: DiscoveredNativeDevice = {
            id: device.id,
            name: devName || 'Nearby BLE Device',
            rssi: device.rssi ?? -50,
            serviceUuids: device.serviceUUIDs ?? [],
            rawDevice: device,
            product: {
              ...matchedProduct,
              name: devName || matchedProduct.name,
            },
          };

          // If filtering by prefix, only yield matching devices; otherwise yield all discovered
          if (!options?.targetNamePrefix || isTargetProduct || (device.serviceUUIDs && device.serviceUUIDs.includes(matchedProduct.bleServiceUuid))) {
            onDeviceFound(nativeDevice);
          }
        }
      }
    );

    // Auto-timeout if specified
    if (options?.timeoutMs && options.timeoutMs > 0) {
      setTimeout(() => {
        if (this.isScanning) {
          logger.info('BLE_SCAN', `Scan timeout of ${options.timeoutMs}ms elapsed, auto-stopping`);
          this.stopScan();
        }
      }, options.timeoutMs);
    }
  }

  /**
   * Stop any active BLE scan.
   */
  public stopScan(): void {
    if (this.manager && this.isScanning) {
      logger.info('BLE_SCAN', 'stopDeviceScan invoked');
      try {
        this.manager.stopDeviceScan();
      } catch (e) {
        logger.warn('BLE_SCAN', 'stopDeviceScan note', logger.serializeError(e));
        console.warn('[NativeBLE] Stop scan note:', e);
      }
      this.isScanning = false;
    }
  }

  /**
   * Connect to GATT server on a discovered native device,
   * discover all services and characteristics, and map WSG-01 characteristics.
   */
  /**
   * Builds and maps connected GATT session characteristics with diagnostics.
   */
  public async buildSessionFromConnectedDevice(
    connectedDevice: Device,
    product: ProductDefinition = PRODUCT_CATALOG[0],
    discoveredDevice?: DiscoveredNativeDevice
  ): Promise<ConnectedNativeSession> {
    // Request MTU 247 right after connecting and before discovering services/characteristics
    if (Platform.OS === 'android') {
      try {
        logger.info('BLE_MTU', `Requesting MTU 247 for device: ${connectedDevice.id}`);
        await connectedDevice.requestMTU(247);
        logger.info('BLE_MTU', `Negotiated MTU 247 for device: ${connectedDevice.id}`);
        console.log('[NativeBLE] Negotiated MTU 247 for device:', connectedDevice.id);
      } catch (mtuErr) {
        logger.warn('BLE_MTU', `MTU negotiation failed/unsupported for device: ${connectedDevice.id}`, logger.serializeError(mtuErr));
        console.warn('[NativeBLE] MTU negotiation note:', mtuErr);
      }
    }

    // 1. Discover all services and characteristics
    logger.info('BLE_GATT', `Starting discoverAllServicesAndCharacteristics on device: ${connectedDevice.id}`);
    const deviceWithServices = await connectedDevice.discoverAllServicesAndCharacteristics();

    // 2. Locate WSG-01 primary service
    const targetServiceUuid = product.bleServiceUuid.toLowerCase();
    const targetProvUuid = product.bleProvisionCharUuid.toLowerCase();
    const targetStatusUuid = product.bleStatusCharUuid.toLowerCase();
    const targetEventLogUuid = (product.bleEventLogCharUuid || 'beb5483e-36e1-4688-b7f5-ea07361b26aa').toLowerCase();
    const targetConfigUuid = (product.bleConfigCharUuid || 'beb5483e-36e1-4688-b7f5-ea07361b26ab').toLowerCase();

    const services = await deviceWithServices.services();
    let matchedService: any = null;

    for (const s of services) {
      if (s.uuid.toLowerCase() === targetServiceUuid) {
        matchedService = s;
        break;
      }
    }

    logger.info('BLE_GATT', `Discovered ${services.length} services on ${connectedDevice.id}`, {
      services: services.map((s) => s.uuid),
      targetServiceUuid,
      matched: Boolean(matchedService),
    });

    // Strictly verify WSG-01 primary service UUID - NEVER fall back to generic services
    if (!matchedService) {
      const err = new Error(
        `WSG-01 Service Not Found: Device does not expose the required safety service (${targetServiceUuid}).`
      );
      logger.error('BLE_GATT', err.message, { deviceID: connectedDevice.id, targetServiceUuid });
      throw err;
    }

    // 3. Discover characteristics for WSG-01 service
    const characteristics = await matchedService.characteristics();
    let rawProvChar: Characteristic | null = null;
    let rawStatusChar: Characteristic | null = null;
    let rawEventLogChar: Characteristic | null = null;
    let rawConfigChar: Characteristic | null = null;

    const norm = (u: string) => u.toLowerCase().replace(/[^a-f0-9]/g, '');
    for (const c of characteristics) {
      const cUuidNorm = norm(c.uuid);
      if (cUuidNorm === norm(targetProvUuid)) {
        rawProvChar = c;
      } else if (cUuidNorm === norm(targetStatusUuid)) {
        rawStatusChar = c;
      } else if (cUuidNorm === norm(targetEventLogUuid)) {
        rawEventLogChar = c;
      } else if (cUuidNorm === norm(targetConfigUuid)) {
        rawConfigChar = c;
      }
    }

    logger.info('BLE_GATT', `Characteristics discovery completed for ${targetServiceUuid}`, {
      foundCharacteristics: characteristics.map((c: any) => ({
        uuid: c.uuid,
        writableWithResponse: c.isWritableWithResponse,
        writableWithoutResponse: c.isWritableWithoutResponse,
        readable: c.isReadable,
        notifiable: c.isNotifiable,
      })),
      matchedProvision: Boolean(rawProvChar),
      matchedStatus: Boolean(rawStatusChar),
      matchedEventLog: Boolean(rawEventLogChar),
      matchedConfig: Boolean(rawConfigChar),
    });

    // Strictly verify WSG-01 provisioning characteristic - NEVER fall back to unrelated characteristics
    if (!rawProvChar) {
      const err = new Error(
        `WSG-01 Characteristic Not Found: Required provisioning characteristic (${targetProvUuid}) was not found.`
      );
      logger.error('BLE_GATT', err.message, { deviceID: connectedDevice.id, targetProvUuid });
      throw err;
    }
    console.log(
      '[NativeBLE] WSG-01 Provisioning Characteristic matched:',
      rawProvChar.uuid,
      `(writableWithResponse: ${rawProvChar.isWritableWithResponse}, writableWithoutResponse: ${rawProvChar.isWritableWithoutResponse})`
    );

    if (rawStatusChar) {
      console.log('[NativeBLE] WSG-01 Status Characteristic matched:', rawStatusChar.uuid);
    }
    if (rawEventLogChar) {
      console.log('[NativeBLE] WSG-01 Event Characteristic matched:', rawEventLogChar.uuid);
    }
    if (rawConfigChar) {
      console.log('[NativeBLE] WSG-01 Config Characteristic matched:', rawConfigChar.uuid);
    }

    // 4. Wrap characteristics into uniform API with explicit diagnostic logging
    const wrapChar = (char: Characteristic): BleCharacteristicWrapper => {
      const performWriteWithResponse = async (data: Uint8Array | string) => {
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        const b64 = bytesToBase64(bytes);
        const dataStr = typeof data === 'string' ? data : new TextDecoder().decode(bytes);

        logger.info('BLE_WRITE', `writeWithResponse start on ${char.uuid} (${bytes.length} bytes)`, {
          deviceID: char.deviceID,
          serviceUUID: char.serviceUUID,
          characteristicUUID: char.uuid,
          data: dataStr,
          payloadByteLength: bytes.length,
        });

        try {
          await char.writeWithResponse(b64);
          logger.info('BLE_WRITE', `writeWithResponse SUCCESS on ${char.uuid}`);
        } catch (error: any) {
          logger.error('BLE_WRITE', `writeWithResponse FAILED on ${char.uuid}`, logger.serializeError(error));
          console.error('[NativeBLE] WRITE FAILED', char.uuid, error);
          throw error;
        }
      };

      const performWriteWithoutResponse = async (data: Uint8Array | string) => {
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        const b64 = bytesToBase64(bytes);
        const dataStr = typeof data === 'string' ? data : new TextDecoder().decode(bytes);

        logger.info('BLE_WRITE', `writeWithoutResponse start on ${char.uuid} (${bytes.length} bytes)`, {
          deviceID: char.deviceID,
          serviceUUID: char.serviceUUID,
          characteristicUUID: char.uuid,
          data: dataStr,
          payloadByteLength: bytes.length,
        });

        try {
          await char.writeWithoutResponse(b64);
          logger.info('BLE_WRITE', `writeWithoutResponse SUCCESS on ${char.uuid}`);
        } catch (error: any) {
          logger.error('BLE_WRITE', `writeWithoutResponse FAILED on ${char.uuid}`, logger.serializeError(error));
          console.error('[NativeBLE] WRITE FAILED', char.uuid, error);
          throw error;
        }
      };

      return {
        uuid: char.uuid,
        writeValue: async (data: Uint8Array | string) => {
          if (char.isWritableWithResponse || !char.isWritableWithoutResponse) {
            return performWriteWithResponse(data);
          }
          return performWriteWithoutResponse(data);
        },
        writeValueWithResponse: performWriteWithResponse,
        readValue: async () => {
          logger.info('BLE_READ', `readValue start on ${char.uuid}`);
          try {
            const readChar = await char.read();
            const val = readChar.value || '';
            const bytes = base64ToBytes(val);
            let decoded = '';
            try { decoded = new TextDecoder().decode(bytes); } catch {}
            logger.info('BLE_READ', `readValue SUCCESS on ${char.uuid} (${bytes.length} bytes)`, {
              base64: val,
              decodedText: decoded,
              byteLength: bytes.length,
            });
            return bytes;
          } catch (readErr: any) {
            logger.error('BLE_READ', `readValue FAILED on ${char.uuid}`, logger.serializeError(readErr));
            console.error('[NativeBLE] READ VALUE FAILED:', char.uuid, readErr?.message || readErr);
            throw readErr;
          }
        },
        monitor: (listener: (data: Uint8Array) => void) => {
          logger.info('BLE_MONITOR', `Subscribed to monitor on ${char.uuid}`);
          const sub = char.monitor((err, c) => {
            if (err) {
              logger.error('BLE_MONITOR', `Monitor callback error for ${char.uuid}`, logger.serializeError(err));
              console.warn(`[event] monitor callback error for ${char.uuid}:`, err);
              return;
            }
            if (c && c.value != null && c.value !== '') {
              const rawBytes = base64ToBytes(c.value);
              let decoded = '';
              try { decoded = new TextDecoder().decode(rawBytes); } catch {}
              logger.info('BLE_MONITOR', `Notification received on ${char.uuid} (${rawBytes.length} bytes)`, {
                rawBase64: c.value,
                decodedText: decoded,
                byteLength: rawBytes.length,
              });
              listener(rawBytes);
            }
          });
          return () => {
            logger.info('BLE_MONITOR', `Unsubscribed from monitor on ${char.uuid}`);
            try {
              sub.remove();
            } catch (remErr) {
              logger.warn('BLE_MONITOR', `Error removing monitor for ${char.uuid}`, logger.serializeError(remErr));
            }
          };
        },
    };
  };

    const devItem: DiscoveredNativeDevice = discoveredDevice || {
      id: connectedDevice.id,
      name: connectedDevice.name || connectedDevice.localName || product.name,
      rssi: connectedDevice.rssi ?? -50,
      serviceUuids: [product.bleServiceUuid],
      rawDevice: connectedDevice,
      product: product,
    };

    return {
      device: devItem,
      server: deviceWithServices,
      service: matchedService,
      provisionChar: wrapChar(rawProvChar),
      statusChar: rawStatusChar ? wrapChar(rawStatusChar) : undefined,
      eventLogChar: rawEventLogChar ? wrapChar(rawEventLogChar) : undefined,
      configChar: rawConfigChar ? wrapChar(rawConfigChar) : undefined,
      connectedAt: new Date(),
      isNative: true,
    };
  }

  public async cancelDeviceConnection(deviceId: string): Promise<void> {
    logger.info('BLE_CONN', `Calling cancelDeviceConnection for ${deviceId}`);
    try {
      const mgr = this.getManager();
      await mgr.cancelDeviceConnection(deviceId);
      logger.info('BLE_CONN', `cancelDeviceConnection succeeded for ${deviceId}`);
    } catch (e: any) {
      logger.warn('BLE_CONN', `cancelDeviceConnection note for ${deviceId}`, logger.serializeError(e));
    }
  }

  public async connectGatt(
    discovered: DiscoveredNativeDevice,
    product: ProductDefinition
  ): Promise<ConnectedNativeSession> {
    this.stopScan();

    const rawDevice: Device = discovered.rawDevice;
    if (!rawDevice) {
      logger.error('BLE_CONN', `connectGatt failed: rawDevice missing for ${discovered.id}`);
      throw new Error('DEVICE_NOT_FOUND');
    }

    try {
      // 1. Establish native BLE connection with MTU 247
      logger.info('BLE_CONN', `Initiating GATT connection to ${discovered.name || discovered.id} (${rawDevice.id})`, {
        id: rawDevice.id,
        name: discovered.name,
      });
      console.log('[NativeBLE] Connecting to GATT on device:', rawDevice.id);
      const connectedDevice = await rawDevice.connect({
        autoConnect: false,
        timeout: 10000,
        requestMTU: 247,
      });
      logger.info('BLE_CONN', `GATT link established for ${rawDevice.id}`);

      // Stop scan immediately on success
      this.stopScan();

      if (typeof connectedDevice.onDisconnected === 'function') {
        try {
          (connectedDevice as any)._onDisconnectedAttached = true;
          connectedDevice.onDisconnected((error, dev) => {
            const devId = dev?.id || rawDevice.id;
            console.log('[conn] Native BLE disconnected event fired for device:', devId, 'Error:', error?.message);
            if (error) {
              logger.warn('BLE_CONN', `onDisconnected callback triggered for ${devId}`, logger.serializeError(error));
            } else {
              logger.info('BLE_CONN', `onDisconnected callback triggered cleanly for ${devId}`);
            }
            useConnectionStore.getState().setDisconnected(error?.message || 'Native BLE disconnected');
          });
        } catch (e) {
          logger.warn('BLE_CONN', `onDisconnected listener registration failed for ${rawDevice.id}`, logger.serializeError(e));
          console.warn('[NativeBLE] onDisconnected attachment error:', e);
        }
      }

      return await this.buildSessionFromConnectedDevice(connectedDevice, product, discovered);
    } catch (err: any) {
      logger.error('BLE_CONN', `GATT connection error for ${rawDevice.id}`, logger.serializeError(err));
      console.warn('[NativeBLE] GATT connection error:', err);
      throw new Error(err.message || 'CONNECTION_FAILED');
    }
  }

  /**
   * Reconnect to a known WSG-01 device by ID or discover nearby via fast targeted scan.
   */
  public async reconnectOrScan(
    preferredDeviceId?: string,
    product: ProductDefinition = PRODUCT_CATALOG[0],
    timeoutMs: number = 7000
  ): Promise<ConnectedNativeSession> {
    logger.info('BLE_CONN', `reconnectOrScan starting (preferred: ${preferredDeviceId || 'none'}, timeout: ${timeoutMs}ms)`);
    const mgr = this.getManager();

    // 1. Check if preferred device is already connected or attempt direct connect
    if (preferredDeviceId && preferredDeviceId.length > 5) {
      try {
        const isConn = await mgr.isDeviceConnected(preferredDeviceId);
        if (isConn) {
          logger.info('BLE_CONN', `Preferred device ${preferredDeviceId} is already connected, retrieving session`);
          console.log('[NativeBLE] Device already connected, discovering services:', preferredDeviceId);
          this.stopScan();
          const devList = await mgr.devices([preferredDeviceId]);
          if (devList && devList[0]) {
            return await this.buildSessionFromConnectedDevice(devList[0], product);
          }
        }
      } catch (connCheckErr) {
        logger.warn('BLE_CONN', `isDeviceConnected check exception for ${preferredDeviceId}`, logger.serializeError(connCheckErr));
        console.warn('[NativeBLE] isDeviceConnected check note:', connCheckErr);
      }

      try {
        logger.info('BLE_CONN', `Attempting direct connect to device ID ${preferredDeviceId}`);
        console.log('[NativeBLE] Attempting direct connect to device ID:', preferredDeviceId);
        const directDev = await mgr.connectToDevice(preferredDeviceId, {
          autoConnect: false,
          timeout: 4000,
          requestMTU: 247,
        });
        this.stopScan();
        logger.info('BLE_CONN', `Direct connect succeeded for ${preferredDeviceId}`);
        console.log('[NativeBLE] Direct connect succeeded:', preferredDeviceId);
        return await this.buildSessionFromConnectedDevice(directDev, product);
      } catch (directErr) {
        logger.warn('BLE_CONN', `Direct connect to ${preferredDeviceId} failed, falling back to scan`, logger.serializeError(directErr));
        console.log('[NativeBLE] Direct connect by ID timed out/failed, falling back to fast scan...', directErr);
      }
    }

    // 2. Perform fast targeted scan for WSG-01
    return new Promise<ConnectedNativeSession>(async (resolve, reject) => {
      let isResolved = false;
      const targetServiceUuid = product.bleServiceUuid.toLowerCase();
      const prefix = 'wsg-01';

      const scanTimer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          this.stopScan();
          logger.warn('BLE_CONN', `Targeted scan timed out after ${timeoutMs}ms`);
          reject(new Error('BLE_NOT_CONNECTED: WSG-01 device not found nearby. Please ensure the device is powered on.'));
        }
      }, timeoutMs);

      const onDeviceFound = async (device: Device) => {
        if (isResolved) return;
        isResolved = true;
        clearTimeout(scanTimer);
        this.stopScan();

        try {
          logger.info('BLE_CONN', `Targeted scan found candidate ${device.name || 'WSG-01'} (${device.id}), connecting...`);
          console.log('[NativeBLE] Targeted scan found WSG-01:', device.name, device.id);
          const connected = await device.connect({ autoConnect: false, timeout: 6000, requestMTU: 247 });
          this.stopScan();
          const session = await this.buildSessionFromConnectedDevice(connected, product);
          resolve(session);
        } catch (connErr: any) {
          logger.error('BLE_CONN', `Targeted scan connection failed for ${device.id}`, logger.serializeError(connErr));
          reject(new Error(`BLE_NOT_CONNECTED: Found ${device.name || 'WSG-01'} but connection failed: ${connErr.message || connErr}`));
        }
      };

      const hasPerm = await this.requestPermissions();
      if (!hasPerm) {
        clearTimeout(scanTimer);
        logger.error('BLE_CONN', 'Targeted scan aborted: permissions denied');
        reject(new Error('PERMISSION_DENIED: Bluetooth permissions not granted.'));
        return;
      }

      this.stopScan();
      this.isScanning = true;
      logger.info('BLE_SCAN', `Starting targeted scan for WSG-01 (${product.bleServiceUuid})`);

      mgr.startDeviceScan(
        [product.bleServiceUuid],
        { allowDuplicates: false },
        (error, dev) => {
          if (error) {
            if (!isResolved) {
              isResolved = true;
              clearTimeout(scanTimer);
              this.stopScan();
              logger.error('BLE_SCAN', 'Targeted scan error', logger.serializeError(error));
              reject(new Error(`BLE_SCAN_ERROR: ${error.message}`));
            }
            return;
          }
          if (dev) {
            const devName = (dev.name || dev.localName || '').toLowerCase();
            if (devName.startsWith(prefix) || devName.includes('wsg') || dev.serviceUUIDs?.includes(targetServiceUuid)) {
              onDeviceFound(dev);
            }
          }
        }
      );
    });
  }

  /**
   * Disconnect an active native session.
   */
  public async disconnect(session: ConnectedNativeSession | null): Promise<void> {
    const devIdentifier = session?.device?.name || session?.device?.id || 'unknown';
    logger.info('BLE_CONN', `Disconnecting active native session for ${devIdentifier}`);
    console.log('[NativeBLE] Disconnecting active session for:', devIdentifier);
    useConnectionStore.getState().setDisconnected('NativeBluetoothService disconnect called');
    if (session?.server) {
      try {
        logger.info('BLE_CONN', `Calling cancelConnection on server ${session.server.id}`);
        console.log('[NativeBLE] Calling cancelConnection on device:', session.server.id);
        await session.server.cancelConnection();
        logger.info('BLE_CONN', `cancelConnection completed for ${session.server.id}`);
      } catch (e) {
        logger.warn('BLE_CONN', `cancelConnection note on ${session?.server?.id}`, logger.serializeError(e));
        console.warn('[NativeBLE] Disconnect note:', e);
      }
    }
  }

  /**
   * Destroy BleManager instance - preserved as singleton across screen lifecycles.
   */
  public destroy(): void {
    console.log('[NativeBLE] destroy() requested - BleManager singleton preserved');
  }
}

export const NativeBluetoothService = new NativeBluetoothServiceClass();
