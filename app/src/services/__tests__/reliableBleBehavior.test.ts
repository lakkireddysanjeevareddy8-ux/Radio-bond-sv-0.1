import { Platform, Linking, PermissionsAndroid, AppState } from 'react-native';
import { BatteryOptimizationService } from '../BatteryOptimizationService';
import { BleForegroundService } from '../BleForegroundService';
import { PermissionService } from '../PermissionService';
import { ConnectionManager } from '../ConnectionManager';
import { BluetoothService } from '../bluetoothService';
import { NativeBluetoothService } from '../nativeBluetoothService';
import { storage } from '../../utils/storage';

// In-memory mock storage
const mockStore = new Map<string, any>();
jest.mock('../../utils/storage', () => ({
  storage: {
    getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, val: string) => {
      mockStore.set(key, val);
    }),
    getJSON: jest.fn(async (key: string, fallback: any) => {
      const v = mockStore.get(key);
      return v !== undefined ? v : fallback;
    }),
    setJSON: jest.fn(async (key: string, val: any) => {
      mockStore.set(key, val);
    }),
  },
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    serializeError: jest.fn((e: any) => ({ message: e?.message })),
  },
}));

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  setNotificationChannelAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async () => {}),
  dismissNotificationAsync: jest.fn(async () => {}),
  AndroidImportance: { LOW: 2, MAX: 5 },
  AndroidNotificationPriority: { LOW: 'low' },
  AndroidNotificationVisibility: { PUBLIC: 1 },
}));

// Mock bluetoothService & nativeBluetoothService
jest.mock('../bluetoothService', () => ({
  BluetoothService: {
    isBluetoothAvailable: jest.fn(async () => true),
    addBluetoothStateListener: jest.fn(() => () => {}),
  },
}));

jest.mock('../nativeBluetoothService', () => ({
  NativeBluetoothService: {
    getConnectedDevices: jest.fn(async () => []),
    reconnectOrScan: jest.fn(async () => ({
      id: 'TEST-DEV-ID',
      name: 'Safety Guardian Unit',
    })),
    connectGatt: jest.fn(async () => ({
      id: 'TEST-DEV-ID',
      name: 'Safety Guardian Unit',
    })),
    discoverServicesAndCharacteristics: jest.fn(async () => {}),
    disconnect: jest.fn(async () => {}),
  },
}));

describe('Reliable BLE Behavior across OS & Phone States', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  describe('BatteryOptimizationService', () => {
    it('tracks battery optimization prompt status once', async () => {
      expect(await BatteryOptimizationService.hasPrompted()).toBe(false);

      await BatteryOptimizationService.markPrompted();
      expect(await BatteryOptimizationService.hasPrompted()).toBe(true);
    });

    it('identifies Android applicability correctly', () => {
      (Platform as any).OS = 'android';
      expect(BatteryOptimizationService.isApplicable()).toBe(true);

      (Platform as any).OS = 'ios';
      expect(BatteryOptimizationService.isApplicable()).toBe(false);
    });

    it('launches android battery optimization intent with fallback to app settings', async () => {
      (Platform as any).OS = 'android';
      const sendIntentSpy = jest.spyOn(Linking, 'sendIntent').mockResolvedValue(undefined as never);

      await BatteryOptimizationService.openBatterySettings();
      expect(sendIntentSpy).toHaveBeenCalledWith('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');

      // Test fallback to openSettings if sendIntent throws
      sendIntentSpy.mockRejectedValueOnce(new Error('Intent failed'));
      const openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined as never);

      await BatteryOptimizationService.openBatterySettings();
      expect(openSettingsSpy).toHaveBeenCalled();
    });
  });

  describe('BleForegroundService', () => {
    beforeEach(() => {
      (Platform as any).OS = 'android';
    });

    it('creates dedicated low-importance background notification channel', async () => {
      const Notifications = require('expo-notifications');
      await BleForegroundService.initChannel();

      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        'ble_background_monitoring',
        expect.objectContaining({
          name: 'Safety Guardian Background Service',
          importance: 2, // AndroidImportance.LOW
          enableVibrate: false,
        })
      );
    });

    it('posts persistent ongoing notification on startForegroundNotification', async () => {
      const Notifications = require('expo-notifications');
      await BleForegroundService.startForegroundNotification('Bathroom Sensor');

      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: 'wsg_ble_foreground_service',
          content: expect.objectContaining({
            title: 'Washroom Safety Active',
            body: expect.stringContaining('Bathroom Sensor'),
            sticky: true,
            autoDismiss: false,
          }),
        })
      );
    });

    it('updates persistent notification with reconnecting state', async () => {
      const Notifications = require('expo-notifications');
      await BleForegroundService.startForegroundNotification('Bathroom Sensor');
      await BleForegroundService.updateForegroundNotification('Bathroom Sensor', true);

      expect(Notifications.scheduleNotificationAsync).toHaveBeenLastCalledWith(
        expect.objectContaining({
          identifier: 'wsg_ble_foreground_service',
          content: expect.objectContaining({
            body: 'Reconnecting to Bathroom Sensor...',
            sticky: true,
          }),
        })
      );
    });

    it('dismisses foreground notification on stopForegroundNotification', async () => {
      const Notifications = require('expo-notifications');
      await BleForegroundService.startForegroundNotification('Bathroom Sensor');
      await BleForegroundService.stopForegroundNotification();

      expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('wsg_ble_foreground_service');
    });
  });

  describe('PermissionService - Android 12+ vs Older Android', () => {
    afterEach(() => {
      (Platform as any).OS = 'android';
    });

    it('requests BLUETOOTH_SCAN and BLUETOOTH_CONNECT on Android 12+ (API 31+)', async () => {
      (Platform as any).OS = 'android';
      (Platform as any).Version = 31;

      const requestMultipleSpy = jest
        .spyOn(PermissionsAndroid, 'requestMultiple')
        .mockResolvedValueOnce({
          [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.GRANTED,
          [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.GRANTED,
        } as any);

      const result = await PermissionService.requestBluetoothPermission();
      expect(result).toBe('granted');
      expect(requestMultipleSpy).toHaveBeenCalledWith([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
    });

    it('detects permanently denied (blocked) permissions on Android 12+', async () => {
      (Platform as any).OS = 'android';
      (Platform as any).Version = 33;

      jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValueOnce({
        [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
        [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.DENIED,
      } as any);

      const result = await PermissionService.requestBluetoothPermission();
      expect(result).toBe('blocked');
    });

    it('requests Location permissions on Android < 12 (API < 31)', async () => {
      (Platform as any).OS = 'android';
      (Platform as any).Version = 29;

      const requestMultipleSpy = jest
        .spyOn(PermissionsAndroid, 'requestMultiple')
        .mockResolvedValueOnce({
          [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]: PermissionsAndroid.RESULTS.GRANTED,
          [PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION]: PermissionsAndroid.RESULTS.GRANTED,
        } as any);

      const result = await PermissionService.requestBluetoothPermission();
      expect(result).toBe('granted');
      expect(requestMultipleSpy).toHaveBeenCalledWith([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]);
    });
  });
});

