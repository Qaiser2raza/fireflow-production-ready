import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkKDSMissing() {
  const lastOrders = await prisma.orders.findMany({
    take: 5,
    orderBy: { created_at: 'desc' },
    include: {
      order_items: {
        include: {
          menu_items: true
        }
      }
    }
  });

  console.log('--- RECENT ORDERS ---');
  lastOrders.forEach(o => {
    console.log(`Order: ${o.id}, Status: ${o.status}, Type: ${o.type}`);
    (o.order_items || []).forEach(item => {
      console.log(`  Item: ${item.item_name}, Status: ${item.item_status}, Station: ${item.station_id || item.station}`);
    });
  });
}

checkKDSMissing().finally(() => prisma.$disconnect());
