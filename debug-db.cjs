const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
dotenv.config();

console.log('Using DATABASE_URL:', process.env.DATABASE_URL);

const prisma = new PrismaClient();

async function main() {
    console.log('--- Database Stats ---');
    const rCount = await prisma.restaurants.count();
    const sCount = await prisma.staff.count();
    console.log('Restaurants:', rCount);
    console.log('Staff:', sCount);

    if (rCount > 0) {
        const restaurants = await prisma.restaurants.findMany();
        console.table(restaurants.map(r => ({ id: r.id, name: r.name, slug: r.slug })));
    }

    if (sCount > 0) {
        const staff = await prisma.staff.findMany();
        console.table(staff.map(s => ({ id: s.id, name: s.name, role: s.role, pin: s.pin })));
    }

    await prisma.$disconnect();
}

main().catch(err => {
    console.error('Inspection failed:', err);
    process.exit(1);
});
