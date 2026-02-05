const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const allSections = await prisma.sections.findMany();
    console.log('All Sections:', JSON.stringify(allSections, null, 2));

    const allTables = await prisma.tables.findMany();
    console.log('All Tables:', JSON.stringify(allTables, null, 2));
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
