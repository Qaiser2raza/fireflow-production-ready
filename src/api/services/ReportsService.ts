
import { prisma } from '../../shared/lib/prisma';

interface DateRange {
    start: Date;
    end: Date;
}

/**
 * 1. OVER CAPACITY REPORT
 */
export async function getOverCapacityReport(restaurantId: string, dateRange: DateRange) {
    const overCapacityLogs = await prisma.audit_logs.findMany({
        where: {
            restaurant_id: restaurantId,
            action_type: 'GUEST_OVER_CAPACITY',
            created_at: {
                gte: dateRange.start,
                lte: dateRange.end
            }
        },
        orderBy: { created_at: 'desc' }
    });

    const uniqueTables = new Set(
        overCapacityLogs
            .map(log => (log.details as any)?.table_id)
            .filter(Boolean)
    );

    const totalOverBy = overCapacityLogs.reduce(
        (sum, log) => sum + ((log.details as any)?.over_by || 0),
        0
    );

    const stats = {
        total_occurrences: overCapacityLogs.length,
        tables_affected: uniqueTables.size,
        avg_over_by: overCapacityLogs.length > 0 ? totalOverBy / overCapacityLogs.length : 0,
        most_common_tables: overCapacityLogs.reduce((acc: Record<string, number>, log) => {
            const tableName = (log.details as any)?.table_name || 'Unknown';
            acc[tableName] = (acc[tableName] || 0) + 1;
            return acc;
        }, {})
    };

    return { stats, logs: overCapacityLogs };
}

/**
 * 2. PRODUCT MIX REPORT (Winners vs Losers)
 */
export async function getProductMix(restaurantId: string, dateRange: DateRange) {
    const items = await prisma.order_items.findMany({
        where: {
            orders: {
                restaurant_id: restaurantId,
                status: 'CLOSED',
                created_at: { gte: dateRange.start, lte: dateRange.end }
            }
        },
        include: { menu_items: true }
    });

    const mix = items.reduce((acc: any, item) => {
        const name = item.item_name || item.menu_items?.name || 'Unknown';
        if (!acc[name]) {
            acc[name] = { quantity: 0, revenue: 0, category: item.category };
        }
        acc[name].quantity += item.quantity;
        acc[name].revenue += Number(item.total_price);
        return acc;
    }, {});

    return Object.entries(mix)
        .map(([name, stats]: [string, any]) => ({ name, ...stats }))
        .sort((a, b) => b.revenue - a.revenue);
}

/**
 * 3. SALES VELOCITY (Hourly Peak Analysis)
 */
export async function getSalesVelocity(restaurantId: string, dateRange: DateRange) {
    const orders = await prisma.orders.findMany({
        where: {
            restaurant_id: restaurantId,
            status: 'CLOSED',
            created_at: { gte: dateRange.start, lte: dateRange.end }
        },
        select: { created_at: true, total: true }
    });

    const hourly = orders.reduce((acc: any, order) => {
        const hour = new Date(order.created_at).getHours();
        if (!acc[hour]) acc[hour] = { count: 0, revenue: 0 };
        acc[hour].count += 1;
        acc[hour].revenue += Number(order.total);
        return acc;
    }, {});

    return Object.entries(hourly).map(([hour, stats]: [string, any]) => ({
        hour: `${hour}:00`,
        ...stats
    }));
}

/**
 * 4. SECURITY AUDIT (Voids & Cancellations)
 */
export async function getSecurityAudit(restaurantId: string, dateRange: DateRange) {
    const logs = await prisma.audit_logs.findMany({
        where: {
            restaurant_id: restaurantId,
            action_type: { in: ['ORDER_VOIDED', 'ORDER_CANCELLED', 'GUEST_COUNT_REDUCTION'] },
            created_at: { gte: dateRange.start, lte: dateRange.end }
        },
        include: { staff: true }
    });

    return logs.map(log => ({
        id: log.id,
        timestamp: log.created_at,
        type: log.action_type,
        staff: log.staff?.name,
        details: log.details
    }));
}
