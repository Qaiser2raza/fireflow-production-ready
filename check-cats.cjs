const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const categories = await prisma.menu_categories.findMany({
        select: {
            id: true,
            name: true,
            restaurant_id: true
        }
    });
    console.log('--- Menu Categories ---');
    console.table(categories);

    const itemsWithCats = await prisma.menu_items.findMany({
        select: {
            name: true,
            category: true,
            category_id: true
        },
        take: 20
    });
    console.log('--- Menu Items (Sample) ---');
    console.table(itemsWithCats);

    await prisma.$disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
