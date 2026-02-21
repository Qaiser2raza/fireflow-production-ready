import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

export type TransactionType = 'DEBIT' | 'CREDIT';
export type ReferenceType = 'ORDER' | 'SETTLEMENT' | 'PAYOUT' | 'STOCK_IN' | 'OPENING_BALANCE' | 'ADJUSTMENT' | 'RIDER_SHIFT';

export interface LedgerEntryData {
    restaurantId: string;
    accountId?: string; // Staff ID (Rider) or Vendor ID
    transactionType: TransactionType;
    amount: number | Decimal;
    referenceType: ReferenceType;
    referenceId?: string;
    description?: string;
    processedBy?: string;
}

export class AccountingService {
    /**
     * Creates an atomic ledger entry.
     */
    async createLedgerEntry(data: LedgerEntryData, tx?: any) {
        const db = tx || prisma;
        const amount = new Decimal(data.amount.toString());

        return await db.ledger_entries.create({
            data: {
                restaurant_id: data.restaurantId,
                account_id: data.accountId,
                transaction_type: data.transactionType,
                amount: amount,
                reference_type: data.referenceType,
                reference_id: data.referenceId,
                description: data.description,
                processed_by: data.processedBy
            }
        });
    }

    /**
     * Records a sale in the ledger (Double-Entry).
     * Impacts: Credit Revenue, Debit Asset (Cash Drawer or Rider).
     */
    async recordOrderSale(orderId: string, tx?: any) {
        const db = tx || prisma;

        // 0. Check if revenue already recorded for this order (Idempotency)
        const existingRevenue = await db.ledger_entries.findFirst({
            where: {
                reference_id: orderId,
                reference_type: 'ORDER',
                transaction_type: 'CREDIT',
                account_id: null // Revenue entries have no account_id
            }
        });

        if (existingRevenue) return;

        // Fetch full order details
        const order = await db.orders.findUnique({
            where: { id: orderId }
        });

        if (!order) return;

        const totalAmount = new Decimal(order.total);

        // 1. CREDIT: Sales Revenue (Increase Revenue)
        await this.createLedgerEntry({
            restaurantId: order.restaurant_id,
            transactionType: 'CREDIT',
            amount: totalAmount,
            referenceType: 'ORDER',
            referenceId: order.id,
            description: `Sales Revenue from ${order.type} Order #${order.order_number || order.id.slice(-6)}`,
            processedBy: order.last_action_by
        }, db);

        // 2. DEBIT: Asset Account
        if (order.type === 'DELIVERY' && order.assigned_driver_id) {
            // Debit the Rider (They now owe the business the food value)
            await this.createLedgerEntry({
                restaurantId: order.restaurant_id,
                accountId: order.assigned_driver_id,
                transactionType: 'DEBIT',
                amount: totalAmount,
                referenceType: 'ORDER',
                referenceId: order.id,
                description: `Debt assigned to rider for delivery #${order.order_number}`,
                processedBy: order.last_action_by
            }, db);
        } else {
            // Debit the Cash Drawer (Standard Sale)
            await this.createLedgerEntry({
                restaurantId: order.restaurant_id,
                transactionType: 'DEBIT',
                amount: totalAmount,
                referenceType: 'ORDER',
                referenceId: order.id,
                description: `Cash received from ${order.type} order #${order.order_number}`,
                processedBy: order.last_action_by
            }, db);
        }
    }

    /**
     * Records a rider's cash settlement (Double-Entry).
     * Impacts: Debit Cash Drawer (Cash In), Credit Rider (Debt Out).
     */
    async recordRiderSettlement(data: {
        restaurantId: string;
        riderId: string;
        amountReceived: number | Decimal;
        orderIds: string[];
        processedBy: string;
        settlementId?: string;
    }, tx?: any) {
        const db = tx || prisma;
        const amount = new Decimal(data.amountReceived.toString());

        // 1. DEBIT: Cash Drawer (Increase Physical Cash)
        await this.createLedgerEntry({
            restaurantId: data.restaurantId,
            transactionType: 'DEBIT',
            amount: amount,
            referenceType: 'SETTLEMENT',
            referenceId: data.settlementId,
            description: `Cash received from rider for ${data.orderIds.length} orders`,
            processedBy: data.processedBy
        }, db);

        // 2. CREDIT: Rider Ledger (Clear/Reduce Rider Debt)
        await this.createLedgerEntry({
            restaurantId: data.restaurantId,
            accountId: data.riderId,
            transactionType: 'CREDIT',
            amount: amount,
            referenceType: 'SETTLEMENT',
            referenceId: data.settlementId,
            description: `Rider debt reduced for ${data.orderIds.length} orders`,
            processedBy: data.processedBy
        }, db);
    }

