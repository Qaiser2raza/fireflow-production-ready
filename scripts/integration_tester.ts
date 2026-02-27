const BASE_URL = 'http://localhost:3001/api';

async function runTest() {
    try {
        console.log('--- 🚀 STARTING INTEGRATION TEST RUN (Stage 1, 2, 3) ---');

        // 1. Get Initial Setup
        console.log('1. Fetching setup data...');
        const menuRes = await fetch(`${BASE_URL}/menu_items`);
        const menuData = await menuRes.json();
        const restaurant_id = menuData[0].restaurant_id;
        console.log(`- Restaurant: ${restaurant_id}`);

        const tablesRes = await fetch(`${BASE_URL}/tables?restaurant_id=${restaurant_id}`);
        const tablesData = await tablesRes.json();
        const tableH01 = tablesData.find((t) => t.name === 'H-01');
        if (!tableH01) throw new Error('Table H-01 not found');
        console.log(`- Table H-01 ID: ${tableH01.id}`);

        const staffRes = await fetch(`${BASE_URL}/staff?restaurant_id=${restaurant_id}`);
        const staffData = await staffRes.json();
        const waiter = staffData.find((s) => s.role === 'WAITER');
        if (!waiter) throw new Error('No waiter found');
        console.log(`- Waiter: ${waiter.name} (${waiter.id})`);

        // 2. STAGE 1: Book Order (Seat Party)
        console.log('\n2. STAGE 1: Booking Order (Seating H-01)');
        const seatRes = await fetch(`${BASE_URL}/floor/seat-party`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                restaurantId: restaurant_id,
                guestCount: 2,
                waiterId: waiter.id,
                tableId: tableH01.id
            })
        });
        const seatData = await seatRes.json();
        if (!seatRes.ok) throw new Error(`Seating failed: ${JSON.stringify(seatData)}`);
        const orderId = seatData.order.id;
        console.log(`- Order Created: ${orderId} (Status: ${seatData.order.status})`);

        // 3. STAGE 2: Add Menu Items (Draft)
        console.log('\n3. STAGE 2: Adding Menu Items (Draft)');
        const item1 = menuData.find((m) => m.name === 'Chicken Corn Soup');
        const item2 = menuData.find((m) => m.name === 'Finger Fish');

        const patchRes = await fetch(`${BASE_URL}/orders/${orderId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'DINE_IN',
                items: [
                    {
                        menu_item_id: item1.id,
                        item_name: item1.name,
                        quantity: 1,
                        unit_price: Number(item1.price),
                        total_price: Number(item1.price),
                        item_status: 'DRAFT'
                    },
                    {
                        menu_item_id: item2.id,
                        item_name: item2.name,
                        quantity: 1,
                        unit_price: Number(item2.price),
                        total_price: Number(item2.price),
                        item_status: 'DRAFT'
                    }
                ],
                total: Number(item1.price) + Number(item2.price)
            })
        });
        if (!patchRes.ok) throw new Error(`Patch failed: ${await patchRes.text()}`);

        console.log(`- Items added as DRAFT. Verifying items...`);
        const savedOrdersRes = await fetch(`${BASE_URL}/orders?restaurant_id=${restaurant_id}`);
        const savedOrders = await savedOrdersRes.json();
        console.log(`- Found ${savedOrders.length} total orders`);

        const activeOrder = savedOrders.find((o) => o.id === orderId);
        if (!activeOrder) throw new Error(`Could not find order ${orderId} in list`);
        if (!activeOrder.order_items || activeOrder.order_items.length === 0) throw new Error(`Order ${orderId} has no items`);

        console.log(`- Item 1 Status: ${activeOrder.order_items[0].item_status} (Expected: DRAFT)`);
        console.log(`- Item 2 Status: ${activeOrder.order_items[1].item_status} (Expected: DRAFT)`);

        // 4. TRANSITION: Fire Order
        console.log('\n4. TRANSITION: Firing Order to Kitchen');
        const fireRes = await fetch(`${BASE_URL}/orders/${orderId}/fire`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'DINE_IN' })
        });
        if (!fireRes.ok) throw new Error(`Fire failed: ${await fireRes.text()}`);
        console.log('- Order Fired!');

        // 5. Verification: KDS Visibility
        console.log('\n5. VERIFICATION: Checking Item Status After Fire');
        const firedOrderRes = await fetch(`${BASE_URL}/orders?restaurant_id=${restaurant_id}`);
        const firedOrders = await firedOrderRes.json();
        const firedOrder = firedOrders.find((o) => o.id === orderId);
        console.log(`- Item 1 Status: ${firedOrder.order_items[0].item_status} (Expected: PENDING/DONE)`);
        console.log(`- Item 2 Status: ${firedOrder.order_items[1].item_status} (Expected: PENDING/DONE)`);

        // 6. STAGE 3: Settlement
        console.log('\n6. STAGE 3: Processing Payment (Settlement)');
        const settleRes = await fetch(`${BASE_URL}/orders/${orderId}/settle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: firedOrder.total,
                payment_method: 'CASH',
                restaurant_id: restaurant_id,
                staff_id: waiter.id
            })
        });
        const settleData = await settleRes.json();
        if (!settleRes.ok) throw new Error(`Settlement failed: ${JSON.stringify(settleData)}`);

        console.log(`- Payment Settled! Order Status: ${settleData.updatedOrder.status} (Expected: CLOSED)`);
        console.log(`- Payment Status: ${settleData.updatedOrder.payment_status} (Expected: PAID)`);

        // Final Table Check
        const finalTablesRes = await fetch(`${BASE_URL}/tables?restaurant_id=${restaurant_id}`);
        const finalTables = await finalTablesRes.json();
        const finalTable = finalTables.find((t) => t.id === tableH01.id);
        console.log(`- Final Table H-01 Status: ${finalTable.status} (Expected: DIRTY)`);

        console.log('\n✅ ALL STAGES COMPLETED SUCCESSFULLY!');
    } catch (e) {
        console.error('\n❌ TEST FAILED:', e.message);
    }
}

runTest();
