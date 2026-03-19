
import { prisma } from '../../../shared/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

interface DateRange {
    start: Date;
    end: Date;
}

export async function getPaymentMethodReport(restaurantId: string, dateRange: DateRange) {
    const transactions = await prisma.transactions.findMany({
        where: {
            restaurant_id: restaurantId,
            status: 'SUCCESS',
            created_at: { gte: dateRange.start, lte: dateRange.end }
        },
        select: {
            payment_method: true,
            amount: true,
            created_at: true
        }
    });

    const methodStats: Record<string, { count: number; total: Decimal }> = {};
    let grandTotal = new Decimal(0);

    transactions.forEach(t => {
        const method = t.payment_method || 'CASH';
        const amount = new Decimal(t.amount.toString());

        if (!methodStats[method]) {
            methodStats[method] = { count: 0, total: new Decimal(0) };
        }

        methodStats[method].count += 1;
        methodStats[method].total = methodStats[method].total.plus(amount);
        grandTotal = grandTotal.plus(amount);
    });

    const breakdown = Object.entries(methodStats).map(([name, stats]) => ({
        name,
        transaction_count: stats.count,
        total_amount: stats.total,
        percentage: grandTotal.gt(0) 
            ? Math.round((Number(stats.total) / Number(grandTotal)) * 10000) / 100 
            : 0
    })).sort((a, b) => b.total_amount.comparedTo(a.total_amount));

    return {
        period: { start: dateRange.start, end: dateRange.end },
        summary: {
            total_transactions: transactions.length,
            total_volume: grandTotal
        },
        breakdown
    };
}
