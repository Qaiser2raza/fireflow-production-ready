// src/api/services/platform/PasswordResetService.ts
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ResetTokenResult {
  success: boolean;
  message: string;
  /** Present only in trusted internal flows (never serialized to clients). */
  token?: string;
}

export class PasswordResetService {
  private tokenBytes = 32;
  private expiryMinutes = 15;

  generateToken(): string {
    return crypto.randomBytes(this.tokenBytes).toString('hex');
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async createResetToken(email: string): Promise<ResetTokenResult> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.platform_users.findFirst({
      where: { email: normalizedEmail, status: 'ACTIVE' },
    });

    if (!user) {
      return { success: true, message: 'If an account exists with that email, a reset link has been sent.' };
    }

    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.expiryMinutes * 60 * 1000);

    await prisma.password_reset_tokens.create({
      data: {
        platform_user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      },
    });

    await prisma.password_reset_tokens.deleteMany({
      where: {
        platform_user_id: user.id,
        id: { not: undefined },
        used_at: null,
        expires_at: { gt: new Date() },
      },
    });

    await prisma.audit_logs.create({
      data: {
        action_type: 'PASSWORD_RESET_REQUESTED',
        entity_type: 'PLATFORM_USER',
        entity_id: user.id,
        details: {
          email: normalizedEmail,
          expires_at: expiresAt.toISOString(),
        },
      },
    });

    return { success: true, message: 'If an account exists with that email, a reset link has been sent.', token };
  }

  async verifyResetToken(token: string): Promise<{ valid: boolean; userId?: string; error?: string }> {
    const tokenHash = this.hashToken(token);
    const record = await prisma.password_reset_tokens.findFirst({
      where: {
        token_hash: tokenHash,
        used_at: null,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: 'desc' },
    });

    if (!record) {
      return { valid: false, error: 'Invalid or expired reset token' };
    }

    return { valid: true, userId: record.platform_user_id };
  }

  async consumeResetToken(token: string, newPasswordHash: string): Promise<{ success: boolean; userId?: string; error?: string }> {
    const tokenHash = this.hashToken(token);

    const result = await prisma.$transaction(async (tx) => {
      const record = await tx.password_reset_tokens.findFirst({
        where: {
          token_hash: tokenHash,
          used_at: null,
          expires_at: { gt: new Date() },
        },
        orderBy: { created_at: 'desc' },
      });

      if (!record) {
        return { success: false, error: 'Invalid or expired reset token' } as const;
      }

      const user = await tx.platform_users.findUnique({
        where: { id: record.platform_user_id },
      });

      if (!user) {
        return { success: false, error: 'User not found' } as const;
      }

      await tx.password_reset_tokens.update({
        where: { id: record.id },
        data: { used_at: new Date() },
      });

      await tx.platform_sessions.updateMany({
        where: {
          platform_user_id: user.id,
          revoked_at: null,
        },
        data: { revoked_at: new Date() },
      });

      await tx.platform_users.update({
        where: { id: user.id },
        data: {
          password_hash: newPasswordHash,
          failed_login_count: 0,
          locked_until: null,
          must_change_password: false,
          last_login: new Date(),
        },
      });

      await tx.platform_password_history.create({
        data: {
          platform_user_id: user.id,
          password_hash: newPasswordHash,
        },
      });

      await tx.platform_password_history.deleteMany({
        where: {
          platform_user_id: user.id,
          created_at: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
      });

      await tx.audit_logs.create({
        data: {
          action_type: 'PASSWORD_RESET_COMPLETED',
          entity_type: 'PLATFORM_USER',
          entity_id: user.id,
          details: {
            email: user.email,
          },
        },
      });

      return { success: true, userId: user.id } as const;
    });

    return result;
  }

  async invalidateUserTokens(userId: string): Promise<void> {
    await prisma.password_reset_tokens.updateMany({
      where: {
        platform_user_id: userId,
        used_at: null,
        expires_at: { gt: new Date() },
      },
      data: { used_at: new Date() },
    });
  }
}

export const passwordResetService = new PasswordResetService();
