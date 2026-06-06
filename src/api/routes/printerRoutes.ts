import { Router } from 'express';
import { prisma } from '../../shared/lib/prisma';
import { z } from 'zod';
import { PrinterService } from '../services/PrinterService';

const router = Router();
const printerSchema = z.object({
    name: z.string().min(1),
    ip_address: z.string().optional().default(''),
    port: z.number().default(9100),
    station_id: z.string().uuid(),
    connection_type: z.enum(['NETWORK', 'LOCAL']).default('NETWORK'),
    printer_name: z.string().optional(),
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

// POST test printer connection
router.post('/test-connection', async (req, res) => {
    try {
        const { ip_address, port } = req.body;
        if (!ip_address || !port) return res.status(400).json({ error: 'IP and Port required' });
        
        const result = await PrinterService.testConnection(ip_address, port);
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// POST send test print
router.post('/test-print', async (req, res) => {
    try {
        const { ip_address, port, name } = req.body;
        if (!ip_address || !port) return res.status(400).json({ error: 'IP and Port required' });

        const result = await PrinterService.sendTestPrint(ip_address, port, name || 'Test Printer');
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// POST print table QR code
router.post('/print-table-qr', async (req, res) => {
    try {
        const { table_id } = req.body;
        const restaurant_id = req.restaurantId!;
        if (!table_id) return res.status(400).json({ error: 'table_id required' });

        const table = await prisma.tables.findUnique({
            where: { id: table_id, restaurant_id }
        });
        if (!table) return res.status(404).json({ error: 'Table not found' });

        // Get active printers for the restaurant
        const printers = await prisma.printers.findMany({
            where: { restaurant_id, is_active: true },
            include: { stations: true }
        });
        if (printers.length === 0) return res.status(400).json({ error: 'No active printers configured' });

        // Smart fallback to find receipt/billing/cashier printer
        let printer = printers.find(p => 
            p.name.toLowerCase().includes('receipt') || 
            p.name.toLowerCase().includes('cashier') || 
            p.name.toLowerCase().includes('billing') ||
            p.name.toLowerCase().includes('pos')
        );
        if (!printer) {
            printer = printers.find(p => 
                p.stations?.name.toLowerCase().includes('cashier') || 
                p.stations?.name.toLowerCase().includes('billing') ||
                p.stations?.name.toLowerCase().includes('counter')
            );
        }
        if (!printer) {
            printer = printers[0];
        }

        // Build the QR URL.
        // We use the Vercel-hosted customer PWA so any phone (on any network) can scan and order.
        // The URL carries both restaurant_id and table id for full multi-tenant routing.
        const qrUrl = `https://fireflow-pwa.vercel.app/?restaurant_id=${restaurant_id}&table=${table.id}`;

        const htmlContent = `<!DOCTYPE html><html><body style="font-family:monospace;width:80mm;padding:8px;text-align:center;">
            <h3>FIREFLOW DINE-IN</h3>
            <hr/>
            <h2>TABLE: ${table.name}</h2>
            <p>Scan the QR code below<br/>to place your order directly<br/>from your phone!</p>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}" style="width:200px;height:200px;margin:20px 0;"/>
            <hr/>
            <p>Enjoy your meal!</p>
        </body></html>`;

        await PrinterService.printDocument(printer.id, htmlContent);

        res.json({ success: true, message: 'Table QR printed successfully' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;

