// src/api/services/auth/JwtService.ts
/**
 * JWT Authentication Service
 * 
 * Responsibilities:
 * - Generate access tokens (15 min expiry)
 * - Generate refresh tokens (7 days expiry)
 * - Verify and decode tokens
 * - Type-safe token claims
 * 
 * Security approach:
 * - Access tokens: Short-lived (15 min), sufficient for interactive sessions
 * - Refresh tokens: Longer-lived (7 days), rotated on use
 * - Signing key: From environment (FIREFLOW_JWT_SECRET, fallback to random)
 * - Algorithm: HS256 (HMAC-SHA256)
 * - Never expose secret in logs
 */

import crypto from 'crypto';

// ==========================================
// TYPE DEFINITIONS
// ==========================================

/**
 * JWT Payload - what gets encoded in the token
 */
export interface JwtPayload {
  staffId: string;        // Primary identifier
  restaurantId: string;   // Tenant identifier (critical for isolation)
  role: string;           // Staff role (waiter, manager, super_admin)
  name: string;           // Display name (for logging)
  type: 'access' | 'refresh';  // Token type (distinguish access from refresh)
  iat: number;            // Issued at (Unix timestamp)
  exp: number;            // Expiration (Unix timestamp)
  jti?: string;           // JWT ID (unique identifier for revocation)
}

/**
 * Decoded JWT - result after verification
 */
export interface DecodedJwt {
  valid: boolean;
  payload?: JwtPayload;
  error?: string;
}

// ==========================================
// CONFIG
// ==========================================

const JWT_ACCESS_EXPIRY_MINUTES = 15;
const JWT_REFRESH_EXPIRY_DAYS = 7;
const JWT_ALGORITHM = 'HS256';

/**
 * Get signing key from environment or generate random
 * WARNING: In production, MUST use environment variable (e.g., AWS Secrets Manager)
 */
function getSigningKey(): string {
  const key = process.env.FIREFLOW_JWT_SECRET;
  if (!key || key.length < 32) {
    console.warn(
      '⚠️  [JWT] No FIREFLOW_JWT_SECRET in environment. Using random key. ' +
      'This will invalidate all tokens on restart. Set FIREFLOW_JWT_SECRET in production.'
    );
    return crypto.randomBytes(32).toString('hex');
  }
  return key;
}

// ==========================================
// JWT SERVICE
// ==========================================

export class JwtService {
  private signingKey: string;

  constructor() {
    this.signingKey = getSigningKey();
  }

  /**
   * Generate access token (15 min lifetime)
   * Used for authenticated API requests
   */
  generateAccessToken(
    staffId: string,
    restaurantId: string,
    role: string,
    name: string
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + JWT_ACCESS_EXPIRY_MINUTES * 60;

    const payload: JwtPayload = {
      staffId,
      restaurantId,
      role,
      name,
      type: 'access',
      iat: now,
      exp,
      jti: crypto.randomUUID() // Unique ID for potential revocation
    };

    return this.sign(payload);
  }

  /**
   * Generate refresh token (7 day lifetime)
   * Used to obtain new access tokens without re-authentication
   * 
   * WARNING: Refresh tokens should be rotated on use (implement in Phase 2c)
   */
  generateRefreshToken(
    staffId: string,
    restaurantId: string,
    role: string,
    name: string
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + JWT_REFRESH_EXPIRY_DAYS * 24 * 60 * 60;

    const payload: JwtPayload = {
      staffId,
      restaurantId,
      role,
      name,
      type: 'refresh',
      iat: now,
      exp,
      jti: crypto.randomUUID()
    };

    return this.sign(payload);
  }

  /**
   * Verify and decode JWT
   * Returns { valid: true, payload } or { valid: false, error }
   */
  verifyToken(token: string): DecodedJwt {
    try {
      // Basic format validation: header.payload.signature
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'Invalid token format' };
      }

      const [headerB64, payloadB64, signatureB64] = parts;

      // Decode payload
      const payloadJson = Buffer.from(payloadB64, 'base64').toString('utf-8');
      const payload: JwtPayload = JSON.parse(payloadJson);

      // Check expiry
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        return { valid: false, error: 'Token expired' };
      }

      // Verify signature
      const expectedSignature = this.createSignature(headerB64, payloadB64);
      if (signatureB64 !== expectedSignature) {
        return { valid: false, error: 'Invalid token signature' };
      }

      // Verify required claims
      if (!payload.staffId || !payload.restaurantId) {
        return { valid: false, error: 'Missing required claims' };
      }

      return { valid: true, payload };
    } catch (error: any) {
      return { valid: false, error: error.message || 'Token verification failed' };
    }
  }

  /**
   * Sign JWT payload with HMAC-SHA256
   * Format: base64(header).base64(payload).base64(signature)
   */
  private sign(payload: JwtPayload): string {
    const header = {
      alg: JWT_ALGORITHM,
      typ: 'JWT'
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.createSignature(headerB64, payloadB64);

    return `${headerB64}.${payloadB64}.${signature}`;
  }

  /**
   * Create HMAC-SHA256 signature
   */
  private createSignature(headerB64: string, payloadB64: string): string {
    const message = `${headerB64}.${payloadB64}`;
    const hmac = crypto.createHmac('sha256', this.signingKey);
    hmac.update(message);
    return hmac.digest('base64url');
  }

  /**
   * Extract token from Bearer header
   * Expected format: "Bearer <token>"
   */
  static extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader) return null;
    
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }
}

// Export singleton instance
export const jwtService = new JwtService();
