/**
 * JournalEntryService.ts
 * ──────────────────────────────────────────────────────────────────────────
 * Automated Double-Entry Accounting Engine for Fireflow.
 *
 * Standard GL Code Conventions (matches the seeder below):
 *
 *   1000  Cash & Cash Equivalents       [ASSET]
 *   1010  Card / Digital Receivables    [ASSET]
 *   1020  Rider Receivables             [ASSET]
 *   2000  Tax Payable                   [LIABILITY]
 *   2010  Service Charge Payable        [LIABILITY]
 *   4000  Food & Beverage Revenue       [REVENUE]
 *   4010  Delivery Fee Revenue          [REVENUE]
 *   5000  Rider Payouts / Expenses      [EXPENSE]
 *   5010  General Expenses              [EXPENSE]
 *
 * If a restaurant has NOT seeded the COA yet, the engine gracefully skips.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { prisma } from '../../shared/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

// ─── Account code constants ───────────────────────────────────────────────
const GL = {
    CASH: '1000',
    CARD_RECEIVABLE: '1010',
    BANK: '1010',
    RIDER_RECEIVABLE: '1050',
    RIDER_WALLET: '1050',
    CUSTOMER_ACCOUNT: '1040',
    TAX_PAYABLE: '2100',
    SALES_TAX: '2100',
    SC_PAYABLE: '4100',
    SERVICE_CHARGE: '4100',
    FOOD_REVENUE: '4000',
    REVENUE: '4000',
    DELIVERY_REVENUE: '4200',
    DELIVERY_FEE: '4200',
    RIDER_EXPENSE: '5000',
    COGS: '5000',
    GENERAL_EXPENSE: '5100',
    EXPENSE: '5100'
} as const;

type GLCode = typeof GL[keyof typeof GL];

// ─── Internal helpers ─────────────────────────────────────────────────────

async function resolveAccount(restaurantId: string, code: GLCode, tx?: any) {
    const db = tx || prisma;
    return db.chart_of_accounts.findFirst({
        where: { restaurant_id: restaurantId, code, is_active: true }
    });
}

interface JELine {
    accountId: string;
    description?: string;
    debit?: Decimal;
    credit?: Decimal;
}

async function postJournal(params: {
    restaurantId: string;
    referenceType: string;
    referenceId?: string;
    date: Date;
    description: string;
    processedBy?: string;
    lines: JELine[];
}, tx?: any) {
    const db = tx || prisma;

    // Guard: every journal must balance (sum debits === sum credits)
    const totalDebit = params.lines.reduce((s, l) => s.plus(l.debit || 0), new Decimal(0));
    const totalCredit = params.lines.reduce((s, l) => s.plus(l.credit || 0), new Decimal(0));

    if (!totalDebit.equals(totalCredit)) {
        console.error(
            `[JE] Imbalanced journal rejected for ${params.referenceType}/${params.referenceId}: ` +
            `DR ${totalDebit} ≠ CR ${totalCredit}`
        );
        return null;
    }

    const je = await db.journal_entries.create({
        data: {
            restaurant_id: params.restaurantId,
            reference_type: params.referenceType,
            reference_id: params.referenceId,
            date: params.date,
            description: params.description,
            processed_by: params.processedBy,
            lines: {
                create: params.lines.map(l => ({
                    account_id: l.accountId,
                    description: l.description,
                    debit: l.debit || new Decimal(0),
                    credit: l.credit || new Decimal(0),
                }))
            }
        }
    });

    return je;
}

// ─── Public API ───────────────────────────────────────────────────────────

export class JournalEntryService {

    /**
     * POST ORDER SALE JOURNAL
     * ─────────────────────────────────────────────────────────────────────
     * Called when an order is CLOSED / settled.
     *
     * Pattern for a Cash Dine-In / Takeaway order:
     *   DR  1000  Cash & Cash Equivalents       total  (asset increases)
     *   CR  4000  Food & Beverage Revenue        net    (revenue earned)
     *   CR  2000  Tax Payable                    tax    (liability created)
     *   CR  2010  Service Charge Payable         sc     (liability created)
     *
     * Pattern for a Card payment:
     *   DR  1010  Card Receivables               total  (asset – pending settlement)
     *   CR  …     (same revenue / liability lines)
     *
     * Pattern for a Delivery order (rider carries cash):
     *   DR  1020  Rider Receivables              total  (rider owes us)
     *   CR  …     (same revenue / liability lines)
     *   DR  4010  Delivery Fee Revenue included in net (already part of total)
     */
    async recordOrderSaleJournal(orderId: string, tx?: any) {
        const db = tx || prisma;

        // Idempotency: skip if already journalised
        const existing = await db.journal_entries.findFirst({
            where: { reference_type: 'ORDER_SALE', reference_id: orderId }
        });
        if (existing) return;

        const order = await db.orders.findUnique({
            where: { id: orderId },
            include: { transactions: true }
        });
        if (!order) return;

        const restaurantId = order.restaurant_id;

        // Resolve accounts – if not yet seeded, silently skip
        const [cashAcc, cardAcc, riderAcc, taxAcc, scAcc, foodRevAcc, delivRevAcc] =
            await Promise.all([
                resolveAccount(restaurantId, GL.CASH, db),
                resolveAccount(restaurantId, GL.CARD_RECEIVABLE, db),
                resolveAccount(restaurantId, GL.RIDER_RECEIVABLE, db),
                resolveAccount(restaurantId, GL.TAX_PAYABLE, db),
                resolveAccount(restaurantId, GL.SC_PAYABLE, db),
                resolveAccount(restaurantId, GL.FOOD_REVENUE, db),
                resolveAccount(restaurantId, GL.DELIVERY_REVENUE, db),
            ]);

        if (!foodRevAcc) {
            // COA not seeded – skip silently (backwards-compatible)
            return;
        }

        const total = new Decimal(order.total || 0);
        const tax = new Decimal(order.tax || 0);
        const sc = new Decimal(order.service_charge || 0);
        const deliveryFee = new Decimal(order.delivery_fee || 0);
        // Net food revenue = total – tax – sc (delivery fee stays in food revenue here)
        const netRevenue = total.minus(tax).minus(sc);

        // ── Determine debit (asset) side ──────────────────────────────────
        const lines: JELine[] = [];

        if (order.type === 'DELIVERY' && order.assigned_driver_id && riderAcc) {
            lines.push({
                accountId: riderAcc.id,
                description: `Rider receivable – Order #${order.order_number}`,
                debit: total,
            });
        } else {
            // Figure out payment method from transactions
            const cardPayment = (order.transactions as any[]).find(
                (t: any) => t.payment_method === 'CARD' && t.type === 'PAYMENT'
            );
            const assetAcc = cardPayment && cardAcc ? cardAcc : cashAcc;
            if (assetAcc) {
                lines.push({
                    accountId: assetAcc.id,
                    description: `Payment received – Order #${order.order_number}`,
                    debit: total,
                });
            } else {
                return; // No asset account found; skip
            }
        }

        // ── Credit side: Revenue + Liabilities ───────────────────────────
        // Food / Beverage Revenue (net, excluding delivery fee)
        const foodRev = netRevenue.minus(deliveryFee).greaterThanOrEqualTo(0)
            ? netRevenue.minus(deliveryFee)
            : netRevenue;

        lines.push({
            accountId: foodRevAcc.id,
            description: `F&B Revenue – Order #${order.order_number}`,
            credit: foodRev,
        });

        // Delivery Fee Revenue (if applicable)
        if (deliveryFee.greaterThan(0) && delivRevAcc) {
            lines.push({
                accountId: delivRevAcc.id,
                description: `Delivery Fee – Order #${order.order_number}`,
                credit: deliveryFee,
            });
        }

        // Tax Payable
        if (tax.greaterThan(0) && taxAcc) {
            lines.push({
                accountId: taxAcc.id,
                description: `Sales Tax – Order #${order.order_number}`,
                credit: tax,
            });
        }

        // Service Charge Payable
        if (sc.greaterThan(0) && scAcc) {
            lines.push({
                accountId: scAcc.id,
                description: `Service Charge – Order #${order.order_number}`,
                credit: sc,
            });
        }

        await postJournal({
            restaurantId,
            referenceType: 'ORDER_SALE',
            referenceId: orderId,
            date: new Date(),
            description: `${order.type} Sale – Order #${order.order_number}`,
            processedBy: order.last_action_by || undefined,
            lines,
        }, db);
    }

    /**
     * POST RIDER SETTLEMENT JOURNAL
     * ─────────────────────────────────────────────────────────────────────
     * When a rider hands cash over to the manager.
     *
     *   DR  1000  Cash & Cash Equivalents        amount   (cash arrives in drawer)
     *   CR  1020  Rider Receivables              amount   (rider debt cleared)
     */
    async recordRiderSettlementJournal(params: {
        restaurantId: string;
        riderId: string;
        amount: number | Decimal;
        settlementId: string;
        processedBy?: string;
    }, tx?: any) {
        const db = tx || prisma;

        const existing = await db.journal_entries.findFirst({
            where: { reference_type: 'RIDER_SETTLEMENT', reference_id: params.settlementId }
        });
        if (existing) return;

        const [cashAcc, riderAcc] = await Promise.all([
            resolveAccount(params.restaurantId, GL.CASH, db),
            resolveAccount(params.restaurantId, GL.RIDER_RECEIVABLE, db),
        ]);

        if (!cashAcc || !riderAcc) return;

        const amount = new Decimal(params.amount.toString());

        await postJournal({
            restaurantId: params.restaurantId,
            referenceType: 'RIDER_SETTLEMENT',
            referenceId: params.settlementId,
            date: new Date(),
            description: `Rider Cash Settlement`,
            processedBy: params.processedBy,
            lines: [
                { accountId: cashAcc.id, description: 'Cash received from rider', debit: amount },
                { accountId: riderAcc.id, description: 'Rider receivable cleared', credit: amount },
            ],
        }, db);
    }

    /**
     * POST PAYOUT / EXPENSE JOURNAL
     * ─────────────────────────────────────────────────────────────────────
     *   DR  5010  General Expenses               amount
     *   CR  1000  Cash & Cash Equivalents        amount
     */
    async recordPayoutJournal(params: {
        restaurantId: string;
        amount: number | Decimal;
        payoutId: string;
        category: string;
        notes: string;
        processedBy?: string;
    }, tx?: any) {
        const db = tx || prisma;

        const existing = await db.journal_entries.findFirst({
            where: { reference_type: 'PAYOUT', reference_id: params.payoutId }
        });
        if (existing) return;

        const glCode = params.category === 'RIDER' ? GL.RIDER_EXPENSE : GL.GENERAL_EXPENSE;

        const [expenseAcc, cashAcc] = await Promise.all([
            resolveAccount(params.restaurantId, glCode, db),
            resolveAccount(params.restaurantId, GL.CASH, db),
        ]);

        if (!expenseAcc || !cashAcc) return;

        const amount = new Decimal(params.amount.toString());

        await postJournal({
            restaurantId: params.restaurantId,
            referenceType: 'PAYOUT',
            referenceId: params.payoutId,
            date: new Date(),
            description: `Payout [${params.category}]: ${params.notes}`,
            processedBy: params.processedBy,
            lines: [
                { accountId: expenseAcc.id, description: `${params.category} expense`, debit: amount },
                { accountId: cashAcc.id, description: 'Cash paid out', credit: amount },
            ],
        }, db);
    }

    /**
     * FETCH TRIAL BALANCE
     * ─────────────────────────────────────────────────────────────────────
     * Aggregates all journal_entry_lines by account, returning net DR / CR.
     */
    async getTrialBalance(restaurantId: string, from?: Date, to?: Date) {
        const accounts = await prisma.chart_of_accounts.findMany({
            where: { restaurant_id: restaurantId, is_active: true },
            orderBy: { code: 'asc' }
        });

        const dateFilter: any = {};
        if (from) dateFilter.gte = from;
        if (to) dateFilter.lte = to;

        const lines = await prisma.journal_entry_lines.findMany({
            where: {
                chart_of_accounts: { restaurant_id: restaurantId },
                ...(from || to ? {
                    journal_entries: { date: dateFilter }
                } : {})
            },
            include: {
                chart_of_accounts: { select: { code: true, name: true, type: true } }
            }
        });

        const totals: Record<string, { code: string; name: string; type: string; debit: Decimal; credit: Decimal }> = {};

        for (const acc of accounts) {
            totals[acc.id] = {
                code: acc.code,
                name: acc.name,
                type: acc.type as string,
                debit: new Decimal(0),
                credit: new Decimal(0),
            };
        }

        for (const line of lines) {
            const row = totals[line.account_id];
            if (row) {
                row.debit = row.debit.plus(new Decimal(line.debit.toString()));
                row.credit = row.credit.plus(new Decimal(line.credit.toString()));
            }
        }

        return Object.values(totals).filter(r => r.debit.greaterThan(0) || r.credit.greaterThan(0));
    }

    /**
     * SEED DEFAULT COA
     * ─────────────────────────────────────────────────────────────────────
     * Call once per restaurant on first setup. Idempotent (upsert on code).
     */
    async seedDefaultCOA(restaurantId: string) {
        const accounts = [
            { code: '1000', name: 'Cash & Cash Equivalents', type: 'ASSET', description: 'Physical cash in POS drawer' },
            { code: '1010', name: 'Card / Digital Receivables', type: 'ASSET', description: 'Card payments pending bank settlement' },
            { code: '1020', name: 'Rider Receivables', type: 'ASSET', description: 'Cash held by active delivery riders' },
            { code: '2000', name: 'Sales Tax Payable', type: 'LIABILITY', description: 'Tax collected on behalf of government' },
            { code: '2010', name: 'Service Charge Payable', type: 'LIABILITY', description: 'Service charge collected from customers' },
            { code: '4000', name: 'Food & Beverage Revenue', type: 'REVENUE', description: 'Core restaurant sales' },
            { code: '4010', name: 'Delivery Fee Revenue', type: 'REVENUE', description: 'Customer-paid delivery charges' },
            { code: '5000', name: 'Rider Payroll & Floats', type: 'EXPENSE', description: 'Rider float issuances and wage payouts' },
            { code: '5010', name: 'General Operating Expenses', type: 'EXPENSE', description: 'Supplier payments, petty cash, other outflows' },
        ];

        const results = [];
        for (const acc of accounts) {
            const existing = await prisma.chart_of_accounts.findFirst({
                where: { restaurant_id: restaurantId, code: acc.code }
            });

            if (!existing) {
                const created = await prisma.chart_of_accounts.create({
                    data: { ...acc, restaurant_id: restaurantId, type: acc.type as any }
                });
                results.push(created);
            }
        }

        return results;
    }

    /**
     * Records a journal entry for a credit sale (Khata).
     * IMPACT:
     * DR 1040 Customer Account (Asset Increase)
     * CR 4000 Revenue (Revenue Increase)
     * CR 2100 Tax (Liability Increase)
     */
    async recordCreditSaleJournal(orderId: string, tx?: any) {
        const db = tx || prisma;

        // Idempotency check: Does a JE already exist for this order?
        const existing = await db.journal_entries.findFirst({
            where: { reference_id: orderId, reference_type: 'ORDER' }
        });
        if (existing) return;

        const order = await db.orders.findUnique({
            where: { id: orderId },
            include: { order_items: true }
        });

        if (!order || !order.customer_id) return;

        const restaurantId = order.restaurant_id;
        const [customerAcc, revenueAcc, scAcc, taxAcc] = await Promise.all([
            resolveAccount(restaurantId, GL.CUSTOMER_ACCOUNT, db),
            resolveAccount(restaurantId, GL.REVENUE, db),
            resolveAccount(restaurantId, GL.SERVICE_CHARGE, db),
            resolveAccount(restaurantId, GL.SALES_TAX, db)
        ]);

        if (!customerAcc || !revenueAcc) return;

        const total = new Decimal(order.total.toString());
        const tax = new Decimal((order.tax || 0).toString());
        const sc = new Decimal((order.service_charge || 0).toString());
        const revenue = total.minus(tax).minus(sc);

        const lines: JELine[] = [
            // DEBIT: Customer Ledger
            { accountId: customerAcc.id, debit: total, credit: new Decimal(0), description: `Credit sale to customer #${order.customer_id.slice(-6)}` },
            
            // CREDIT: Revenue
            { accountId: revenueAcc.id, debit: new Decimal(0), credit: revenue, description: `Revenue from Order #${order.order_number}` },
        ];

        if (sc.gt(0) && scAcc) {
            lines.push({ accountId: scAcc.id, debit: new Decimal(0), credit: sc, description: `SC from Order #${order.order_number}` });
        }

        if (tax.gt(0) && taxAcc) {
            lines.push({ accountId: taxAcc.id, debit: new Decimal(0), credit: tax, description: `Tax from Order #${order.order_number}` });
        }

        await postJournal({
            restaurantId: order.restaurant_id,
            date: new Date(),
            referenceType: 'ORDER',
            referenceId: order.id,
            description: `Credit Sale: Order #${order.order_number}`,
            processedBy: order.last_action_by || 'SYSTEM',
            lines
        }, db);
    }

    /**
     * Records a journal entry for a customer payment.
     * IMPACT:
     * DR 1000 Cash / 1010 Bank (Asset Increase)
     * CR 1040 Customer Account (Asset Decrease)
     */
    async recordCustomerPaymentJournal(data: {
        restaurantId: string;
        customerId: string;
        amount: number | Decimal;
        method: 'CASH' | 'BANK';
        processedBy: string;
        referenceId?: string;
        notes?: string;
    }, tx?: any) {
        const db = tx || prisma;
        const amount = new Decimal(data.amount.toString());
        const assetCode = data.method === 'CASH' ? GL.CASH : GL.BANK;

        const [assetAcc, customerAcc] = await Promise.all([
            resolveAccount(data.restaurantId, assetCode, db),
            resolveAccount(data.restaurantId, GL.CUSTOMER_ACCOUNT, db)
        ]);

        if (!assetAcc || !customerAcc) return;

        const lines: JELine[] = [
            // DEBIT: Asset (Cash/Bank)
            { accountId: assetAcc.id, debit: amount, credit: new Decimal(0), description: `Payment from customer #${data.customerId.slice(-6)}` },
            
            // CREDIT: Customer Ledger
            { accountId: customerAcc.id, debit: new Decimal(0), credit: amount, description: `Balance reduction for customer #${data.customerId.slice(-6)}` }
        ];

        await postJournal({
            restaurantId: data.restaurantId,
            date: new Date(),
            referenceType: 'PAYMENT',
            referenceId: data.referenceId,
            description: data.notes || `Customer Payment received via ${data.method}`,
            processedBy: data.processedBy,
            lines
        }, db);
    }

    /**
     * Calculates the current net balance for a customer from the Journal.
     * Logic: Sum(Debits) - Sum(Credits) on account 1040 for specific customer.
     * Note: Since JEs don't naturally store customer_id in lines, we rely on 
     * ledger_entries for historical filtering or unique description parsing.
     * HOWEVER, for a robust system, we query ledger_entries which tracks account_id correctly.
     */
    async getCustomerBalance(restaurantId: string, customerId: string) {
        const entries = await prisma.ledger_entries.findMany({
            where: {
                restaurant_id: restaurantId,
                account_id: customerId
            }
        });

        // Debit increases customer debt, Credit decreases it
        return entries.reduce((acc: Decimal, entry: any) => {
            const amt = new Decimal(entry.amount);
            return entry.transaction_type === 'DEBIT'
                ? acc.plus(amt)
                : acc.minus(amt);
        }, new Decimal(0));
    }

    /**
     * Interprets balance for bilingual UI.
     */
    interpretCustomerBalance(balance: Decimal) {
        const val = balance.toNumber();
        if (val > 0) {
            return {
                amount: val,
                status: 'OWED',
                labelEn: `Customer owes Rs. ${val.toLocaleString()}`,
                labelUr: `کسٹمر کے ذمہ بقایا: ${val.toLocaleString()} روپے`,
                color: 'text-red-500'
            };
        } else if (val < 0) {
            const absVal = Math.abs(val);
            return {
                amount: absVal,
                status: 'ADVANCE',
                labelEn: `Advance Balance: Rs. ${absVal.toLocaleString()}`,
                labelUr: `ایڈوانس رقم: ${absVal.toLocaleString()} روپے`,
                color: 'text-emerald-500'
            };
        }
        return {
            amount: 0,
            status: 'CLEAR',
            labelEn: 'Balance Clear',
            labelUr: 'حساب برابر ہے',
            color: 'text-slate-400'
        };
    }
}

export const journalEntryService = new JournalEntryService();
