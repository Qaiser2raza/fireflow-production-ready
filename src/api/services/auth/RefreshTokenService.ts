// src/api/services/auth/RefreshTokenService.ts
import crypto from 'crypto';
import { prisma } from '../../../shared/lib/prisma';

const REFRESH_TOKEN_BYTE_LENGTH = 32;
const REFRESH_TOKEN_HASH_ALGORITHM = 'sha256';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export interface StaffRefreshTokenRecord {
  id: string;
  tokenFamilyId: string;
  staffId: string;
  restaurantId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByHash: string | null;
  createdAt: Date;
}

export class RefreshTokenService {
  private static instance: RefreshTokenService;
  
  static getInstance(): RefreshTokenService {
    if (!RefreshTokenService.instance) {
      RefreshTokenService.instance = new RefreshTokenService();
    }
    return RefreshTokenService.instance;
  }

  generateSecureToken(): string {
    return crypto.randomBytes(REFRESH_TOKEN_BYTE_LENGTH).toString('hex');
  }

  hashToken(token: string): string {
    return crypto.createHash(REFRESH_TOKEN_HASH_ALGORITHM).update(token).digest('hex');
  }

  generateFamilyId(): string {
    return crypto.randomUUID();
  }

  async createStaffRefreshToken(staffId: string, restaurantId: string): Promise<{ token: string; familyId: string }> {
    const token = this.generateSecureToken();
    const tokenHash = this.hashToken(token);
    const familyId = this.generateFamilyId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await prisma.refresh_tokens.create({
      data: {
        token_family_id: familyId,
        token_hash: tokenHash,
        staff_id: staffId,
        restaurant_id: restaurantId,
        expires_at: expiresAt,
      },
    });

    return { token, familyId };
  }

  async validateStaffRefreshToken(token: string): Promise<StaffRefreshTokenRecord | null> {
    const tokenHash = this.hashToken(token);
    const now = new Date();

    const record = await prisma.refresh_tokens.findFirst({
      where: {
        token_hash: tokenHash,
        revoked_at: null,
        expires_at: { gt: now },
      },
      select: {
        id: true,
        token_family_id: true,
        staff_id: true,
        restaurant_id: true,
        expires_at: true,
        revoked_at: true,
        replaced_by_hash: true,
        created_at: true,
      },
    });

    return record as StaffRefreshTokenRecord | null;
  }

  async rotateStaffRefreshToken(oldToken: string): Promise<{ newToken: string; familyId: string } | null> {
    const oldTokenHash = this.hashToken(oldToken);
    const now = new Date();

    const newToken = this.generateSecureToken();
    const newTokenHash = this.hashToken(newToken);
    const newExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT 1 FROM refresh_tokens 
        WHERE token_hash = ${oldTokenHash} 
          AND revoked_at IS NULL 
          AND expires_at > ${now}
        FOR UPDATE
      `;

      const updateResult = await tx.refresh_tokens.updateMany({
        where: {
          token_hash: oldTokenHash,
          revoked_at: null,
          expires_at: { gt: now },
        },
        data: {
          revoked_at: now,
          replaced_by_hash: newTokenHash,
        },
      });

      if (updateResult.count === 0) {
        return null;
      }

      const oldRecord = await tx.refresh_tokens.findFirst({
        where: { token_hash: oldTokenHash },
        select: {
          token_family_id: true,
          staff_id: true,
          restaurant_id: true,
        },
      });

      if (!oldRecord) {
        return null;
      }

      await tx.refresh_tokens.create({
        data: {
          token_family_id: oldRecord.token_family_id,
          token_hash: newTokenHash,
          staff_id: oldRecord.staff_id,
          restaurant_id: oldRecord.restaurant_id,
          expires_at: newExpiresAt,
        },
      });

      return { newToken, familyId: oldRecord.token_family_id };
    });

    return result;
  }

  async revokeStaffRefreshToken(token: string): Promise<boolean> {
    const tokenHash = this.hashToken(token);

    const result = await prisma.refresh_tokens.updateMany({
      where: {
        token_hash: tokenHash,
        revoked_at: null,
      },
      data: {
        revoked_at: new Date(),
      },
    });

    return result.count > 0;
  }

  async revokeStaffRefreshTokenFamily(familyId: string, staffId: string): Promise<number> {
    const now = new Date();
    const result = await prisma.refresh_tokens.updateMany({
      where: {
        token_family_id: familyId,
        staff_id: staffId,
        revoked_at: null,
      },
      data: {
        revoked_at: now,
      },
    });

    return result.count;
  }

  async revokeAllStaffRefreshTokens(staffId: string, restaurantId: string): Promise<number> {
    const now = new Date();
    const result = await prisma.refresh_tokens.updateMany({
      where: {
        staff_id: staffId,
        restaurant_id: restaurantId,
        revoked_at: null,
      },
      data: {
        revoked_at: now,
      },
    });

    return result.count;
  }

  async isTokenRevoked(token: string): Promise<boolean> {
    const tokenHash = this.hashToken(token);
    const record = await prisma.refresh_tokens.findFirst({
      where: { token_hash: tokenHash },
      select: { revoked_at: true },
    });
    return record ? record.revoked_at !== null : false;
  }
}

export const refreshTokenService = RefreshTokenService.getInstance();
