import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkFiregrill() {
  try {
    const restaurants = await prisma.restaurants.findMany({
      where: {
        name: {
          contains: 'firegrill',
          mode: 'insensitive'
        }
      }
    });

    console.log(`Found ${restaurants.length} restaurants matching 'firegrill':`);
    restaurants.forEach(r => console.log(`- ${r.name} (ID: ${r.id})`));

    // Let's also check all restaurants just in case
    const all = await prisma.restaurants.findMany();
    console.log(`\nTotal restaurants in DB: ${all.length}`);
    all.forEach(r => console.log(`- ${r.name} (ID: ${r.id})`));

  } catch (error) {
    console.error('Error querying database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkFiregrill();
