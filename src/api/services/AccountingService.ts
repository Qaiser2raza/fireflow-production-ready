import { Decimal } from '@prisma/client/runtime/library';
import { journalEntryService } from './JournalEntryService';
import { prisma } from '../../shared/lib/prisma';

export type TransactionType = 'DEBIT' | 'CREDIT';
export type ReferenceType = 'ORDER' | 'SETTLEMENT' | 'PAYOUT' | 'STOCK_IN' | 'OPENING_BALANCE' | 'ADJUSTMENT' | 'RIDER_SHIFT' | 'VOID_ORDER';

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

        // Guard: Only journal orders that are in a settled state.
        // CLOSED = fully paid dine-in/takeaway. DELIVERED = delivery revenue recognised at handoff.
        // Partial or open orders must not be journalled — the imbalance guard would reject them anyway,
        // but this guard prevents the error from bubbling up to the user.
        if (order.status !== 'CLOSED' && order.status !== 'DELIVERED') {
            console.warn(`[Accounting] recordOrderSale skipped — Order #${order.order_number} status is '${order.status}'. Only CLOSED or DELIVERED orders are journalled.`);
            return;
        }

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

        // 2. DEBIT: Asset Account(s)
        // Fetch all PAID transactions for this order to handle split payments
        const transactions = await db.transactions.findMany({
            where: { 
                order_id: orderId,
                status: 'PAID'
            }
        });

        if (transactions.length > 0) {
            // Process each transaction to record appropriate debits
            for (const t of transactions) {
                const amount = new Decimal(t.amount);
                const method = t.payment_method;

                if (method === 'CREDIT' && order.customer_id) {
                    // Debit the Customer (Khata)
                    await this.createLedgerEntry({
                        restaurantId: order.restaurant_id,
                        accountId: order.customer_id,
                        transactionType: 'DEBIT',
                        amount: amount,
                        referenceType: 'ORDER',
                        referenceId: order.id,
                        description: `Credit Sale (Khata) – Order #${order.order_number || order.id.slice(-6)}`,
                        processedBy: order.last_action_by
                    }, db);

                    // Post to specialized Customer Ledger
                    await this.postCustomerLedger({
                        restaurantId: order.restaurant_id,
                        customerId: order.customer_id,
                        orderId: order.id,
                        amount: amount,
                        entryType: 'CHARGE',
                        description: `Order #${order.order_number || order.id.slice(-6)} charged to account`,
                        processedBy: order.last_action_by
                    }, db);
                } else if (order.type === 'DELIVERY' && order.assigned_driver_id && method !== 'CREDIT') {
                    // For deliveries paid via Cash/Card at door, the rider is responsible for the payout
                    // until they settle their shift.
                    await this.createLedgerEntry({
                        restaurantId: order.restaurant_id,
                        accountId: order.assigned_driver_id,
                        transactionType: 'DEBIT',
                        amount: amount,
                        referenceType: 'ORDER',
                        referenceId: order.id,
                        description: `${method} payment collected by rider for delivery #${order.order_number}`,
                        processedBy: order.last_action_by
                    }, db);
                } else {
                    // Standard Sale (Direct Cash/Card to business Asset account)
                    await this.createLedgerEntry({
                        restaurantId: order.restaurant_id,
                        transactionType: 'DEBIT',
                        amount: amount,
                        referenceType: 'ORDER',
                        referenceId: order.id,
                        description: `${method} received for ${order.type} order #${order.order_number}`,
                        processedBy: order.last_action_by
                    }, db);
                }
            }
        } else if (order.type === 'DELIVERY' && order.assigned_driver_id) {
            // Unpaid Delivery: Debit the Rider (Full amount)
            await this.createLedgerEntry({
                restaurantId: order.restaurant_id,
                accountId: order.assigned_driver_id,
                transactionType: 'DEBIT',
                amount: totalAmount,
                referenceType: 'ORDER',
                referenceId: order.id,
                description: `Unpaid delivery debt assigned to rider #${order.order_number}`,
                processedBy: order.last_action_by
            }, db);
        } else {
            // Default Fallback: Debit Cash Drawer (Full amount)
            await this.createLedgerEntry({
                restaurantId: order.restaurant_id,
                transactionType: 'DEBIT',
                amount: totalAmount,
                referenceType: 'ORDER',
                referenceId: order.id,
                description: `Payment received for ${order.type} order #${order.order_number}`,
                processedBy: order.last_action_by
            }, db);
        }

        // ── Double-Entry: Post to Chart of Accounts journal ──────────────
        await journalEntryService.recordOrderSaleJournal(orderId, db);
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
        await journalEntryService.recordRiderSettlementJournal({
            restaurantId: data.restaurantId,
            riderId: data.riderId,
            amount: data.amountReceived,
            settlementId: data.settlementId || `settle-${Date.now()}`,
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
    }, tx: any): Promise<void> {
        const db = tx;
        const amount = new Decimal(data.amount.toString());

        // 1. CREDIT: Cash Drawer (cash leaves)
        await this.createLedgerEntry({
            restaurantId: data.restaurantId,
            transactionType: 'CREDIT',
            amount: amount,
            referenceType: 'PAYOUT',
            referenceId: data.referenceId,
            description: `Payout [${data.category}]: ${data.notes}`,
            processedBy: data.processedBy
        }, db);

        // 2. DEBIT: Expense (cost recorded)
        await this.createLedgerEntry({
            restaurantId: data.restaurantId,
            transactionType: 'DEBIT',
            amount: amount,
            referenceType: 'PAYOUT',
            referenceId: data.referenceId,
            description: `Expense [${data.category}]: ${data.notes}`,
            processedBy: data.processedBy
        }, db);
    }

    /**
     * processPayout — called by the API route.
     * Creates the payout record, calls recordPayout for ledger entries,
     * and calls recordPayoutJournal for double-entry.
     * All inside a single DB transaction.
     */
    async processPayout(data: {
        restaurantId: string;
        staffId: string;
        amount: number;
        category: string;
        notes: string;
    }): Promise<any> {
        return await prisma.$transaction(async (tx) => {
            // 1. Create the payout record
            const payout = await tx.payouts.create({
                data: {
                    restaurant_id: data.restaurantId,
                    amount: new Decimal(data.amount.toString()),
                    category: data.category,
                    notes: data.notes,
                    processed_by: data.staffId as any,
                }
            });

            // 2. Record ledger entries (single-entry)
            await this.recordPayout({
                restaurantId: data.restaurantId,
                amount: data.amount,
                category: data.category,
                notes: data.notes,
                processedBy: data.staffId,
                referenceId: payout.id,
            }, tx);

            // 3. Record journal entries (double-entry)
            await journalEntryService.recordPayoutJournal({
                restaurantId: data.restaurantId,
                amount: data.amount,
                payoutId: payout.id,
                category: data.category,
                notes: data.notes,
                processedBy: data.staffId,
            }, tx);

            return payout;
        });
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

        // 3. Double-Entry Journal Record
        await journalEntryService.recordFloatIssueJournal({
            restaurantId: data.restaurantId,
            riderId: data.riderId,
            amount: amount,
            settlementId: data.referenceId || `FLT-${Date.now()}`,
            processedBy: data.processedBy
        }, db);
    }

    /**
     * Records a customer payment (Double-Entry).
     * Impacts: Debit Cash Drawer (Cash In), Credit Customer Ledger (Debt Out).
     */
    async recordCustomerPayment(data: {
        restaurantId: string;
        customerId: string;
        amount: number | Decimal;
        paymentMethod: 'CASH' | 'CARD';
        processedBy: string;
        orderId?: string;
    }, tx?: any) {
        const db = tx || prisma;
        const amount = new Decimal(data.amount.toString());

        // 1. DEBIT: Cash Drawer (Increase Physical Cash)
        await this.createLedgerEntry({
            restaurantId: data.restaurantId,
            transactionType: 'DEBIT',
            amount: amount,
            referenceType: 'SETTLEMENT',
            referenceId: data.orderId || `cust-${data.customerId}`,
            description: `Cash received from customer via ${data.paymentMethod}`,
            processedBy: data.processedBy
        }, db);

        // 2. CREDIT: Customer Ledger (Clear/Reduce Customer Debt)
        await this.createLedgerEntry({
            restaurantId: data.restaurantId,
            accountId: data.customerId,
            transactionType: 'CREDIT',
            amount: amount,
            referenceType: 'SETTLEMENT',
            referenceId: data.orderId || `cust-${data.customerId}`,
            description: `Customer debt reduced/advance received`,
            processedBy: data.processedBy
        }, db);

        // 2.1 Post to specialized Customer Ledger
        await this.postCustomerLedger({
            restaurantId: data.restaurantId,
            customerId: data.customerId,
            orderId: data.orderId,
            amount: amount,
            entryType: 'PAYMENT',
            description: `Payment received via ${data.paymentMethod}`,
            processedBy: data.processedBy
        }, db);
    }

    /**
     * Records a top-up/prepaid deposit for a customer.
     */
    async topUpAccount(data: {
        restaurantId: string;
        customerId: string;
        amount: number | Decimal;
        paymentMethod: 'CASH' | 'CARD';
        processedBy: string;
    }, tx?: any) {
        const db = tx || prisma;
        const amount = new Decimal(data.amount.toString());

        // 1. DEBIT: Cash Drawer
        await this.createLedgerEntry({
            restaurantId: data.restaurantId,
            transactionType: 'DEBIT',
            amount: amount,
            referenceType: 'SETTLEMENT',
            description: `Top-up/Deposit from customer via ${data.paymentMethod}`,
            processedBy: data.processedBy
        }, db);

        // 2. CREDIT: Customer (Legacy)
        await this.createLedgerEntry({
            restaurantId: data.restaurantId,
            accountId: data.customerId,
            transactionType: 'CREDIT',
            amount: amount,
            referenceType: 'SETTLEMENT',
            description: `Account top-up received`,
            processedBy: data.processedBy
        }, db);

        // 3. Post to Customer Ledger
        await this.postCustomerLedger({
            restaurantId: data.restaurantId,
            customerId: data.customerId,
            amount: amount,
            entryType: 'TOP_UP',
            description: `Prepaid Top-up via ${data.paymentMethod}`,
            processedBy: data.processedBy
        }, db);
    }

    /**
     * Internal helper to post to the specialized customer_ledgers table.
     * Manages running balance for the customer.
     */
    private async postCustomerLedger(data: {
        restaurantId: string;
        customerId: string;
        orderId?: string;
        amount: Decimal | number;
        entryType: string; // keyof typeof CustomerLedgerEntryType
        description?: string;
        processedBy?: string;
    }, tx?: any) {
        const db = tx || prisma;
        const amount = new Decimal(data.amount.toString());

        // Calculate new balance
        // CHARGE increases balance (debt), PAYMENT/TOP_UP decreases balance (clear debt/advance)
        const currentBalance = await this.getCustomerBalance(data.restaurantId, data.customerId, db);
        
        let newBalance = currentBalance;
        if (data.entryType === 'CHARGE') {
            newBalance = currentBalance.plus(amount);
        } else if (['PAYMENT', 'TOP_UP', 'REFUND'].includes(data.entryType)) {
            // PAYMENT/TOP_UP usually CR (Credit Account), decreasing the DEBIT (AR) balance
            // If balance represents DEBT, then PAYMENT reduces it.
            newBalance = currentBalance.minus(amount);
        } else if (data.entryType === 'ADJUSTMENT') {
            // For adjustments, amount is usually the DELTA. 
            // Positve = Increase Debt, Negative = Decrease Debt.
            newBalance = currentBalance.plus(amount);
        }

        return await db.customer_ledgers.create({
            data: {
                restaurant_id: data.restaurantId,
                customer_id: data.customerId,
                order_id: data.orderId,
                entry_type: data.entryType as any,
                amount: amount,
                balance_after: newBalance,
                description: data.description,
                processed_by: data.processedBy
            }
        });
    }

    /**
     * Internal helper to post to the specialized supplier_ledgers table.
     * Manages running balance for the supplier.
     */
    private async postSupplierLedger(data: {
        restaurantId: string;
        supplierId: string;
        payoutId?: string;
        amount: Decimal | number;
        entryType: string; // keyof typeof SupplierLedgerEntryType
        description?: string;
        processedBy?: string;
    }, tx?: any) {
        const db = tx || prisma;
        const amount = new Decimal(data.amount.toString());

        // Calculate new balance
        // BILL increases balance (liability), PAYMENT reduces it.
        const currentBalance = await this.getSupplierBalance(data.restaurantId, data.supplierId, db);
        
        let newBalance = currentBalance;
        if (data.entryType === 'BILL') {
            newBalance = currentBalance.plus(amount);
        } else if (['PAYMENT', 'REFUND'].includes(data.entryType)) {
            newBalance = currentBalance.minus(amount);
        } else if (data.entryType === 'ADJUSTMENT') {
            newBalance = currentBalance.plus(amount);
        }

        return await db.supplier_ledgers.create({
            data: {
                restaurant_id: data.restaurantId,
                supplier_id: data.supplierId,
                payout_id: data.payoutId,
                entry_type: data.entryType as any,
                amount: amount,
                balance_after: newBalance,
                description: data.description,
                processed_by: data.processedBy
            }
        });
    }

    /**
     * Retrieves the latest balance from the customer_ledgers table.
     */
    async getCustomerBalance(restaurantId: string, customerId: string, tx?: any): Promise<Decimal> {
        const db = tx || prisma;
        const latestEntry = await db.customer_ledgers.findFirst({
            where: {
                restaurant_id: restaurantId,
                customer_id: customerId
            },
            orderBy: { created_at: 'desc' }
        });

        return latestEntry ? new Decimal(latestEntry.balance_after) : new Decimal(0);
    }

    async getSupplierBalance(restaurantId: string, supplierId: string, tx?: any): Promise<Decimal> {
        const db = tx || prisma;
        const latestEntry = await db.supplier_ledgers.findFirst({
            where: {
                restaurant_id: restaurantId,
                supplier_id: supplierId
            },
            orderBy: { created_at: 'desc' }
        });

        return latestEntry ? new Decimal(latestEntry.balance_after) : new Decimal(0);
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
        const existing = await prisma.cashier_sessions.findFirst({
            where: {
                restaurant_id: data.restaurantId,
                status: 'OPEN'
            }
        });

        if (existing) {
            throw new Error(`Session already open since ${existing.opened_at}`);
        }

        return await prisma.cashier_sessions.create({
            data: {
                restaurant_id: data.restaurantId,
                opened_by: data.staffId,
                opening_float: new Decimal(data.openingBalance.toString()),
                status: 'OPEN'
            }
        });
    }

    async getActiveSession(restaurantId: string) {
        return await prisma.cashier_sessions.findFirst({
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
        const session = await prisma.cashier_sessions.findUnique({
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

        const expected = new Decimal(session.opening_float).plus(movement);
        const variance = actual.minus(expected);

        return await prisma.cashier_sessions.update({
            where: { id: data.sessionId },
            data: {
                closed_at: new Date(),
                closed_by: data.staffId,
                expected_cash: expected,
                actual_cash: actual,
                difference: variance,
                status: 'CLOSED',
                notes: data.notes
            }
        });
    }

    /**
     * VOID ORDER (Reverses Sales, Payments, and Settlement Journals & Ledgers)
     */
    async recordOrderVoid(orderId: string, staffId: string, tx: any) {
        if (!tx) throw new Error("Transaction required to void order accounting records.");
        const db = tx;

        // 1. Reverse Double-Entry Journals
        await journalEntryService.reverseJournalByReference('ORDER_SALE', orderId, staffId, db);
        await journalEntryService.reverseJournalByReference('RIDER_SETTLEMENT', orderId, staffId, db);

        // Find associated transactions (like Customer Payments) to reverse their journals
        const transactions = await db.transactions.findMany({
            where: { order_id: orderId }
        });
        for (const t of transactions) {
            await journalEntryService.reverseJournalByReference('CUSTOMER_PAYMENT', t.id, staffId, db);
            if (t.transaction_ref) {
                await journalEntryService.reverseJournalByReference('CUSTOMER_PAYMENT', t.transaction_ref, staffId, db);
            }
        }

        // 2. Reverse Single-Entry Ledgers (Shift Drawer / Rider Debits)
        const ledgers = await db.ledger_entries.findMany({
            where: { 
                reference_type: { in: ['ORDER', 'SETTLEMENT'] }, 
                reference_id: orderId 
            }
        });

        for (const l of ledgers) {
            await this.createLedgerEntry({
                restaurantId: l.restaurant_id,
                accountId: l.account_id,
                transactionType: l.transaction_type === 'DEBIT' ? 'CREDIT' : 'DEBIT',
                amount: l.amount,
                referenceType: 'VOID_ORDER',
                referenceId: orderId,
                description: `VOID REVERSAL: ${l.description}`,
                processedBy: staffId
            }, db);
        }
    }

    /**
     * Retrieves current session metrics and calculated expected cash.
     */
    async getSessionMetrics(restaurantId: string, businessDate?: string) {
        let session;
        
        if (businessDate) {
            const startOfDay = new Date(new Date(businessDate).setHours(0, 0, 0, 0));
            const endOfDay = new Date(new Date(businessDate).setHours(23, 59, 59, 999));
            
            session = await prisma.cashier_sessions.findFirst({
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

        const expectedCash = new Decimal(session.opening_float)
            .plus(cashSales)
            .plus(settlements) // Net settlements (In - Out)
            .minus(payouts);

        // Calculate order count for the session
        const orderCount = entries.filter(e => e.reference_type === 'ORDER' && e.transaction_type === 'CREDIT' && !e.account_id).length;

        return {
            ...session,
            metrics: {
                openingBalance: session.opening_float,
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
     * Records a supplier payment.
     * Debits Accounts Payable (2020), Credits Cash (1000).
     */
    async recordSupplierPayment(data: {
        restaurantId: string;
        supplierId: string;
        amount: number | Decimal;
        notes: string;
        processedBy: string;
        referenceId?: string;
    }, tx?: any): Promise<void> {
        const db = tx || prisma;
        const amount = new Decimal(data.amount.toString());

        // 1. CREDIT: Cash (cash leaves)
        await this.createLedgerEntry({
            restaurantId: data.restaurantId,
            transactionType: 'CREDIT',
            amount: amount,
            referenceType: 'PAYOUT',
            referenceId: data.referenceId,
            description: `Supplier payment: ${data.notes}`,
            processedBy: data.processedBy
        }, db);

        // 2. DEBIT: Accounts Payable (liability reduced)
        await this.createLedgerEntry({
            restaurantId: data.restaurantId,
            accountId: data.supplierId,
            transactionType: 'DEBIT',
            amount: amount,
            referenceType: 'PAYOUT',
            referenceId: data.referenceId,
            description: `Supplier payable reduced: ${data.notes}`,
            processedBy: data.processedBy
        }, db);

        // 3. Post supplier ledger entry
        await this.postSupplierLedger({
            restaurantId: data.restaurantId,
            supplierId: data.supplierId,
            amount: amount,
            entryType: 'PAYMENT',
            description: data.notes,
            processedBy: data.processedBy
        }, db);
    }

    /**
     * Retrieves an array of all sessions and their metrics for a given date.
     */
    async getSessionsForDate(restaurantId: string, businessDate: string) {
        const startOfDay = new Date(new Date(businessDate).setHours(0, 0, 0, 0));
        const endOfDay = new Date(new Date(businessDate).setHours(23, 59, 59, 999));
        
        const sessions = await prisma.cashier_sessions.findMany({
            where: {
                restaurant_id: restaurantId,
                opened_at: { gte: startOfDay, lte: endOfDay }
            },
            orderBy: { opened_at: 'asc' }
        });

        const results = [];
        // We reuse getSessionMetrics for each session ID by just directly querying the entries for it
        for (const session of sessions) {
            const entries = await prisma.ledger_entries.findMany({
                where: {
                    restaurant_id: restaurantId,
                    created_at: { gte: session.opened_at, lte: session.closed_at || new Date() }
                }
            });

            let cashSales = new Decimal(0);
            let payouts = new Decimal(0);
            let settlements = new Decimal(0);
            let totalRevenue = new Decimal(0);

            entries.forEach((e: any) => {
                const amt = new Decimal(e.amount);

                if (e.transaction_type === 'CREDIT' && e.reference_type === 'ORDER') {
                    totalRevenue = totalRevenue.plus(amt);
                }

                if (!e.account_id) {
                    if (e.transaction_type === 'DEBIT') {
                        if (e.reference_type === 'ORDER') cashSales = cashSales.plus(amt);
                        if (e.reference_type === 'SETTLEMENT') settlements = settlements.plus(amt);
                    } else {
                        if (e.reference_type === 'PAYOUT') payouts = payouts.plus(amt);
                        if (e.reference_type === 'SETTLEMENT') settlements = settlements.minus(amt);
                    }
                }
            });

            const expectedCash = new Decimal(session.opening_float)
                .plus(cashSales)
                .plus(settlements)
                .minus(payouts);

            const orderCount = entries.filter(e => e.reference_type === 'ORDER' && e.transaction_type === 'CREDIT' && !e.account_id).length;

            results.push({
                ...session,
                metrics: {
                    opening_float: Number(session.opening_float),
                    cashSales,
                    payouts,
                    settlements,
                    expectedCash,
                    totalRevenue,
                    orderCount
                }
            });
        }

        return results;
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
        const session = await prisma.cashier_sessions.findUnique({
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
            openingBalance: session.opening_float ? session.opening_float.toNumber() : 0,
            cashSales: new Decimal(0), // Initialize cashSales here
            payouts: new Decimal(0), // Initialize payouts here
            rider_settlements: new Decimal(0), // Initialize rider_settlements here
            expectedCash: session.expected_cash ? session.expected_cash.toNumber() : 0,
            actualCash: session.actual_cash ? session.actual_cash.toNumber() : 0,
            variance: session.difference ? session.difference.toNumber() : 0,
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
                variance: session.difference,
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

    /**
     * Records a manual charge to a customer's account (not necessarily linked to an order).
     */
    async recordManualCharge(data: {
        restaurantId: string;
        customerId: string;
        amount: number | Decimal;
        description?: string;
        processedBy: string;
    }, tx?: any) {
        const db = tx || prisma;
        const amount = new Decimal(data.amount.toString());

        // 1. CREDIT: Sales/Other Revenue (or whatever the offset should be for a manual charge)
        // Usually manual charges are for "Other Sales"
        await this.createLedgerEntry({
            restaurantId: data.restaurantId,
            transactionType: 'CREDIT',
            amount: amount,
            referenceType: 'ADJUSTMENT',
            description: data.description || `Manual account charge`,
            processedBy: data.processedBy
        }, db);

        // 2. DEBIT: Customer Asset (Khata)
        await this.createLedgerEntry({
            restaurantId: data.restaurantId,
            accountId: data.customerId,
            transactionType: 'DEBIT',
            amount: amount,
            referenceType: 'ADJUSTMENT',
            description: data.description || `Manual charge posted to account`,
            processedBy: data.processedBy
        }, db);

        // 3. Post to Customer Ledger
        await this.postCustomerLedger({
            restaurantId: data.restaurantId,
            customerId: data.customerId,
            amount: amount,
            entryType: 'CHARGE',
            description: data.description || `Manual account charge`,
            processedBy: data.processedBy
        }, db);
    }

    /**
     * Records a supplier bill (not necessarily linked to a PO).
     * Increases liability.
     */
    async recordSupplierBill(data: {
        restaurantId: string;
        supplierId: string;
        amount: number | Decimal;
        description?: string;
        processedBy: string;
        referenceId?: string;
    }, tx?: any) {
        const db = tx || prisma;
        const amount = new Decimal(data.amount.toString());

        // 1. DEBIT: Expense (Increase Cost)
        await this.createLedgerEntry({
            restaurantId: data.restaurantId,
            transactionType: 'DEBIT',
            amount: amount,
            referenceType: 'ADJUSTMENT',
            description: data.description || `Supplier bill received`,
            processedBy: data.processedBy
        }, db);

        // 2. CREDIT: Supplier Liability (Liability Up)
        await this.createLedgerEntry({
            restaurantId: data.restaurantId,
            accountId: data.supplierId,
            transactionType: 'CREDIT',
            amount: amount,
            referenceType: 'ADJUSTMENT',
            description: data.description || `Outstanding bill posted to ledger`,
            processedBy: data.processedBy
        }, db);

        // 3. Post to Supplier Ledger
        await this.postSupplierLedger({
            restaurantId: data.restaurantId,
            supplierId: data.supplierId,
            amount: amount,
            entryType: 'BILL',
            description: data.description || `Supplier bill received`,
            processedBy: data.processedBy
        }, db);

        // 4. Double-Entry Journal
        try {
            await journalEntryService.recordSupplierBillJournal({
                restaurantId: data.restaurantId,
                supplierId: data.supplierId,
                amount: amount,
                billId: data.referenceId || `bill-${Date.now()}`,
                description: data.description || 'Supplier bill',
                processedBy: data.processedBy
            }, db);
        } catch (jeErr) {
            console.error('[JE] recordSupplierBillJournal failed:', jeErr);
        }
    }
}


