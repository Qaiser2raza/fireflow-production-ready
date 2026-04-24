import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function auditRiderShifts() {
    const restaurantId = 'b1972d7d-8374-4b55-9580-95a15f18f656';

    console.log('--- OPEN RIDER SHIFTS ---');
    const shifts = await prisma.$queryRaw`
        SELECT id, status, opening_float, opened_at 
        FROM rider_shifts 
        WHERE status = 'OPEN' 
        AND restaurant_id = ${restaurantId}::uuid
        ORDER BY opened_at DESC
    `;
    console.table(shifts);

    console.log('\n--- RECENT ADJUSTMENT LEDGER ENTRIES ---');
    const ledger = await prisma.$queryRaw`
        SELECT id, transaction_type, reference_type, amount, 
               description, created_at
        FROM ledger_entries
        WHERE reference_type = 'ADJUSTMENT'
        AND restaurant_id = ${restaurantId}::uuid
        ORDER BY created_at DESC
        LIMIT 10
    `;
    console.table(ledger);

    await prisma.$disconnect();
}

auditRiderShifts().catch(err => {
    console.error(err);
    process.exit(1);
});
