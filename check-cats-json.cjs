const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const categories = await prisma.menu_categories.findMany();
    console.log('CATEGORIES_START');
    console.log(JSON.stringify(categories, null, 2));
    console.log('CATEGORIES_END');

    const items = await prisma.menu_items.findMany({ take: 10 });
    console.log('ITEMS_START');
    console.log(JSON.stringify(items, null, 2));
    console.log('ITEMS_END');

    await prisma.$disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
