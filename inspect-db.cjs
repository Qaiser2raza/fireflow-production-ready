const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const staff = await prisma.staff.findMany({
        select: {
            id: true,
            name: true,
            pin: true,
            status: true
        }
    });
    console.log('--- Current Staff ---');
    console.table(staff);
    await prisma.$disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
