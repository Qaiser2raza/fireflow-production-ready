import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.orders.findMany({
    where: { status: 'CLOSED' },
    select: { id: true, type: true, total: true, service_charge: true, order_number: true, created_at: true },
    orderBy: { created_at: 'desc' },
    take: 10
  });
  console.log(orders);
}
main().finally(() => prisma.$disconnect());
