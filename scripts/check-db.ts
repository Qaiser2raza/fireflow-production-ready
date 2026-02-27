import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkResources() {
    const restaurants = await prisma.restaurants.findMany();
    console.log('RESTAURANTS:', restaurants);

    const superAdmins = await prisma.staff.findMany({ where: { role: 'SUPER_ADMIN' } });
    console.log('SUPER_ADMINS:', superAdmins);

    await prisma.$disconnect();
}

checkResources();
