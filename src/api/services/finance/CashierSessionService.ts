import { prisma } from '../../../shared/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export class CashierSessionService {
    static async openSession(restaurantId: string, staffId: string, openingFloat: number) {
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

        return await prisma.cashier_sessions.create({
            data: {
                restaurant_id: restaurantId,
                opened_by: staffId,
                opening_float: new Decimal(openingFloat),
                status: 'OPEN'
            }
        });
    }

    static async getActiveSession(restaurantId: string, staffId: string) {
        return await prisma.cashier_sessions.findFirst({
            where: {
                restaurant_id: restaurantId,
                opened_by: staffId,
                status: 'OPEN'
            }
        });
    }

    static async closeSession(sessionId: string, actualCash: number, closedBy: string, notes?: string) {
        const session = await prisma.cashier_sessions.findUnique({
            where: { id: sessionId },
            include: { orders: { where: { is_deleted: false }, include: { transactions: true } } }
        });

        if (!session || session.status === 'CLOSED') {
            throw new Error('Invalid or already closed session.');
        }

        // Calculate expected cash
        // expected_cash = opening_float + SUM(cash transactions in this session)
        let cashSales = new Decimal(0);
        session.orders.forEach(order => {
            order.transactions.forEach(tx => {
                if (tx.payment_method === 'CASH' && tx.status === 'SUCCESS') {
                    cashSales = cashSales.plus(new Decimal(tx.amount.toString()));
                }
            });
        });

        const expectedCash = new Decimal(session.opening_float.toString()).plus(cashSales);
        const actual = new Decimal(actualCash);
        const difference = actual.minus(expectedCash);

        return await prisma.cashier_sessions.update({
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
    }

    static async getSessionSummary(sessionId: string) {
        const session = await prisma.cashier_sessions.findUnique({
            where: { id: sessionId },
            include: { 
                orders: { 
                    where: { is_deleted: false },
                    include: { 
                        transactions: true 
                    } 
                },
                opened_by_staff: true,
                closed_by_staff: true
            }
        });

        if (!session) throw new Error('Session not found');

        const summary = {
            openingFloat: Number(session.opening_float),
            cashSales: 0,
            cardSales: 0,
            raastSales: 0,
            creditSales: 0,
            totalSales: 0,
            orderCount: session.orders.length
        };

        session.orders.forEach(order => {
            summary.totalSales += Number(order.total);
            order.transactions.forEach(tx => {
                const amt = Number(tx.amount);
                if (tx.payment_method === 'CASH') summary.cashSales += amt;
                else if (tx.payment_method === 'CARD') summary.cardSales += amt;
                else if (tx.payment_method === 'RAAST') summary.raastSales += amt;
                else if (tx.payment_method === 'CREDIT') summary.creditSales += amt;
            });
        });

        return {
            ...session,
            calculatedSummary: summary
        };
    }
}
