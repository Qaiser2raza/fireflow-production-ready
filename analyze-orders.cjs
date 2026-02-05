const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyze() {
    try {
        const orders = await prisma.orders.findMany({
            include: {
                table: true
            },
            orderBy: { created_at: 'desc' }
        });

        console.log(`--- Order Analysis Summary ---`);
        console.log(`Total Orders: ${orders.length}`);

        const dineInMissingTable = orders.filter(o => o.type === 'DINE_IN' && !o.table_id);
        console.log(`DINE_IN orders missing table_id: ${dineInMissingTable.length}`);

        const idCounts = {};
        orders.forEach(o => { idCounts[o.id] = (idCounts[o.id] || 0) + 1; });
        const duplicateIds = Object.keys(idCounts).filter(id => idCounts[id] > 1);
        console.log(`Duplicate IDs in DB: ${duplicateIds.length}`);

        // Check for logical duplicates: same number or same exact timing/items
        const logicalGroups = {};
        orders.forEach(o => {
            // Round time to seconds to account for slight millisecond drift if any
            const time = new Date(o.created_at).getTime();
            const key = `${o.type}_${o.total}_${o.customer_phone || 'none'}_${Math.floor(time / 1000)}`;
            logicalGroups[key] = logicalGroups[key] || [];
            logicalGroups[key].push(o);
        });

        let logicalDupCount = 0;
        Object.keys(logicalGroups).forEach(key => {
            if (logicalGroups[key].length > 1) {
                logicalDupCount += (logicalGroups[key].length - 1);
                console.log(`\nPotential logical duplicate group found:`);
                logicalGroups[key].forEach(o => {
                    console.log(`  - ID: ${o.id}, Num: ${o.order_number}, Type: ${o.type}, Total: ${o.total}, Created: ${o.created_at.toISOString()}`);
                });
            }
        });
        console.log(`\nPotential logical duplicates: ${logicalDupCount}`);

        console.log(`\n--- Recommendations ---`);
        console.log(`1. Fix Socket listener to check 'prev.some(o => o.id === data.id)' before inserting.`);
        console.log(`2. Add validation in POS to require Table selection for Dine-In orders.`);
        console.log(`3. Clean up script should delete the newer records in logical duplicate groups.`);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

analyze();
