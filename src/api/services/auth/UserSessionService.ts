// src/api/services/auth/UserSessionService.ts
/**
 * Owner (cloud identity) sessions.
 *
 * An owner logs in through `users` + `memberships`; the session itself lives
 * in `user_sessions`. Mirrors the staff refresh-token design:
 *   - 32 random bytes, only the SHA-256 hash is stored
 *   - rotation on every refresh, one token family per login
 *   - presenting an already revoked token revokes the whole family (theft)
 *   - the raw token only ever travels in an httpOnly cookie
 */
import crypto from 'crypto';
import type { Request, Response } from 'express';
import { prisma } from '../../../shared/lib/prisma';

const REFRESH_TOKEN_BYTE_LENGTH = 32;
const REFRESH_TOKEN_HASH_ALGORITHM = 'sha256';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

/** Failed sign-ins before an account is locked. */
export const MAX_FAILED_LOGINS = 5;
/** Lockout duration once MAX_FAILED_LOGINS is reached. */
export const ACCOUNT_LOCK_MINUTES = 15;

/** Cookie carrying the owner refresh token. Path-limited to the auth routes. */
export const USER_REFRESH_COOKIE = 'ff_user_refresh';
export const USER_REFRESH_COOKIE_PATH = '/api/auth';

export interface UserSessionRecord {
  id: string;
  userId: string;
  jti: string;
  tokenFamilyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface SessionIssueResult {
  token: string;
  session: UserSessionRecord;
}

export class UserSessionService {
  generateSecureToken(): string {
    return crypto.randomBytes(REFRESH_TOKEN_BYTE_LENGTH).toString('hex');
  }

  hashToken(token: string): string {
    return crypto.createHash(REFRESH_TOKEN_HASH_ALGORITHM).update(token).digest('hex');
  }

  generateFamilyId(): string {
    return crypto.randomUUID();
  }

  /** Creates the first session of a family and returns the raw token once. */
  async createUserSession(input: {
    userId: string;
    userAgent?: string | null;
    ipAddress?: string | null;
    familyId?: string;
  }): Promise<SessionIssueResult> {
    const token = this.generateSecureToken();
    const tokenHash = this.hashToken(token);
    const familyId = input.familyId || this.generateFamilyId();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const created = await prisma.user_sessions.create({
      data: {
        user_id: input.userId,
        jti: crypto.randomUUID(),
        token_family_id: familyId,
        refresh_token_hash: tokenHash,
        expires_at: expiresAt,
        user_agent: input.userAgent || null,
        ip_address: input.ipAddress || null,
      },
      select: {
        id: true,
        user_id: true,
        jti: true,
        token_family_id: true,
        expires_at: true,
        revoked_at: true,
      },
    });

    return {
      token,
      session: {
        id: created.id,
        userId: created.user_id,
        jti: created.jti,
        tokenFamilyId: created.token_family_id,
        expiresAt: created.expires_at,
        revokedAt: created.revoked_at,
      },
    };
  }

  /** Looks up a session by raw token regardless of its state. */
  async findSessionByToken(token: string): Promise<UserSessionRecord | null> {
    const record = await prisma.user_sessions.findFirst({
      where: { refresh_token_hash: this.hashToken(token) },
      select: {
        id: true,
        user_id: true,
        jti: true,
        token_family_id: true,
        expires_at: true,
        revoked_at: true,
      },
    });
    if (!record) return null;
    return {
      id: record.id,
      userId: record.user_id,
      jti: record.jti,
      tokenFamilyId: record.token_family_id,
      expiresAt: record.expires_at,
      revokedAt: record.revoked_at,
    };
  }

  /**
   * Rotates a refresh token inside its family.
   *
   * - unknown token      -> { error: 'INVALID_REFRESH_TOKEN' }
   * - revoked token      -> whole family revoked, { error: 'TOKEN_REUSE_DETECTED' }
   * - expired token      -> { error: 'INVALID_REFRESH_TOKEN' }
   * - valid token        -> { token, session } for the newly issued session
   */
  async rotateUserRefreshToken(
    token: string
  ): Promise<
    | { error: 'INVALID_REFRESH_TOKEN' | 'TOKEN_REUSE_DETECTED' }
    | { token: string; session: UserSessionRecord }
  > {
    const existing = await this.findSessionByToken(token);

    if (!existing) {
      return { error: 'INVALID_REFRESH_TOKEN' };
    }

    if (existing.revokedAt) {
      // Replay of a rotated token: assume theft and kill the family.
      await this.revokeUserSessionFamily(existing.tokenFamilyId);
      return { error: 'TOKEN_REUSE_DETECTED' };
    }

    if (new Date() > existing.expiresAt) {
      return { error: 'INVALID_REFRESH_TOKEN' };
    }

    const newToken = this.generateSecureToken();
    const newTokenHash = this.hashToken(newToken);
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const created = await prisma.$transaction(async (tx) => {
      const revoked = await tx.user_sessions.updateMany({
        where: { id: existing.id, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      if (revoked.count === 0) {
        return null;
      }

      return tx.user_sessions.create({
        data: {
          user_id: existing.userId,
          jti: crypto.randomUUID(),
          token_family_id: existing.tokenFamilyId,
          refresh_token_hash: newTokenHash,
          expires_at: newExpiresAt,
        },
        select: {
          id: true,
          user_id: true,
          jti: true,
          token_family_id: true,
          expires_at: true,
          revoked_at: true,
        },
      });
    });

    if (!created) {
      return { error: 'INVALID_REFRESH_TOKEN' };
    }

    return {
      token: newToken,
      session: {
        id: created.id,
        userId: created.user_id,
        jti: created.jti,
        tokenFamilyId: created.token_family_id,
        expiresAt: created.expires_at,
        revokedAt: created.revoked_at,
      },
    };
  }

  /** Revokes one session (logout). Returns true when a live row was revoked. */
  async revokeUserSession(token: string): Promise<boolean> {
    const result = await prisma.user_sessions.updateMany({
      where: { refresh_token_hash: this.hashToken(token), revoked_at: null },
      data: { revoked_at: new Date() },
    });
    return result.count > 0;
  }

  /** Theft response: every unrevoked session of the family is killed. */
  async revokeUserSessionFamily(familyId: string): Promise<number> {
    const result = await prisma.user_sessions.updateMany({
      where: { token_family_id: familyId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    return result.count;
  }

  /** Cookie helpers. The raw token is never returned through the JSON body. */
  setRefreshCookie(res: Response, token: string): void {
    res.cookie(USER_REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: USER_REFRESH_COOKIE_PATH,
      maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    });
  }

  clearRefreshCookie(res: Response): void {
    res.clearCookie(USER_REFRESH_COOKIE, { path: USER_REFRESH_COOKIE_PATH });
  }

  /** Minimal cookie reader; the project has no cookie-parser dependency. */
  readRefreshCookie(req: Request): string | null {
    const header = req.headers.cookie;
    if (!header || typeof header !== 'string') return null;

    for (const part of header.split(';')) {
      const separator = part.indexOf('=');
      if (separator === -1) continue;
      const name = part.slice(0, separator).trim();
      if (name !== USER_REFRESH_COOKIE) continue;
      const value = part.slice(separator + 1).trim();
      if (!value) return null;
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
    return null;
  }
}

export const userSessionService = new UserSessionService();