import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const orders = await prisma.orders.findMany({
        take: 10,
        orderBy: { created_at: 'desc' },
        select: { id: true, status: true, type: true }
    });
    console.log('Recent Orders:', JSON.stringify(orders, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
