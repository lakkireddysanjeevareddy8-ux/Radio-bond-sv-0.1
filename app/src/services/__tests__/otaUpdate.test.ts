// Mock supabaseClient
jest.mock('../supabaseClient', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

// Mock SecureTokenStorage
jest.mock('../../utils/secureTokenStorage', () => ({
  SecureTokenStorage: {
    getDeviceToken: jest.fn().mockResolvedValue('test_token_123'),
    saveDeviceToken: jest.fn().mockResolvedValue(undefined),
    hasDeviceToken: jest.fn().mockResolvedValue(true),
    removeDeviceToken: jest.fn().mockResolvedValue(undefined),
  },
}));

import { BleProtocol, parseBleMessage } from '../protocol';
import { PhoneBatteryService } from '../PhoneBatteryService';
import { FirmwareUpdateService } from '../FirmwareUpdateService';

describe('OTA Firmware Update Pipeline', () => {
  beforeEach(() => {
    PhoneBatteryService.setMockBatteryLevel(null);
  });

  describe('Protocol Builders & Parsers', () => {
    it('serializes START_OTA command correctly with token, url, sha256 and fw', () => {
      const command = BleProtocol.formatStartOta({
        token: 'test_token_123',
        url: 'https://example.com/firmware.bin',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        fw: 'v1.3.0-esp32',
      });

      const parsed = JSON.parse(command);
      expect(parsed).toEqual({
        cmd: 'START_OTA',
        token: 'test_token_123',
        url: 'https://example.com/firmware.bin',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        fw: 'v1.3.0-esp32',
      });
    });

    it('parses incoming ota_progress BLE notification', () => {
      const payload = '{"type":"ota_progress","progress":55,"bytes":634388,"total":1153434}';
      const msg = parseBleMessage(payload);

      expect(msg.kind).toBe('ota_progress');
      if (msg.kind === 'ota_progress') {
        expect(msg.data.progress).toBe(55);
        expect(msg.data.bytes).toBe(634388);
        expect(msg.data.total).toBe(1153434);
      }
    });

    it('parses incoming ota_status downloading notification', () => {
      const payload = '{"type":"ota_status","status":"DOWNLOADING","progress":10}';
      const msg = parseBleMessage(payload);

      expect(msg.kind).toBe('ota_status');
      if (msg.kind === 'ota_status') {
        expect(msg.data.status).toBe('DOWNLOADING');
        expect(msg.data.progress).toBe(10);
      }
    });

    it('parses incoming ota_status verifying notification', () => {
      const payload = '{"type":"ota_status","status":"VERIFYING","progress":100}';
      const msg = parseBleMessage(payload);

      expect(msg.kind).toBe('ota_status');
      if (msg.kind === 'ota_status') {
        expect(msg.data.status).toBe('VERIFYING');
        expect(msg.data.progress).toBe(100);
      }
    });

    it('parses incoming ota_status error notification with SHA-256 mismatch', () => {
      const payload = '{"type":"ota_status","status":"ERROR","error":"SHA256_MISMATCH","actual":"abcd1234"}';
      const msg = parseBleMessage(payload);

      expect(msg.kind).toBe('ota_status');
      if (msg.kind === 'ota_status') {
        expect(msg.data.status).toBe('ERROR');
        expect(msg.data.error).toBe('SHA256_MISMATCH');
        expect(msg.data.actual).toBe('abcd1234');
      }
    });

    it('parses incoming ota_status success notification', () => {
      const payload = '{"type":"ota_status","status":"SUCCESS","message":"Rebooting into new firmware..."}';
      const msg = parseBleMessage(payload);

      expect(msg.kind).toBe('ota_status');
      if (msg.kind === 'ota_status') {
        expect(msg.data.status).toBe('SUCCESS');
        expect(msg.data.message).toContain('Rebooting');
      }
    });
  });

  describe('PhoneBatteryService', () => {
    it('returns sufficient=true when phone battery is above 30%', async () => {
      PhoneBatteryService.setMockBatteryLevel(75);
      const result = await PhoneBatteryService.checkBatteryForOta(30);

      expect(result.sufficient).toBe(true);
      expect(result.level).toBe(75);
      expect(result.reason).toBeUndefined();
    });

    it('returns sufficient=false when phone battery is exactly 30%', async () => {
      PhoneBatteryService.setMockBatteryLevel(30);
      const result = await PhoneBatteryService.checkBatteryForOta(30);

      expect(result.sufficient).toBe(false);
      expect(result.level).toBe(30);
      expect(result.reason).toContain('charge your phone to above 30%');
    });

    it('returns sufficient=false when phone battery is below 30%', async () => {
      PhoneBatteryService.setMockBatteryLevel(18);
      const result = await PhoneBatteryService.checkBatteryForOta(30);

      expect(result.sufficient).toBe(false);
      expect(result.level).toBe(18);
      expect(result.reason).toContain('18%');
    });
  });

  describe('FirmwareUpdateService Version Logic', () => {
    it('correctly detects newer semantic firmware versions', () => {
      expect(FirmwareUpdateService.isVersionNewer('v1.3.0-esp32', 'v1.2.0-esp32')).toBe(true);
      expect(FirmwareUpdateService.isVersionNewer('v2.0.0', 'v1.9.9')).toBe(true);
      expect(FirmwareUpdateService.isVersionNewer('1.2.1', '1.2.0')).toBe(true);
    });

    it('returns false when current firmware is equal or newer', () => {
      expect(FirmwareUpdateService.isVersionNewer('v1.2.0-esp32', 'v1.2.0-esp32')).toBe(false);
      expect(FirmwareUpdateService.isVersionNewer('v1.1.9-esp32', 'v1.2.0-esp32')).toBe(false);
      expect(FirmwareUpdateService.isVersionNewer('1.0.0', '1.2.0')).toBe(false);
    });

    it('rejects update prerequisites when phone battery is too low', async () => {
      PhoneBatteryService.setMockBatteryLevel(25);
      const prereq = await FirmwareUpdateService.validatePrerequisites('test-dev', true);

      expect(prereq.eligible).toBe(false);
      expect(prereq.reason).toContain('charge your phone to above 30%');
    });

    it('rejects update prerequisites when device is not on Wi-Fi', async () => {
      PhoneBatteryService.setMockBatteryLevel(80);
      const prereq = await FirmwareUpdateService.validatePrerequisites('test-dev', false);

      expect(prereq.eligible).toBe(false);
      expect(prereq.reason).toContain('must be connected to Wi-Fi');
    });
  });
});

