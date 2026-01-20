
import { PrismaClient } from '@prisma/client';
// import fetch from 'node-fetch'; // Native fetch used

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3001/api';

async function runE2ETest() {
    console.log('🚀 Starting FireFlow E2E Flow Test');

    try {
        // 1. Setup Phase: Fetch valid IDs
        console.log('➡️ Setup: Fetching valid IDs from DB...');
        const restaurant = await prisma.restaurants.findFirst();
        if (!restaurant) throw new Error('No restaurant found. Please seed the DB.');

        const table = await prisma.tables.findFirst({ where: { restaurant_id: restaurant.id } });
        if (!table) throw new Error('No table found.');

        const menuItem = await prisma.menu_items.findFirst({ where: { restaurant_id: restaurant.id } });
        if (!menuItem) throw new Error('No menu item found.');

        const staff = await prisma.staff.findFirst({ where: { restaurant_id: restaurant.id } }); // Any staff

        console.log(`   Restaurant: ${restaurant.id}`);
        console.log(`   Table: ${table.id}`);
        console.log(`   Item: ${menuItem.id}`);

        // 2. Create Order (Dine In)
        console.log('\n➡️ Step 1: Creating Dine-in Order...');
        const orderPayload = {
            restaurant_id: restaurant.id,
            type: 'DINE_IN',
            status: 'DRAFT',
            table_id: table.id,
            guest_count: 2,
            items: [
                {
                    menu_item_id: menuItem.id,
                    quantity: 2,
                    price: Number(menuItem.price),
                    name: menuItem.name
                }
            ]
        };

        const createRes = await fetch(`${API_URL}/orders/upsert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderPayload)
        });

        if (!createRes.ok) {
            const err = await createRes.json();
            throw new Error(`Order Create Failed: ${JSON.stringify(err)}`);
        }

        const order = await createRes.json();
        console.log(`✅ Order Created: ${order.id}`);

        // 3. Verify Table Status (Should be OCCUPIED)
        console.log('\n➡️ Step 2: Verifying Table Status...');
        const updatedTable = await prisma.tables.findUnique({ where: { id: table.id } });
        if (updatedTable?.status !== 'OCCUPIED') {
            throw new Error(`Expected Table Status OCCUPIED, got ${updatedTable?.status}`);
        }
        console.log('✅ Table Status is OCCUPIED');

        // 4. Update Order (Confirm)
        console.log('\n➡️ Step 3: Confirming Order...');
        const updatePayload = {
            id: order.id,
            type: 'DINE_IN',
            status: 'Q_PENDING', // Kitchen Queue Pending
            restaurant_id: restaurant.id // Security check
        };
        const updateRes = await fetch(`${API_URL}/orders/upsert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
        });
        if (!updateRes.ok) {
            const err = await updateRes.json();
            throw new Error(`Order Update Failed: ${JSON.stringify(err)}`);
        }
        console.log('✅ Order Confirmed');

    } catch (e) {
        console.error('❌ E2E TEST FAILED:', e);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

runE2ETest();
