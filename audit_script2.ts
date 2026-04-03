import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const latestCustomerLedger = await prisma.customer_ledgers.findMany({
    orderBy: { created_at: 'desc' },
    take: 5
  });
  console.log("=== Customer Ledgers ===");
  console.log(JSON.stringify(latestCustomerLedger, null, 2));
}

run()
  .catch(e => { console.error(e); })
  .finally(() => prisma.$disconnect());
