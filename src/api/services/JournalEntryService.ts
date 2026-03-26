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
    RIDER_RECEIVABLE: '1020',
    TAX_PAYABLE: '2000',
    SC_PAYABLE: '2010',
    FOOD_REVENUE: '4000',
    DELIVERY_REVENUE: '4010',
    RIDER_EXPENSE: '5000',
    GENERAL_EXPENSE: '5010',
    CUSTOMER_ACCOUNT: '1040',
    SUPPLIER_PAYABLE: '2020',
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
  referenceType: string;   // REQUIRED — no optional
  referenceId: string;     // REQUIRED — no optional
  meta?: Record<string, any>;
}

async function postJournal(params: {
  restaurantId: string;
  referenceType: string;
  referenceId: string;
  date: Date;
  description: string;
  processedBy?: string;
  lines: JELine[];
}, tx: any): Promise<any> {  // tx is now REQUIRED — no default to prisma

  // Guard 1: Transaction client is mandatory
  if (!tx) {
    throw new Error('[JE] postJournal() MUST be called inside a DB transaction. tx is required.');
  }

  // Guard 2: Minimum 2 lines
  if (!params.lines || params.lines.length < 2) {
    throw new Error(`[JE] Journal for ${params.referenceType}/${params.referenceId} requires at least 2 lines.`);
  }

  // Guard 3: Every line must have referenceType and referenceId
  for (const line of params.lines) {
    if (!line.referenceType || !line.referenceId) {
      throw new Error(
        `[JE] Every journal line must have referenceType and referenceId. ` +
        `Missing on line for account ${line.accountId}`
      );
    }
  }

  // Guard 4: Journal must balance (DR === CR) — use Decimal for precision
  const totalDebit = params.lines.reduce((s, l) => s.plus(l.debit || 0), new Decimal(0));
  const totalCredit = params.lines.reduce((s, l) => s.plus(l.credit || 0), new Decimal(0));

  if (!totalDebit.equals(totalCredit)) {
    throw new Error(
      `[JE] IMBALANCED JOURNAL REJECTED for ${params.referenceType}/${params.referenceId}: ` +
      `DR ${totalDebit} ≠ CR ${totalCredit}. Transaction will be rolled back.`
    );
  }

  // Guard 5: Non-zero journal
  if (totalDebit.isZero()) {
    throw new Error(`[JE] Zero-value journal rejected for ${params.referenceType}/${params.referenceId}`);
  }

  // Post the journal — INSIDE the provided transaction
  const je = await tx.journal_entries.create({
    data: {
      restaurant_id: params.restaurantId,
      reference_type: params.referenceType,
      reference_id: params.referenceId,
      date: params.date,
      description: params.description,
      processed_by: params.processedBy,
      lines: {
        create: params.lines.map((l: any) => ({
          account_id: l.accountId,
          description: l.description,
          debit: l.debit || new Decimal(0),
          credit: l.credit || new Decimal(0),
          reference_type: l.referenceType,
          reference_id: l.referenceId,
          meta: l.meta || undefined,
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
    async recordOrderSaleJournal(orderId: string, tx: any) {
        const db = tx;

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
        const [cashAcc, cardAcc, riderAcc, taxAcc, scAcc, foodRevAcc, delivRevAcc, customerAcc] =
            await Promise.all([
                resolveAccount(restaurantId, GL.CASH, db),
                resolveAccount(restaurantId, GL.CARD_RECEIVABLE, db),
                resolveAccount(restaurantId, GL.RIDER_RECEIVABLE, db),
                resolveAccount(restaurantId, GL.TAX_PAYABLE, db),
                resolveAccount(restaurantId, GL.SC_PAYABLE, db),
                resolveAccount(restaurantId, GL.FOOD_REVENUE, db),
                resolveAccount(restaurantId, GL.DELIVERY_REVENUE, db),
                resolveAccount(restaurantId, GL.CUSTOMER_ACCOUNT, db),
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
                referenceType: 'ORDER',
                referenceId: orderId,
                meta: { orderType: order.type, paymentMethod: 'CASH' }
            });
        } else {
            // Support Split Payments: Iterate through all paid transactions
            const transactions = (order.transactions as any[]) || [];
            
            for (const t of transactions) {
                if (t.status !== 'PAID') continue;

                const amount = new Decimal(t.amount);
                let assetAcc = cashAcc; // Default to Cash

                if (t.payment_method === 'CREDIT' && customerAcc) {
                    assetAcc = customerAcc;
                } else if (t.payment_method === 'CARD' && cardAcc) {
                    assetAcc = cardAcc;
                } else if (t.payment_method === 'RAAST' && cardAcc) { // Raast hits digital receivable
                    assetAcc = cardAcc;
                }

                if (assetAcc) {
                    lines.push({
                        accountId: assetAcc.id,
                        description: `Payment [${t.payment_method}] – Order #${order.order_number}`,
                        debit: amount,
                        referenceType: 'ORDER',
                        referenceId: orderId,
                        meta: { paymentMethod: t.payment_method }
                    });
                }
            }

            if (lines.length === 0 && cashAcc) {
                // Fallback for legacy orders with no transactions yet
                lines.push({
                    accountId: cashAcc.id,
                    description: `Payment received (CASH) – Order #${order.order_number}`,
                    debit: total,
                    referenceType: 'ORDER',
                    referenceId: orderId,
                    meta: { paymentMethod: 'CASH' }
                });
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
            referenceType: 'ORDER',
            referenceId: orderId,
        });

        // Delivery Fee Revenue (if applicable)
        if (deliveryFee.greaterThan(0) && delivRevAcc) {
            lines.push({
                accountId: delivRevAcc.id,
                description: `Delivery Fee – Order #${order.order_number}`,
                credit: deliveryFee,
                referenceType: 'ORDER',
                referenceId: orderId,
            });
        }

        // Tax Payable
        if (tax.greaterThan(0) && taxAcc) {
            lines.push({
                accountId: taxAcc.id,
                description: `Sales Tax – Order #${order.order_number}`,
                credit: tax,
                referenceType: 'ORDER',
                referenceId: orderId,
            });
        }

        // Service Charge Payable
        if (sc.greaterThan(0) && scAcc) {
            lines.push({
                accountId: scAcc.id,
                description: `Service Charge – Order #${order.order_number}`,
                credit: sc,
                referenceType: 'ORDER',
                referenceId: orderId,
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
    }, tx: any) {
        const db = tx;

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
                { accountId: cashAcc.id, description: 'Cash received from rider', debit: amount, referenceType: 'RIDER', referenceId: params.riderId, meta: { settlementId: params.settlementId } },
                { accountId: riderAcc.id, description: 'Rider receivable cleared', credit: amount, referenceType: 'RIDER', referenceId: params.riderId, meta: { settlementId: params.settlementId } },
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
    }, tx: any) {
        const db = tx;

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
                { accountId: expenseAcc.id, description: `${params.category} expense`, debit: amount, referenceType: 'PAYOUT', referenceId: params.payoutId, meta: { category: params.category } },
                { accountId: cashAcc.id, description: 'Cash paid out', credit: amount, referenceType: 'PAYOUT', referenceId: params.payoutId, meta: { category: params.category } },
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
            { code: '2020', name: 'Accounts Payable (Suppliers)', type: 'LIABILITY', description: 'Outstanding balances owed to vendors' },
        ];

        const results = [];
        for (const acc of accounts) {
            const existing = await prisma.chart_of_accounts.findFirst({
                where: { restaurant_id: restaurantId, code: acc.code }
            });

            if (!existing) {
                const created = await prisma.chart_of_accounts.create({
                    data: { ...acc, restaurant_id: restaurantId, type: acc.type as any, is_system: true }
                });
                results.push(created);
            }
        }

        return results;
    }

    /**
     * POST CREDIT SALE JOURNAL
     * Customer buys on credit — added to their khata.
     *
     * DR  1040  Customer Account     total  (customer now owes us)
     * CR  4000  Food Revenue          net   (revenue earned)
     * CR  2000  Tax Payable           tax   (if applicable)
     * CR  2010  Service Charge        sc    (if applicable)
     */
    async recordCreditSaleJournal(orderId: string, customerId: string, tx: any) {
        const db = tx;

        // Idempotency
        const existing = await db.journal_entries.findFirst({
            where: { reference_type: 'CREDIT_SALE', reference_id: orderId }
        });
        if (existing) return;

        const order = await db.orders.findUnique({ where: { id: orderId } });
        if (!order) return;

        const restaurantId = order.restaurant_id;

        const [customerAcc, foodRevAcc, taxAcc, scAcc] = await Promise.all([
            resolveAccount(restaurantId, GL.CUSTOMER_ACCOUNT, db),
            resolveAccount(restaurantId, GL.FOOD_REVENUE, db),
            resolveAccount(restaurantId, GL.TAX_PAYABLE, db),
            resolveAccount(restaurantId, GL.SC_PAYABLE, db),
        ]);

        // If COA not seeded yet, skip silently
        if (!customerAcc || !foodRevAcc) return;

        const total = new Decimal(order.total || 0);
        const tax   = new Decimal(order.tax || 0);
        const sc    = new Decimal(order.service_charge || 0);
        const net   = total.minus(tax).minus(sc);

        const lines: JELine[] = [
            {
                accountId: customerAcc.id,
                description: `Credit sale – Order #${order.order_number}`,
                debit: total,
                referenceType: 'CUSTOMER',
                referenceId: customerId,
                meta: { orderId, orderNumber: order.order_number }
            },
            {
                accountId: foodRevAcc.id,
                description: `F&B Revenue – Order #${order.order_number}`,
                credit: net,
                referenceType: 'CUSTOMER',
                referenceId: customerId,
                meta: { orderId, orderNumber: order.order_number }
            },
        ];

        if (tax.greaterThan(0) && taxAcc) {
            lines.push({
                accountId: taxAcc.id,
                description: `Sales Tax – Order #${order.order_number}`,
                credit: tax,
                referenceType: 'CUSTOMER',
                referenceId: customerId,
                meta: { orderId, orderNumber: order.order_number }
            });
        }

        if (sc.greaterThan(0) && scAcc) {
            lines.push({
                accountId: scAcc.id,
                description: `Service Charge – Order #${order.order_number}`,
                credit: sc,
                referenceType: 'CUSTOMER',
                referenceId: customerId,
                meta: { orderId, orderNumber: order.order_number }
            });
        }

        await postJournal({
            restaurantId,
            referenceType: 'CREDIT_SALE',
            referenceId: orderId,
            date: new Date(),
            description: `Credit Sale – Order #${order.order_number}`,
            processedBy: order.last_action_by || undefined,
            lines,
        }, db);
    }

    /**
     * POST CUSTOMER PAYMENT JOURNAL
     * Customer pays cash/card against their account.
     *
     * DR  1000  Cash (or 1010 Card)   amount  (money arrives)
     * CR  1040  Customer Account      amount  (reduces debt or creates advance)
     */
    async recordCustomerPaymentJournal(params: {
        restaurantId: string;
        customerId: string;
        amount: number | Decimal;
        paymentMethod: 'CASH' | 'CARD';
        referenceId: string;
        processedBy?: string;
    }, tx: any) {
        const db = tx;

        // Idempotency
        const existing = await db.journal_entries.findFirst({
            where: { reference_type: 'CUSTOMER_PAYMENT', reference_id: params.referenceId }
        });
        if (existing) return;

        const assetCode = params.paymentMethod === 'CARD'
            ? GL.CARD_RECEIVABLE
            : GL.CASH;

        const [assetAcc, customerAcc] = await Promise.all([
            resolveAccount(params.restaurantId, assetCode, db),
            resolveAccount(params.restaurantId, GL.CUSTOMER_ACCOUNT, db),
        ]);

        if (!assetAcc || !customerAcc) return;

        const amount = new Decimal(params.amount.toString());

        await postJournal({
            restaurantId: params.restaurantId,
            referenceType: 'CUSTOMER_PAYMENT',
            referenceId: params.referenceId,
            date: new Date(),
            description: `Customer payment received`,
            processedBy: params.processedBy,
            lines: [
                {
                    accountId: assetAcc.id,
                    description: `Payment received from customer`,
                    debit: amount,
                    referenceType: 'CUSTOMER',
                    referenceId: params.customerId,
                    meta: { paymentMethod: params.paymentMethod }
                },
                {
                    accountId: customerAcc.id,
                    description: `Customer account credited`,
                    credit: amount,
                    referenceType: 'CUSTOMER',
                    referenceId: params.customerId,
                    meta: { paymentMethod: params.paymentMethod }
                },
            ],
        }, db);
    }

    /**
     * GET CUSTOMER ACCOUNT BALANCE
     * Calculates net balance from journal_entry_lines for account 1040.
     *
     * Positive = customer owes restaurant (outstanding debt)
     * Negative = restaurant holds customer advance
     * Zero     = account is clear
     */
    async getCustomerBalance(
        restaurantId: string,
        customerId: string,
        tx?: any
    ): Promise<Decimal> {
        const db = tx || prisma;

        const customerAcc = await resolveAccount(
            restaurantId,
            GL.CUSTOMER_ACCOUNT,
            db
        );
        if (!customerAcc) return new Decimal(0);

        // Get all orders for this customer
        const customerOrders = await db.orders.findMany({
            where: { customer_id: customerId, restaurant_id: restaurantId },
            select: { id: true },
        });
        const orderIds = new Set(customerOrders.map((o: any) => o.id));

        // Get all journal entries relevant to this customer
        const journalEntries = await db.journal_entries.findMany({
            where: {
                restaurant_id: restaurantId,
                reference_type: { in: ['CREDIT_SALE', 'CUSTOMER_PAYMENT'] },
            },
            include: {
                lines: {
                    where: { account_id: customerAcc.id },
                },
            },
        });

        let balance = new Decimal(0);

        for (const je of journalEntries) {
            // For CREDIT_SALE entries: match by order ID
            if (je.reference_type === 'CREDIT_SALE' && !orderIds.has(je.reference_id)) {
                continue;
            }
            // For CUSTOMER_PAYMENT entries: match by customerId in reference
            if (
                je.reference_type === 'CUSTOMER_PAYMENT' &&
                !je.reference_id.includes(customerId)
            ) {
                continue;
            }

            for (const line of je.lines) {
                balance = balance
                    .plus(new Decimal(line.debit.toString()))
                    .minus(new Decimal(line.credit.toString()));
            }
        }

        return balance;
    }

    /**
     * POST SUPPLIER BILL JOURNAL
     * We receive a bill from a vendor.
     *
     * DR  5010  Operating Expense    amount
     * CR  2020  Supplier Payable     amount (Liability increases)
     */
    async recordSupplierBillJournal(params: {
        restaurantId: string;
        supplierId: string;
        amount: number | Decimal;
        referenceId: string; // PO ID
        description: string;
        processedBy?: string;
    }, tx: any) {
        const db = tx;
        const [expenseAcc, supplierAcc] = await Promise.all([
            resolveAccount(params.restaurantId, GL.GENERAL_EXPENSE, db),
            resolveAccount(params.restaurantId, GL.SUPPLIER_PAYABLE, db),
        ]);

        if (!expenseAcc || !supplierAcc) return;

        const amount = new Decimal(params.amount.toString());

        await postJournal({
            restaurantId: params.restaurantId,
            referenceType: 'SUPPLIER_BILL',
            referenceId: params.referenceId,
            date: new Date(),
            description: params.description,
            processedBy: params.processedBy,
            lines: [
                { accountId: expenseAcc.id, description: 'Supplier bill expense', debit: amount, referenceType: 'SUPPLIER', referenceId: params.supplierId },
                { accountId: supplierAcc.id, description: 'Supplier payable created', credit: amount, referenceType: 'SUPPLIER', referenceId: params.supplierId },
            ],
        }, db);
    }

    /**
     * POST SUPPLIER PAYMENT JOURNAL
     * We pay a vendor (clears liability).
     *
     * DR  2020  Supplier Payable     amount (Liability decreases)
     * CR  1000  Cash (or 1010 Card)   amount (Asset decreases)
     */
    async recordSupplierPaymentJournal(params: {
        restaurantId: string;
        supplierId: string;
        amount: number | Decimal;
        payoutId: string;
        paymentMethod: 'CASH' | 'CARD';
        processedBy?: string;
    }, tx: any) {
        const db = tx;
        const assetCode = params.paymentMethod === 'CARD' ? GL.CARD_RECEIVABLE : GL.CASH;
        const [supplierAcc, assetAcc] = await Promise.all([
            resolveAccount(params.restaurantId, GL.SUPPLIER_PAYABLE, db),
            resolveAccount(params.restaurantId, assetCode, db),
        ]);

        if (!supplierAcc || !assetAcc) return;

        const amount = new Decimal(params.amount.toString());

        await postJournal({
            restaurantId: params.restaurantId,
            referenceType: 'SUPPLIER_PAYMENT',
            referenceId: params.payoutId,
            date: new Date(),
            description: `Payment to supplier`,
            processedBy: params.processedBy,
            lines: [
                { accountId: supplierAcc.id, description: 'Supplier payable cleared', debit: amount, referenceType: 'SUPPLIER', referenceId: params.supplierId, meta: { paymentMethod: params.paymentMethod } },
                { accountId: assetAcc.id, description: 'Cash paid to vendor', credit: amount, referenceType: 'SUPPLIER', referenceId: params.supplierId, meta: { paymentMethod: params.paymentMethod } },
            ],
        }, db);
    }
}

export const journalEntryService = new JournalEntryService();

/**
 * Interprets a customer account balance into human-readable bilingual form.
 *
 * Positive balance = customer owes restaurant → show in red
 * Negative balance = restaurant holds advance → show in green
 * Zero             = account clear            → show in gray
 */
export function interpretCustomerBalance(balance: Decimal): {
    type: 'outstanding' | 'advance' | 'clear';
    amount: Decimal;
    label: string;
    labelUrdu: string;
    color: 'red' | 'green' | 'gray';
    displayAmount: string;
} {
    const absAmount = balance.abs();
    const formatted = `Rs. ${Number(absAmount).toLocaleString('en-PK')}`;

    if (balance.greaterThan(0)) {
        return {
            type: 'outstanding',
            amount: balance,
            label: `Owes ${formatted}`,
            labelUrdu: `ذمہ داری: ${formatted}`,
            color: 'red',
            displayAmount: formatted,
        };
    }

    if (balance.lessThan(0)) {
        return {
            type: 'advance',
            amount: absAmount,
            label: `Advance: ${formatted}`,
            labelUrdu: `پیشگی: ${formatted}`,
            color: 'green',
            displayAmount: formatted,
        };
    }

    return {
        type: 'clear',
        amount: new Decimal(0),
        label: 'Account clear',
        labelUrdu: 'حساب صاف',
        color: 'gray',
        displayAmount: 'Rs. 0',
    };
}
