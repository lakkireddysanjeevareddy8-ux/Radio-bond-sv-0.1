import { Platform } from 'react-native';
import { storage } from './storage';
import { APP_VERSION_STRING, APP_DETAILS } from './version';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: string; // ISO 8601
  level: LogLevel;
  tag: string;
  message: string;
  data?: any;
}

export interface SerializedError {
  name?: string;
  message: string;
  stack?: string;
  // react-native-ble-plx BleError fields
  errorCode?: number;
  attErrorCode?: number | null;
  iosErrorCode?: number | null;
  androidErrorCode?: number | null;
  reason?: string | null;
  deviceID?: string | null;
  serviceUUID?: string | null;
  characteristicUUID?: string | null;
  // Generic error fields
  code?: string | number;
  status?: string | number;
  statusCode?: number;
  [key: string]: any;
}

const STORAGE_KEY_LOGS = 'wsg_diagnostic_logs_v1';
const MAX_LOG_ENTRIES = 500;
const DEBOUNCE_PERSIST_MS = 1000;

// Sensitive field names to automatically redact
const SENSITIVE_KEYS_REGEX =
  /^(pass(word)?|pin|secret|token|auth(orization)?|apikey|anon_key|key|ssid_pass|wifi_pass|credential|access_token|refresh_token)$/i;

// String replacement regexes for sensitive tokens and passwords
const SENSITIVE_STRING_PATTERNS: Array<{ regex: RegExp; replace: string }> = [
  // JSON or unquoted key-value: "pass":"xyz", pass: "xyz", pass=xyz, password: 'xyz'
  {
    regex: /(["']?)(pass(?:word)?|pin|secret|token|auth(?:orization)?|apikey|anon_key|wifi_pass|wifiPass)\1\s*[:=]\s*(["']?)[^"',\s\n\r\)\}\]]+\3/gi,
    replace: '$1$2$1: [REDACTED]',
  },
  // Key-value pair in query/URL/form: pass=xyz, token=xyz, key=xyz
  {
    regex: /(pass(?:word)?|token|secret|apiKey|anon_key)=([^&,\s\n\r]+)/gi,
    replace: '$1=[REDACTED]',
  },
  // Bearer tokens: Bearer ey... or Bearer xyz
  {
    regex: /bearer\s+[a-zA-Z0-9_\-\.]{8,}/gi,
    replace: 'Bearer [REDACTED]',
  },
  // JWT tokens: eyJ...
  {
    regex: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+/g,
    replace: '[REDACTED_JWT]',
  },
];

/**
 * Redacts any sensitive credentials or tokens found in plain strings.
 */
export function redactSensitiveString(str: string): string {
  if (!str || typeof str !== 'string') return str;
  let redacted = str;
  for (const { regex, replace } of SENSITIVE_STRING_PATTERNS) {
    redacted = redacted.replace(regex, replace);
  }
  return redacted;
}

