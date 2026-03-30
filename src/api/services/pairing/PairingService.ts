// src/api/services/pairing/PairingService.ts
/**
 * Secure Device Pairing Service
 * 
 * Responsibilities:
 * - Generate one-time pairing codes (plaintext + bcrypt hash)
 * - Verify codes with device fingerprint
 * - Register and activate paired devices
 * - Cleanup expired codes
 * 
 * Security approach:
 * - Codes are 6-char alphanumeric, hashed for DB storage
 * - Device fingerprint prevents code reuse across devices
 * - Rate limiting on verify endpoint (10/min per restaurant)
 * - One code = one use only
 */

import { jwtService } from '../auth/JwtService';
import { prisma } from '../../../shared/lib/prisma';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { NetworkDiscoveryService } from '../NetworkDiscoveryService';

const SALT_ROUNDS = 12;
const CODE_EXPIRY_MINUTES = 15; // Pairing code valid for 15 minutes
const MAX_VERIFY_ATTEMPTS = 5; // Lock after 5 failed attempts

/**
 * Generate a new pairing code for a restaurant
 * 
 * @param restaurantId - Restaurant requesting the code
 * @param generatedByStaffId - Manager generating the code
 * @param targetStaffId - Staff member who will scan this
 * @param durationHours - Session duration in hours
 */
export async function generatePairingCode(
  restaurantId: string,
  generatedByStaffId: string,
  targetStaffId: string,
  durationHours: number
): Promise<{ 
  code: string; 
  expiresAt: Date; 
  id: string;
  qr_payload: string;
  qr_expires_in: number;
  target_staff_name: string;
  session_duration_hours: number;
}> {
  // 1. Validate targetStaffId exists and belongs to restaurant
  console.log('[DEBUG] staff lookup for targetStaffId:', targetStaffId, 'and restaurantId:', restaurantId);
  const targetStaff = await prisma.staff.findFirst({
    where: { id: targetStaffId, restaurant_id: restaurantId }
  });
  if (!targetStaff) throw new Error('STAFF_NOT_FOUND');

  // Generate 6-char alphanumeric code
  const plainCode = crypto.randomBytes(4).toString('hex').substring(0, 6).toUpperCase();
  const hashedCode = await bcrypt.hash(plainCode, SALT_ROUNDS);

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + CODE_EXPIRY_MINUTES);

  // 2. Create in transaction, storing duration in device_expiry_duration 
  // and targetStaffId in used_by (as the intended user)
  const pairingCode = await prisma.$transaction(async (tx) => {
    return await (tx.pairing_codes).create({
      data: {
        restaurant_id: restaurantId,
        pairing_code: plainCode,
        hashed_code: hashedCode,
        expires_at: expiresAt,
        device_expiry_duration: durationHours * 60, // Store in minutes for compatibility
        used_by: targetStaff.id, // Store target staff here
        is_used: false,
        attempt_count: 0
      }
    });
  });

  // Generate QR Payload
  const bestIP = NetworkDiscoveryService.getBestLocalIP();
  const port = process.env.PORT || 3001;
  const timestamp = Math.floor(Date.now() / 1000);
  // Note: staffId is NOT in URL for security, it's stored in the record
  const qr_payload = `http://${bestIP}:${port}/pair?token=${plainCode}&restaurant=${restaurantId}&t=${timestamp}`;
  const qr_expires_in = CODE_EXPIRY_MINUTES * 60;

  // Audit: Log code generation
  await prisma.audit_logs.create({
    data: {
      restaurant_id: restaurantId,
      staff_id: generatedByStaffId,
      action_type: 'DEVICE_PAIR',
      entity_type: 'STAFF',
      details: { 
        event: 'pairing_code_generated', 
        code_id: pairingCode.id,
        target_staff_id: targetStaffId,
        duration_hours: durationHours
      }
    }
  });

  return {
    code: plainCode,
    expiresAt,
    id: pairingCode.id,
    qr_payload,
    qr_expires_in,
    target_staff_name: targetStaff.name,
    session_duration_hours: durationHours
  };
}


