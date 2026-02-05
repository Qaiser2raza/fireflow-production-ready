const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tables = await prisma.$queryRaw`
        SELECT tablename 
        FROM pg_catalog.pg_tables 
        WHERE schemaname != 'pg_catalog' 
        AND schemaname != 'information_schema';
    `;
    console.log('--- Database Tables ---');
    console.table(tables);
    await prisma.$disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
