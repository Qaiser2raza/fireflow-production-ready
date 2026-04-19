import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AccountingService } from '../services/AccountingService';
import { journalEntryService } from '../services/JournalEntryService';
import { RiderShiftService } from '../services/logistics/RiderShiftService';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();
router.use(authMiddleware);
const prisma = new PrismaClient();
const accounting = new AccountingService();
const shiftService = new RiderShiftService();

// Schema validation - Shifts
const openShiftSchema = z.object({
    riderId: z.string().uuid(),
    openedBy: z.string().uuid(),
    openingFloat: z.number().min(0).default(0),
    notes: z.string().optional()
});

const closeShiftSchema = z.object({
    shiftId: z.string().uuid(),
    closedBy: z.string().uuid(),
    closingCash: z.number().min(0),
    notes: z.string().optional()
});

// Schema validation - Assignment
const assignDriverSchema = z.object({
    driverId: z.string().uuid(),
    processedBy: z.string().uuid().optional(),
    floatAmount: z.number().min(0).optional() // ADDED: Issue float cash with run
});

// --- SHIFT ROUTES ---

// POST /api/riders/shift/open
router.post('/riders/shift/open', async (req, res) => {
    try {
        const restaurantId = req.restaurantId!; // SaaS Security
        const validated = openShiftSchema.parse(req.body);

        const shift = await shiftService.openShift({
            restaurantId,
            ...validated
        });

        const io = req.app.get('io');
        if (io) {
            io.emit('db_change', { table: 'rider_shifts', eventType: 'INSERT', data: shift });
            io.emit('db_change', { table: 'staff', eventType: 'UPDATE', id: validated.riderId });
        }

        res.json({ success: true, shift });
    } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// POST /api/riders/shift/close
router.post('/riders/shift/close', async (req, res) => {
    try {
        const validated = closeShiftSchema.parse(req.body);
        const restaurantId = req.restaurantId!;

        const shift = await shiftService.closeShift(validated);

        const io = req.app.get('io');
        if (io) {
            io.emit('db_change', { table: 'rider_shifts', eventType: 'UPDATE', data: shift });

            // Emit updated staff (shift is now null for this rider)
            const freshStaff = await prisma.staff.findUnique({
                where: { id: shift.rider_id },
                include: { rider_shifts: { where: { status: 'OPEN' }, take: 1 } }
            });
            if (freshStaff) {
                const { pin, ...sanitized } = freshStaff;
                io.emit('db_change', {
                    table: 'staff',
                    eventType: 'UPDATE',
                    data: { ...sanitized, active_shift: freshStaff.rider_shifts?.[0] || null }
                });
            }

            // Signal a full order list refresh — auto-settled DELIVERED→CLOSED orders need to appear
            io.emit('db_change', { table: 'orders', eventType: 'BATCH_UPDATE', data: { restaurantId } });
        }

        res.json({ success: true, shift });
    } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// GET /api/riders/:riderId/active-shift
router.get('/riders/:riderId/active-shift', async (req, res) => {
    try {
        const { riderId } = req.params;
        const restaurantId = req.restaurantId!; // SaaS Security

        const shift = await shiftService.getActiveShift(restaurantId, riderId);
        if (!shift) {
            return res.json({ success: true, shift: null });
        }

        const metrics = await shiftService.getShiftMetrics(shift.id);
        res.json({ success: true, shift: metrics });
    } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// POST /api/orders/:orderId/assign-driver
router.post('/orders/:orderId/assign-driver', async (req, res) => {
    try {
        const { orderId } = req.params;
        const validated = assignDriverSchema.parse(req.body);
        const { driverId, processedBy, floatAmount } = validated;
        const restaurantId = req.restaurantId!; // SaaS Security

        // Use transaction for atomicity
        const result = await prisma.$transaction(async (tx) => {
            // 1. Check if rider has an active shift
            const activeShift = await tx.rider_shifts.findFirst({
                where: {
                    rider_id: driverId,
                    status: 'OPEN',
                    restaurant_id: restaurantId
                }
            });

            if (!activeShift) {
                throw new Error('Rider must have an active open shift to receive assignments');
            }

            // 2. Check if order exists and is assignable
            const order = await tx.orders.findFirst({
                where: {
                    id: orderId,
                    restaurant_id: restaurantId // SaaS Security
                },
                include: { delivery_orders: true }
            });

            if (!order) throw new Error('Order not found or unauthorized');
            if (order.type !== 'DELIVERY') throw new Error('Order is not a delivery order');
            if (order.assigned_driver_id) throw new Error('Order already assigned to a driver');

            // 3. Update order - Link to Driver AND Shift
            const updatedOrder = await tx.orders.update({
                where: { id: orderId },
                data: {
                    assigned_driver_id: driverId,
                    rider_shift_id: activeShift.id,
                    status: 'READY',
                    last_action_by: processedBy,
                    last_action_desc: 'Assigned to driver and linked to shift',
                    last_action_at: new Date()
                } as any
            });

            // 4. Update delivery_orders (only if a record exists — an empty array is truthy)
            if (order.delivery_orders && order.delivery_orders.length > 0) {
                await tx.delivery_orders.update({
                    where: { order_id: orderId },
                    data: {
                        driver_id: driverId,
                        dispatched_at: new Date()
                    }
                });
            }

            // 5. Update driver's metadata
            await tx.staff.update({
                where: { id: driverId },
                data: {
                    total_deliveries: { increment: 1 }
                }
            });

            // 6. Create audit log
            await tx.audit_logs.create({
                data: {
                    action_type: 'DRIVER_ASSIGNED',
                    entity_type: 'ORDER',
                    entity_id: orderId,
                    staff_id: processedBy,
                    details: {
                        driver_id: driverId,
                        shift_id: activeShift.id,
                        order_total: order.total
                    }
                }
            });

            // 7. PROVISIONAL LEDGER ENTRY: Debit rider for the order amount at dispatch.
            await accounting.recordProvisionRiderDebt({
                restaurantId,
                riderId: driverId,
                orderId,
                amount: Number(order.total),
                orderNumber: String((order as any).order_number || orderId.slice(-6)),
                processedBy
            }, tx);

            // 8. OPTIONAL: Issue float attached to this run
            if (floatAmount && floatAmount > 0) {
                // Increment shift's total float pool to ensure cashout math stays accurate
                await tx.rider_shifts.update({
                    where: { id: activeShift.id },
                    data: {
                        opening_float: { increment: floatAmount }
                    }
                });
                
                // Fire ledger entry (Credit 1000 Cash, Debit 1020 Rider Receivable)
                await journalEntryService.recordFloatIssueJournal({
                    restaurantId,
                    riderId: driverId,
                    amount: floatAmount,
                    settlementId: activeShift.id, // Group float under the shift ID
                    processedBy
                }, tx);

                // Add audit
                await tx.audit_logs.create({
                    data: {
                        action_type: 'RIDER_FLOAT_ISSUED',
                        entity_type: 'RIDER_SHIFT',
                        entity_id: activeShift.id,
                        staff_id: processedBy,
                        details: { amount: floatAmount, reason: `Dispatched with Order #${order.id}` }
                    }
                });
            }

            return updatedOrder;
        });

        // 7. Emit Socket Update
        const io = req.app.get('io');
        if (io) {
            io.emit('db_change', { table: 'orders', eventType: 'UPDATE', data: result, id: orderId });
            io.emit('db_change', { table: 'staff', eventType: 'UPDATE', id: driverId });
        }

        res.json({
            success: true,
            order: result,
            message: 'Driver assigned successfully'
        });

    } catch (error) {
        console.error('Driver assignment error:', error);
        res.status(400).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// POST /api/orders/:orderId/mark-delivered
router.post('/orders/:orderId/mark-delivered', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { processedBy } = req.body;

        const result = await prisma.$transaction(async (tx) => {
            const order = await tx.orders.findFirst({
                where: {
                    id: orderId,
                    restaurant_id: req.restaurantId // SaaS Security
                },
                include: { delivery_orders: true }
            });

            if (!order) {
                throw new Error('Order not found or unauthorized');
            }

            if (!order.assigned_driver_id) {
                throw new Error('Order is not assigned to a driver');
            }

            // Calculate delivery duration
            const deliveryOrderList = (order.delivery_orders as unknown) as any[];
            const deliveryOrder = deliveryOrderList && deliveryOrderList.length > 0 ? deliveryOrderList[0] : null;
            const dispatchedAt = deliveryOrder?.dispatched_at;
            const deliveredAt = new Date();
            const durationMinutes = dispatchedAt
                ? Math.round((deliveredAt.getTime() - new Date(dispatchedAt).getTime()) / 60000)
                : null;

            // Update order
            const updatedOrder = await tx.orders.update({
                where: { id: orderId },
                data: {
                    status: 'DELIVERED',
                    last_action_by: processedBy,
                    last_action_desc: 'Marked as delivered',
                    last_action_at: deliveredAt
                } as any
            });

            // Update delivery_orders
            if (deliveryOrder) {
                await tx.delivery_orders.updateMany({
                    where: { order_id: orderId },
                    data: {
                        delivered_at: deliveredAt,
                        delivery_duration_minutes: durationMinutes
                    }
                });
            }

            // 3. FINANCIAL RECORDING: Revenue recognized at delivery
            await accounting.recordOrderSale(orderId, tx);

            // Create audit log
            await tx.audit_logs.create({
                data: {
                    action_type: 'ORDER_DELIVERED',
                    entity_type: 'ORDER',
                    entity_id: orderId,
                    staff_id: processedBy,
                    details: {
                        delivered_at: deliveredAt,
                        duration_minutes: durationMinutes
                    }
                }
            });

            return updatedOrder;
        });

        // 7. Emit Socket Update — fetch full order with delivery context for Settlement tab
        const io = req.app.get('io');
        if (io) {
            const fullOrder = await prisma.orders.findUnique({
                where: { id: orderId },
                include: { order_items: true, delivery_orders: true }
            });
            io.emit('db_change', { table: 'orders', eventType: 'UPDATE', data: fullOrder || result, id: orderId });
        }

        res.json({
            success: true,
            order: result,
            message: 'Order marked as delivered'
        });

    } catch (error) {
        console.error('Mark delivered error:', error);
        res.status(400).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// POST /api/orders/:orderId/mark-failed
router.post('/orders/:orderId/mark-failed', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason, processedBy } = req.body;

        const result = await prisma.$transaction(async (tx) => {
            const order = await tx.orders.findFirst({
                where: {
                    id: orderId,
                    restaurant_id: req.restaurantId // SaaS Security
                },
                include: { delivery_orders: true }
            });

            if (!order) throw new Error('Order not found or unauthorized');

            // Update order: Reset status to READY and unlink driver/shift
            const updatedOrder = await tx.orders.update({
                where: { id: orderId },
                data: {
                    status: 'READY',
                    assigned_driver_id: null,
                    rider_shift_id: null,
                    last_action_by: processedBy,
                    last_action_desc: `Delivery Failed: ${reason}`,
                    last_action_at: new Date()
                } as any
            });

            // Update delivery_orders: Set failed reason and clear dispatch time (only if record exists)
            if (order.delivery_orders && order.delivery_orders.length > 0) {
                await tx.delivery_orders.update({
                    where: { order_id: orderId },
                    data: {
                        failed_reason: reason,
                        dispatched_at: null,
                        driver_id: null
                    }
                });
            }

            // Create audit log
            await tx.audit_logs.create({
                data: {
                    action_type: 'ORDER_DELIVERY_FAILED',
                    entity_type: 'ORDER',
                    entity_id: orderId,
                    staff_id: processedBy,
                    details: { reason }
                }
            });

            return updatedOrder;
        });

        // Emit Socket Update
        const io = req.app.get('io');
        if (io) {
            io.emit('db_change', { table: 'orders', eventType: 'UPDATE', data: result, id: orderId });
        }

        res.json({
            success: true,
            order: result,
            message: 'Order marked as failed and reset to READY'
        });

    } catch (error) {
        console.error('Mark failed error:', error);
        res.status(400).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// POST /api/orders/:orderId/settle
router.post('/orders/:orderId/settle', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { processedBy } = req.body;
        const restaurantId = req.restaurantId!;

        const result = await prisma.$transaction(async (tx) => {
            const order = await tx.orders.findFirst({
                where: { id: orderId, restaurant_id: restaurantId },
                include: { delivery_orders: true }
            });

            if (!order) throw new Error('Order not found');
            if (order.status !== 'DELIVERED') throw new Error('Only delivered orders can be settled');

            const updatedOrder = await tx.orders.update({
                where: { id: orderId },
                data: {
                    status: 'CLOSED',
                    payment_status: 'PAID',
                    last_action_by: processedBy,
                    last_action_desc: 'Order settled (partial)',
                    last_action_at: new Date()
                },
                include: {
                    delivery_orders: true,
                    order_items: true
                }
            });

            await accounting.recordRiderSettlement({
                restaurantId,
                riderId: order.assigned_driver_id!,
                amountReceived: order.total,
                orderIds: [orderId],
                processedBy,
                settlementId: orderId,  // orderId is already a UUID — safe for ledger reference_id
                sessionId: req.body.session_id  // ← Cross-session bridge: link settlement to the active cashier session
            }, tx);

            return updatedOrder;
        });

        const io = req.app.get('io');
        if (io) {
            io.emit('db_change', { table: 'orders', eventType: 'UPDATE', data: result, id: orderId });
            // Fetch fresh staff with shift to ensure socket update is complete
            const freshStaff = await prisma.staff.findUnique({
                where: { id: result.assigned_driver_id! },
                include: { rider_shifts: { where: { status: 'OPEN' }, take: 1 } }
            });
            if (freshStaff) {
                const { pin, ...sanitized } = freshStaff;
                io.emit('db_change', {
                    table: 'staff',
                    eventType: 'UPDATE',
                    data: { ...sanitized, active_shift: freshStaff.rider_shifts?.[0] || null }
                });
            }
        }

        res.json({ success: true, order: result });

    } catch (error) {
        console.error('Order settlement error:', error);
        res.status(400).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// POST /api/riders/shift/deposit
router.post('/riders/shift/deposit', async (req, res) => {
    try {
        const { shiftId, depositedBy, amount, notes } = req.body;
        const restaurantId = req.restaurantId!;

        if (!amount || amount <= 0) throw new Error('Deposit amount must be greater than 0');

        const result = await prisma.$transaction(async (tx) => {
            const shift = await tx.rider_shifts.findUnique({
                where: { id: shiftId }
            });

            if (!shift || shift.status !== 'OPEN') throw new Error('Active shift not found');

            // 1. Update the shift model with the dropped cash
            await tx.rider_shifts.update({
                where: { id: shiftId },
                data: {
                    cash_dropped: { increment: amount }
                }
            });

            // Record the cash deposit in accounting (without closing shift)
            await accounting.recordRiderSettlement({
                restaurantId,
                riderId: shift.rider_id,
                amountReceived: amount,
                orderIds: [], // Direct cash deposit, not order-specific
                processedBy: depositedBy,
                settlementId: shiftId  // shiftId is already a UUID — safe for ledger reference_id
            }, tx);

            // Audit log
            await tx.audit_logs.create({
                data: {
                    action_type: 'RIDER_CASH_DROP',
                    entity_type: 'RIDER_SHIFT',
                    entity_id: shiftId,
                    staff_id: depositedBy,
                    details: { amount, notes }
                }
            });

            return shift;
        });

        const io = req.app.get('io');
        if (io) {
            // Fresh staff update to reflect new liability
            const freshStaff = await prisma.staff.findUnique({
                where: { id: result.rider_id },
                include: { rider_shifts: { where: { status: 'OPEN' }, take: 1 } }
            });
            if (freshStaff) {
                const { pin, ...sanitized } = freshStaff;
                io.emit('db_change', {
                    table: 'staff',
                    eventType: 'UPDATE',
                    data: { ...sanitized, active_shift: freshStaff.rider_shifts?.[0] || null }
                });
            }
        }

        res.json({ success: true, message: 'Cash drop recorded successfully' });

    } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('Cash drop error:', errMsg, error);
        res.status(400).json({ success: false, error: errMsg });
    }
});

// GET /api/riders/:driverId/pending-settlement
router.get('/riders/:driverId/pending-settlement', async (req, res) => {
    try {
        const { driverId } = req.params;
        const restaurantId = req.restaurantId!; // SaaS Security

        const activeShift = await shiftService.getActiveShift(restaurantId, driverId);
        if (!activeShift) {
            return res.json({ success: true, orders: [], summary: null });
        }

        const orders = await prisma.orders.findMany({
            where: {
                is_deleted: false,
                rider_shift_id: activeShift.id,
                status: 'DELIVERED',
                restaurant_id: restaurantId // SaaS Security
            },
            include: {
                delivery_orders: true,
                order_items: true
            },
            orderBy: {
                created_at: 'asc'
            }
        });

        const totalSales = orders.reduce((sum, o) => sum + Number(o.total), 0);

        res.json({
            success: true,
            activeShift,
            orders,
            summary: {
                orderCount: orders.length,
                totalSales,
                openingFloat: Number(activeShift.opening_float),
                expectedLiability: totalSales + Number(activeShift.opening_float)
            }
        });

    } catch (error) {
        console.error('Pending settlement error:', error);
        res.status(400).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router;
