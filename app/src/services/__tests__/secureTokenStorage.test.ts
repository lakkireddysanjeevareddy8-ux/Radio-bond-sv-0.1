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

  describe('Logger Redaction of Pairing Tokens & Passwords', () => {
    it('redacts current_token, new_token, and pairing_token from logs', () => {
      const sensitivePayload = {
        cmd: 'SET_PAIRING_TOKEN',
        current_token: 'secret_current_token_abc',
        new_token: 'secret_new_token_xyz',
        pass: 'SuperSecretWiFi123',
      };

      const sanitized = logger.sanitizeData(sensitivePayload);
      expect(sanitized.current_token).toBe('[REDACTED]');
      expect(sanitized.new_token).toBe('[REDACTED]');
      expect(sanitized.pass).toBe('[REDACTED]');
    });
  });
});

