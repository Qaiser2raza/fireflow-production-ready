import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function promote() {
  const result = await prisma.staff.updateMany({
    where: { name: 'Admin Ali' },
    data: { role: 'ADMIN' }
  });
  console.log('Update result:', result);
  
  const updated = await prisma.staff.findFirst({ where: { name: 'Admin Ali' } });
  console.log('Current state of Admin Ali:', updated);
}

promote().finally(() => prisma.$disconnect());
