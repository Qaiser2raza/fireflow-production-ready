import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("=== QUERY 1: ORDERS ===");
    const orders = await prisma.$queryRaw`
        SELECT order_number, type, total, payment_status, status 
        FROM orders 
        WHERE restaurant_id = 'b1972d7d-8374-4b55-9580-95a15f18f656'
        AND DATE(created_at) = CURRENT_DATE
        ORDER BY created_at;
    `;
    console.log(JSON.stringify(orders, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));

    console.log("\n=== QUERY 2: JOURNAL ENTRIES ===");
    const journals = await prisma.$queryRaw`
        SELECT je.reference_type, je.reference_id, je.description,
               jel.debit, jel.credit, coa.code, coa.name
        FROM journal_entries je
        JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
        JOIN chart_of_accounts coa ON jel.account_id = coa.id
        WHERE je.restaurant_id = 'b1972d7d-8374-4b55-9580-95a15f18f656'
        AND DATE(je.created_at) = CURRENT_DATE
        ORDER BY je.created_at, jel.debit DESC;
    `;
    console.log(JSON.stringify(journals, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));

    console.log("\n=== QUERY 3: LEDGER ENTRIES ===");
    const ledgers = await prisma.$queryRaw`
        SELECT transaction_type, amount, reference_type, reference_id, description
        FROM ledger_entries
        WHERE restaurant_id = 'b1972d7d-8374-4b55-9580-95a15f18f656'
        AND DATE(created_at) = CURRENT_DATE
        ORDER BY created_at;
    `;
    console.log(JSON.stringify(ledgers, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));

    console.log("\n=== QUERY 4: RIDER SHIFTS ===");
    const shifts = await prisma.$queryRaw`
        SELECT id, rider_id, opening_float, closing_cash_received, 
               expected_cash, cash_difference, status
        FROM rider_shifts
        WHERE restaurant_id = 'b1972d7d-8374-4b55-9580-95a15f18f656'
        AND DATE(opened_at) = CURRENT_DATE;
    `;
    console.log(JSON.stringify(shifts, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
