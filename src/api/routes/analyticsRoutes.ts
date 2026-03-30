import { Router } from 'express';
import { prisma } from '../../shared/lib/prisma';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';
import { toUTCRange } from '../../shared/utils/dateUtils';
import { Decimal } from '@prisma/client/runtime/library';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/analytics/finance/summary
 * Returns aggregated financial data for the specified date range.
 * Data includes: Gross Revenue, Net Revenue, COGS, Gross Margin, Total Expenses, Cash Position
 */
router.get('/finance/summary', requireRole('MANAGER', 'SUPER_ADMIN', 'ADMIN'), async (req, res) => {
    try {
        const restaurantId = req.restaurantId!;
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required parameters' });
        }

        const { start } = await toUTCRange(restaurantId, startDate as string);
        const { end: rangeEnd } = await toUTCRange(restaurantId, endDate as string);

        // Calculate Revenue from closed orders
        const orders = await prisma.orders.findMany({
            where: {
                restaurant_id: restaurantId,
                status: 'CLOSED',
                created_at: { gte: start, lte: rangeEnd }
            },
            select: { total: true, delivery_fee: true, discount: true, tax: true, service_charge: true }
        });

        let grossRevenue = new Decimal(0);
        let netRevenue = new Decimal(0);
        
        orders.forEach(o => {
            const total = new Decimal(o.total?.toString() || 0);
            const deliveryFee = new Decimal(o.delivery_fee?.toString() || 0);
            const tax = new Decimal(o.tax?.toString() || 0);
            const sc = new Decimal(o.service_charge?.toString() || 0);
            const discount = new Decimal(o.discount?.toString() || 0);

            const net = total.minus(tax).minus(sc).minus(deliveryFee);
            const gross = net.plus(discount);

            grossRevenue = grossRevenue.plus(gross);
            netRevenue = netRevenue.plus(net);
        });

        // Calculate Inventory / COGS
        const inventoryJournals = await prisma.journal_entry_lines.findMany({
            where: {
                chart_of_accounts: {
                    restaurant_id: restaurantId,
                    code: '5000' // COGS Account code
                },
                journal_entries: {
                    date: { gte: start, lte: rangeEnd }
                }
            }
        });

        let cogs = new Decimal(0);
        inventoryJournals.forEach(j => {
            const debit = new Decimal(j.debit?.toString() || 0);
            const credit = new Decimal(j.credit?.toString() || 0);
            cogs = cogs.plus(debit).minus(credit);
        });

        // Calculate Operating Expenses (6000 range)
        const expenseJournals = await prisma.journal_entry_lines.findMany({
            where: {
                chart_of_accounts: {
                    restaurant_id: restaurantId,
                    code: { startsWith: '6' }
                },
                journal_entries: {
                    date: { gte: start, lte: rangeEnd }
                }
            }
        });

        let totalExpenses = new Decimal(0);
        expenseJournals.forEach(j => {
            const debit = new Decimal(j.debit?.toString() || 0);
            const credit = new Decimal(j.credit?.toString() || 0);
            totalExpenses = totalExpenses.plus(debit).minus(credit);
        });

        const grossMargin = netRevenue.minus(cogs);
        const netProfit = grossMargin.minus(totalExpenses);

        // Fetch Cash Position (Current balance of account 1000)
        let cashPosition = new Decimal(0);
        const cashJournals = await prisma.journal_entry_lines.findMany({
            where: {
                chart_of_accounts: { restaurant_id: restaurantId, code: '1000' }
            }
        });

        cashJournals.forEach(j => {
            const debit = new Decimal(j.debit?.toString() || 0);
            const credit = new Decimal(j.credit?.toString() || 0);
            cashPosition = cashPosition.plus(debit).minus(credit);
        });

        res.json({
            grossRevenue,
            netRevenue,
            cogs,
            grossMargin,
            totalExpenses,
            netProfit,
            cashPosition
        });
    } catch (error: any) {
        console.error('[ERROR] GET /api/analytics/finance/summary:', error.message);
        res.status(500).json({ error: 'Failed to fetch financial summary' });
    }
});

export default router;
