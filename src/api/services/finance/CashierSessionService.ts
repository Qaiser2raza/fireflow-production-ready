import { prisma } from '../../../shared/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export class CashierSessionService {
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
            // Find last closed session to get expected float
            const lastSession = await prisma.cashier_sessions.findFirst({
                where: { restaurant_id: restaurantId, status: 'CLOSED' },
                orderBy: { closed_at: 'desc' }
            });
            let expectedNextFloat = 0;
            if (lastSession && lastSession.actual_cash !== null) {
                const closingCash = Number(lastSession.actual_cash.toString());
                
                const withdrawnLine = await prisma.journal_entry_lines.findFirst({
                    where: {
                        reference_type: 'CASHIER_SESSION',
                        reference_id: lastSession.id,
                        description: 'Shift withdrawal to manager'
                    }
                });
                const withdrawn = withdrawnLine && withdrawnLine.debit ? Number(withdrawnLine.debit.toString()) : 0;
                
                const leftover = closingCash - withdrawn;
                expectedNextFloat = Math.max(0, leftover);
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

    static async closeSession(sessionId: string, actualCash: number, withdrawnAmount: number, closedBy: string, notes?: string) {
        const { journalEntryService } = await import('../JournalEntryService.js');
        const session = await prisma.cashier_sessions.findUnique({
            where: { id: sessionId }
        });

        if (!session || session.status === 'CLOSED') {
            throw new Error('Invalid or already closed session.');
        }

        // Direct query by session_id so ALL settled order types are captured
        // (DINE_IN, TAKEAWAY, and DELIVERY settled via logistics all set session_id on close)
        const sessionOrders = await prisma.orders.findMany({
            where: { session_id: sessionId, is_deleted: false },
            include: { transactions: true }
        });

        // Calculate expected cash: opening float + sum of CASH transactions in this session
        let cashSales = new Decimal(0);
        sessionOrders.forEach(order => {
            order.transactions.forEach(tx => {
                if (tx.payment_method === 'CASH' && (tx.status === 'SUCCESS' || tx.status === 'PAID')) {
                    cashSales = cashSales.plus(new Decimal(tx.amount.toString()));
                }
            });
        });

        const expectedCash = new Decimal(session.opening_float.toString()).plus(cashSales);
        const actual = new Decimal(actualCash);
        const difference = actual.minus(expectedCash);

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

        // Trigger Double-Entry Journaling (non-blocking)
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
            console.error('[Session Close Journal Error]:', e);
        }

        return updated;
    }

    static async getSessionSummary(sessionId: string) {
        const session = await prisma.cashier_sessions.findUnique({
            where: { id: sessionId },
            include: { 
                staff_cashier_sessions_opened_byTostaff: true,
                staff_cashier_sessions_closed_byTostaff: true
            }
        });

        if (!session) throw new Error('Session not found');

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

            if (l.transaction_type === 'DEBIT') {
                ledgerCashIn += Number(l.amount);
            } else if (l.transaction_type === 'CREDIT') {
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
