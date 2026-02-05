const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clean() {
    try {
        console.log('--- Order Cleanup Started ---');

        // 1. Delete DINE_IN orders without a table_id
        const invalidDineIn = await prisma.orders.deleteMany({
            where: {
                type: 'DINE_IN',
                table_id: null
            }
        });
        console.log(`Deleted ${invalidDineIn.count} invalid DINE_IN orders (missing table_id).`);

        // 2. Delete logical duplicates (optional / if found)
        // Note: Analysis found 0logical duplicates in DB, 
        // but here is how you would do it:
        /*
        const orders = await prisma.orders.findMany({ orderBy: { created_at: 'asc' } });
        const seen = new Set();
        for (const o of orders) {
          const key = `${o.type}_${o.total}_${o.customer_phone}_${Math.floor(o.created_at.getTime()/1000)}`;
          if (seen.has(key)) {
             await prisma.orders.delete({ where: { id: o.id } });
          } else {
             seen.add(key);
          }
        }
        */

        console.log('--- Cleanup Finished ---');
    } catch (e) {
        console.error('Cleanup failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

clean();
