import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function inspect() {
    try {
        const order = await prisma.orders.findFirst({
            where: { order_number: 'ORD-21354-6EJ' },
            include: { order_items: true, restaurants: { include: { order_type_defaults: true } } }
        });
        
        if (!order) {
            console.log('Order not found!');
            return;
        }

        console.log("ORDER DATA:", JSON.stringify({
            id: order.id,
            total: order.total?.toString(),
            tax: order.tax?.toString(),
            service_charge: order.service_charge?.toString(),
            discount: order.discount?.toString(),
            tax_type: order.tax_type,
            tax_exempt: order.tax_exempt,
            breakdown: order.breakdown,
            status: order.status
        }, null, 2));

        console.log("\nORDER ITEMS:");
        order.order_items.forEach(item => {
            console.log(`- ${item.item_name} (Qty: ${item.quantity}) | Unit: ${item.unit_price} | Total: ${item.total_price}`);
        });

        console.log("\nCONFIG:");
        console.log(JSON.stringify(order.restaurants.order_type_defaults.filter(o => o.order_type === 'DINE_IN'), null, 2));
    } catch(e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

inspect();
