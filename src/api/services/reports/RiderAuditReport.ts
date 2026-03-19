import { prisma } from '../../../shared/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

interface DateRange {
    start: Date;
    end: Date;
}

/**
 * Generates a detailed audit of a specific rider's activities.
 * If riderId is null, returns a summary of all rider activities.
 */
export async function getRiderAuditReport(restaurantId: string, dateRange: DateRange, riderId?: string) {
    // 1. Fetch rider info if specified
    const rider = riderId ? await prisma.staff.findFirst({
        where: { 
            id: riderId,
            restaurant_id: restaurantId 
        },
        select: { id: true, name: true, role: true }
    }) : null;

    // 2. Fetch orders assigned to this rider (or all riders if riderId is missing)
    const orders = await prisma.orders.findMany({
        where: {
            restaurant_id: restaurantId,
            type: 'DELIVERY',
            assigned_driver_id: riderId || undefined,
            created_at: { gte: dateRange.start, lte: dateRange.end }
        },
        include: {
            delivery_orders: true,
            transactions: {
                where: { status: 'SUCCESS' }
            }
        },
        orderBy: { created_at: 'desc' }
    });

    // 3. Calculate metrics
    const summary = {
        total_orders: orders.length,
        total_revenue: orders
            .filter(o => o.status === 'CLOSED' || o.status === 'DELIVERED')
            .reduce((acc, o) => acc.plus(o.total), new Decimal(0)),
        pending_revenue: orders
            .filter(o => o.status !== 'CLOSED' && o.status !== 'DELIVERED' && o.status !== 'CANCELLED' && o.status !== 'VOIDED')
            .reduce((acc, o) => acc.plus(o.total), new Decimal(0)),
        failed_orders: orders.filter(o => o.delivery_orders?.failed_reason).length
    };

    // 4. Format order list for the report
    const orderList = orders.map(o => ({
        id: o.id,
        order_number: o.order_number || o.id.slice(-6).toUpperCase(),
        time: o.created_at,
        customer: o.customer_name || 'Walk-in',
        address: o.delivery_address || 'N/A',
        total: Number(o.total),
        status: o.status,
        dispatched_at: o.delivery_orders?.dispatched_at,
        delivered_at: o.delivery_orders?.delivered_at,
        payment_method: o.transactions[0]?.payment_method || 'CASH',
        failed_reason: o.delivery_orders?.failed_reason
    }));

    return {
        period: { start: dateRange.start, end: dateRange.end },
        restaurant_id: restaurantId,
        rider: rider ? { name: rider.name, id: rider.id, role: rider.role } : { name: 'All Riders' },
        summary: {
            total_orders: summary.total_orders,
            total_revenue: Number(summary.total_revenue),
            pending_revenue: Number(summary.pending_revenue),
            failed_orders: summary.failed_orders
        },
        orders: orderList
    };
}
