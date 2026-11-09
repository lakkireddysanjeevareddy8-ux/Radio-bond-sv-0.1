import { logger } from '../utils/logger';

// ============================================================================
// BLE GATT SERVICE & CHARACTERISTIC UUIDS
// ============================================================================
export const BLE_UUIDS = {
  SERVICE: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
  COMMAND: 'beb5483e-36e1-4688-b7f5-ea07361b26a8', // Write commands
  STATUS: 'beb5483e-36e1-4688-b7f5-ea07361b26a9',  // Read / Notify status & replies
  EVENT: 'beb5483e-36e1-4688-b7f5-ea07361b26aa',   // Read / Notify real-time events & history
  CONFIG: 'beb5483e-36e1-4688-b7f5-ea07361b26ab',  // Read / Write / Notify escalation config
} as const;

// Maximum payload size per BLE packet
export const BLE_MAX_MTU = 247;
export const BLE_MAX_PAYLOAD = 244; // 247 - 3 ATT bytes

// Protocol version requirements
export const CURRENT_PROTOCOL_VERSION = 1;
export const MIN_SUPPORTED_PROTOCOL_VERSION = 1;

// Error codes
export const BLE_ERROR_CODES = {
  AUTH_FAILED: 'AUTH_FAILED',
  NO_SSID: 'NO_SSID',
  WIFI_TIMEOUT: 'WIFI_TIMEOUT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMITED: 'RATE_LIMITED',
  PAIRING_WINDOW_CLOSED: 'PAIRING_WINDOW_CLOSED',
  UNKNOWN_CMD: 'UNKNOWN_CMD',
  INVALID_JSON: 'INVALID_JSON',
  FW_UPDATE_NEEDED: 'FW_UPDATE_NEEDED',
} as const;

export type BleErrorCode = (typeof BLE_ERROR_CODES)[keyof typeof BLE_ERROR_CODES] | string;

// ============================================================================
// COMMAND BUILDERS
// ============================================================================

export interface ProvWifiParams {
  ssid: string;
  pass: string;
  token?: string;
  name?: string;
  room?: string;
}

export interface EscalationConfigParams {
  t1?: number;
  repeat?: number;
  volume?: number;
  hb_interval?: number;
  token?: string;
}

export interface SetPairingTokenParams {
  currentToken?: string;
  newToken: string;
}

export const BleProtocol = {
  /**
   * Builds PROV_WIFI command JSON string.
   */
  formatProvWifi(params: ProvWifiParams): string {
    return JSON.stringify({
      cmd: 'PROV_WIFI',
      ssid: params.ssid,
      pass: params.pass,
      ...(params.token ? { token: params.token } : {}),
      ...(params.name ? { name: params.name } : {}),
      ...(params.room ? { room: params.room } : {}),
    });
  },

  /**
   * Builds GET_STATUS command JSON string.
   */
  formatGetStatus(): string {
    return JSON.stringify({ cmd: 'GET_STATUS' });
  },

  /**
   * Builds SCAN_WIFI command JSON string.
   */
  formatScanWifi(): string {
    return JSON.stringify({ cmd: 'SCAN_WIFI' });
  },

  /**
   * Builds FORGET_WIFI command JSON string.
   */
  formatForgetWifi(token?: string): string {
    return JSON.stringify({
      cmd: 'FORGET_WIFI',
      ...(token ? { token } : {}),
    });
  },

  /**
   * Builds PING command JSON string.
   */
  formatPing(): string {
    return JSON.stringify({ cmd: 'PING' });
  },

  /**
   * Builds TEST_EMERGENCY command JSON string.
   */
  formatTestEmergency(token: string): string {
    return JSON.stringify({
      cmd: 'TEST_EMERGENCY',
      token,
    });
  },

  /**
   * Builds CANCEL_TEST command JSON string.
   */
  formatCancelTest(token: string): string {
    return JSON.stringify({
      cmd: 'CANCEL_TEST',
      token,
    });
  },

  /**
   * Builds SET_ESCALATION_CONFIG command JSON string.
   */
  formatSetEscalationConfig(config: EscalationConfigParams, token?: string): string {
    const effectiveToken = token || config.token;
    return JSON.stringify({
      cmd: 'SET_ESCALATION_CONFIG',
      ...(effectiveToken ? { token: effectiveToken } : {}),
      ...(typeof config.t1 === 'number' ? { t1: config.t1 } : {}),
      ...(typeof config.repeat === 'number' ? { repeat: config.repeat } : {}),
      ...(typeof config.volume === 'number' ? { volume: config.volume } : {}),
      ...(typeof config.hb_interval === 'number' ? { hb_interval: config.hb_interval } : {}),
    });
  },

  /**
   * Builds GET_ESCALATION_CONFIG command JSON string.
   */
  formatGetEscalationConfig(): string {
    return JSON.stringify({ cmd: 'GET_ESCALATION_CONFIG' });
  },

  /**
   * Builds SET_PAIRING_TOKEN command JSON string.
   * Requires currentToken to authenticate the change, and newToken.
   */
  formatSetPairingToken(newTokenOrParams: string | SetPairingTokenParams, currentToken?: string): string {
    if (typeof newTokenOrParams === 'string') {
      return JSON.stringify({
        cmd: 'SET_PAIRING_TOKEN',
        ...(currentToken ? { current_token: currentToken, token: currentToken } : {}),
        new_token: newTokenOrParams,
      });
    }
    return JSON.stringify({
      cmd: 'SET_PAIRING_TOKEN',
      ...(newTokenOrParams.currentToken
        ? { current_token: newTokenOrParams.currentToken, token: newTokenOrParams.currentToken }
        : {}),
      new_token: newTokenOrParams.newToken,
    });
  },
};