class LoggerService {
  private buffer: LogEntry[] = [];
  private logIdCounter = 0;
  private persistTimeout: any = null;
  private isLoadedFromStorage = false;
  private subscribers: Set<(entries: LogEntry[]) => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const saved = await storage.getItem(STORAGE_KEY_LOGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const existingIds = new Set(this.buffer.map((e) => e.id));
          const loaded = parsed.filter((e) => e && e.timestamp && !existingIds.has(e.id));
          this.buffer = [...loaded, ...this.buffer].slice(-MAX_LOG_ENTRIES);
          this.notifySubscribers();
        }
      }
    } catch (e) {
      console.warn('[logger] Failed to load persisted logs:', e);
    } finally {
      this.isLoadedFromStorage = true;
    }
  }

  private schedulePersist(): void {
    if (this.persistTimeout) return;
    this.persistTimeout = setTimeout(async () => {
      this.persistTimeout = null;
      try {
        await storage.setItem(STORAGE_KEY_LOGS, JSON.stringify(this.buffer));
      } catch (e) {
        console.warn('[logger] Failed to persist logs:', e);
      }
    }, DEBOUNCE_PERSIST_MS);
  }

  /**
   * Recursively sanitizes data payloads, protecting against circular references
   * and automatically redacting sensitive credentials, keys, and tokens.
   */
  public sanitizeData(data: any, seen = new WeakSet()): any {
    if (data === null || data === undefined) return data;

    if (typeof data === 'string') {
      return redactSensitiveString(data);
    }

    if (typeof data !== 'object') {
      return data;
    }

    if (data instanceof Error) {
      return this.serializeError(data);
    }

    if (seen.has(data)) {
      return '[Circular]';
    }
    seen.add(data);

    if (Array.isArray(data)) {
      return data.slice(0, 50).map((item) => this.sanitizeData(item, seen));
    }

    const cleaned: Record<string, any> = {};
    const keys = Object.keys(data).slice(0, 50);

    for (const key of keys) {
      try {
        if (SENSITIVE_KEYS_REGEX.test(key)) {
          cleaned[key] = '[REDACTED]';
          continue;
        }

        const val = data[key];
        if (typeof val === 'function') continue;

        if (typeof val === 'string' && SENSITIVE_KEYS_REGEX.test(key)) {
          cleaned[key] = '[REDACTED]';
        } else {
          cleaned[key] = this.sanitizeData(val, seen);
        }
      } catch {
        cleaned[key] = '[Inaccessible]';
      }
    }
    return cleaned;
  }

  /**
   * Expands ALL fields of react-native-ble-plx BleError and standard Errors.
   * Also guarantees sensitive tokens and credentials are safe.
   */
  public serializeError(e: any): SerializedError {
    if (!e) {
      return { message: 'Unknown null/undefined error' };
    }

    if (typeof e === 'string') {
      return { message: redactSensitiveString(e) };
    }

    if (typeof e !== 'object') {
      return { message: String(e) };
    }

    const out: SerializedError = {
      message: redactSensitiveString(e.message || String(e)),
      name: e.name || 'Error',
    };

    if (e.stack) out.stack = redactSensitiveString(String(e.stack));

    // react-native-ble-plx BleError fields
    if ('errorCode' in e) out.errorCode = e.errorCode;
    if ('attErrorCode' in e) out.attErrorCode = e.attErrorCode;
    if ('iosErrorCode' in e) out.iosErrorCode = e.iosErrorCode;
    if ('androidErrorCode' in e) out.androidErrorCode = e.androidErrorCode;
    if ('reason' in e) out.reason = e.reason ? redactSensitiveString(String(e.reason)) : e.reason;
    if ('deviceID' in e) out.deviceID = e.deviceID;
    if ('serviceUUID' in e) out.serviceUUID = e.serviceUUID;
    if ('characteristicUUID' in e) out.characteristicUUID = e.characteristicUUID;

    // Additional common properties
    if ('code' in e && !('errorCode' in e)) out.code = e.code;
    if ('status' in e) out.status = e.status;
    if ('statusCode' in e) out.statusCode = e.statusCode;

    // Collect any other enumerable properties with sensitive redaction
    try {
      for (const k of Object.keys(e)) {
        if (!(k in out) && typeof e[k] !== 'function') {
          if (SENSITIVE_KEYS_REGEX.test(k)) {
            out[k] = '[REDACTED]';
          } else {
            out[k] = this.sanitizeData(e[k]);
          }
        }
      }
    } catch {}

    return out;
  }

  /**
   * Log an entry with level, tag, message and optional data.
   */
  public log(level: LogLevel, tag: string, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const entryId = `${Date.now()}_${++this.logIdCounter}`;

    const safeMessage = redactSensitiveString(message || '');
    const sanitizedData = data !== undefined ? this.sanitizeData(data) : undefined;

    const entry: LogEntry = {
      id: entryId,
      timestamp,
      level,
      tag: tag || 'APP',
      message: safeMessage,
      data: sanitizedData,
    };

    // Maintain 500-entry ring buffer
    this.buffer.push(entry);
    if (this.buffer.length > MAX_LOG_ENTRIES) {
      this.buffer.shift();
    }

    // Mirror to console
    const consoleTag = `[${level.toUpperCase()}] [${tag}] ${safeMessage}`;
    if (level === 'error') {
      if (sanitizedData !== undefined) console.error(consoleTag, sanitizedData);
      else console.error(consoleTag);
    } else if (level === 'warn') {
      if (sanitizedData !== undefined) console.warn(consoleTag, sanitizedData);
      else console.warn(consoleTag);
    } else if (level === 'debug') {
      if (sanitizedData !== undefined) console.debug(consoleTag, sanitizedData);
      else console.debug(consoleTag);
    } else {
      if (sanitizedData !== undefined) console.log(consoleTag, sanitizedData);
      else console.log(consoleTag);
    }

    this.schedulePersist();
    this.notifySubscribers();
  }

  public debug(tag: string, message: string, data?: any): void {
    this.log('debug', tag, message, data);
  }

  public info(tag: string, message: string, data?: any): void {
    this.log('info', tag, message, data);
  }

  public warn(tag: string, message: string, data?: any): void {
    this.log('warn', tag, message, data);
  }

  public error(tag: string, message: string, data?: any): void {
    this.log('error', tag, message, data);
  }

  /**
   * Returns current log entries in chronological order.
   */
  public getLogs(): LogEntry[] {
    return [...this.buffer];
  }

  /**
   * Clear all logs in-memory and in persistent storage.
   */
  public async clearLogs(): Promise<void> {
    this.buffer = [];
    if (this.persistTimeout) {
      clearTimeout(this.persistTimeout);
      this.persistTimeout = null;
    }
    try {
      await storage.removeItem(STORAGE_KEY_LOGS);
    } catch (e) {
      console.warn('[logger] Failed to clear persisted logs:', e);
    }
    this.notifySubscribers();
  }

  /**
   * Subscribe to log updates. Returns unsubscribe callback.
   */
  public subscribe(listener: (entries: LogEntry[]) => void): () => void {
    this.subscribers.add(listener);
    listener(this.getLogs());
    return () => {
      this.subscribers.delete(listener);
    };
  }

  private notifySubscribers(): void {
    const logs = this.getLogs();
    this.subscribers.forEach((fn) => {
      try {
        fn(logs);
      } catch (err) {
        console.warn('[logger] Subscriber error:', err);
      }
    });
  }

  /**
   * Export all logs as formatted text, including system diagnostics at top.
   */
  public exportLogsAsText(systemMeta?: Record<string, any>): string {
    const now = new Date().toISOString();
    const constants = (Platform as any)?.constants || {};
    const model =
      constants.Model ||
      constants.model ||
      (Platform.OS === 'ios' ? 'Apple Device' : 'Android/Web Device');
    const brand = constants.Brand || constants.brand || constants.Manufacturer || '';

    let header = '========================================\n';
    header += 'WSG-01 DIAGNOSTIC DEBUG LOGS\n';
    header += '========================================\n';
    header += `Exported At:       ${now}\n`;
    header += `Application:       ${APP_DETAILS.name} ${APP_VERSION_STRING}\n`;
    header += `Platform / OS:     ${Platform.OS} (Version: ${Platform.Version})\n`;
    header += `Device Model:      ${brand ? `${brand} ` : ''}${model}\n`;

    if (systemMeta) {
      for (const [k, v] of Object.entries(systemMeta)) {
        header += `${(k + ':').padEnd(19)} ${typeof v === 'object' ? JSON.stringify(v) : v}\n`;
      }
    }

    header += `Total Log Entries: ${this.buffer.length}\n`;
    header += '========================================\n\n';

    if (this.buffer.length === 0) {
      return header + '(No logs recorded yet)\n';
    }

    const lines = this.buffer.map((entry) => {
      let line = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.tag}] ${entry.message}`;
      if (entry.data !== undefined) {
        try {
          line += '\n  Data: ' + JSON.stringify(entry.data, null, 2).replace(/\n/g, '\n  ');
        } catch {
          line += `\n  Data: [Non-stringifiable data]`;
        }
      }
      return line;
    });

    return header + lines.join('\n\n') + '\n';
  }
}

export const logger = new LoggerService();

/**
 * Standardized Short User-Facing Error Codes:
 * BLE-101: Device not found nearby / pairing timeout
 * BLE-102: Bluetooth radio powered off
 * BLE-103: Bluetooth / Location permissions denied
 * BLE-201: Connection failed / handshake timeout
 * BLE-202: Disconnected unexpectedly / GATT link dropped
 * BLE-203: Service discovery failed / safety service missing
 * BLE-204: Characteristic not found
 * BLE-301: Command write failed
 * BLE-302: Read characteristic failed
 * BLE-401: Notification monitor subscription failed
 * WIFI-101: Incorrect Wi-Fi password (AUTH_FAILED)
 * WIFI-102: Network not found (NO_SSID)
 * WIFI-103: Wi-Fi connection timed out (WIFI_TIMEOUT)
 * WIFI-104: Provisioning write failed
 * DEV-501: Hardware or sensor fault reported by device
 * DEV-502: Device firmware update required
 * APP-500: Unexpected application error / crash
 */
export function getShortErrorCode(error: any, context?: string): string {
  if (!error) return 'BLE-000';

  const serialized = logger.serializeError(error);
  const msg = (serialized.message || '').toLowerCase();
  const reason = (serialized.reason || '').toLowerCase();
  const codeStr = String(serialized.code || '').toUpperCase();

  // Wi-Fi codes
  if (
    msg.includes('auth_failed') ||
    msg.includes('password') ||
    codeStr === 'AUTH_FAILED' ||
    context === 'wifi_auth'
  ) {
    return 'WIFI-101';
  }
  if (
    msg.includes('no_ssid') ||
    msg.includes('network not found') ||
    codeStr === 'NO_SSID' ||
    context === 'wifi_ssid'
  ) {
    return 'WIFI-102';
  }
  if (
    msg.includes('wifi_timeout') ||
    (context === 'wifi' && msg.includes('timeout')) ||
    codeStr === 'WIFI_TIMEOUT'
  ) {
    return 'WIFI-103';
  }
  if (context === 'provisioning') {
    return 'WIFI-104';
  }

  // Device firmware / hardware codes
  if (
    msg.includes('firmware') ||
    msg.includes('outdated_protocol') ||
    codeStr === 'FW_UPDATE_NEEDED'
  ) {
    return 'DEV-502';
  }
  if (
    context === 'device' ||
    msg.includes('hardware error') ||
    msg.includes('sensor') ||
    codeStr === 'HARDWARE_ERROR'
  ) {
    return 'DEV-501';
  }

  // BLE codes
  if (
    msg.includes('bluetooth_disabled') ||
    msg.includes('powered off') ||
    msg.includes('bluetooth is turned off')
  ) {
    return 'BLE-102';
  }
  if (
    msg.includes('permission') ||
    msg.includes('unauthorized') ||
    serialized.errorCode === 1
  ) {
    return 'BLE-103';
  }
  if (
    msg.includes('not found') &&
    (msg.includes('device') || context === 'scan')
  ) {
    return 'BLE-101';
  }
  if (
    msg.includes('service not found') ||
    (msg.includes('service') && msg.includes('missing'))
  ) {
    return 'BLE-203';
  }
  if (
    msg.includes('characteristic not found') ||
    msg.includes('characteristic')
  ) {
    return 'BLE-204';
  }
  if (context === 'write' || msg.includes('write')) {
    return 'BLE-301';
  }
  if (context === 'read' || msg.includes('read')) {
    return 'BLE-302';
  }
  if (context === 'monitor' || msg.includes('monitor') || msg.includes('notify')) {
    return 'BLE-401';
  }
  if (
    msg.includes('disconnect') ||
    reason.includes('disconnect') ||
    serialized.errorCode === 2
  ) {
    return 'BLE-202';
  }
  if (
    msg.includes('connection failed') ||
    msg.includes('timed out') ||
    context === 'connect'
  ) {
    return 'BLE-201';
  }

  // Application crash
  if (context === 'crash' || msg.includes('crash') || msg.includes('render')) {
    return 'APP-500';
  }

  return 'BLE-201';
}

/**
 * Backwards-compatible alias for BLE error code detection.
 */
export const getBleErrorCode = getShortErrorCode;

/**
 * Format a user-facing error message pairing a clear explanation with a short code.
 */
export function formatUserError(
  error: any,
  fallbackExplanation = 'Operation failed',
  context?: string
): { message: string; code: string; display: string } {
  const code = getShortErrorCode(error, context);
  const serialized = logger.serializeError(error);
  let explanation = fallbackExplanation;

  switch (code) {
    case 'BLE-101':
      explanation = 'Device not found nearby. Make sure it is in pairing mode';
      break;
    case 'BLE-102':
      explanation = 'Bluetooth is turned off on this phone';
      break;
    case 'BLE-103':
      explanation = 'Bluetooth permissions are required';
      break;
    case 'BLE-201':
      explanation = 'Connection failed. Please try again';
      break;
    case 'BLE-202':
      explanation = 'Device disconnected unexpectedly';
      break;
    case 'BLE-203':
      explanation = 'Safety service not found on device';
      break;
    case 'BLE-204':
      explanation = 'Required characteristic missing on device';
      break;
    case 'BLE-301':
      explanation = 'Failed to send command to device';
      break;
    case 'BLE-302':
      explanation = 'Failed to read data from device';
      break;
    case 'BLE-401':
      explanation = 'Failed to subscribe to device notifications';
      break;
    case 'WIFI-101':
      explanation = 'Incorrect Wi-Fi password';
      break;
    case 'WIFI-102':
      explanation = 'Wi-Fi network not found (must be 2.4 GHz)';
      break;
    case 'WIFI-103':
      explanation = 'Wi-Fi connection timed out';
      break;
    case 'WIFI-104':
      explanation = 'Failed to transfer Wi-Fi credentials to device';
      break;
    case 'DEV-501':
      explanation = serialized.message || 'Device reported a hardware issue';
      break;
    case 'DEV-502':
      explanation = 'Device firmware update needed';
      break;
    case 'APP-500':
      explanation = 'An unexpected application error occurred';
      break;
    default:
      if (serialized.message && serialized.message.length < 60) {
        explanation = serialized.message;
      }
      break;
  }

  const display = `${explanation} (${code})`;
  return { message: explanation, code, display };
}

/**
 * Backwards-compatible alias for BLE error formatter.
 */
export const formatUserBleError = formatUserError;
