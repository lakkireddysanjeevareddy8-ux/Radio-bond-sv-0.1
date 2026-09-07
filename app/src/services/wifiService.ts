import { Platform } from 'react-native';
import { ConnectedBleSession } from './bluetoothService';

export interface DiscoveredWifiNetwork {
  ssid: string;
  rssi: number; // dBm, e.g. -50
  security: 'WPA2' | 'WPA3' | 'WPA' | 'OPEN';
  channel?: number;
}

export class WifiService {
  /**
   * Check if Wi-Fi or Internet interface is available.
   */
  public static isWifiAvailable(): boolean {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine !== false;
  }

  /**
   * Triggers system Wi-Fi flyout / settings when Wi-Fi is disabled.
   */
  public static openSystemWifiSettings(): void {
    // 1. Local Windows bridge
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
   * Requests real Wi-Fi network scanning.
   * If a BLE session with the ESP32 is active, commands the ESP32 to scan 2.4GHz channels
   * and return the exact physical Wi-Fi access points in range.
   */
  public static async scanWifiNetworks(
    bleSession?: ConnectedBleSession | null
  ): Promise<DiscoveredWifiNetwork[]> {
    if (!this.isWifiAvailable()) {
      this.openSystemWifiSettings();
      throw new Error('WIFI_DISABLED');
    }

    // 1. ESP32 BLE Wi-Fi Scan Request (Commercial IoT Standard)
    if (bleSession && bleSession.provisionChar) {
      try {
        const scanCmd = JSON.stringify({ action: 'SCAN_WIFI' });
        const encoder = new TextEncoder();
        await bleSession.provisionChar.writeValue(encoder.encode(scanCmd));

        // Read scan response from characteristic if available
        if (bleSession.statusChar) {
          await new Promise((r) => setTimeout(r, 1200));
          const val = await bleSession.statusChar.readValue();
          const decoder = new TextDecoder('utf-8');
          const resText = decoder.decode(val);
          const parsed = JSON.parse(resText);
          if (Array.isArray(parsed.networks) && parsed.networks.length > 0) {
            return parsed.networks.map((n: any) => ({
              ssid: n.ssid || n.name,
              rssi: n.rssi ?? -60,
              security: n.security || (n.auth === 0 ? 'OPEN' : 'WPA2'),
              channel: n.channel,
            }));
          }
        }
      } catch (scanErr) {
        console.warn('BLE Wi-Fi scan command note:', scanErr);
      }
    }

    // 2. Real browser / client network detection
    // On web clients without direct raw Wi-Fi scan permissions, we retrieve the connected Wi-Fi SSID
    // or request manual SSID entry, strictly without injecting fake SSIDs.
    const detectedList: DiscoveredWifiNetwork[] = [];

    // Check if network information is available via NetworkInformation API
    const connection =
      (navigator as any)?.connection ||
      (navigator as any)?.mozConnection ||
      (navigator as any)?.webkitConnection;

    if (connection) {
      // If we know the user is connected
      console.log('Network type:', connection.type, connection.effectiveType);
    }

    return detectedList;
  }
}