// ============================================================================
// TYPED MESSAGE DEFINITIONS
// ============================================================================

export interface WifiStatusPayload {
  status: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'WIFI_TIMEOUT' | 'AUTH_FAILED' | 'NO_SSID' | string;
  state?: string;
  ssid?: string;
  ip?: string;
  saved?: string;
  model?: string;
  protocol?: number;
  fw?: string;
  is_test?: boolean;
  trigger?: string;
  source?: string;
  pairing_active?: boolean;
  token?: string;
  retry_after?: number;
}

export interface WifiScanProgressPayload {
  status: 'SCANNING' | 'DONE';
  count?: number;
}

export interface WifiNetPayload {
  ssid: string;
  rssi: number;
  sec: number; // 0 = Open, 1 = Secured
}

export interface PongPayload {
  status: 'PONG';
}

export interface TestEmergencyStatusPayload {
  status: 'TEST_EMERGENCY';
  state?: string;
  is_test: boolean;
  model?: string;
  trigger?: string;
  source?: string;
}

export interface TestCancelledStatusPayload {
  status: 'OK';
  test_cancelled: true;
}

export interface EmergencyEventPayload {
  event: 'EMERGENCY' | 'TEST_EMERGENCY' | string;
  trigger?: string;
  source?: string;
  timestamp?: number | string;
  deviceId?: string;
  deviceName?: string;
  is_test?: boolean;
}

export interface EscalationLogEntry {
  id?: string;
  timestamp?: number | string;
  timestampMs?: number;
  from?: string;
  fromState?: string;
  to?: string;
  toState?: string;
  trigger?: string;
  stillness_seconds?: number;
  stillnessSec?: number;
}

export interface DeviceErrorPayload {
  status?: string;
  error: BleErrorCode;
  code?: string;
  message?: string;
  cmd?: string;
  protocol?: number;
  fw?: string;
}

// Discriminated Parsed Message Union
export type ParsedBleMessage =
  | { kind: 'wifi_status'; data: WifiStatusPayload; raw: any }
  | { kind: 'wifi_scan_progress'; data: WifiScanProgressPayload; raw: any }
  | { kind: 'wifi_net'; data: WifiNetPayload; raw: any }
  | { kind: 'pong'; data: PongPayload; raw: any }
  | { kind: 'test_emergency_status'; data: TestEmergencyStatusPayload; raw: any }
  | { kind: 'test_cancelled_status'; data: TestCancelledStatusPayload; raw: any }
  | { kind: 'emergency_event'; data: EmergencyEventPayload; raw: any }
  | { kind: 'escalation_logs'; data: EscalationLogEntry[]; raw: any }
  | { kind: 'device_error'; data: DeviceErrorPayload; raw: any }
  | { kind: 'outdated_protocol'; protocol: number; fw?: string; minSupported: number; message: string; raw: any }
  | { kind: 'unknown'; data: any; raw: any }
  | { kind: 'malformed'; error: string; raw: string };

