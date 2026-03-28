import { prisma } from '../../../shared/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

interface DateRange {
    start: Date;
    end: Date;
}

/**
 * Daily Sales Report — the #1 report every owner opens first.
 * Returns: gross, net, tax, service charge, delivery fees, discounts,
 *          order count, avg ticket, payment method split, order type split,
 *          and comparison data for yesterday + same day last week.
 */
export async function getDailySalesReport(restaurantId: string, dateRange: DateRange) {
    // --- Current period ---
    const orders = await prisma.orders.findMany({
        where: {
            restaurant_id: restaurantId,
            status: 'CLOSED',
            created_at: { gte: dateRange.start, lte: dateRange.end }
        },
        include: { transactions: true, order_items: true }
    });

    // Accumulators
    let grossSales = new Decimal(0);
    let totalTax = new Decimal(0);
    let totalSC = new Decimal(0);
    let totalDeliveryFees = new Decimal(0);
    let totalDiscounts = new Decimal(0);

    const paymentMethods: Record<string, number> = {};
    const orderTypes: Record<string, { count: number; revenue: number }> = {};
    const hourlyData: Record<number, { count: number; revenue: number }> = {};

    orders.forEach((order: any) => {
        const total = Number(order.total);
        grossSales = grossSales.plus(new Decimal(order.total.toString()));
        totalTax = totalTax.plus(new Decimal((order.tax || 0).toString()));
        totalSC = totalSC.plus(new Decimal((order.service_charge || 0).toString()));
        totalDeliveryFees = totalDeliveryFees.plus(new Decimal((order.delivery_fee || 0).toString()));
        totalDiscounts = totalDiscounts.plus(new Decimal((order.discount || 0).toString()));

        // Payment methods
        order.transactions.forEach((t: any) => {
            const method = t.payment_method;
            paymentMethods[method] = (paymentMethods[method] || 0) + Number(t.amount);
        });

        // Order types
        if (!orderTypes[order.type]) orderTypes[order.type] = { count: 0, revenue: 0 };
        orderTypes[order.type].count += 1;
        orderTypes[order.type].revenue += total;

        // Hourly
        const hour = new Date(order.created_at).getHours();
        if (!hourlyData[hour]) hourlyData[hour] = { count: 0, revenue: 0 };
        hourlyData[hour].count += 1;
        hourlyData[hour].revenue += total;
    });

    // Net Sales = Revenue after discounts, excluding tax, service charge, and delivery fees.
    const netSales = grossSales.minus(totalTax).minus(totalSC).minus(totalDeliveryFees);
    const avgTicket = orders.length > 0 ? grossSales.dividedBy(orders.length) : new Decimal(0);

    // --- Comparison: Yesterday ---
    const dayMs = 24 * 60 * 60 * 1000;
    const yesterdayStart = new Date(dateRange.start.getTime() - dayMs);
    const yesterdayEnd = new Date(dateRange.end.getTime() - dayMs);

    const yesterdayOrders = await prisma.orders.aggregate({
        where: {
            restaurant_id: restaurantId,
            status: 'CLOSED',
            created_at: { gte: yesterdayStart, lte: yesterdayEnd }
        },
        _sum: { total: true },
        _count: true
    });

    // --- Comparison: Same day last week ---
    const weekStart = new Date(dateRange.start.getTime() - 7 * dayMs);
    const weekEnd = new Date(dateRange.end.getTime() - 7 * dayMs);

    const lastWeekOrders = await prisma.orders.aggregate({
        where: {
            restaurant_id: restaurantId,
            status: 'CLOSED',
            created_at: { gte: weekStart, lte: weekEnd }
        },
        _sum: { total: true },
        _count: true
    });

    return {
        period: { start: dateRange.start, end: dateRange.end },
        summary: {
            gross_sales: Math.round(Number(grossSales) * 100) / 100,
            net_sales: Math.round(Number(netSales) * 100) / 100,
            total_tax: Math.round(Number(totalTax) * 100) / 100,
            total_service_charge: Math.round(Number(totalSC) * 100) / 100,
            total_delivery_fees: Math.round(Number(totalDeliveryFees) * 100) / 100,
            total_discounts: Math.round(Number(totalDiscounts) * 100) / 100,
            order_count: orders.length,
            avg_ticket: Math.round(Number(avgTicket) * 100) / 100,
        },
        payment_methods: paymentMethods,
        order_types: orderTypes,
        hourly_data: hourlyData,
        comparison: {
            yesterday: {
                gross_sales: Number(yesterdayOrders._sum.total || 0),
                order_count: yesterdayOrders._count,
                change_pct: Number(yesterdayOrders._sum.total || 0) > 0
                    ? Math.round(((Number(grossSales) - Number(yesterdayOrders._sum.total || 0)) / Number(yesterdayOrders._sum.total || 1)) * 100)
                    : null
            },
            last_week: {
                gross_sales: Number(lastWeekOrders._sum.total || 0),
                order_count: lastWeekOrders._count,
                change_pct: Number(lastWeekOrders._sum.total || 0) > 0
                    ? Math.round(((Number(grossSales) - Number(lastWeekOrders._sum.total || 0)) / Number(lastWeekOrders._sum.total || 1)) * 100)
                    : null
            }
        }
    };
}
