import { Router } from 'express';
import { AccountingService } from '../services/AccountingService';
import { z } from 'zod';

const router = Router();
// const prisma = new PrismaClient(); // Unused
const accounting = new AccountingService();

// Validation Schemas
const openSessionSchema = z.object({
    restaurantId: z.string().uuid(),
    staffId: z.string().uuid(),
    openingBalance: z.number().min(0)
});

const closeSessionSchema = z.object({
    sessionId: z.string().uuid(),
    staffId: z.string().uuid(),
    actualBalance: z.number().min(0),
    notes: z.string().optional()
});

const payoutSchema = z.object({
    restaurantId: z.string().uuid(),
    staffId: z.string().uuid(),
    amount: z.number().positive(),
    category: z.string(),
    notes: z.string()
});

/**
 * GET /api/accounting/session
 * Get current active session
 */
router.get('/session', async (req, res) => {
    try {
        const restaurantId = req.restaurantId!; // SaaS Security
        const session = await accounting.getSessionMetrics(restaurantId);
        res.json({ success: true, session });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/accounting/ledger
 * Get recent ledger entries
 */
router.get('/ledger', async (req, res) => {
    try {
        const { limit } = req.query;
        const restaurantId = req.restaurantId!; // SaaS Security
        const entries = await accounting.getRecentLedger(restaurantId, Number(limit) || 50);
        res.json({ success: true, entries });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/accounting/session/open
 */
router.post('/session/open', async (req, res) => {
    try {
        const validated = openSessionSchema.omit({ restaurantId: true, staffId: true }).parse(req.body);
        const session = await accounting.openCashSession({
            ...validated,
            restaurantId: req.restaurantId!, // SaaS Security
            staffId: req.staffId! // SaaS Security
        });
        res.json({ success: true, session });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * POST /api/accounting/session/close
 */
router.post('/session/close', async (req, res) => {
    try {
        const validated = closeSessionSchema.omit({ staffId: true }).parse(req.body);
        const session = await accounting.closeCashSession({
            ...validated,
            staffId: req.staffId! // SaaS Security
        });
        res.json({ success: true, session });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * POST /api/accounting/payout
 */
router.post('/payout', async (req, res) => {
    try {
        const validated = payoutSchema.parse(req.body);
        const payout = await accounting.processPayout(validated);
        res.json({ success: true, payout });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * GET /api/accounting/balance/:staffId
 * Get current debt balance for a rider
 */
router.get('/balance/:staffId', async (req, res) => {
    try {
        const balance = await accounting.getBalance(req.restaurantId!, req.params.staffId);
        res.json({ success: true, balance: Number(balance) });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/accounting/z-report/:sessionId
 */
router.get('/z-report/:sessionId', async (req, res) => {
    try {
        const report = await accounting.getZReport(req.params.sessionId);
        res.json({ success: true, report });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
