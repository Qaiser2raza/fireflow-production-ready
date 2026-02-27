import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AccountingService } from '../services/AccountingService';
import { RiderShiftService } from '../services/logistics/RiderShiftService';

const router = Router();
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
    processedBy: z.string().uuid().optional()
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

        const shift = await shiftService.closeShift(validated);

        const io = req.app.get('io');
        if (io) {
            io.emit('db_change', { table: 'rider_shifts', eventType: 'UPDATE', data: shift });
            io.emit('db_change', { table: 'staff', eventType: 'UPDATE', id: shift.rider_id });
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
        const { driverId, processedBy } = validated;
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

            // 4. Update delivery_orders
            if (order.delivery_orders) {
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
            const deliveryOrder = order.delivery_orders;
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
                await (tx.delivery_orders as any).update({
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

        // 7. Emit Socket Update
        const io = req.app.get('io');
        if (io) {
            io.emit('db_change', { table: 'orders', eventType: 'UPDATE', data: result, id: orderId });
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
