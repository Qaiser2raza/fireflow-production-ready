import { prisma } from '../../../shared/lib/prisma';
import { FinanceStatus, ShiftStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export class CashierSessionService {
    private static async calculateShiftExpectedCash(restaurantId: string, shift: { day_start: Date; day_end: Date | null; opening_float: Decimal }) {
        if (!shift.day_end) throw new Error('SHIFT_NOT_CLOSED');
        const transactions = await prisma.transactions.findMany({
            where: {
                restaurant_id: restaurantId,
                payment_method: 'CASH',
                status: { in: ['COMPLETED', 'REFUNDED'] },
                created_at: { gte: shift.day_start, lte: shift.day_end },
            },
            select: { amount: true, status: true },
        });
        return transactions.reduce((total, transaction) => (
            transaction.status === 'REFUNDED' ? total.minus(transaction.amount) : total.plus(transaction.amount)
        ), new Decimal(shift.opening_float.toString()));
    }

    private static async assertFinanceManager(restaurantId: string, staffId: string) {
        const staff = await prisma.staff.findFirst({
            where: { id: staffId, restaurant_id: restaurantId, role: { in: ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] }, status: 'active' },
            select: { id: true },
        });
        if (!staff) throw new Error('FINANCE_MANAGER_REQUIRED');
    }

    static async createFinanceEntry(restaurantId: string, shiftId: string) {
        try {
            return await prisma.$transaction(async (tx) => {
                const shift = await tx.shift_sessions.findFirst({
                    where: { id: shiftId, restaurant_id: restaurantId, status: ShiftStatus.CLOSED },
                });
                if (!shift) throw new Error('CLOSED_SHIFT_NOT_FOUND');
                const pending = await tx.finance_entries.findFirst({
                    where: { shift_id: shiftId, status: FinanceStatus.PENDING_REVIEW }, select: { id: true },
                });
                if (pending) throw new Error('PENDING_FINANCE_ENTRY_EXISTS');
                const confirmed = await tx.finance_entries.findFirst({
                    where: { shift_id: shiftId, status: FinanceStatus.CONFIRMED }, select: { id: true },
                });
                if (confirmed) throw new Error('FINANCE_ENTRY_ALREADY_CONFIRMED');
                const expected = await this.calculateShiftExpectedCash(restaurantId, shift);
                return tx.finance_entries.create({ data: {
                    shift_id: shift.id, restaurant_id: restaurantId, business_date: shift.business_date,
                    opening_float: shift.opening_float, expected_cash: expected,
                    actual_cash: shift.actual_cash, difference: shift.actual_cash ? shift.actual_cash.minus(expected) : null,
                    status: FinanceStatus.PENDING_REVIEW,
                } });
            });
        } catch (error: any) {
            if (error?.code === 'P2002') throw new Error('PENDING_FINANCE_ENTRY_EXISTS');
            throw error;
        }
    }

    static async confirmFinanceEntry(restaurantId: string, financeEntryId: string, confirmedBy: string) {
        await this.assertFinanceManager(restaurantId, confirmedBy);
        return prisma.$transaction(async (tx) => {
            const entry = await tx.finance_entries.findFirst({ where: { id: financeEntryId, restaurant_id: restaurantId } });
            if (!entry) throw new Error('FINANCE_ENTRY_NOT_FOUND');
            if (entry.status !== FinanceStatus.PENDING_REVIEW) throw new Error('FINANCE_ENTRY_NOT_ACTIONABLE');
            return tx.finance_entries.update({ where: { id: entry.id }, data: { status: FinanceStatus.CONFIRMED, confirmed_by: confirmedBy, confirmed_at: new Date() } });
        });
    }

    static async rejectFinanceEntry(restaurantId: string, financeEntryId: string, rejectedBy: string, reason: string) {
        if (!reason.trim()) throw new Error('REJECTION_REASON_REQUIRED');
        await this.assertFinanceManager(restaurantId, rejectedBy);
        try {
            return await prisma.$transaction(async (tx) => {
                const entry = await tx.finance_entries.findFirst({ where: { id: financeEntryId, restaurant_id: restaurantId } });
                if (!entry) throw new Error('FINANCE_ENTRY_NOT_FOUND');
                if (entry.status !== FinanceStatus.PENDING_REVIEW) throw new Error('FINANCE_ENTRY_NOT_ACTIONABLE');
                const rejected = await tx.finance_entries.update({ where: { id: entry.id }, data: { status: FinanceStatus.REJECTED, rejected_by: rejectedBy, rejected_reason: reason.trim() } });
                const resubmission = await tx.finance_entries.create({ data: {
                    shift_id: entry.shift_id, restaurant_id: entry.restaurant_id, business_date: entry.business_date,
                    opening_float: entry.opening_float, expected_cash: entry.expected_cash, actual_cash: entry.actual_cash,
                    difference: entry.difference, status: FinanceStatus.PENDING_REVIEW,
                } });
                return { rejected, resubmission };
            });
        } catch (error: any) {
            if (error?.code === 'P2002') throw new Error('PENDING_FINANCE_ENTRY_EXISTS');
            throw error;
        }
    }

    static async getFinanceReport(restaurantId: string, from?: Date, to?: Date, status?: FinanceStatus) {
        return prisma.finance_entries.findMany({
            where: { restaurant_id: restaurantId, ...(status ? { status } : {}), ...(from || to ? { business_date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
            include: { shift: { select: { business_date: true, opened_by: true, closed_by: true, status: true } } },
            orderBy: { created_at: 'desc' },
        });
    }

    static async getLatestFinanceEntry(restaurantId: string, shiftId: string) {
        return prisma.finance_entries.findFirst({ where: { restaurant_id: restaurantId, shift_id: shiftId }, orderBy: [{ created_at: 'desc' }, { id: 'desc' }] });
    }

    static async openSession(restaurantId: string, staffId: string, openingFloat: number, expectedFloat: number = 0, terminalId?: string) {
        // Check for existing open session for this restaurant
        // Note: For multi-terminal enterprise, we might allow multiple open sessions, 
        // but for now we enforce one open session per restaurant/staff or just per restaurant.
        // Let's go with one open session per staff member at a time.
        
        const existing = await prisma.cashier_sessions.findFirst({
            where: {
                restaurant_id: restaurantId,
                opened_by: staffId,
                status: 'OPEN'
            }
        });

        if (existing) {
            throw new Error('You already have an open session. Please close it before opening a new one.');
        }

        const session = await prisma.cashier_sessions.create({
            data: {
                restaurant_id: restaurantId,
                opened_by: staffId,
                opening_float: new Decimal(openingFloat),
                status: 'OPEN',
                ...(terminalId ? { terminal_id: terminalId } : {})
            }
        });

        // Post Session Open Journal — Float Confirmation
        // DR 1000 Cash (float is now in drawer)  CR 1090 Manager Safe (float came from safe)
        try {
            const { journalEntryService } = await import('../JournalEntryService.js');
            await journalEntryService.recordSessionOpenJournal({
                restaurantId,
                sessionId: session.id,
                expectedFloat,
                openingFloat,
                processedBy: staffId
            });
        } catch (e) {
            // Non-blocking — session is created, journal is best-effort
            console.warn('[Session Open Journal]', e);
        }

        return session;
    }

    static async getActiveSession(restaurantId: string, staffId: string) {
        const session = await prisma.cashier_sessions.findFirst({
            where: { restaurant_id: restaurantId, opened_by: staffId, status: 'OPEN' },
            orderBy: { opened_at: 'desc' }
        });

        if (!session) {
            const cashAccount = await prisma.chart_of_accounts.findFirst({
                where: { 
                    restaurant_id: restaurantId, 
                    code: '1000' 
                },
                select: { id: true }
            });

            let expectedNextFloat = 0;
            if (cashAccount) {
                const result = await prisma.journal_entry_lines.aggregate({
                    where: { account_id: cashAccount.id },
                    _sum: { debit: true, credit: true }
                });
                const totalDebit = Number(result._sum.debit || 0);
                const totalCredit = Number(result._sum.credit || 0);
                expectedNextFloat = Math.max(0, totalDebit - totalCredit);
            }

            return { session: null, expectedNextFloat };
        }

        return { session };
    }

    static async getAnyActiveSession(restaurantId: string) {
        return await prisma.cashier_sessions.findFirst({
            where: {
                restaurant_id: restaurantId,
                status: 'OPEN'
            }
        });
    }

    static async closeSession(restaurantId: string, sessionId: string, actualCash: number, withdrawnAmount: number, closedBy: string, notes?: string) {
        const { journalEntryService } = await import('../JournalEntryService.js');
        const session = await prisma.cashier_sessions.findUnique({
            where: { id: sessionId }
        });

        if (!session || session.status === 'CLOSED') {
            throw new Error('Invalid or already closed session.');
        }

        if (session.restaurant_id !== restaurantId) {
            throw new Error('Access denied: Session does not belong to this restaurant');
        }

        const cashAccount = await prisma.chart_of_accounts.findFirst({
            where: { restaurant_id: session.restaurant_id, code: '1000' },
            select: { id: true }
        });

        let expectedCash = new Decimal(session.opening_float.toString());

        if (cashAccount) {
            const ledgers = await prisma.journal_entry_lines.findMany({
                where: {
                    account_id: cashAccount.id,
                    journal_entries: {
                        created_at: { gte: session.opened_at }
                    }
                }
            });

            ledgers.forEach(l => {
                const isOrderDebit = l.reference_type === 'ORDER' && Number(l.debit) > 0;
                const isSettlementDebit = l.reference_type === 'SETTLEMENT' && Number(l.debit) > 0;
                const isRiderDebit = l.reference_type === 'RIDER' && Number(l.debit) > 0;
                const isSettlementCredit = l.reference_type === 'SETTLEMENT' && Number(l.credit) > 0;
                const isPayoutCredit = l.reference_type === 'PAYOUT' && Number(l.credit) > 0;
                const isRiderCredit = l.reference_type === 'RIDER' && Number(l.credit) > 0;
                // [M018 F-02 §7/§8] Cash refunds leave the drawer: the
                // mirror-image journal credits 1000 with reference_type
                // ORDER_REFUND inside the containing OPEN session.
                const isRefundCredit = l.reference_type === 'ORDER_REFUND' && Number(l.credit) > 0;

                if (isOrderDebit || isSettlementDebit || isRiderDebit) {
                    expectedCash = expectedCash.plus(new Decimal(l.debit.toString()));
                } else if (isSettlementCredit || isPayoutCredit || isRiderCredit || isRefundCredit) {
                    expectedCash = expectedCash.minus(new Decimal(l.credit.toString()));
                }
            });
        }
        const actual = new Decimal(actualCash);
        const difference = actual.minus(expectedCash);

        // Trigger Double-Entry Journaling (blocking — F-06)
        // Journal must succeed before the session is marked CLOSED.
        // If journaling fails, the session remains OPEN and the cashier
        // can retry; we never silently close with missing accounting.
        try {
            await journalEntryService.recordSessionCloseJournal({
                restaurantId: session.restaurant_id,
                sessionId: sessionId,
                withdrawnAmount: withdrawnAmount,
                actualHandover: withdrawnAmount,
                variance: difference,
                description: notes || `Session closed by ${closedBy}`,
                processedBy: closedBy
            });
        } catch (e) {
            throw new Error('SESSION_CLOSE_JOURNAL_FAILED: Session close journal failed — close blocked to preserve accounting integrity');
        }

        const updated = await prisma.cashier_sessions.update({
            where: { id: sessionId },
            data: {
                closed_at: new Date(),
                closed_by: closedBy,
                actual_cash: actual,
                expected_cash: expectedCash,
                difference: difference,
                status: 'CLOSED',
                notes: notes
            }
        });

        return updated;
    }

    static async getSessionSummary(restaurantId: string, sessionId: string) {
        const session = await prisma.cashier_sessions.findUnique({
            where: { id: sessionId },
            include: { 
                staff_cashier_sessions_opened_byTostaff: true,
                staff_cashier_sessions_closed_byTostaff: true
            }
        });

        if (!session) throw new Error('Session not found');
        if (session.restaurant_id !== restaurantId) {
            throw new Error('Access denied: Session does not belong to this restaurant');
        }

        // Use a direct query filtered by session_id — this guarantees ALL order types
        // (DINE_IN, TAKEAWAY, DELIVERY settled via settle route) are captured,
        // not just those linked through the Prisma relation (which can miss edge cases).
        const sessionOrders = await prisma.orders.findMany({
            where: {
                session_id: sessionId,
                is_deleted: false
            },
            include: { transactions: true }
        });

        const endTime = session.closed_at || new Date();
        const ledgers = await prisma.ledger_entries.findMany({
            where: {
                restaurant_id: session.restaurant_id,
                created_at: { gte: session.opened_at, lte: endTime },
                account_id: null
            }
        });

        let payouts = 0;
        let customerPayments = 0;
        let ledgerCashIn = 0;
        let ledgerCashOut = 0;

        ledgers.forEach(l => {
            if (l.reference_type === 'PAYOUT' && l.transaction_type === 'CREDIT') {
                payouts += Number(l.amount);
            }
            if (l.reference_type === 'SETTLEMENT' && l.transaction_type === 'DEBIT') {
                customerPayments += Number(l.amount);
            }

            // Only count physical cash drawer movements
            // DEBIT ORDER = cash sale received (dine-in/takeaway only)
            // DEBIT SETTLEMENT = cash received from rider
            // CREDIT SETTLEMENT = float issued to rider  
            // CREDIT PAYOUT = expenses paid out
            // Exclude: ORDER CREDIT (revenue) and DELIVERY ORDER debits 
            //          (cash goes to rider not drawer)
            
            const isOrderDebit = l.reference_type === 'ORDER' && l.transaction_type === 'DEBIT';
            const isSettlementDebit = l.reference_type === 'SETTLEMENT' && l.transaction_type === 'DEBIT';
            const isRiderDebit = l.reference_type === 'RIDER' && l.transaction_type === 'DEBIT';
            const isSettlementCredit = l.reference_type === 'SETTLEMENT' && l.transaction_type === 'CREDIT';
            const isPayoutCredit = l.reference_type === 'PAYOUT' && l.transaction_type === 'CREDIT';
            const isRiderCredit = l.reference_type === 'RIDER' && l.transaction_type === 'CREDIT';
            // [M018 F-02 §7] Refunded money left the drawer (asset-side
            // credits); the revenue-reversal debit is not a drawer movement.
            const isRefundCredit = l.reference_type === 'REFUND' && l.transaction_type === 'CREDIT';

            if (isOrderDebit || isSettlementDebit || isRiderDebit) {
                ledgerCashIn += Number(l.amount);
            } else if (isSettlementCredit || isPayoutCredit || isRiderCredit || isRefundCredit) {
                ledgerCashOut += Number(l.amount);
            }
        });

        const summary = {
            openingFloat: Number(session.opening_float),
            cashSales: 0,
            cardSales: 0,
            raastSales: 0,
            creditSales: 0,
            totalSales: 0,
            orderCount: sessionOrders.length,
            dineInSales: 0,
            takeawaySales: 0,
            deliverySales: 0,
            taxCollected: 0,
            serviceChargeCollected: 0,
            discountGiven: 0,
            payouts,
            customerPayments,
            expectedCash: 0  // computed after orders loop
        };

        sessionOrders.forEach(order => {
            summary.totalSales += Number(order.total);
            if (order.type === 'DINE_IN') summary.dineInSales += Number(order.total);
            if (order.type === 'TAKEAWAY') summary.takeawaySales += Number(order.total);
            if (order.type === 'DELIVERY') summary.deliverySales += Number(order.total);

            summary.taxCollected += Number(order.tax || 0);
            summary.serviceChargeCollected += Number(order.service_charge || 0);
            summary.discountGiven += Number(order.discount || 0);

            order.transactions.forEach(tx => {
                const amt = Number(tx.amount);
                if (tx.payment_method === 'CASH') summary.cashSales += amt;
                else if (tx.payment_method === 'CARD') summary.cardSales += amt;
                else if (tx.payment_method === 'RAAST') summary.raastSales += amt;
                else if (tx.payment_method === 'CREDIT') summary.creditSales += amt;
            });
        });

        // expectedCash = openingFloat + SUM of DEBIT ledger entries (cash in) - SUM of CREDIT ledger entries (cash out)
        // using purely ledger entries, not transactions
        summary.expectedCash = summary.openingFloat + ledgerCashIn - ledgerCashOut;

        const openedDate = session.opened_at.toDateString();
        const closeDate = endTime.toDateString();
        const isMultiDay = openedDate !== closeDate;

        return {
            ...session,
            orders: sessionOrders,   // include for callers that iterate orders
            calculatedSummary: summary,
            isMultiDay,
            sessionOpenedDate: session.opened_at,
            sessionClosedDate: endTime
        };
    }

    /**
     * SVC Distribution
     * Distributes service charge collected to staff.
     * DR 2010 Service Charge Payable  (liability cleared)
     * CR 1000 Cash                    (cash paid out to staff)
     *
     * @param distributions Array of { staffId, staffName, amount } — must sum to totalSVC
     */
    static async distributeSVC(params: {
        restaurantId: string;
        sessionId: string;
        totalAmount: number;
        distributions: Array<{ staffId?: string; staffName: string; amount: number }>;
        processedBy: string;
    }) {
        const { journalEntryService } = await import('../JournalEntryService.js');
        const refId = `SVC-${params.sessionId}`;

        // Idempotency: reject if already distributed for this session
        const existing = await prisma.journal_entries.findFirst({
            where: { reference_type: 'SVC_DISTRIBUTION', reference_id: refId }
        });
        if (existing) throw new Error('SVC already distributed for this session.');

        // Verify session ownership
        const session = await prisma.cashier_sessions.findUnique({
            where: { id: params.sessionId }
        });
        if (!session || session.restaurant_id !== params.restaurantId) {
            throw new Error('Access denied: Session does not belong to this restaurant');
        }

        await journalEntryService.recordSVCDistributionJournal({
            restaurantId: params.restaurantId,
            sessionId: params.sessionId,
            totalAmount: params.totalAmount,
            distributions: params.distributions,
            processedBy: params.processedBy,
            referenceId: refId
        });

        // SVC distribution is fully captured in the journal entry — no separate session field needed
        return { success: true, distributed: params.totalAmount, distributions: params.distributions };
    }

    /**
     * Manager Drawing — standalone entry (can be called any time during the day)
     * DR 1090 Manager Safe/Drawing  (safe increases)
     * CR 1000 Cash                  (cash leaves drawer)
     */
    static async recordManagerDrawing(params: {
        restaurantId: string;
        sessionId: string;
        amount: number;
        notes?: string;
        processedBy: string;
    }) {
        const { journalEntryService } = await import('../JournalEntryService.js');
        const refId = `DRAWING-${params.sessionId}-${Date.now()}`;

        // Verify session ownership
        const session = await prisma.cashier_sessions.findUnique({
            where: { id: params.sessionId }
        });
        if (!session || session.restaurant_id !== params.restaurantId) {
            throw new Error('Access denied: Session does not belong to this restaurant');
        }

        await journalEntryService.recordManagerDrawingJournal({
            restaurantId: params.restaurantId,
            sessionId: params.sessionId,
            amount: params.amount,
            notes: params.notes,
            processedBy: params.processedBy,
            referenceId: refId
        });

        return { success: true, amount: params.amount, referenceId: refId };
    }
}
