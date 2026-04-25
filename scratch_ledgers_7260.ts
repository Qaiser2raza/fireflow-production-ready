import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const session = await prisma.cashier_sessions.findUnique({
        where: { id: '3023af46-0d86-4e1a-b478-913e01c49860' }
    });
    
    const ledgers = await prisma.ledger_entries.findMany({
        where: {
            restaurant_id: session.restaurant_id,
            processed_by: session.opened_by,
            reference_type: 'SETTLEMENT',
            transaction_type: 'DEBIT',
            created_at: { gte: session.opened_at }
        }
    });

    console.log("Customer Payments ledgers:");
    console.log(JSON.stringify(ledgers, (k,v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
