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

            // 1. Calculate Expected Cash
            // Expected = Opening Float + Sum of all CLOSED/PAID cash delivery orders in this shift
            const orders = await tx.orders.findMany({
                where: {
                    rider_shift_id: shift.id,
                    status: 'CLOSED',
                    payment_status: 'PAID'
                }
            });

            const salesTotal = orders.reduce((sum, o) => sum.plus(new Decimal(o.total)), new Decimal(0));
            const expected = new Decimal(shift.opening_float).plus(salesTotal);
            const variance = received.minus(expected);

            // 2. Update Shift Record
            const updatedShift = await tx.rider_shifts.update({
                where: { id: data.shiftId },
                data: {
                    closed_at: new Date(),
                    closed_by: data.closedBy,
                    closing_cash_received: received,
                    expected_cash: expected,
                    cash_difference: variance,
                    status: 'CLOSED',
                    notes: data.notes
                }
            });

            // 3. Record Settlement in Ledger
            if (!received.isZero()) {
                // Main Cash increases
                await accounting.createLedgerEntry({
                    restaurantId: shift.restaurant_id,
                    transactionType: 'DEBIT',
                    amount: received,
                    referenceType: 'SETTLEMENT',
                    referenceId: shift.id,
                    description: `Shift closing cash received from rider`,
                    processedBy: data.closedBy
                }, tx);

                // Rider liability decreases (Credit)
                await accounting.createLedgerEntry({
                    restaurantId: shift.restaurant_id,
                    accountId: shift.rider_id,
                    transactionType: 'CREDIT',
                    amount: received,
                    referenceType: 'SETTLEMENT',
                    referenceId: shift.id,
                    description: `Shift liability cleared`,
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
