import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function testServe(orderId: string) {
  console.log('Testing mark served for order:', orderId);
  
  // 1. Check current items
  const before = await prisma.order_items.findMany({ where: { order_id: orderId } });
  console.log('Before statuses:', before.map(i => i.item_status));
  
  // 2. Perform the update as my service does
  await prisma.orders.update({
    where: { id: orderId },
    data: { status: 'SERVED' }
  });
  
  const itemsUpdateResult = await prisma.order_items.updateMany({
    where: { order_id: orderId, item_status: { in: ['PENDING', 'PREPARING', 'DONE'] } },
    data: { item_status: 'SERVED' }
  });
  
  console.log('UpdateMany result:', itemsUpdateResult);
  
  // 3. Final check
  const after = await prisma.order_items.findMany({ where: { order_id: orderId } });
  console.log('After statuses:', after.map(i => i.item_status));
}

// Find an active order to test on
async function run() {
  const activeOrder = await prisma.orders.findFirst({ where: { status: { not: 'CLOSED' } } });
  if (activeOrder) {
    await testServe(activeOrder.id);
  } else {
    console.log('No active orders found to test.');
  }
}

run().finally(() => prisma.$disconnect());
