import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AccountingService } from '../AccountingService';

const prisma = new PrismaClient();
const accounting = new AccountingService();

export class RiderShiftService {
    /**
     * Opens a new shift for a rider.
     * Impact: Credit Main Cash, Debit Rider Liability (Float)
     */
    async openShift(data: {
        restaurantId: string;
        riderId: string;
        openedBy: string;
        openingFloat: number | Decimal;
        notes?: string;
    }) {
        const amount = new Decimal(data.openingFloat.toString());

        return await prisma.$transaction(async (tx) => {
            // 1. Check if rider already has an open shift
            const existing = await tx.rider_shifts.findFirst({
                where: {
                    rider_id: data.riderId,
                    status: 'OPEN'
                }
            });

            if (existing) {
                throw new Error('Rider already has an active open shift');
            }

            // 2. Create the shift record
            const shift = await tx.rider_shifts.create({
                data: {
                    restaurant_id: data.restaurantId,
                    rider_id: data.riderId,
                    opened_by: data.openedBy,
                    opening_float: amount,
                    status: 'OPEN',
                    notes: data.notes
                }
            });

            // 3. Record Float Issued in Ledger
            if (!amount.isZero()) {
                await accounting.createLedgerEntry({
                    restaurantId: data.restaurantId,
                    transactionType: 'CREDIT', // Main cash leaves
                    amount: amount,
                    referenceType: 'ADJUSTMENT', // Using generic for now, will refine
                    referenceId: shift.id,
                    description: `Shift Opening Float issued to rider`,
                    processedBy: data.openedBy
                }, tx);

                await accounting.createLedgerEntry({
                    restaurantId: data.restaurantId,
                    accountId: data.riderId,
                    transactionType: 'DEBIT', // Rider liability increases
                    amount: amount,
                    referenceType: 'ADJUSTMENT',
                    referenceId: shift.id,
                    description: `Shift Opening Float received`,
                    processedBy: data.openedBy
                }, tx);
            }

            return shift;
        });
    }

    /**
     * Closes an active shift.
     * Impact: Debit Main Cash, Credit Rider Liability (Clears what they owe)
     */
    async closeShift(data: {
        shiftId: string;
        closedBy: string;
        closingCash: number | Decimal;
        notes?: string;
    }) {
        return await prisma.$transaction(async (tx) => {
            const shift = await tx.rider_shifts.findUnique({
                where: { id: data.shiftId }
            });

            if (!shift || shift.status === 'CLOSED') {
                throw new Error('Valid open shift required for closing');
            }

            const received = new Decimal(data.closingCash.toString());

            // 1. Calculate Expected Final Handover
            // Total Shift Value = Opening Float + ALL orders that generated cash in this shift
            const cashOrders = await tx.orders.findMany({
                where: {
                    rider_shift_id: shift.id,
                    status: { in: ['DELIVERED', 'CLOSED'] }
                }
            });

            // What the rider was supposed to collect in total
            const salesTotal = cashOrders.reduce((sum, o) => sum.plus(new Decimal(o.total)), new Decimal(0));
            const totalShiftValue = new Decimal(shift.opening_float).plus(salesTotal);

            // What the cashier has ALREADY collected from the rider during this shift
            const alreadySettledOrdersSum = cashOrders
                .filter(o => o.status === 'CLOSED')
                .reduce((sum, o) => sum.plus(new Decimal(o.total)), new Decimal(0));
            const cashDropped = new Decimal(shift.cash_dropped || 0);

            const alreadyCollected = alreadySettledOrdersSum.plus(cashDropped);

            const expectedFinalHandover = totalShiftValue.minus(alreadyCollected);
            const variance = received.minus(expectedFinalHandover);

            // 2. Auto-close any remaining DELIVERED orders (they've been physically settled via shift close)
            const deliveredOrders = cashOrders.filter(o => o.status === 'DELIVERED');
            if (deliveredOrders.length > 0) {
                await tx.orders.updateMany({
                    where: {
                        id: { in: deliveredOrders.map(o => o.id) },
                        status: 'DELIVERED'
                    },
                    data: {
                        status: 'CLOSED',
                        payment_status: 'PAID',
                        last_action_by: data.closedBy,
                        last_action_desc: 'Auto-settled on shift close'
                    } as any
                });
            }

            // 3. Update Shift Record
            const updatedShift = await tx.rider_shifts.update({
                where: { id: data.shiftId },
                data: {
                    closed_at: new Date(),
                    closed_by: data.closedBy,
                    closing_cash_received: received,
                    expected_cash: expectedFinalHandover,
                    cash_difference: variance,
                    status: 'CLOSED',
                    notes: data.notes
                }
            });

            // 4. Record Settlement in Ledger
            if (!received.isZero()) {
                // Main Cash increases
                await accounting.createLedgerEntry({
                    restaurantId: shift.restaurant_id,
                    transactionType: 'DEBIT',
                    amount: received,
                    referenceType: 'SETTLEMENT',
                    referenceId: shift.id,
                    description: `Shift closing cash received from rider (${cashOrders.length} orders, Float + Sales)`,
                    processedBy: data.closedBy
                }, tx);

                // Rider liability fully cleared
                await accounting.createLedgerEntry({
                    restaurantId: shift.restaurant_id,
                    accountId: shift.rider_id,
                    transactionType: 'CREDIT',
                    amount: received,
                    referenceType: 'SETTLEMENT',
                    referenceId: shift.id,
                    description: `Shift fully reconciled — liability cleared`,
                    processedBy: data.closedBy
                }, tx);
            }

            return updatedShift;
        });
    }

    async getActiveShift(restaurantId: string, riderId: string) {
        return await prisma.rider_shifts.findFirst({
            where: {
                restaurant_id: restaurantId,
                rider_id: riderId,
                status: 'OPEN'
            }
        });
    }

    async getShiftMetrics(shiftId: string) {
        const shift = await prisma.rider_shifts.findUnique({
            where: { id: shiftId },
            include: {
                orders: {
                    select: {
                        id: true,
                        total: true,
                        status: true,
                        payment_status: true,
                        customer_name: true
                    }
                }
            }
        });

        if (!shift) return null;

        const deliveredOrders = shift.orders.filter(o => o.status === 'CLOSED');
        const activeOrders = shift.orders.filter(o => o.status !== 'CLOSED' && o.status !== 'CANCELLED');

        const salesInShift = deliveredOrders.reduce((sum, o) => sum.plus(new Decimal(o.total)), new Decimal(0));
        const expectedLiability = new Decimal(shift.opening_float).plus(salesInShift);

        return {
            ...shift,
            metrics: {
                orderCount: shift.orders.length,
                deliveredCount: deliveredOrders.length,
                activeCount: activeOrders.length,
                totalSales: salesInShift,
                expectedLiability
            }
        };
    }
}
