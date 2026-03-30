import { Router } from 'express';
import { AccountingService } from '../services/AccountingService';
import { journalEntryService } from '../services/JournalEntryService';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/authMiddleware';
import { toUTCRange } from '../../shared/utils/dateUtils';

const router = Router();
router.use(authMiddleware);
router.use(requireRole('MANAGER', 'SUPER_ADMIN', 'ADMIN', 'CASHIER'));
// const prisma = new PrismaClient(); // Unused
const accounting = new AccountingService();

// Validation Schemas
const openSessionSchema = z.object({
    restaurantId: z.string().uuid(),
    staffId: z.string().uuid(),
    openingBalance: z.number().min(0)
});

const closeSessionSchema = z.object({
    sessionId: z.string().uuid(),
    staffId: z.string().uuid(),
    actualBalance: z.number().min(0),
    notes: z.string().optional()
});

const payoutSchema = z.object({
    restaurantId: z.string().uuid(),
    staffId: z.string().uuid(),
    amount: z.number().positive(),
    category: z.string(),
    notes: z.string()
});

/**
 * GET /api/accounting/session
 * Get active session or all sessions for a date
 */
router.get('/session', async (req, res) => {
    try {
        const restaurantId = req.restaurantId!; 
        const { date } = req.query;
        if (date) {
            const sessions = await accounting.getSessionsForDate(restaurantId, date as string);
            // Default `session` to the FIRST open one, or the last one (for older UI compatibility)
            const openSession = sessions.find(s => s.status === 'OPEN') || sessions[sessions.length - 1];
            res.json({ success: true, session: openSession, sessions });
        } else {
            const session = await accounting.getSessionMetrics(restaurantId);
            res.json({ success: true, session, sessions: session ? [session] : [] });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/accounting/ledger/export
 * Download CSV export of ledger
 */
router.get('/ledger/export', async (req, res) => {
    try {
        const { date, startDate, endDate } = req.query;
        const restaurantId = req.restaurantId!;
        const csv = await accounting.exportLedgerToCSV(restaurantId, { 
            date: date as string, 
            startDate: startDate as string, 
            endDate: endDate as string 
        });
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=ledger_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/accounting/ledger
 * Get recent ledger entries, optionally filtered by accountId or date
 */
router.get('/ledger', async (req, res) => {
    try {
        const { limit, accountId, date, startDate, endDate, type, refType, searchQuery } = req.query;
        const restaurantId = req.restaurantId!;
        const { prisma } = await import('../../shared/lib/prisma');

        const dateFilter: any = {};
        if (startDate && endDate) {
            const { start } = await toUTCRange(restaurantId, startDate as string);
            const { end: actualEnd } = await toUTCRange(restaurantId, endDate as string);
            dateFilter.gte = start;
            dateFilter.lte = actualEnd;
        } else if (date) {
            const { start, end } = await toUTCRange(restaurantId, date as string);
            dateFilter.gte = start;
            dateFilter.lte = end;
        }

        const where: any = {
            chart_of_accounts: { restaurant_id: restaurantId },
            ...(accountId ? { account_id: accountId } : {}),
            ...(Object.keys(dateFilter).length > 0 ? { journal_entries: { date: dateFilter } } : {}),
            ...(refType ? { journal_entries: { reference_type: refType } } : {}),
            ...(searchQuery ? { 
                OR: [
                    { description: { contains: searchQuery as string, mode: 'insensitive' } },
                    { journal_entries: { description: { contains: searchQuery as string, mode: 'insensitive' } } }
                ]
            } : {})
        };

        const lines = await prisma.journal_entry_lines.findMany({
            where,
            include: {
                journal_entries: {
                    select: { reference_type: true, reference_id: true, description: true, date: true, created_at: true }
                },
                chart_of_accounts: { select: { code: true, name: true } }
            },
            orderBy: [{ journal_entries: { date: 'desc' } }, { id: 'asc' }],
            take: Number(limit) || 100
        });

        let entries = lines.map(l => ({
            id: l.id,
            created_at: (l.journal_entries as any)?.created_at || (l.journal_entries as any)?.date,
            reference_type: (l.journal_entries as any)?.reference_type,
            account_name: (l.chart_of_accounts as any)?.name,
            account_code: (l.chart_of_accounts as any)?.code,
            description: l.description || (l.journal_entries as any)?.description,
            amount: Math.abs(Number(l.debit) - Number(l.credit)),
            transaction_type: Number(l.debit) > 0 ? 'DEBIT' : 'CREDIT',
            debit: Number(l.debit),
            credit: Number(l.credit),
        }));

        if (type) {
            entries = entries.filter(e => e.transaction_type === type);
        }
        
        return res.json({ success: true, entries });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/accounting/session/open
 */
router.post('/session/open', async (req, res) => {
    try {
        const validated = openSessionSchema.omit({ restaurantId: true, staffId: true }).parse(req.body);
        const session = await accounting.openCashSession({
            ...validated,
            restaurantId: req.restaurantId!, // SaaS Security
            staffId: req.staffId! // SaaS Security
        });
        res.json({ success: true, session });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * POST /api/accounting/session/close
 */
router.post('/session/close', async (req, res) => {
    try {
        const validated = closeSessionSchema.omit({ staffId: true }).parse(req.body);
        const session = await accounting.closeCashSession({
            ...validated,
            staffId: req.staffId! // SaaS Security
        });
        res.json({ success: true, session });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * POST /api/accounting/payout
 */
router.post('/payout', async (req, res) => {
    try {
        const { prisma } = await import('../../shared/lib/prisma');
        const validated = payoutSchema.parse(req.body);

        const payout = await prisma.$transaction(async (tx) => {
            const newPayout = await tx.payouts.create({
                data: {
                    restaurant_id: validated.restaurantId,
                    amount: validated.amount,
                    category: validated.category,
                    notes: validated.notes,
                    processed_by: validated.staffId,
                }
            });

            await accounting.recordPayout({
                restaurantId: validated.restaurantId,
                amount: validated.amount,
                category: validated.category,
                notes: validated.notes,
                processedBy: validated.staffId,
                referenceId: newPayout.id
            }, tx);

            return newPayout;
        });

        res.json({ success: true, payout });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * GET /api/accounting/balance/:staffId
 * Get current debt balance for a rider
 */
router.get('/balance/:staffId', async (req, res) => {
    try {
        const balance = await accounting.getBalance(req.restaurantId!, req.params.staffId);
        res.json({ success: true, balance: Number(balance) });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/accounting/z-report/:sessionId
 */
router.get('/z-report/:sessionId', async (req, res) => {
    try {
        const report = await accounting.getZReport(req.params.sessionId);
        res.json({ success: true, report });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/accounting/z-reports
 * Get list of all historical sessions (for history view)
 */
router.get('/z-reports', async (req, res) => {
    try {
        const { prisma } = await import('../../shared/lib/prisma');
        const sessions = await prisma.cashier_sessions.findMany({
            where: { restaurant_id: req.restaurantId! },
            orderBy: { opened_at: 'desc' },
            take: 30
        });
        res.json({ success: true, sessions });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/accounting/trial-balance
 * Returns aggregated debit/credit totals per account
 * Optional query params: from=YYYY-MM-DD&to=YYYY-MM-DD
 */
router.get('/trial-balance', async (req, res) => {
    try {
        const { from, to } = req.query;
        const trialBalance = await journalEntryService.getTrialBalance(
            req.restaurantId!,
            from ? new Date(from as string) : undefined,
            to   ? new Date(to   as string) : undefined,
        );
        res.json({ success: true, trial_balance: trialBalance });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/accounting/manual-journal
 * Create a manual double-entry journal posting.
 * Requires ADMIN or SUPER_ADMIN.
 */
router.post('/manual-journal', requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res) => {
    try {
        const { date, description, referenceId, lines } = req.body;
        const restaurantId = req.restaurantId!;

        if (!lines || !Array.isArray(lines) || lines.length < 2) {
            return res.status(400).json({ error: 'Manual journals require at least 2 lines' });
        }

        // Validate balancing
        let totalDebit = 0;
        let totalCredit = 0;
        for (const line of lines) {
            totalDebit += Number(line.debit) || 0;
            totalCredit += Number(line.credit) || 0;
            if (!line.accountId) return res.status(400).json({ error: 'All lines must specify an accountId' });
            if ((Number(line.debit) || 0) < 0 || (Number(line.credit) || 0) < 0) {
                 return res.status(400).json({ error: 'Amounts cannot be negative' });
            }
        }

        if (Math.abs(totalDebit - totalCredit) > 0.01) {
            return res.status(400).json({ error: `Journal is out of balance. Debits: ${totalDebit}, Credits: ${totalCredit}` });
        }
        if (totalDebit === 0) {
            return res.status(400).json({ error: 'Journal must have a non-zero value' });
        }

        const { prisma } = await import('../../shared/lib/prisma');
        const { Decimal } = await import('@prisma/client/runtime/library');

        // Verify accounts exist and belong to restaurant
        const accountIds = lines.map(l => l.accountId);
        const validAccounts = await prisma.chart_of_accounts.count({
            where: {
                id: { in: accountIds },
                restaurant_id: restaurantId,
            }
        });

        if (validAccounts !== new Set(accountIds).size) {
            return res.status(400).json({ error: 'One or more invalid account IDs' });
        }

        const actualRefId = referenceId || `MJ-${Date.now()}`;
        const journal = await prisma.journal_entries.create({
            data: {
                restaurant_id: restaurantId,
                reference_type: 'MANUAL_JOURNAL',
                reference_id: actualRefId,
                date: date ? new Date(date) : new Date(),
                description: description || 'Manual Journal Entry',
                processed_by: req.staffId!,
                lines: {
                    create: lines.map(l => ({
                        account_id: l.accountId,
                        description: l.description || description || 'Manual line',
                        debit: new Decimal(Number(l.debit) || 0),
                        credit: new Decimal(Number(l.credit) || 0),
                        reference_type: 'MANUAL_JOURNAL',
                        reference_id: actualRefId
                    }))
                }
            },
            include: { lines: true }
        });

        res.json({ success: true, journal });
    } catch (e: any) {
        res.status(500).json({ error: e.message || 'Internal server error' });
    }
});

/**
 * GET /api/accounting/gl-balance
 * Returns the net cash balance (Current Assets 1000)
 */
router.get('/gl-balance', async (req, res) => {
    try {
        const { date, startDate, endDate } = req.query;
        const restaurantId = req.restaurantId!;
        const { prisma } = await import('../../shared/lib/prisma');

        const dateFilter: any = {};
        if (startDate && endDate) {
            const { start } = await toUTCRange(restaurantId, startDate as string);
            const { end: actualEnd } = await toUTCRange(restaurantId, endDate as string);
            dateFilter.gte = start;
            dateFilter.lte = actualEnd;
        } else if (date) {
            const { start, end } = await toUTCRange(restaurantId, date as string);
            dateFilter.gte = start;
            dateFilter.lte = end;
        }

        const lines = await prisma.journal_entry_lines.findMany({
            where: {
                chart_of_accounts: { 
                    restaurant_id: restaurantId,
                    code: '1000'
                },
                ...(date ? { journal_entries: { date: dateFilter } } : {})
            },
            select: { debit: true, credit: true }
        });

        const totalDebit = lines.reduce((acc, l) => acc + Number(l.debit), 0);
        const totalCredit = lines.reduce((acc, l) => acc + Number(l.credit), 0);

        res.json({ success: true, cash_balance: totalDebit - totalCredit });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/accounting/gl-revenue
 * Returns net revenue (Sales 4000)
 */
router.get('/gl-revenue', async (req, res) => {
    try {
        const { date, startDate, endDate } = req.query;
        const restaurantId = req.restaurantId!;
        const { prisma } = await import('../../shared/lib/prisma');

        const dateFilter: any = {};
        if (startDate && endDate) {
            const { start } = await toUTCRange(restaurantId, startDate as string);
            const { end: actualEnd } = await toUTCRange(restaurantId, endDate as string);
            dateFilter.gte = start;
            dateFilter.lte = actualEnd;
        } else if (date) {
            const { start, end } = await toUTCRange(restaurantId, date as string);
            dateFilter.gte = start;
            dateFilter.lte = end;
        }

        const lines = await prisma.journal_entry_lines.findMany({
            where: {
                chart_of_accounts: { 
                    restaurant_id: restaurantId,
                    code: '4000'
                },
                ...(date ? { journal_entries: { date: dateFilter } } : {})
            },
            select: { debit: true, credit: true }
        });

        const totalDebit = lines.reduce((acc, l) => acc + Number(l.debit), 0);
        const totalCredit = lines.reduce((acc, l) => acc + Number(l.credit), 0);

        // Revenue is Credit-normal
        res.json({ success: true, revenue: totalCredit - totalDebit });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
