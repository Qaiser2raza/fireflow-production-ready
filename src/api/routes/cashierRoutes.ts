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
        
        const session = await CashierSessionService.getActiveSession(restaurantId as string, staffId as string);
        res.json({ success: true, session });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Open a new session
router.post('/open', requireRole('CASHIER', 'MANAGER', 'ADMIN'), async (req, res) => {
    try {
        const { restaurantId, staffId, openingFloat, terminalId } = req.body;
        if (!restaurantId || !staffId) return res.status(400).json({ success: false, error: 'Missing params' });
        
        const session = await CashierSessionService.openSession(restaurantId, staffId, Number(openingFloat || 0), terminalId);
        res.json({ success: true, session });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Close an existing session
router.post('/close', requireRole('CASHIER', 'MANAGER', 'ADMIN'), async (req, res) => {
    try {
        const { sessionId, actualCash, withdrawnAmount, closedBy, notes } = req.body;
        if (!sessionId || !closedBy) return res.status(400).json({ success: false, error: 'Missing params' });
        
        const session = await CashierSessionService.closeSession(sessionId, Number(actualCash || 0), Number(withdrawnAmount || 0), closedBy, notes);
        res.json({ success: true, session });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Get summary for a specific session
router.get('/:id/summary', requireRole('MANAGER', 'ADMIN'), async (req, res) => {
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
router.post('/:id/logs', requireRole('CASHIER', 'MANAGER', 'ADMIN'), async (req, res) => {
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

export default router;
