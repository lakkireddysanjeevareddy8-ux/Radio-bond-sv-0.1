import { Platform } from 'react-native';
import { ConnectedBleSession } from './bluetoothService';

export interface DiscoveredWifiNetwork {
  ssid: string;
  bssid?: string;
  rssi: number; // dBm, e.g. -48
  signalLevel: 'Excellent' | 'Good' | 'Fair';
  security: 'WPA3' | 'WPA2' | 'WPA' | 'OPEN';
  channel?: number;
}

export type WifiPermissionStatus = 'GRANTED' | 'DENIED' | 'PERMANENTLY_DENIED' | 'UNSUPPORTED';

export class WifiService {
  /**
   * Check whether Wi-Fi interface is enabled.
   */
  public static isWifiAvailable(): boolean {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine !== false;
  }

  /**
   * Request Android Wi-Fi runtime permissions (NEARBY_WIFI_DEVICES, ACCESS_FINE_LOCATION).
   */
  public static async requestPermissions(): Promise<WifiPermissionStatus> {
    if (Platform.OS === 'android') {
      try {
        // If native PermissionsAndroid is available in React Native environment
        const { PermissionsAndroid } = require('react-native');
        if (PermissionsAndroid && PermissionsAndroid.requestMultiple) {
          const permissionsToRequest: string[] = [
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ];

          // Android 13+ (API 33+) requires NEARBY_WIFI_DEVICES
          if (PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES) {
            permissionsToRequest.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
          }

          const results = await PermissionsAndroid.requestMultiple(permissionsToRequest);

          const fineLocation = results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
          const nearbyWifi = permissionsToRequest.includes(
            PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES
          )
            ? results[PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES]
            : PermissionsAndroid.RESULTS.GRANTED;

          if (
            fineLocation === PermissionsAndroid.RESULTS.GRANTED &&
            nearbyWifi === PermissionsAndroid.RESULTS.GRANTED
          ) {
            return 'GRANTED';
          }

          if (
            fineLocation === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ||
            nearbyWifi === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
          ) {
            return 'PERMANENTLY_DENIED';
          }

          return 'DENIED';
        }
      } catch (err) {
        console.warn('Native permission check exception:', err);
      }
    }

    // On web/desktop platforms, permissions are handled by the browser or system directly
    return 'GRANTED';
  }

