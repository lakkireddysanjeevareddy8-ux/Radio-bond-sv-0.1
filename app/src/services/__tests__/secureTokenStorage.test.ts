import { SecureTokenStorage } from '../../utils/secureTokenStorage';
import { BleProtocol, parseBleMessage } from '../protocol';
import { logger } from '../../utils/logger';

describe('SecureTokenStorage & BLE Pairing Security', () => {
  beforeEach(async () => {
    await SecureTokenStorage.removeDeviceToken('test-device-01');
    await SecureTokenStorage.removeDeviceToken('test-device-02');
  });

  describe('SecureTokenStorage', () => {
    it('stores and retrieves device pairing token securely', async () => {
      expect(await SecureTokenStorage.getDeviceToken('test-device-01')).toBeNull();
      expect(await SecureTokenStorage.hasDeviceToken('test-device-01')).toBe(false);

      await SecureTokenStorage.saveDeviceToken('test-device-01', 'secure_token_123456');

      expect(await SecureTokenStorage.getDeviceToken('test-device-01')).toBe('secure_token_123456');
      expect(await SecureTokenStorage.hasDeviceToken('test-device-01')).toBe(true);
    });

    it('isolates tokens by device ID', async () => {
      await SecureTokenStorage.saveDeviceToken('test-device-01', 'token_for_dev_1');
      await SecureTokenStorage.saveDeviceToken('test-device-02', 'token_for_dev_2');

      expect(await SecureTokenStorage.getDeviceToken('test-device-01')).toBe('token_for_dev_1');
      expect(await SecureTokenStorage.getDeviceToken('test-device-02')).toBe('token_for_dev_2');
    });

    it('removes token cleanly on request', async () => {
      await SecureTokenStorage.saveDeviceToken('test-device-01', 'temp_token');
      expect(await SecureTokenStorage.hasDeviceToken('test-device-01')).toBe(true);

      await SecureTokenStorage.removeDeviceToken('test-device-01');
      expect(await SecureTokenStorage.getDeviceToken('test-device-01')).toBeNull();
      expect(await SecureTokenStorage.hasDeviceToken('test-device-01')).toBe(false);
    });

    it('sanitizes special characters in deviceId', async () => {
      const complexDeviceId = 'WSG:AA:BB:CC:DD:EE!!';
      await SecureTokenStorage.saveDeviceToken(complexDeviceId, 'token_xyz');

      expect(await SecureTokenStorage.getDeviceToken(complexDeviceId)).toBe('token_xyz');
      await SecureTokenStorage.removeDeviceToken(complexDeviceId);
      expect(await SecureTokenStorage.getDeviceToken(complexDeviceId)).toBeNull();
    });
  });

  describe('BleProtocol Token Formatting', () => {
    it('formats PROV_WIFI with pairing token', () => {
      const payloadStr = BleProtocol.formatProvWifi({
        ssid: 'Home_WiFi',
        pass: 'SecretPass123',
        token: 'token_abc_999',
        name: 'Master Washroom',
      });
      const parsed = JSON.parse(payloadStr);

      expect(parsed.cmd).toBe('PROV_WIFI');
      expect(parsed.ssid).toBe('Home_WiFi');
      expect(parsed.pass).toBe('SecretPass123');
      expect(parsed.token).toBe('token_abc_999');
      expect(parsed.name).toBe('Master Washroom');
    });

    it('formats FORGET_WIFI with token', () => {
      const payloadStr = BleProtocol.formatForgetWifi('token_auth_555');
      const parsed = JSON.parse(payloadStr);

      expect(parsed.cmd).toBe('FORGET_WIFI');
      expect(parsed.token).toBe('token_auth_555');
    });

    it('formats SET_ESCALATION_CONFIG with token', () => {
      const payloadStr = BleProtocol.formatSetEscalationConfig(
        { t1: 240, repeat: 20, volume: 90 },
        'token_auth_777'
      );
      const parsed = JSON.parse(payloadStr);

      expect(parsed.cmd).toBe('SET_ESCALATION_CONFIG');
      expect(parsed.token).toBe('token_auth_777');
      expect(parsed.t1).toBe(240);
      expect(parsed.repeat).toBe(20);
      expect(parsed.volume).toBe(90);
    });

    it('formats SET_PAIRING_TOKEN with current_token and new_token', () => {
      const payloadStr = BleProtocol.formatSetPairingToken({
        currentToken: 'old_token_123',
        newToken: 'new_token_456',
      });
      const parsed = JSON.parse(payloadStr);

      expect(parsed.cmd).toBe('SET_PAIRING_TOKEN');
      expect(parsed.current_token).toBe('old_token_123');
      expect(parsed.new_token).toBe('new_token_456');
    });
  });

  describe('Security Error & Status Parsing', () => {
    it('parses RATE_LIMITED error with retry_after', () => {
      const raw = JSON.stringify({
        status: 'ERROR',
        error: 'RATE_LIMITED',
        retry_after: 30,
        protocol: 1,
        fw: 'v1.2.0-esp32',
      });

      const parsed = parseBleMessage(raw);
      expect(parsed.kind).toBe('device_error');
      if (parsed.kind === 'device_error') {
        expect(parsed.data.error).toBe('RATE_LIMITED');
        expect(parsed.raw.retry_after).toBe(30);
      }
    });

    it('parses PAIRING_WINDOW_CLOSED error', () => {
      const raw = JSON.stringify({
        status: 'ERROR',
        error: 'PAIRING_WINDOW_CLOSED',
        protocol: 1,
      });

      const parsed = parseBleMessage(raw);
      expect(parsed.kind).toBe('device_error');
      if (parsed.kind === 'device_error') {
        expect(parsed.data.error).toBe('PAIRING_WINDOW_CLOSED');
      }
    });

    it('parses GET_STATUS payload containing pairing token during pairing window', () => {
      const raw = JSON.stringify({
        type: 'status',
        status: 'DISCONNECTED',
        state: 'WIFI_DISCONNECTED',
        model: 'WSG-01',
        protocol: 1,
        fw: 'v1.2.0-esp32',
        pairing_active: true,
        token: 'newly_generated_token_123',
      });

      const parsed = parseBleMessage(raw);
      expect(parsed.kind).toBe('wifi_status');
      if (parsed.kind === 'wifi_status') {
        expect(parsed.data.pairing_active).toBe(true);
        expect(parsed.data.token).toBe('newly_generated_token_123');
      }
    });
  });

  describe('Regression Tests: Fresh Pairing, Stale Tokens, Chunking & BT Emergency', () => {
    it('saves pairing token with aliases and allows retrieval by any alias', async () => {
      const bleMac = 'AA:BB:CC:DD:EE:FF';
      const hwId = 'WSG001';
      const advName = 'WSG-01-BEDROOM';

      await SecureTokenStorage.saveDeviceToken(bleMac, 'test_esp32_token_xyz', [hwId, advName]);

      expect(await SecureTokenStorage.getDeviceToken(bleMac)).toBe('test_esp32_token_xyz');
      expect(await SecureTokenStorage.getDeviceToken(hwId)).toBe('test_esp32_token_xyz');
      expect(await SecureTokenStorage.getDeviceToken(advName)).toBe('test_esp32_token_xyz');

      // Invalidate with aliases
      await SecureTokenStorage.removeDeviceToken(bleMac, [hwId, advName]);
      expect(await SecureTokenStorage.getDeviceToken(bleMac)).toBeNull();
      expect(await SecureTokenStorage.getDeviceToken(hwId)).toBeNull();
      expect(await SecureTokenStorage.getDeviceToken(advName)).toBeNull();
    });

    it('parses UNAUTHORIZED auth error correctly and distinguishes it from WiFi password error', () => {
      const rawAuthError = JSON.stringify({
        type: 'status',
        status: 'ERROR',
        error: 'UNAUTHORIZED',
        message: 'Valid device token required',
      });

      const parsed = parseBleMessage(rawAuthError);
      expect(parsed.kind).toBe('device_error');
      if (parsed.kind === 'device_error') {
        expect(parsed.data.error).toBe('UNAUTHORIZED');
        expect(parsed.data.message).toBe('Valid device token required');
      }
    });

    it('correctly handles chunked / truncated BLE notification fragments', () => {
      const part1 = '{"type":"event","event":"TEST_';
      const part2 = 'EMERGENCY","timestamp":12345678}';

      const parsedPart1 = parseBleMessage(part1);
      expect(parsedPart1.kind).toBe('malformed');

      // Reassemble chunk
      const fullCandidate = part1 + part2;
      const parsedFull = parseBleMessage(fullCandidate);
      expect(parsedFull.kind).toBe('emergency_event');
      if (parsedFull.kind === 'emergency_event') {
        expect(parsedFull.data.event).toBe('TEST_EMERGENCY');
      }
    });

    it('builds TEST_EMERGENCY and CANCEL_TEST with authentic pairing tokens', () => {
      const testToken = 'esp32_unique_nvs_token_42';
      const testCmd = JSON.parse(BleProtocol.formatTestEmergency(testToken));
      expect(testCmd.cmd).toBe('TEST_EMERGENCY');
      expect(testCmd.token).toBe(testToken);

      const cancelCmd = JSON.parse(BleProtocol.formatCancelTest(testToken));
      expect(cancelCmd.cmd).toBe('CANCEL_TEST');
      expect(cancelCmd.token).toBe(testToken);
    });

    it('parses DIAGNOSTIC_MODE for wifi scan to enable manual SSID fallback', () => {
      const rawDiag = JSON.stringify({
        type: 'wifi_scan',
        status: 'DIAGNOSTIC_MODE',
        error: 'DIAGNOSTIC_MODE',
        message: 'Wi-Fi scanning temporarily disabled for diagnostics',
      });

      const parsed = parseBleMessage(rawDiag);
      expect(parsed.raw.status).toBe('DIAGNOSTIC_MODE');
      expect(parsed.raw.error).toBe('DIAGNOSTIC_MODE');
    });

    it('parses TEST_CANCELLED status from ESP32 to clear emergency state', () => {
      const rawCancel = JSON.stringify({
        status: 'OK',
        test_cancelled: true,
      });

      const parsed = parseBleMessage(rawCancel);
      expect(parsed.raw.test_cancelled).toBe(true);
      expect(parsed.raw.status).toBe('OK');
    });
  });
});

