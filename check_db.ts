import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const orders = await prisma.orders.findMany({ select: { id: true, order_number: true, type: true } });
    console.log("Orders found:", orders.length);
    console.log(orders);
}
main().catch(console.error).finally(() => prisma.$disconnect());
