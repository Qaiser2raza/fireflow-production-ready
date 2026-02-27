import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function createSuperAdmin() {
    console.log('🏗️ Creating Super Admin account...');

    // 1. Create or find HQ Restaurant
    const restaurant = await prisma.restaurants.upsert({
        where: { slug: 'fireflow-hq' },
        update: {},
        create: {
            name: 'Fireflow HQ',
            slug: 'fireflow-hq',
            currency: 'PKR',
            address: 'System Management',
            phone: '0000000000',
            is_active: true,
            subscription_status: 'active',
            subscription_plan: 'PREMIUM',
        },
    });

    console.log('✅ HQ Restaurant:', restaurant.id);

    // 2. Create Super Admin Staff
    // Search for existing first to avoid duplicates since we can't use a fixed non-UUID ID
    let existingAdmin = await prisma.staff.findFirst({
        where: {
            role: 'SUPER_ADMIN',
            name: 'SaaS Owner'
        }
    });

    if (existingAdmin) {
        await prisma.staff.update({
            where: { id: existingAdmin.id },
            data: {
                pin: '9999',
                status: 'active'
            }
        });
    } else {
        await prisma.staff.create({
            data: {
                restaurant_id: restaurant.id,
                name: 'SaaS Owner',
                role: 'SUPER_ADMIN',
                pin: '9999',
                status: 'active'
            }
        });
    }

    console.log('✅ Super Admin created with PIN 9999');

    await prisma.$disconnect();
}

createSuperAdmin();
