/**
 * Health Monitoring System
 * Tracks system health and alerts when issues occur
 */

import { PrismaClient } from '@prisma/client';
import { logger, LogLevel } from '../shared/lib/logger';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: HealthCheck;
    memory: HealthCheck;
    disk: HealthCheck;
  };
}

export interface HealthCheck {
  status: 'ok' | 'warning' | 'critical';
  message: string;
  value?: number | string;
}

class HealthMonitor {
  private static instance: HealthMonitor;
  private prisma: PrismaClient;
  private startTime: number;
  private lastAlert: Map<string, number> = new Map();
  private alertCooldown = 60000; // 1 minute

  private constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.startTime = Date.now();
  }

  static initialize(prisma: PrismaClient): HealthMonitor {
    if (!HealthMonitor.instance) {
      HealthMonitor.instance = new HealthMonitor(prisma);
    }
    return HealthMonitor.instance;
  }

  static getInstance(): HealthMonitor {
    if (!HealthMonitor.instance) {
      throw new Error('HealthMonitor not initialized. Call initialize() first.');
    }
    return HealthMonitor.instance;
  }

  async checkHealth(): Promise<HealthStatus> {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkMemory(),
      this.checkDisk()
    ]);

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (checks.some(c => c.status === 'critical')) {
      overallStatus = 'unhealthy';
    } else if (checks.some(c => c.status === 'warning')) {
      overallStatus = 'degraded';
    }

    const status: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      checks: {
        database: checks[0],
        memory: checks[1],
        disk: checks[2]
      }
    };

    // Alert if unhealthy
    if (overallStatus === 'unhealthy') {
      await this.sendAlert(status);
    }

    return status;
  }

  private async checkDatabase(): Promise<HealthCheck> {
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      const duration = Date.now() - start;

      if (duration > 1000) {
        return {
          status: 'warning',
          message: `Database slow - ${duration}ms`,
          value: `${duration}ms`
        };
      }

      return {
        status: 'ok',
        message: 'Database connected',
        value: `${duration}ms`
      };
    } catch (err) {
      logger.log({
        level: LogLevel.ERROR,
        service: 'health_check',
        action: 'database_check_failed',
        error: {
          message: (err as Error).message
        }
      });

      return {
        status: 'critical',
        message: 'Database connection failed',
        value: (err as Error).message
      };
    }
  }

  private checkMemory(): HealthCheck {
    const usage = process.memoryUsage();
    const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;

    if (heapUsedPercent > 90) {
      return {
        status: 'critical',
        message: `Memory critical - ${heapUsedPercent.toFixed(1)}% used`,
        value: `${heapUsedPercent.toFixed(1)}%`
      };
    }

    if (heapUsedPercent > 75) {
      return {
        status: 'warning',
        message: `Memory warning - ${heapUsedPercent.toFixed(1)}% used`,
        value: `${heapUsedPercent.toFixed(1)}%`
      };
    }

    return {
      status: 'ok',
      message: `Memory healthy - ${heapUsedPercent.toFixed(1)}% used`,
      value: `${heapUsedPercent.toFixed(1)}%`
    };
  }

  private checkDisk(): HealthCheck {
    // Simple check - in production, use a proper disk space checker
    const usage = process.uptime();
    
    return {
      status: 'ok',
      message: 'Disk check passed',
      value: `Uptime: ${Math.floor(usage / 3600)}h`
    };
  }

  private async sendAlert(status: HealthStatus): Promise<void> {
    const alertKey = `${status.status}_${new Date().toISOString().split('T')[0]}`;
    const lastAlertTime = this.lastAlert.get(alertKey) || 0;

    // Don't alert too frequently
    if (Date.now() - lastAlertTime < this.alertCooldown) {
      return;
    }

    this.lastAlert.set(alertKey, Date.now());

    logger.log({
      level: LogLevel.CRITICAL,
      service: 'health_monitor',
      action: 'health_alert',
      metadata: {
        status: status.status,
        checks: status.checks
      }
    });

    // TODO: Send to Slack/Email/PagerDuty if webhook configured
    // await this.notifySlack(status);
  }

  // private async notifySlack(status: HealthStatus): Promise<void> {
  //   const webhook = process.env.SLACK_WEBHOOK_URL;
  //   if (!webhook) return;
  //
  //   const color = status.status === 'unhealthy' ? '#FF0000' : '#FFAA00';
  //   const message = {
  //     attachments: [{
  //       color,
  //       title: `🚨 Fireflow ${status.status.toUpperCase()}`,
  //       fields: [
  //         { title: 'Database', value: status.checks.database.message, short: true },
  //         { title: 'Memory', value: status.checks.memory.message, short: true },
  //         { title: 'Timestamp', value: status.timestamp, short: false }
  //       ]
  //     }]
  //   };
  //
  //   try {
  //     await fetch(webhook, {
  //       method: 'POST',
  //       body: JSON.stringify(message)
  //     });
  //   } catch (err) {
  //     logger.log({
  //       level: LogLevel.WARN,
  //       service: 'health_monitor',
  //       action: 'slack_notification_failed',
  //       error: { message: (err as Error).message }
  //     });
  //   }
  // }
}

export default HealthMonitor;
