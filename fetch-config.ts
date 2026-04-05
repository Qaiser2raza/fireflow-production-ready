import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const defaults = await prisma.order_type_defaults.findMany();
  console.log(JSON.stringify(defaults, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
