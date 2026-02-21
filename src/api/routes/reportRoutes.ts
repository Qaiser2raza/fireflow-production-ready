
import { Router } from 'express';
import * as ReportsService from '../services/ReportsService';
import { z } from 'zod';

const router = Router();

const reportQuerySchema = z.object({
    restaurantId: z.string().uuid(),
    start: z.string().datetime(),
    end: z.string().datetime()
});

router.get('/product-mix', async (req, res) => {
    try {
        const { restaurantId, start, end } = reportQuerySchema.parse(req.query);
        const data = await ReportsService.getProductMix(restaurantId, { start: new Date(start), end: new Date(end) });
        res.json({ success: true, data });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

router.get('/velocity', async (req, res) => {
    try {
        const { restaurantId, start, end } = reportQuerySchema.parse(req.query);
        const data = await ReportsService.getSalesVelocity(restaurantId, { start: new Date(start), end: new Date(end) });
        res.json({ success: true, data });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

router.get('/security', async (req, res) => {
    try {
        const { restaurantId, start, end } = reportQuerySchema.parse(req.query);
        const data = await ReportsService.getSecurityAudit(restaurantId, { start: new Date(start), end: new Date(end) });
        res.json({ success: true, data });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

router.get('/over-capacity', async (req, res) => {
    try {
        const { restaurantId, start, end } = reportQuerySchema.parse(req.query);
        const data = await ReportsService.getOverCapacityReport(restaurantId, { start: new Date(start), end: new Date(end) });
        res.json({ success: true, ...data });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

export default router;
