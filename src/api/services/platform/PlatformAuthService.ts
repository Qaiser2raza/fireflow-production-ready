// src/api/services/platform/PlatformAuthService.ts
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { platformJwtService } from './PlatformJwtService';
import { passwordResetService, ResetTokenResult } from './PasswordResetService';
import { config } from '../../../config/env';
import { prisma } from '../../../shared/lib/prisma';

let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;
  const url = config.SUPABASE_URL;
  const key = config.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('[PLATFORM_AUTH] SUPABASE_URL and SUPABASE_SERVICE_KEY are required for platform authentication');
    return null;
  }
  supabaseClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return supabaseClient;
}

export type PlatformRole = 'PLATFORM_OWNER' | 'SUPPORT_ENGINEER' | 'SUPPORT_AGENT';
export type AccountStatus = 'ACTIVE' | 'LOCKED' | 'SUSPENDED';

export interface PlatformUser {
  id: string;
  email: string;
  supabase_id?: string;
  email_verified: boolean;
  name: string;
  role: PlatformRole;
  status: AccountStatus;
  locked_until?: Date;
  failed_login_count: number;
  must_change_password: boolean;
  last_login?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface PlatformAuthResult {
  valid: boolean;
  user?: PlatformUser;
  access_token?: string;
  refresh_token?: string;
  session_jti?: string;
  must_change_password?: boolean;
  error?: string;
}

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const BCRYPT_COST = 14;
const LOCKOUT_FAILURES = 5;
const LOCKOUT_MINUTES = 30;

export class PlatformAuthService {
  async hashPassword(password: string): Promise<string> {
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    return `$bcrypt$${hash}`;
  }

  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    if (!storedHash.startsWith('$bcrypt$')) {
      return false;
    }
    const bcryptHash = storedHash.slice(8);
    try {
      return await bcrypt.compare(password, bcryptHash);
    } catch {
      return false;
    }
  }

