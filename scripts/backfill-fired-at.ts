import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Starting backfill for order_items auditing fields...');

    // 1. Find all items that are NOT in DRAFT status and have NULL fired_at
    const itemsToUpdate = await prisma.order_items.findMany({
        where: {
            fired_at: null,
            item_status: {
                in: ['PENDING', 'PREPARING', 'DONE', 'SERVED']
            }
        },
        include: {
            orders: true
        }
    });

    console.log(`📊 Found ${itemsToUpdate.length} items requiring backfill.`);

    let count = 0;
    const batchSize = 100;

    for (let i = 0; i < itemsToUpdate.length; i += batchSize) {
        const batch = itemsToUpdate.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (item) => {
            // Use order created_at as a fallback for fired_at
            const fallbackDate = item.orders?.created_at || new Date();

            await prisma.order_items.update({
                where: { id: item.id },
                data: {
                    fired_at: fallbackDate,
                    status_updated_at: fallbackDate,
                    // Note: status_updated_by is left null as we cannot reliably attribute past actions
                }
            });
            count++;
        }));

        console.log(`✅ Processed ${count}/${itemsToUpdate.length} items...`);
    }

    console.log('✨ Backfill completed successfully!');
    console.log(`📈 Total items updated: ${count}`);
}

main()
    .catch((e) => {
        console.error('❌ Backfill failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
