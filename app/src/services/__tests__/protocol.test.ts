import {
  BleProtocol,
  parseBleMessage,
  validateProtocolVersion,
  CURRENT_PROTOCOL_VERSION,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  BLE_UUIDS,
  BLE_ERROR_CODES,
} from '../protocol';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    serializeError: jest.fn((e) => ({ message: e?.message })),
  },
}));

describe('BleProtocol', () => {
  describe('Constants and UUIDs', () => {
    test('defines required GATT service and characteristic UUIDs', () => {
      expect(BLE_UUIDS.SERVICE).toBe('4fafc201-1fb5-459e-8fcc-c5c9c331914b');
      expect(BLE_UUIDS.COMMAND).toBe('beb5483e-36e1-4688-b7f5-ea07361b26a8');
      expect(BLE_UUIDS.STATUS).toBe('beb5483e-36e1-4688-b7f5-ea07361b26a9');
      expect(BLE_UUIDS.EVENT).toBe('beb5483e-36e1-4688-b7f5-ea07361b26aa');
      expect(BLE_UUIDS.CONFIG).toBe('beb5483e-36e1-4688-b7f5-ea07361b26ab');
    });

    test('defines protocol versions and standard error codes', () => {
      expect(CURRENT_PROTOCOL_VERSION).toBe(1);
      expect(MIN_SUPPORTED_PROTOCOL_VERSION).toBe(1);
      expect(BLE_ERROR_CODES.AUTH_FAILED).toBe('AUTH_FAILED');
      expect(BLE_ERROR_CODES.NO_SSID).toBe('NO_SSID');
      expect(BLE_ERROR_CODES.WIFI_TIMEOUT).toBe('WIFI_TIMEOUT');
      expect(BLE_ERROR_CODES.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(BLE_ERROR_CODES.UNKNOWN_CMD).toBe('UNKNOWN_CMD');
      expect(BLE_ERROR_CODES.FW_UPDATE_NEEDED).toBe('FW_UPDATE_NEEDED');
    });
  });

  describe('Command Builders', () => {
    test('formatProvWifi builds valid JSON command', () => {
      const json = BleProtocol.formatProvWifi({
        ssid: 'Home_2.4G',
        pass: 'secret123',
        name: 'Washroom Unit',
        room: 'Master Bathroom',
      });
      const parsed = JSON.parse(json);
      expect(parsed).toEqual({
        cmd: 'PROV_WIFI',
        ssid: 'Home_2.4G',
        pass: 'secret123',
        name: 'Washroom Unit',
        room: 'Master Bathroom',
      });
    });

    test('formatGetStatus builds GET_STATUS command', () => {
      expect(BleProtocol.formatGetStatus()).toBe('{"cmd":"GET_STATUS"}');
    });

    test('formatScanWifi builds SCAN_WIFI command', () => {
      expect(BleProtocol.formatScanWifi()).toBe('{"cmd":"SCAN_WIFI"}');
    });

    test('formatForgetWifi builds FORGET_WIFI command', () => {
      expect(BleProtocol.formatForgetWifi()).toBe('{"cmd":"FORGET_WIFI"}');
    });

    test('formatPing builds PING command', () => {
      expect(BleProtocol.formatPing()).toBe('{"cmd":"PING"}');
    });

    test('formatTestEmergency builds TEST_EMERGENCY command with token', () => {
      const json = BleProtocol.formatTestEmergency('tok_9988');
      expect(JSON.parse(json)).toEqual({
        cmd: 'TEST_EMERGENCY',
        token: 'tok_9988',
      });
    });

    test('formatCancelTest builds CANCEL_TEST command with token', () => {
      const json = BleProtocol.formatCancelTest('tok_9988');
      expect(JSON.parse(json)).toEqual({
        cmd: 'CANCEL_TEST',
        token: 'tok_9988',
      });
    });

    test('formatSetEscalationConfig builds SET_ESCALATION_CONFIG command', () => {
      const json = BleProtocol.formatSetEscalationConfig({
        t1: 240,
        repeat: 20,
        volume: 90,
        hb_interval: 10,
      });
      expect(JSON.parse(json)).toEqual({
        cmd: 'SET_ESCALATION_CONFIG',
        t1: 240,
        repeat: 20,
        volume: 90,
        hb_interval: 10,
      });
    });
  });

  describe('Protocol Version Validation', () => {
    test('accepts device with protocol >= MIN_SUPPORTED_PROTOCOL_VERSION', () => {
      const result = validateProtocolVersion({ protocol: 1, fw: 'v1.2.0-esp32' });
      expect(result.isCompatible).toBe(true);
      expect(result.protocol).toBe(1);
    });

    test('flags device with protocol < MIN_SUPPORTED_PROTOCOL_VERSION as update needed', () => {
      const result = validateProtocolVersion({ protocol: 0, fw: 'v0.9.0' });
      expect(result.isCompatible).toBe(false);
      expect(result.message).toBe('Device firmware update needed');
    });

    test('parseBleMessage returns outdated_protocol kind when protocol is lower', () => {
      const payload = JSON.stringify({
        type: 'status',
        status: 'CONNECTED',
        protocol: 0,
        fw: 'v0.8.0',
      });
      const parsed = parseBleMessage(payload);
      expect(parsed.kind).toBe('outdated_protocol');
      if (parsed.kind === 'outdated_protocol') {
        expect(parsed.protocol).toBe(0);
        expect(parsed.message).toBe('Device firmware update needed');
      }
    });
  });

  describe('Parsers & Validators for Incoming Messages', () => {
    test('parses Wi-Fi status CONNECTED message', () => {
      const payload = JSON.stringify({
        type: 'status',
        status: 'CONNECTED',
        state: 'WIFI_CONNECTED',
        ssid: 'Home_2.4G',
        ip: '192.168.1.100',
        model: 'WSG-01',
        protocol: 1,
        fw: 'v1.2.0-esp32',
      });
      const parsed = parseBleMessage(payload);
      expect(parsed.kind).toBe('wifi_status');
      if (parsed.kind === 'wifi_status') {
        expect(parsed.data.status).toBe('CONNECTED');
        expect(parsed.data.ip).toBe('192.168.1.100');
        expect(parsed.data.protocol).toBe(1);
        expect(parsed.data.fw).toBe('v1.2.0-esp32');
      }
    });

    test('parses Wi-Fi scan stream network item (wifi_net)', () => {
      const payload = JSON.stringify({
        type: 'wifi_net',
        ssid: 'Neighbor_Wifi',
        rssi: -65,
        sec: 1,
      });
      const parsed = parseBleMessage(payload);
      expect(parsed.kind).toBe('wifi_net');
      if (parsed.kind === 'wifi_net') {
        expect(parsed.data.ssid).toBe('Neighbor_Wifi');
        expect(parsed.data.rssi).toBe(-65);
        expect(parsed.data.sec).toBe(1);
      }
    });

    test('parses Wi-Fi scan progress (wifi_scan)', () => {
      const payload = JSON.stringify({
        type: 'wifi_scan',
        status: 'DONE',
        count: 5,
      });
      const parsed = parseBleMessage(payload);
      expect(parsed.kind).toBe('wifi_scan_progress');
      if (parsed.kind === 'wifi_scan_progress') {
        expect(parsed.data.status).toBe('DONE');
        expect(parsed.data.count).toBe(5);
      }
    });

    test('parses escalation history array', () => {
      const payload = JSON.stringify([
        { id: 'log-1', from: 'IDLE', to: 'STILLNESS_CHECK', stillness_seconds: 300 },
        { id: 'log-2', from: 'STILLNESS_CHECK', to: 'ALARM', stillness_seconds: 315 },
      ]);
      const parsed = parseBleMessage(payload);
      expect(parsed.kind).toBe('escalation_logs');
      if (parsed.kind === 'escalation_logs') {
        expect(parsed.data.length).toBe(2);
        expect(parsed.data[1].to).toBe('ALARM');
      }
    });

    test('parses device error codes (AUTH_FAILED, UNAUTHORIZED, UNKNOWN_CMD)', () => {
      const authErr = parseBleMessage('{"status":"AUTH_FAILED","state":"WIFI_FAILED"}');
      expect(authErr.kind).toBe('wifi_status');

      const unauthErr = parseBleMessage('{"status":"ERROR","error":"UNAUTHORIZED"}');
      expect(unauthErr.kind).toBe('device_error');
      if (unauthErr.kind === 'device_error') {
        expect(unauthErr.data.error).toBe('UNAUTHORIZED');
      }

      const unknownCmdErr = parseBleMessage('{"status":"ERROR","error":"UNKNOWN_CMD","cmd":"FOO"}');
      expect(unknownCmdErr.kind).toBe('device_error');
      if (unknownCmdErr.kind === 'device_error') {
        expect(unknownCmdErr.data.error).toBe('UNKNOWN_CMD');
      }
    });

    test('decodes Uint8Array binary UTF-8 payloads cleanly', () => {
      const text = '{"status":"PONG"}';
      const bytes = new TextEncoder().encode(text);
      const parsed = parseBleMessage(bytes);
      expect(parsed.kind).toBe('pong');
    });

    test('never crashes on malformed or partial JSON, returns malformed kind and logs warning', () => {
      const brokenPayloads = [
        '{ "cmd": "PROV_WIFI", "ssid": ',
        'random unformatted string text',
        '{"invalid_json: true',
        '',
      ];

      for (const broken of brokenPayloads) {
        expect(() => {
          const res = parseBleMessage(broken);
          expect(res.kind).toBe('malformed');
        }).not.toThrow();
      }
    });

    test('handles unknown valid JSON gracefully without crashing', () => {
      const weirdPayload = JSON.stringify({ custom_future_field: 42, arbitrary: true });
      const parsed = parseBleMessage(weirdPayload);
      expect(parsed.kind).toBe('unknown');
    });
  });
});