// ============================================================================
// PARSERS & VALIDATORS
// ============================================================================

/**
 * Validates protocol compatibility.
 * Returns false if the device protocol version is lower than the app expects.
 */
export function validateProtocolVersion(data: any): {
  isCompatible: boolean;
  message?: string;
  protocol?: number;
  fw?: string;
} {
  if (data && typeof data.protocol === 'number') {
    if (data.protocol < MIN_SUPPORTED_PROTOCOL_VERSION) {
      return {
        isCompatible: false,
        message: 'Device firmware update needed',
        protocol: data.protocol,
        fw: typeof data.fw === 'string' ? data.fw : undefined,
      };
    }
    return {
      isCompatible: true,
      protocol: data.protocol,
      fw: typeof data.fw === 'string' ? data.fw : undefined,
    };
  }
  return { isCompatible: true };
}

/**
 * Robustly parses and validates any incoming BLE JSON payload without throwing.
 * Handles arrays, single objects, errors, scan streams, and protocol version checks.
 */
export function parseBleMessage(input: string | Uint8Array | any): ParsedBleMessage {
  let jsonString = '';
  if (typeof input === 'string') {
    jsonString = input.trim();
  } else if (input instanceof Uint8Array) {
    try {
      jsonString = new TextDecoder().decode(input).trim();
    } catch (e: any) {
      logger.warn('PROTOCOL', `TextDecoder failure on raw BLE payload: ${e?.message}`);
      return { kind: 'malformed', error: 'Failed to decode UTF-8 byte stream', raw: '' };
    }
  } else if (input && typeof input === 'object') {
    // Already an object/array
    return categorizeParsedData(input);
  } else {
    return { kind: 'malformed', error: 'Input is not a string, Uint8Array or object', raw: String(input) };
  }

  if (!jsonString) {
    return { kind: 'malformed', error: 'Empty payload received', raw: '' };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err: any) {
    logger.warn('PROTOCOL', `JSON parse error for BLE message: ${err?.message}`, { jsonString });
    return { kind: 'malformed', error: err?.message || 'Invalid JSON syntax', raw: jsonString };
  }

  const result = categorizeParsedData(parsed);
  logger.debug('PROTOCOL', `Parsed BLE message: ${result.kind}`);
  return result;
}

/**
 * Categorizes and types parsed JSON data.
 */
