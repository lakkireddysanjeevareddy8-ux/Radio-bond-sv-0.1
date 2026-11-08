// Mock react-native
jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    Version: '14',
    constants: { Model: 'Pixel 8', Brand: 'Google' },
  },
}));

// Mock storage
const mockStorage = new Map<string, string>();
jest.mock('../storage', () => ({
  storage: {
    getItem: jest.fn(async (k: string) => mockStorage.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockStorage.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      mockStorage.delete(k);
    }),
  },
}));

import {
  logger,
  redactSensitiveString,
  getShortErrorCode,
  formatUserError,
} from '../logger';

describe('Logger & Diagnostic Logging System', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockStorage.clear();
    await logger.clearLogs();
  });

  describe('500-Entry Ring Buffer', () => {
    it('caps in-memory buffer at 500 entries, evicting the oldest', () => {
      // Add 505 entries
      for (let i = 1; i <= 505; i++) {
        logger.info('TEST', `Log message #${i}`);
      }

      const logs = logger.getLogs();
      expect(logs.length).toBe(500);
      // Oldest entries 1..5 should be evicted
      expect(logs[0].message).toBe('Log message #6');
      expect(logs[logs.length - 1].message).toBe('Log message #505');
    });

    it('records entries with all levels: debug, info, warn, error', () => {
      logger.debug('SYSTEM', 'Debug detail');
      logger.info('SYSTEM', 'Info message');
      logger.warn('SYSTEM', 'Warning message');
      logger.error('SYSTEM', 'Error message');

      const logs = logger.getLogs();
      expect(logs.length).toBe(4);
      expect(logs[0].level).toBe('debug');
      expect(logs[1].level).toBe('info');
      expect(logs[2].level).toBe('warn');
      expect(logs[3].level).toBe('error');
    });

    it('clears logs completely', async () => {
      logger.info('TEST', 'Entry to be cleared');
      expect(logger.getLogs().length).toBe(1);

      await logger.clearLogs();
      expect(logger.getLogs().length).toBe(0);
    });
  });

  describe('serializeError for BleError & standard Errors', () => {
    it('expands ALL react-native-ble-plx BleError fields', () => {
      const mockBleError = {
        name: 'BleError',
        message: 'Device disconnected unexpectedly',
        errorCode: 2,
        attErrorCode: 15,
        iosErrorCode: 0,
        androidErrorCode: 133,
        reason: 'GATT status 133 (0x85)',
        deviceID: 'WSG-TEST-DEVICE-01',
        serviceUUID: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
        characteristicUUID: 'beb5483e-36e1-4688-b7f5-ea07361b26a8',
        stack: 'BleError: Device disconnected\n  at NativeBle.connect',
      };

      const serialized = logger.serializeError(mockBleError);

      expect(serialized.name).toBe('BleError');
      expect(serialized.message).toBe('Device disconnected unexpectedly');
      expect(serialized.errorCode).toBe(2);
      expect(serialized.attErrorCode).toBe(15);
      expect(serialized.iosErrorCode).toBe(0);
      expect(serialized.androidErrorCode).toBe(133);
      expect(serialized.reason).toBe('GATT status 133 (0x85)');
      expect(serialized.deviceID).toBe('WSG-TEST-DEVICE-01');
      expect(serialized.serviceUUID).toBe('4fafc201-1fb5-459e-8fcc-c5c9c331914b');
      expect(serialized.characteristicUUID).toBe('beb5483e-36e1-4688-b7f5-ea07361b26a8');
      expect(serialized.stack).toBeDefined();
    });

    it('handles null, undefined, primitive, and standard Error gracefully', () => {
      expect(logger.serializeError(null)).toEqual({
        message: 'Unknown null/undefined error',
      });
      expect(logger.serializeError('String error message')).toEqual({
        message: 'String error message',
      });

      const err = new Error('Standard JS error');
      const serialized = logger.serializeError(err);
      expect(serialized.name).toBe('Error');
      expect(serialized.message).toBe('Standard JS error');
      expect(serialized.stack).toBeDefined();
    });
  });

  describe('Automatic Redaction of Passwords, Tokens & Wi-Fi Credentials', () => {
    it('redacts sensitive fields in structured data objects', () => {
      const sensitiveData = {
        ssid: 'Home_WiFi',
        password: 'SuperSecretPassword123!',
        pass: 'SuperSecretPassword123!',
        token: 'supabase-jwt-secret-token',
        apiKey: 'service_role_key_secret',
        anon_key: 'public-anon-key-secret',
        safeProperty: 'Washroom #1',
      };

      const sanitized = logger.sanitizeData(sensitiveData);

      expect(sanitized.ssid).toBe('Home_WiFi');
      expect(sanitized.safeProperty).toBe('Washroom #1');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.pass).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
      expect(sanitized.anon_key).toBe('[REDACTED]');
    });

    it('redacts sensitive strings, JWTs, and Wi-Fi credentials in log messages', () => {
      const msg =
        'Sending payload {"cmd":"PROV_WIFI","ssid":"Office24","pass":"MySecretWifiPass123"} with Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      const redacted = redactSensitiveString(msg);

      expect(redacted).not.toContain('MySecretWifiPass123');
      expect(redacted).toContain('"pass": [REDACTED]');
      expect(redacted).toContain('[REDACTED]');
      expect(redacted).toContain('[REDACTED_JWT]');
      expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('automatically applies redaction when logging messages and data', () => {
      logger.info('WIFI_PROV', 'Wi-Fi pass: "MyHomeRouterPassword99"', {
        ssid: 'HomeNet',
        pass: 'MyHomeRouterPassword99',
        secret: 'my-hardware-pairing-secret',
      });

      const entry = logger.getLogs()[0];
      expect(entry.message).not.toContain('MyHomeRouterPassword99');
      expect(entry.data.pass).toBe('[REDACTED]');
      expect(entry.data.secret).toBe('[REDACTED]');
      expect(entry.data.ssid).toBe('HomeNet');
    });
  });

  describe('User-Facing Short Error Codes & Formatters', () => {
    it('returns appropriate short codes for BLE errors', () => {
      expect(getShortErrorCode({ message: 'device not found' }, 'scan')).toBe('BLE-101');
      expect(getShortErrorCode({ message: 'bluetooth is turned off' })).toBe('BLE-102');
      expect(getShortErrorCode({ errorCode: 1, message: 'unauthorized' })).toBe('BLE-103');
      expect(getShortErrorCode({ message: 'connection timed out' }, 'connect')).toBe('BLE-201');
      expect(getShortErrorCode({ errorCode: 2, message: 'disconnected' })).toBe('BLE-202');
      expect(getShortErrorCode({ message: 'service missing' })).toBe('BLE-203');
      expect(getShortErrorCode({ message: 'characteristic not found' })).toBe('BLE-204');
      expect(getShortErrorCode({ message: 'write failed' }, 'write')).toBe('BLE-301');
      expect(getShortErrorCode({ message: 'read failed' }, 'read')).toBe('BLE-302');
      expect(getShortErrorCode({ message: 'notify failed' }, 'monitor')).toBe('BLE-401');
    });

    it('returns appropriate short codes for Wi-Fi and device errors', () => {
      expect(getShortErrorCode({ code: 'AUTH_FAILED', message: 'Incorrect password' })).toBe('WIFI-101');
      expect(getShortErrorCode({ code: 'NO_SSID', message: 'Network not found' })).toBe('WIFI-102');
      expect(getShortErrorCode({ code: 'WIFI_TIMEOUT', message: 'Timed out' })).toBe('WIFI-103');
      expect(getShortErrorCode({ message: 'Write failed' }, 'provisioning')).toBe('WIFI-104');
      expect(getShortErrorCode({ code: 'HARDWARE_ERROR' }, 'device')).toBe('DEV-501');
      expect(getShortErrorCode({ code: 'FW_UPDATE_NEEDED' })).toBe('DEV-502');
      expect(getShortErrorCode({ message: 'React render crash' }, 'crash')).toBe('APP-500');
    });

    it('formats user-facing errors combining clear explanation and short code', () => {
      const formatted = formatUserError({ code: 'AUTH_FAILED' });
      expect(formatted.code).toBe('WIFI-101');
      expect(formatted.message).toBe('Incorrect Wi-Fi password');
      expect(formatted.display).toBe('Incorrect Wi-Fi password (WIFI-101)');
    });
  });

  describe('exportLogsAsText', () => {
    it('formats complete diagnostic text bundle including metadata header', () => {
      logger.info('BLE', 'Connected to device');
      logger.warn('WIFI', 'Weak signal detected');

      const text = logger.exportLogsAsText({
        'Custom Field': 'Diagnostics Test',
      });

      expect(text).toContain('WSG-01 DIAGNOSTIC DEBUG LOGS');
      expect(text).toContain('Platform / OS:');
      expect(text).toContain('Device Model:');
      expect(text).toContain('Custom Field:       Diagnostics Test');
      expect(text).toContain('[INFO] [BLE] Connected to device');
      expect(text).toContain('[WARN] [WIFI] Weak signal detected');
    });
  });
});