    /**
     * Records any general payout or expense.
     */
    async recordPayout(data: {
        restaurantId: string;
        amount: number | Decimal;
        category: string;
        notes: string;
        processedBy: string;
        referenceId?: string;
    }, tx?: any) {
        const db = tx || prisma;
        const amount = new Decimal(data.amount.toString());

        // 1. CREDIT: Cash Drawer (Decrease Physical Cash)
        await this.createLedgerEntry({
            restaurantId: data.restaurantId,
            transactionType: 'CREDIT',
            amount: amount,
            referenceType: 'PAYOUT',
            referenceId: data.referenceId,
            description: `Payout [${data.category}]: ${data.notes}`,
            processedBy: data.processedBy
        }, db);

        // 2. DEBIT: Expense/Liability (Increase Cost)
        // ... (This side depends on the specific chart of accounts, but for now we track the cash exit)
    }

    /**
     * Records issuing a float to a rider.
     * Impacts: Credit Cash Drawer (Cash Out), Debit Rider (Debt Up).
     */
    async recordFloatIssue(data: {
        restaurantId: string;
        riderId: string;
        amount: number | Decimal;
        processedBy: string;
        referenceId?: string; // Order ID or Session ID
    }, tx?: any) {
        const db = tx || prisma;
        const amount = new Decimal(data.amount.toString());

        if (amount.isZero()) return;

        // 1. CREDIT: Cash Drawer (Physical cash leaves)
        await this.createLedgerEntry({
            restaurantId: data.restaurantId,
            transactionType: 'CREDIT',
            amount: amount,
            referenceType: 'SETTLEMENT', // Using SETTLEMENT as the broad category for rider cash movements
            referenceId: data.referenceId,
            description: `Float issued to rider`,
            processedBy: data.processedBy
        }, db);

        // 2. DEBIT: Rider Ledger (Rider now owes this cash)
        await this.createLedgerEntry({
            restaurantId: data.restaurantId,
            accountId: data.riderId,
            transactionType: 'DEBIT',
            amount: amount,
            referenceType: 'SETTLEMENT',
            referenceId: data.referenceId,
            description: `Float received by rider`,
            processedBy: data.processedBy
        }, db);
    }

    /**
     * Calculates current balance for any account (Rider, Supplier, etc).
     */
    async getBalance(restaurantId: string, accountId: string) {
        const entries = await prisma.ledger_entries.findMany({
            where: {
                restaurant_id: restaurantId,
                account_id: accountId
            }
        });

        return entries.reduce((acc: Decimal, entry: any) => {
            const amt = new Decimal(entry.amount);
            return entry.transaction_type === 'DEBIT'
                ? acc.plus(amt)
                : acc.minus(amt);
        }, new Decimal(0));
    }

    /**
     * CASH SESSION (Z-REPORT) LOGIC
     */

    async openCashSession(data: {
        restaurantId: string;
        staffId: string;
        openingBalance: number | Decimal;
    }) {
        const existing = await prisma.cash_sessions.findFirst({
            where: {
                restaurant_id: data.restaurantId,
                status: 'OPEN'
            }
        });

        if (existing) {
            throw new Error(`Session already open since ${existing.opened_at}`);
        }

        return await prisma.cash_sessions.create({
            data: {
                restaurant_id: data.restaurantId,
                opened_by: data.staffId,
                opening_balance: new Decimal(data.openingBalance.toString()),
                status: 'OPEN'
            }
        });
    }

    async getActiveSession(restaurantId: string) {
        return await prisma.cash_sessions.findFirst({
            where: {
                restaurant_id: restaurantId,
                status: 'OPEN'
            }
        });
    }

