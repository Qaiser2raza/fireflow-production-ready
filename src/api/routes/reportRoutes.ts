import { Router } from 'express';
import * as ReportsService from '../services/ReportsService';
import { getDailySalesReport } from '../services/reports/DailySalesReport';
import { getTaxLiabilityReport } from '../services/reports/TaxLiabilityReport';
import { getLossPreventionReport } from '../services/reports/LossPreventionReport';
import { getStaffPerformanceReport } from '../services/reports/StaffPerformanceReport';
import { getCategorySalesReport } from '../services/reports/CategorySalesReport';
import { getPaymentMethodReport } from '../services/reports/PaymentMethodReport';
import { getRiderAuditReport } from '../services/reports/RiderAuditReport';
import { getPayoutExpenseReport } from '../services/reports/PayoutExpenseReport';
import { getProfitLossReport } from '../services/reports/ProfitLossReport';
import { getBalanceSheetReport } from '../services/reports/BalanceSheetReport';
import { renderReport } from '../services/reports/reportTemplates';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';

const router = Router();
router.use(authMiddleware);
router.use(requireRole('MANAGER', 'SUPER_ADMIN', 'ADMIN'));

const reportQuerySchema = z.object({
    start: z.string().datetime(),
    end: z.string().datetime()
});

/**
 * Helper to handle report requests and return HTML or JSON
 */
// BUG-15 FIX: Typed fetchFn properly instead of loose Function type
async function handleReport(
    req: any,
    res: any,
    title: string,
    type: string,
    fetchFn: (restaurantId: string, range: { start: Date; end: Date }) => Promise<any>
) {
    try {
        const { start, end } = reportQuerySchema.parse(req.query);
        const data = await fetchFn(req.restaurantId!, {
            start: new Date(start),
            end: new Date(end)
        });

        // Add restaurant metadata if available
        const restaurant_id = req.restaurantId;

        // If explicitly requested as JSON (e.g. from dashboard), return JSON
        if (req.query.format === 'json') {
            return res.json({ success: true, data });
        }

        // Default to HTML for printable view
        const html = renderReport(title, { ...data, restaurant_id }, type);
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (e: any) {
        // BUG-15 FIX: was just e.message which gives 'undefined' for non-Error throws
        res.status(400).json({ error: e?.message || String(e) || 'Unknown report error' });
    }
}

router.get('/daily-sales', (req, res) => handleReport(req, res, 'Daily Sales Report', 'daily-sales', getDailySalesReport));
router.get('/tax-liability', (req, res) => handleReport(req, res, 'Tax Liability Report', 'tax-liability', getTaxLiabilityReport));
router.get('/loss-prevention', (req, res) => handleReport(req, res, 'Loss Prevention (Audit)', 'loss-prevention', getLossPreventionReport));
router.get('/staff-performance', (req, res) => handleReport(req, res, 'Staff Efficiency Performance', 'staff-performance', getStaffPerformanceReport));
router.get('/category-sales', (req, res) => handleReport(req, res, 'Category Sales Analysis', 'category-sales', getCategorySalesReport));
router.get('/payment-methods', (req, res) => handleReport(req, res, 'Payment Method Analysis', 'payment-methods', getPaymentMethodReport));
router.get('/payout-expense', (req, res) => handleReport(req, res, 'Payout & Expense Analysis', 'payout-expense', getPayoutExpenseReport));
router.get('/profit-loss', (req, res) => handleReport(req, res, 'Profit & Loss Statement', 'profit-loss', getProfitLossReport));
router.get('/balance-sheet', (req, res) => {
    const asOf = req.query.asOf ? new Date(req.query.asOf as string) : new Date();
    return handleReport(req, res, 'Balance Sheet', 'balance-sheet', (restId: string) => getBalanceSheetReport(restId, asOf));
});

// Legacy Reports (Keep for compatibility but wrap in HTML)
router.get('/product-mix', (req, res) => handleReport(req, res, 'Product Mix Trend', 'product-mix', ReportsService.getProductMix));
router.get('/velocity', (req, res) => handleReport(req, res, 'Sales Velocity (Hourly)', 'velocity', ReportsService.getSalesVelocity));
router.get('/security', (req, res) => handleReport(req, res, 'Security Audit Logs', 'security', ReportsService.getSecurityAudit));
router.get('/over-capacity', (req, res) => handleReport(req, res, 'Table Over-Capacity Report', 'over-capacity', ReportsService.getOverCapacityReport));
router.get('/rider-audit', (req, res) => {
    const riderId = req.query.riderId as string;
    return handleReport(req, res, 'Rider Performance Audit', 'rider-audit', 
        (restId: string, range: any) => getRiderAuditReport(restId, range, riderId)
    );
});

export default router;
