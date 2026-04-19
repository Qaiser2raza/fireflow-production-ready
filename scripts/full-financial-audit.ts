import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // 1. Order financial fields
    const order = await prisma.orders.findFirst({});
    if (!order) { console.log('No orders'); return; }
    
    console.log('=== ORDER RECORD ===');
    console.log(`  total:          ${order.total}`);
    console.log(`  tax:            ${order.tax}`);
    console.log(`  tax_type:       ${order.tax_type}`);
    console.log(`  tax_exempt:     ${order.tax_exempt}`);
    console.log(`  service_charge: ${order.service_charge}`);
    console.log(`  delivery_fee:   ${order.delivery_fee}`);
    console.log(`  discount:       ${order.discount}`);
    console.log(`  type:           ${order.type}`);
    console.log(`  status:         ${order.status}`);
    console.log(`  payment_status: ${order.payment_status}`);
    console.log(`  payment_method: ${order.payment_method}`);
    console.log(`  breakdown:      ${JSON.stringify(order.breakdown, null, 2)}`);

    // 2. Transaction record
    const tx = await prisma.transactions.findFirst({ where: { order_id: order.id } });
    console.log('\n=== TRANSACTION RECORD ===');
    console.log(`  amount:         ${tx?.amount}`);
    console.log(`  method:         ${tx?.payment_method}`);
    console.log(`  status:         ${tx?.status}`);

    // 3. Ledger entries
    const ledger = await prisma.ledger_entries.findMany({
        where: { reference_id: order.id },
        orderBy: { created_at: 'asc' }
    });
    console.log(`\n=== LEDGER ENTRIES (ref: order) === Count: ${ledger.length}`);
    ledger.forEach((e, i) => {
        console.log(`  [${i}] ${e.transaction_type} Rs.${e.amount} | ${e.description} | acct: ${e.account_id || 'HOUSE'}`);
    });

    // 4. Journal entries
    const journals = await prisma.journal_entry_lines.findMany({
        include: { journal_entries: true, chart_of_accounts: true }
    });
    console.log(`\n=== JOURNAL ENTRY LINES === Count: ${journals.length}`);
    let totalDebits = 0, totalCredits = 0;
    journals.forEach((j, i) => {
        const dr = Number(j.debit_amount);
        const cr = Number(j.credit_amount);
        totalDebits += dr;
        totalCredits += cr;
        console.log(`  [${i}] ${(j as any).chart_of_accounts?.code || '???'} ${(j as any).chart_of_accounts?.name || '???'} | DR: ${dr} | CR: ${cr} | entry: ${(j as any).journal_entries?.description}`);
    });
    console.log(`\n  TRIAL BALANCE: Total Debits = ${totalDebits}, Total Credits = ${totalCredits}, Diff = ${totalDebits - totalCredits}`);

    // 5. Cashier sessions
    const sessions = await prisma.cashier_sessions.findMany({
        include: { staff_cashier_sessions_opened_byTostaff: { select: { name: true } } }
    });
    console.log(`\n=== CASHIER SESSIONS === Count: ${sessions.length}`);
    sessions.forEach((s, i) => {
        console.log(`  [${i}] Status: ${s.status} | opened: ${s.opened_at.toISOString()} | closed: ${s.closed_at?.toISOString() || 'STILL OPEN'} | opening_balance: ${s.opening_balance} | closing_balance: ${s.closing_balance} | staff: ${(s as any).staff_cashier_sessions_opened_byTostaff?.name}`);
    });

    // 6. Chart of Accounts
    const coa = await prisma.chart_of_accounts.findMany({ orderBy: { code: 'asc' } });
    console.log(`\n=== CHART OF ACCOUNTS === Count: ${coa.length}`);
    coa.forEach(a => {
        console.log(`  ${a.code} | ${a.name} | type: ${a.account_type} | parent: ${a.parent_code || '-'}`);
    });

    // 7. Restaurant tax config
    const restaurant = await prisma.restaurants.findFirst({});
    console.log(`\n=== RESTAURANT CONFIG ===`);
    console.log(`  tax_rate:     ${restaurant?.tax_rate}`);
    console.log(`  tax_type:     ${restaurant?.tax_type}`);
    console.log(`  tax_enabled:  ${restaurant?.tax_enabled}`);
    console.log(`  svc_rate:     ${restaurant?.svc_rate}`);
    console.log(`  svc_enabled:  ${restaurant?.svc_enabled}`);

    // 8. Item-level calculation
    const items = await prisma.order_items.findMany({ where: { order_id: order.id } });
    let itemSubtotal = 0;
    console.log(`\n=== ORDER ITEMS === Count: ${items.length}`);
    items.forEach(item => {
        const lineTotal = Number(item.unit_price) * item.quantity;
        itemSubtotal += lineTotal;
        console.log(`  ${item.item_name}: ${item.quantity} x ${item.unit_price} = ${lineTotal}`);
    });
    console.log(`  CALCULATED SUBTOTAL = ${itemSubtotal}`);
    
    // Expected calculation
    const taxRate = Number(restaurant?.tax_rate || 0) / 100;
    const svcRate = Number(restaurant?.svc_rate || 0) / 100;
    const expectedTax = itemSubtotal * taxRate;
    const expectedSvc = itemSubtotal * svcRate;
    const expectedTotal = itemSubtotal + expectedTax + expectedSvc;
    console.log(`\n=== EXPECTED CALCULATION ===`);
    console.log(`  Subtotal:        ${itemSubtotal}`);
    console.log(`  Tax (${(taxRate*100).toFixed(1)}%):    ${expectedTax.toFixed(2)}`);
    console.log(`  SVC (${(svcRate*100).toFixed(1)}%):    ${expectedSvc.toFixed(2)}`);
    console.log(`  Expected Total:  ${expectedTotal.toFixed(2)}`);
    console.log(`  Rounded to 10:   ${Math.round(expectedTotal / 10) * 10}`);
    console.log(`\n=== ACTUAL vs EXPECTED ===`);
    console.log(`  Order.total    = ${order.total}   (stored)`);
    console.log(`  TX.amount      = ${tx?.amount}  (charged)`);
    console.log(`  Expected total = ${Math.round(expectedTotal / 10) * 10}  (calculated)`);
    console.log(`  MISMATCH?      = ${Number(order.total) !== Math.round(expectedTotal / 10) * 10 ? 'YES ⚠️' : 'NO ✓'}`);
    console.log(`  TX vs Order?   = ${Number(tx?.amount) !== Number(order.total) ? 'YES ⚠️' : 'NO (but should match) ✓'}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
