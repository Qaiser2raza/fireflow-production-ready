import { Router } from 'express';
import { CashierSessionService } from '../services/finance/CashierSessionService.js';
import { CashierShiftLogService } from '../services/finance/CashierShiftLogService.js';
import { authMiddleware, requireRole } from '../middleware/authMiddleware.js';

const router = Router();
router.use(authMiddleware);

// Get current active session for a staff member
router.get('/current', async (req, res) => {
    try {
        const { restaurantId, staffId } = req.query;
        if (!restaurantId || !staffId) return res.status(400).json({ success: false, error: 'Missing params' });
        
        const result = await CashierSessionService.getActiveSession(restaurantId as string, staffId as string);
        res.json({ success: true, ...result });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Open a new session
router.post('/open', requireRole('CASHIER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const { restaurantId, staffId, openingFloat, expectedFloat, terminalId } = req.body;
        if (!restaurantId || !staffId) return res.status(400).json({ success: false, error: 'Missing params' });
        
        const session = await CashierSessionService.openSession(restaurantId, staffId, Number(openingFloat || 0), Number(expectedFloat || 0), terminalId);
        res.json({ success: true, session });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Close an existing session
router.post('/close', requireRole('CASHIER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const { sessionId, actualCash, withdrawnAmount, closedBy, notes } = req.body;
        if (!sessionId || !closedBy) return res.status(400).json({ success: false, error: 'Missing params' });

        const { prisma } = await import('../../shared/lib/prisma.js');
        const openRiderShifts = await prisma.rider_shifts.findMany({
            where: {
                restaurant_id: req.restaurantId!,
                status: 'OPEN'
            },
            include: {
                staff: { select: { name: true } }
            }
        });

        if (openRiderShifts.length > 0) {
            const riderNames = openRiderShifts
                .map(s => s.staff?.name || 'Unknown Rider')
                .join(', ');
            return res.status(409).json({
                error: `Cannot close session — rider shifts still open for: ${riderNames}. Please close all rider shifts first.`,
                code: 'OPEN_RIDER_SHIFTS',
                riders: riderNames
            });
        }
        
        const session = await CashierSessionService.closeSession(sessionId, Number(actualCash || 0), Number(withdrawnAmount || 0), closedBy, notes);
        res.json({ success: true, session });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Get summary for a specific session
router.get('/:id/summary', requireRole('CASHIER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const summary = await CashierSessionService.getSessionSummary(req.params.id);
        res.json({ success: true, summary });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- Suspense / Shift Log Endpoints ---

// Get all logs for a specific session
router.get('/:id/logs', async (req, res) => {
    try {
        const logs = await CashierShiftLogService.getLogsForSession(req.params.id);
        res.json({ success: true, logs });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Create a new pending log (Cashier action)
router.post('/:id/logs', requireRole('CASHIER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const { restaurantId, type, amount, description, category, referenceId } = req.body;
        const log = await CashierShiftLogService.createLog({
            restaurantId,
            sessionId: req.params.id,
            type,
            amount: Number(amount),
            description,
            category,
            referenceId
        });
        res.json({ success: true, log });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Resolve a pending log (Manager action)
router.post('/logs/:logId/resolve', requireRole('MANAGER', 'SUPER_ADMIN', 'ADMIN'), async (req, res) => {
    try {
        const { status, managerId, correctedCategory, entityId } = req.body;
        const log = await CashierShiftLogService.resolveLog({
            logId: req.params.logId,
            status,
            managerId,
            correctedCategory,
            entityId
        });
        res.json({ success: true, log });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/cashier/:id/distribute-svc
 * Distributes service charge to staff and posts journal:
 *   DR 2010 Service Charge Payable
 *   CR 1000 Cash
 *
 * Body: { restaurantId, distributions: [{ staffName, staffId?, amount }] }
 */
router.post('/:id/distribute-svc', requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const sessionId = req.params.id;
        const { distributions, totalAmount: bodyTotal, restaurantId } = req.body;

        const totalAmount = bodyTotal ? Number(bodyTotal) : (distributions?.reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0) || 0);
        
        if (totalAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Total distribution amount must be positive' });
        }

        const result = await CashierSessionService.distributeSVC({
            restaurantId: restaurantId || req.restaurantId!,
            sessionId,
            totalAmount,
            distributions: distributions || [],
            processedBy: req.staffId!
        });

        res.json({ success: true, distributed: result.distributed, distributions: result.distributions });
    } catch (e: any) {
        res.status(400).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/cashier/:id/manager-drawing
 * Records a formal manager cash withdrawal from drawer to safe:
 *   DR 1090 Manager Safe / Drawing
 *   CR 1000 Cash
 *
 * Body: { amount, notes?, restaurantId }
 */
router.post('/:id/manager-drawing', requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const sessionId = req.params.id;
        const { amount, notes, restaurantId } = req.body;

        if (!amount || Number(amount) <= 0) {
            return res.status(400).json({ success: false, error: 'A positive amount is required' });
        }

        const result = await CashierSessionService.recordManagerDrawing({
            restaurantId: restaurantId || req.restaurantId!,
            sessionId,
            amount: Number(amount),
            notes,
            processedBy: req.staffId!
        });

        res.json({ success: true, amount: result.amount, referenceId: result.referenceId });
    } catch (e: any) {
        res.status(400).json({ success: false, error: e.message });
    }
});

export default router;
