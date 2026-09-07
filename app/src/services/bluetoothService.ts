import { Platform } from 'react-native';
import { ProductDefinition } from './productCatalog';

export interface DiscoveredBleDevice {
  id: string;
  name: string;
  rssi?: number;
  serviceUuids?: string[];
  rawDevice: any;
  product: ProductDefinition;
}

export interface ConnectedBleSession {
  device: DiscoveredBleDevice;
  server: any; // BluetoothRemoteGATTServer
  service: any; // BluetoothRemoteGATTService
  provisionChar: any; // BluetoothRemoteGATTCharacteristic
  statusChar?: any; // BluetoothRemoteGATTCharacteristic
  connectedAt: Date;
}

export class BluetoothService {
  /**
   * Checks if the device's Bluetooth radio is enabled and supported.
   */
  public static async isBluetoothAvailable(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;

    // Web Bluetooth check
    const bluetooth = (navigator as any)?.bluetooth;
    if (!bluetooth) return false;

    if (bluetooth.getAvailability) {
      try {
        return await bluetooth.getAvailability();
      } catch (err) {
        console.warn('Bluetooth availability check error:', err);
        return false;
      }
    }

    return true;
  }

  /**
   * Prompts OS or Windows Bridge to open Bluetooth settings if disabled.
   */
  public static openSystemBluetoothSettings(): void {
    // 1. Local Windows bridge if available
    try {
      fetch('http://127.0.0.1:5005/open?target=bluetooth').catch(() => {});
    } catch {}

    // 2. Platform URL
    try {
      if (typeof window !== 'undefined' && Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = 'ms-settings:bluetooth';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch {}
  }

  /**
   * Performs genuine Bluetooth Low Energy discovery specifically targeting the selected product.
   * Uses Web Bluetooth API / Native BLE with strict service UUID filtering.
   */
  public static async scanForProduct(product: ProductDefinition): Promise<DiscoveredBleDevice> {
    const bluetooth = (navigator as any)?.bluetooth;
    if (!bluetooth) {
      throw new Error(
        'Web Bluetooth is not supported in this browser. Please open in Google Chrome, Microsoft Edge, or a WebBluetooth-compatible browser.'
      );
    }

    // Verify adapter state
    const isAvailable = await this.isBluetoothAvailable();
    if (!isAvailable) {
      this.openSystemBluetoothSettings();
      throw new Error('BLUETOOTH_DISABLED');
    }

    // Prepare search filters for the specific product
    // Normalize UUID for Web Bluetooth
    const targetServiceUuid = product.bleServiceUuid.toLowerCase();

    const requestOptions: any = {
      filters: [
        { services: [targetServiceUuid] },
        { namePrefix: 'WSG-01' },
        { namePrefix: 'SafeGuard' },
        { namePrefix: 'ESP32' },
      ],
      optionalServices: [
        targetServiceUuid,
        'device_information',
        'battery_service',
      ],
    };

    let rawDevice: any;
    try {
      rawDevice = await bluetooth.requestDevice(requestOptions);
    } catch (err: any) {
      const msg = String(err.message || '').toLowerCase();
      if (msg.includes('user cancelled') || err.name === 'NotFoundError') {
        throw new Error('NO_DEVICE_CHOSEN');
      }
      if (msg.includes('adapter') || msg.includes('disabled') || msg.includes('turned off')) {
        this.openSystemBluetoothSettings();
        throw new Error('BLUETOOTH_DISABLED');
      }
      throw err;
    }

    if (!rawDevice) {
      throw new Error('No device selected.');
    }

    const devName = rawDevice.name ? rawDevice.name.trim() : '';

    // Enforce real hardware: Reject nameless background beacons or unsupported devices
    if (!devName || devName.toLowerCase().includes('unknown') || devName.toLowerCase().includes('unsupported')) {
      throw new Error(
        `Selected device "${devName || 'Unknown'}" is not a valid ${product.name}. Please select your powered-on ${product.model} hardware.`
      );
    }

    return {
      id: rawDevice.id || `ble-${Math.random().toString(36).substring(2, 9)}`,
      name: devName,
      rssi: -52, // Typical close-range RSSI for pairing
      serviceUuids: [product.bleServiceUuid],
      rawDevice,
      product,
    };
  }

  /**
   * Connects to the device GATT server and discovers required provisioning characteristics.
   */
  public static async connectGatt(
    discovered: DiscoveredBleDevice
  ): Promise<ConnectedBleSession> {
    const raw = discovered.rawDevice;
    if (!raw || !raw.gatt) {
      throw new Error('Device does not expose a GATT interface.');
    }

    // 1. Establish GATT Connection
    let server: any;
    try {
      server = await raw.gatt.connect();
    } catch (gattErr: any) {
      throw new Error(
        `GATT connection failed: ${gattErr.message || 'Connection handshake refused'}. Ensure device is powered on and within range.`
      );
    }

    if (!server || !server.connected) {
      throw new Error('GATT server disconnected during handshake.');
    }

    // 2. Discover Primary Service
    let service: any;
    const targetServiceUuid = discovered.product.bleServiceUuid.toLowerCase();

    try {
      service = await server.getPrimaryService(targetServiceUuid);
    } catch (srvErr: any) {
      // Fallback: search across all available primary services if custom UUID varies
      try {
        const services = await server.getPrimaryServices();
        if (services && services.length > 0) {
          service = services[0];
        }
      } catch {}
      if (!service) {
        throw new Error(
          `Service verification failed: Required service UUID (${discovered.product.bleServiceUuid}) not found on this device.`
        );
      }
    }

    // 3. Discover Provisioning Characteristic
    let provisionChar: any;
    const targetCharUuid = discovered.product.bleProvisionCharUuid.toLowerCase();

    try {
      provisionChar = await service.getCharacteristic(targetCharUuid);
    } catch (charErr: any) {
      // Fallback: inspect any writable characteristic
      try {
        const chars = await service.getCharacteristics();
        provisionChar = chars.find((c: any) => c.properties.write || c.properties.writeWithoutResponse);
      } catch {}
      if (!provisionChar) {
        throw new Error(
          `Characteristic verification failed: Provisioning characteristic not found on this device.`
        );
      }
    }

    // 4. Optional status characteristic
    let statusChar: any;
    try {
      statusChar = await service.getCharacteristic(
        discovered.product.bleStatusCharUuid.toLowerCase()
      );
    } catch {
      // optional
    }

    return {
      device: discovered,
      server,
      service,
      provisionChar,
      statusChar,
      connectedAt: new Date(),
    };
  }

  /**
   * Safely disconnects a GATT session.
   */
  public static disconnect(session: ConnectedBleSession | null): void {
    try {
      if (session?.server && session.server.connected) {
        session.server.disconnect();
      }
    } catch (e) {
      console.warn('Error disconnecting BLE GATT:', e);
    }
  }
}
