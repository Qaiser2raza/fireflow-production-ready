import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { OrderServiceFactory } from '../src/api/services/orders/OrderServiceFactory';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Starting Backend Dine-In Order Test ---');

    // 1. Setup Context
    const restaurant = await prisma.restaurants.findFirst();
    if (!restaurant) throw new Error('No restaurant found');

    const staff = await prisma.staff.findFirst({ where: { restaurant_id: restaurant.id } });
    if (!staff) throw new Error('No staff found');

    const menuItem = await prisma.menu_items.findFirst({ where: { restaurant_id: restaurant.id } });
    if (!menuItem) throw new Error('No menu items found');

    const table = await prisma.tables.findFirst({ where: { restaurant_id: restaurant.id, status: 'AVAILABLE' } });
    if (!table) throw new Error('No available tables found');

    console.log(`Context Loaded:`);
    console.log(`- Restaurant: ${restaurant.name}`);
    console.log(`- Staff: ${staff.name}`);
    console.log(`- Table: ${table.name}`);
    console.log(`- Menu Item: ${menuItem.name}`);

    // 2. Construct DTO
    const service = OrderServiceFactory.getService('DINE_IN');
    
    const orderPayload: any = {
        restaurant_id: restaurant.id,
        manager_id: staff.id,
        type: 'DINE_IN',
        table_id: table.id,
        guest_count: 2,
        status: 'ACTIVE',
        total: Number(menuItem.price) * 1.16, // Assuming 16% tax
        items: [
            {
                menu_item_id: menuItem.id,
                quantity: 1,
                unit_price: Number(menuItem.price),
                total_price: Number(menuItem.price),
                item_name: menuItem.name,
                item_status: 'PENDING'
            }
        ],
        breakdown: {
            tax: Number(menuItem.price) * 0.16,
            serviceCharge: 0,
            deliveryFee: 0,
            discount: 0,
            tax_enabled: true,
            service_charge_enabled: false,
            tax_type: 'EXCLUSIVE'
        }
    };

    console.log('\nSubmitting to DineInService.createOrder...');
    try {
        const order = await service.createOrder(orderPayload);
        console.log('\n✅ ORDER CREATED SUCCESSFULLY');
        console.log(`Order ID: ${order.id}`);
        console.log(`Order Status: ${order.status}`);
        
        // Let's verify the order was saved by pulling it freshly
        const verifiedOrder = await prisma.orders.findUnique({
            where: { id: order.id },
            include: {
                dine_in_orders: true,
                order_items: true,
                tables: true
            }
        });
        
        console.log('\n--- Full Verified Database Record ---');
        console.log(JSON.stringify(verifiedOrder, null, 2));

    } catch (e) {
        console.error('\n❌ FAILED TO CREATE ORDER');
        console.error(e);
    }

}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
