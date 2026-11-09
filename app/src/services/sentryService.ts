import * as Sentry from '@sentry/react-native';
import { storage } from '../utils/storage';
import { logger, redactSensitiveString } from '../utils/logger';
import { APP_VERSION_STRING } from '../utils/version';

const STORAGE_KEY_SENTRY_OPT_IN = 'wsg_sentry_opt_in';

// Sensitive keys to redact from Sentry payloads
const SENSITIVE_KEY_REGEX =
  /^(pass(word)?|pin|secret|token|auth(orization)?|apikey|anon_key|key|ssid_pass|wifi_pass|credential|access_token|refresh_token)$/i;

function redactObjectRecursively(obj: any, seen = new WeakSet()): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return redactSensitiveString(obj);
  if (typeof obj !== 'object') return obj;

  if (seen.has(obj)) return '[Circular]';
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObjectRecursively(item, seen));
  }

  const cleaned: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      cleaned[key] = '[REDACTED]';
    } else {
      cleaned[key] = redactObjectRecursively(obj[key], seen);
    }
  }
  return cleaned;
}

class SentryServiceClass {
  private isInitialized = false;
  private optInEnabled = false;

  constructor() {
    this.checkAndInit();
  }

  /**
   * Reads persisted opt-in preference and initializes Sentry if user consented.
   */
  public async checkAndInit(): Promise<void> {
    try {
      const saved = await storage.getItem(STORAGE_KEY_SENTRY_OPT_IN);
      this.optInEnabled = saved === 'true';

      if (this.optInEnabled && !this.isInitialized) {
        this.init();
      }
    } catch (e) {
      logger.warn('SENTRY', 'Failed reading Sentry opt-in setting', e);
    }
  }

  /**
   * Initializes Sentry with strict anonymization and data redaction.
   */
  private init(): void {
    if (this.isInitialized) return;

    try {
      const dsn =
        process.env.EXPO_PUBLIC_SENTRY_DSN ||
        'https://examplePublicKey@o0.ingest.sentry.io/0';

      Sentry.init({
        dsn,
        enabled: this.optInEnabled,
        release: `wsg-app@${APP_VERSION_STRING}`,
        dist: '1',
        enableAutoSessionTracking: false, // Strict privacy
        attachStacktrace: true,
        // BeforeSend: Strip all personal identifiers and redact sensitive strings/tokens
        beforeSend(event) {
          // 1. Remove all user personal data
          delete event.user;
          if (event.request) {
            delete event.request.cookies;
            delete event.request.headers;
          }

          // 2. Sanitize and redact extra data
          if (event.extra) {
            event.extra = redactObjectRecursively(event.extra);
          }

          // 3. Sanitize and redact breadcrumbs
          if (event.breadcrumbs) {
            event.breadcrumbs = event.breadcrumbs.map((b) => {
              if (b.message) b.message = redactSensitiveString(b.message);
              if (b.data) b.data = redactObjectRecursively(b.data);
              return b;
            });
          }

          // 4. Sanitize exception messages
          if (event.exception?.values) {
            event.exception.values.forEach((v) => {
              if (v.value) v.value = redactSensitiveString(v.value);
            });
          }

          return event;
        },
        beforeBreadcrumb(breadcrumb) {
          if (breadcrumb.message) {
            breadcrumb.message = redactSensitiveString(breadcrumb.message);
          }
          if (breadcrumb.data) {
            breadcrumb.data = redactObjectRecursively(breadcrumb.data);
          }
          return breadcrumb;
        },
      });

      this.isInitialized = true;
      logger.info('SENTRY', 'Anonymous crash reporting initialized (opted in)');
    } catch (e: any) {
      logger.warn('SENTRY', `Sentry initialization note: ${e?.message}`);
    }
  }

  /**
   * Check if anonymous crash reporting is enabled by user.
   */
  public async isOptedIn(): Promise<boolean> {
    try {
      const saved = await storage.getItem(STORAGE_KEY_SENTRY_OPT_IN);
      return saved === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Toggle Sentry opt-in setting.
   */
  public async setOptIn(enabled: boolean): Promise<void> {
    this.optInEnabled = enabled;
    await storage.setItem(STORAGE_KEY_SENTRY_OPT_IN, enabled ? 'true' : 'false');

    if (enabled) {
      if (!this.isInitialized) {
        this.init();
      }
      logger.info('SENTRY', 'User opted IN to anonymous crash reporting');
    } else {
      logger.info('SENTRY', 'User opted OUT of anonymous crash reporting');
    }
  }

  /**
   * Safely captures an exception if opted in, redacting all sensitive data.
   */
  public captureException(error: any, context?: Record<string, any>): void {
    if (!this.optInEnabled) return;

    try {
      const safeContext = context ? redactObjectRecursively(context) : undefined;
      Sentry.captureException(error, {
        extra: safeContext,
      });
    } catch (e: any) {
      logger.warn('SENTRY', `Failed capturing exception: ${e?.message}`);
    }
  }

  /**
   * Safely captures a diagnostic message if opted in.
   */
  public captureMessage(message: string, context?: Record<string, any>): void {
    if (!this.optInEnabled) return;

    try {
      const safeMessage = redactSensitiveString(message);
      const safeContext = context ? redactObjectRecursively(context) : undefined;
      Sentry.captureMessage(safeMessage, {
        extra: safeContext,
      });
    } catch (e: any) {
      logger.warn('SENTRY', `Failed capturing message: ${e?.message}`);
    }
  }

  /**
   * Adds an anonymous diagnostic breadcrumb if opted in.
   */
  public addBreadcrumb(crumb: { message: string; category?: string; data?: any }): void {
    if (!this.optInEnabled) return;

    try {
      Sentry.addBreadcrumb({
        message: redactSensitiveString(crumb.message),
        category: crumb.category || 'app',
        data: crumb.data ? redactObjectRecursively(crumb.data) : undefined,
      });
    } catch {}
  }
}

export const sentryService = new SentryServiceClass();

