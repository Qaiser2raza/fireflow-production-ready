import crypto from 'crypto';

const DEFAULT_EXPIRY_WINDOW_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 1000;

export type VerifiedFireFlowRequest = {
  keyId: string;
  audience: string;
  timestamp: number;
  nonce: string;
  requestId: string;
  bodyHash: string;
  signature: string;
};

export class HmacVerifier {
  private static instance: HmacVerifier | null = null;
  private readonly keys: Map<string, string> = new Map();
  private readonly nonceCache: Map<string, number> = new Map();
  private readonly requestIdCache: Map<string, number> = new Map();

  private constructor() {}

  static getInstance(): HmacVerifier {
    if (!HmacVerifier.instance) {
      HmacVerifier.instance = new HmacVerifier();
    }
    return HmacVerifier.instance;
  }

  registerKey(keyId: string, secret: string, audience: string): void {
    this.keys.set(keyId, secret);
  }

  verify(req: VerifiedFireFlowRequest, body: unknown, providedSignature: string): { valid: boolean; error?: string } {
    const secret = this.keys.get(req.keyId);
    if (!secret) {
      return { valid: false, error: 'Unknown key ID' };
    }

    const now = Date.now();
    const timestampAge = now - req.timestamp;
    if (timestampAge < -MAX_CLOCK_SKEW_MS || timestampAge > DEFAULT_EXPIRY_WINDOW_MS + MAX_CLOCK_SKEW_MS) {
      return { valid: false, error: 'Timestamp expired or invalid' };
    }

    const nonceAge = now - (this.nonceCache.get(req.nonce) ?? 0);
    if (nonceAge < DEFAULT_EXPIRY_WINDOW_MS) {
      return { valid: false, error: 'Nonce reused' };
    }
    this.nonceCache.set(req.nonce, now);

    const requestIdAge = now - (this.requestIdCache.get(req.requestId) ?? 0);
    if (requestIdAge < DEFAULT_EXPIRY_WINDOW_MS) {
      return { valid: false, error: 'Request ID reused' };
    }
    this.requestIdCache.set(req.requestId, now);

    const bodyString = JSON.stringify(body);
    const bodyHash = crypto.createHash('sha256').update(bodyString).digest('hex');
    if (bodyHash !== req.bodyHash) {
      return { valid: false, error: 'Body hash mismatch' };
    }

    const signData = [
      req.keyId,
      req.audience,
      String(req.timestamp),
      req.nonce,
      req.requestId,
      bodyHash,
    ].join('\n');

    const expectedSignature = crypto.createHmac('sha256', secret).update(signData).digest('base64');

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
