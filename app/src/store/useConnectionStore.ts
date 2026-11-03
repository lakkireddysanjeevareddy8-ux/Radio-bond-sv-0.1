import { create } from 'zustand';
import { storage } from '../utils/storage';
import { useAppStore } from './useAppStore';
import { useDeviceStore, SavedDevice } from './useDeviceStore';
import { BluetoothService } from '../services/bluetoothService';
import { deviceService } from '../services/DeviceCommunicationService';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectedDeviceInfo {
  id: string;
  name: string;
  connectionType: 'BLE' | 'WIFI';
  model?: string;
  room?: string;
  rssi?: number;
  batteryLevel?: number;
  firmwareVersion?: string;
  ipAddress?: string;
  rawDevice?: any;
  isEarbuds?: boolean;
}

interface ConnectionState {
  status: ConnectionStatus;
  connectedDevice: ConnectedDeviceInfo | null;
  lastError: string | null;
  lastConnectedDeviceId: string | null;

  // Actions
  setConnecting: (device: Partial<ConnectedDeviceInfo> & { id: string; name: string }) => void;
  setConnected: (device: ConnectedDeviceInfo) => void;
  setDisconnected: (reason?: string) => void;
  setError: (error: string) => void;
  connect: (device: ConnectedDeviceInfo) => Promise<void>;
  disconnect: () => Promise<void>;
  initConnectionStore: () => Promise<void>;
}

