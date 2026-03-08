import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const staff = await prisma.staff.findMany();
    console.log(JSON.stringify(staff, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
