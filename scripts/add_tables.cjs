const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const restaurant_id = 'f1f3108a-ef06-49ac-b168-3505bb816236';
    const section_id = 'efe20017-3aaf-416e-9bda-ee9ee7898980';

    const tables = [
        { name: 'T-02', capacity: 4 },
        { name: 'T-03', capacity: 2 },
        { name: 'T-04', capacity: 6 },
        { name: 'T-05', capacity: 4 },
    ];

    for (const tableData of tables) {
        try {
            const table = await prisma.tables.create({
                data: {
                    ...tableData,
                    restaurant_id,
                    section_id,
                    status: 'AVAILABLE'
                }
            });
            console.log(`Created table ${table.name}`);
        } catch (error) {
            console.error(`Failed to create table ${tableData.name}: ${error.message}`);
        }
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
