
import { PrismaClient } from '@prisma/client';
import { OrderServiceFactory } from '../src/api/services/orders/OrderServiceFactory.js';

const prisma = new PrismaClient();

async function runTest() {
    console.log('--- STARTING FINANCIAL CALCULATION TEST ---');

    const restaurant = await prisma.restaurants.findFirst();
    if (!restaurant) {
        console.error('Missing seed data (restaurant)');
        return;
    }

    // Ensure settings are known for test
    await prisma.restaurants.update({
        where: { id: restaurant.id },
        data: {
            tax_enabled: true,
            tax_rate: 10, // 10%
            service_charge_enabled: true,
            service_charge_rate: 5, // 5%
            default_delivery_fee: 100 // Fixed 100
        }
    });

    // Create a dummy menu item
    let item = await prisma.menu_items.findFirst();
    if (!item) {
        item = await prisma.menu_items.create({
            data: {
                restaurant_id: restaurant.id,
                name: 'Test Burger',
                price: 1000,
                category: 'Burgers'
            }
        });
    }

    const testItem = {
        menu_item_id: item.id,
        quantity: 1,
        unit_price: 1000,
        total_price: 1000
    };

    // --- TEST 1: DINE_IN ---
    console.log('\nTesting DINE_IN (Should have Tax + Service Charge)...');
    const dineInService = OrderServiceFactory.getService('DINE_IN');
    const dineInOrder = await dineInService.createOrder({
        restaurant_id: restaurant.id,
        type: 'DINE_IN',
        status: 'ACTIVE',
        items: [testItem],
        table_id: (await prisma.tables.findFirst())?.id,
        guest_count: 2
    } as any);

    console.log(`Subtotal: 1000`);
    console.log(`Tax (10%): ${dineInOrder.tax}`);
    console.log(`SC (5%): ${dineInOrder.service_charge}`);
    console.log(`Grand Total: ${dineInOrder.total}`);

    if (Number(dineInOrder.total) === 1150) console.log('✅ DINE_IN Calculation Correct');
    else console.error('❌ DINE_IN Calculation Error');

    // --- TEST 2: TAKEAWAY ---
    console.log('\nTesting TAKEAWAY (Should have Tax only)...');
    const takeawayService = OrderServiceFactory.getService('TAKEAWAY');
    const takeawayOrder = await takeawayService.createOrder({
        restaurant_id: restaurant.id,
        type: 'TAKEAWAY',
        status: 'ACTIVE',
        items: [testItem]
    } as any);

    console.log(`Subtotal: 1000`);
    console.log(`Tax (10%): ${takeawayOrder.tax}`);
    console.log(`SC (0%): ${takeawayOrder.service_charge}`);
    console.log(`Grand Total: ${takeawayOrder.total}`);

    if (Number(takeawayOrder.total) === 1100) console.log('✅ TAKEAWAY Calculation Correct');
    else console.error('❌ TAKEAWAY Calculation Error');

    // --- TEST 3: DELIVERY ---
    console.log('\nTesting DELIVERY (Should have Tax + Delivery Fee)...');
    const deliveryService = OrderServiceFactory.getService('DELIVERY');
    const deliveryOrder = await deliveryService.createOrder({
        restaurant_id: restaurant.id,
        type: 'DELIVERY',
        status: 'ACTIVE',
        items: [testItem],
        delivery_address: 'Test House 1',
        customer_phone: '555-4321'
    } as any);

    console.log(`Subtotal: 1000`);
    console.log(`Tax (10%): ${deliveryOrder.tax}`);
    console.log(`Fee: ${deliveryOrder.delivery_fee}`);
    console.log(`Grand Total: ${deliveryOrder.total}`);

    if (Number(deliveryOrder.total) === 1200) console.log('✅ DELIVERY Calculation Correct');
    else console.error('❌ DELIVERY Calculation Error');

    console.log('\n--- TEST COMPLETE ---');
}

runTest()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
