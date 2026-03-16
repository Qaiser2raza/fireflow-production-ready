import { prisma } from '../../../shared/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

interface DateRange {
    start: Date;
    end: Date;
}

export async function getStaffPerformanceReport(restaurantId: string, dateRange: DateRange) {
    // Get all staff
    const allStaff = await prisma.staff.findMany({
        where: { restaurant_id: restaurantId },
        select: { id: true, name: true, role: true }
    });

    // Get closed orders with totals
    const orders = await prisma.orders.findMany({
        where: {
            restaurant_id: restaurantId,
            status: 'CLOSED',
            created_at: { gte: dateRange.start, lte: dateRange.end }
        },
        select: {
            id: true,
            total: true,
            type: true,
            assigned_waiter_id: true,
            assigned_driver_id: true,
            last_action_by: true,
            created_at: true
        }
    });

    const staffMap = Object.fromEntries(allStaff.map(s => [s.id, { ...s, _metrics: { orders: 0, revenue: 0 } }]));

    // Process orders
    let totalRevenue = new Decimal(0);

    orders.forEach((o: any) => {
        const total = Number(o.total || 0);
        totalRevenue = totalRevenue.plus(total);

        // Waiter attribution
        if (o.assigned_waiter_id && staffMap[o.assigned_waiter_id]) {
            staffMap[o.assigned_waiter_id]._metrics.orders += 1;
            staffMap[o.assigned_waiter_id]._metrics.revenue += total;
        }

        // Rider attribution
        if (o.type === 'DELIVERY' && o.assigned_driver_id && staffMap[o.assigned_driver_id]) {
            staffMap[o.assigned_driver_id]._metrics.orders += 1;
            staffMap[o.assigned_driver_id]._metrics.revenue += total;
        }

        // Cashier attribution (if they were the last one to act, which is likely for take-away/closing)
        if (o.last_action_by && staffMap[o.last_action_by]) {
            staffMap[o.last_action_by]._metrics.orders += 1;
            staffMap[o.last_action_by]._metrics.revenue += total;
        }
    });

    const waiters = allStaff.filter(s => s.role === 'SERVER' || s.role === 'WAITER').map(s => ({
        id: s.id,
        name: s.name,
        orders: staffMap[s.id]._metrics.orders,
        revenue: staffMap[s.id]._metrics.revenue,
        avg_order: staffMap[s.id]._metrics.orders > 0 ? staffMap[s.id]._metrics.revenue / staffMap[s.id]._metrics.orders : 0
    })).sort((a, b) => b.revenue - a.revenue);

    const riders = allStaff.filter(s => s.role === 'RIDER' || s.role === 'DRIVER').map(s => ({
        id: s.id,
        name: s.name,
        deliveries: staffMap[s.id]._metrics.orders,
        revenue: staffMap[s.id]._metrics.revenue
    })).sort((a, b) => b.deliveries - a.deliveries);

    const cashiers = allStaff.filter(s => s.role === 'CASHIER' || s.role === 'MANAGER' || s.role === 'ADMIN').map(s => ({
        id: s.id,
        name: s.name,
        role: s.role,
        processed_orders: staffMap[s.id]._metrics.orders,
        revenue_handled: staffMap[s.id]._metrics.revenue
    })).filter(c => c.processed_orders > 0).sort((a, b) => b.revenue_handled - a.revenue_handled);

    return {
        period: { start: dateRange.start, end: dateRange.end },
        summary: {
            total_waiters_active: waiters.filter(w => w.orders > 0).length,
            total_riders_active: riders.filter(r => r.deliveries > 0).length,
            total_cashiers_active: cashiers.length,
        },
        waiters,
        riders,
        cashiers
    };
}
