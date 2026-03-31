import express from 'express';
import { PrismaClient } from '@prisma/client';
import { fbrService } from '../services/FBRService';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/fbr/stats
 * Dashboard statistics for FBR summary
 */
router.get('/stats', authMiddleware, async (req: any, res) => {
    try {
        const restaurant_id = req.user?.restaurant_id || req.restaurantId;

        const [totalInvoices, pendingFBR, syncedToday] = await Promise.all([
            prisma.orders.count({ where: { restaurant_id } }),
            prisma.orders.count({
                where: {
                    restaurant_id,
                    fbr_sync_status: 'PENDING',
                    status: { in: ['CLOSED'] }
                } as any
            }),
            prisma.orders.count({
                where: {
                    restaurant_id,
                    fbr_sync_status: 'SYNCED',
                    updated_at: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0))
                    }
                } as any
            })
        ]);

        res.json({
            success: true,
            stats: {
                totalInvoices,
                pendingFBR,
                syncedToday
            }
        });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/fbr/invoices
 * List invoices with sync status
 */
router.get('/invoices', authMiddleware, async (req: any, res) => {
    try {
        const restaurant_id = req.user.restaurant_id;
        const { status, search, limit = '50', page = '1' } = req.query;

        const take = Math.min(Number(limit) || 50, 100);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

        const where: any = { restaurant_id };
        if (status) where.fbr_sync_status = status;
        if (search) {
            where.OR = [
                { order_number: { contains: search, mode: 'insensitive' } },
                { fbr_invoice_number: { contains: search, mode: 'insensitive' } },
                { customer_name: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [invoices, totalCount] = await Promise.all([
            prisma.orders.findMany({
                where,
                orderBy: { created_at: 'desc' },
                take,
                skip
            }) as any,
            prisma.orders.count({ where })
        ]);

        const totalPages = Math.ceil(totalCount / take);

        res.json({ success: true, invoices, totalCount, totalPages, currentPage: Number(page) || 1 });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/fbr/sync/:orderId
 * Manually sync a specific order
 */
router.post('/sync/:orderId', authMiddleware, requireRole('MANAGER', 'ADMIN'), async (req, res) => {
    try {
        const result = await fbrService.syncOrder(req.params.orderId);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/fbr/void/:orderId
 * Voids a pending FBR invoice so it's excluded from sync batches
 */
router.post('/void/:orderId', authMiddleware, async (req: any, res) => {
    try {
        await prisma.orders.update({
            where: { id: req.params.orderId },
            data: { fbr_sync_status: 'VOIDED' } as any
        });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/fbr/queue
router.get('/queue', authMiddleware, async (req: any, res) => {
    try {
        const restaurant_id = req.user?.restaurant_id || req.restaurantId;
        const orders = await prisma.orders.findMany({
            where: {
                restaurant_id,
                fbr_sync_status: 'PENDING',
                is_deleted: false,
            },
            select: {
                id: true,
                order_number: true,
                total: true,
                tax: true,
                created_at: true,
                fbr_sync_status: true
            }
        });
        
        // Map to requested field names
        const mapped = orders.map(o => ({
            id: o.id,
            order_number: o.order_number,
            total_amount: Number(o.total || 0),
            tax_amount: Number(o.tax || 0),
            created_at: o.created_at,
            fbr_sync_status: o.fbr_sync_status
        }));
        res.json(mapped);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/fbr/aggregate
router.get('/aggregate', authMiddleware, async (req: any, res) => {
    try {
        const restaurant_id = req.user?.restaurant_id || req.restaurantId;
        const allOrders = await prisma.orders.findMany({
            where: { restaurant_id, is_deleted: false }
        });
        
        const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
        
        let pending_count = 0, pending_amount = 0;
        let synced_today_count = 0, synced_today_amount = 0;
        let voided_count = 0, voided_amount = 0;
        let failed_count = 0;
        let tax_liability_today = 0, tax_liability_total = 0;
        
        for (const o of allOrders) {
            const status = (o.fbr_sync_status || '').toUpperCase();
            const amount = Number(o.total || 0);
            const tax = Number(o.tax || 0);
            const isToday = o.created_at >= todayStart;
            
            if (status === 'PENDING') {
                pending_count++;
                pending_amount += amount;
            } else if (status === 'SYNCED') {
                if (isToday) {
                    synced_today_count++;
                    synced_today_amount += amount;
                    tax_liability_today += tax;
                }
                tax_liability_total += tax;
            } else if (status === 'VOIDED') {
                voided_count++;
                voided_amount += amount;
            } else if (status === 'FAILED') {
                failed_count++;
            }
        }
        
        res.json({
            pending_count,
            pending_amount,
            synced_today_count,
            synced_today_amount,
            voided_count,
            voided_amount,
            failed_count,
            tax_liability_today,
            tax_liability_total
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/fbr/sync
router.post('/sync', authMiddleware, async (req: any, res) => {
    try {
        const orderIds = Array.isArray(req.body) ? req.body : req.body.orderIds;
        if (!Array.isArray(orderIds)) return res.status(400).json({ error: 'Array of order IDs required' });
        
        await prisma.orders.updateMany({
            where: { id: { in: orderIds } },
            data: {
                fbr_sync_status: 'SYNCED',
                fbr_synced_at: new Date()
            } as any
        });
        
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/fbr/sync-all
 * Batch sync pending orders
 */
router.post('/sync-all', authMiddleware, requireRole('MANAGER', 'ADMIN'), async (req: any, res) => {
    try {
        const restaurant_id = req.user.restaurant_id;

        const pendingOrders = await prisma.orders.findMany({
            where: {
                restaurant_id,
                fbr_sync_status: 'PENDING',
                status: { in: ['CLOSED'] }
            } as any,
            take: 20 // Limit batch size
        });

        const results = [];
        for (const order of pendingOrders) {
            const res = await fbrService.syncOrder(order.id);
            results.push({ id: order.id, ...res });
        }

        res.json({
            success: true,
            syncedCount: results.filter(r => r.success).length,
            failedCount: results.filter(r => !r.success).length,
            results
        });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/fbr/tax-liability
router.get('/tax-liability', authMiddleware, async (req: any, res) => {
    try {
        const restaurant_id = req.user?.restaurant_id || req.restaurantId;
        const { from, to } = req.query;

        // Default range: last 30 days
        let startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        
        let endDate = new Date();
        endDate.setHours(23, 59, 59, 999);

        if (from) {
            startDate = new Date(from as string);
            startDate.setHours(0, 0, 0, 0);
        }
        if (to) {
            endDate = new Date(to as string);
            endDate.setHours(23, 59, 59, 999);
        }

        const orders = await prisma.orders.findMany({
            where: {
                restaurant_id,
                is_deleted: false,
                created_at: {
                    gte: startDate,
                    lte: endDate
                }
            }
        });

        const dailyMap: Record<string, any> = {};
        
        let total_tax_collected = 0;
        let total_fbr_reported = 0;

        for (const o of orders) {
            const dateStr = o.created_at.toISOString().split('T')[0];
            if (!dailyMap[dateStr]) {
                dailyMap[dateStr] = {
                    date: dateStr,
                    total_sales: 0,
                    tax_collected: 0,
                    synced_amount: 0,
                    synced_tax: 0,
                    voided_amount: 0,
                    voided_tax: 0,
                    net_fbr_tax: 0
                };
            }

            const day = dailyMap[dateStr];
            const amount = Number(o.total || 0);
            const tax = Number(o.tax || 0);
            const status = (o.fbr_sync_status || '').toUpperCase();

            day.total_sales += amount;
            day.tax_collected += tax;
            total_tax_collected += tax;

            if (status === 'SYNCED') {
                day.synced_amount += amount;
                day.synced_tax += tax;
                day.net_fbr_tax += tax;
                total_fbr_reported += tax;
            } else if (status === 'VOIDED') {
                day.voided_amount += amount;
                day.voided_tax += tax;
            }
        }

        const daily = Object.values(dailyMap).sort((a: any, b: any) => a.date.localeCompare(b.date));

        res.json({
            daily,
            summary: {
                total_tax_collected,
                total_fbr_reported,
                gap: total_tax_collected - total_fbr_reported
            }
        });

    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
