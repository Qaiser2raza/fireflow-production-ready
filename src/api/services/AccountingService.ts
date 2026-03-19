import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { journalEntryService } from './JournalEntryService';

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

        // ── Double-Entry: Post to Chart of Accounts journal ──────────────
        try {
            await journalEntryService.recordOrderSaleJournal(orderId, db);
        } catch (jeErr) {
            // Journal posting is non-blocking — legacy ledger entry already recorded above
            console.error('[JE] recordOrderSaleJournal failed (non-fatal):', jeErr);
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

        // ── Double-Entry Journal ─────────────────────────────────────────
        try {
            await journalEntryService.recordRiderSettlementJournal({
                restaurantId: data.restaurantId,
                riderId: data.riderId,
                amount: data.amountReceived,
                settlementId: data.settlementId || `settle-${Date.now()}`,
                processedBy: data.processedBy
            }, db);
        } catch (jeErr) {
            console.error('[JE] recordRiderSettlementJournal failed (non-fatal):', jeErr);
        }
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

            // ── Double-Entry Journal ─────────────────────────────────────
            try {
                await journalEntryService.recordPayoutJournal({
                    restaurantId: data.restaurantId,
                    amount: data.amount,
                    payoutId: payout.id,
                    category: data.category,
                    notes: data.notes,
                    processedBy: data.staffId
                }, tx);
            } catch (jeErr) {
                console.error('[JE] recordPayoutJournal failed (non-fatal):', jeErr);
            }

            return payout;
        });
    }

    /**
     * Retrieves current session metrics and calculated expected cash.
     */
    async getSessionMetrics(restaurantId: string, businessDate?: string) {
        let session;
        
        if (businessDate) {
            const startOfDay = new Date(new Date(businessDate).setHours(0, 0, 0, 0));
            const endOfDay = new Date(new Date(businessDate).setHours(23, 59, 59, 999));
            
            session = await prisma.cash_sessions.findFirst({
                where: {
                    restaurant_id: restaurantId,
                    opened_at: { gte: startOfDay, lte: endOfDay }
                },
                orderBy: { opened_at: 'desc' }
            });
        } else {
            session = await this.getActiveSession(restaurantId);
        }

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

        // Calculate order count for the session
        const orderCount = entries.filter(e => e.reference_type === 'ORDER' && e.transaction_type === 'CREDIT' && !e.account_id).length;

        return {
            ...session,
            metrics: {
                openingBalance: session.opening_balance,
                cashSales,
                payouts,
                settlements,
                expectedCash,
                totalRevenue,
                orderCount
            }
        };
    }

    /**
     * Export Ledger to CSV
     */
    async exportLedgerToCSV(restaurantId: string, limit: number = 1000) {
        const entries = await this.getRecentLedger(restaurantId, limit);
        
        const header = "Date,Description,Type,Amount,Reference,Processed By\n";
        const rows = entries.map(e => {
            const date = new Date(e.created_at).toLocaleString();
            const desc = `"${(e.description || '').replace(/"/g, '""')}"`;
            const type = e.transaction_type;
            const amount = e.amount;
            const ref = `${e.reference_type} [${e.reference_id?.slice(-6).toUpperCase() || ''}]`;
            const by = e.processed_by || '';
            return `${date},${desc},${type},${amount},${ref},${by}`;
        }).join("\n");

        return header + rows;
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
     * GENERATE FULL Z-REPORT (End of Day Summary)
     * Full audit-grade report with staff, tax, voids, velocity, and payout breakdown.
     */
    async getZReport(sessionId: string) {
        const session = await prisma.cash_sessions.findUnique({
            where: { id: sessionId }
        });

        if (!session) throw new Error('Session not found');

        const startTime = session.opened_at;
        const endTime = session.closed_at || new Date();

        // --- Fetch all data in parallel ---
        const [orders, ledgerEntries, payoutsData, voidedOrders, cancelledOrders, opener, closer] = await Promise.all([
            prisma.orders.findMany({
                where: {
                    restaurant_id: session.restaurant_id,
                    created_at: { gte: startTime, lte: endTime },
                    status: 'CLOSED'
                },
                include: { order_items: true, transactions: true } as any
            }),
            prisma.ledger_entries.findMany({
                where: {
                    restaurant_id: session.restaurant_id,
                    created_at: { gte: startTime, lte: endTime }
                }
            }),
            prisma.payouts.findMany({
                where: {
                    restaurant_id: session.restaurant_id,
                    created_at: { gte: startTime, lte: endTime }
                }
            }),
            prisma.orders.findMany({
                where: {
                    restaurant_id: session.restaurant_id,
                    created_at: { gte: startTime, lte: endTime },
                    status: 'VOIDED'
                },
                select: { id: true, total: true, type: true, voided_at: true, void_reason: true }
            }),
            prisma.orders.findMany({
                where: {
                    restaurant_id: session.restaurant_id,
                    created_at: { gte: startTime, lte: endTime },
                    status: 'CANCELLED'
                },
                select: { id: true, total: true, type: true, cancelled_at: true, cancellation_reason: true }
            }),
            session.opened_by ? prisma.staff.findUnique({ where: { id: session.opened_by }, select: { name: true } }) : null,
            session.closed_by ? prisma.staff.findUnique({ where: { id: session.closed_by }, select: { name: true } }) : null,
        ]);

        // --- Initialise accumulators ---
        const summary = {
            gross_sales: new Decimal(0),
            net_sales: new Decimal(0),
            total_tax: new Decimal(0),
            total_sc: new Decimal(0),
            total_delivery_fees: new Decimal(0),
            total_discounts: new Decimal(0),
            order_count: orders.length,
            avg_order_value: new Decimal(0),
        };

        const paymentMethods: Record<string, Decimal> = {};
        const orderTypes: Record<string, { count: number; revenue: Decimal }> = {};
        const categoryBreakdown: Record<string, Decimal> = {};
        const hourlyVelocity: Record<number, { count: number; revenue: Decimal }> = {};

        // --- Process closed orders ---
        orders.forEach((order: any) => {
            const total = new Decimal(order.total.toString());
            const tax = new Decimal((order.tax || 0).toString());
            const sc = new Decimal((order.service_charge || 0).toString());
            const df = new Decimal((order.delivery_fee || 0).toString());
            const disc = new Decimal((order.discount || 0).toString());

            summary.gross_sales = summary.gross_sales.plus(total);
            summary.total_tax = summary.total_tax.plus(tax);
            summary.total_sc = summary.total_sc.plus(sc);
            summary.total_delivery_fees = summary.total_delivery_fees.plus(df);
            summary.total_discounts = summary.total_discounts.plus(disc);

            // Order type breakdown
            if (!orderTypes[order.type]) orderTypes[order.type] = { count: 0, revenue: new Decimal(0) };
            orderTypes[order.type].count += 1;
            orderTypes[order.type].revenue = orderTypes[order.type].revenue.plus(total);

            // Category breakdown
            order.order_items.forEach((item: any) => {
                const cat = item.category || 'Uncategorized';
                if (!categoryBreakdown[cat]) categoryBreakdown[cat] = new Decimal(0);
                categoryBreakdown[cat] = categoryBreakdown[cat].plus(new Decimal(item.total_price.toString()));
            });

            // Payment methods
            order.transactions.forEach((t: any) => {
                const method = t.payment_method;
                if (!paymentMethods[method]) paymentMethods[method] = new Decimal(0);
                paymentMethods[method] = paymentMethods[method].plus(new Decimal(t.amount.toString()));
            });

            // Hourly velocity
            const hour = new Date(order.created_at).getHours();
            if (!hourlyVelocity[hour]) hourlyVelocity[hour] = { count: 0, revenue: new Decimal(0) };
            hourlyVelocity[hour].count += 1;
            hourlyVelocity[hour].revenue = hourlyVelocity[hour].revenue.plus(total);
        });

        // Net sales = gross - discounts
        summary.net_sales = summary.gross_sales.minus(summary.total_discounts);
        summary.avg_order_value = orders.length > 0 ? summary.gross_sales.dividedBy(orders.length) : new Decimal(0);

        // --- Cash flow ---
        const cashFlow = {
            opening_float: session.opening_balance,
            payouts: new Decimal(0),
            rider_settlements: new Decimal(0),
            actual_cash: session.actual_balance || 0,
            expected_cash: session.expected_balance || 0
        };

        ledgerEntries.forEach((entry: any) => {
            const amt = new Decimal(entry.amount.toString());
            if (entry.reference_type === 'PAYOUT') cashFlow.payouts = cashFlow.payouts.plus(amt);
            if (entry.reference_type === 'SETTLEMENT' && !entry.account_id) {
                if (entry.transaction_type === 'DEBIT') cashFlow.rider_settlements = cashFlow.rider_settlements.plus(amt);
                else cashFlow.rider_settlements = cashFlow.rider_settlements.minus(amt);
            }
        });

        // --- Payout categories breakdown ---
        const payoutsByCategory: Record<string, Decimal> = {};
        payoutsData.forEach((p: any) => {
            const cat = p.category;
            if (!payoutsByCategory[cat]) payoutsByCategory[cat] = new Decimal(0);
            payoutsByCategory[cat] = payoutsByCategory[cat].plus(new Decimal(p.amount.toString()));
        });

        // --- Void / Cancel summary ---
        const voidSummary = {
            count: voidedOrders.length,
            total_value: voidedOrders.reduce((s, o) => s.plus(new Decimal(o.total.toString())), new Decimal(0))
        };

        const cancelSummary = {
            count: cancelledOrders.length,
            total_value: cancelledOrders.reduce((s, o) => s.plus(new Decimal(o.total.toString())), new Decimal(0))
        };

        return {
            metadata: {
                id: session.id,
                opened_at: session.opened_at,
                closed_at: session.closed_at,
                status: session.status,
                variance: session.variance,
                opened_by: opener?.name || 'Unknown',
                closed_by: closer?.name || 'Pending',
                duration_minutes: session.closed_at
                    ? Math.round((new Date(session.closed_at).getTime() - new Date(session.opened_at).getTime()) / 60000)
                    : null,
            },
            summary,
            payment_methods: paymentMethods,
            order_types: orderTypes,
            category_breakdown: categoryBreakdown,
            cash_flow: cashFlow,
            payouts_breakdown: payoutsByCategory,
            void_summary: voidSummary,
            cancel_summary: cancelSummary,
            hourly_velocity: hourlyVelocity,
        };
    }
}


