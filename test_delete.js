import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    try {
        const order = await prisma.orders.findFirst();
        if (order) {
            console.log('Deleting order:', order.id);
            await prisma.orders.delete({ where: { id: order.id } });
            console.log('Deleted successfully');
        } else {
            console.log('No orders to delete');
        }
    } catch (e) {
        console.error('Delete failed:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
main();
