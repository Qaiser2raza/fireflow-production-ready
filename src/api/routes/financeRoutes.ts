import express from 'express';
import { prisma } from '../../shared/lib/prisma';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';
import { journalEntryService } from '../services/JournalEntryService';
import { Decimal } from '@prisma/client/runtime/library';

const router = express.Router();

/**
 * POST /api/finance/inventory/purchase
 * Record a purchase of inventory (Cash or Credit)
 */
router.post('/inventory/purchase', authMiddleware, requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    const { supplierId, amount, isCredit, description } = req.body;
    const restaurantId = req.restaurantId!;
    const staffId = req.staffId!;

    try {
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create a dummy payout or record if needed (using the new ledger logic)
            // For now, we mainly want the Journal Entry and the Ledger Entry.
            
            // 2. Create Supplier Ledger Entry
            const supplier = await tx.suppliers.findUnique({ where: { id: supplierId } });
            if (!supplier) throw new Error('Supplier not found');

            // Get last balance
            const lastEntry = await tx.supplier_ledgers.findFirst({
                where: { supplier_id: supplierId },
                orderBy: { created_at: 'desc' }
            });
            const currentBalance = new Decimal(lastEntry?.balance_after || 0);
            const newBalance = isCredit ? currentBalance.plus(amount) : currentBalance;

            const ledgerEntry = await tx.supplier_ledgers.create({
                data: {
                    restaurant_id: restaurantId,
                    supplier_id: supplierId,
                    entry_type: 'BILL',
                    amount: new Decimal(amount),
                    balance_after: newBalance,
                    description: description || 'Inventory Purchase',
                    processed_by: staffId
                }
            });

            // 3. Post Journal
            await journalEntryService.recordInventoryPurchaseJournal({
                restaurantId,
                supplierId,
                amount,
                isCredit,
                referenceId: ledgerEntry.id,
                description: description || `Purchase from ${supplier.name}`,
                processedBy: staffId
            }, tx);

            return ledgerEntry;
        });

        res.json({ success: true, data: result });
    } catch (e: any) {
        console.error('[Finance] Purchase error:', e);
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/finance/inventory/closing
 * Record manual stock count and adjust asset value
 */
router.post('/inventory/closing', authMiddleware, requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    const { closingAmount, description } = req.body;
    const restaurantId = req.restaurantId!;
    const staffId = req.staffId!;

    try {
        const result = await prisma.$transaction(async (tx) => {
            const auditId = `INV-AUDIT-${Date.now()}`;
            
            await journalEntryService.recordInventoryClosingJournal({
                restaurantId,
                closingAmount,
                referenceId: auditId,
                description: description || 'Monthly Inventory Closing',
                processedBy: staffId
            }, tx);

            return { auditId, closingAmount };
        });

        res.json({ success: true, data: result });
    } catch (e: any) {
        console.error('[Finance] Closing error:', e);
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/finance/expenses
 * Record a general operating expense
 */
router.post('/expenses', authMiddleware, requireRole('MANAGER', 'ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    const { amount, description, category } = req.body;
    const restaurantId = req.restaurantId!;
    const staffId = req.staffId!;

    try {
        const result = await prisma.$transaction(async (tx) => {
            const expenseId = `EXP-${Date.now()}`;
            
            await journalEntryService.recordExpenseJournal({
                restaurantId,
                expenseId,
                amount,
                description: `[${category || 'General'}] ${description}`,
                processedBy: staffId
            }, tx);

            return { expenseId, amount };
        });

        res.json({ success: true, data: result });
    } catch (e: any) {
        console.error('[Finance] Expense error:', e);
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/finance/suppliers/:id/ledger
 * Fetch supplier audit trail
 */
router.get('/suppliers/:id/ledger', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        const ledger = await prisma.supplier_ledgers.findMany({
            where: { supplier_id: id, restaurant_id: req.restaurantId },
            orderBy: { created_at: 'desc' },
            take: 50
        });
        res.json(ledger);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch supplier ledger' });
    }
});

/**
 * GET /api/finance/customers/:id/ledger
 * Fetch customer audit trail for finance/payments dashboard
 */
router.get('/customers/:id/ledger', authMiddleware, async (req, res) => {
    const { id } = req.params;
    try {
        const ledger = await prisma.customer_ledgers.findMany({
            where: { customer_id: id, restaurant_id: req.restaurantId },
            orderBy: { created_at: 'desc' },
            take: 50
        });
        res.json(ledger);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch customer ledger' });
    }
});

export default router;
