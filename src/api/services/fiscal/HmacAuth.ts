import crypto from 'crypto';

export type HmacKey = {
  keyId: string;
  secret: string;
  audience: string;
  createdAt: Date;
  rotatedAt?: Date;
};

export type VerifiedHmacRequest = {
  keyId: string;
  audience: string;
  timestamp: number;
  nonce: string;
  requestId: string;
  bodyHash: string;
  signature: string;
  expiryWindowMs: number;
};

const DEFAULT_EXPIRY_WINDOW_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 1000;

export class HmacAuth {
  private static instance: HmacAuth | null = null;
  private readonly keys: Map<string, HmacKey> = new Map();
  private readonly nonceCache: Map<string, number> = new Map();
  private readonly requestIdCache: Map<string, number> = new Map();

  private constructor() {}

  static getInstance(): HmacAuth {
    if (!HmacAuth.instance) {
      HmacAuth.instance = new HmacAuth();
    }
    return HmacAuth.instance;
  }

  registerKey(key: HmacKey): void {
    this.keys.set(key.keyId, key);
  }

  rotateKey(keyId: string, newSecret: string): void {
    const existing = this.keys.get(keyId);
    if (!existing) {
      throw new Error(`HMAC key not found: ${keyId}`);
    }
    this.keys.set(keyId, {
      ...existing,
      secret: newSecret,
      rotatedAt: new Date(),
    });
  }

  revokeKey(keyId: string): void {
    this.keys.delete(keyId);
  }

  sign(request: VerifiedHmacRequest, body: unknown): string {
    const key = this.keys.get(request.keyId);
    if (!key) {
      throw new Error(`HMAC key not found: ${request.keyId}`);
    }

    const bodyString = JSON.stringify(body);
    const bodyHash = crypto.createHash('sha256').update(bodyString).digest('hex');

    const signData = [
      request.keyId,
      request.audience,
      String(request.timestamp),
      request.nonce,
      request.requestId,
      bodyHash,
    ].join('\n');

    return crypto.createHmac('sha256', key.secret).update(signData).digest('base64');
  }

  verify(request: VerifiedHmacRequest, body: unknown, providedSignature: string): { valid: boolean; error?: string } {
    const key = this.keys.get(request.keyId);
    if (!key) {
      return { valid: false, error: 'Unknown key ID' };
    }

    if (request.audience !== key.audience) {
      return { valid: false, error: 'Audience mismatch' };
    }

    const now = Date.now();
    const timestampAge = now - request.timestamp;
    if (timestampAge < -MAX_CLOCK_SKEW_MS || timestampAge > request.expiryWindowMs + MAX_CLOCK_SKEW_MS) {
      return { valid: false, error: 'Timestamp expired or invalid' };
    }

    const nonceAge = now - (this.nonceCache.get(request.nonce) ?? 0);
    if (nonceAge < DEFAULT_EXPIRY_WINDOW_MS) {
      return { valid: false, error: 'Nonce reused' };
    }
    this.nonceCache.set(request.nonce, now);

    const requestIdAge = now - (this.requestIdCache.get(request.requestId) ?? 0);
    if (requestIdAge < DEFAULT_EXPIRY_WINDOW_MS) {
      return { valid: false, error: 'Request ID reused' };
    }
    this.requestIdCache.set(request.requestId, now);

    const bodyString = JSON.stringify(body);
    const bodyHash = crypto.createHash('sha256').update(bodyString).digest('hex');
    if (bodyHash !== request.bodyHash) {
      return { valid: false, error: 'Body hash mismatch' };
    }

    const signData = [
      request.keyId,
      request.audience,
      String(request.timestamp),
      request.nonce,
      request.requestId,
      bodyHash,
    ].join('\n');

    const expectedSignature = crypto.createHmac('sha256', key.secret).update(signData).digest('base64');

    const providedBuffer = Buffer.from(providedSignature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
      return { valid: false, error: 'Invalid signature' };
    }

    return { valid: true };
  }

  purgeExpiredEntries(): void {
    const now = Date.now();
    const expiry = DEFAULT_EXPIRY_WINDOW_MS;

    for (const [nonce, timestamp] of this.nonceCache) {
      if (now - timestamp > expiry) {
        this.nonceCache.delete(nonce);
      }
    }

    for (const [requestId, timestamp] of this.requestIdCache) {
      if (now - timestamp > expiry) {
        this.requestIdCache.delete(requestId);
      }
    }
  }
}
