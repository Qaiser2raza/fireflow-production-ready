import { Router } from 'express';
import { prisma } from '../../shared/lib/prisma';
import { z } from 'zod';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();
router.use(authMiddleware);

const coaSchema = z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
    description: z.string().optional(),
    parent_id: z.string().uuid().optional(),
    is_active: z.boolean().default(true)
});

// GET all accounts
router.get('/', async (req, res) => {
    try {
        const restaurant_id = req.restaurantId!;
        const accounts = await prisma.chart_of_accounts.findMany({
            where: { restaurant_id },
            orderBy: { code: 'asc' }
        });
        res.json(accounts);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// POST create account
router.post('/', async (req, res) => {
    try {
        const restaurant_id = req.restaurantId!;
        const data = coaSchema.parse(req.body);

        const newAccount = await prisma.chart_of_accounts.create({
            data: { ...data, restaurant_id }
        });

        res.status(201).json(newAccount);
    } catch (e: any) {
        if (e.code === 'P2002') return res.status(409).json({ error: 'Account code already exists' });
        res.status(400).json({ error: e.message });
    }
});

// PATCH update account
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const restaurant_id = req.restaurantId!;
        const data = coaSchema.partial().parse(req.body);

        const updated = await prisma.chart_of_accounts.update({
            where: { id, restaurant_id },
            data
        });

        res.json(updated);
    } catch (e: any) {
        if (e.code === 'P2002') return res.status(409).json({ error: 'Account code already exists' });
        res.status(400).json({ error: e.message });
    }
});

export default router;
