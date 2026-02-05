const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tables = await prisma.tables.findMany({
        where: { section_id: 'efe20017-3aaf-416e-9bda-ee9ee7898980' }
    });
    console.log(JSON.stringify(tables, null, 2));
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
