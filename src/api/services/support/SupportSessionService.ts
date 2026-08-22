// src/api/services/support/SupportSessionService.ts
import { prisma } from '../../../shared/lib/prisma';

export type SupportScope = 'READ' | 'CONFIG' | 'MENU' | 'ORDERS' | 'DEVICE' | 'DIAGNOSTICS';

export const ALLOWED_SCOPES: readonly SupportScope[] = [
  'READ',
  'CONFIG',
  'MENU',
  'ORDERS',
  'DEVICE',
  'DIAGNOSTICS',
];

export const DEFAULT_SESSION_HOURS = 4;

export interface SupportSession {
  id: string;
  platform_user_id: string;
  restaurant_id: string;
  scope: SupportScope[];
  reason: string | null;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  created_by: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
}

export interface CreateSupportSessionInput {
  restaurant_id: string;
  scope: SupportScope[];
  reason?: string;
  created_by: string;
}

export class SupportSessionService {
  async createSession(input: CreateSupportSessionInput): Promise<SupportSession> {
    if (!input.scope || input.scope.length === 0) {
      throw new Error('Scope must be a non-empty array');
    }

    const invalid = input.scope.filter(s => !ALLOWED_SCOPES.includes(s as any));
    if (invalid.length > 0) {
      throw new Error(`Invalid scope values: ${invalid.join(', ')}`);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEFAULT_SESSION_HOURS * 60 * 60 * 1000);

    const session = await prisma.support_sessions.create({
      data: {
        platform_user_id: input.created_by,
        restaurant_id: input.restaurant_id,
        scope: input.scope,
        reason: input.reason || null,
        expires_at: expiresAt,
        created_by: input.created_by,
        status: 'ACTIVE',
      },
    });

    return session as unknown as SupportSession;
  }

  async getSession(sessionId: string): Promise<SupportSession | null> {
    const session = await prisma.support_sessions.findUnique({
      where: { id: sessionId },
    });

    if (!session) return null;

    if (session.status !== 'ACTIVE') return null;
    if (session.expires_at < new Date()) {
      await prisma.support_sessions.update({
        where: { id: sessionId },
        data: { status: 'EXPIRED' },
      });
      return null;
    }

    return session as unknown as SupportSession;
  }

  async getSessionRaw(sessionId: string): Promise<SupportSession | null> {
    const session = await prisma.support_sessions.findUnique({
      where: { id: sessionId },
    });

    return session ? session as unknown as SupportSession : null;
  }

  async revokeSession(sessionId: string, _platformUserId: string): Promise<SupportSession> {
    const session = await prisma.support_sessions.update({
      where: { id: sessionId },
      data: {
        status: 'REVOKED',
        revoked_at: new Date(),
      },
    });

    return session as unknown as SupportSession;
  }

  async listSessionsForPlatformUser(platformUserId: string): Promise<SupportSession[]> {
    const sessions = await prisma.support_sessions.findMany({
      where: { platform_user_id: platformUserId },
      orderBy: { created_at: 'desc' },
    });

    return sessions as unknown as SupportSession[];
  }
}

export const supportSessionService = new SupportSessionService();


