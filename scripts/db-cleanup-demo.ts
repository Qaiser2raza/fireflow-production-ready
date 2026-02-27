import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('--- Database Cleanup Started ---');

    // 1. Get all restaurants
    const restaurants = await prisma.restaurants.findMany();
    console.log(`Found ${restaurants.length} restaurants.`);

    // 2. Identify and keep HQ if it exists (previous conversations mentioned HQ)
    // or just wipe all if we want a fresh demo.
    // User said "remove all others" and "create a new demo restaurant".

    // To avoid foreign key issues, we might need to be careful, 
    // but Cascade onDelete should handle it if defined in Prisma.

    for (const r of restaurants) {
        console.log(`Deleting restaurant: ${r.name} (${r.id})`);
        try {
            // Deleting a restaurant should cascade to staff, orders, etc.
            await prisma.restaurants.delete({ where: { id: r.id } });
        } catch (err) {
            console.error(`Failed to delete ${r.name}:`, err);
        }
    }

    // 3. Create Demo Restaurant
    console.log('Creating new Demo Restaurant...');
    const demoRestaurant = await prisma.restaurants.upsert({
        where: { slug: 'demo-restaurant' },
        update: {},
        create: {
            name: 'Demo Restaurant',
            slug: 'demo-restaurant',
            phone: '0300-1234567',
            address: '123 Demo Street, Tech City',
            subscription_status: 'active',
            subscription_plan: 'ENTERPRISE',
            created_at: new Date(),
            updated_at: new Date()
        }
    });
    console.log(`Demo Restaurant created/verified: ${demoRestaurant.id}`);

    // 4. Create license key for this restaurant
    console.log('Creating License Key...');
    const license = await prisma.license_keys.create({
        data: {
            restaurant_id: demoRestaurant.id,
            license_key: `FIRE-${Math.random().toString(36).substring(2, 10).toUpperCase()}-FLOW`,
            is_active: true,
            license_type: 'ENTERPRISE',
            device_limit: 5,
            expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
        }
    });
    console.log(`License Key generated: ${license.license_key}`);

    // 5. Ensure Super Admin exists
    console.log('Checking Super Admin...');
    // Based on previous work, Super Admin is usually in HQ or a global context
    // Let's find or create a Super Admin staff record.

    const superAdmin = await prisma.staff.upsert({
        where: {
            restaurant_id_name_role: {
                restaurant_id: demoRestaurant.id,
                name: 'Super Admin',
                role: 'SUPER_ADMIN'
            }
        },
        update: { pin: '9999' },
        create: {
            restaurant_id: demoRestaurant.id,
            name: 'Super Admin',
            role: 'SUPER_ADMIN',
            pin: '9999',
            status: 'active'
        }
    });
    console.log(`Super Admin verified: ${superAdmin.name} (PIN: 9999)`);

    console.log('--- Cleanup Finished ---');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
