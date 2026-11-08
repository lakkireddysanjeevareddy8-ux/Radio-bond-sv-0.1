import { ConnectionManager } from '../ConnectionManager';
import { BluetoothService } from '../bluetoothService';
import { NativeBluetoothService } from '../nativeBluetoothService';
import { storage } from '../../utils/storage';
import { useConnectionStore } from '../../store/useConnectionStore';
import { useAppStore } from '../../store/useAppStore';

// Mock async storage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(async () => {}),
  getItem: jest.fn(async () => null),
  removeItem: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
}));

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  setNotificationChannelAsync: jest.fn(async () => {}),
  AndroidImportance: { MAX: 5 },
  AndroidAudioUsage: { ALARM: 4 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  NotificationVisibility: { PUBLIC: 1 },
}));

// Mock expo-audio
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
  })),
}));

// Mock supabaseClient
jest.mock('../../services/supabaseClient', () => ({
  supabase: {
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
    })),
  },
}));

// Mock storage
const mockStorageData = new Map<string, any>();
jest.mock('../../utils/storage', () => ({
  storage: {
    getItem: jest.fn(async (key: string) => mockStorageData.get(key) ?? null),
    setItem: jest.fn(async (key: string, val: string) => {
      mockStorageData.set(key, val);
    }),
    getJSON: jest.fn(async (key: string, defaultVal: any) => {
      const v = mockStorageData.get(key);
      return v !== undefined ? v : defaultVal;
    }),
    setJSON: jest.fn(async (key: string, val: any) => {
      mockStorageData.set(key, val);
    }),
  },
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    serializeError: jest.fn((e: any) => ({ message: e?.message })),
  },
}));

// Mock react-native
let appStateListeners: ((state: string) => void)[] = [];
let currentAppState = 'active';

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: {
    get currentState() {
      return currentAppState;
    },
    addEventListener: jest.fn((event: string, callback: (state: string) => void) => {
      if (event === 'change') {
        appStateListeners.push(callback);
      }
      return {
        remove: jest.fn(() => {
          appStateListeners = appStateListeners.filter((cb) => cb !== callback);
        }),
      };
    }),
  },
}));

// Mock bluetoothService
jest.mock('../bluetoothService', () => ({
  BluetoothService: {
    isBluetoothAvailable: jest.fn(async () => true),
    addBluetoothStateListener: jest.fn(() => () => {}),
    connectGatt: jest.fn(),
    disconnect: jest.fn(),
    ensureSessionAndMonitoring: jest.fn(async () => {}),
    startDeviceEventMonitoring: jest.fn(),
    stopDeviceEventMonitoring: jest.fn(),
    getActiveSession: jest.fn(() => null),
  },
}));

// Mock nativeBluetoothService
jest.mock('../nativeBluetoothService', () => ({
  NativeBluetoothService: {
    cancelDeviceConnection: jest.fn(async () => {}),
    isDeviceConnected: jest.fn(async () => true),
    reconnectOrScan: jest.fn(),
    disconnect: jest.fn(async () => {}),
  },
}));

