/**
 * QR Table Signature Utility
 * 
 * Generates and verifies HMAC-SHA256 signatures for dining table QR codes.
 * Prevents customers from spoofing table numbers in the URL.
 * 
 * URL format: https://menu.fireflow.app/{slug}/order?table=5&sig=a9f24d31&ts=1716200000
 */

import crypto from 'crypto';

// Signature validity window: 24 hours (so printed QR codes work all day)
const SIG_VALIDITY_MS = 24 * 60 * 60 * 1000;

/**
 * Generates a URL-safe HMAC-SHA256 signature for a table QR code.
 * 
 * @param restaurantId  - UUID of the restaurant
 * @param tableNumber   - Integer table number
 * @param secret        - Per-restaurant HMAC secret (from qr_table_secrets)
 * @param timestamp     - Unix timestamp in seconds (default: now)
 */
export function generateTableSignature(
    restaurantId: string,
    tableNumber: number,
    secret: string,
    timestamp: number = Math.floor(Date.now() / 1000)
): { sig: string; ts: number } {
    const payload = `${restaurantId}:${tableNumber}:${timestamp}`;
    const sig = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
        .substring(0, 16); // 16 hex chars = 64-bit security, URL-friendly

    return { sig, ts: timestamp };
}

/**
 * Verifies that a table QR signature is valid and not expired.
 *
 * @param restaurantId  - UUID from local restaurant context
 * @param tableNumber   - Table number from URL param
 * @param sig           - Signature from URL param
 * @param ts            - Timestamp from URL param (seconds)
 * @param secret        - Per-restaurant HMAC secret
 */
export function verifyTableSignature(
    restaurantId: string,
    tableNumber: number,
    sig: string,
    ts: number,
    secret: string
): { valid: boolean; reason?: string } {
    // 1. Check timestamp freshness
    const ageMs = Date.now() - ts * 1000;
    if (ageMs > SIG_VALIDITY_MS) {
        return { valid: false, reason: 'QR code has expired. Ask staff for a fresh code.' };
    }
    if (ageMs < -60_000) {
        return { valid: false, reason: 'QR code timestamp is in the future. Check system clock.' };
    }

    // 2. Recompute expected signature
    const { sig: expectedSig } = generateTableSignature(restaurantId, tableNumber, secret, ts);

    // 3. Constant-time comparison to prevent timing attacks
    const sigBuffer   = Buffer.from(sig.padEnd(32, '0'));
    const expectedBuf = Buffer.from(expectedSig.padEnd(32, '0'));

    if (sigBuffer.length !== expectedBuf.length) {
        return { valid: false, reason: 'Signature format mismatch.' };
    }

    const matches = crypto.timingSafeEqual(sigBuffer, expectedBuf);
    if (!matches) {
        return { valid: false, reason: 'Invalid table signature. Order rejected.' };
    }

    return { valid: true };
}

/**
 * Generates a random HMAC secret for a restaurant (called once at onboarding).
 */
export function generateTableSecret(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Builds the full QR code URL for a dining table.
 */
export function buildTableQRUrl(
    baseUrl: string,
    restaurantSlug: string,
    restaurantId: string,
    tableNumber: number,
    secret: string
): string {
    const { sig, ts } = generateTableSignature(restaurantId, tableNumber, secret);
    return `${baseUrl}/menu/${restaurantSlug}/order?table=${tableNumber}&sig=${sig}&ts=${ts}`;
}
