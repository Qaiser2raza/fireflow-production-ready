
import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3001/api';

async function runTest() {
    console.log('--- STARTING DELIVERY WORKFLOW TEST ---');

    const restaurant = await prisma.restaurants.findFirst();
    if (!restaurant) {
        console.error('Missing seed data (restaurant)');
        return;
    }

    // 1. Setup Data: Create Driver
    let driver = await prisma.staff.findFirst({ where: { role: 'DRIVER' } });
    if (!driver) {
        console.log('Creating test driver...');
        driver = await prisma.staff.create({
            data: {
                restaurant_id: restaurant.id,
                name: 'Test Driver',
                role: 'DRIVER',
                pin: '9999',
                status: 'AVAILABLE'
            }
        });
    }

    // 2. Open Shift (REQUIRED for assignment)
    console.log('Testing Shift Opening...');
    const openShiftRes = await fetch(`${API_URL}/riders/shift/open`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-restaurant-id': restaurant.id
        },
        body: JSON.stringify({
            riderId: driver.id,
            openedBy: driver.id,
            openingFloat: 1000,
            notes: 'Test Shift Start'
        })
    });

    const shiftData = await openShiftRes.json();
    if (!openShiftRes.ok) {
        throw new Error(`Shift Opening Failed: ${shiftData.error}`);
    }
    const shiftId = shiftData.shift.id;
    console.log(`Shift Opened: ${shiftId}`);

    // 3. Create Order
    const order = await prisma.orders.create({
        data: {
            restaurant_id: restaurant.id,
            status: 'CONFIRMED',
            type: 'DELIVERY',
            total: 1500,
            delivery_address: '123 Test St',
            customer_name: 'Test Setup',
            customer_phone: '555-0101',
            delivery_orders: {
                create: {
                    delivery_address: '123 Test St',
                    customer_name: 'Test Setup',
                    customer_phone: '555-0101'
                }
            }
        }
    });
    console.log(`Created Order: ${order.id}`);

    // 4. Assign Driver (Now uses Shift)
    console.log('Testing Assignment...');
    const assignRes = await fetch(`${API_URL}/orders/${order.id}/assign-driver`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-restaurant-id': restaurant.id
        },
        body: JSON.stringify({
            driverId: driver.id,
            processedBy: driver.id
        })
    });

    if (!assignRes.ok) {
        console.error('Assignment Failed:', await assignRes.text());
        return;
    }
    console.log('Assignment Success');

    // 5. Mark Delivered
    console.log('Testing Mark Delivered...');
    const deliverRes = await fetch(`${API_URL}/orders/${order.id}/mark-delivered`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            processedBy: driver.id
        })
    });

    if (!deliverRes.ok) {
        console.error('Mark Delivered Failed:', await deliverRes.text());
        return;
    }
    console.log('Mark Delivered Success');

    // 6. Settle & Close Shift
    console.log('Testing Shift Closing (Settlement)...');

    // First simulate a sale being completed (status transition)
    // The RiderShiftService looks for PAID/CLOSED orders
    await prisma.orders.update({
        where: { id: order.id },
        data: { status: 'CLOSED', payment_status: 'PAID' }
    });

    const closeRes = await fetch(`${API_URL}/riders/shift/close`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-restaurant-id': restaurant.id
        },
        body: JSON.stringify({
            shiftId: shiftId,
            closedBy: driver.id,
            closingCash: 2500, // 1000 float + 1500 sales
            notes: 'Test Shift End'
        })
    });

    if (!closeRes.ok) {
        console.error('Shift Closing Failed:', await closeRes.text());
    } else {
        const closeData = await closeRes.json();
        console.log('Shift Closed Successfully');
        console.log('Variance:', closeData.shift.cash_difference);
    }

    console.log('--- TEST COMPLETE ---');
}

runTest()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
