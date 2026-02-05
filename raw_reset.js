import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const restaurantId = '359e8231-fb7b-4e48-82c7-aa71888d560ee';
async function main() {
    try {
        console.log('RESET START');

        await prisma.$executeRawUnsafe("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE restaurant_id = '" + restaurantId + "')");
        console.log('OK order_items');

        const tables = ['dine_in_orders', 'takeaway_orders', 'delivery_orders', 'reservation_orders', 'transactions', 'expenses', 'reservations'];
        for (const t of tables) {
            try {
                await prisma.$executeRawUnsafe("DELETE FROM " + t + " WHERE restaurant_id = '" + restaurantId + "'");
                console.log('OK ' + t);
            } catch (err) {
                console.log('SKIP ' + t + ': ' + err.message.substring(0, 50));
            }
        }

        await prisma.$executeRawUnsafe("DELETE FROM orders WHERE restaurant_id = '" + restaurantId + "'");
        console.log('OK orders');

        await prisma.$executeRawUnsafe("UPDATE tables SET status = 'AVAILABLE', active_order_id = NULL, merge_id = NULL WHERE restaurant_id = '" + restaurantId + "'");
        console.log('OK tables');

        console.log('RESET DONE');
    } catch (e) {
        console.log('FATAL: ' + e.message);
    } finally {
        await prisma.$disconnect();
    }
}
main();
