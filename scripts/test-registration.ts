
async function testRegistration() {
    const API_URL = 'http://localhost:3001/api';

    console.log('--- TESTING RESTAURANT REGISTRATION ---');

    try {
        // 1. Create Restaurant
        const resp1 = await fetch(`${API_URL}/restaurants`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Cravex Demo Grill',
                phone: '03001112233',
                address: 'Model Town',
                city: 'Lahore',
                subscription_plan: 'BASIC'
            })
        });

        if (!resp1.ok) throw new Error(`Restaurant creation failed: ${await resp1.text()}`);
        const restaurant = await resp1.json();
        console.log('✅ Restaurant created:', restaurant.id);

        // 2. Create Staff (Owner)
        const resp2 = await fetch(`${API_URL}/staff`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                restaurant_id: restaurant.id,
                name: 'Demo Manager',
                role: 'ADMIN',
                pin: '1234',
                phone: '03001112233',
                status: 'active'
            })
        });

        if (!resp2.ok) throw new Error(`Staff creation failed: ${await resp2.text()}`);
        const staff = await resp2.json();
        console.log('✅ Owner staff created:', staff.id);

        // 3. Test Login
        const resp3 = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: '1234' })
        });

        if (!resp3.ok) throw new Error(`Login failed: ${await resp3.text()}`);
        const loginData = await resp3.json();
        console.log('✅ Login successful! Token received.');
        console.log('Restaurant Name:', loginData.restaurant.name);

        console.log('\n--- ALL TESTS PASSED ---');
    } catch (err: any) {
        console.error('❌ TEST FAILED:', err.message);
        process.exit(1);
    }
}

testRegistration();
