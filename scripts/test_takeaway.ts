const BASE_URL = 'http://localhost:3001/api';

async function runTakeawayTest() {
    try {
        console.log('--- 🚀 STARTING TAKEAWAY INTEGRATION TEST ---');

        // 1. Get Initial Setup
        console.log('1. Fetching setup data...');
        const menuRes = await fetch(`${BASE_URL}/menu_items`);
        const menuData = await menuRes.json();
        const restaurant_id = menuData[0].restaurant_id;
        console.log(`- Restaurant: ${restaurant_id}`);

        const staffRes = await fetch(`${BASE_URL}/staff?restaurant_id=${restaurant_id}`);
        const staffData = await staffRes.json();
        const cashier = staffData.find((s) => s.role === 'CASHIER') || staffData[0];
        console.log(`- Cashier: ${cashier.name} (${cashier.id})`);

        // 2. STAGE 1: Create Takeaway Order (Direct POST)
        console.log('\n2. STAGE 1: Creating Takeaway Order');
        const item1 = menuData.find((m) => m.name === 'Chicken Corn Soup');

        const createRes = await fetch(`${BASE_URL}/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                restaurant_id: restaurant_id, // This is what was missing
                type: 'TAKEAWAY',
                status: 'ACTIVE',
                items: [
                    {
                        menu_item_id: item1.id,
                        item_name: item1.name,
                        quantity: 1,
                        unit_price: Number(item1.price),
                        total_price: Number(item1.price),
                        item_status: 'PENDING'
                    }
                ],
                total: Number(item1.price)
            })
        });

        const order = await createRes.json();
        if (!createRes.ok) throw new Error(`Create failed: ${JSON.stringify(order)}`);

        console.log(`- Order Created: ${order.id} (Status: ${order.status})`);
        console.log(`- Takeaway Token: ${order.takeaway_orders?.token_number || order.takeaway_orders?.[0]?.token_number} (Expected: T###)`);

        if (!order.takeaway_orders) {
            throw new Error('Takeaway order extension was not created!');
        }

        // 3. STAGE 2: Verification in KDS (Item should be PENDING)
        console.log('\n3. STAGE 2: Verifying Item Status');
        if (order.order_items[0].item_status !== 'PENDING') {
            throw new Error(`Item status is ${order.order_items[0].item_status}, expected PENDING`);
        }
        console.log('- Item is PENDING in database.');

        console.log('\n✅ TAKEAWAY TEST COMPLETED SUCCESSFULLY!');
    } catch (e) {
        console.error('\n❌ TAKEAWAY TEST FAILED:', e.message);
    }
}

runTakeawayTest();
