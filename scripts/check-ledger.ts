import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const prisma = new PrismaClient();
async function main() {
  const entry = await prisma.customer_ledgers.findFirst({
    orderBy: { created_at: 'desc' }
  });
  fs.writeFileSync('ledger-debug.json', JSON.stringify(entry, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
