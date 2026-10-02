/**
 * DEV ONLY, never deploy.
 *
 * Local-only helper that sets (or re-sets) the password for an existing owner
 * account in `users`, so the owner can sign in while debugging locally.
 *
 * Guards:
 *   - refuses to run when NODE_ENV=production
 *   - refuses to run when DATABASE_URL does not point at localhost/127.0.0.1
 *   - reads OWNER_EMAIL and NEW_PASSWORD from env only; nothing is printed
 *     except the user id and the restaurant names from their memberships
 *
 * Usage (PowerShell, never commit the values):
 *   $env:OWNER_EMAIL = "owner@example.com"
 *   $env:NEW_PASSWORD = "<at least 10 characters>"
 *   npx tsx scripts/dev-set-owner-password.ts
 */

import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { BCRYPT_COST } from '../src/api/controllers/AuthController';

/** Same minimum the signup form and RestaurantProvisioningService enforce. */
const PASSWORD_MIN_LENGTH = 10;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    fail('Refusing to run: NODE_ENV is production.');
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    fail('Refusing to run: DATABASE_URL is not set.');
  }

  let host: string;
  try {
    host = new URL(dbUrl).hostname;
  } catch {
    return fail('Refusing to run: DATABASE_URL is not a valid URL.');
  }
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
    return fail(`Refusing to run: DATABASE_URL host is "${host}", not localhost/127.0.0.1.`);
  }

  const ownerEmail = process.env.OWNER_EMAIL?.trim();
  const newPassword = process.env.NEW_PASSWORD;

  if (!ownerEmail) {
    fail('Missing environment variable: OWNER_EMAIL is required.');
  }
  if (!newPassword) {
    fail('Missing environment variable: NEW_PASSWORD is required.');
  }
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    fail(`NEW_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }

  const normalizedEmail = ownerEmail.toLowerCase();
  if (newPassword.trim().toLowerCase() === normalizedEmail) {
    fail('NEW_PASSWORD must not be the same as the email.');
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.users.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email_verified_at: true },
    });

    if (!user) {
      fail(`No account found for that email. Sign the owner up through the signup page first.`);
    }

    const memberships = await prisma.memberships.findMany({
      where: { user_id: user.id },
      select: { restaurant: { select: { name: true } } },
      orderBy: { created_at: 'asc' },
    });

    // Unlocks the account and marks the email verified so owner login
    // (users -> memberships -> user_sessions) accepts the new password.
    await prisma.users.update({
      where: { id: user.id },
      data: {
        password_hash: await bcrypt.hash(newPassword, BCRYPT_COST),
        email_verified_at: user.email_verified_at ?? new Date(),
        is_active: true,
        failed_login_count: 0,
        locked_until: null,
      },
    });

    console.log(`user_id: ${user.id}`);
    console.log(
      memberships.length
        ? `restaurants: ${memberships.map((m) => m.restaurant.name).join(', ')}`
        : 'restaurants: none (this account has no membership yet)'
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});