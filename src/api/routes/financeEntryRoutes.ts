import { Router } from 'express';
import { requireRole } from '../middleware/authMiddleware';
import { CashierSessionController } from '../controllers/CashierSessionController';

const router = Router();
const controller = new CashierSessionController();

router.post('/entry', requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), controller.createFinanceEntry);
router.post('/confirm', requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), controller.confirmFinanceEntry);
router.post('/reject', requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), controller.rejectFinanceEntry);
router.get('/report', requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), controller.getFinanceReport);
router.get('/latest/:shiftId', requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), controller.getLatestFinanceEntry);

export default router;