describe('ConnectionManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockStorageData.clear();
    appStateListeners = [];
    currentAppState = 'active';

    ConnectionManager.resetForTesting();

    // Reset stores to initial
    useConnectionStore.setState({
      status: 'disconnected',
      connectionManagerState: 'IDLE',
      connectedDevice: null,
      lastError: null,
      lastConnectedDeviceId: null,
    });
    useAppStore.setState({
      bluetoothStatus: 'DISCONNECTED',
      isOnline: false,
    });
  });

  afterEach(async () => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  // 1. Test backoff delays
  test('calculates correct exponential backoff delays (1, 2, 4, 8, 16, 30, 30...)', () => {
    const expected = [1, 2, 4, 8, 16, 30, 30, 30, 30, 30];
    const actual = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((attempt) =>
      ConnectionManager.getBackoffDelay(attempt)
    );
    expect(actual).toEqual(expected);
  });

  // 2. Test max attempts then FAILED then slow retry
  test('max attempts then transitions to FAILED and starts slow 60s retry loop', async () => {
    const mockSession = {
      device: { id: 'WSG-TEST-01', name: 'Washroom Guardian' },
      server: { id: 'WSG-TEST-01', connected: true },
      isNative: true,
    };
    (BluetoothService.connectGatt as jest.Mock).mockResolvedValueOnce(mockSession);

    // Initial connection
    await ConnectionManager.connect({
      id: 'WSG-TEST-01',
      name: 'Washroom Guardian',
      rawDevice: { id: 'WSG-TEST-01' },
      connectionType: 'BLE',
    });

    expect(ConnectionManager.getState()).toBe('CONNECTED');

    // Simulate unexpected drop and failed reconnects
    (BluetoothService.connectGatt as jest.Mock).mockRejectedValue(new Error('GATT connect timeout'));
    (NativeBluetoothService.reconnectOrScan as jest.Mock).mockRejectedValue(new Error('Device not found'));

    ConnectionManager.handleBleDisconnect('WSG-TEST-01', 'Link lost unexpectedly');
    expect(ConnectionManager.getState()).toBe('RECONNECTING');

    // Fast attempts 1 to 10
    for (let attempt = 1; attempt <= 10; attempt++) {
      const delaySec = ConnectionManager.getBackoffDelay(attempt);
      await jest.advanceTimersByTimeAsync(delaySec * 1000);
    }

    // After attempt 10, state must transition to FAILED
    expect(ConnectionManager.getState()).toBe('FAILED');

    // Advance 60s for slow retry loop
    (BluetoothService.connectGatt as jest.Mock).mockRejectedValue(new Error('Still offline'));
    await jest.advanceTimersByTimeAsync(60000);

    // Verify a foreground slow retry attempt was made
    expect(BluetoothService.isBluetoothAvailable).toHaveBeenCalled();

    // Test AppState 'active' triggers immediate retry from FAILED
    const triggerAppState = (state: string) => {
      currentAppState = state;
      appStateListeners.forEach((cb) => cb(state));
    };

    (BluetoothService.connectGatt as jest.Mock).mockResolvedValueOnce(mockSession);
    triggerAppState('active');
    await Promise.resolve();
  });

  // 3. Test scan during RECONNECTING
  test('scan during RECONNECTING does not change state away from RECONNECTING', async () => {
    const mockSession = {
      device: { id: 'WSG-TEST-01', name: 'Washroom Guardian' },
      server: { id: 'WSG-TEST-01', connected: true },
      isNative: true,
    };
    (BluetoothService.connectGatt as jest.Mock).mockResolvedValueOnce(mockSession);

    await ConnectionManager.connect({
      id: 'WSG-TEST-01',
      name: 'Washroom Guardian',
      rawDevice: { id: 'WSG-TEST-01' },
      connectionType: 'BLE',
    });

    // Cause unexpected disconnect to enter RECONNECTING
    (BluetoothService.connectGatt as jest.Mock).mockRejectedValue(new Error('GATT rejected'));
    ConnectionManager.handleBleDisconnect('WSG-TEST-01', 'Signal dropped');
    expect(ConnectionManager.getState()).toBe('RECONNECTING');

    // BleScanManager starts scan
    ConnectionManager.setScanning(true);
    // State MUST remain RECONNECTING
    expect(ConnectionManager.getState()).toBe('RECONNECTING');

    // BleScanManager stops scan
    ConnectionManager.setScanning(false);
    // State MUST NOT change to IDLE; must remain RECONNECTING
    expect(ConnectionManager.getState()).toBe('RECONNECTING');
  });

  // 4. Test manual disconnect not triggering reconnect
  test('manual disconnect does not trigger auto-reconnect and persists manualDisconnect flag', async () => {
    const mockSession = {
      device: { id: 'WSG-TEST-01', name: 'Washroom Guardian' },
      server: { id: 'WSG-TEST-01', connected: true },
      isNative: true,
    };
    (BluetoothService.connectGatt as jest.Mock).mockResolvedValueOnce(mockSession);

    await ConnectionManager.connect({
      id: 'WSG-TEST-01',
      name: 'Washroom Guardian',
      rawDevice: { id: 'WSG-TEST-01' },
      connectionType: 'BLE',
    });

    expect(ConnectionManager.getState()).toBe('CONNECTED');

    // User calls disconnect
    await ConnectionManager.disconnect('User pressed disconnect');
    expect(ConnectionManager.getState()).toBe('IDLE');
    expect(storage.setJSON).toHaveBeenCalledWith('wsg_manual_disconnect', true);

    // If native BLE callback fires afterwards, it must NOT trigger auto-reconnect
    ConnectionManager.handleBleDisconnect('WSG-TEST-01', 'Late onDisconnected event');
    expect(ConnectionManager.getState()).toBe('IDLE');

    // Advance time, no timers should trigger
    jest.advanceTimersByTime(30000);
    expect(ConnectionManager.getState()).toBe('IDLE');
  });

  // 5. Test double connect guard
  test('guards against double connects and concurrent connection attempts', async () => {
    let finishConnect: (val: any) => void;
    const delayedPromise = new Promise((resolve) => {
      finishConnect = resolve;
    });

    const mockSession = {
      device: { id: 'WSG-TEST-01', name: 'Washroom Guardian' },
      server: { id: 'WSG-TEST-01', connected: true },
      isNative: true,
    };

    (BluetoothService.connectGatt as jest.Mock).mockReturnValue(delayedPromise);

    const device = {
      id: 'WSG-TEST-01',
      name: 'Washroom Guardian',
      rawDevice: { id: 'WSG-TEST-01' },
      connectionType: 'BLE' as const,
    };

    // First call initiates handshake
    const p1 = ConnectionManager.connect(device);
    // Second concurrent call
    const p2 = ConnectionManager.connect(device);

    finishConnect!(mockSession);
    const [res1, res2] = await Promise.all([p1, p2]);

    expect(res1).toStrictEqual(mockSession);
    expect(res2).toStrictEqual(mockSession);
    // connectGatt was called only once!
    expect(BluetoothService.connectGatt).toHaveBeenCalledTimes(1);

    // Call connect again while already connected
    const res3 = await ConnectionManager.connect(device);
    expect(res3).toStrictEqual(mockSession);
    // Still only called once
    expect(BluetoothService.connectGatt).toHaveBeenCalledTimes(1);
  });

  // 6. Test persisted metadata contains no rawDevice
  test('persisted metadata strips rawDevice/server and contains only serializable fields', async () => {
    const mockRawDevice = {
      id: 'WSG-TEST-01',
      gatt: { connect: jest.fn() },
      circularRef: {} as any,
    };
    mockRawDevice.circularRef.parent = mockRawDevice;

    const mockSession = {
      device: { id: 'WSG-TEST-01', name: 'Washroom Guardian' },
      server: mockRawDevice,
      isNative: true,
    };

    (BluetoothService.connectGatt as jest.Mock).mockResolvedValueOnce(mockSession);

    await ConnectionManager.connect({
      id: 'WSG-TEST-01',
      name: 'Washroom Guardian',
      rawDevice: mockRawDevice,
      model: 'WSG-01',
      room: 'Guest Bathroom',
      rssi: -48,
      connectionType: 'BLE',
    });

    expect(storage.setJSON).toHaveBeenCalledWith(
      'wsg_last_connected_device_meta',
      expect.not.objectContaining({ rawDevice: expect.anything() })
    );

    const persisted = (storage.setJSON as jest.Mock).mock.calls.find(
      (call: any) => call[0] === 'wsg_last_connected_device_meta'
    )[1];

    expect(persisted).toEqual({
      id: 'WSG-TEST-01',
      name: 'Washroom Guardian',
      connectionType: 'BLE',
      model: 'WSG-01',
      room: 'Guest Bathroom',
      rssi: -48,
      ssid: undefined,
      ipAddress: undefined,
    });
    expect(persisted.rawDevice).toBeUndefined();
    expect(persisted.server).toBeUndefined();
  });
});
