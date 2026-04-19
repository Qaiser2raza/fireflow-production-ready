import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function auditOrder() {
    try {
        const orderNumber = 'ORD-04112-05K';
        const order = await prisma.orders.findUnique({
            where: { order_number: orderNumber },
            include: { 
                order_items: true,
                transactions: true,
                dine_in_orders: {
                    include: {
                        tables: true
                    }
                },
                takeaway_orders: true,
                delivery_orders: true
            }
        });
        
        if (!order) {
            console.log(`Order ${orderNumber} not found!`);
            return;
        }

        console.log("--- ORDER AUDIT REPORT ---");
        console.log(`Order Number: ${order.order_number}`);
        console.log(`ID: ${order.id}`);
        console.log(`Status: ${order.status}`);
        console.log(`Payment Status: ${order.payment_status}`);
        console.log(`Order Type: ${order.type}`);
        console.log(`Total: ${order.total}`);
        console.log(`Tax: ${order.tax}`);
        console.log(`Discount: ${order.discount}`);
        console.log(`Service Charge: ${order.service_charge}`);
        console.log(`Created At: ${order.created_at}`);
        console.log(`Updated At: ${order.updated_at}`);
        console.log(`Closed At: ${order.closed_at}`);
        console.log(`Cancelled At: ${order.cancelled_at}`);
        console.log(`Voided At: ${order.voided_at}`);
        console.log(`Session ID: ${order.session_id}`);
        console.log(`Is Deleted: ${order.is_deleted}`);

        if (order.dine_in_orders) {
            console.log("\nDINE-IN DETAILS:");
            console.log(`Table: ${order.dine_in_orders.tables?.name}`);
            console.log(`Guest Count: ${order.dine_in_orders.guest_count}`);
        }

        console.log("\nORDER ITEMS:");
        order.order_items.forEach(item => {
            console.log(`- ${item.item_name} (Qty: ${item.quantity}) Status: ${item.item_status} | Price: ${item.total_price}`);
        });

        console.log("\nTRANSACTIONS:");
        order.transactions.forEach(tx => {
            console.log(`- Ref: ${tx.transaction_ref} | Amount: ${tx.amount} | Method: ${tx.payment_method} | Status: ${tx.status} | Date: ${tx.created_at}`);
        });

        console.log("--------------------------");

    } catch(e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

auditOrder();
