import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("=== QUERY 1: ORDER RECORD ===");
    const order = await prisma.$queryRaw`
        SELECT id, order_number, type, status, payment_status, 
               total, created_at, closed_at
        FROM orders 
        WHERE order_number = 'ORD-81258-Z0R';
    `;
    console.log(JSON.stringify(order, (k,v) => typeof v === 'bigint' ? v.toString() : v, 2));

    console.log("\n=== QUERY 2: TRANSACTIONS ===");
    const transactions = await prisma.$queryRaw`
        SELECT t.id, t.amount, t.payment_method, t.status, t.created_at
        FROM transactions t
        JOIN orders o ON t.order_id = o.id
        WHERE o.order_number = 'ORD-81258-Z0R';
    `;
    console.log(JSON.stringify(transactions, (k,v) => typeof v === 'bigint' ? v.toString() : v, 2));

    console.log("\n=== QUERY 3: JOURNAL ENTRIES ===");
    const journals = await prisma.$queryRaw`
        SELECT je.reference_type, je.reference_id, je.description,
               jel.debit, jel.credit, coa.code, coa.name
        FROM journal_entries je
        JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id  
        JOIN chart_of_accounts coa ON jel.account_id = coa.id
        WHERE je.reference_id::text = (
          SELECT id::text FROM orders WHERE order_number = 'ORD-81258-Z0R'
        );
    `;
    console.log(JSON.stringify(journals, (k,v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
