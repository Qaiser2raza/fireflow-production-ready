import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.orders.findMany({
    where: { session_id: { not: null } },
    select: { id: true, type: true, status: true, session_id: true, order_number: true, created_at: true },
    take: 5
  });
  console.log("Orders with session_id:", orders);
}
main().finally(() => prisma.$disconnect());
