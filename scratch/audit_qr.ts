import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function audit() {
  const qrOrders = await prisma.orders.findMany({
    where: { type: 'QR' },
    include: { tables: true, order_items: true },
    orderBy: { created_at: 'desc' },
    take: 10
  });

  const activeOrders = await prisma.orders.findMany({
    where: { status: 'ACTIVE', type: 'DINE_IN' },
    include: { tables: true, order_items: true },
    orderBy: { created_at: 'desc' },
    take: 5
  });

  const tables = await prisma.tables.findMany({
    where: { status: 'OCCUPIED' },
    select: { id: true, name: true, status: true, active_order_id: true }
  });

  console.log('\n=== LOCAL QR ORDERS (any status) ===');
  console.log(JSON.stringify(qrOrders.map((o: any) => ({
    id: o.id,
    status: o.status,
    table_id: o.table_id,
    table_name: o.tables?.name || 'NULL',
    order_number: o.order_number,
    payment_status: o.payment_status,
    items: o.order_items.length,
    item_statuses: [...new Set(o.order_items.map((i: any) => i.item_status))]
  })), null, 2));

  console.log('\n=== ACTIVE DINE_IN ORDERS ===');
  console.log(JSON.stringify(activeOrders.map((o: any) => ({
    id: o.id,
    status: o.status,
    table_id: o.table_id,
    table_name: o.tables?.name || 'NULL',
    order_number: o.order_number,
    payment_status: o.payment_status,
    items: o.order_items.length,
    item_statuses: [...new Set(o.order_items.map((i: any) => i.item_status))]
  })), null, 2));

  console.log('\n=== OCCUPIED TABLES ===');
  console.log(JSON.stringify(tables, null, 2));

  await prisma.$disconnect();
}

audit().catch(console.error);