/**
 * Verify pairing code + device fingerprint, register device
 * 
 * @param restaurantId - Restaurant attempting to pair
 * @param codeId - Pairing code ID
 * @param providedCode - Plaintext code from user
 * @param deviceFingerprint - Hash of device identity
 * @param deviceName - User-friendly device name
 * @param userAgent - Device's user agent string
 * @param platform - OS platform (ios, android, linux, darwin, win32)
 * @returns session details including JWT
 */
export async function verifyPairingCode(
  restaurantId: string,
  codeId: string,
  providedCode: string,
  deviceFingerprint: string,
  deviceName: string,
  userAgent: string,
  platform: string
): Promise<{ 
  authToken: string; 
  deviceId: string;
  sessionJwt: string;
  staffId: string;
  staffName: string;
  staffRole: string;
  expiresAt: string;
}> {
  // Fetch code record (with expiry + attempt check)
  const rawPairingCode = await prisma.pairing_codes.findUnique({
    where: { id: codeId }
  });

  if (!rawPairingCode) {
    throw new Error('INVALID_CODE');
  }
  const pairingCode = rawPairingCode as any;

  // Check expiry
  if (new Date() > pairingCode.expires_at) {
    await prisma.pairing_codes.delete({ where: { id: codeId } });
    throw new Error('CODE_EXPIRED');
  }

  // Check already used
  if (pairingCode.is_used) {
    throw new Error('CODE_ALREADY_USED');
  }

  // Check attempt limit
  if (pairingCode.attempt_count >= MAX_VERIFY_ATTEMPTS) {
    await (prisma.pairing_codes as any).update({
      where: { id: codeId },
      data: { is_used: true } // Lock it
    });
    throw new Error('TOO_MANY_ATTEMPTS');
  }

  // NEW: Fingerprint locking (Fix 4)
  // If the code record already has a verified_fingerprint saved (from a previous attempt),
  // ensure the incoming fingerprint matches it.
  if (pairingCode.verified_fingerprint && pairingCode.verified_fingerprint !== deviceFingerprint) {
    throw new Error('INVALID_DEVICE');
  }

  // If no fingerprint is saved yet, save this one as the "sticky" identity for this code
  if (!pairingCode.verified_fingerprint) {
    await (prisma.pairing_codes as any).update({
      where: { id: codeId },
      data: { verified_fingerprint: deviceFingerprint }
    });
  }

  // Verify code (bcrypt compare)
  const codeMatches = await bcrypt.compare(providedCode, pairingCode.hashed_code);
  if (!codeMatches) {
    // Increment attempt counter
    await prisma.pairing_codes.update({
      where: { id: codeId },
      data: { attempt_count: { increment: 1 } }
    });
    throw new Error('INVALID_CODE');
  }

  // 1. Look up target staff member (stored in used_by)
  const targetStaffId = pairingCode.used_by;
  if (!targetStaffId) throw new Error('STAFF_NOT_FOUND');

  const targetStaff = await prisma.staff.findUnique({
    where: { id: targetStaffId }
  });
  if (!targetStaff) throw new Error('STAFF_NOT_FOUND');

  // 2. Register/Update device + Generate JWT
  const authToken = crypto.randomBytes(32).toString('hex');
  const authTokenHash = await bcrypt.hash(authToken, SALT_ROUNDS);

  // Calculate session expiry
  const durationMinutes = pairingCode.device_expiry_duration || (8 * 60); // Default 8h if 0
  const sessionExpiresAt = new Date();
  sessionExpiresAt.setMinutes(sessionExpiresAt.getMinutes() + durationMinutes);

  // Generate staff-scoped session JWT
  const sessionJwt = jwtService.generateAccessToken(
    targetStaff.id,
    restaurantId,
    targetStaff.role,
    targetStaff.name,
    durationMinutes * 60 // expiresInSeconds
  );

  // Register device in transaction
  const device = await prisma.$transaction(async (tx) => {
    // 3. One-session-per-device enforcement: Deactivate old ones for this fingerprint
    await (tx.registered_devices as any).updateMany({
      where: {
        device_fingerprint: deviceFingerprint,
        restaurant_id: restaurantId,
        is_active: true
      },
      data: { is_active: false }
    });

    // Mark code as used
    await (tx.pairing_codes as any).update({
      where: { id: codeId },
      data: { is_used: true }
    });

    // Manual Upsert for new device record
    const existing = await (tx.registered_devices as any).findFirst({
      where: {
        restaurant_id: restaurantId,
        staff_id: targetStaffId,
        device_fingerprint: deviceFingerprint
      }
    });

    if (existing) {
      return await (tx.registered_devices as any).update({
        where: { id: existing.id },
        data: {
          auth_token_hash: authTokenHash,
          device_name: deviceName,
          user_agent: userAgent,
          platform: platform,
          is_active: true,
          expires_at: sessionExpiresAt,
          updated_at: new Date(),
          pairing_code_id: codeId
        }
      });
    } else {
      return await (tx.registered_devices as any).create({
        data: {
          restaurant_id: restaurantId,
          staff_id: targetStaffId,
          device_name: deviceName,
          device_fingerprint: deviceFingerprint,
          user_agent: userAgent,
          platform: platform,
          auth_token_hash: authTokenHash,
          pairing_code_id: codeId,
          expires_at: sessionExpiresAt,
          updated_at: new Date()
        }
      });
    }
  });

  // Audit: Log successful pairing
  await prisma.audit_logs.create({
    data: {
      restaurant_id: restaurantId,
      staff_id: targetStaffId,
      action_type: 'DEVICE_PAIR',
      entity_type: 'STAFF',
      entity_id: device.id,
      details: {
        event: 'device_paired_session_started',
        device_id: device.id,
        staff_name: targetStaff.name,
        expires_at: sessionExpiresAt
      }
    }
  });

  return {
    authToken,
    deviceId: device.id,
    sessionJwt,
    staffId: targetStaff.id,
    staffName: targetStaff.name,
    staffRole: targetStaff.role,
    expiresAt: sessionExpiresAt.toISOString()
  };
}

