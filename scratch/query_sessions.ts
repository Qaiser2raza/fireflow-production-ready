import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.orders.findMany({
    where: { status: 'CLOSED' },
    select: { id: true, type: true, total: true, service_charge: true, session_id: true, order_number: true, created_at: true },
    orderBy: { created_at: 'desc' },
    take: 5
  });
  console.log("Orders:", orders);

  const sessions = await prisma.cashier_sessions.findMany({
    take: 2,
    orderBy: { opened_at: 'desc' },
    include: { orders: { select: { id: true, order_number: true } } }
  });
  console.log("Recent sessions:", JSON.stringify(sessions, null, 2));
}
main().finally(() => prisma.$disconnect());
