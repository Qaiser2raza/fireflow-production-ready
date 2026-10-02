/**
 * DEV ONLY, never deploy.
 *
 * Local-only helper that gives a signup owner an email + password on the
 * existing `staff` row so the owner can log in while the real signup/identity
 * flow (users + memberships) is still being built.
 *
 * Guards:
 *   - refuses to run when NODE_ENV=production
 *   - refuses to run when DATABASE_URL does not point at localhost/127.0.0.1
 *   - refuses to run when the owner cannot be resolved unambiguously
 *
 * Usage (PowerShell, never commit the values):
 *   $env:OWNER_EMAIL = "owner@example.com"
 *   $env:NEW_PASSWORD = "<strong password>"
 *   npx tsx scripts/dev-set-owner-password.ts
 *
 * Env vars: OWNER_EMAIL, NEW_PASSWORD. No secrets are read from or written to files.
 */

import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const BCRYPT_COST = 14;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

type ResolvedOwner = {
  staffId: string;
  restaurantId: string;
  restaurantName: string;
  path: string;
};

async function resolveOwner(prisma: PrismaClient, email: string): Promise<ResolvedOwner> {
  // Path A: unique owner_invites row for the email -> the restaurant's MANAGER staff.
  const invites = await prisma.owner_invites.findMany({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, restaurant_id: true, restaurants: { select: { id: true, name: true } } }
  });

  if (invites.length > 1) {
    fail(
      `Ambiguous owner: ${invites.length} owner_invites rows match "${email}" ` +
        `(restaurants: ${invites.map(i => i.restaurants.name).join(', ')}). Refusing to guess.`
    );
  }

  if (invites.length === 1) {
    const invite = invites[0];
    const managers = await prisma.staff.findMany({
      where: { restaurant_id: invite.restaurant_id, role: 'MANAGER' },
      select: { id: true }
    });
    if (managers.length === 0) {
      fail(`Owner invite found for "${email}" but restaurant "${invite.restaurants.name}" has no staff with role MANAGER.`);
    }
    if (managers.length > 1) {
      fail(
        `Owner invite found for "${email}" but restaurant "${invite.restaurants.name}" has ` +
          `${managers.length} MANAGER staff rows. Refusing to guess which one is the owner.`
      );
    }
    return {
      staffId: managers[0].id,
      restaurantId: invite.restaurant_id,
      restaurantName: invite.restaurants.name,
      path: 'owner_invites.email'
    };
  }

  // Path B: fallback to a staff row that already carries this email.
  const staffByEmail = await prisma.staff.findMany({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, restaurant_id: true, restaurants: { select: { name: true } } }
  });

  if (staffByEmail.length === 1) {
    return {
      staffId: staffByEmail[0].id,
      restaurantId: staffByEmail[0].restaurant_id,
      restaurantName: staffByEmail[0].restaurants.name,
      path: 'staff.email'
    };
  }

  if (staffByEmail.length > 1) {
    fail(
      `Ambiguous owner: ${staffByEmail.length} staff rows match "${email}" ` +
        `(restaurants: ${staffByEmail.map(s => s.restaurants.name).join(', ')}). Refusing to guess.`
    );
  }

  // Path C: no email record anywhere -> only safe when a single tenant exists.
  const restaurants = await prisma.restaurants.findMany({ select: { id: true, name: true } });
  if (restaurants.length !== 1) {
    fail(
      `No owner_invites or staff row matches "${email}", and the database holds ${restaurants.length} restaurants. ` +
        `Set OWNER_EMAIL to the owner's exact email.`
    );
  }

  const sole = restaurants[0];
  const managers = await prisma.staff.findMany({
    where: { restaurant_id: sole.id, role: 'MANAGER' },
    select: { id: true }
  });
  if (managers.length !== 1) {
    fail(
      `No email record matched, and restaurant "${sole.name}" has ${managers.length} MANAGER staff rows. Refusing to guess.`
    );
  }
  return { staffId: managers[0].id, restaurantId: sole.id, restaurantName: sole.name, path: 'sole restaurant MANAGER' };
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
  if (newPassword.length < 8) {
    fail('NEW_PASSWORD must be at least 8 characters.');
  }

  const prisma = new PrismaClient();
  try {
    const owner = await resolveOwner(prisma, ownerEmail);
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

    await prisma.staff.update({
      where: { id: owner.staffId },
      data: {
        email: ownerEmail.toLowerCase(),
        password_hash: passwordHash,
        is_email_verified: true,
        must_change_password: false,
        failed_login_count: 0,
        locked_until: null
      }
    });

    console.log(`Resolved via: ${owner.path}`);
    console.log(`staff_id: ${owner.staffId}`);
    console.log(`restaurant: ${owner.restaurantName}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Unexpected error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});