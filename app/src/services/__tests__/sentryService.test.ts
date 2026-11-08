// Mock react-native
jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: '14' },
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.0.1', name: 'app' },
  default: { expoConfig: { version: '1.0.1', name: 'app' } },
}));

// Mock Sentry
const mockSentryInit = jest.fn();
const mockCaptureException = jest.fn();
const mockCaptureMessage = jest.fn();
const mockAddBreadcrumb = jest.fn();

let sentryConfigCaptured: any = null;
jest.mock('@sentry/react-native', () => ({
  init: jest.fn((config) => {
    sentryConfigCaptured = config;
    mockSentryInit(config);
  }),
  captureException: jest.fn((...args) => mockCaptureException(...args)),
  captureMessage: jest.fn((...args) => mockCaptureMessage(...args)),
  addBreadcrumb: jest.fn((...args) => mockAddBreadcrumb(...args)),
}));

// Mock storage
const mockStorage = new Map<string, string>();
jest.mock('../../utils/storage', () => ({
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

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    serializeError: jest.fn((e) => ({ message: e?.message })),
  },
  redactSensitiveString: jest.fn((str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/"(pass|token|secret)":\s*"[^"]*"/gi, '"$1":"[REDACTED]"')
      .replace(/eyJ[a-zA-Z0-9_\-\.]{20,}/g, '[REDACTED_JWT]');
  }),
}));

import { sentryService } from '../sentryService';

describe('Sentry Service (Opt-In & Anonymization)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.clear();
  });

  it('is disabled by default and does not capture exceptions without opt-in', async () => {
    const isOptedIn = await sentryService.isOptedIn();
    expect(isOptedIn).toBe(false);

    sentryService.captureException(new Error('Test error'));
    expect(mockCaptureException).not.toHaveBeenCalled();

    sentryService.captureMessage('Test message');
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('enables Sentry and initializes when user opts in', async () => {
    await sentryService.setOptIn(true);

    const isOptedIn = await sentryService.isOptedIn();
    expect(isOptedIn).toBe(true);
    expect(mockSentryInit).toHaveBeenCalled();

    sentryService.captureException(new Error('Real captured error'));
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it('anonymizes and strips all personal data in beforeSend', async () => {
    await sentryService.setOptIn(true);
    expect(sentryConfigCaptured).toBeDefined();

    const mockEvent: any = {
      user: {
        id: 'usr_12345',
        email: 'user@example.com',
        ip_address: '192.168.1.1',
      },
      request: {
        headers: { Authorization: 'Bearer secret_token' },
        cookies: { session: 'session_token' },
      },
      extra: {
        safeField: 'Washroom 1',
        password: 'PlainTextPassword123',
        token: 'supa_anon_key_12345',
      },
      breadcrumbs: [
        {
          message: 'Connecting to Wi-Fi {"pass":"PlainTextPassword123"}',
          data: { secret: 'top_secret' },
        },
      ],
      exception: {
        values: [
          {
            value: 'Error with token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz.abc',
          },
        ],
      },
    };

    const sanitizedEvent = sentryConfigCaptured.beforeSend(mockEvent);

    // 1. Personal user identification completely stripped
    expect(sanitizedEvent.user).toBeUndefined();
    expect(sanitizedEvent.request.headers).toBeUndefined();
    expect(sanitizedEvent.request.cookies).toBeUndefined();

    // 2. Extra data redacted
    expect(sanitizedEvent.extra.safeField).toBe('Washroom 1');
    expect(sanitizedEvent.extra.password).toBe('[REDACTED]');
    expect(sanitizedEvent.extra.token).toBe('[REDACTED]');

    // 3. Breadcrumbs redacted
    expect(sanitizedEvent.breadcrumbs[0].data.secret).toBe('[REDACTED]');
    expect(sanitizedEvent.breadcrumbs[0].message).toContain('[REDACTED]');

    // 4. Exception values redacted
    expect(sanitizedEvent.exception.values[0].value).toContain('[REDACTED_JWT]');
  });
});
