import { prisma } from '../../../shared/lib/prisma';

interface DateRange {
    start: Date;
    end: Date;
}

export async function getEnhancedProductMixReport(restaurantId: string, dateRange: DateRange) {
    // We already fetch `reports.getProductMix` in ReportsService, 
    // but building an enhanced one with Pareto analysis
    const orderItems = await prisma.order_items.findMany({
        where: {
            orders: {
                restaurant_id: restaurantId,
                status: 'CLOSED',
                created_at: { gte: dateRange.start, lte: dateRange.end }
            }
        },
        include: { menu_items: true }
    });

    const itemsMap: Record<string, { id: string; name: string; category: string; quantity: number; revenue: number }> = {};
    let totalRevenue = 0;
    let totalQuantity = 0;

    orderItems.forEach((item: any) => {
        const id = item.menu_item_id;
        const name = item.menu_items?.name || item.name || 'Unknown item';
        const category = item.menu_items?.category_id || 'Uncategorized'; // We don't have category name easily joined, we group by id or a mapping
        const quantity = item.quantity || 1;
        const rev = Number(item.subtotal || 0);

        if (!itemsMap[id]) {
            itemsMap[id] = { id, name, category, quantity: 0, revenue: 0 };
        }
        itemsMap[id].quantity += quantity;
        itemsMap[id].revenue += rev;

        totalQuantity += quantity;
        totalRevenue += rev;
    });

    // Array sorted by quantity
    const sortedByQty = Object.values(itemsMap).sort((a, b) => b.quantity - a.quantity);

    // Top 10 Best Sellers
    const top10 = sortedByQty.slice(0, 10);
    // Bottom 10 Worst Sellers (only items that sold >0)
    const bottom10 = sortedByQty.slice(-10).reverse();

    // Pareto (80/20 rule) - calculate cumulative revenue %
    const sortedByRev = [...sortedByQty].sort((a, b) => b.revenue - a.revenue);
    let cumulativeRev = 0;

    const paretoAnalysis = sortedByRev.map(item => {
        cumulativeRev += item.revenue;
        const isTop20PercentCount = sortedByRev.indexOf(item) < (sortedByRev.length * 0.2); // Top 20% of catalog
        return {
            ...item,
            pct_of_revenue: totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0,
            cumulative_pct: totalRevenue > 0 ? (cumulativeRev / totalRevenue) * 100 : 0,
            is_pareto_champion: isTop20PercentCount
        };
    });

    return {
        period: { start: dateRange.start, end: dateRange.end },
        summary: {
            total_items_sold: totalQuantity,
            total_revenue: totalRevenue,
            unique_items_sold: sortedByQty.length
        },
        top_10: top10,
        bottom_10: bottom10,
        pareto: paretoAnalysis,
        raw_items: sortedByRev
    };
}
