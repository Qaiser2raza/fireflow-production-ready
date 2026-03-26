// scripts/sync_customer_ledgers.mjs
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function syncLedgers() {
    console.log('--- Starting retroactive customer ledger sync ---');

    // 1. Find all orders that have a customer_id but are not in customer_ledgers
    // In the legacy system, earlier Khata orders were just saved with a customer_id
    // but without payment_method='CREDIT' and without posting to the ledger.
    const orders = await prisma.orders.findMany({
        where: {
            customer_id: { not: null },
            payment_status: 'UNPAID', // usually means it hasn't been paid via cash/card
        },
        include: {
            customers: true,
            transactions: true
        }
    });

    console.log(`Found ${orders.length} potential credit orders to sync...`);

    let syncedCount = 0;

    for (const order of orders) {
        // Skip if already in the true customer ledger
        const existingLedger = await prisma.customer_ledgers.findFirst({
            where: { order_id: order.id }
        });

        if (existingLedger) {
            console.log(`Order ${order.order_number} already in ledger. Skipping.`);
            continue;
        }

        // Check if there are ANY PAID transactions. If so, it's not a true credit sale,
        // or a partial payment was made. If purely pending, we assume it's Khata.
        const paidTx = order.transactions.find(t => t.status === 'PAID');
        if (paidTx) continue;

        console.log(`Syncing Order ${order.order_number} for customer ${order.customer?.name}...`);
        
        const amount = new Decimal(order.total || 0);
        
        // Ensure order is flagged as CREDIT
        await prisma.orders.update({
            where: { id: order.id },
            data: { payment_method: 'CREDIT' }
        });

        // 1. Customer Ledger Entry
        const currentBalance = await prisma.customer_ledgers.findFirst({
            where: {
                restaurant_id: order.restaurant_id,
                customer_id: order.customer_id
            },
            orderBy: { created_at: 'desc' }
        });

        const newBalance = currentBalance 
            ? new Decimal(currentBalance.balance_after).plus(amount)
            : amount;

        await prisma.customer_ledgers.create({
            data: {
                restaurant_id: order.restaurant_id,
                customer_id: order.customer_id,
                order_id: order.id,
                entry_type: 'CHARGE',
                amount: amount,
                balance_after: newBalance,
                description: `Retroactive sync: Order #${order.order_number || order.id.slice(-6)}`,
                processed_by: order.last_action_by || 'system'
            }
        });

        // 2. Legacy Ledger Entry
        await prisma.ledger_entries.create({
            data: {
                restaurant_id: order.restaurant_id,
                account_id: order.customer_id,
                transaction_type: 'DEBIT',
                amount: amount,
                reference_type: 'ORDER',
                reference_id: order.id,
                description: `Credit Sale (Khata) – Order #${order.order_number || order.id.slice(-6)}`,
                processed_by: order.last_action_by || 'system'
            }
        });

        syncedCount++;
    }

    console.log(`--- Sync completed. Synced ${syncedCount} orders. ---`);
    process.exit(0);
}

syncLedgers().catch(e => {
    console.error(e);
    process.exit(1);
});
