
import fetch from 'node-fetch';

async function testSeat() {
    const payload = {
        restaurantId: '685d6b41-f6fb-450f-a3e1-d6ae08f237f3', // Need to verify a valid ID
        tableId: 'some-table-id',
        guestCount: 2,
        waiterId: 'some-waiter-id'
    };

    try {
        const res = await fetch('http://localhost:3001/api/floor/seat-party', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        console.log('Response:', data);
    } catch (err) {
        console.error('Test Failed:', err);
    }
}

// First find a restaurant and waiter from DB to make it valid
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const restaurant = await prisma.restaurants.findFirst();
    const waiter = await prisma.staff.findFirst({ where: { restaurant_id: restaurant.id } });
    const table = await prisma.tables.findFirst({ where: { restaurant_id: restaurant.id, status: 'AVAILABLE' } });

    if (!restaurant || !waiter || !table) {
        console.error('Could not find data to test with');
        return;
    }

    const payload = {
        restaurantId: restaurant.id,
        tableId: table.id,
        guestCount: 3,
        waiterId: waiter.id
    };

    console.log('Testing with payload:', payload);

    const res = await fetch('http://localhost:3001/api/floor/seat-party', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Data:', data);
    process.exit(0);
}

run();
