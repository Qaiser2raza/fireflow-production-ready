import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("=== QUERY 3: LEDGER ENTRIES WITH ACCOUNT ID ===");
    const ledgers = await prisma.$queryRaw`
        SELECT transaction_type, amount, reference_type, reference_id, description, account_id
        FROM ledger_entries
        WHERE restaurant_id = 'b1972d7d-8374-4b55-9580-95a15f18f656'
        AND DATE(created_at) = CURRENT_DATE
        ORDER BY created_at;
    `;
    console.log(JSON.stringify(ledgers, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
