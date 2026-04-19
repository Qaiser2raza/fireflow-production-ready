import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkStations() {
  const stations = await prisma.stations.findMany();
  console.log('--- STATIONS ---');
  stations.forEach(s => {
    console.log(`Station: ID=${s.id}, Name=${s.name}, Active=${s.is_active}`);
  });
}

checkStations().finally(() => prisma.$disconnect());
