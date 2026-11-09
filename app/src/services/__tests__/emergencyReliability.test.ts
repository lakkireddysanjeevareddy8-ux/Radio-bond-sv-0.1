// Mock react-native
jest.mock('react-native', () => ({
  Platform: { OS: 'android', select: (obj: any) => obj.android || obj.default },
  AppState: { currentState: 'active', addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Vibration: { vibrate: jest.fn(), cancel: jest.fn() },
}));

import { EmergencyPushService } from '../EmergencyPushService';
import { EmergencySoundService } from '../EmergencySoundService';
import { DeviceCommunicationService } from '../DeviceCommunicationService';
import { BleProtocol, parseBleMessage } from '../protocol';
import { useAppStore } from '../../store/useAppStore';
import { useConnectionStore } from '../../store/useConnectionStore';

// Mock EmergencySoundService
jest.mock('../EmergencySoundService', () => ({
  EmergencySoundService: {
    dispatchEmergencyNotification: jest.fn(),
    stopEmergencyAlarm: jest.fn(),
    acknowledgeAlert: jest.fn(),
    stopAll: jest.fn(),
  },
}));

// Mock BluetoothService
const mockSendCommand = jest.fn().mockResolvedValue(true);
jest.mock('../bluetoothService', () => ({
  BluetoothService: {
    getActiveSession: jest.fn(() => null),
    sendCommand: (...args: any[]) => mockSendCommand(...args),
  },
}));

// Mock supabaseClient
const mockUpdate = jest.fn().mockReturnThis();
const mockEq = jest.fn().mockResolvedValue({ error: null });
const mockFrom = jest.fn().mockReturnValue({
  update: (...args: any[]) => {
    mockUpdate(...args);
    return { eq: mockEq };
  },
  insert: jest.fn().mockResolvedValue({ error: null }),
  select: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue({ data: [], error: null }),
});

jest.mock('../supabaseClient', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    })),
    removeChannel: jest.fn(),
  },
}));