  validatePasswordPolicy(password: string): { valid: boolean; error?: string } {
    if (typeof password !== 'string') {
      return { valid: false, error: 'Password must be a string' };
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      return { valid: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` };
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      return { valid: false, error: `Password must be at most ${PASSWORD_MAX_LENGTH} characters` };
    }
    if (password !== password.trim()) {
      return { valid: false, error: 'Password must not have leading or trailing whitespace' };
    }
    return { valid: true };
  }

  normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  async createAccount(data: {
    email: string;
    password: string;
    name: string;
    role: PlatformRole;
  }, actorId: string): Promise<{ success: boolean; user?: PlatformUser; error?: string }> {
    if (data.role === 'PLATFORM_OWNER') {
      return { success: false, error: 'Cannot create PLATFORM_OWNER accounts' };
    }

    const policy = this.validatePasswordPolicy(data.password);
    if (!policy.valid) {
      return { success: false, error: policy.error };
    }

    const normalizedEmail = this.normalizeEmail(data.email);
    const existing = await prisma.platform_users.findFirst({
      where: { email: normalizedEmail },
    });

    if (existing) {
      return { success: false, error: 'An account with this email already exists' };
    }

    const passwordHash = await this.hashPassword(data.password);

    const user = await prisma.platform_users.create({
      data: {
        email: normalizedEmail,
        password_hash: passwordHash,
        name: data.name,
        role: data.role,
        status: 'ACTIVE',
        email_verified: false,
      },
    });

    await prisma.audit_logs.create({
      data: {
        action_type: 'PLATFORM_ACCOUNT_CREATED',
        entity_type: 'PLATFORM_USER',
        entity_id: user.id,
        staff_id: actorId,
        details: {
          email: normalizedEmail,
          role: data.role,
          created_user_id: user.id,
        },
      },
    });

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        email_verified: user.email_verified,
        name: user.name,
        role: user.role as PlatformRole,
        status: user.status as AccountStatus,
        locked_until: user.locked_until ?? undefined,
        failed_login_count: user.failed_login_count,
        must_change_password: user.must_change_password,
        last_login: user.last_login ?? undefined,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
    };
  }

  async authenticate(
    email: string,
    password: string,
    ipAddress: string,
    userAgent?: string
  ): Promise<PlatformAuthResult> {
    const normalizedEmail = this.normalizeEmail(email);
    const user = await prisma.platform_users.findFirst({
      where: { email: normalizedEmail },
    });

    const policy = this.validatePasswordPolicy(password);
    if (!policy.valid) {
      return { valid: false, error: 'Invalid credentials' };
    }

    const now = new Date();

    if (user) {
      if (user.locked_until && now < user.locked_until) {
        await prisma.audit_logs.create({
          data: {
            action_type: 'PLATFORM_LOGIN_FAILED',
            entity_type: 'PLATFORM_USER',
            entity_id: user.id,
            details: {
              reason: 'account_locked',
              locked_until: user.locked_until.toISOString(),
              ip_address: ipAddress,
            },
          },
        });
        return { valid: false, error: 'Invalid credentials' };
      }

      if (user.status !== 'ACTIVE') {
        await prisma.audit_logs.create({
          data: {
            action_type: 'PLATFORM_LOGIN_FAILED',
            entity_type: 'PLATFORM_USER',
            entity_id: user.id,
            details: {
              reason: 'account_inactive',
              status: user.status,
              ip_address: ipAddress,
            },
          },
        });
        return { valid: false, error: 'Invalid credentials' };
      }
    }

    if (!user || !user.password_hash) {
      await prisma.audit_logs.create({
        data: {
          action_type: 'PLATFORM_LOGIN_FAILED',
          entity_type: 'PLATFORM_USER',
          details: {
            reason: 'invalid_credentials',
            ip_address: ipAddress,
          },
        },
      });
      return { valid: false, error: 'Invalid credentials' };
    }

    const passwordMatch = await this.verifyPassword(password, user.password_hash);

    if (!passwordMatch) {
      const newFailedCount = user.failed_login_count + 1;
      const updateData: any = { failed_login_count: newFailedCount };

      if (newFailedCount >= LOCKOUT_FAILURES) {
        updateData.locked_until = new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000);
        await prisma.audit_logs.create({
          data: {
            action_type: 'PLATFORM_LOCKED',
            entity_type: 'PLATFORM_USER',
            entity_id: user.id,
            details: {
              failed_count: newFailedCount,
              locked_until: updateData.locked_until.toISOString(),
              ip_address: ipAddress,
            },
          },
        });
      }

      await prisma.platform_users.update({
        where: { id: user.id },
        data: updateData,
      });

      await prisma.audit_logs.create({
        data: {
          action_type: 'PLATFORM_LOGIN_FAILED',
          entity_type: 'PLATFORM_USER',
          entity_id: user.id,
          details: {
            reason: 'invalid_credentials',
            failed_count: newFailedCount,
            ip_address: ipAddress,
          },
        },
      });

      return { valid: false, error: 'Invalid credentials' };
    }

    const sessionJti = crypto.randomUUID();
    const accessTokenExpiry = 15;
    const accessToken = platformJwtService.generateAccessToken(
      user.id,
      user.role,
      user.must_change_password,
      accessTokenExpiry,
      sessionJti
    );

    const { token: refreshToken } = await this.createPlatformRefreshToken(user.id, userAgent, sessionJti);

    await prisma.$transaction(async (tx) => {
      await tx.platform_users.update({
        where: { id: user.id },
        data: {
          failed_login_count: 0,
          locked_until: null,
          last_login: now,
        },
      });

      await tx.audit_logs.create({
        data: {
          action_type: 'PLATFORM_LOGIN',
          entity_type: 'PLATFORM_USER',
          entity_id: user.id,
          details: {
            ip_address: ipAddress,
            user_agent: userAgent,
            session_jti: sessionJti,
          },
        },
      });
    });

    return {
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        email_verified: user.email_verified,
        name: user.name,
        role: user.role as PlatformRole,
        status: user.status as AccountStatus,
        locked_until: user.locked_until ?? undefined,
        failed_login_count: user.failed_login_count,
        must_change_password: user.must_change_password,
        last_login: user.last_login ?? undefined,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      access_token: accessToken,
      refresh_token: refreshToken,
      session_jti: sessionJti,
      must_change_password: user.must_change_password,
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ipAddress: string
  ): Promise<{ success: boolean; error?: string }> {
    const policy = this.validatePasswordPolicy(newPassword);
    if (!policy.valid) {
      return { success: false, error: policy.error };
    }

    const user = await prisma.platform_users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const currentMatch = await this.verifyPassword(currentPassword, user.password_hash);
    if (!currentMatch) {
      return { success: false, error: 'Current password is incorrect' };
    }

    const newPasswordHash = await this.hashPassword(newPassword);

    if (await this.verifyPassword(newPassword, user.password_hash)) {
      return { success: false, error: 'Password reuse is not allowed' };
    }

    await prisma.$transaction(async (tx) => {
      const history = await tx.platform_password_history.findMany({
        where: { platform_user_id: userId },
        orderBy: { created_at: 'desc' },
        take: 3,
      });

      for (const entry of history) {
        if (await this.verifyPassword(newPassword, entry.password_hash)) {
          throw new Error('Password reuse is not allowed');
        }
      }

      await tx.platform_users.update({
        where: { id: userId },
        data: {
          password_hash: newPasswordHash,
          must_change_password: false,
          failed_login_count: 0,
          locked_until: null,
        },
      });

      await tx.platform_sessions.updateMany({
        where: {
          platform_user_id: userId,
          revoked_at: null,
        },
        data: { revoked_at: new Date() },
      });

      await tx.platform_password_history.create({
        data: {
          platform_user_id: userId,
          password_hash: newPasswordHash,
        },
      });

      await tx.platform_password_history.deleteMany({
        where: {
          platform_user_id: userId,
          id: { not: undefined },
          created_at: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
      });

      await tx.audit_logs.create({
        data: {
          action_type: 'PASSWORD_CHANGED',
          entity_type: 'PLATFORM_USER',
          entity_id: userId,
          details: {
            ip_address: ipAddress,
          },
        },
      });
    });

    return { success: true };
  }

  async requestPasswordReset(email: string): Promise<ResetTokenResult> {
    return passwordResetService.createResetToken(email);
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const policy = this.validatePasswordPolicy(newPassword);
    if (!policy.valid) {
      return { success: false, error: policy.error };
    }

    const newPasswordHash = await this.hashPassword(newPassword);
    const result = await passwordResetService.consumeResetToken(token, newPasswordHash);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true };
  }

  async validateSession(jti: string): Promise<PlatformUser | null> {
    const session = await prisma.platform_sessions.findFirst({
      where: {
        jti,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
      include: {
        platform_user: true,
      },
    });

    if (!session || !session.platform_user) {
      return null;
    }

    return {
      id: session.platform_user.id,
      email: session.platform_user.email,
      email_verified: session.platform_user.email_verified,
      name: session.platform_user.name,
      role: session.platform_user.role as PlatformRole,
      status: session.platform_user.status as AccountStatus,
      locked_until: session.platform_user.locked_until ?? undefined,
      failed_login_count: session.platform_user.failed_login_count,
      must_change_password: session.platform_user.must_change_password,
      last_login: session.platform_user.last_login ?? undefined,
      created_at: session.platform_user.created_at,
      updated_at: session.platform_user.updated_at,
    };
  }

  /**
   * Verify a platform access token (HS256, issuer/audience bound) and resolve
   * its live session. Used by non-HTTP surfaces such as Socket.IO auth where
   * the tenant JWT verification has already failed.
   */
  async verifyAccessToken(token: string): Promise<{ valid: boolean; user?: PlatformUser; error?: string }> {
    const decoded = platformJwtService.verifyToken(token);
    if (!decoded.valid || !decoded.payload) {
      return { valid: false, error: decoded.error || 'Invalid platform access token' };
    }

    const user = await this.validateSession(decoded.payload.jti);
    if (!user) {
      return { valid: false, error: 'Platform session is invalid or expired' };
    }

    return { valid: true, user };
  }

  async revokeSession(jti: string): Promise<boolean> {
    const session = await prisma.platform_sessions.findFirst({
      where: { jti },
    });

    if (!session) {
      return false;
    }

    await prisma.platform_sessions.update({
      where: { id: session.id },
      data: { revoked_at: new Date() },
    });

    await prisma.audit_logs.create({
      data: {
        action_type: 'PLATFORM_LOGOUT',
        entity_type: 'PLATFORM_USER',
        entity_id: session.platform_user_id,
        details: {
          session_jti: jti,
        },
      },
    });

    return true;
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await prisma.platform_sessions.updateMany({
      where: {
        platform_user_id: userId,
        revoked_at: null,
      },
      data: { revoked_at: new Date() },
    });
  }

  async getUserBySupabaseId(supabaseId: string): Promise<PlatformUser | null> {
    const user = await prisma.platform_users.findFirst({
      where: { supabase_id: supabaseId },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      email_verified: user.email_verified,
      supabase_id: user.supabase_id ?? undefined,
      name: user.name,
      role: user.role as PlatformRole,
      status: user.status as AccountStatus,
      locked_until: user.locked_until ?? undefined,
      failed_login_count: user.failed_login_count,
      must_change_password: user.must_change_password,
      last_login: user.last_login ?? undefined,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }

  async verifySupabaseToken(token: string): Promise<{ sub?: string } | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) {
        return null;
      }
      return { sub: data.user.id };
    } catch {
      return null;
    }
  }

  async createPlatformRefreshToken(platformUserId: string, userAgent?: string, sessionJti?: string): Promise<{ token: string; familyId: string; sessionJti: string }> {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const familyId = crypto.randomUUID();
    const finalSessionJti = sessionJti || crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    await prisma.platform_sessions.create({
      data: {
        platform_user_id: platformUserId,
        jti: finalSessionJti,
        refresh_token_hash: tokenHash,
        token_family_id: familyId,
        expires_at: expiresAt,
        user_agent: userAgent || undefined,
      },
    });

    return { token, familyId, sessionJti: finalSessionJti };
  }

  async validatePlatformRefreshToken(token: string): Promise<{ sessionJti: string; familyId: string; userId: string } | null> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date();

    const session = await prisma.platform_sessions.findFirst({
      where: {
        refresh_token_hash: tokenHash,
        revoked_at: null,
        expires_at: { gt: now },
      },
      select: {
        jti: true,
        token_family_id: true,
        platform_user_id: true,
      },
    });

    if (!session) return null;

    return {
      sessionJti: session.jti,
      familyId: session.token_family_id ?? '',
      userId: session.platform_user_id,
    };
  }

  async rotatePlatformRefreshToken(oldToken: string, userAgent?: string): Promise<{ newToken: string; newSessionJti: string; familyId: string } | null> {
    const oldTokenHash = crypto.createHash('sha256').update(oldToken).digest('hex');
    const now = new Date();

    const newToken = crypto.randomBytes(32).toString('hex');
    const newTokenHash = crypto.createHash('sha256').update(newToken).digest('hex');
    const newSessionJti = crypto.randomUUID();
    const newExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT 1 FROM platform_sessions 
        WHERE refresh_token_hash = ${oldTokenHash} 
          AND revoked_at IS NULL 
          AND expires_at > ${now}
        FOR UPDATE
      `;

      const updateResult = await tx.platform_sessions.updateMany({
        where: {
          refresh_token_hash: oldTokenHash,
          revoked_at: null,
          expires_at: { gt: now },
        },
        data: {
          revoked_at: now,
          replaced_by_jti: newSessionJti,
        },
      });

      if (updateResult.count === 0) {
        return null;
      }

      const oldSession = await tx.platform_sessions.findFirst({
        where: { refresh_token_hash: oldTokenHash },
        select: {
          token_family_id: true,
          platform_user_id: true,
        },
      });

      if (!oldSession) {
        return null;
      }

      await tx.platform_sessions.create({
        data: {
          platform_user_id: oldSession.platform_user_id,
          jti: newSessionJti,
          refresh_token_hash: newTokenHash,
          token_family_id: oldSession.token_family_id,
          expires_at: newExpiresAt,
          user_agent: userAgent || undefined,
        },
      });

      return { newToken, newSessionJti, familyId: oldSession.token_family_id ?? '' };
    });

    return result;
  }

  async revokePlatformRefreshToken(token: string): Promise<boolean> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const session = await prisma.platform_sessions.findFirst({
      where: { refresh_token_hash: tokenHash },
    });

    if (!session) return false;

    await prisma.platform_sessions.update({
      where: { id: session.id },
      data: { revoked_at: new Date() },
    });

    return true;
  }

  async revokePlatformTokenFamily(familyId: string, userId: string): Promise<number> {
    const now = new Date();
    const result = await prisma.platform_sessions.updateMany({
      where: {
        token_family_id: familyId,
        platform_user_id: userId,
        revoked_at: null,
      },
      data: { revoked_at: now },
    });

    return result.count;
  }
}

export const platformAuthService = new PlatformAuthService();
