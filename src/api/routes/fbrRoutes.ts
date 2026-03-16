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
        const restaurant_id = req.user.restaurant_id;

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
        const { status, search, limit = 50 } = req.query;

        const where: any = { restaurant_id };
        if (status) where.fbr_sync_status = status;
        if (search) {
            where.OR = [
                { order_number: { contains: search, mode: 'insensitive' } },
                { fbr_invoice_number: { contains: search, mode: 'insensitive' } },
                { customer_name: { contains: search, mode: 'insensitive' } }
            ];
        }

        const invoices = await prisma.orders.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take: Number(limit),
        }) as any[];

        res.json({ success: true, invoices });
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

export default router;
