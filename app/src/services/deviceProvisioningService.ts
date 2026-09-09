import { ConnectedBleSession } from './bluetoothService';
import { useAppStore } from '../store/useAppStore';

export interface ProvisioningCredentials {
  ssid: string;
  password?: string;
  customDeviceName?: string;
  room?: string;
}

export interface ProvisioningResult {
  success: boolean;
  ipAddress: string;
  deviceId: string;
  model: string;
  rssi?: number;
  ssid?: string;
  message?: string;
}

export type ProvisioningStatusListener = (
  step: 'PREPARING' | 'SENDING_CREDENTIALS' | 'CONNECTING_ROUTER' | 'OBTAINING_IP' | 'SUCCESS' | 'FAILED',
  details?: string
) => void;

export class DeviceProvisioningService {
  /**
   * Verifies whether Supabase backend is reachable over the Internet.
   * Keeps Cloud status distinct from Wi-Fi status.
   */
  public static async checkCloudConnectivity(timeoutMs: number = 3500): Promise<boolean> {
    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://xobasrolmpmvrnjcikcq.supabase.co';
      const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/`, {
        method: 'GET',
        headers: {
          apikey: supabaseKey,
        },
        signal: controller.signal,
      });
      clearTimeout(tid);
      return resp.status < 500;
    } catch {
      return false;
    }
  }

  /**
   * Reads real-time Wi-Fi status from the physical ESP32 status characteristic.
   * Differentiates CONNECTED, DISCONNECTED, CONNECTING, FAILED.
   */
  public static async queryCurrentDeviceWifiStatus(
    session: ConnectedBleSession | null | undefined
  ): Promise<'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'FAILED'> {
    if (!session?.statusChar) return 'DISCONNECTED';
    try {
      const val = await session.statusChar.readValue();
      if (val && val.length > 0) {
        const decoder = new TextDecoder('utf-8');
        const rawStr = decoder.decode(val).trim();
        if (rawStr.startsWith('{')) {
          const parsed = JSON.parse(rawStr);
          if (parsed.status === 'CONNECTED') return 'CONNECTED';
          if (parsed.status === 'CONNECTING') return 'CONNECTING';
          if (parsed.status === 'AUTH_FAILED' || parsed.status === 'TIMEOUT') return 'FAILED';
          return 'DISCONNECTED';
        }
      }
    } catch (e) {
      console.warn('[Provisioning] Error reading current status:', e);
    }
    return 'DISCONNECTED';
  }

  /**
   * Determines effective Wi-Fi state with __DEV__ simulation guard.
   */
  public static getEffectiveWifiStatus(
    realStatus: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'FAILED'
  ): 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'FAILED' {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const isFake = useAppStore.getState().fakeWifiConnected;
      if (isFake) return 'CONNECTED';
    }
    return realStatus;
  }

  /**
   * Transmits Wi-Fi credentials to the ESP32 over the established BLE GATT connection.
   * Never transmits or logs credentials to external servers.
   */
  public static async provisionEsp32(
    session: ConnectedBleSession | null | undefined,
    creds: ProvisioningCredentials,
    onProgress?: ProvisioningStatusListener
  ): Promise<ProvisioningResult> {
    if (!creds.ssid.trim()) {
      throw new Error('Please specify a valid 2.4GHz Wi-Fi network SSID.');
    }

    if (!session || !session.provisionChar) {
      throw new Error(
        'Device provisioning requires an active Bluetooth BLE connection to WSG-01. Please pair and connect to the gadget via Bluetooth first.'
      );
    }

    onProgress?.('PREPARING', 'Preparing network credentials for WSG-01...');

    // Construct provisioning payload (Espressif compatible JSON structure)
    const payload = JSON.stringify({
      cmd: 'PROV_WIFI',
      ssid: creds.ssid.trim(),
      pass: creds.password || '',
      name: creds.customDeviceName?.trim() || session.device.name,
      room: creds.room || 'Washroom',
      ts: Date.now(),
    });

    onProgress?.('SENDING_CREDENTIALS', 'Writing network credentials to ESP32 provisioning characteristic...');

    const encoder = new TextEncoder();
    const encodedBytes = encoder.encode(payload);

    try {
      if (session.provisionChar.writeValueWithResponse) {
        await session.provisionChar.writeValueWithResponse(encodedBytes);
      } else {
        await session.provisionChar.writeValue(encodedBytes);
      }
    } catch (writeErr: any) {
      throw new Error(`Failed to write credentials to device: ${writeErr.message || 'GATT write rejected'}`);
    }

    onProgress?.('CONNECTING_ROUTER', `ESP32 is attempting connection to "${creds.ssid}"...`);

    // Poll status characteristic and listen for real IP assignment
    let assignedIp = '';
    let assignedRssi: number | undefined;
    let assignedSsid: string | undefined;
    const maxPollAttempts = 20; // 20 attempts * 1200ms = 24 seconds for router DHCP

    // Optional notification listener if supported
    let unsubscribeMonitor: (() => void) | undefined;
    if (typeof session.statusChar?.monitor === 'function') {
      try {
        unsubscribeMonitor = session.statusChar.monitor((data: Uint8Array) => {
          try {
            const decoder = new TextDecoder('utf-8');
            const respStr = decoder.decode(data).trim();
            if (respStr.startsWith('{')) {
              const resp = JSON.parse(respStr);
              if (resp.status === 'CONNECTED' && resp.ip && resp.ip !== '0.0.0.0') {
                assignedIp = resp.ip;
                if (typeof resp.rssi === 'number') assignedRssi = resp.rssi;
                if (resp.ssid) assignedSsid = resp.ssid;
              }
            }
          } catch {}
        });
      } catch {}
    }

    try {
      for (let i = 0; i < maxPollAttempts; i++) {
        if (assignedIp) break;

        await new Promise((r) => setTimeout(r, 1200));
        onProgress?.('OBTAINING_IP', `Awaiting DHCP IP address assignment (${i + 1}/${maxPollAttempts})...`);

        if (session.statusChar) {
          try {
            const val = await session.statusChar.readValue();
            if (val && val.length > 0) {
              const decoder = new TextDecoder('utf-8');
              const rawStr = decoder.decode(val).trim();
              if (rawStr.startsWith('{')) {
                const resp = JSON.parse(rawStr);

                if (resp.status === 'CONNECTED' && resp.ip && resp.ip !== '0.0.0.0') {
                  assignedIp = resp.ip;
                  if (typeof resp.rssi === 'number') assignedRssi = resp.rssi;
                  if (resp.ssid) assignedSsid = resp.ssid;
                  break;
                } else if (resp.status === 'AUTH_FAILED') {
                  throw new Error('Wi-Fi connection failed: Incorrect Wi-Fi password or authentication rejected.');
                } else if (resp.status === 'SSID_NOT_FOUND') {
                  throw new Error(`Wi-Fi connection failed: Network "${creds.ssid}" not found in range.`);
                } else if (resp.status === 'TIMEOUT') {
                  throw new Error(`Wi-Fi connection timed out: ESP32 could not connect to "${creds.ssid}".`);
                }
              }
            }
          } catch (e: any) {
            if (e.message && (e.message.includes('Wi-Fi connection') || e.message.includes('timed out'))) throw e;
          }
        }
      }
    } finally {
      if (unsubscribeMonitor) {
        try {
          unsubscribeMonitor();
        } catch {}
      }
    }

    // STRICT CHECK: ESP32 must have confirmed real connection
    if (!assignedIp || assignedIp === '0.0.0.0') {
      throw new Error(
        `Wi-Fi connection timed out: The ESP32 hardware did not confirm router connection to "${creds.ssid}". Ensure the router is 2.4GHz and credentials are correct.`
      );
    }

    onProgress?.('SUCCESS', `Connected to Wi-Fi successfully! IP: ${assignedIp}`);

    return {
      success: true,
      ipAddress: assignedIp,
      deviceId: session.device.id,
      model: session.device.product.model,
      rssi: assignedRssi,
      ssid: assignedSsid || creds.ssid,
    };
  }
}