const STORAGE_LAST_CONNECTED_ID = 'wsg_last_connected_device_id';
const STORAGE_LAST_CONNECTED_META = 'wsg_last_connected_device_meta';

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  status: 'disconnected',
  connectedDevice: null,
  lastError: null,
  lastConnectedDeviceId: null,

  setConnecting: (device) => {
    console.log(`[conn] connecting: "${device.name}" (${device.id})`);
    set({
      status: 'connecting',
      connectedDevice: {
        connectionType: 'BLE',
        ...device,
        id: device.id,
        name: device.name,
      },
      lastError: null,
    });
  },

  setConnected: (device) => {
    console.log(`[conn] connected: "${device.name}" (${device.id}) via ${device.connectionType}`);

    // 0. Single location: Ensure BLE characteristic discovery & monitoring is started, or Wi-Fi Realtime subscribed
    if (device.connectionType === 'BLE') {
      BluetoothService.ensureSessionAndMonitoring(device).catch((err) => {
        console.warn('[conn] ensureSessionAndMonitoring note:', err);
      });
    } else if (device.connectionType === 'WIFI') {
      if (device.id && device.id !== 'WSG-000001') {
        deviceService.connectToSupabaseDevice(device.id);
      }
    }

    // 1. Single source of truth updates useAppStore
    useAppStore.getState().setIsOnline(true);
    if (device.connectionType === 'BLE') {
      useAppStore.getState().setBluetoothStatus('CONNECTED');
    } else {
      useAppStore.getState().setWifiStatus('CONNECTED');
    }

    // 2. Sync to useDeviceStore so active device matches
    const saved: SavedDevice = {
      deviceId: device.id,
      name: device.name,
      model: device.model || (device.isEarbuds ? 'Bluetooth Audio Device' : 'WSG-01 Caregiver Unit'),
      room: device.room || 'Main Bathroom',
      isOnline: true,
      lastSeen: new Date().toLocaleTimeString(),
      firmwareVersion: device.firmwareVersion || 'v1.2.0-esp32',
      sensor: 'LD2410C',
      connectionType: device.connectionType,
      ipAddress: device.ipAddress,
      userRole: 'OWNER',
    };
    useDeviceStore.getState().addOrUpdateDevice(saved);
    useDeviceStore.getState().setActiveDeviceId(device.id);

    // 3. Attach Web GATT disconnect listener if available
    if (device.rawDevice && typeof device.rawDevice.addEventListener === 'function') {
      try {
        device.rawDevice.addEventListener(
          'gattserverdisconnected',
          () => {
            console.log(`[conn] disconnected: Web GATT disconnect event fired for "${device.name}"`);
            get().setDisconnected('Web GATT server disconnected');
          },
          { once: true }
        );
      } catch (e) {
        console.warn('[conn] Could not attach gattserverdisconnected listener:', e);
      }
    }

    // 4. Attach Native BLE disconnect listener if available
    if (device.rawDevice && typeof device.rawDevice.onDisconnected === 'function') {
      try {
        device.rawDevice.onDisconnected(() => {
          console.log(`[conn] disconnected: Native BLE disconnect event fired for "${device.name}"`);
          get().setDisconnected('Native BLE device disconnected');
        });
      } catch (e) {
        console.warn('[conn] Could not attach native onDisconnected listener:', e);
      }
    }

    // 5. Persist last connected device ID
    storage.setItem(STORAGE_LAST_CONNECTED_ID, device.id).catch(() => {});
    storage.setJSON(STORAGE_LAST_CONNECTED_META, {
      id: device.id,
      name: device.name,
      connectionType: device.connectionType,
      ipAddress: device.ipAddress,
      room: device.room,
    }).catch(() => {});

    set({
      status: 'connected',
      connectedDevice: device,
      lastError: null,
      lastConnectedDeviceId: device.id,
    });
  },

  setDisconnected: (reason = 'Disconnected') => {
    console.log(`[conn] disconnected: ${reason}`);

    // Remove active BLE event monitors
    BluetoothService.stopDeviceEventMonitoring();

    // Update single-writer stores
    useAppStore.getState().setIsOnline(false);
    useAppStore.getState().setBluetoothStatus('DISCONNECTED');

    // Update active device in useDeviceStore
    const currentDevice = get().connectedDevice;
    if (currentDevice) {
      const devStore = useDeviceStore.getState();
      const updated = devStore.devices.map((d) =>
        d.deviceId === currentDevice.id ? { ...d, isOnline: false } : d
      );
      useDeviceStore.setState({ devices: updated });
    }

    set({
      status: 'disconnected',
      connectedDevice: null,
      lastError: null,
    });
  },

  setError: (error) => {
    console.log(`[conn] error: ${error}`);
    useAppStore.getState().setIsOnline(false);
    set({
      status: 'error',
      lastError: error,
    });
  },

  connect: async (device) => {
    get().setConnecting(device);
    try {
      if (device.rawDevice?.gatt) {
        if (!device.rawDevice.gatt.connected) {
          await device.rawDevice.gatt.connect();
        }
      }
      get().setConnected(device);
    } catch (err: any) {
      get().setError(err?.message || 'Failed to establish connection');
      throw err;
    }
  },

  disconnect: async () => {
    const current = get().connectedDevice;
    console.log(`[conn] disconnect requested for: "${current?.name || 'current device'}"`);

    if (current?.rawDevice?.gatt) {
      try {
        if (current.rawDevice.gatt.connected) {
          current.rawDevice.gatt.disconnect();
        }
      } catch (e) {
        console.warn('[conn] GATT disconnect error:', e);
      }
    }

    get().setDisconnected('User initiated disconnect');
  },

  initConnectionStore: async () => {
    try {
      // 1. Clean up stale saved device with a WIFI type and no valid IP on startup
      const devStore = useDeviceStore.getState();
      if (devStore.devices && devStore.devices.length > 0) {
        let cleaned = false;
        const updatedDevs = devStore.devices.map((d) => {
          if (
            d.connectionType === 'WIFI' &&
            (!d.ipAddress || d.ipAddress === '0.0.0.0' || !d.ipAddress.trim())
          ) {
            cleaned = true;
            return { ...d, isOnline: false, ipAddress: undefined };
          }
          return d;
        });
        if (cleaned) {
          console.log('[conn] Cleaned up stale Wi-Fi devices without valid IP address');
          useDeviceStore.setState({ devices: updatedDevs });
        }
      }

      // 2. Load last connected device ID for auto-reconnect tracking
      const lastId = await storage.getItem(STORAGE_LAST_CONNECTED_ID);
      if (lastId) {
        set({ lastConnectedDeviceId: lastId });
      }

      // Ensure initial status starts strictly disconnected until a real connection succeeds
      set({ status: 'disconnected', connectedDevice: null });
      useAppStore.getState().setIsOnline(false);
      useAppStore.getState().setBluetoothStatus('DISCONNECTED');
    } catch (e) {
      console.warn('[useConnectionStore] init error:', e);
    }
  },
}));
