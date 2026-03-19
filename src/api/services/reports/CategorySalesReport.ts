
import { prisma } from '../../../shared/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

interface DateRange {
    start: Date;
    end: Date;
}

export async function getCategorySalesReport(restaurantId: string, dateRange: DateRange) {
    const items = await prisma.order_items.findMany({
        where: {
            orders: {
                restaurant_id: restaurantId,
                status: 'CLOSED',
                created_at: { gte: dateRange.start, lte: dateRange.end }
            }
        },
        select: {
            category: true,
            quantity: true,
            total_price: true
        }
    });

    const categoryStats: Record<string, { quantity: number; revenue: Decimal }> = {};
    let totalRevenue = new Decimal(0);

    items.forEach(item => {
        const cat = item.category || 'Uncategorized';
        const price = new Decimal(item.total_price.toString());
        
        if (!categoryStats[cat]) {
            categoryStats[cat] = { quantity: 0, revenue: new Decimal(0) };
        }
        
        categoryStats[cat].quantity += item.quantity;
        categoryStats[cat].revenue = categoryStats[cat].revenue.plus(price);
        totalRevenue = totalRevenue.plus(price);
    });

    const categories = Object.entries(categoryStats).map(([name, stats]) => ({
        name,
        quantity: stats.quantity,
        revenue: stats.revenue,
        percentage: totalRevenue.gt(0) 
            ? Math.round((Number(stats.revenue) / Number(totalRevenue)) * 10000) / 100 
            : 0
    })).sort((a, b) => b.revenue.comparedTo(a.revenue));

    return {
        period: { start: dateRange.start, end: dateRange.end },
        summary: {
            total_categories: categories.length,
            total_revenue: totalRevenue,
            total_units: items.reduce((sum, i) => sum + i.quantity, 0)
        },
        categories
    };
}
