
import { jwtService } from './src/api/services/auth/JwtService';

async function triggerSeatParty() {
    const restaurantId = 'b1972d7d-8374-4b55-9580-95a15f18f656';
    const waiterId = '281ce755-759a-4833-8498-a987628de503';
    // Table H-02 from earlier subagent attempts
    const tableId = '0b0c611d-e409-4ca2-a964-cb5bfdad30cb'; 

    const token = jwtService.generateAccessToken(
        waiterId,
        restaurantId,
        'CASHIER',
        'Repro User'
    );

    console.log('Using Token:', token.substring(0, 20) + '...');

    try {
        const response = await fetch('http://localhost:3001/api/floor/seat-party', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                guestCount: 2,
                waiterId: waiterId,
                tableId: tableId,
                customerName: 'Repro Test'
            })
        });

        console.log('Status:', response.status);
        const text = await response.text();
        console.log('Response Body:', text);
    } catch (e: any) {
        console.error('Fetch Failed:', e.message);
    }
}

triggerSeatParty();
