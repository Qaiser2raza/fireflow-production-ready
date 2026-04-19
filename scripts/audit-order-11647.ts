import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    // Find order by order_number pattern
    const order = await prisma.orders.findFirst({
        where: { order_number: { contains: '11647' } },
        include: { order_items: true, transactions: true }
    });

    if (!order) {
        console.log('Order not found, listing all recent orders...');
        const recent = await prisma.orders.findMany({
            orderBy: { created_at: 'desc' },
            take: 5,
            select: { id: true, order_number: true, total: true, status: true, created_at: true }
        });
        console.log(JSON.stringify(recent, null, 2));
        return;
    }

    console.log('=== ORDER ===');
    console.log(`  order_number: ${order.order_number}`);
    console.log(`  total: ${order.total}`);
    console.log(`  tax: ${order.tax}`);
    console.log(`  service_charge: ${order.service_charge}`);
    console.log(`  discount: ${order.discount}`);
    console.log(`  status: ${order.status}`);
    console.log(`  breakdown: ${JSON.stringify(order.breakdown, null, 2)}`);

    console.log('\n=== ORDER ITEMS ===');
    let subtotal = 0;
    order.order_items.forEach((item, i) => {
        const lineTotal = Number(item.unit_price) * item.quantity;
        subtotal += lineTotal;
        console.log(`  [${i}] ${item.item_name}: qty=${item.quantity} x ${item.unit_price} = ${lineTotal} | status=${item.item_status} | variant_id=${item.variant_id || 'none'}`);
    });
    console.log(`  SUBTOTAL (sum of items): ${subtotal}`);

    // Now let's check what the rounding differences would be
    console.log('\n=== ROUNDING CHECK ===');
    console.log(`  Math.round(${subtotal}/10)*10 = ${Math.round(subtotal / 10) * 10}`);
    console.log(`  Math.ceil(${subtotal}/10)*10  = ${Math.ceil(subtotal / 10) * 10}`);
    console.log(`  Stored total: ${order.total}`);
    console.log(`  Breakdown total: ${(order.breakdown as any)?.total}`);
    console.log(`  Breakdown raw_total: ${(order.breakdown as any)?.raw_total}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
