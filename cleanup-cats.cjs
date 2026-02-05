const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const categories = await prisma.menu_categories.findMany();
    const seen = new Map();
    const toDelete = [];

    for (const cat of categories) {
        const key = `${cat.restaurant_id}:${cat.name.toLowerCase().trim()}`;
        if (seen.has(key)) {
            const original = seen.get(key);
            console.log(`Duplicate found: "${cat.name}" (ID: ${cat.id}) matches "${original.name}" (ID: ${original.id})`);
            toDelete.push(cat.id);

            // Re-assign items from duplicate to original
            await prisma.menu_items.updateMany({
                where: { category_id: cat.id },
                data: { category_id: original.id }
            });
        } else {
            seen.set(key, cat);
        }
    }

    if (toDelete.length > 0) {
        console.log(`Deleting ${toDelete.length} duplicates...`);
        await prisma.menu_categories.deleteMany({
            where: { id: { in: toDelete } }
        });
        console.log('Done.');
    } else {
        console.log('No duplicates found in DB.');
    }

    await prisma.$disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
