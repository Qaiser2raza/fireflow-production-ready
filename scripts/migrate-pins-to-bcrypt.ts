// scripts/migrate-pins-to-bcrypt.ts
/**
 * One-time migration script to hash all plaintext PINs into hashed_pin column
 * Run with: npm run migrate:pins
 *
 * Safety checks:
 * - Skips staff with already-hashed PINs
 * - Creates audit log entry for each migration
 * - Dry run recommended first (comment out update calls)
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12; // NIST recommendation for interactive auth

async function migratePinsToHashed() {
  console.log('🔐 Starting PIN hashing migration...');
  console.log(`   Salt rounds: ${SALT_ROUNDS} (security vs performance balanced)`);
  console.log(`   Using transactions for atomicity & rollback safety\n`);

  try {
    // Find all staff with plaintext PIN but no hashed_pin
    const staffToMigrate = await prisma.staff.findMany({
      where: {
        pin: { not: null },
        hashed_pin: null
      },
      select: {
        id: true,
        pin: true,
        restaurant_id: true,
        name: true
      }
    });

    if (staffToMigrate.length === 0) {
      console.log('✅ No staff need PIN hashing — all already migrated or schema not yet applied');
      process.exit(0);
    }

    console.log(`📊 Found ${staffToMigrate.length} staff records to migrate`);
    console.log(`   Average hash time: ~${SALT_ROUNDS * 10}ms per record\n`);

    let successCount = 0;
    let failedCount = 0;
    const failedStaff: { name: string; id: string; error: string }[] = [];

    // Pre-hash all PINs before transaction to avoid timeouts
    console.log('⏳ Pre-hashing all PINs...');
    const hashMap = new Map<string, string>();
    for (const staff of staffToMigrate) {
      try {
        const hashedPin = await bcrypt.hash(staff.pin!, SALT_ROUNDS);
        hashMap.set(staff.id, hashedPin);
      } catch (err: any) {
        failedCount++;
        const errorMsg = err.message || String(err);
        failedStaff.push({
          name: staff.name,
          id: staff.id,
          error: errorMsg
        });
        console.error(`  ❌ Hashing failed for ${staff.name}: ${errorMsg}`);
      }
    }

    console.log(`✅ Hashed ${hashMap.size} PINs successfully\n`);

    if (hashMap.size === 0) {
      console.error('❌ No PINs could be hashed. Aborting migration.');
      process.exit(1);
    }

    // Execute atomic transaction: update all records + create audit logs
    console.log('🔄 Executing atomic transaction...');
    await prisma.$transaction(async (tx) => {
      for (const staff of staffToMigrate) {
        // Skip if hash failed during pre-hashing
        if (!hashMap.has(staff.id)) continue;

        const hashedPin = hashMap.get(staff.id)!;

        // Update staff record with hashed PIN (within transaction)
        await tx.staff.update({
          where: { id: staff.id },
          data: { hashed_pin: hashedPin }
        });

        // Create audit log entry (within transaction - rolls back if update fails)
        await tx.audit_logs.create({
          data: {
            restaurant_id: staff.restaurant_id,
            staff_id: staff.id,
            action_type: 'PIN_HASH_MIGRATION',
            entity_type: 'STAFF',
            entity_id: staff.id,
            details: {
              name: staff.name,
              migrated_at: new Date().toISOString(),
              hash_rounds: SALT_ROUNDS
            }
          }
        });

        successCount++;
        console.log(`  ✅ ${staff.name} (${staff.id})`);
      }
    });

    console.log(`\n📊 Migration complete:`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed (pre-hashing): ${failedCount}`);

    if (failedCount > 0) {
      console.log(`\n⚠️ Pre-hashing failures (no database changes):`);
      failedStaff.forEach(item => {
        console.log(`   - ${item.name}: ${item.error}`);
      });
    }

    console.log(`\n✨ PIN hashing migration complete!`);
    console.log(`\n📋 Next steps:`);
    console.log(`   1. ✅ Run: npm run migrate:pins`);
    console.log(`   2. 🧪 Test login with 1-2 staff (should use bcrypt path, no warnings)`);
    console.log(`   3. 📊 Check audit logs: SELECT COUNT(*) FROM audit_logs WHERE action_type = 'PIN_HASH_MIGRATION'`);
    console.log(`   4. ⏳ Monitor for 48 hours (watch for legacy auth warnings in logs)`);
    console.log(`   5. 🧹 After 48h with no issues, run cleanup migration to drop plaintext 'pin' column`);
    console.log(`\n🔄 Grace period status:`);
    console.log(`   - New logins use bcrypt (preferred)`);
    console.log(`   - Old plaintext PINs still work (fallback)`);
    console.log(`   - Audit logs track all login methods`);
    console.log(`   - After 48h, run: npx prisma migrate dev --name drop_plaintext_pin\n`);

  } catch (err: any) {
    console.error('❌ Fatal error during migration:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migratePinsToHashed();