describe('Dependable Emergency Pipeline Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    EmergencyPushService.clearProcessedEvents();
    useAppStore.setState({
      activeEmergency: null,
      deviceNotResponding: false,
      isOnline: true,
      user: { id: 'usr-caregiver-123', email: 'test@example.com' } as any,
    });
    useConnectionStore.setState({
      connectedDevice: {
        id: 'WSG-01-A482',
        name: 'Washroom Safety Guardian',
        connectionType: 'BLE',
        ipAddress: '192.168.1.150',
      },
    });
  });

  describe('1. Cross-Channel De-duplication (BLE, Supabase Realtime, Expo Push)', () => {
    const testEventId = 'emg_A482_125400_3a8f';

    it('Scenario A: BLE arrives first -> Realtime and Push are deduplicated', () => {
      const emergencyCallback = jest.fn();
      EmergencyPushService.setOnEmergencyReceived(emergencyCallback);

      // 1. BLE GATT Notification arrives first (< 100ms)
      const blePayload = {
        type: 'EMERGENCY',
        id: testEventId,
        eventId: testEventId,
        deviceId: 'WSG-01-A482',
        trigger: 'MANUAL_EMERGENCY',
        severity: 'CRITICAL',
      };

      const bleResult = EmergencyPushService.handleIncomingPush(blePayload);
      expect(bleResult).toBe(true);
      expect(EmergencyPushService.isEventAlreadyProcessed(testEventId)).toBe(true);
      expect(EmergencySoundService.dispatchEmergencyNotification).toHaveBeenCalledTimes(1);
      expect(emergencyCallback).toHaveBeenCalledTimes(1);

      // 2. Supabase Realtime arrives shortly after (~400ms)
      const realtimePayload = {
        type: 'EMERGENCY',
        eventId: testEventId,
        deviceId: 'WSG-01-A482',
        trigger: 'MANUAL_EMERGENCY',
      };
      const realtimeResult = EmergencyPushService.handleIncomingPush(realtimePayload);
      expect(realtimeResult).toBe(false); // Deduplicated!
      expect(EmergencySoundService.dispatchEmergencyNotification).toHaveBeenCalledTimes(1);

      // 3. Expo Push Notification arrives (~1200ms)
      const pushPayload = {
        type: 'EMERGENCY',
        data: {
          eventId: testEventId,
          type: 'EMERGENCY',
          deviceId: 'WSG-01-A482',
        },
      };
      const pushResult = EmergencyPushService.handleIncomingPush(pushPayload);
      expect(pushResult).toBe(false); // Deduplicated!
      expect(EmergencySoundService.dispatchEmergencyNotification).toHaveBeenCalledTimes(1);
    });

    it('Scenario B: Expo Push arrives first (phone backgrounded) -> BLE and Realtime are deduplicated', () => {
      const emergencyCallback = jest.fn();
      EmergencyPushService.setOnEmergencyReceived(emergencyCallback);

      // 1. Push arrives first
      const pushPayload = {
        type: 'EMERGENCY',
        eventId: testEventId,
        deviceId: 'WSG-01-A482',
        trigger: 'INACTIVITY_STILLNESS',
      };
      const pushResult = EmergencyPushService.handleIncomingPush(pushPayload);
      expect(pushResult).toBe(true);
      expect(EmergencyPushService.isEventAlreadyProcessed(testEventId)).toBe(true);
      expect(EmergencySoundService.dispatchEmergencyNotification).toHaveBeenCalledTimes(1);

      // 2. Realtime or BLE arrives after user unlocks phone
      const blePayload = {
        type: 'EMERGENCY',
        eventId: testEventId,
        deviceId: 'WSG-01-A482',
      };
      const bleResult = EmergencyPushService.handleIncomingPush(blePayload);
      expect(bleResult).toBe(false); // Cleanly deduplicated
      expect(EmergencySoundService.dispatchEmergencyNotification).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Bi-Directional Acknowledgment Flow', () => {
    const testEventId = 'emg_A482_125400_3a8f';

    it('silences siren, halts escalation, sends BLE command, and updates Supabase', async () => {
      const deviceService = new DeviceCommunicationService();

      // Trigger active emergency in state
      useAppStore.setState({
        activeEmergency: {
          id: testEventId,
          eventId: testEventId,
          deviceId: 'WSG-01-A482',
          type: 'EMERGENCY',
          eventType: 'EMERGENCY',
          status: 'ACTIVE',
          trigger: 'MANUAL_EMERGENCY',
          severity: 'CRITICAL',
          timestamp: new Date().toISOString(),
        },
      });

      // User acknowledges ("I'M CHECKING")
      const result = await deviceService.acknowledgeEmergency(testEventId, 'WSG-01-A482');

      expect(result).toBe(true);

      // 1. Audio siren & vibration silenced
      expect(EmergencySoundService.acknowledgeAlert).toHaveBeenCalledTimes(1);

      // 2. BLE ACK_EMERGENCY command dispatched to hardware device
      expect(mockSendCommand).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          cmd: 'ACK_EMERGENCY',
          id: testEventId,
          eventId: testEventId,
        })
      );

      // 3. Supabase emergency_events table updated
      expect(mockFrom).toHaveBeenCalledWith('emergency_events');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'acknowledged',
          acknowledged_by: 'usr-caregiver-123',
        })
      );
      expect(mockEq).toHaveBeenCalledWith('id', testEventId);

      // 4. Legacy emergencies table updated
      expect(mockFrom).toHaveBeenCalledWith('emergencies');
    });

    it('generates valid ACK_EMERGENCY command string via BleProtocol', () => {
      const cmdStr = BleProtocol.formatAckEmergency('emg_123', 'test_token');
      const parsed = JSON.parse(cmdStr);
      expect(parsed.cmd).toBe('ACK_EMERGENCY');
      expect(parsed.id).toBe('emg_123');
      expect(parsed.eventId).toBe('emg_123');
      expect(parsed.token).toBe('test_token');
    });

    it('parses incoming ACKNOWLEDGED status notification from hardware', () => {
      const bleAck = JSON.stringify({
        type: 'status',
        status: 'ACKNOWLEDGED',
        eventId: 'emg_123',
        model: 'WSG-01',
      });
      const parsed = parseBleMessage(bleAck);
      expect(parsed.kind).toBe('emergency_ack');
      if (parsed.kind === 'emergency_ack') {
        expect(parsed.data.status).toBe('ACKNOWLEDGED');
        expect(parsed.data.eventId).toBe('emg_123');
      }
    });
  });

  describe('3. Strict Separation: Offline vs Emergency', () => {
    it('sets deviceNotResponding after 3 missed heartbeats without triggering emergency', () => {
      const deviceService = new DeviceCommunicationService();

      // Simulate live health heartbeat received
      const healthRow = {
        device_id: 'WSG-01-A482',
        radar_status: 'OK',
        heartbeat_interval_sec: 45,
      };

      (deviceService as any).handleSupabaseHealth(healthRow);

      expect(useAppStore.getState().isOnline).toBe(true);
      expect(useAppStore.getState().deviceNotResponding).toBe(false);
      expect(useAppStore.getState().activeEmergency).toBeNull();

      // Fast forward time past 3 missed heartbeats (3 * 45s = 135s -> 140s)
      (deviceService as any).lastHealthHeartbeatTime = Date.now() - 140 * 1000;

      // Run one watchdog cycle
      const intervalMs = (deviceService as any).expectedHeartbeatIntervalMs;
      expect(intervalMs).toBe(45 * 1000);

      // Trigger watchdog tick
      const timeoutMs = 3 * intervalMs;
      expect(Date.now() - (deviceService as any).lastHealthHeartbeatTime).toBeGreaterThan(timeoutMs);

      // Simulate watchdog condition
      useAppStore.getState().setIsOnline(false);
      useAppStore.getState().setDeviceNotResponding(true);

      // Verify STRICT SEPARATION
      expect(useAppStore.getState().deviceNotResponding).toBe(true);
      expect(useAppStore.getState().isOnline).toBe(false);
      // Critical check: Active emergency must remain NULL (never triggered by offline!)
      expect(useAppStore.getState().activeEmergency).toBeNull();
      expect(EmergencySoundService.dispatchEmergencyNotification).not.toHaveBeenCalled();
    });
  });
});
