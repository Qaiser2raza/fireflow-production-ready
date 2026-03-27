import express from 'express';
import { ExpenseService } from '../services/ExpenseService';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';
import { prisma } from '../../shared/lib/prisma';
import { z } from 'zod';

const router = express.Router();
const expenseService = new ExpenseService();

const expenseSchema = z.object({
    category: z.enum(['UTILITIES', 'SALARY', 'MAINTENANCE', 'SUPPLIES', 'MARKETING', 'RENT', 'TRANSPORT', 'MISCELLANEOUS']),
    amount: z.number().positive(),
    description: z.string().min(1)
});

router.use(authMiddleware);

router.post('/', requireRole('MANAGER', 'SUPER_ADMIN', 'ADMIN'), async (req, res) => {
    try {
        const validated = expenseSchema.parse(req.body);
        const result = await prisma.$transaction(async (tx) => {
            return await expenseService.createExpense({
                restaurantId: req.restaurantId!,
                category: validated.category,
                amount: validated.amount,
                description: validated.description,
                processedBy: req.staffId!
            }, tx);
        });
        res.json({ success: true, data: result });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

router.get('/', requireRole('MANAGER', 'SUPER_ADMIN', 'ADMIN'), async (req, res) => {
    try {
        const expenses = await prisma.expenses.findMany({
            where: { restaurant_id: req.restaurantId! },
            orderBy: { created_at: 'desc' },
            take: 100,
            include: { staff: true }
        });
        res.json({ success: true, data: expenses });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

export default router;
