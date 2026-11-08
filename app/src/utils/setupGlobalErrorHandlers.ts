import { logger } from './logger';

declare const global: any;

let isInitialized = false;

export function setupGlobalErrorHandlers(): void {
  if (isInitialized) return;
  isInitialized = true;

  // 1. React Native ErrorUtils for uncaught JS exceptions
  try {
    const errorUtils = (global as any)?.ErrorUtils;
    if (errorUtils && typeof errorUtils.setGlobalHandler === 'function') {
      const originalHandler = errorUtils.getGlobalHandler();
      errorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
        logger.error('GLOBAL_ERROR', error?.message || 'Uncaught JS exception', {
          isFatal: Boolean(isFatal),
          ...logger.serializeError(error),
        });
        if (typeof originalHandler === 'function') {
          originalHandler(error, isFatal);
        }
      });
      logger.info('LOGGER', 'Native ErrorUtils global handler active');
    }
  } catch (e) {
    console.warn('[logger] Error attaching ErrorUtils handler:', e);
  }

  // 2. Unhandled Promise Rejections (Browser / React Native / Hermes)
  try {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('unhandledrejection', (event: any) => {
        const reason = event?.reason;
        logger.error(
          'PROMISE_REJECTION',
          reason?.message || 'Unhandled Promise Rejection',
          logger.serializeError(reason)
        );
      });
    }

    if (typeof (global as any).onunhandledrejection !== 'undefined') {
      const orig = (global as any).onunhandledrejection;
      (global as any).onunhandledrejection = (event: any) => {
        const reason = event?.reason;
        logger.error(
          'PROMISE_REJECTION',
          reason?.message || 'Unhandled Promise Rejection',
          logger.serializeError(reason)
        );
        if (typeof orig === 'function') orig(event);
      };
    }
  } catch (e) {
    console.warn('[logger] Error attaching promise rejection handler:', e);
  }
}

