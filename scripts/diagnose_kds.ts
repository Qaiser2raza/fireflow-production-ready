import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("--- QUERYING ORDER ORD-8750-C7P ---");
    const order = await prisma.orders.findFirst({
        where: { order_number: 'ORD-8750-C7P' },
        include: {
            order_items: {
                orderBy: { created_at: 'asc' }
            },
            dine_in_orders: true
        }
    });

    if (!order) {
        console.log("Order not found!");
        return;
    }

    console.log(`Order ID: ${order.id}`);
    console.log("Items:");
    order.order_items.forEach(item => {
        console.log(`- ID: ${item.id} | Status: ${item.item_status} | Created: ${item.created_at} | Name: ${item.item_name}`);
    });

    console.log("\n--- AUDIT LOGS FOR THIS ORDER ---");
    const logs = await prisma.audit_logs.findMany({
        where: { entity_id: order.id },
        orderBy: { created_at: 'asc' }
    });
    
    if (logs.length === 0) {
        console.log("No audit logs found for this order.");
    } else {
        logs.forEach(log => {
            console.log(`- [${log.created_at}] Action: ${log.action_type} | Details: ${JSON.stringify(log.details)}`);
        });
    }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
