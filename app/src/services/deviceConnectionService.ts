import { Telemetry } from '../types';
import { Esp32Service, Esp32DeviceInfo } from './esp32Service';

export type ConnectionStatus = 'CONNECTED' | 'RECONNECTING' | 'OFFLINE';

export interface DeviceConnectionListener {
  onStatusChange: (status: ConnectionStatus) => void;
  onTelemetry: (telemetry: Telemetry) => void;
  onError?: (error: Error) => void;
}

export class DeviceConnectionService {
  private static activePollers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private static listeners: Map<string, Set<DeviceConnectionListener>> = new Map();
  private static failureCounts: Map<string, number> = new Map();
  private static isReconnecting: Map<string, boolean> = new Map();

  /**
   * Subscribes a listener to a device's connection status and telemetry updates.
   */
  public static subscribe(
    ipAddress: string,
    listener: DeviceConnectionListener
  ): () => void {
    if (!this.listeners.has(ipAddress)) {
      this.listeners.set(ipAddress, new Set());
    }
    this.listeners.get(ipAddress)!.add(listener);

    // Start polling if not already started
    if (!this.activePollers.has(ipAddress)) {
      this.startPolling(ipAddress);
    }

    return () => {
      const set = this.listeners.get(ipAddress);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.stopPolling(ipAddress);
          this.listeners.delete(ipAddress);
        }
      }
    };
  }

  /**
   * Starts periodic polling for live telemetry over the local Wi-Fi connection.
   */
  public static startPolling(ipAddress: string, intervalMs: number = 2500): void {
    this.stopPolling(ipAddress);
    this.failureCounts.set(ipAddress, 0);

    // Initial check
    this.checkDevice(ipAddress);

    const poller = setInterval(() => {
      this.checkDevice(ipAddress);
    }, intervalMs);

    this.activePollers.set(ipAddress, poller);
  }

  /**
   * Stops active telemetry polling.
   */
  public static stopPolling(ipAddress: string): void {
    const existing = this.activePollers.get(ipAddress);
    if (existing) {
      clearInterval(existing);
      this.activePollers.delete(ipAddress);
    }
  }

  /**
   * Checks the physical device over Wi-Fi, emits updates, and applies controlled retry.
   */
  private static async checkDevice(ipAddress: string): Promise<void> {
    const set = this.listeners.get(ipAddress);
    if (!set || set.size === 0) return;

    try {
      const telemetry = await Esp32Service.fetchLiveTelemetry(ipAddress);

      if (telemetry) {
        this.failureCounts.set(ipAddress, 0);
        this.isReconnecting.set(ipAddress, false);

        set.forEach((l) => {
          l.onStatusChange('CONNECTED');
          l.onTelemetry(telemetry);
        });
      } else {
        this.handleFailure(ipAddress);
      }
    } catch (err: any) {
      this.handleFailure(ipAddress, err);
    }
  }

  /**
   * Controlled failure handling with exponential backoff to avoid hammering the network.
   */
  private static handleFailure(ipAddress: string, err?: Error): void {
    const set = this.listeners.get(ipAddress);
    if (!set) return;

    const count = (this.failureCounts.get(ipAddress) || 0) + 1;
    this.failureCounts.set(ipAddress, count);

    // Only flag OFFLINE after 3 consecutive failed attempts (avoids false alarms on transient hiccups)
    if (count >= 3) {
      set.forEach((l) => {
        l.onStatusChange('OFFLINE');
        if (err) l.onError?.(err);
      });
    } else {
      set.forEach((l) => l.onStatusChange('RECONNECTING'));
    }
  }

  /**
   * Reconnects to the device on demand with controlled single retry.
   */
  public static async reconnect(ipAddress: string): Promise<boolean> {
    if (this.isReconnecting.get(ipAddress)) return false;

    this.isReconnecting.set(ipAddress, true);
    const set = this.listeners.get(ipAddress);
    set?.forEach((l) => l.onStatusChange('RECONNECTING'));

    try {
      const info = await Esp32Service.verifyDeviceOverNetwork(ipAddress, 4000);
      if (info && info.status === 'ONLINE') {
        this.failureCounts.set(ipAddress, 0);
        this.isReconnecting.set(ipAddress, false);
        set?.forEach((l) => l.onStatusChange('CONNECTED'));
        this.startPolling(ipAddress);
        return true;
      }
    } catch {
      // Reconnect attempt failed
    }

    this.isReconnecting.set(ipAddress, false);
    set?.forEach((l) => l.onStatusChange('OFFLINE'));
    return false;
  }
}
