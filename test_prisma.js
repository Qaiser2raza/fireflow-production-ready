import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    try {
        console.log('Fetching one order...');
        const order = await prisma.orders.findFirst();
        console.log('Order:', order ? order.id : 'None');
    } catch (e) {
        console.error('Prisma Error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
main();
