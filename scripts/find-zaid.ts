import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const customers = await prisma.customers.findMany({
    where: { name: { contains: 'Zaid', mode: 'insensitive' } }
  });
  for (const c of customers) {
    console.log(`CUSTOMER_ID: ${c.id}`);
    console.log(`RESTAURANT_ID: ${c.restaurant_id}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
