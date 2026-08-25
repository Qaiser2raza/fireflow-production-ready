#!/usr/bin/env node
// Phase O O2 — pre-run baseline capture.
// Run BEFORE the onboarding session starts. Outputs JSON snapshot of
// authority-boundary tables so the post-run diff is quantitative, not qualitative.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(__dirname, '..', 'scratch', `o2_baseline_${ts}.json`);

  // Use the restaurant bound to the current dev session, or fall back to the
  // first ACTIVE restaurant if the binding is missing.
  let restaurantId = process.env.RESTAURANT_ID;
  if (!restaurantId) {
    const first = await prisma.restaurants.findFirst({ where: { subscription_status: 'ACTIVE' }, select: { id: true } });
    restaurantId = first?.id;
  }
  if (!restaurantId) {
    console.error('[O2] FATAL: no RESTAURANT_ID env and no ACTIVE restaurant found');
    process.exit(1);
  }

  const snapshot = {
    captured_at: new Date().toISOString(),
    restaurant_id: restaurantId,
    counts: {
      license_keys: await prisma.license_keys.count(),
      journal_entries: await prisma.journal_entries.count({ where: { restaurant_id: restaurantId } }),
      ledger_entries: await prisma.ledger_entries.count({ where: { restaurant_id: restaurantId } }),
      transactions: await prisma.transactions.count({ where: { restaurant_id: restaurantId } }),
      orders: await prisma.orders.count({ where: { restaurant_id: restaurantId } }),
      integration_deliveries: await prisma.integration_deliveries.count(),
    },
    restaurant: await prisma.restaurants.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, subscription_status: true, subscription_plan: true, is_active: true },
    }),
  };

  const fs = require('fs');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`[O2] baseline written to ${outPath}`);
  console.log(JSON.stringify(snapshot, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(e => { console.error('[O2] FATAL:', e.message); process.exit(1); });