  /**
   * Triggers system Wi-Fi flyout / settings when Wi-Fi is disabled.
   */
  public static openSystemWifiSettings(): void {
    // 1. Local Windows bridge (if on Windows)
    try {
      fetch('http://127.0.0.1:5005/open?target=wifi').catch(() => {});
    } catch {}

    // 2. Protocol launch
    try {
      if (typeof window !== 'undefined' && Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = 'ms-availablenetworks:';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch {}
  }

  /**
   * Opens App Settings if permissions were denied.
   */
  public static openAppSettings(): void {
    if (Platform.OS === 'web') {
      this.openSystemWifiSettings();
      return;
    }
    try {
      const { Linking } = require('react-native');
      if (Linking && Linking.openSettings) {
        Linking.openSettings().catch(() => {});
      }
    } catch {}
  }

  /**
   * Helper to determine signal strength tier from real dBm value.
   */
  public static calculateSignalLevel(rssi: number): 'Excellent' | 'Good' | 'Fair' {
    if (rssi >= -55) return 'Excellent';
    if (rssi >= -70) return 'Good';
    return 'Fair';
  }

  /**
   * Performs REAL Wi-Fi scanning.
   * Zero fake networks or mock SSIDs.
   * 1. If BLE session is available, queries ESP32 hardware 2.4GHz scan.
   * 2. If Android native, queries native WifiManager.
   * 3. If local desktop/web, queries the local bridge netsh wlan scanner.
   */
  public static async scanWifiNetworks(
    bleSession?: ConnectedBleSession | null,
    abortSignal?: AbortSignal
  ): Promise<DiscoveredWifiNetwork[]> {
    if (!this.isWifiAvailable()) {
      this.openSystemWifiSettings();
      throw new Error('WIFI_DISABLED');
    }

    const permission = await this.requestPermissions();
    if (permission === 'DENIED') {
      throw new Error('PERMISSION_DENIED');
    }
    if (permission === 'PERMANENTLY_DENIED') {
      throw new Error('PERMISSION_PERMANENTLY_DENIED');
    }

    const rawMap = new Map<string, DiscoveredWifiNetwork>();

    // 1. Physical Hardware Scan via ESP32 BLE (Commercial IoT Standard)
    if (bleSession && bleSession.provisionChar) {
      try {
        if (abortSignal?.aborted) return [];

        const scanCmd = JSON.stringify({ action: 'SCAN_WIFI' });
        const encoder = new TextEncoder();
        await bleSession.provisionChar.writeValue(encoder.encode(scanCmd));

        // Wait for ESP32 to scan 2.4GHz Wi-Fi channels (takes ~1.5 - 2s on hardware)
        await new Promise((r) => setTimeout(r, 1800));
        if (abortSignal?.aborted) return [];

        if (bleSession.statusChar) {
          const val = await bleSession.statusChar.readValue();
          const decoder = new TextDecoder('utf-8');
          const resText = decoder.decode(val);
          const parsed = JSON.parse(resText);

          if (Array.isArray(parsed.networks)) {
            for (const n of parsed.networks) {
              const ssid = (n.ssid || n.name || '').trim();
              if (ssid && ssid.length > 0) {
                const rssi = typeof n.rssi === 'number' ? n.rssi : -65;
                const sec = n.security === 'WPA3' ? 'WPA3' : n.auth === 0 ? 'OPEN' : 'WPA2';

                if (!rawMap.has(ssid) || (rawMap.get(ssid)?.rssi ?? -100) < rssi) {
                  rawMap.set(ssid, {
                    ssid,
                    bssid: n.bssid,
                    rssi,
                    signalLevel: this.calculateSignalLevel(rssi),
                    security: sec,
                    channel: n.channel,
                  });
                }
              }
            }
          }
        }
      } catch (scanErr) {
        console.warn('Physical BLE Wi-Fi scan query note:', scanErr);
      }
    }

    // 2. Native Android Wi-Fi Scanning (if running natively on Android device)
    if (Platform.OS === 'android') {
      try {
        const NativeWifi = (globalThis as any)?.NativeModules?.WifiManager;
        if (NativeWifi && NativeWifi.loadWifiList) {
          const nativeList = await NativeWifi.loadWifiList();
          if (Array.isArray(nativeList)) {
            for (const item of nativeList) {
              const ssid = (item.SSID || '').trim();
              if (ssid) {
                const rssi = typeof item.level === 'number' ? item.level : -60;
                const sec = item.capabilities?.includes('WPA3')
                  ? 'WPA3'
                  : item.capabilities?.includes('WPA')
                  ? 'WPA2'
                  : 'OPEN';

                if (!rawMap.has(ssid) || (rawMap.get(ssid)?.rssi ?? -100) < rssi) {
                  rawMap.set(ssid, {
                    ssid,
                    bssid: item.BSSID,
                    rssi,
                    signalLevel: this.calculateSignalLevel(rssi),
                    security: sec,
                  });
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('Native Android Wi-Fi scan exception:', e);
      }
    }

    // 3. Local OS Bridge Wi-Fi scan (fetches real networks via netsh on Windows/Dev)
    if (rawMap.size === 0) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const resp = await fetch('http://127.0.0.1:5005/scan-wifi', {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (resp.ok) {
          const data = await resp.json();
          if (data && Array.isArray(data.networks)) {
            for (const net of data.networks) {
              const ssid = (net.ssid || '').trim();
              if (ssid) {
                const rssi = typeof net.rssi === 'number' ? net.rssi : -65;
                const sec = net.security === 'WPA3' ? 'WPA3' : net.security === 'OPEN' ? 'OPEN' : 'WPA2';
                if (!rawMap.has(ssid) || (rawMap.get(ssid)?.rssi ?? -100) < rssi) {
                  rawMap.set(ssid, {
                    ssid,
                    bssid: net.bssid,
                    rssi,
                    signalLevel: this.calculateSignalLevel(rssi),
                    security: sec,
                    channel: net.channel,
                  });
                }
              }
            }
          }
        }
      } catch (bridgeErr) {
        // Bridge might not be active if running on physical device
      }
    }

    // Convert map to sorted array (highest RSSI first)
    const sortedList = Array.from(rawMap.values()).sort((a, b) => b.rssi - a.rssi);

    return sortedList;
  }
}
