import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkAllStaff() {
  const staff = await prisma.staff.findMany();
  console.log('--- ALL STAFF ---');
  staff.forEach(s => console.log(`Name: ${s.name}, Role: ${s.role}, PIN: ${s.pin}`));
}

checkAllStaff().finally(() => prisma.$disconnect());
