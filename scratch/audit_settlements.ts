import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function auditSettlements() {
    const restaurantId = 'b1972d7d-8374-4b55-9580-95a15f18f656';

    console.log('--- RECENT SETTLEMENT LEDGER ENTRIES ---');
    const ledger = await prisma.$queryRaw`
        SELECT id, transaction_type, reference_type, amount, 
               description, created_at
        FROM ledger_entries
        WHERE reference_type = 'SETTLEMENT'
        AND restaurant_id = ${restaurantId}::uuid
        ORDER BY created_at DESC
        LIMIT 10
    `;
    console.table(ledger);

    await prisma.$disconnect();
}

auditSettlements().catch(err => {
    console.error(err);
    process.exit(1);
});
