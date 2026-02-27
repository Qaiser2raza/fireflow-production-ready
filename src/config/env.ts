/**
 * Environment Configuration Validation
 * Ensures all required environment variables are present and correctly typed
 */

import { z } from 'zod';

const envSchema = z.object({
  // ==========================================
  // DATABASE
  // ==========================================
  DATABASE_URL: z.string().url('Invalid DATABASE_URL format'),

  // ==========================================
  // JWT & AUTHENTICATION
  // ==========================================
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters').optional(),
  FIREFLOW_JWT_SECRET: z.string().min(16, 'FIREFLOW_JWT_SECRET must be at least 16 characters').optional(),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters').optional(),
  JWT_EXPIRY: z.string().default('900'), // 15 minutes in seconds
  JWT_REFRESH_EXPIRY: z.string().default('604800'), // 7 days in seconds

  // ==========================================
  // SUPABASE CLOUD (Optional - for SaaS features)
  // ==========================================
  VITE_SUPABASE_URL: z.string().url().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),

  // ==========================================
  // SERVER CONFIG
  // ==========================================
  PORT: z.string().regex(/^\d+$/, 'PORT must be a number').default('3001'),
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  VITE_API_URL: z.string().url().default('http://localhost:3001'),

  // ==========================================
  // RATE LIMITING
  // ==========================================
  RATE_LIMIT_WINDOW: z.string().regex(/^\d+$/, 'RATE_LIMIT_WINDOW must be a number').default('900000'), // 15 minutes
  RATE_LIMIT_MAX: z.string().regex(/^\d+$/, 'RATE_LIMIT_MAX must be a number').default('100'),

  // ==========================================
  // FEATURES & TOGGLES
  // ==========================================
  NOTIFICATION_ENABLED: z.enum(['true', 'false']).default('false'),
  NOTIFICATION_WEBHOOK_URL: z.preprocess((val) => val === '' ? undefined : val, z.string().url().optional()),
  ENABLE_CLOUD_SYNC: z.enum(['true', 'false']).default('false'),
  ENABLE_ANALYTICS: z.enum(['true', 'false']).default('false'),
  ENABLE_AUDIT_LOGS: z.enum(['true', 'false']).default('true'),
  ENFORCE_RLS: z.enum(['true', 'false']).default('true'),
  ENABLE_MULTI_TENANCY: z.enum(['true', 'false']).default('false'),

  // ==========================================
  // LOGGING & MONITORING
  // ==========================================
  LOG_LEVEL: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL', 'debug', 'info', 'warn', 'error']).default('INFO'),
  CLOUD_LOGGING: z.enum(['true', 'false']).default('false'),
  ALERT_WEBHOOK: z.preprocess((val) => val === '' ? undefined : val, z.string().url().optional()),

  // ==========================================
  // ERROR TRACKING (Sentry - Optional)
  // ==========================================
  SENTRY_DSN: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validates all environment variables on startup
 * Throws error if validation fails
 */
export function validateEnv(): EnvConfig {
  const isServer = typeof window === 'undefined';

  // Combine sources: process.env (Node) and import.meta.env (Vite)
  // Note: Vite replaces import.meta.env at build time, so we need careful access
  const envSource = {
    ...((globalThis as any).process?.env || {}),
    // @ts-ignore - Only exists in Vite projects
    ...(import.meta.env || {})
  };

  try {
    // In the browser, we only want to validate variables prefixed with VITE_
    // because server-only variables like DATABASE_URL aren't available.
    if (!isServer) {
      // Partial validation for client: only confirm essential VITE_ variables are strings if they exist
      const clientSchema = z.object({
        NODE_ENV: z.string().optional().default('development'),
        VITE_API_URL: z.string().url().default('http://localhost:3001'),
        VITE_SUPABASE_URL: z.string().url().optional(),
        VITE_SUPABASE_ANON_KEY: z.string().optional(),
      }).passthrough();

      return clientSchema.parse(envSource) as unknown as EnvConfig;
    }

    const parsed = envSchema.parse(envSource);

    // Validate Supabase consistency for server
    const hasSupabaseUrl = !!parsed.VITE_SUPABASE_URL || !!parsed.SUPABASE_URL;
    const hasSupabaseKey = !!parsed.VITE_SUPABASE_ANON_KEY || !!parsed.SUPABASE_ANON_KEY || !!parsed.SUPABASE_SERVICE_KEY;

    if (hasSupabaseUrl && !hasSupabaseKey) {
      throw new Error('Supabase Key is required when Supabase URL is provided');
    }

    // Ensure JWT_SECRET is available (compatibility)
    const finalConfig = { ...parsed };
    if (!finalConfig.JWT_SECRET && finalConfig.FIREFLOW_JWT_SECRET) {
      finalConfig.JWT_SECRET = finalConfig.FIREFLOW_JWT_SECRET;
    }

    return finalConfig as EnvConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.issues.forEach((issue) => {
        console.error(`   ${issue.path.join('.')}: ${issue.message}`);
      });
    } else {
      console.error('❌ Environment validation error:', (error as Error).message);
    }

    // Only exit the process if we're on the server
    if (isServer) {
      process.exit(1);
    }

    // In browser, return raw source so the app can at least try to run
    return envSource as EnvConfig;
  }
}

/**
 * Helper functions to access config with type safety
 */
export const config = validateEnv();

export const getConfig = <K extends keyof EnvConfig>(key: K): EnvConfig[K] => {
  return config[key];
};

export const isProduction = () => config.NODE_ENV === 'production';
export const isStaging = () => config.NODE_ENV === 'staging';
export const isDevelopment = () => config.NODE_ENV === 'development';

export const isCloudEnabled = () => {
  return !!(config.VITE_SUPABASE_URL || config.SUPABASE_URL) &&
    !!(config.VITE_SUPABASE_ANON_KEY || config.SUPABASE_ANON_KEY || config.SUPABASE_SERVICE_KEY);
};

export const isAuditLogsEnabled = () => config.ENABLE_AUDIT_LOGS === 'true';
export const isRLSEnabled = () => config.ENFORCE_RLS === 'true';

export const getJWTExpiry = (): number => parseInt(config.JWT_EXPIRY, 10);
export const getJWTRefreshExpiry = (): number => parseInt(config.JWT_REFRESH_EXPIRY, 10);

export const getRateLimitConfig = () => ({
  windowMs: parseInt(config.RATE_LIMIT_WINDOW, 10),
  max: parseInt(config.RATE_LIMIT_MAX, 10)
});
