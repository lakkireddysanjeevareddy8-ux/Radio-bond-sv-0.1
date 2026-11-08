// Mock react-native
jest.mock('react-native', () => ({
  Platform: { OS: 'android', select: (obj: any) => obj.android || obj.default },
  AppState: { currentState: 'active', addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

import { EmergencyPushService } from '../EmergencyPushService';
import { EmergencySoundService } from '../EmergencySoundService';
import { EmergencyEvent } from '../../types';

// Mock EmergencySoundService
jest.mock('../EmergencySoundService', () => ({
  EmergencySoundService: {
    dispatchEmergencyNotification: jest.fn(),
    stopEmergencyAlarm: jest.fn(),
  },
}));

describe('Emergency Event De-duplication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    EmergencyPushService.clearProcessedEvents();
  });

  describe('EmergencyPushService deduplication', () => {
    it('processes a new emergency push payload on first arrival', () => {
      const dispatchedCallback = jest.fn();
      EmergencyPushService.setOnEmergencyReceived(dispatchedCallback);

      const payload = {
        type: 'EMERGENCY',
        eventId: 'emg_001',
        deviceId: 'WSG-TEST-01',
        deviceName: 'Washroom Safety Guardian',
        severity: 'CRITICAL',
        trigger: 'BUTTON',
      };

      const result = EmergencyPushService.handleIncomingPush(payload);

      expect(result).toBe(true);
      expect(EmergencyPushService.isEventAlreadyProcessed('emg_001')).toBe(true);
      expect(EmergencySoundService.dispatchEmergencyNotification).toHaveBeenCalledTimes(1);
      expect(dispatchedCallback).toHaveBeenCalledTimes(1);
      expect(dispatchedCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'emg_001',
          eventId: 'emg_001',
          deviceId: 'WSG-TEST-01',
          type: 'EMERGENCY',
        })
      );
    });

    it('rejects duplicate emergency push payload with the same eventId', () => {
      const dispatchedCallback = jest.fn();
      EmergencyPushService.setOnEmergencyReceived(dispatchedCallback);

      const payload = {
        type: 'EMERGENCY',
        eventId: 'emg_dup_001',
        deviceId: 'WSG-TEST-01',
      };

      // First arrival -> processed
      const firstResult = EmergencyPushService.handleIncomingPush(payload);
      expect(firstResult).toBe(true);
      expect(EmergencySoundService.dispatchEmergencyNotification).toHaveBeenCalledTimes(1);

      // Second arrival with same eventId -> deduplicated
      const secondResult = EmergencyPushService.handleIncomingPush(payload);
      expect(secondResult).toBe(false);
      // Notification service must not be called a second time
      expect(EmergencySoundService.dispatchEmergencyNotification).toHaveBeenCalledTimes(1);
      expect(dispatchedCallback).toHaveBeenCalledTimes(1);
    });

    it('ignores non-emergency payload types', () => {
      const nonEmergencyPayload = {
        type: 'TELEMETRY',
        eventId: 'telemetry_123',
        deviceId: 'WSG-TEST-01',
      };

      const result = EmergencyPushService.handleIncomingPush(nonEmergencyPayload);

      expect(result).toBe(false);
      expect(EmergencyPushService.isEventAlreadyProcessed('telemetry_123')).toBe(false);
      expect(EmergencySoundService.dispatchEmergencyNotification).not.toHaveBeenCalled();
    });

    it('bounds processed events cache to 100 entries and purges oldest', () => {
      // Add 100 events
      for (let i = 1; i <= 100; i++) {
        EmergencyPushService.markEventProcessed(`event_${i}`);
      }

      expect(EmergencyPushService.isEventAlreadyProcessed('event_1')).toBe(true);
      expect(EmergencyPushService.isEventAlreadyProcessed('event_100')).toBe(true);

      // Adding 101st event should evict event_1
      EmergencyPushService.markEventProcessed('event_101');

      expect(EmergencyPushService.isEventAlreadyProcessed('event_1')).toBe(false);
      expect(EmergencyPushService.isEventAlreadyProcessed('event_2')).toBe(true);
      expect(EmergencyPushService.isEventAlreadyProcessed('event_101')).toBe(true);
    });
  });

  describe('BLE Historical Buffer and Event Marker Deduplication', () => {
    let lastHandledEmergencyMarker = 0;
    let isInitialBufferBaseline = true;
    let activeEmergency: EmergencyEvent | null = null;

    /**
     * Replicates the exact BLE notification handler logic from bluetoothService.ts
     */
    const simulateBleEventNotification = (parsed: any) => {
      if (Array.isArray(parsed)) {
        if (isInitialBufferBaseline) {
          const maxTs = Math.max(
            0,
            ...parsed.map((item: any) => Number(item.timestamp || item.timestampMs || 0))
          );
          lastHandledEmergencyMarker = Math.max(lastHandledEmergencyMarker, maxTs);
          isInitialBufferBaseline = false;
          return;
        }

        if (parsed.length > 0) {
          const newest = parsed[parsed.length - 1];
          const toState = String(newest.to || newest.toState || '').toUpperCase();
          if (toState === 'ALARM' || toState === 'EMERGENCY') {
            const itemTs = Number(newest.timestamp || newest.timestampMs || 0);
            const itemEventId = `emg_device_${itemTs || Date.now()}`;

            if (itemTs > 0 && itemTs <= lastHandledEmergencyMarker) {
              return; // Ignored: already handled by marker
            }

            if (EmergencyPushService.isEventAlreadyProcessed(itemEventId)) {
              return; // Ignored: duplicate event ID
            }

            lastHandledEmergencyMarker = Math.max(lastHandledEmergencyMarker, itemTs);

            const event: EmergencyEvent = {
              id: itemEventId,
              eventId: itemEventId,
              deviceId: 'WSG-TEST-01',
              deviceName: 'Washroom Safety Guardian',
              type: 'EMERGENCY',
              eventType: 'EMERGENCY',
              trigger: String(newest.trigger || 'ALARM'),
              severity: 'CRITICAL',
              status: 'ACTIVE',
              timestamp: new Date(itemTs).toISOString(),
            };

            const processed = EmergencyPushService.handleIncomingPush(event);
            if (processed) {
              activeEmergency = event;
            }
          }
        }
      }
    };

    beforeEach(() => {
      lastHandledEmergencyMarker = 0;
      isInitialBufferBaseline = true;
      activeEmergency = null;
    });

    it('establishes baseline on initial connection without triggering false active alarms', () => {
      const historicalLogs = [
        { timestamp: 1000, from: 'IDLE', to: 'SAFE', trigger: 'RESET' },
        { timestamp: 2000, from: 'SAFE', to: 'CHECKING', trigger: 'MOTION' },
        { timestamp: 3000, from: 'CHECKING', to: 'ALARM', trigger: 'STILLNESS' },
        { timestamp: 4000, from: 'ALARM', to: 'SAFE', trigger: 'RESET' },
      ];

      // Initial buffer received on connection
      simulateBleEventNotification(historicalLogs);

      // Baseline should be set to highest timestamp (4000)
      expect(lastHandledEmergencyMarker).toBe(4000);
      expect(isInitialBufferBaseline).toBe(false);
      // Historical ALARM must not trigger an active emergency
      expect(activeEmergency).toBeNull();
      expect(EmergencySoundService.dispatchEmergencyNotification).not.toHaveBeenCalled();
    });

    it('ignores historical alarms whose timestamp <= lastHandledEmergencyMarker', () => {
      // Establish baseline at ts = 5000
      simulateBleEventNotification([{ timestamp: 5000, from: 'IDLE', to: 'SAFE' }]);
      expect(lastHandledEmergencyMarker).toBe(5000);

      // New log array received, but newest ALARM has timestamp 4500 <= 5000
      simulateBleEventNotification([
        { timestamp: 4500, from: 'CHECKING', to: 'ALARM', trigger: 'STILLNESS' },
      ]);

      expect(activeEmergency).toBeNull();
      expect(EmergencySoundService.dispatchEmergencyNotification).not.toHaveBeenCalled();
    });

    it('triggers active emergency when a genuine new event (timestamp > marker) arrives', () => {
      // Establish baseline at ts = 5000
      simulateBleEventNotification([{ timestamp: 5000, from: 'IDLE', to: 'SAFE' }]);

      // Real emergency occurs at ts = 6000
      simulateBleEventNotification([
        { timestamp: 6000, from: 'CHECKING', to: 'ALARM', trigger: 'VOICE_KEYWORD' },
      ]);

      expect(activeEmergency).not.toBeNull();
      expect(activeEmergency?.id).toBe('emg_device_6000');
      expect(lastHandledEmergencyMarker).toBe(6000);
      expect(EmergencySoundService.dispatchEmergencyNotification).toHaveBeenCalledTimes(1);

      // If the exact same buffer is re-transmitted via BLE notification, it is rejected
      simulateBleEventNotification([
        { timestamp: 6000, from: 'CHECKING', to: 'ALARM', trigger: 'VOICE_KEYWORD' },
      ]);

      // Alarm dispatched count must remain 1
      expect(EmergencySoundService.dispatchEmergencyNotification).toHaveBeenCalledTimes(1);
    });
  });
});
