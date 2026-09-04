import { Router } from 'express';
import { prisma } from '../../shared/lib/prisma';
import { requireRole } from '../middleware/authMiddleware';
import { ShiftSessionController } from '../controllers/ShiftSessionController';

const router = Router();
const controller = new ShiftSessionController(prisma);

router.post('/open', requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), controller.openShift);
router.post('/close', requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), controller.closeShift);
router.get('/active', requireRole('CASHIER', 'MANAGER', 'ADMIN', 'SUPER_ADMIN'), controller.getActive);
router.get('/settings', requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), controller.getSettings);
router.get('/', requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), controller.list);
router.get('/:shiftId', requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), controller.getById);
router.patch('/settings', requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), controller.updateSettings);

export default router;
