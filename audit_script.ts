import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const recentOrders = await prisma.orders.findMany({
    orderBy: { created_at: 'desc' },
    take: 3,
    include: {
      transactions: true,
      customer_ledger: true
    }
  });

  const orderIds = recentOrders.map(o => o.id);

  const ledgerEntries = await prisma.ledger_entries.findMany({
    where: { reference_id: { in: orderIds } }
  });

  const journalEntries = await prisma.journal_entries.findMany({
    where: { reference_id: { in: orderIds } },
    include: { lines: true }
  });

  console.log("\n=== Found Last 3 Orders ===");
  console.log(JSON.stringify(recentOrders, null, 2));

  console.log("\n=== Ledger Entries for these orders ===");
  console.log(JSON.stringify(ledgerEntries, null, 2));

  console.log("\n=== Journal Entries for these orders ===");
  console.log(JSON.stringify(journalEntries, null, 2));
}

run()
  .catch(e => { console.error(e); })
  .finally(() => prisma.$disconnect());
