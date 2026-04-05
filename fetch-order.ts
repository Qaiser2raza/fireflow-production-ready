import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const order = await prisma.orders.findFirst({
    where: { order_number: 'ORD-205548-NXQ' },
    include: { order_items: true, transactions: true }
  });
  console.log(JSON.stringify(order, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
