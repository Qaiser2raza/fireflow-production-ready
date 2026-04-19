import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Cleaning Up Stuck Tables & Orders ---');

    console.log('1. Deleting child order records to satisfy constraints...');
    await prisma.dine_in_orders.deleteMany({});
    await prisma.takeaway_orders.deleteMany({});
    await prisma.delivery_orders.deleteMany({});
    await prisma.reservation_orders.deleteMany({});
    await prisma.customer_ledgers.deleteMany({});
    await prisma.order_items.deleteMany({});
    console.log('✓ Deleted child records.');

    console.log('2. Deleting all orders...');
    const ordersDeleted = await prisma.orders.deleteMany({});
    console.log(`✓ Deleted ${ordersDeleted.count} orders.`);

    console.log('2. Deleting all transactions...');
    const txDeleted = await prisma.transactions.deleteMany({});
    console.log(`✓ Deleted ${txDeleted.count} transactions.`);

    console.log('3. Deleting cashier sessions...');
    const sessionsDeleted = await prisma.cashier_sessions.deleteMany({});
    console.log(`✓ Deleted ${sessionsDeleted.count} cashier sessions.`);

    console.log('4. Resetting all floor tables to AVAILABLE...');
    const tablesUpdated = await prisma.tables.updateMany({
        data: {
            status: 'AVAILABLE',
            active_order_id: null
        }
    });
    console.log(`✓ Released ${tablesUpdated.count} tables.`);

    console.log('--- Cleanup Finished ---');
    console.log('You can now refresh the Dine-In Hub in your browser!');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
