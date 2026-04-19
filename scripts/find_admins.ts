import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function findAdmins() {
  const admins = await prisma.staff.findMany({
    where: { 
      role: { 
        in: ['ADMIN', 'SUPER_ADMIN'] 
      } 
    }
  });
  console.log('--- ADMIN LIST ---');
  admins.forEach(a => console.log(`Name: ${a.name}, Role: ${a.role}, PIN: ${a.pin}`));
}

findAdmins().finally(() => prisma.$disconnect());
