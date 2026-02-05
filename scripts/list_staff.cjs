const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const staff = await prisma.staff.findMany({
        where: { restaurant_id: 'f1f3108a-ef06-49ac-b168-3505bb816236' }
    });
    console.log(JSON.stringify(staff, null, 2));
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
