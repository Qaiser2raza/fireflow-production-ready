import { Router } from 'express';
import { CashierSessionService } from '../services/finance/CashierSessionService.js';
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
        const { restaurantId, staffId, openingFloat } = req.body;
        if (!restaurantId || !staffId) return res.status(400).json({ success: false, error: 'Missing params' });
        
        const session = await CashierSessionService.openSession(restaurantId, staffId, Number(openingFloat || 0));
        res.json({ success: true, session });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Close an existing session
router.post('/close', requireRole('CASHIER', 'MANAGER', 'ADMIN'), async (req, res) => {
    try {
        const { sessionId, actualCash, closedBy, notes } = req.body;
        if (!sessionId || !closedBy) return res.status(400).json({ success: false, error: 'Missing params' });
        
        const session = await CashierSessionService.closeSession(sessionId, Number(actualCash || 0), closedBy, notes);
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

export default router;