    async closeCashSession(data: {
        sessionId: string;
        staffId: string;
        actualBalance: number | Decimal;
        notes?: string;
    }) {
        const session = await prisma.cash_sessions.findUnique({
            where: { id: data.sessionId }
        });

        if (!session || session.status === 'CLOSED') {
            throw new Error('Valid open session required for closing');
        }

        const actual = new Decimal(data.actualBalance.toString());

        // Calculate expected: Opening + All non-account Debits - All non-account Credits
        const entries = await prisma.ledger_entries.findMany({
            where: {
                restaurant_id: session.restaurant_id,
                created_at: { gte: session.opened_at },
                account_id: null
            }
        });

        let movement = new Decimal(0);
        entries.forEach((e: any) => {
            const amt = new Decimal(e.amount);
            if (e.transaction_type === 'DEBIT') movement = movement.plus(amt);
            else movement = movement.minus(amt);
        });

        const expected = new Decimal(session.opening_balance).plus(movement);
        const variance = actual.minus(expected);

        return await prisma.cash_sessions.update({
            where: { id: data.sessionId },
            data: {
                closed_at: new Date(),
                closed_by: data.staffId,
                expected_balance: expected,
                actual_balance: actual,
                variance: variance,
                status: 'CLOSED',
                notes: data.notes
            }
        });
    }

    /**
     * Payout helper: Creates payout record + ledger entry
     */
    async processPayout(data: {
        restaurantId: string;
        amount: number | Decimal;
        category: string;
        notes: string;
        staffId: string;
        referenceId?: string;
    }) {
        return await prisma.$transaction(async (tx) => {
            const payout = await tx.payouts.create({
                data: {
                    restaurant_id: data.restaurantId,
                    amount: new Decimal(data.amount.toString()),
                    category: data.category,
                    notes: data.notes,
                    processed_by: data.staffId,
                    reference_id: data.referenceId
                }
            });

            await this.recordPayout({
                restaurantId: data.restaurantId,
                amount: data.amount,
                category: data.category,
                notes: data.notes,
                processedBy: data.staffId,
                referenceId: payout.id
            }, tx);

            return payout;
        });
    }

    /**
     * Retrieves current session metrics and calculated expected cash.
     */
    async getSessionMetrics(restaurantId: string) {
        const session = await this.getActiveSession(restaurantId);
        if (!session) return null;

        const entries = await prisma.ledger_entries.findMany({
            where: {
                restaurant_id: restaurantId,
                created_at: { gte: session.opened_at }
            }
        });

        let cashSales = new Decimal(0);
        let payouts = new Decimal(0);
        let settlements = new Decimal(0);
        let totalRevenue = new Decimal(0);

        entries.forEach((e: any) => {
            const amt = new Decimal(e.amount);

            // 1. REVENUE (Credit, Reference=ORDER)
            // Note: This sums ALL sales (Cash + Card + Delivery)
            if (e.transaction_type === 'CREDIT' && e.reference_type === 'ORDER') {
                totalRevenue = totalRevenue.plus(amt);
            }

            // 2. CASH DRAWER MOVEMENTS (Account=NULL)
            if (!e.account_id) {
                // Cash In (Debit)
                if (e.transaction_type === 'DEBIT') {
                    if (e.reference_type === 'ORDER') cashSales = cashSales.plus(amt);
                    if (e.reference_type === 'SETTLEMENT') settlements = settlements.plus(amt);
                }
                // Cash Out (Credit)
                else {
                    if (e.reference_type === 'PAYOUT') payouts = payouts.plus(amt);
                    if (e.reference_type === 'SETTLEMENT') settlements = settlements.minus(amt); // Float Issue
                }
            }
        });

        const expectedCash = new Decimal(session.opening_balance)
            .plus(cashSales)
            .plus(settlements) // Net settlements (In - Out)
            .minus(payouts);

        return {
            ...session,
            metrics: {
                openingBalance: session.opening_balance,
                cashSales,
                payouts,
                settlements,
                expectedCash,
                totalRevenue
            }
        };
    }

    /**
     * Get recent ledger activity for display
     */
    async getRecentLedger(restaurantId: string, limit: number = 50) {
        return await prisma.ledger_entries.findMany({
            where: { restaurant_id: restaurantId },
            orderBy: { created_at: 'desc' },
            take: limit
        });
    }

