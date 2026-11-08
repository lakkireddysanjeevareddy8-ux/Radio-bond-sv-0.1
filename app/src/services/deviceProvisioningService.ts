import { ConnectedBleSession, BluetoothService } from './bluetoothService';
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
          if (
            parsed.status === 'CONNECTED' ||
            parsed.state === 'WIFI_CONNECTED' ||
            parsed.status === 'WIFI_CONNECTED'
          ) {
            return 'CONNECTED';
          }
          if (parsed.status === 'CONNECTING' || parsed.state === 'WIFI_CONNECTING') {
            return 'CONNECTING';
          }
          if (
            parsed.status === 'AUTH_FAILED' ||
            parsed.status === 'TIMEOUT' ||
            parsed.status === 'WIFI_TIMEOUT' ||
            parsed.status === 'NO_SSID' ||
            parsed.state === 'WIFI_FAILED'
          ) {
            return 'FAILED';
          }
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

    console.log('[Provisioning] Starting WSG-01 Wi-Fi provisioning:', {
      deviceId: session.device.id,
      deviceName: session.device.name,
      ssid: creds.ssid.trim(),
      provisionChar: session.provisionChar.uuid,
      statusChar: session.statusChar?.uuid,
    });

    onProgress?.('SENDING_CREDENTIALS', 'Writing network credentials to ESP32 provisioning characteristic...');

    const encoder = new TextEncoder();
    const encodedBytes = encoder.encode(payload);

    try {
      if (session.provisionChar.writeValueWithResponse) {
        console.log('[Provisioning] Writing PROV_WIFI via writeValueWithResponse to:', session.provisionChar.uuid);
        await session.provisionChar.writeValueWithResponse(encodedBytes);
      } else {
        console.log('[Provisioning] Writing PROV_WIFI via writeValue to:', session.provisionChar.uuid);
        await session.provisionChar.writeValue(encodedBytes);
      }
      console.log('[Provisioning] PROV_WIFI write completed successfully');
    } catch (writeErr: any) {
      console.error('[Provisioning] PROV_WIFI write failed:', writeErr?.message || writeErr);
      throw new Error(`Failed to write credentials to device: ${writeErr.message || 'GATT write rejected'}`);
    }

    onProgress?.('CONNECTING_ROUTER', `ESP32 is attempting connection to "${creds.ssid}"...`);

    // Poll status characteristic and listen for real IP assignment
    let assignedIp = '';
    let assignedRssi: number | undefined;
    let assignedSsid: string | undefined;
    const maxPollAttempts = 20; // 20 attempts * 1200ms = 24 seconds for router DHCP

    // Notification listener via BluetoothService helper
    let monitorError: string | null = null;
    const unsubscribeNotifications = BluetoothService.addNotificationListener((resp) => {
      if (!resp) return;
      const status = String(resp.status || '').toUpperCase();
      const state = String(resp.state || '').toUpperCase();

      const isConnected =
        status === 'CONNECTED' ||
        state === 'WIFI_CONNECTED' ||
        status === 'WIFI_CONNECTED';

      if (isConnected && resp.ip && resp.ip !== '0.0.0.0') {
        assignedIp = resp.ip;
        if (typeof resp.rssi === 'number') assignedRssi = resp.rssi;
        if (resp.ssid) assignedSsid = resp.ssid;
        console.log('[Provisioning] Hardware reported Wi-Fi connected via notification:', assignedIp);
      } else if (status === 'AUTH_FAILED') {
        monitorError = 'Incorrect Wi-Fi password';
      } else if (status === 'NO_SSID' || status === 'SSID_NOT_FOUND') {
        monitorError = 'Network not found (make sure it is 2.4 GHz)';
      } else if (status === 'WIFI_TIMEOUT' || status === 'TIMEOUT') {
        monitorError = 'Connection timed out';
      } else if (status === 'FAILED' || state === 'WIFI_FAILED') {
        monitorError = resp.error || 'Wi-Fi connection failed';
      }
    });

    try {
      for (let i = 0; i < maxPollAttempts; i++) {
        if (assignedIp) break;
        if (monitorError) throw new Error(monitorError);

        await new Promise((r) => setTimeout(r, 1200));
        onProgress?.('OBTAINING_IP', `Awaiting DHCP IP address assignment (${i + 1}/${maxPollAttempts})...`);

        if (monitorError) throw new Error(monitorError);

        if (session.statusChar && typeof session.statusChar.readValue === 'function') {
          try {
            const val = await session.statusChar.readValue();
            if (val && val.length > 0) {
              const decoder = new TextDecoder('utf-8');
              const rawStr = decoder.decode(val).trim();
              if (rawStr.startsWith('{')) {
                const resp = JSON.parse(rawStr);
                const status = String(resp.status || '').toUpperCase();
                const state = String(resp.state || '').toUpperCase();

                const isConnected =
                  status === 'CONNECTED' ||
                  state === 'WIFI_CONNECTED' ||
                  status === 'WIFI_CONNECTED';

                if (isConnected && resp.ip && resp.ip !== '0.0.0.0') {
                  assignedIp = resp.ip;
                  if (typeof resp.rssi === 'number') assignedRssi = resp.rssi;
                  if (resp.ssid) assignedSsid = resp.ssid;
                  console.log('[Provisioning] Hardware reported Wi-Fi connected via readValue:', assignedIp);
                  break;
                } else if (status === 'AUTH_FAILED') {
                  throw new Error('Incorrect Wi-Fi password');
                } else if (status === 'NO_SSID' || status === 'SSID_NOT_FOUND') {
                  throw new Error('Network not found (make sure it is 2.4 GHz)');
                } else if (status === 'WIFI_TIMEOUT' || status === 'TIMEOUT') {
                  throw new Error('Connection timed out');
                } else if (status === 'FAILED' || state === 'WIFI_FAILED') {
                  throw new Error(resp.error || 'Wi-Fi connection failed');
                }
              }
            }
          } catch (e: any) {
            if (
              e.message &&
              (e.message.includes('Incorrect Wi-Fi password') ||
                e.message.includes('Network not found') ||
                e.message.includes('timed out') ||
                e.message.includes('failed'))
            ) {
              throw e;
            }
          }
        }
      }
    } finally {
      unsubscribeNotifications();
    }

    // STRICT CHECK: ESP32 must have confirmed real connection
    if (!assignedIp || assignedIp === '0.0.0.0') {
      throw new Error(
        `Wi-Fi connection timed out: The ESP32 hardware did not confirm router connection to "${creds.ssid}". Ensure the router is 2.4GHz and credentials are correct.`
      );
    }

    onProgress?.('SUCCESS', `Connected to Wi-Fi successfully! IP: ${assignedIp}`);

    // Verify Event Characteristic notification listener remains active after Wi-Fi provisioning
    if (session) {
      BluetoothService.startDeviceEventMonitoring(session);
    }

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
