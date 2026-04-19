import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const orders = await prisma.orders.findMany({
      where: {
        order_number: {
          in: ['#ORD-131721-KG6', '#ORD-193149-TI6']
        }
      },
      select: {
        id: true,
        order_number: true,
        restaurant_id: true,
      }
    });

    console.log(JSON.stringify(orders, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
