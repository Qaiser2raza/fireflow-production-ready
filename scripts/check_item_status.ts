import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkServed() {
  const items = await prisma.order_items.groupBy({
    by: ['item_status'],
    _count: { id: true }
  });
  console.log('--- Order Items Status ---');
  items.forEach(i => console.log(`${i.item_status}: ${i._count.id}`));
}

checkServed().finally(() => prisma.$disconnect());
