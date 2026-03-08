import { Router } from 'express';
import { prisma } from '../../shared/lib/prisma';
import { z } from 'zod';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();
router.use(authMiddleware);

const printerSchema = z.object({
    name: z.string().min(1),
    ip_address: z.string().min(1),
    port: z.number().default(9100),
    station_id: z.string().uuid(),
    is_active: z.boolean().default(true)
});

// GET all printers for restaurant
router.get('/', async (req, res) => {
    try {
        const restaurant_id = req.restaurantId!;
        const printers = await prisma.printers.findMany({
            where: { restaurant_id },
            include: { stations: true },
            orderBy: { created_at: 'desc' }
        });
        res.json(printers);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// POST create printer
router.post('/', async (req, res) => {
    try {
        const restaurant_id = req.restaurantId!;
        const data = printerSchema.parse(req.body);

        const newPrinter = await prisma.printers.create({
            data: {
                ...data,
                restaurant_id
            },
            include: { stations: true }
        });

        res.status(201).json(newPrinter);
    } catch (e: any) {
        if (e.code === 'P2002') return res.status(409).json({ error: 'IP Address already mapped for this restaurant' });
        res.status(400).json({ error: e.message });
    }
});

// PATCH update printer
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const restaurant_id = req.restaurantId!;
        const data = printerSchema.partial().parse(req.body);

        const updated = await prisma.printers.update({
            where: { id, restaurant_id },
            data,
            include: { stations: true }
        });

        res.json(updated);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// DELETE printer
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const restaurant_id = req.restaurantId!;

        await prisma.printers.delete({
            where: { id, restaurant_id }
        });

        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

export default router;
