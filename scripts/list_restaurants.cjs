const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const restaurants = await prisma.restaurants.findMany();
    console.log(JSON.stringify(restaurants, null, 2));
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
