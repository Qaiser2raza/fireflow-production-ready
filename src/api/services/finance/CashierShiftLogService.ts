import { prisma } from '../../../shared/lib/prisma.js';
import { Prisma } from '@prisma/client';
import { AccountingService } from '../AccountingService.js';

const accounting = new AccountingService();

export class CashierShiftLogService {

    /**
     * Create a new pending shift log entry (Cashier action)
     */
    static async createLog(data: {
        restaurantId: string;
        sessionId: string;
        type: 'INFLOW' | 'OUTFLOW';
        amount: number;
        description: string;
        category?: string;
        referenceId?: string;
    }) {
        if (!data.restaurantId || !data.sessionId || !data.amount) {
            throw new Error("Missing required fields for shift log");
        }

        return prisma.cashier_shift_logs.create({
            data: {
                restaurant_id: data.restaurantId,
                session_id: data.sessionId,
                type: data.type,
                amount: new Prisma.Decimal(data.amount),
                description: data.description,
                category: data.category || 'MISC',
                reference_id: data.referenceId,
                status: 'PENDING'
            }
        });
    }

    /**
     * Get all logs for a specific session
     */
    static async getLogsForSession(sessionId: string) {
        return prisma.cashier_shift_logs.findMany({
            where: { session_id: sessionId },
            orderBy: { created_at: 'desc' },
            include: {
                staff: {
                    select: { name: true, role: true }
                }
            }
        });
    }

    /**
     * Resolve a pending log (Manager action)
     * Routes through AccountingService so that ledger_entries,
     * entity sub-ledgers (customer_ledgers / supplier_ledgers),
     * AND GL journal entries are all posted atomically.
     */
    static async resolveLog(data: {
        logId: string;
        status: 'APPROVED' | 'REJECTED';
        managerId: string;
        correctedCategory?: string;
        entityId?: string; // customer_id or supplier_id
    }) {
        const log = await prisma.cashier_shift_logs.findUnique({
            where: { id: data.logId },
            include: { cashier_sessions: true }
        });

        if (!log) throw new Error("Log not found");
        if (log.status !== 'PENDING') throw new Error("Log has already been resolved");

        const updatedLog = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            // 1. Mark the log as resolved
            const finalCategory = data.correctedCategory || log.category;
            
            const resolved = await tx.cashier_shift_logs.update({
                where: { id: data.logId },
                data: {
                    status: data.status,
                    category: finalCategory,
                    processed_by: data.managerId,
                    // Store the entity reference for audit trail
                    reference_id: data.entityId || log.reference_id
                }
            });

            // 2. If APPROVED, adjust the session's expected_cash 
            // INFLOW increases expected cash in drawer, OUTFLOW decreases it.
            if (data.status === 'APPROVED' && log.cashier_sessions) {
                const amountNum = Number(log.amount);
                const adjustment = log.type === 'INFLOW' ? amountNum : -amountNum;

                const currentExpected = log.cashier_sessions.expected_cash ? Number(log.cashier_sessions.expected_cash) : 0;
                
                await tx.cashier_sessions.update({
                    where: { id: log.session_id },
                    data: {
                        expected_cash: new Prisma.Decimal(currentExpected + adjustment)
                    }
                });

                // 3. Route through AccountingService for full triple-posting
                // (ledger_entries + entity sub-ledger + GL journal)
                if (log.type === 'OUTFLOW') {
                    if (finalCategory === 'SUPPLIER' && data.entityId) {
                        // Supplier Payment: ledger + supplier_ledgers + GL
                        await accounting.recordSupplierPayment({
                            restaurantId: log.restaurant_id,
                            supplierId: data.entityId,
                            amount: amountNum,
                            notes: `[Daybook] ${log.description}`,
                            processedBy: data.managerId,
                            referenceId: log.id,
                            entry_status: 'approved',
                        }, tx);
                    } else {
                        // General Expense: payout record + ledger + GL
                        await accounting.recordPayout({
                            restaurantId: log.restaurant_id,
                            amount: amountNum,
                            category: finalCategory || 'GENERAL_EXPENSE',
                            notes: `[Daybook] ${log.description}`,
                            processedBy: data.managerId,
                            referenceId: log.id,
                        }, tx);
                    }
                } else if (log.type === 'INFLOW') {
                    if (finalCategory === 'CUSTOMER_PAYMENT' && data.entityId) {
                        // Customer Receipt: ledger + customer_ledgers + GL
                        await accounting.recordCustomerPayment({
                            restaurantId: log.restaurant_id,
                            customerId: data.entityId,
                            amount: amountNum,
                            paymentMethod: 'CASH',
                            processedBy: data.managerId,
                            entry_status: 'approved',
                        }, tx);
                    } else {
                        // Misc Revenue: balanced double-entry (DEBIT Cash, CREDIT Misc Revenue)
                        // FIX BUG-04: was single-sided (debit-only), which drifted the Trial Balance
                        await accounting.createLedgerEntry({
                            restaurantId: log.restaurant_id,
                            transactionType: 'DEBIT',   // Cash (1000) increases
                            amount: amountNum,
                            referenceType: 'ADJUSTMENT',
                            referenceId: log.id,
                            description: `[Daybook Inflow] ${log.description}`,
                            processedBy: data.managerId,
                        }, tx);
                        // Offsetting credit to Misc Revenue (account code 4030)
                        await accounting.createLedgerEntry({
                            restaurantId: log.restaurant_id,
                            transactionType: 'CREDIT',  // Revenue account increases
                            amount: amountNum,
                            referenceType: 'ADJUSTMENT',
                            referenceId: log.id,
                            description: `[Daybook Misc Revenue] ${log.description}`,
                            processedBy: data.managerId,
                        }, tx);
                    }
                }
            }

            return resolved;
        });

        return updatedLog;
    }
}
