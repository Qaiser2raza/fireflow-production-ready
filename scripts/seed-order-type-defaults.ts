import { prisma } from '../src/shared/lib/prisma';

async function seedOrderTypeDefaults() {
  console.log('--- Seeding Order Type Defaults ---');
  
  try {
    const allRestaurants = await prisma.restaurants.findMany({
      select: { id: true, name: true }
    });

    console.log(`Found ${allRestaurants.length} restaurants.`);

    for (const restaurant of allRestaurants) {
      console.log(`Seeding defaults for restaurant: ${restaurant.name} (${restaurant.id})`);

      // DINE_IN
      await prisma.order_type_defaults.upsert({
        where: {
          restaurant_id_order_type: {
            restaurant_id: restaurant.id,
            order_type: 'DINE_IN'
          }
        },
        create: {
          restaurant_id: restaurant.id,
          order_type: 'DINE_IN',
          tax_enabled: false,
          tax_rate: 0,
          tax_type: 'EXCLUSIVE',
          svc_enabled: true,
          svc_rate: 5,
          delivery_fee: 0,
          discount_max: 0
        },
        update: {
          tax_enabled: false,
          tax_rate: 0,
          tax_type: 'EXCLUSIVE',
          svc_enabled: true,
          svc_rate: 5,
          delivery_fee: 0,
          discount_max: 0
        }
      });

      // TAKEAWAY
      await prisma.order_type_defaults.upsert({
        where: {
          restaurant_id_order_type: {
            restaurant_id: restaurant.id,
            order_type: 'TAKEAWAY'
          }
        },
        create: {
          restaurant_id: restaurant.id,
          order_type: 'TAKEAWAY',
          tax_enabled: false,
          tax_rate: 0,
          tax_type: 'EXCLUSIVE',
          svc_enabled: false,
          svc_rate: 0,
          delivery_fee: 0,
          discount_max: 100
        },
        update: {
          tax_enabled: false,
          tax_rate: 0,
          tax_type: 'EXCLUSIVE',
          svc_enabled: false,
          svc_rate: 0,
          delivery_fee: 0,
          discount_max: 100
        }
      });

      // DELIVERY
      await prisma.order_type_defaults.upsert({
        where: {
          restaurant_id_order_type: {
            restaurant_id: restaurant.id,
            order_type: 'DELIVERY'
          }
        },
        create: {
          restaurant_id: restaurant.id,
          order_type: 'DELIVERY',
          tax_enabled: false,
          tax_rate: 0,
          tax_type: 'EXCLUSIVE',
          svc_enabled: false,
          svc_rate: 0,
          delivery_fee: 150,
          discount_max: 100
        },
        update: {
          tax_enabled: false,
          tax_rate: 0,
          tax_type: 'EXCLUSIVE',
          svc_enabled: false,
          svc_rate: 0,
          delivery_fee: 150,
          discount_max: 100
        }
      });

      console.log(`✓ Completed: ${restaurant.name}`);
    }

    console.log('--- Seeding Complete ---');
  } catch (error) {
    console.error('Error seeding order type defaults:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Check if script is run directly
if (require.main === module) {
  seedOrderTypeDefaults();
}

export { seedOrderTypeDefaults };