function categorizeParsedData(parsed: any): ParsedBleMessage {
  // 1. Array of escalation history logs
  if (Array.isArray(parsed)) {
    return {
      kind: 'escalation_logs',
      data: parsed as EscalationLogEntry[],
      raw: parsed,
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    logger.warn('PROTOCOL', 'Parsed JSON is primitive or null, expected object or array', { parsed });
    return { kind: 'unknown', data: parsed, raw: parsed };
  }

  // 2. Protocol version compatibility check
  const versionCheck = validateProtocolVersion(parsed);
  if (!versionCheck.isCompatible && typeof versionCheck.protocol === 'number') {
    logger.warn('PROTOCOL', `Device protocol outdated: ${versionCheck.protocol} < ${MIN_SUPPORTED_PROTOCOL_VERSION}`, parsed);
    return {
      kind: 'outdated_protocol',
      protocol: versionCheck.protocol,
      fw: versionCheck.fw,
      minSupported: MIN_SUPPORTED_PROTOCOL_VERSION,
      message: 'Device firmware update needed',
      raw: parsed,
    };
  }

  const type = String(parsed.type || '').toLowerCase();
  const status = String(parsed.status || '').toUpperCase();
  const event = String(parsed.event || '').toUpperCase();
  const error = parsed.error ? String(parsed.error).toUpperCase() : '';

  // 3. Error replies
  if (status === 'ERROR' || error || type === 'error') {
    return {
      kind: 'device_error',
      data: {
        status: parsed.status,
        error: (error || parsed.code || 'UNKNOWN_ERROR') as BleErrorCode,
        message: parsed.message || error || 'Device reported error',
        cmd: parsed.cmd,
        protocol: parsed.protocol,
        fw: parsed.fw,
      },
      raw: parsed,
    };
  }

  // 4. PONG reply
  if (status === 'PONG') {
    return {
      kind: 'pong',
      data: { status: 'PONG' },
      raw: parsed,
    };
  }

  // 5. Wi-Fi scan stream items
  if (type === 'wifi_net') {
    return {
      kind: 'wifi_net',
      data: {
        ssid: String(parsed.ssid || ''),
        rssi: Number(parsed.rssi ?? -90),
        sec: Number(parsed.sec ?? 1),
      },
      raw: parsed,
    };
  }

  if (type === 'wifi_scan') {
    const scanStatus = (parsed.status === 'SCANNING' ? 'SCANNING' : 'DONE') as 'SCANNING' | 'DONE';
    return {
      kind: 'wifi_scan_progress',
      data: {
        status: scanStatus,
        count: typeof parsed.count === 'number' ? parsed.count : undefined,
      },
      raw: parsed,
    };
  }

  // 6. Test cancellation status
  if (parsed.test_cancelled === true && (status === 'OK' || event === 'TEST_CANCELLED')) {
    return {
      kind: 'test_cancelled_status',
      data: { status: 'OK', test_cancelled: true },
      raw: parsed,
    };
  }

  // 7. Test Emergency status / Event
  if (status === 'TEST_EMERGENCY' || event === 'TEST_EMERGENCY') {
    if (type === 'event' || event === 'TEST_EMERGENCY') {
      return {
        kind: 'emergency_event',
        data: {
          event: 'TEST_EMERGENCY',
          trigger: parsed.trigger || 'test',
          source: parsed.source || 'app',
          timestamp: parsed.timestamp,
          deviceId: parsed.deviceId || parsed.device_id,
          deviceName: parsed.deviceName || parsed.name,
          is_test: true,
        },
        raw: parsed,
      };
    }
    return {
      kind: 'test_emergency_status',
      data: {
        status: 'TEST_EMERGENCY',
        state: parsed.state,
        is_test: true,
        model: parsed.model,
        trigger: parsed.trigger,
        source: parsed.source,
      },
      raw: parsed,
    };
  }

  // 8. General Emergency event
  if (type === 'event' || event === 'EMERGENCY' || status === 'EMERGENCY' || status === 'ALARM') {
    return {
      kind: 'emergency_event',
      data: {
        event: (parsed.event || 'EMERGENCY') as 'EMERGENCY' | string,
        trigger: parsed.trigger || (parsed.state === 'EMERGENCY' ? 'VOICE' : 'OTHER'),
        source: parsed.source || 'manual_device_trigger',
        timestamp: parsed.timestamp,
        deviceId: parsed.deviceId || parsed.device_id,
        deviceName: parsed.deviceName || parsed.name,
        is_test: Boolean(parsed.is_test),
      },
      raw: parsed,
    };
  }

  // 9. Wi-Fi status messages
  if (
    type === 'status' ||
    type === 'wifi_status' ||
    status === 'CONNECTED' ||
    status === 'DISCONNECTED' ||
    status === 'CONNECTING' ||
    status === 'AUTH_FAILED' ||
    status === 'NO_SSID' ||
    status === 'WIFI_TIMEOUT'
  ) {
    return {
      kind: 'wifi_status',
      data: {
        status: parsed.status || (type === 'status' ? 'DISCONNECTED' : status),
        state: parsed.state,
        ssid: parsed.ssid,
        ip: parsed.ip,
        saved: parsed.saved,
        model: parsed.model,
        protocol: parsed.protocol,
        fw: parsed.fw,
        is_test: parsed.is_test,
        trigger: parsed.trigger,
        source: parsed.source,
        pairing_active: parsed.pairing_active,
        token: parsed.token,
        retry_after: parsed.retry_after,
      },
      raw: parsed,
    };
  }

  // 10. Unknown valid JSON object
  logger.info('PROTOCOL', 'Unrecognized BLE payload structure', parsed);
  return { kind: 'unknown', data: parsed, raw: parsed };
}

