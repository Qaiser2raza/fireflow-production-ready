import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const station = await prisma.stations.findUnique({
      where: { id: 'ff42c8f0-035c-4648-a813-a3201a54ec70' }
    });
    console.log(JSON.stringify(station, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