    /**
     * Get Customer Intelligence (LTV, Frequency, Aura Score)
     */
    async getCustomerIntelligence(restaurantId: string) {
        const customers = await prisma.customers.findMany({
            where: { restaurant_id: restaurantId },
            include: {
                orders: {
                    where: { status: 'CLOSED' },
                    select: { total: true, created_at: true }
                }
            }
        });

        return customers.map(c => {
            const totalSpend = c.orders.reduce((sum: number, o: any) => sum + Number(o.total), 0);
            const orderCount = c.orders.length;
            const lastOrder = c.orders.length > 0
                ? [...c.orders].sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0].created_at
                : null;

            // Simple Aura Score calculation: higher spend + higher frequency = higher score
            // Normalized to 100
            const frequencyScore = Math.min(orderCount * 8, 50);
            const spendScore = Math.min((totalSpend / 2000) * 5, 50);
            const auraScore = Math.floor(frequencyScore + spendScore);

            return {
                ...c,
                ltv: totalSpend,
                orderCount,
                last_order_at: lastOrder,
                aura_score: Math.max(auraScore, 10),
                segment: orderCount > 10 ? 'VIP' : orderCount > 3 ? 'REGULAR' : 'NEW'
            };
        });
    }

    /**
     * GENREATE FULL Z-REPORT (End of Day Summary)
     * Provides category breakdowns, payment methods, and hourly velocity.
     */
    async getZReport(sessionId: string) {
        const session = await prisma.cash_sessions.findUnique({
            where: { id: sessionId }
        });

        if (!session) throw new Error('Session not found');

        const startTime = session.opened_at;
        const endTime = session.closed_at || new Date();

        // 1. Fetch all orders in this session window
        const orders = await prisma.orders.findMany({
            where: {
                restaurant_id: session.restaurant_id,
                created_at: { gte: startTime, lte: endTime },
                status: 'CLOSED'
            },
            include: {
                order_items: true,
                transactions: true
            } as any
        });

        // 2. Fetch all ledger entries (for payouts and settlements)
        const ledgerEntries = await prisma.ledger_entries.findMany({
            where: {
                restaurant_id: session.restaurant_id,
                created_at: { gte: startTime, lte: endTime }
            }
        });

        const report = {
            metadata: {
                id: session.id,
                opened_at: session.opened_at,
                closed_at: session.closed_at,
                status: session.status,
                variance: session.variance
            },
            summary: {
                gross_sales: new Decimal(0),
                net_sales: new Decimal(0),
                total_tax: new Decimal(0),
                total_sc: new Decimal(0),
                total_delivery_fees: new Decimal(0),
                total_discounts: new Decimal(0),
                order_count: orders.length
            },
            payment_methods: {} as Record<string, Decimal>,
            order_types: {} as Record<string, number>,
            category_breakdown: {} as Record<string, Decimal>,
            cash_flow: {
                opening_float: session.opening_balance,
                payouts: new Decimal(0),
                rider_settlements: new Decimal(0),
                actual_cash: session.actual_balance || 0,
                expected_cash: session.expected_balance || 0
            }
        };

        // Process Orders
        orders.forEach((order: any) => {
            report.summary.gross_sales = report.summary.gross_sales.plus(new Decimal(order.total.toString()));
            report.summary.total_tax = report.summary.total_tax.plus(new Decimal((order.tax || 0).toString()));
            report.summary.total_sc = report.summary.total_sc.plus(new Decimal((order.service_charge || 0).toString()));
            report.summary.total_delivery_fees = report.summary.total_delivery_fees.plus(new Decimal((order.delivery_fee || 0).toString()));
            report.summary.total_discounts = report.summary.total_discounts.plus(new Decimal((order.discount || 0).toString()));

            // Type counts
            report.order_types[order.type] = (report.order_types[order.type] || 0) + 1;

            // Categories
            order.order_items.forEach((item: any) => {
                const cat = item.category || 'Uncategorized';
                report.category_breakdown[cat] = (report.category_breakdown[cat] || new Decimal(0)).plus(new Decimal(item.total_price.toString()));
            });

            // Payments
            order.transactions.forEach((t: any) => {
                const method = t.payment_method;
                report.payment_methods[method] = (report.payment_methods[method] || new Decimal(0)).plus(new Decimal(t.amount.toString()));
            });
        });

        // Process Ledger for cash flow
        ledgerEntries.forEach(entry => {
            const amt = new Decimal(entry.amount.toString());
            if (entry.reference_type === 'PAYOUT') {
                report.cash_flow.payouts = report.cash_flow.payouts.plus(amt);
            }
            if (entry.reference_type === 'SETTLEMENT' && !entry.account_id) {
                // Net settlement in the drawer
                if (entry.transaction_type === 'DEBIT') report.cash_flow.rider_settlements = report.cash_flow.rider_settlements.plus(amt);
                else report.cash_flow.rider_settlements = report.cash_flow.rider_settlements.minus(amt);
            }
        });

        return report;
    }
}
