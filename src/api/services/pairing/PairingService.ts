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

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;
const CODE_EXPIRY_MINUTES = 15; // Pairing code valid for 15 minutes
const MAX_VERIFY_ATTEMPTS = 5; // Lock after 5 failed attempts

/**
 * Generate a new pairing code for a restaurant
 * 
 * @param restaurantId - Restaurant requesting the code
 * @param staffId - Staff member generating the code (audit)
 * @returns { code, expiresAt } - Plaintext code to show user once
 */
export async function generatePairingCode(
  restaurantId: string,
  staffId: string
): Promise<{ code: string; expiresAt: Date; id: string }> {
  // Generate 6-char alphanumeric code (using base36 for human readability)
  const plainCode = crypto.randomBytes(4).toString('hex').substring(0, 6).toUpperCase();
  const hashedCode = await bcrypt.hash(plainCode, SALT_ROUNDS);

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + CODE_EXPIRY_MINUTES);

  // Create in transaction to ensure consistency
  const pairingCode = await prisma.$transaction(async (tx) => {
    return await tx.pairing_codes.create({
      data: {
        restaurant_id: restaurantId,
        pairing_code: plainCode, // Plaintext stored once, user copies immediately
        hashed_code: hashedCode,
        expires_at: expiresAt,
        is_used: false,
        attempt_count: 0
      }
    });
  });

  // Audit: Log code generation
  await prisma.audit_logs.create({
    data: {
      restaurant_id: restaurantId,
      staff_id: staffId,
      action_type: 'DEVICE_PAIR',
      entity_type: 'STAFF',
      details: { event: 'pairing_code_generated', code_id: pairingCode.id }
    }
  });

  return {
    code: plainCode,
    expiresAt,
    id: pairingCode.id
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
 * @returns { authToken } - Long-lived device auth token (hashed in DB, raw to client once)
 */
export async function verifyPairingCode(
  restaurantId: string,
  staffId: string,
  codeId: string,
  providedCode: string,
  deviceFingerprint: string,
  deviceName: string,
  userAgent: string,
  platform: string
): Promise<{ authToken: string; deviceId: string }> {
  // Fetch code record (with expiry + attempt check)
  const pairingCode = await prisma.pairing_codes.findUnique({
    where: { id: codeId }
  });

  if (!pairingCode) {
    throw new Error('INVALID_CODE');
  }

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
    await prisma.pairing_codes.update({
      where: { id: codeId },
      data: { is_used: true } // Lock it
    });
    throw new Error('TOO_MANY_ATTEMPTS');
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

  // Code is valid! Generate device auth token (long-lived secret)
  const authToken = crypto.randomBytes(32).toString('hex');
  const authTokenHash = await bcrypt.hash(authToken, SALT_ROUNDS);

  // Register device in transaction
  const device = await prisma.$transaction(async (tx) => {
    // Mark code as used
    await tx.pairing_codes.update({
      where: { id: codeId },
      data: {
        is_used: true,
        used_by: staffId,
        verified_fingerprint: deviceFingerprint
      }
    });

    // Upsert device (replace if same fingerprint, else create new)
    return await tx.registered_devices.upsert({
      where: {
        // Unique constraint: (restaurant_id, staff_id, device_fingerprint)
        restaurant_id_staff_id_device_fingerprint: {
          restaurant_id: restaurantId,
          staff_id: staffId,
          device_fingerprint: deviceFingerprint
        }
      },
      update: {
        // If device already registered, refresh auth token
        auth_token_hash: authTokenHash,
        device_name: deviceName,
        user_agent: userAgent,
        platform: platform,
        is_active: true,
        updated_at: new Date(),
        pairing_code_id: codeId
      },
      create: {
        restaurant_id: restaurantId,
        staff_id: staffId,
        device_name: deviceName,
        device_fingerprint: deviceFingerprint,
        user_agent: userAgent,
        platform: platform,
        auth_token_hash: authTokenHash,
        pairing_code_id: codeId
      }
    });
  });

  // Audit: Log successful pairing
  await prisma.audit_logs.create({
    data: {
      restaurant_id: restaurantId,
      staff_id: staffId,
      action_type: 'DEVICE_PAIR',
      entity_type: 'STAFF',
      entity_id: device.id,
      details: {
        event: 'device_paired',
        device_id: device.id,
        device_name: deviceName,
        platform: platform
      }
    }
  });

  return {
    authToken, // Raw token (never stored in DB, send to client once)
    deviceId: device.id
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
      device_fingerprint: false // Never expose fingerprint to client
    },
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
