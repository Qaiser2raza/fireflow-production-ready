// src/api/services/EmailVerificationService.ts
import crypto from 'crypto';
import { prisma } from '../../shared/lib/prisma';

export interface EmailVerificationTokenResult {
  id: string;
  token: string;
  email: string;
  staffId?: string | null;
  restaurantId?: string | null;
  expiresAt: Date;
  used: boolean;
}

export class EmailVerificationService {
  /**
   * Generates a cryptographically secure 64-character hex token.
   */
  static generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Returns a timestamp 48 hours from the current moment.
   */
  static getTokenExpiry(): Date {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);
    return expiresAt;
  }

  /**
   * Creates an email verification token record in the database.
   * Invalidates any prior active tokens for this email to prevent concurrent replay.
   */
  static async createVerificationEmail(
    email: string,
    staffId?: string | null,
    restaurantId?: string | null
  ): Promise<string> {
    const normalizedEmail = email.toLowerCase().trim();
    const token = this.generateToken();
    const expiresAt = this.getTokenExpiry();

    // Invalidate existing unused tokens for this email
    await prisma.email_verification_tokens.updateMany({
      where: {
        email: normalizedEmail,
        used: false,
      },
      data: {
        used: true,
      },
    });

    await prisma.email_verification_tokens.create({
      data: {
        email: normalizedEmail,
        staff_id: staffId || null,
        restaurant_id: restaurantId || null,
        token,
        expires_at: expiresAt,
        used: false,
      },
    });

    return token;
  }

  /**
   * Finds an unused, non-expired verification token record.
   */
  static async findActiveToken(token: string) {
    if (!token || typeof token !== 'string') return null;

    const record = await prisma.email_verification_tokens.findUnique({
      where: { token: token.trim() },
    });

    if (!record) return null;
    if (record.used) return null;
    if (new Date() > record.expires_at) return null;

    return record;
  }

  /**
   * Validates the token, checks non-expiry and unused status, marks it as used,
   * and returns the verified token payload.
   */
  static async verifyToken(token: string): Promise<{
    valid: boolean;
    email?: string;
    staffId?: string | null;
    restaurantId?: string | null;
    error?: string;
  }> {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Token is required' };
    }

    const trimmed = token.trim();
    const record = await prisma.email_verification_tokens.findUnique({
      where: { token: trimmed },
    });

    if (!record) {
      return { valid: false, error: 'Invalid or unknown verification token' };
    }

    if (record.used) {
      return { valid: false, error: 'Verification token has already been used' };
    }

    if (new Date() > record.expires_at) {
      return { valid: false, error: 'Verification token has expired (48-hour limit)' };
    }

    // Atomically mark token as used
    await prisma.email_verification_tokens.update({
      where: { id: record.id },
      data: { used: true },
    });

    return {
      valid: true,
      email: record.email,
      staffId: record.staff_id,
      restaurantId: record.restaurant_id,
    };
  }
}
