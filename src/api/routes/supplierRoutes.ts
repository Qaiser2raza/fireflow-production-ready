import express from 'express';
import { prisma } from '../../shared/lib/prisma';
import { AccountingService } from '../services/AccountingService';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';

const router = express.Router();
const accounting = new AccountingService();

// GET /api/suppliers - List all suppliers with their current balances
router.get('/', authMiddleware, async (req, res) => {
    try {
        const restaurant_id = req.restaurantId!;
        const suppliers = await prisma.suppliers.findMany({
            where: { restaurant_id },
            orderBy: { name: 'asc' }
        });

        const suppliersWithBalances = await Promise.all(suppliers.map(async (s) => {
            const balance = await accounting.getSupplierBalance(restaurant_id, s.id);
            return { ...s, balance: Number(balance) };
        }));

        res.json(suppliersWithBalances);
    } catch (e: any) {
        console.error('GET /api/suppliers ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/suppliers/:id/statement - Get ledger history for a supplier
router.get('/:id/statement', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const restaurant_id = req.restaurantId!;

        const ledger = await prisma.supplier_ledgers.findMany({
            where: {
                restaurant_id,
                supplier_id: id
            },
            orderBy: { created_at: 'desc' },
            include: { payout: true }
        });

        res.json(ledger);
    } catch (e: any) {
        console.error('GET /api/suppliers/:id/statement ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/suppliers/bill - Record a new supplier bill
router.post('/bill', authMiddleware, requireRole('CASHIER', 'MANAGER', 'SUPER_ADMIN', 'ADMIN'), async (req, res) => {
    try {
        const { supplierId, amount, description, referenceId } = req.body;
        const restaurantId = req.restaurantId!;

        if (!supplierId || !amount) {
            return res.status(400).json({ error: 'Supplier ID and Amount are required' });
        }

        await accounting.recordSupplierBill({
            restaurantId,
            supplierId,
            amount,
            description,
            processedBy: req.staffId!,
            referenceId
        });

        res.json({ success: true, message: 'Supplier bill recorded successfully' });
    } catch (e: any) {
        console.error('POST /api/suppliers/bill ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/suppliers - Create a new supplier
router.post('/', authMiddleware, requireRole('MANAGER', 'SUPER_ADMIN', 'ADMIN'), async (req, res) => {
    try {
        const restaurant_id = req.restaurantId!;
        const { name, contact_name, phone, email, address } = req.body;

        const supplier = await prisma.suppliers.create({
            data: {
                restaurant_id,
                name,
                contact_name,
                phone,
                email,
                address
            }
        });

        res.status(201).json(supplier);
    } catch (e: any) {
        console.error('POST /api/suppliers ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/suppliers/payment - Record a payment to a supplier
router.post('/payment', authMiddleware, requireRole('CASHIER', 'MANAGER', 'SUPER_ADMIN', 'ADMIN'), async (req, res) => {
    try {
        const { supplierId, amount, description, paymentMethod, referenceId } = req.body;
        const restaurantId = req.restaurantId!;

        if (!supplierId || !amount) {
            return res.status(400).json({ error: 'Supplier ID and Amount are required' });
        }

        await accounting.recordSupplierPayment({
            restaurantId,
            supplierId,
            amount,
            description,
            paymentMethod: paymentMethod || 'CASH',
            processedBy: req.staffId!,
            referenceId
        });

        res.json({ success: true, message: 'Supplier payment recorded successfully' });
    } catch (e: any) {
        console.error('POST /api/suppliers/payment ERROR:', e);
        res.status(500).json({ error: e.message });
    }
});

export default router;
