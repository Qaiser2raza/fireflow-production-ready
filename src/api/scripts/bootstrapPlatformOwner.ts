// src/api/scripts/bootstrapPlatformOwner.ts
import bcrypt from 'bcrypt';
import { prisma } from '../../shared/lib/prisma';

const BCRYPT_COST = 14;

export interface BootstrapResult {
  created: boolean;
  email: string;
  message: string;
}

/**
 * Idempotent bootstrap script for the initial SaaS PLATFORM_OWNER.
 * Reads PLATFORM_OWNER_EMAIL and PLATFORM_OWNER_PASSWORD from environment variables.
 */
export async function bootstrapPlatformOwner(): Promise<BootstrapResult> {
  const email = (process.env.PLATFORM_OWNER_EMAIL || 'admin@fireflow.io').toLowerCase().trim();
  const password = process.env.PLATFORM_OWNER_PASSWORD || 'PlatformOwner@FireFlow2026!';
  const name = process.env.PLATFORM_OWNER_NAME || 'Platform Owner';

  // Check if an owner with this email or any PLATFORM_OWNER already exists
  const existingOwner = await prisma.platform_users.findFirst({
    where: {
      OR: [
        { email },
        { role: 'PLATFORM_OWNER' }
      ]
    },
    select: { id: true, email: true, role: true }
  });

  if (existingOwner) {
    const msg = `[BOOTSTRAP] PLATFORM_OWNER already exists (${existingOwner.email}, ID: ${existingOwner.id}). Skipping bootstrap.`;
    console.log(msg);
    return {
      created: false,
      email: existingOwner.email,
      message: msg,
    };
  }

  // Hash password using 14 rounds matching PlatformAuthService policy
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  const passwordHash = `$bcrypt$${hash}`;

  const user = await prisma.platform_users.create({
    data: {
      email,
      name,
      password_hash: passwordHash,
      role: 'PLATFORM_OWNER',
      status: 'ACTIVE',
      email_verified: true,
      failed_login_count: 0,
      must_change_password: false,
    }
  });

  const msg = `[BOOTSTRAP] Initial PLATFORM_OWNER created successfully (${user.email}, ID: ${user.id}).`;
  console.log(msg);
  return {
    created: true,
    email: user.email,
    message: msg,
  };
}

// Allow direct CLI execution: ts-node src/api/scripts/bootstrapPlatformOwner.ts
if (require.main === module) {
  bootstrapPlatformOwner()
    .then((res) => {
      console.log('[BOOTSTRAP] Complete:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[BOOTSTRAP] Failed:', err);
      process.exit(1);
    });
}
