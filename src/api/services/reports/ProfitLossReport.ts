import { prisma } from '../../../shared/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export async function getProfitLossReport(restaurantId: string, range: { start: Date; end: Date }) {
    const lines = await prisma.journal_entry_lines.findMany({
        where: {
            journal_entries: {
                restaurant_id: restaurantId,
                date: {
                    gte: range.start,
                    lte: range.end
                }
            }
        },
        include: {
            chart_of_accounts: true
        }
    }) as any[];

    const revenue = lines.filter(l => l.chart_of_accounts.code.startsWith('4'));
    const expenses = lines.filter(l => l.chart_of_accounts.code.startsWith('5'));
    
    const totalRevenue = revenue.reduce((sum, l) => sum.plus(new Decimal(l.credit || 0)).minus(new Decimal(l.debit || 0)), new Decimal(0));
    const totalCogs = expenses
        .filter(l => l.chart_of_accounts.code === '5030')
        .reduce((sum, l) => sum.plus(new Decimal(l.debit || 0)).minus(new Decimal(l.credit || 0)), new Decimal(0));
    
    const grossProfit = totalRevenue.minus(totalCogs);
    
    const otherExpenses = expenses.filter(l => l.chart_of_accounts.code !== '5030');
    const expensesByCategory = otherExpenses.reduce((acc: Record<string, Decimal>, l) => {
        const category = l.chart_of_accounts.name;
        if (!acc[category]) acc[category] = new Decimal(0);
        acc[category] = acc[category].plus(new Decimal(l.debit || 0)).minus(new Decimal(l.credit || 0));
        return acc;
    }, {});

    const totalOtherExpenses = Object.values(expensesByCategory).reduce((sum, val) => sum.plus(val), new Decimal(0));
    const netIncome = grossProfit.minus(totalOtherExpenses);

    return {
        period: {
            start: range.start,
            end: range.end
        },
        revenue: {
            total: totalRevenue.toNumber(),
            items: revenue.map(r => ({ 
                name: r.chart_of_accounts.name, 
                amount: new Decimal(r.credit || 0).minus(new Decimal(r.debit || 0)).toNumber() 
            }))
        },
        cogs: totalCogs.toNumber(),
        grossProfit: grossProfit.toNumber(),
        operatingExpenses: {
            total: totalOtherExpenses.toNumber(),
            categories: Object.entries(expensesByCategory).map(([name, amount]) => ({ 
                name, 
                amount: amount.toNumber() 
            }))
        },
        netIncome: netIncome.toNumber()
    };
}
