import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const orders = await prisma.orders.findMany({
      where: {
        created_at: {
          gt: twoHoursAgo
        }
      },
      include: {
        order_items: true,
        delivery_orders: true,
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    console.log(JSON.stringify(orders.map(o => ({
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      type: o.type,
      items: o.order_items.map(i => ({ name: i.item_name, status: i.item_status, station: i.station_id }))
    })), null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