/**
 * Cleanup job: Delete expired pairing codes
 * Run every 5 minutes
 */
export async function cleanupExpiredCodes(): Promise<number> {
  const result = await prisma.pairing_codes.deleteMany({
    where: {
      expires_at: {
        lt: new Date()
      }
    }
  });

  if (result.count > 0) {
    console.log(`🧹 Cleaned up ${result.count} expired pairing codes`);
  }

  return result.count;
}

/**
 * List all paired devices for a staff member
 */
export async function listPairedDevices(
  restaurantId: string,
  staffId: string
): Promise<any[]> {
  return await prisma.registered_devices.findMany({
    where: {
      restaurant_id: restaurantId,
      staff_id: staffId,
      is_active: true
    },
    select: {
      id: true,
      device_name: true,
      platform: true,
      created_at: true,
      last_sync_at: true,
      expires_at: true,
      is_active: true,
      device_fingerprint: false // Never expose fingerprint to client
    } as any,
    orderBy: { last_sync_at: 'desc' }
  });
}

/**
 * Disable a device (revoke without deleting history)
 */
export async function disableDevice(
  deviceId: string,
  staffId: string,
  restaurantId: string
): Promise<void> {
  const device = await prisma.registered_devices.findUnique({
    where: { id: deviceId }
  });

  if (!device || device.staff_id !== staffId || device.restaurant_id !== restaurantId) {
    throw new Error('DEVICE_NOT_FOUND_OR_UNAUTHORIZED');
  }

  await prisma.registered_devices.update({
    where: { id: deviceId },
    data: { is_active: false }
  });

  // Audit
  await prisma.audit_logs.create({
    data: {
      restaurant_id: restaurantId,
      staff_id: staffId,
      action_type: 'DEVICE_PAIR',
      entity_type: 'STAFF',
      entity_id: deviceId,
      details: { event: 'device_disabled' }
    }
  });
}
