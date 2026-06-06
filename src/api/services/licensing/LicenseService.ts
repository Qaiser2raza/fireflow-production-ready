import crypto from 'crypto';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../../shared/lib/prisma';

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface LicensePayload {
  restaurant_id: string;
  restaurant_name: string;
  plan: 'BASIC' | 'STANDARD' | 'PREMIUM' | 'ENTERPRISE';
  subscription_expires_at: string;
  grace_period_days: number;
  hardware_fingerprint: string;
  issued_at: string;
}

export interface LicenseVerificationResult {
  status: 'active' | 'expired' | 'tampered' | 'unlicensed';
  payload: LicensePayload | null;
  error: string | null;
  daysRemaining?: number;
}

// ==========================================
// CONFIGURATION & CONSTANTS
// ==========================================

// Storing the license file in a standard location relative to the app execution path
const LICENSE_PATH = path.join(process.cwd(), 'license.lic');

// Hardcoded SaaS Public Key (Elliptic Curve Public Key in PEM format)
// In a production build, this public key corresponds to your SaaS private key
const SAAS_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEoF8CpB2SPxE9t+QK2PDorvaOggXG
48/FNDLcxBA5Xz0tlFT3fMBk/MwPGBtFxTiWfFm9243q5LzgWMi0AkqWIg==
-----END PUBLIC KEY-----`;

export class LicenseService {
  /**
   * Generates a unique hardware fingerprint based on system parameters
   * Supports Windows, macOS, and Linux
   */
  static getHardwareFingerprint(): string {
    try {
      let rawId = '';
      const platform = process.platform;

      if (platform === 'win32') {
        // Windows: Motherboard UUID
        rawId = execSync('wmic csproduct get uuid')
          .toString()
          .replace('UUID', '')
          .trim();
      } else if (platform === 'darwin') {
        // macOS: Hardware UUID
        rawId = execSync("ioreg -rd1 -c IOPlatformExpertDevice | grep -i 'UUID'")
          .toString()
          .split('=')[1]
          ?.replace(/"/g, '')
          .trim() || '';
      } else {
        // Linux / Unix: DBUS Machine ID or fallback Machine ID
        try {
          rawId = execSync('cat /var/lib/dbus/machine-id || cat /etc/machine-id')
            .toString()
            .trim();
        } catch {
          rawId = execSync('cat /sys/class/dmi/id/product_uuid')
            .toString()
            .trim();
        }
      }

      if (!rawId || rawId.includes('Failed') || rawId.length < 5) {
        throw new Error('Invalid system ID');
      }

      // Hash raw ID for safety and format as hex
      return crypto.createHash('sha256').update(rawId).digest('hex');
    } catch (error) {
      console.warn('[LICENSE SERVICE] Hardware discovery failed, using secure software fallback:', error);
      
      // Fallback: Generate a persistent soft UUID stored locally
      const fallbackPath = path.join(process.cwd(), '.system_soft_uuid');
      if (fs.existsSync(fallbackPath)) {
        return fs.readFileSync(fallbackPath, 'utf8').trim();
      } else {
        const softId = crypto.randomUUID();
        const hashedSoftId = crypto.createHash('sha256').update(softId).digest('hex');
        fs.writeFileSync(fallbackPath, hashedSoftId, 'utf8');
        return hashedSoftId;
      }
    }
  }

  /**
   * Reads the PostgreSQL orders table to detect if system time has been rolled back
   * Returns true if system time is valid, false if a rollback is detected
   */
  static async verifyClockMonotonicity(restaurantId: string): Promise<boolean> {
    try {
      // Find the most recent transaction/order time recorded in database
      const latestOrder = await prisma.orders.findFirst({
        where: { restaurant_id: restaurantId },
        orderBy: { created_at: 'desc' },
        select: { created_at: true }
      });

      if (!latestOrder) {
        return true; // No orders exist, clock is fine
      }

      const systemTime = new Date();
      const lastRecordedTime = new Date(latestOrder.created_at);

      // If system clock is set behind the last recorded transaction by more than 30 minutes,
      // it is a clear system clock rollback attempt.
      const timeDifferenceMs = lastRecordedTime.getTime() - systemTime.getTime();
      if (timeDifferenceMs > 30 * 60 * 1000) {
        console.error(`[LICENSE SERVICE] ⚠️ SECURITY ALERT: Clock rollback detected! Last recorded transaction: ${lastRecordedTime.toISOString()}, current system clock: ${systemTime.toISOString()}`);
        return false;
      }

      return true;
    } catch (e) {
      console.error('[LICENSE SERVICE] Clock monotonicity check failed:', e);
      return true; // Soft bypass if query fails, avoiding operational lockout
    }
  }

  /**
   * Verifies the cryptographic token signature using our hardcoded public key
   * Token format: HeaderBase64.PayloadBase64.SignatureBase64
   */
  static verifyLicenseToken(tokenString: string): LicensePayload | null {
    try {
      const parts = tokenString.trim().split('.');
      if (parts.length !== 3) {
        return null;
      }

      const [headerB64, payloadB64, signatureB64] = parts;

      // Verify signature using ECDSA-SHA256
      const verifier = crypto.createVerify('SHA256');
      verifier.update(`${headerB64}.${payloadB64}`);

      const signature = Buffer.from(signatureB64, 'base64url');
      
      const isSignatureValid = verifier.verify(SAAS_PUBLIC_KEY_PEM, signature);
      if (!isSignatureValid) {
        console.warn('[LICENSE SERVICE] ❌ License verification failed: Signature mismatch');
        return null;
      }

      // Decode and return payload
      const payloadString = Buffer.from(payloadB64, 'base64url').toString('utf8');
      return JSON.parse(payloadString) as LicensePayload;
    } catch (err) {
      console.error('[LICENSE SERVICE] Error during token signature check:', err);
      return null;
    }
  }

  /**
   * Full comprehensive license evaluation check. Runs signature, hardware fingerprint
   * matching, clock validity, and expiration checks.
   */
  static async evaluateLocalLicenseStatus(restaurantId: string): Promise<LicenseVerificationResult> {
    try {
      // 1. Check if license file exists
      if (!fs.existsSync(LICENSE_PATH)) {
        return { status: 'unlicensed', payload: null, error: 'License file not found on disk' };
      }

      const tokenString = fs.readFileSync(LICENSE_PATH, 'utf8').trim();
      
      // 2. Cryptographic signature check
      const payload = this.verifyLicenseToken(tokenString);
      if (!payload) {
        return { status: 'tampered', payload: null, error: 'Cryptographic signature is invalid' };
      }

      // 3. Verify restaurant ownership
      if (payload.restaurant_id !== restaurantId) {
        return { status: 'tampered', payload, error: 'License belongs to a different restaurant ID' };
      }

      // 4. Hardware fingerprint match
      const currentFingerprint = this.getHardwareFingerprint();
      if (payload.hardware_fingerprint && payload.hardware_fingerprint !== currentFingerprint) {
        console.warn(`[LICENSE SERVICE] Hardware fingerprint mismatch! License belongs to: ${payload.hardware_fingerprint}, active system: ${currentFingerprint}`);
        return { status: 'tampered', payload, error: 'License hardware fingerprint does not match host hardware' };
      }

      // 5. Clock monotonicity safety check (rollback prevention)
      const isClockMonotonic = await this.verifyClockMonotonicity(restaurantId);
      if (!isClockMonotonic) {
        return { status: 'tampered', payload, error: 'System clock has been rolled back' };
      }

      // 6. Expiration check
      const systemTime = new Date();
      const expiryTime = new Date(payload.subscription_expires_at);
      const gracePeriodMs = (payload.grace_period_days || 0) * 24 * 60 * 60 * 1000;
      
      const totalAllowedTime = expiryTime.getTime() + gracePeriodMs;

      if (systemTime.getTime() > totalAllowedTime) {
        const timeDiffMs = systemTime.getTime() - expiryTime.getTime();
        const daysExpired = Math.floor(timeDiffMs / (24 * 60 * 60 * 1000));
        return { 
          status: 'expired', 
          payload, 
          error: `Subscription expired ${daysExpired} days ago (Expiration Date: ${expiryTime.toLocaleDateString()})` 
        };
      }

      // Calculate exact remaining days
      const daysRemaining = Math.max(0, Math.floor((expiryTime.getTime() - systemTime.getTime()) / (24 * 60 * 60 * 1000)));

      return {
        status: 'active',
        payload,
        error: null,
        daysRemaining
      };
    } catch (error: any) {
      console.error('[LICENSE SERVICE] Fatal error during license evaluation:', error);
      return { status: 'tampered', payload: null, error: error.message || 'Fatal verification error' };
    }
  }

  /**
   * Securely saves an activation key to the local file system
   */
  static saveLicense(tokenString: string): boolean {
    try {
      fs.writeFileSync(LICENSE_PATH, tokenString.trim(), 'utf8');
      console.log('[LICENSE SERVICE] License activated and written to disk:', LICENSE_PATH);
      return true;
    } catch (error) {
      console.error('[LICENSE SERVICE] Failed to write license file to disk:', error);
      return false;
    }
  }

  /**
   * Retrieves the plain license token stored locally, or null
   */
  static getLocalLicenseToken(): string | null {
    try {
      if (fs.existsSync(LICENSE_PATH)) {
        return fs.readFileSync(LICENSE_PATH, 'utf8').trim();
      }
      return null;
    } catch {
      return null;
    }
  }
}
