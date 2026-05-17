import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const orders = await p.orders.findMany({
  where: { 
    restaurant_id: 'b1972d7d-8374-4b55-9580-95a15f18f656',
    type: 'DELIVERY',
    status: { not: 'CLOSED' }
  },
  orderBy: { created_at: 'desc' },
  take: 3,
  include: { order_items: true }
});
orders.forEach(o => {
  console.log('Number:', o.order_number, '| Status:', o.status);
  console.log('Items:', o.order_items.length);
  o.order_items.forEach(i => 
    console.log(' -', i.item_name, '| status:', i.item_status, '| created:', i.created_at)
  );
});
await p.$disconnect();
