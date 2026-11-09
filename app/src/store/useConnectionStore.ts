import { create } from 'zustand';
import { storage } from '../utils/storage';
import { useAppStore } from './useAppStore';
import { useDeviceStore, SavedDevice } from './useDeviceStore';
import { BluetoothService } from '../services/bluetoothService';
import { deviceService } from '../services/DeviceCommunicationService';
import { logger, formatUserBleError } from '../utils/logger';
import {
  ConnectionStatus,
  ConnectionManagerState,
  ConnectedDeviceInfo,
} from '../types/connection';

export type { ConnectionStatus, ConnectionManagerState, ConnectedDeviceInfo };

interface ConnectionState {
  status: ConnectionStatus;
  connectionManagerState: ConnectionManagerState;
  connectedDevice: ConnectedDeviceInfo | null;
  lastError: string | null;
  lastConnectedDeviceId: string | null;

  // Actions
  setConnecting: (device: Partial<ConnectedDeviceInfo> & { id: string; name: string }, reason?: string) => void;
  setConnected: (device: ConnectedDeviceInfo, reason?: string) => void;
  setDisconnected: (reason?: string) => void;
  setError: (error: string | any, reason?: string) => void;
  connect: (device: any) => Promise<any>;
  disconnect: () => Promise<void>;
  reconnect: (preferredId?: string) => Promise<void>;
  initConnectionStore: () => Promise<void>;
}

const STORAGE_LAST_CONNECTED_ID = 'wsg_last_connected_device_id';
const STORAGE_LAST_CONNECTED_META = 'wsg_last_connected_device_meta';

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  status: 'disconnected',
  connectionManagerState: 'IDLE',
  connectedDevice: null,
  lastError: null,
  lastConnectedDeviceId: null,

  setConnecting: (device, reason = 'initiating connection') => {
    logger.info('CONN_STORE', `Connection status: connecting ("${device.name}" - ${device.id}) (reason: ${reason})`, device);
    console.log(`[conn] status -> connecting (reason: ${reason})`);
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

  setConnected: (device, reason = 'connection established') => {
    logger.info('CONN_STORE', `Connection status: connected ("${device.name}" - ${device.id}) via ${device.connectionType} (reason: ${reason})`, device);
    console.log(`[conn] status -> connected (reason: ${reason})`);
    console.log(`[conn] connected: "${device.name}" (${device.id}) via ${device.connectionType}`);

    // 0. Single location: Ensure BLE characteristic discovery & monitoring is started, or Wi-Fi Realtime subscribed
    if (device.connectionType === 'BLE') {
      BluetoothService.ensureSessionAndMonitoring(device).catch((err) => {
        logger.warn('CONN_STORE', `ensureSessionAndMonitoring note for ${device.id}`, logger.serializeError(err));
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

    // 3. Attach Web GATT disconnect listener if available (guarded against duplicates)
    if (device.rawDevice && typeof device.rawDevice.addEventListener === 'function') {
      if (!device.rawDevice._gattDisconnectedAttached) {
        device.rawDevice._gattDisconnectedAttached = true;
        try {
          device.rawDevice.addEventListener(
            'gattserverdisconnected',
            () => {
              logger.warn('CONN_STORE', `Web GATT disconnect event fired for "${device.name}"`);
              console.log(`[conn] disconnected: Web GATT disconnect event fired for "${device.name}"`);
              get().setDisconnected('Web GATT server disconnected');
            },
            { once: true }
          );
        } catch (e) {
          logger.warn('CONN_STORE', 'Could not attach gattserverdisconnected listener', logger.serializeError(e));
          console.warn('[conn] Could not attach gattserverdisconnected listener:', e);
        }
      }
    }

    // 4. Attach Native BLE disconnect listener if available (guarded against duplicates)
    if (device.rawDevice && typeof device.rawDevice.onDisconnected === 'function') {
      if (!device.rawDevice._onDisconnectedAttached) {
        device.rawDevice._onDisconnectedAttached = true;
        try {
          device.rawDevice.onDisconnected(() => {
            logger.warn('CONN_STORE', `Native BLE disconnect event fired for "${device.name}"`);
            console.log(`[conn] disconnected: Native BLE disconnect event fired for "${device.name}"`);
            get().setDisconnected('Native BLE device disconnected');
          });
        } catch (e) {
          logger.warn('CONN_STORE', 'Could not attach native onDisconnected listener', logger.serializeError(e));
          console.warn('[conn] Could not attach native onDisconnected listener:', e);
        }
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
    const currentDevice = get().connectedDevice;
    logger.warn('CONN_STORE', `Connection status: disconnected (${reason})`, {
      deviceId: currentDevice?.id,
      deviceName: currentDevice?.name,
      connectionType: currentDevice?.connectionType,
    });
    console.log(`[conn] status -> disconnected (reason: ${reason})`);
    console.log(`[conn] disconnected: ${reason} (Device: ${currentDevice?.name || 'none'} ID: ${currentDevice?.id || 'none'})`);
    console.log('[conn drop diagnostic]', {
      timestamp: new Date().toISOString(),
      reason,
      deviceId: currentDevice?.id,
      deviceName: currentDevice?.name,
      connectionType: currentDevice?.connectionType,
    });

    // Remove active BLE event monitors
    BluetoothService.stopDeviceEventMonitoring();

    // Update single-writer stores
    useAppStore.getState().setIsOnline(false);
    useAppStore.getState().setBluetoothStatus('DISCONNECTED');

    // Update active device in useDeviceStore
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

  setError: (error, reason = 'Connection error') => {
    const formatted = typeof error === 'string'
      ? formatUserBleError(error, error, 'connect')
      : formatUserBleError(error, undefined, 'connect');
    logger.error('CONN_STORE', `Connection status: error - ${formatted.display} (reason: ${reason})`, logger.serializeError(error));
    console.log(`[conn] status -> error (reason: ${reason})`);
    console.log(`[conn] error: ${formatted.display}`);
    useAppStore.getState().setIsOnline(false);
    set({
      status: 'error',
      lastError: formatted.display,
    });
  },

  connect: async (device) => {
    const { ConnectionManager } = require('../services/ConnectionManager');
    return await ConnectionManager.connect(device);
  },

  disconnect: async () => {
    const { ConnectionManager } = require('../services/ConnectionManager');
    return await ConnectionManager.disconnect();
  },

  reconnect: async (_preferredId?: string) => {
    const { ConnectionManager } = require('../services/ConnectionManager');
    return await ConnectionManager.retry();
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

// Dynamically synchronize reported real hardware ID into connection store without cyclic dependencies
if (typeof BluetoothService?.onHardwareId === 'function') {
  BluetoothService.onHardwareId((reportedDevId: string) => {
    const conn = useConnectionStore.getState().connectedDevice;
    if (conn && conn.id !== reportedDevId) {
      useConnectionStore.setState({
        connectedDevice: { ...conn, id: reportedDevId },
      });
    }
  });
}
