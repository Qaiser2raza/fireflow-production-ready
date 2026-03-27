import { prisma } from '../../../shared/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export async function getBalanceSheetReport(restaurantId: string, asOf: Date) {
    const lines = await prisma.journal_entry_lines.findMany({
        where: {
            journal_entries: {
                restaurant_id: restaurantId,
                date: {
                    lte: asOf
                }
            }
        },
        include: {
            chart_of_accounts: true
        }
    }) as any[];

    const assets: Record<string, Decimal> = {};
    const liabilities: Record<string, Decimal> = {};
    const equity: Record<string, Decimal> = {};
    let retainedEarnings = new Decimal(0);

    for (const line of lines) {
        const code = line.chart_of_accounts.code;
        const name = line.chart_of_accounts.name;
        const amount = new Decimal(line.debit || 0).minus(new Decimal(line.credit || 0));

        if (code.startsWith('1')) {
            assets[name] = (assets[name] || new Decimal(0)).plus(amount);
        } else if (code.startsWith('2')) {
            liabilities[name] = (liabilities[name] || new Decimal(0)).minus(amount);
        } else if (code.startsWith('3')) {
            equity[name] = (equity[name] || new Decimal(0)).minus(amount);
        } else {
            retainedEarnings = retainedEarnings.minus(amount);
        }
    }

    const totalAssets = Object.values(assets).reduce((s, v) => s.plus(v), new Decimal(0));
    const totalLiabilities = Object.values(liabilities).reduce((s, v) => s.plus(v), new Decimal(0));
    const totalCapEquity = Object.values(equity).reduce((s, v) => s.plus(v), new Decimal(0));
    const totalEquity = totalCapEquity.plus(retainedEarnings);

    return {
        date: asOf,
        assets: {
            total: totalAssets.toNumber(),
            items: Object.entries(assets).map(([name, amount]) => ({ name, amount: amount.toNumber() }))
        },
        liabilities: {
            total: totalLiabilities.toNumber(),
            items: Object.entries(liabilities).map(([name, amount]) => ({ name, amount: amount.toNumber() }))
        },
        equity: {
            total: totalEquity.toNumber(),
            retainedEarnings: retainedEarnings.toNumber(),
            items: Object.entries(equity).map(([name, amount]) => ({ name, amount: amount.toNumber() }))
        },
        balance: totalAssets.minus(totalLiabilities).minus(totalEquity).toNumber()
    };
}
