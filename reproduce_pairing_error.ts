import { PrismaClient } from '@prisma/client';
import { generatePairingCode } from './src/api/services/pairing/PairingService';

const prisma = new PrismaClient();

async function reproduce() {
    console.log('--- REPRODUCING /api/pairing/generate ERROR ---');
    
    // 1. Valid context
    const restaurant = await prisma.restaurants.findFirst();
    const manager = await prisma.staff.findFirst({ where: { role: 'MANAGER' } });
    
    if (!restaurant || !manager) {
        console.error('Incomplete test data (need a restaurant and a manager).');
        return;
    }

    // 2. Test Case: STAFF_NOT_FOUND
    try {
        console.log('Testing STAFF_NOT_FOUND (invalid targetStaffId)...');
        await generatePairingCode(restaurant.id, manager.id, '00000000-0000-0000-0000-000000000000', 8);
    } catch (e: any) {
        console.log('Caught Error:', e.message);
    }

    // 3. Test Case: Prisma Relation/UUID Error
    try {
        console.log('Testing successful generation...');
        // Find a valid staff member to pair
        const targetStaff = await prisma.staff.findFirst({
            where: { restaurant_id: restaurant.id }
        });
        if (targetStaff) {
            const result = await generatePairingCode(restaurant.id, manager.id, targetStaff.id, 8);
            console.log('Success:', result.code);
        }
    } catch (e: any) {
        console.log('Caught Error during success test:', e.message);
    }
}

reproduce().catch(console.error).finally(() => prisma.$disconnect());
