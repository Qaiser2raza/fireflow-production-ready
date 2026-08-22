// src/api/services/platform/PlatformJwtService.ts
import crypto from 'crypto';
import { isProduction } from '../../../config/env';

export interface PlatformJwtPayload {
  sub: string;
  jti: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  role: string;
  must_change_password?: boolean;
}

export interface DecodedPlatformJwt {
  valid: boolean;
  payload?: PlatformJwtPayload;
  error?: string;
}

const JWT_ACCESS_EXPIRY_MINUTES = 15;
const JWT_ALGORITHM = 'HS256';
const ISSUER = 'fireflow-platform';
const AUDIENCE = 'fireflow-platform-api';
const ALLOWED_ALGORITHM = 'HS256';

function getSigningKey(): string {
  const key = process.env.FIREFLOW_PLATFORM_JWT_SECRET;
  if (!key || key.length < 32) {
    if (isProduction()) {
      throw new Error('FIREFLOW_PLATFORM_JWT_SECRET must be set in production');
    }
    console.warn(
      '⚠️  [PLATFORM_JWT] No FIREFLOW_PLATFORM_JWT_SECRET in environment. Using random key. ' +
      'This will invalidate all tokens on restart. Set FIREFLOW_PLATFORM_JWT_SECRET in production.'
    );
    return crypto.randomBytes(32).toString('hex');
  }
  return key;
}

export class PlatformJwtService {
  private signingKey: string;

  constructor() {
    this.signingKey = getSigningKey();
  }

  generateAccessToken(
    userId: string,
    role: string,
    mustChangePassword: boolean = false,
    expiresInMinutes?: number,
    jti?: string
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const exp = expiresInMinutes ? now + expiresInMinutes * 60 : now + JWT_ACCESS_EXPIRY_MINUTES * 60;

    const payload: PlatformJwtPayload = {
      sub: userId,
      jti: jti || crypto.randomUUID(),
      iss: ISSUER,
      aud: AUDIENCE,
      iat: now,
      exp,
      role,
      must_change_password: mustChangePassword || undefined,
    };

    return this.sign(payload);
  }

  verifyToken(token: string): DecodedPlatformJwt {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'Invalid token format' };
      }

      const [headerB64, payloadB64, signatureB64] = parts;

      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf-8');
      const header = JSON.parse(headerJson);

      if (header.alg !== ALLOWED_ALGORITHM) {
        return { valid: false, error: 'Invalid token algorithm' };
      }

      const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
      const payload: PlatformJwtPayload = JSON.parse(payloadJson);

      const now = Math.floor(Date.now() / 1000);
      const clockSkew = 30;

      if (payload.exp < now - clockSkew) {
        return { valid: false, error: 'Token expired' };
      }

      if (payload.iat > now + clockSkew) {
        return { valid: false, error: 'Token issued in future' };
      }

      if (payload.iss !== ISSUER) {
        return { valid: false, error: 'Invalid issuer' };
      }

      if (payload.aud !== AUDIENCE) {
        return { valid: false, error: 'Invalid audience' };
      }

      if (!payload.sub || !payload.jti || !payload.role) {
        return { valid: false, error: 'Missing required claims' };
      }

      const expectedSignature = this.createSignature(headerB64, payloadB64);
      if (signatureB64 !== expectedSignature) {
        return { valid: false, error: 'Invalid token signature' };
      }

      return { valid: true, payload };
    } catch (error: any) {
      return { valid: false, error: error.message || 'Token verification failed' };
    }
  }

  private sign(payload: PlatformJwtPayload): string {
    const header = {
      alg: JWT_ALGORITHM,
      typ: 'JWT',
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.createSignature(headerB64, payloadB64);

    return `${headerB64}.${payloadB64}.${signature}`;
  }

  private createSignature(headerB64: string, payloadB64: string): string {
    const message = `${headerB64}.${payloadB64}`;
    const hmac = crypto.createHmac('sha256', this.signingKey);
    hmac.update(message);
    return hmac.digest('base64url');
  }

  static extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader) return null;
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }
    return parts[1];
  }
}

export const platformJwtService = new PlatformJwtService();
