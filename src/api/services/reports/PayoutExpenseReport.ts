import { prisma } from '../../../shared/lib/prisma';

interface DateRange {
    start: Date;
    end: Date;
}

export async function getPayoutExpenseReport(restaurantId: string, dateRange: DateRange) {
    // Staff Map for manual relation
    const allStaff = await prisma.staff.findMany({
        where: { restaurant_id: restaurantId },
        select: { id: true, name: true }
    });
    const staffMap = Object.fromEntries(allStaff.map(s => [s.id, s.name]));

    // 1. Payouts (cash from drawer)
    const payouts = await prisma.payouts.findMany({
        where: {
            restaurant_id: restaurantId,
            created_at: { gte: dateRange.start, lte: dateRange.end }
        }
    }) as any[];

    // 2. Expenses (general ledger tracking)
    const expenses = await prisma.expenses.findMany({
        where: {
            restaurant_id: restaurantId,
            date: { gte: dateRange.start, lte: dateRange.end }
        },
        include: { staff: true }
    }) as any[];

    const categories: Record<string, number> = {};
    const processors: Record<string, number> = {};
    const timeline: Record<string, number> = {};

    let totalPayouts = 0;
    let totalExpenses = 0;

    // Process Payouts
    payouts.forEach(p => {
        const amt = Number(p.amount || 0);
        totalPayouts += amt;
        const cat = p.category || 'Uncategorized';
        const proc = p.processed_by ? staffMap[p.processed_by] || 'Unknown Staff' : 'Unknown Staff';
        const day = new Date(p.created_at).toISOString().split('T')[0];

        categories[cat] = (categories[cat] || 0) + amt;
        processors[proc] = (processors[proc] || 0) + amt;
        timeline[day] = (timeline[day] || 0) + amt;
    });

    // Process Expenses (if distinct from payouts)
    expenses.forEach(e => {
        const amt = Number(e.amount || 0);
        totalExpenses += amt;
        const cat = e.category || 'Uncategorized';
        const proc = e.staff?.name || 'Unknown Staff';
        const day = new Date(e.date).toISOString().split('T')[0];

        // Decide whether to merge with payouts or keep separate.
        // We will merge them for the "Total Cash Outflow" view.
        categories[cat] = (categories[cat] || 0) + amt;
        processors[proc] = (processors[proc] || 0) + amt;
        timeline[day] = (timeline[day] || 0) + amt;
    });

    return {
        period: { start: dateRange.start, end: dateRange.end },
        summary: {
            total_cash_outflow: totalPayouts + totalExpenses,
            total_payouts_volume: totalPayouts,
            total_expenses_volume: totalExpenses,
            payout_count: payouts.length,
            expense_count: expenses.length
        },
        expense_by_category: Object.entries(categories).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
        expense_by_staff: Object.entries(processors).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
        expense_timeline: Object.entries(timeline).map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date)),
        recent_transactions: [
            ...payouts.map(p => ({
                id: p.id,
                date: p.created_at,
                amount: Number(p.amount),
                category: p.category,
                notes: p.notes || '',
                type: 'PAYOUT'
            })),
            ...expenses.map(e => ({
                id: e.id,
                date: e.date,
                amount: Number(e.amount),
                category: e.category,
                notes: e.description || '',
                type: 'EXPENSE'
            }))
        ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 20)
    };
}
