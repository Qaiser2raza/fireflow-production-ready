
import { prisma } from './src/shared/lib/prisma';
import { seatPartyWithCapacityCheck } from './src/api/services/FloorManagementService';

async function testSeating() {
    const restaurantId = 'b1972d7d-8374-4b55-9580-95a15f18f656';
    const waiterId = '281ce755-759a-4833-8498-a987628de503';
    
    try {
        // Find an available table
        const table = await prisma.tables.findFirst({
            where: { restaurant_id: restaurantId, status: 'AVAILABLE' }
        });
        
        if (!table) {
            console.log('No available tables to test with');
            return;
        }
        
        console.log(`Attempting to seat table ${table.name} (ID: ${table.id}) with 10 guests (Capacity: ${table.capacity})...`);
        
        const result = await seatPartyWithCapacityCheck(
            restaurantId,
            10,
            'Test Guest OverCapacity',
            waiterId,
            undefined, // io
            undefined, // preferredSectionId
            true, // allowOverCapacity
            table.id
        );
        
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (e: any) {
        console.error('ERROR during seating:', e);
    } finally {
        await prisma.$disconnect();
    }
}

testSeating();
