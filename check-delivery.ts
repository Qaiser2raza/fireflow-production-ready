import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const orders = await p.orders.findMany({
  where: { 
    restaurant_id: 'b1972d7d-8374-4b55-9580-95a15f18f656',
    type: 'DELIVERY'
  },
  orderBy: { created_at: 'desc' },
  take: 5,
  include: {
    order_items: true
  }
});
orders.forEach(o => {
  console.log('---');
  console.log('Number:', o.order_number);
  console.log('Status:', o.status);
  console.log('Items:', o.order_items.length);
  o.order_items.forEach(i => 
    console.log(' -', i.item_name, '|', i.item_status)
  );
});
await p.$disconnect();
