/**
 * Error Tracking & Monitoring
 * Integrates with Sentry for production error tracking
 * Falls back to local logging in development
 */

import { config } from '../config/env';
import { logger, LogLevel, logCritical } from '../shared/lib/logger';
import * as Sentry from '@sentry/node';

let sentryInitialized = false;

/**
 * Initialize Sentry if configured
 */
export async function initializeSentry(): Promise<void> {
  if (sentryInitialized) return;

  if (!config.SENTRY_DSN) {
    console.log('ℹ️  Sentry not configured - using local error tracking');
    return;
  }

  try {
    Sentry.init({
      dsn: config.SENTRY_DSN,
      environment: config.NODE_ENV,
      tracesSampleRate: config.NODE_ENV === 'production' ? 0.1 : 1.0,
      debug: config.NODE_ENV === 'development',
      maxBreadcrumbs: 50,
      // @ts-ignore - Sentry version might differ
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.OnUncaughtException(),
        new Sentry.Integrations.OnUnhandledRejection()
      ]
    });

    console.log('✅ Sentry initialized for error tracking');
    sentryInitialized = true;
  } catch (err) {
    console.warn('⚠️  Failed to initialize Sentry:', (err as Error).message);
  }
}

/**
 * Capture and report exceptions
 */
export function captureException(error: Error, context?: Record<string, any>): string {
  const errorId = Math.random().toString(36).substring(7);

  logger.log({
    level: LogLevel.ERROR,
    service: 'error_tracking',
    action: 'exception_captured',
    error: {
      message: error.message,
      stack: error.stack,
      code: (error as any).code
    },
    metadata: {
      errorId,
      ...context
    }
  });

  try {
    if (sentryInitialized) {
      Sentry.captureException(error, {
        contexts: {
          custom: context || {}
        },
        tags: {
          errorId
        }
      });
    }
  } catch (err) {
    // Sentry not available
  }

  return errorId;
}

/**
 * Capture messages for debugging
 */
export function captureMessage(
  message: string,
  level: 'debug' | 'info' | 'warning' | 'error' = 'info',
  context?: Record<string, any>
): void {
  const logLevel =
    level === 'debug' ? LogLevel.DEBUG :
      level === 'info' ? LogLevel.INFO :
        level === 'warning' ? LogLevel.WARN :
          LogLevel.ERROR;

  logger.log({
    level: logLevel,
    service: 'error_tracking',
    action: 'message_captured',
    metadata: context
  });

  try {
    if (sentryInitialized) {
      Sentry.captureMessage(message, level as any);
    }
  } catch (err) {
    // Sentry not available
  }
}

/**
 * Set user context for error tracking
 */
export function setErrorTrackingUser(staffId: string, email?: string, name?: string): void {
  try {
    if (sentryInitialized) {
      Sentry.setUser({
        id: staffId,
        email,
        username: name
      });
    }
  } catch (err) {
    // Sentry not available
  }
}

/**
 * Set additional context tags
 */
export function setErrorTrackingTags(tags: Record<string, string>): void {
  try {
    if (sentryInitialized) {
      Sentry.setTags(tags);
    }
  } catch (err) {
    // Sentry not available
  }
}

/**
 * Global error handler for uncaught exceptions
 */
export function setupGlobalErrorHandlers(): void {
  process.on('uncaughtException', (error: Error) => {
    logCritical('uncaught_exception', {
      message: error.message,
      stack: error.stack
    });
    captureException(error, { type: 'uncaughtException' });

    // Exit after logging
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  process.on('unhandledRejection', (reason: any) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logCritical('unhandled_rejection', {
      reason: String(reason),
      stack: error.stack
    });
    captureException(error, { type: 'unhandledRejection' });
  });
}

/**
 * Error response formatter for API endpoints
 */
export function formatErrorResponse(error: Error, errorId: string) {
  return {
    error: {
      code: (error as any).code || 'INTERNAL_ERROR',
      message: error.message,
      id: errorId,
      timestamp: new Date().toISOString()
    }
  };
}
