
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugOrder(orderNumber: string) {
  console.log(`[DEBUG] Looking for order: ${orderNumber}`);
  
  const order = await prisma.orders.findFirst({
    where: { order_number: orderNumber },
    include: {
      order_items: {
        include: {
          menu_items: true
        }
      },
      dine_in_orders: true,
      takeaway_orders: true,
      delivery_orders: true
    }
  });

  if (!order) {
    console.log(`[ERROR] Order ${orderNumber} not found.`);
    return;
  }

  console.log(`[ORDER] ID: ${order.id}`);
  console.log(`[ORDER] Status: ${order.status}`);
  console.log(`[ORDER] Type: ${order.type}`);
  console.log(`[ORDER] Created At: ${order.created_at}`);

  console.log(`\n[ITEMS] count: ${order.order_items.length}`);
  order.order_items.forEach((item, index) => {
    console.log(`  Item ${index + 1}: ${item.item_name}`);
    console.log(`    Status: ${item.item_status}`);
    console.log(`    Station ID: ${item.station_id}`);
    console.log(`    Menu Item Station: ${item.menu_items?.station_id}`);
  });

  // Check for fire batches
  const batches = await (prisma as any).fire_batches.findMany({
    where: { order_id: order.id }
  });

  console.log(`\n[FIRE BATCHES] count: ${batches.length}`);
  batches.forEach((b: any, i: number) => {
    console.log(`  Batch ${i + 1}: ID ${b.id}, Status ${b.status}, Created At ${b.created_at}`);
  });
}

const orderNo = process.argv[2];
if (!orderNo) {
  console.log('Usage: npx tsx debug_order_kds.ts <order_number>');
  process.exit(1);
}

debugOrder(orderNo)
  .catch(console.error)
  .finally(() => prisma.$disconnect());
