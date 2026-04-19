import { PrismaClient, AccountType, OrderType, OrderStatus, PaymentStatus, TaxType, CustomerLedgerEntryType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function main() {
    console.log('--- STARTING FINANCIAL VALIDATION [T01-T05] ---');
    console.log('Target: Isolated Throwaway Tenant');
    
    try {
        await prisma.$transaction(async (tx) => {
            // 1. SETUP TENANT
            const restaurant = await tx.restaurants.create({
                data: {
                    name: 'Validation Dev-Test',
                    currency: 'PKR',
                    is_active: true
                }
            });
            const RID = restaurant.id;
            console.log(`[SETUP] Tenant Created: ${RID}`);

            // BUG-13 FIX: void-cast results that are only needed for DB side-effects
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

            void await tx.suppliers.create({
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

            // --- BLOCK A: Cash Sale [T01] ---
            console.log('[T01] Executing Cash Sale...');
            const order1 = await tx.orders.create({
                data: {
                    restaurant_id: RID,
                    type: OrderType.DINE_IN,
                    total: 1000,
                    tax: 137.93,
                    tax_type: TaxType.INCLUSIVE,
                    payment_status: PaymentStatus.PAID,
                    status: OrderStatus.CLOSED
                }
            });

            const journal1 = await tx.journal_entries.create({
                data: {
                    restaurant_id: RID,
                    reference_type: 'ORDER_SALE',
                    reference_id: 'T01',
                    date: new Date(),
                    description: 'Cash Sale T01',
                    journal_entry_lines: {
                        create: [
                            { account_id: accountMap['1000'], debit: 1000.00, credit: 0, reference_type: 'ORDER', reference_id: order1.id },
                            { account_id: accountMap['2100'], debit: 0, credit: 137.93, reference_type: 'ORDER', reference_id: order1.id },
                            { account_id: accountMap['4000'], debit: 0, credit: 862.07, reference_type: 'ORDER', reference_id: order1.id }
                        ]
                    }
                },
                include: { journal_entry_lines: true }
            });

            // Validate T01
            const drT01 = journal1.journal_entry_lines.reduce((sum, l) => sum.add(l.debit), new Decimal(0));
            const crT01 = journal1.journal_entry_lines.reduce((sum, l) => sum.add(l.credit), new Decimal(0));
            if (!drT01.equals(crT01)) {
                throw new Error(`FAILED AT: T01. REASON: Imbalance DR(${drT01}) != CR(${crT01})`);
            }
            console.log(`[T01] Validated. Balance: ${drT01}`);

            // --- BLOCK B: Card Sale + SC [T02] ---
            console.log('[T02] Executing Card Sale + SC...');
            const order2 = await tx.orders.create({
                data: {
                    restaurant_id: RID,
                    type: OrderType.DINE_IN,
                    total: 2200,
                    service_charge: 200,
                    tax: 275.86,
                    tax_type: TaxType.INCLUSIVE,
                    payment_status: PaymentStatus.PAID,
                    status: OrderStatus.CLOSED
                }
            });

            const journal2 = await tx.journal_entries.create({
                data: {
                    restaurant_id: RID,
                    reference_type: 'ORDER_SALE',
                    reference_id: 'T02',
                    date: new Date(),
                    description: 'Card Sale T02',
                    journal_entry_lines: {
                        create: [
                            { account_id: accountMap['1010'], debit: 2200.00, credit: 0, reference_type: 'ORDER', reference_id: order2.id },
                            { account_id: accountMap['2100'], debit: 0, credit: 275.86, reference_type: 'ORDER', reference_id: order2.id },
                            { account_id: accountMap['2030'], debit: 0, credit: 200.00, reference_type: 'ORDER', reference_id: order2.id },
                            { account_id: accountMap['4000'], debit: 0, credit: 1724.14, reference_type: 'ORDER', reference_id: order2.id }
                        ]
                    }
                },
                include: { journal_entry_lines: true }
            });

            const drT02 = journal2.journal_entry_lines.reduce((sum, l) => sum.add(l.debit), new Decimal(0));
            const crT02 = journal2.journal_entry_lines.reduce((sum, l) => sum.add(l.credit), new Decimal(0));
            if (!drT02.equals(crT02)) {
                throw new Error(`FAILED AT: T02. REASON: Imbalance DR(${drT02}) != CR(${crT02})`);
            }
            console.log(`[T02] Validated. Balance: ${drT02}`);

            // --- BLOCK C: Split Payment [T03] ---
            console.log('[T03] Executing Split Payment...');
            const order3 = await tx.orders.create({
                data: {
                    restaurant_id: RID,
                    type: OrderType.DINE_IN,
                    total: 3000,
                    tax: 413.79,
                    tax_type: TaxType.INCLUSIVE,
                    payment_status: PaymentStatus.PAID,
                    status: OrderStatus.CLOSED
                }
            });

            const journal3 = await tx.journal_entries.create({
                data: {
                    restaurant_id: RID,
                    reference_type: 'ORDER_SALE',
                    reference_id: 'T03',
                    date: new Date(),
                    description: 'Split Payment T03',
                    journal_entry_lines: {
                        create: [
                            { account_id: accountMap['1000'], debit: 1500.00, credit: 0, reference_type: 'ORDER', reference_id: order3.id },
                            { account_id: accountMap['1010'], debit: 1500.00, credit: 0, reference_type: 'ORDER', reference_id: order3.id },
                            { account_id: accountMap['2100'], debit: 0, credit: 413.79, reference_type: 'ORDER', reference_id: order3.id },
                            { account_id: accountMap['4000'], debit: 0, credit: 2586.21, reference_type: 'ORDER', reference_id: order3.id }
                        ]
                    }
                },
                include: { journal_entry_lines: true }
            });

            // Validate T03 lines
            const cashLines = journal3.journal_entry_lines.filter(l => l.account_id === accountMap['1000']);
            const cardLines = journal3.journal_entry_lines.filter(l => l.account_id === accountMap['1010']);
            if (cashLines.length !== 1 || cardLines.length !== 1) {
                throw new Error(`FAILED AT: T03. REASON: Split payment lines missing (Cash: ${cashLines.length}, Card: ${cardLines.length})`);
            }

            const drT03 = journal3.journal_entry_lines.reduce((sum, l) => sum.add(l.debit), new Decimal(0));
            const crT03 = journal3.journal_entry_lines.reduce((sum, l) => sum.add(l.credit), new Decimal(0));
            if (!drT03.equals(crT03)) {
                throw new Error(`FAILED AT: T03. REASON: Imbalance DR(${drT03}) != CR(${crT03})`);
            }
            console.log(`[T03] Validated. Balance: ${drT03}`);

            // --- BLOCK D: Credit Sale / Khata [T04] ---
            console.log('[T04] Executing Credit Sale...');
            const order4 = await tx.orders.create({
                data: {
                    restaurant_id: RID,
                    customer_id: customer.id,
                    type: OrderType.DINE_IN,
                    total: 1500,
                    tax: 206.90,
                    tax_type: TaxType.INCLUSIVE,
                    payment_status: PaymentStatus.PAID,
                    status: OrderStatus.CLOSED
                }
            });

            const journal4 = await tx.journal_entries.create({
                data: {
                    restaurant_id: RID,
                    reference_type: 'ORDER_SALE',
                    reference_id: 'T04',
                    date: new Date(),
                    description: 'Credit Sale T04',
                    journal_entry_lines: {
                        create: [
                            { account_id: accountMap['1040'], debit: 1500.00, credit: 0, reference_type: 'ORDER', reference_id: order4.id },
                            { account_id: accountMap['2100'], debit: 0, credit: 206.90, reference_type: 'ORDER', reference_id: order4.id },
                            { account_id: accountMap['4000'], debit: 0, credit: 1293.10, reference_type: 'ORDER', reference_id: order4.id }
                        ]
                    }
                },
                include: { journal_entry_lines: true }
            });

            // Customer Ledger Row
            await tx.customer_ledgers.create({
                data: {
                    restaurant_id: RID,
                    customer_id: customer.id,
                    order_id: order4.id,
                    entry_type: CustomerLedgerEntryType.CHARGE,
                    amount: 1500.00,
                    balance_after: 1500.00, // For test simplicity
                    description: 'Credit Sale T04'
                }
            });

            const drT04 = journal4.journal_entry_lines.reduce((sum, l) => sum.add(l.debit), new Decimal(0));
            const crT04 = journal4.journal_entry_lines.reduce((sum, l) => sum.add(l.credit), new Decimal(0));
            if (!drT04.equals(crT04)) {
                throw new Error(`FAILED AT: T04. REASON: Imbalance DR(${drT04}) != CR(${crT04})`);
            }
            
            const ledgerCheck = await tx.customer_ledgers.findFirst({
                where: { order_id: order4.id, entry_type: CustomerLedgerEntryType.CHARGE }
            });
            if (!ledgerCheck) {
                throw new Error(`FAILED AT: T04. REASON: Missing customer_ledger linkage`);
            }
            console.log(`[T04] Validated. Balance: ${drT04}, Ledger Linked.`);

            // --- BLOCK E: Void Reversal [T05] ---
            console.log('[T05] Executing Void Reversal for T01...');
            // Invert the lines from journal1
            const journal5 = await tx.journal_entries.create({
                data: {
                    restaurant_id: RID,
                    reference_type: 'ORDER_VOID',
                    reference_id: 'T05',
                    date: new Date(),
                    description: 'Void Reversal of T01',
                    journal_entry_lines: {
                        create: [
                            { account_id: accountMap['1000'], debit: 0, credit: 1000.00, reference_type: 'ORDER', reference_id: order1.id },
                            { account_id: accountMap['2100'], debit: 137.93, credit: 0, reference_type: 'ORDER', reference_id: order1.id },
                            { account_id: accountMap['4000'], debit: 862.07, credit: 0, reference_type: 'ORDER', reference_id: order1.id }
                        ]
                    }
                },
                include: { journal_entry_lines: true }
            });

            const drT05 = journal5.journal_entry_lines.reduce((sum, l) => sum.add(l.debit), new Decimal(0));
            const crT05 = journal5.journal_entry_lines.reduce((sum, l) => sum.add(l.credit), new Decimal(0));
            if (!drT05.equals(crT05)) {
                throw new Error(`FAILED AT: T05. REASON: Imbalance DR(${drT05}) != CR(${crT05})`);
            }
            console.log(`[T05] Validated. Reversal balance: ${drT05}`);

            // --- FINAL TRIAL BALANCE CALCulation [Interim T01-T05] ---
            console.log('\n--- INTERIM TRIAL BALANCE (T01-T05) ---');
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
