import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🗑️  Starting Full Order Cleanup...');

    try {
        // Delete extensions first (reverse dependency order if cascade not reliable)
        // Actually, order_items depends on orders? No, usually other way or cascade.
        // Let's delete detail tables first to be safe.

        console.log('   - Deleting extension tables...');
        await prisma.dine_in_orders.deleteMany({});
        await prisma.takeaway_orders.deleteMany({});
        await prisma.delivery_orders.deleteMany({});
        await prisma.reservation_orders.deleteMany({});
        await prisma.order_items.deleteMany({});

        console.log('   - Deleting core orders...');
        await prisma.orders.deleteMany({});

        console.log('   - Resetting active orders on tables...');
        await prisma.tables.updateMany({
            data: {
                active_order_id: null,
                status: 'AVAILABLE'
            }
        });

        console.log('✅ CLEANUP COMPLETE. All orders deleted and tables reset.');

        // Count menu items while we are here
        const menuCount = await prisma.menu_items.count();
        console.log(`ℹ️  Menu Items Count: ${menuCount}`);
        if (menuCount > 0) {
            const sample = await prisma.menu_items.findFirst();
            console.log('ℹ️  Sample Menu Item:', JSON.stringify(sample, null, 2));
        }

    } catch (error) {
        console.error('❌ Error during cleanup:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
