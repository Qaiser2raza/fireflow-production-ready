import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createCustomAdmin() {
  try {
    console.log('🏗️ Creating Super Admin with custom PIN...');

    // 1. Find or create HQ Restaurant
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

    // 2. Check if super admin already exists
    let admin = await prisma.staff.findFirst({
      where: {
        role: 'SUPER_ADMIN',
        name: 'Super Admin'
      }
    });

    // 3. Create or update with PIN 123456
    if (admin) {
      console.log('🔄 Updating existing Super Admin...');
      admin = await prisma.staff.update({
        where: { id: admin.id },
        data: {
          pin: '123456',
          status: 'active'
        }
      });
    } else {
      console.log('📝 Creating new Super Admin...');
      admin = await prisma.staff.create({
        data: {
          restaurant_id: restaurant.id,
          name: 'Super Admin',
          role: 'SUPER_ADMIN',
          pin: '123456',
          status: 'active'
        }
      });
    }

    console.log('✅ Super Admin configured successfully!');
    console.log(`   Name: ${admin.name}`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   PIN: 123456`);
    console.log(`\n🎉 You can now login with PIN: 123456`);

    await prisma.$disconnect();
  } catch (err: any) {
    console.error('❌ Failed to create admin:', err.message);
    process.exit(1);
  }
}

createCustomAdmin();
