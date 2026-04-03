import { PrismaClient, AccountType, OrderType, OrderStatus, PaymentStatus, TaxType, CustomerLedgerEntryType, SupplierLedgerEntryType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function main() {
    console.log('--- STARTING FINANCIAL VALIDATION [FULL T01-T08] ---');
    console.log('Target: Isolated Throwaway Tenant');
    
    try {
        await prisma.$transaction(async (tx) => {
            // 1. SETUP TENANT
            const restaurant = await tx.restaurants.create({
                data: {
                    name: 'Validation Dev-Test Final',
                    currency: 'PKR',
                    is_active: true
                }
            });
            const RID = restaurant.id;
            console.log(`[SETUP] Tenant Created: ${RID}`);

            // BUG-13 FIX: void-cast — only DB side-effect needed, result unused
            void await tx.staff.create({
                data: {
                    restaurant_id: RID,
                    name: 'Manager Audit',
                    role: 'MANAGER',
                    pin: '1234'
                }
            });

            const customer = await tx.customers.create({
                data: {
                    restaurant_id: RID,
                    name: 'Test Audit Customer',
                    phone: '999999999',
                    credit_enabled: true
                }
            });

            const supplier = await tx.suppliers.create({
                data: {
                    restaurant_id: RID,
                    name: 'Test Audit Supplier',
                    phone: '888888888'
                }
            });

            // 2. SETUP ACCOUNTS
            const accounts = [
                { code: '1000', name: 'Cash', type: AccountType.ASSET },
                { code: '1010', name: 'Card', type: AccountType.ASSET },
                { code: '1040', name: 'Customer AR', type: AccountType.ASSET },
                { code: '1060', name: 'Inventory', type: AccountType.ASSET },
                { code: '2020', name: 'Supplier AP', type: AccountType.LIABILITY },
                { code: '2030', name: 'Service Charge Payable', type: AccountType.LIABILITY },
                { code: '2100', name: 'Sales Tax Payable', type: AccountType.LIABILITY },
                { code: '4000', name: 'F&B Revenue', type: AccountType.REVENUE },
                { code: '4010', name: 'Delivery Revenue', type: AccountType.REVENUE },
                { code: '4020', name: 'Rounding Differences', type: AccountType.REVENUE },
                { code: '5000', name: 'COGS', type: AccountType.EXPENSE }
            ];

            const accountMap: Record<string, string> = {};
            for (const acc of accounts) {
                const created = await tx.chart_of_accounts.create({
                    data: {
                        restaurant_id: RID,
                        code: acc.code,
                        name: acc.name,
                        type: acc.type,
                        is_system: true
                    }
                });
                accountMap[acc.code] = created.id;
            }
            console.log('[SETUP] COA Provisioned');

            // --- T01: Cash Sale ---
            const order1 = await tx.orders.create({ data: { restaurant_id: RID, type: OrderType.DINE_IN, total: 1000, tax: 137.93, tax_type: TaxType.INCLUSIVE, payment_status: PaymentStatus.PAID, status: OrderStatus.CLOSED } });
            await tx.journal_entries.create({
                data: { restaurant_id: RID, reference_type: 'ORDER_SALE', reference_id: 'T01', date: new Date(), description: 'Cash Sale T01',
                    lines: { create: [
                        { account_id: accountMap['1000'], debit: 1000.00, credit: 0, reference_type: 'ORDER', reference_id: order1.id },
                        { account_id: accountMap['2100'], debit: 0, credit: 137.93, reference_type: 'ORDER', reference_id: order1.id },
                        { account_id: accountMap['4000'], debit: 0, credit: 862.07, reference_type: 'ORDER', reference_id: order1.id }
                    ] }
                }
            });
            console.log('[T01] Done.');

            // --- T02: Card Sale + SC ---
            const order2 = await tx.orders.create({ data: { restaurant_id: RID, type: OrderType.DINE_IN, total: 2200, service_charge: 200, tax: 275.86, tax_type: TaxType.INCLUSIVE, payment_status: PaymentStatus.PAID, status: OrderStatus.CLOSED } });
            await tx.journal_entries.create({
                data: { restaurant_id: RID, reference_type: 'ORDER_SALE', reference_id: 'T02', date: new Date(), description: 'Card Sale T02',
                    lines: { create: [
                        { account_id: accountMap['1010'], debit: 2200.00, credit: 0, reference_type: 'ORDER', reference_id: order2.id },
                        { account_id: accountMap['2100'], debit: 0, credit: 275.86, reference_type: 'ORDER', reference_id: order2.id },
                        { account_id: accountMap['2030'], debit: 0, credit: 200.00, reference_type: 'ORDER', reference_id: order2.id },
                        { account_id: accountMap['4000'], debit: 0, credit: 1724.14, reference_type: 'ORDER', reference_id: order2.id }
                    ] }
                }
            });
            console.log('[T02] Done.');

            // --- T03: Split Payment ---
            const order3 = await tx.orders.create({ data: { restaurant_id: RID, type: OrderType.DINE_IN, total: 3000, tax: 413.79, tax_type: TaxType.INCLUSIVE, payment_status: PaymentStatus.PAID, status: OrderStatus.CLOSED } });
            await tx.journal_entries.create({
                data: { restaurant_id: RID, reference_type: 'ORDER_SALE', reference_id: 'T03', date: new Date(), description: 'Split Payment T03',
                    lines: { create: [
                        { account_id: accountMap['1000'], debit: 1500.00, credit: 0, reference_type: 'ORDER', reference_id: order3.id },
                        { account_id: accountMap['1010'], debit: 1500.00, credit: 0, reference_type: 'ORDER', reference_id: order3.id },
                        { account_id: accountMap['2100'], debit: 0, credit: 413.79, reference_type: 'ORDER', reference_id: order3.id },
                        { account_id: accountMap['4000'], debit: 0, credit: 2586.21, reference_type: 'ORDER', reference_id: order3.id }
                    ] }
                }
            });
            console.log('[T03] Done.');

            // --- T04: Credit Sale ---
            const order4 = await tx.orders.create({ data: { restaurant_id: RID, customer_id: customer.id, type: OrderType.DINE_IN, total: 1500, tax: 206.90, tax_type: TaxType.INCLUSIVE, payment_status: PaymentStatus.PAID, status: OrderStatus.CLOSED } });
            await tx.journal_entries.create({
                data: { restaurant_id: RID, reference_type: 'ORDER_SALE', reference_id: 'T04', date: new Date(), description: 'Credit Sale T04',
                    lines: { create: [
                        { account_id: accountMap['1040'], debit: 1500.00, credit: 0, reference_type: 'ORDER', reference_id: order4.id },
                        { account_id: accountMap['2100'], debit: 0, credit: 206.90, reference_type: 'ORDER', reference_id: order4.id },
                        { account_id: accountMap['4000'], debit: 0, credit: 1293.10, reference_type: 'ORDER', reference_id: order4.id }
                    ] }
                }
            });
            await tx.customer_ledgers.create({ data: { restaurant_id: RID, customer_id: customer.id, order_id: order4.id, entry_type: CustomerLedgerEntryType.CHARGE, amount: 1500.00, balance_after: 1500.00, description: 'Credit Sale T04' } });
            console.log('[T04] Done.');

            // --- T05: Void Reversal ---
            await tx.journal_entries.create({
                data: { restaurant_id: RID, reference_type: 'ORDER_VOID', reference_id: 'T05', date: new Date(), description: 'Void Reversal of T01',
                    lines: { create: [
                        { account_id: accountMap['1000'], debit: 0, credit: 1000.00, reference_type: 'ORDER', reference_id: order1.id },
                        { account_id: accountMap['2100'], debit: 137.93, credit: 0, reference_type: 'ORDER', reference_id: order1.id },
                        { account_id: accountMap['4000'], debit: 862.07, credit: 0, reference_type: 'ORDER', reference_id: order1.id }
                    ] }
                }
            });
            console.log('[T05] Done.');

            // --- BLOCK F: Delivery Sale [T06] ---
            console.log('[T06] Executing Delivery Sale...');
            const order6 = await tx.orders.create({
                data: {
                    restaurant_id: RID,
                    type: OrderType.DELIVERY,
                    total: 1100, // 1000 food + 100 fee
                    delivery_fee: 100,
                    tax: 137.93,
                    tax_type: TaxType.INCLUSIVE,
                    payment_status: PaymentStatus.PAID,
                    status: OrderStatus.CLOSED
                }
            });
            await tx.journal_entries.create({
                data: {
                    restaurant_id: RID,
                    reference_type: 'ORDER_SALE',
                    reference_id: 'T06',
                    date: new Date(),
                    description: 'Delivery Sale T06',
                    lines: {
                        create: [
                            { account_id: accountMap['1000'], debit: 1100.00, credit: 0, reference_type: 'ORDER', reference_id: order6.id },
                            { account_id: accountMap['2100'], debit: 0, credit: 137.93, reference_type: 'ORDER', reference_id: order6.id },
                            { account_id: accountMap['4000'], debit: 0, credit: 862.07, reference_type: 'ORDER', reference_id: order6.id },
                            { account_id: accountMap['4010'], debit: 0, credit: 100.00, reference_type: 'ORDER', reference_id: order6.id }
                        ]
                    }
                }
            });
            console.log('[T06] Done.');

            // --- BLOCK G: Supplier Bill [T07] ---
            console.log('[T07] Executing Supplier Bill (Corrected: 2,000)...');
            const po7 = await tx.purchase_orders.create({
                data: {
                    restaurant_id: RID,
                    supplier_id: supplier.id,
                    po_number: 'PO-AUDIT-001',
                    total_amount: 2000.00,
                    status: 'RECEIVED'
                }
            });
            await tx.journal_entries.create({
                data: {
                    restaurant_id: RID,
                    reference_type: 'INVENTORY_PURCHASE',
                    reference_id: 'T07',
                    date: new Date(),
                    description: 'Inventory Purchase T07',
                    lines: {
                        create: [
                            { account_id: accountMap['1060'], debit: 2000.00, credit: 0, reference_type: 'PO', reference_id: po7.id },
                            { account_id: accountMap['2020'], debit: 0, credit: 2000.00, reference_type: 'PO', reference_id: po7.id }
                        ]
                    }
                }
            });
            await tx.supplier_ledgers.create({
                data: {
                    restaurant_id: RID,
                    supplier_id: supplier.id,
                    entry_type: SupplierLedgerEntryType.BILL,
                    amount: 2000.00,
                    balance_after: 2000.00,
                    description: 'Inventory Purchase T07'
                }
            });
            console.log('[T07] Done.');

            // --- BLOCK H: Rounding Difference [T08] ---
            console.log('[T08] Executing Rounding Difference logic...');
            const order8 = await tx.orders.create({
                data: {
                    restaurant_id: RID,
                    type: OrderType.DINE_IN,
                    total: 1001.00, // Settled amount
                    tax: 138.01,
                    tax_type: TaxType.INCLUSIVE,
                    payment_status: PaymentStatus.PAID,
                    status: OrderStatus.CLOSED
                }
            });
            await tx.journal_entries.create({
                data: {
                    restaurant_id: RID,
                    reference_type: 'ORDER_SALE',
                    reference_id: 'T08',
                    date: new Date(),
                    description: 'Rounding Sale T08',
                    lines: {
                        create: [
                            { account_id: accountMap['1000'], debit: 1001.00, credit: 0, reference_type: 'ORDER', reference_id: order8.id },
                            { account_id: accountMap['2100'], debit: 0, credit: 138.01, reference_type: 'ORDER', reference_id: order8.id },
                            { account_id: accountMap['4000'], debit: 0, credit: 862.54, reference_type: 'ORDER', reference_id: order8.id },
                            { account_id: accountMap['4020'], debit: 0, credit: 0.45, reference_type: 'ORDER', reference_id: order8.id }
                        ]
                    }
                }
            });
            console.log('[T08] Done.');

            // --- FINAL CUMULATIVE TRIAL BALANCE ---
            console.log('\n--- FINAL CUMULATIVE TRIAL BALANCE (T01-T08) ---');
            const allLines = await tx.journal_entry_lines.findMany({
                where: { journal_entries: { restaurant_id: RID } },
                include: { chart_of_accounts: true }
            });

            const trialBalance: Record<string, { name: string, debit: Decimal, credit: Decimal }> = {};
            for (const line of allLines) {
                const code = line.chart_of_accounts.code;
                if (!trialBalance[code]) {
                    trialBalance[code] = { name: line.chart_of_accounts.name, debit: new Decimal(0), credit: new Decimal(0) };
                }
                trialBalance[code].debit = trialBalance[code].debit.add(line.debit);
                trialBalance[code].credit = trialBalance[code].credit.add(line.credit);
            }

            let totalDebit = new Decimal(0);
            let totalCredit = new Decimal(0);

            Object.keys(trialBalance).sort().forEach(code => {
                const entry = trialBalance[code];
                const net = entry.debit.minus(entry.credit);
                const valStr = net.abs().toString();
                const display = net.isPositive() ? `DR ${valStr}` : `CR ${valStr}`;
                console.log(`${code} | ${entry.name.padEnd(25)} | ${display}`);
                totalDebit = totalDebit.add(entry.debit);
                totalCredit = totalCredit.add(entry.credit);
            });

            console.log('-------------------------------------------');
            console.log(`TOTAL DEBIT : ${totalDebit.toString()}`);
            console.log(`TOTAL CREDIT: ${totalCredit.toString()}`);
            
            if (!totalDebit.equals(totalCredit)) {
                console.error('CRITICAL ERROR: Trial Balance Out of Balance!');
            } else {
                console.log('STATUS: Balanced.');
            }

            // Verify account 4020
            const roundingAcc = trialBalance['4020'];
            if (roundingAcc && roundingAcc.credit.minus(roundingAcc.debit).equals(0.45)) {
                console.log('VERIFICATION: Rounding Account (4020) is EXACTLY 0.45 CR. [PASS]');
            } else {
                console.warn(`VERIFICATION: Rounding Account (4020) is ${roundingAcc?.credit.minus(roundingAcc?.debit).toString() || '0'}. [FAIL]`);
            }
        });
        
        console.log('\n--- VALIDATION COMPLETE ---');
    } catch (error) {
        console.error('\n!!! VALIDATION FAILED !!!');
        console.error(error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
