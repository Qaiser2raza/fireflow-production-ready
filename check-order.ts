import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const order = await p.orders.findFirst({
  where: { order_number: 'ORD-125920-P0H' },
  include: {
    order_items: { orderBy: { created_at: 'asc' } },
    takeaway_orders: true
  }
});
console.log('Status:', order?.status);
console.log('Type:', order?.type);
console.log('Items count:', order?.order_items?.length);
order?.order_items?.forEach(i => 
  console.log(' -', i.item_name, '| status:', i.item_status, '| qty:', i.quantity)
);
await p.$disconnect();
