import { Router } from 'express';
import { prisma } from '../../shared/lib/prisma';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';

const router = Router();
router.use(authMiddleware);

const coaSchema = z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
    description: z.string().optional(),
    parent_id: z.string().uuid().optional().nullable(),
    is_active: z.boolean().default(true)
});

// ─── GET all accounts with live balances and hierarchy ────────────────────────
router.get('/', async (req, res) => {
    try {
        const restaurant_id = req.restaurantId!;
        const accounts = await prisma.chart_of_accounts.findMany({
            where: { restaurant_id },
            orderBy: { code: 'asc' }
        });

        // Aggregate debit/credit totals per account from journal entry lines
        const lines = await prisma.journal_entry_lines.findMany({
            where: {
                chart_of_accounts: { restaurant_id }
            },
            select: { account_id: true, debit: true, credit: true }
        });

        const balanceMap: Record<string, { debit: number; credit: number }> = {};
        for (const line of lines) {
            if (!balanceMap[line.account_id]) {
                balanceMap[line.account_id] = { debit: 0, credit: 0 };
            }
            balanceMap[line.account_id].debit += Number(line.debit);
            balanceMap[line.account_id].credit += Number(line.credit);
        }

        const enriched = accounts.map(acc => {
            const b = balanceMap[acc.id] || { debit: 0, credit: 0 };
            // Normal balance convention:
            // ASSET/EXPENSE → debit increases (balance = debit - credit)
            // LIABILITY/EQUITY/REVENUE → credit increases (balance = credit - debit)
            const isDebitNormal = acc.type === 'ASSET' || acc.type === 'EXPENSE';
            const balance = isDebitNormal ? b.debit - b.credit : b.credit - b.debit;
            return {
                ...acc,
                balance: Math.round(balance * 100) / 100,
                total_debit: Math.round(b.debit * 100) / 100,
                total_credit: Math.round(b.credit * 100) / 100,
            };
        });

        res.json({ success: true, accounts: enriched });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST create account (ADMIN/MANAGER only) ─────────────────────────────────
router.post('/', requireRole('ADMIN', 'MANAGER', 'SUPER_ADMIN'), async (req, res) => {
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

// ─── POST seed default accounts (ADMIN/SUPER_ADMIN only) ──────────────────────
router.post('/seed', requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const restaurant_id = req.restaurantId!;
        const { journalEntryService } = await import('../services/JournalEntryService');
        
        const seeded = await journalEntryService.seedDefaultCOA(restaurant_id);
        res.status(200).json({ success: true, seeded_count: seeded.length, accounts: seeded });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// ─── PATCH update account — system accounts are locked ────────────────────────
router.patch('/:id', requireRole('ADMIN', 'MANAGER', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const { id } = req.params;
        const restaurant_id = req.restaurantId!;

        // Block modification of system-flagged accounts
        const existing = await prisma.chart_of_accounts.findFirst({
            where: { id, restaurant_id }
        });
        if (!existing) return res.status(404).json({ error: 'Account not found' });
        if ((existing as any).is_system) {
            return res.status(403).json({ error: 'System accounts cannot be modified.' });
        }

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

// ─── DELETE account — blocked if system account or has ledger activity ────────
router.delete('/:id', requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const { id } = req.params;
        const restaurant_id = req.restaurantId!;

        const existing = await prisma.chart_of_accounts.findFirst({
            where: { id, restaurant_id }
        });
        if (!existing) return res.status(404).json({ error: 'Account not found' });
        if ((existing as any).is_system) {
            return res.status(403).json({ error: 'System accounts cannot be deleted.' });
        }

        // Check for existing journal lines
        const lineCount = await prisma.journal_entry_lines.count({
            where: { account_id: id }
        });
        if (lineCount > 0) {
            return res.status(409).json({
                error: `Cannot delete account with ${lineCount} journal entries. Deactivate it instead.`
            });
        }

        await prisma.chart_of_accounts.delete({ where: { id } });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
