/**
 * Enterprise Structured Logging System
 * Logs all events with context for debugging, monitoring, and compliance
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from '../../config/env';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  restaurant_id?: string;
  user_id?: string; // Standardize on user_id as per user suggestion
  staff_id?: string; // Keep for backward compatibility
  action: string;
  duration_ms?: number;
  status?: number;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

class EnterpriseLogger {
  private static instance: EnterpriseLogger;
  private logQueue: LogEntry[] = [];
  private logDir: string;
  private isDev: boolean;
  private flushInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.isDev = process.env.NODE_ENV === 'development';
    this.logDir = path.join(process.cwd(), 'logs');

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Flush logs every 30 seconds or every 100 entries
    this.flushInterval = setInterval(() => {
      this.flush().catch(err => console.error('Failed to flush logs:', err));
    }, 30000);

    // Graceful shutdown
    process.on('exit', () => {
      this.flushSync();
    });
  }

  static getInstance(): EnterpriseLogger {
    if (!EnterpriseLogger.instance) {
      EnterpriseLogger.instance = new EnterpriseLogger();
    }
    return EnterpriseLogger.instance;
  }

  log(entry: Omit<LogEntry, 'timestamp'>, logToConsole = true): void {
    const fullEntry: LogEntry = {
      ...entry,
      timestamp: new Date().toISOString()
    };

    // Console output in development
    if (this.isDev && logToConsole) {
      const color = this.getColorForLevel(entry.level);
      console.log(`${color}[${fullEntry.timestamp}] ${entry.level} - ${entry.action}${color === '' ? '' : '\x1b[0m'}`);
      if (entry.error) {
        console.error(`  Error: ${entry.error.message}`);
        if (entry.error.stack && this.isDev) {
          console.error(entry.error.stack);
        }
      }
      if (Object.keys(entry.metadata || {}).length > 0) {
        console.log('  Metadata:', JSON.stringify(entry.metadata, null, 2));
      }
    }

    // Add to queue
    this.logQueue.push(fullEntry);

    // Flush if queue is large
    if (this.logQueue.length >= 100) {
      this.flush().catch(err => console.error('Failed to flush logs:', err));
    }

    // Critical errors always get flushed immediately
    if (entry.level === LogLevel.CRITICAL) {
      this.flush().catch(err => console.error('Failed to flush critical log:', err));
    }
  }

  private async flush(): Promise<void> {
    if (this.logQueue.length === 0) return;

    const logs = [...this.logQueue];
    this.logQueue = [];

    try {
      // Write to daily log file
      const date = new Date();
      const dateStr = date.toISOString().split('T')[0];
      const logFile = path.join(this.logDir, `${dateStr}.log`);

      const content = logs
        .map(log => JSON.stringify(log))
        .join('\n') + '\n';

      fs.appendFileSync(logFile, content);

      // Cloud Logging
      if (config.CLOUD_LOGGING === 'true' && config.SUPABASE_URL && (config.SUPABASE_SERVICE_KEY || config.SUPABASE_ANON_KEY)) {
        await this.sendToCloud(logs);
      }

      // Also write errors to separate file
      const errors = logs.filter(l => l.level === LogLevel.ERROR || l.level === LogLevel.CRITICAL);
      if (errors.length > 0) {
        const errorFile = path.join(this.logDir, `${dateStr}-errors.log`);
        const errorContent = errors
          .map(log => JSON.stringify(log))
          .join('\n') + '\n';
        fs.appendFileSync(errorFile, errorContent);
      }
    } catch (err) {
      console.error('Failed to write logs to file:', err);
    }
  }

  private async sendToCloud(logs: LogEntry[]) {
    const url = `${config.SUPABASE_URL}/rest/v1/system_logs`;
    const key = config.SUPABASE_SERVICE_KEY || config.SUPABASE_ANON_KEY;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': key!,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(logs)
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Failed to send logs to cloud:', error);
      }
    } catch (err) {
      console.error('Error sending logs to cloud:', err);
    }
  }

  private flushSync(): void {
    if (this.logQueue.length === 0) return;

    const logs = [...this.logQueue];
    this.logQueue = [];

    try {
      const date = new Date();
      const dateStr = date.toISOString().split('T')[0];
      const logFile = path.join(this.logDir, `${dateStr}.log`);

      const content = logs
        .map(log => JSON.stringify(log))
        .join('\n') + '\n';

      fs.appendFileSync(logFile, content);
    } catch (err) {
      console.error('Failed to write logs on shutdown:', err);
    }
  }

  private getColorForLevel(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return '\x1b[36m'; // Cyan
      case LogLevel.INFO:
        return '\x1b[32m'; // Green
      case LogLevel.WARN:
        return '\x1b[33m'; // Yellow
      case LogLevel.ERROR:
        return '\x1b[31m'; // Red
      case LogLevel.CRITICAL:
        return '\x1b[41m'; // Red background
      default:
        return '';
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.flush();
  }
}

// Export singleton instance
export const logger = EnterpriseLogger.getInstance();

/**
 * Express middleware for request logging
 */
export function requestLoggerMiddleware(req: any, res: any, next: any): void {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  // Attach request ID to response headers
  res.setHeader('X-Request-ID', requestId);

  // Use finish event to log after response is sent
  res.on('finish', () => {
    const duration = Date.now() - start;
    const isError = res.statusCode >= 400;

    logger.log(
      {
        level: isError ? LogLevel.WARN : LogLevel.INFO,
        service: 'api',
        restaurant_id: req.restaurant_id || req.body?.restaurant_id,
        user_id: req.user?.id,
        staff_id: req.user?.id, // Keep for backward compatibility
        action: `${req.method} ${req.path}`,
        duration_ms: duration,
        status: res.statusCode,
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
        metadata: {
          requestId,
          query: req.query,
          // We can't log body size easily here without more middleware
        }
      },
      false // Don't log to console for every request
    );
  });

  next();
}

// Usage helpers
export const logAuth = (event: string, staffId: string, metadata?: Record<string, any>) => {
  logger.log({
    level: LogLevel.INFO,
    service: 'auth',
    staff_id: staffId,
    action: event,
    metadata
  });
};

export const logDatabase = (action: string, table: string, duration: number, metadata?: Record<string, any>) => {
  logger.log({
    level: LogLevel.DEBUG,
    service: 'database',
    action: `${table}.${action}`,
    duration_ms: duration,
    metadata
  });
};

export const logError = (service: string, error: Error, metadata?: Record<string, any>) => {
  logger.log({
    level: LogLevel.ERROR,
    service,
    action: 'error_occurred',
    error: {
      message: error.message,
      stack: error.stack,
      code: (error as any).code
    },
    metadata
  });
};

export const logCritical = (action: string, metadata?: Record<string, any>) => {
  logger.log({
    level: LogLevel.CRITICAL,
    service: 'system',
    action,
    metadata
  });
};
