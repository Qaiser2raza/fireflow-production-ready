import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const restaurantId = '359e8231-fb7b-4e48-82c7-aa71888d560ee';
const menuItemId = 'e29f258a-dc30-40ba-99e7-001466813c696';
async function main() {
    try {
        console.log('Creating fake order...');
        const order = await prisma.orders.create({
            data: {
                restaurant_id: restaurantId,
                status: 'CONFIRMED',
                type: 'DINE_IN',
                total: 1000,
                order_items: {
                    create: [
                        {
                            menu_item_id: menuItemId,
                            item_name: 'Test Item',
                            quantity: 1,
                            unit_price: 1000,
                            total_price: 1000
                        }
                    ]
                }
            }
        });
        console.log('Created order:', order.id);
    } catch (e) {
        console.error('Create failed:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
main();
