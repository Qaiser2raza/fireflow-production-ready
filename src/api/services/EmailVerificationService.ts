// src/api/services/EmailVerificationService.ts
import crypto from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../shared/lib/prisma';

/**
 * A real client or a transaction client. The advisory lock below is only
 * meaningful inside a transaction, so this is deliberately the structural
 * capability (`email_verification_tokens` + raw access) rather than the full
 * PrismaClient, which keeps a `Prisma.TransactionClient` assignable to it.
 */
type VerificationDb = Pick<PrismaClient, 'email_verification_tokens' | '$executeRaw'>;

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
   *
   * Task 05 commit 1: invalidation and creation were two independent writes, so
   * two concurrent resends could both invalidate, both create, and leave TWO live
   * tokens for one address — each of which then verifies successfully. Both now
   * run in ONE transaction that first takes a transaction-scoped advisory lock
   * keyed on the normalized address, so concurrent callers for the same address
   * serialize instead of interleaving. The last writer wins and is the only
   * survivor, which is the intended behaviour.
   *
   * `pg_advisory_xact_lock` is released at transaction end, so an aborted mint
   * cannot strand it.
   *
   * The lock only serializes when it is taken in a transaction. A caller that
   * already holds one passes its client in; a caller that does not gets a fresh
   * transaction here. Passing the base client rather than a transaction client
   * would take the lock in an implicit single-statement transaction and
   * serialize nothing.
   */
  static async createVerificationEmail(
    email: string,
    staffId?: string | null,
    restaurantId?: string | null,
    db?: VerificationDb
  ): Promise<string> {
    const normalizedEmail = email.toLowerCase().trim();
    const token = this.generateToken();
    const expiresAt = this.getTokenExpiry();

    const invalidateThenCreate = async (client: VerificationDb): Promise<void> => {
      // Serialize every mint for this address. hashtextextended gives a stable
      // 64-bit key; the lock namespace is per-database, so the key is prefixed
      // with the feature name to keep it out of the way of any other advisory
      // lock in this database.
      //
      // $executeRaw, not $queryRaw: pg_advisory_xact_lock returns void, which
      // Prisma cannot deserialize into a row. $executeRaw only reports how many
      // rows the statement touched, which is all we need.
      const lockKey = `email_verification:${normalizedEmail}`;
      await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

      await client.email_verification_tokens.updateMany({
        where: {
          email: normalizedEmail,
          used: false,
        },
        data: {
          used: true,
        },
      });

      await client.email_verification_tokens.create({
        data: {
          email: normalizedEmail,
          staff_id: staffId || null,
          restaurant_id: restaurantId || null,
          token,
          expires_at: expiresAt,
          used: false,
        },
      });
    };

    if (db) {
      await invalidateThenCreate(db);
    } else {
      await prisma.$transaction((tx) => invalidateThenCreate(tx));
    }

    return token;
  }

  /**
   * Returns true when a transactional email provider is configured. Nothing is
   * sent today; the flag exists so the development console link below can never
   * become a second delivery channel in an environment that does send mail.
   */
  private static hasEmailProvider(): boolean {
    return Boolean(
      process.env.EMAIL_PROVIDER ||
      process.env.SMTP_URL ||
      process.env.SMTP_HOST ||
      process.env.RESEND_API_KEY ||
      process.env.SENDGRID_API_KEY
    );
  }

  /**
   * Development only: prints the verification link to the server console so a
   * developer can complete the flow without a mail provider. Silent in
   * production and staging, and whenever an email provider is configured. The
   * token is never written to any log outside local development, and this is
   * the only place a verification link is ever emitted.
   */
  static logDevVerificationLink(email: string, token: string): void {
    const env = process.env.NODE_ENV;
    if (env === 'production' || env === 'staging') return;
    if (this.hasEmailProvider()) return;

    const base = process.env.PUBLIC_API_URL || 'http://localhost:3001';
    const url = `${base.replace(/\/$/, '')}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
    console.log(`[EMAIL_VERIFY] dev link for ${email}: ${url}`);
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
