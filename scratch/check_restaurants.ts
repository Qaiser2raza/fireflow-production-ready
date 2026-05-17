import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkRestaurants() {
  try {
    const restaurants = await prisma.restaurants.findMany();
    console.log(`Total Restaurants: ${restaurants.length}`);
    
    for (const r of restaurants) {
      const itemCount = await prisma.menu_items.count({
        where: { restaurant_id: r.id }
      });
      console.log(`- Restaurant: ${r.name} (ID: ${r.id}) has ${itemCount} items.`);
    }

  } catch (error) {
    console.error('Error querying database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkRestaurants();
