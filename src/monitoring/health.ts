/**
 * Health Monitoring System
 * Performs periodic checks on database, cloud services, and system resources
 */

import { prisma } from '../shared/lib/prisma';
import { config } from '../config/env';
import os from 'os';

interface HealthCheckResult {
    status: 'healthy' | 'unhealthy' | 'degraded';
    details?: any;
    latency_ms?: number;
    status_code?: number;
}

interface HealthStatus {
    status: 'healthy' | 'unhealthy';
    timestamp: string;
    uptime: number;
    checks: {
        database: HealthCheckResult;
        supabase?: HealthCheckResult;
        system: {
            memory: HealthCheckResult;
            disk?: HealthCheckResult;
            load: HealthCheckResult;
        };
    };
}

export class HealthMonitor {
    /**
     * Performs a complete health check of the system
     */
    static async checkHealth(): Promise<HealthStatus> {
        // const start = Date.now(); // Removed unused variable

        const [dbCheck, supabaseCheck] = await Promise.all([
            this.checkDatabase(),
            this.checkSupabase()
        ]);

        const systemCheck = {
            memory: this.checkMemory(),
            load: this.checkLoad()
        };

        const isHealthy = dbCheck.status === 'healthy' &&
            (!supabaseCheck || supabaseCheck.status !== 'unhealthy');

        const status: HealthStatus = {
            status: isHealthy ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            checks: {
                database: dbCheck,
                supabase: supabaseCheck,
                system: systemCheck
            }
        };

        if (!isHealthy) {
            await this.alertAdmin(status);
        }

        return status;
    }

    private static async checkDatabase(): Promise<HealthCheckResult> {
        const start = Date.now();
        try {
            // Simple query to verify connection
            await prisma.$queryRaw`SELECT 1`;
            return {
                status: 'healthy',
                latency_ms: Date.now() - start
            };
        } catch (err) {
            return {
                status: 'unhealthy',
                details: (err as Error).message
            };
        }
    }

    private static async checkSupabase(): Promise<HealthCheckResult | undefined> {
        if (!config.SUPABASE_URL) return undefined;

        const start = Date.now();
        try {
            const response = await fetch(`${config.SUPABASE_URL}/rest/v1/`, {
                headers: { 'apikey': config.SUPABASE_ANON_KEY || '' }
            });

            return {
                status: response.ok ? 'healthy' : 'degraded',
                status_code: response.status,
                latency_ms: Date.now() - start
            };
        } catch (err) {
            return {
                status: 'unhealthy',
                details: (err as Error).message
            };
        }
    }

    private static checkMemory(): HealthCheckResult {
        const total = os.totalmem();
        const free = os.freemem();
        const usedPercent = ((total - free) / total) * 100;

        return {
            status: usedPercent > 90 ? 'degraded' : 'healthy',
            details: {
                free_mb: Math.round(free / 1024 / 1024),
                total_mb: Math.round(total / 1024 / 1024),
                used_percent: Math.round(usedPercent)
            }
        };
    }

    private static checkLoad(): HealthCheckResult {
        const load = os.loadavg();
        const cpus = os.cpus().length;

        return {
            status: load[0] > cpus ? 'degraded' : 'healthy',
            details: {
                load_1m: load[0],
                load_5m: load[1],
                load_15m: load[2],
                cpu_cores: cpus
            }
        };
    }

    private static async alertAdmin(status: HealthStatus) {
        if (!config.ALERT_WEBHOOK) return;

        try {
            await fetch(config.ALERT_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: `🚨 *Fireflow System Alert* 🚨\nStatus: ${status.status.toUpperCase()}\nTime: ${status.timestamp}\n\nChecks:\n- DB: ${status.checks.database.status}\n- Supabase: ${status.checks.supabase?.status || 'N/A'}\n- Mem: ${status.checks.system.memory.details.used_percent}% used`,
                    status
                })
            });
        } catch (err) {
            console.error('Failed to send health alert:', err);
        }
    }
}
