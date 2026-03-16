
import { Router } from 'express';
import * as ReportsService from '../services/ReportsService';
import { getDailySalesReport } from '../services/reports/DailySalesReport';
import { getTaxLiabilityReport } from '../services/reports/TaxLiabilityReport';
import { getLossPreventionReport } from '../services/reports/LossPreventionReport';
import { getStaffPerformanceReport } from '../services/reports/StaffPerformanceReport';
import { getEnhancedProductMixReport } from '../services/reports/EnhancedProductMixReport';
import { getPayoutExpenseReport } from '../services/reports/PayoutExpenseReport';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';

const router = Router();
router.use(authMiddleware);
router.use(requireRole('MANAGER', 'SUPER_ADMIN', 'ADMIN'));

const reportQuerySchema = z.object({
    start: z.string().datetime(),
    end: z.string().datetime()
});

// ══════════════════════════════════════════════════
// PHASE 1: Enterprise Management Reports
// ══════════════════════════════════════════════════

/**
 * GET /api/reports/daily-sales
 * Daily Sales Report — the #1 report
 */
router.get('/daily-sales', async (req, res) => {
    try {
        const { start, end } = reportQuerySchema.parse(req.query);
        const data = await getDailySalesReport(req.restaurantId!, {
            start: new Date(start),
            end: new Date(end)
        });
        res.json({ success: true, data });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * GET /api/reports/tax-liability
 * Tax Liability Report — FBR compliance
 */
router.get('/tax-liability', async (req, res) => {
    try {
        const { start, end } = reportQuerySchema.parse(req.query);
        const data = await getTaxLiabilityReport(req.restaurantId!, {
            start: new Date(start),
            end: new Date(end)
        });
        res.json({ success: true, data });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * GET /api/reports/loss-prevention
 * Loss Prevention Report — voids & cancellations analysis
 */
router.get('/loss-prevention', async (req, res) => {
    try {
        const { start, end } = reportQuerySchema.parse(req.query);
        const data = await getLossPreventionReport(req.restaurantId!, {
            start: new Date(start),
            end: new Date(end)
        });
        res.json({ success: true, data });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// ══════════════════════════════════════════════════
// PHASE 2: Operational & Staff Reports
// ══════════════════════════════════════════════════

/**
 * GET /api/reports/staff-performance
 * Waiter, Cashier, Rider efficiency metrics
 */
router.get('/staff-performance', async (req, res) => {
    try {
        const { start, end } = reportQuerySchema.parse(req.query);
        const data = await getStaffPerformanceReport(req.restaurantId!, {
            start: new Date(start),
            end: new Date(end)
        });
        res.json({ success: true, data });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * GET /api/reports/enhanced-product-mix
 * Pareto 80/20 product ranking
 */
router.get('/enhanced-product-mix', async (req, res) => {
    try {
        const { start, end } = reportQuerySchema.parse(req.query);
        const data = await getEnhancedProductMixReport(req.restaurantId!, {
            start: new Date(start),
            end: new Date(end)
        });
        res.json({ success: true, data });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * GET /api/reports/payout-expense
 * Cash outflow timeline and category breakdown
 */
router.get('/payout-expense', async (req, res) => {
    try {
        const { start, end } = reportQuerySchema.parse(req.query);
        const data = await getPayoutExpenseReport(req.restaurantId!, {
            start: new Date(start),
            end: new Date(end)
        });
        res.json({ success: true, data });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// ══════════════════════════════════════════════════
// Legacy Reports (Product Mix, Velocity, etc.)
// ══════════════════════════════════════════════════

router.get('/product-mix', async (req, res) => {
    try {
        const { start, end } = reportQuerySchema.parse(req.query);
        const restaurantId = req.restaurantId!;
        const data = await ReportsService.getProductMix(restaurantId, { start: new Date(start), end: new Date(end) });
        res.json({ success: true, data });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

router.get('/velocity', async (req, res) => {
    try {
        const { start, end } = reportQuerySchema.parse(req.query);
        const restaurantId = req.restaurantId!;
        const data = await ReportsService.getSalesVelocity(restaurantId, { start: new Date(start), end: new Date(end) });
        res.json({ success: true, data });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

router.get('/security', async (req, res) => {
    try {
        const { start, end } = reportQuerySchema.parse(req.query);
        const restaurantId = req.restaurantId!;
        const data = await ReportsService.getSecurityAudit(restaurantId, { start: new Date(start), end: new Date(end) });
        res.json({ success: true, data });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

router.get('/over-capacity', async (req, res) => {
    try {
        const { start, end } = reportQuerySchema.parse(req.query);
        const restaurantId = req.restaurantId!;
        const data = await ReportsService.getOverCapacityReport(restaurantId, { start: new Date(start), end: new Date(end) });
        res.json({ success: true, ...data });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

export default router;
