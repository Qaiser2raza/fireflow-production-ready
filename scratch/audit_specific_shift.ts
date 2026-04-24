import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function auditShiftLedger() {
    const shiftId = '41659663-1fe7-49ea-b749-df83f4d22c78';

    console.log(`--- LEDGER ENTRIES FOR SHIFT: ${shiftId} ---`);
    const ledger = await prisma.ledger_entries.findMany({
        where: {
            reference_id: shiftId
        },
        orderBy: {
            created_at: 'asc'
        }
    });
    
    console.table(ledger.map(e => ({
        id: e.id,
        transaction_type: e.transaction_type,
        reference_type: e.reference_type,
        account_id: e.account_id,
        amount: e.amount.toString(),
        description: e.description
    })));

    await prisma.$disconnect();
}

auditShiftLedger().catch(err => {
    console.error(err);
    process.exit(1);
});
