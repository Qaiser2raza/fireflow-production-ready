import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  try {
    const orders = await prisma.orders.findMany({
      take: 1,
      include: {
        order_items: true,
        dine_in_orders: true,
        takeaway_orders: true,
        delivery_orders: true
      }
    });
    console.log('Success:', orders.length);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
