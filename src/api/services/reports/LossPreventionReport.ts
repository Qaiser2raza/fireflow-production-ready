import { prisma } from '../../../shared/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

interface DateRange {
    start: Date;
    end: Date;
}

/**
 * Loss Prevention Report — voids, cancellations, and suspicious patterns.
 * Critical for detecting cash theft and operational leakage.
 */
export async function getLossPreventionReport(restaurantId: string, dateRange: DateRange) {
    // Fetch voided + cancelled orders with staff lookup
    const [voidedOrders, cancelledOrders, totalClosed] = await Promise.all([
        prisma.orders.findMany({
            where: {
                restaurant_id: restaurantId,
                status: 'VOIDED',
                created_at: { gte: dateRange.start, lte: dateRange.end }
            },
            select: {
                id: true, total: true, type: true, order_number: true,
                voided_at: true, voided_by: true, void_reason: true, void_notes: true,
                created_at: true
            }
        }),
        prisma.orders.findMany({
            where: {
                restaurant_id: restaurantId,
                status: 'CANCELLED',
                created_at: { gte: dateRange.start, lte: dateRange.end }
            },
            select: {
                id: true, total: true, type: true, order_number: true,
                cancelled_at: true, cancelled_by: true, cancellation_reason: true, cancellation_notes: true,
                created_at: true
            }
        }),
        prisma.orders.count({
            where: {
                restaurant_id: restaurantId,
                status: 'CLOSED',
                created_at: { gte: dateRange.start, lte: dateRange.end }
            }
        })
    ]);

    // Get all staff to resolve names
    const allStaff = await prisma.staff.findMany({
        where: { restaurant_id: restaurantId },
        select: { id: true, name: true, role: true }
    });
    const staffMap = Object.fromEntries(allStaff.map(s => [s.id, s]));

    // --- Void Analysis ---
    const voidValue = voidedOrders.reduce((s, o) => s.plus(new Decimal(o.total.toString())), new Decimal(0));
    const voidsByStaff: Record<string, { name: string; role: string; count: number; value: number }> = {};
    const voidReasons: Record<string, number> = {};
    const voidsByHour: Record<number, number> = {};

    voidedOrders.forEach((o: any) => {
        // By staff
        const staffId = o.voided_by || 'unknown';
        const staff = staffMap[staffId] || { name: 'Unknown', role: 'N/A' };
        if (!voidsByStaff[staffId]) voidsByStaff[staffId] = { name: staff.name, role: staff.role, count: 0, value: 0 };
        voidsByStaff[staffId].count += 1;
        voidsByStaff[staffId].value += Number(o.total);

        // By reason
        const reason = o.void_reason || 'Unspecified';
        voidReasons[reason] = (voidReasons[reason] || 0) + 1;

        // By hour (to detect patterns)
        const hour = o.voided_at ? new Date(o.voided_at).getHours() : new Date(o.created_at).getHours();
        voidsByHour[hour] = (voidsByHour[hour] || 0) + 1;
    });

    // --- Cancellation Analysis ---
    const cancelValue = cancelledOrders.reduce((s, o) => s.plus(new Decimal(o.total.toString())), new Decimal(0));
    const cancelsByStaff: Record<string, { name: string; role: string; count: number; value: number }> = {};
    const cancelReasons: Record<string, number> = {};

    cancelledOrders.forEach((o: any) => {
        const staffId = o.cancelled_by || 'unknown';
        const staff = staffMap[staffId] || { name: 'Unknown', role: 'N/A' };
        if (!cancelsByStaff[staffId]) cancelsByStaff[staffId] = { name: staff.name, role: staff.role, count: 0, value: 0 };
        cancelsByStaff[staffId].count += 1;
        cancelsByStaff[staffId].value += Number(o.total);

        const reason = o.cancellation_reason || 'Unspecified';
        cancelReasons[reason] = (cancelReasons[reason] || 0) + 1;
    });

    // --- Totals & Rates ---
    const totalOrders = totalClosed + voidedOrders.length + cancelledOrders.length;
    const totalExceptions = voidedOrders.length + cancelledOrders.length;
    const exceptionRate = totalOrders > 0 ? Math.round((totalExceptions / totalOrders) * 10000) / 100 : 0;
    const totalLostValue = voidValue.plus(cancelValue);

    // --- Suspicious patterns ---
    const alerts: string[] = [];

    // Flag: Staff with >3 voids
    Object.values(voidsByStaff).forEach(s => {
        if (s.count >= 3) alerts.push(`${s.name} (${s.role}) voided ${s.count} orders worth Rs. ${Math.round(s.value).toLocaleString()}`);
    });

    // Flag: Exception rate > 5%
    if (exceptionRate > 5) alerts.push(`Exception rate ${exceptionRate}% exceeds industry threshold (5%)`);

    // Flag: Voids clustered at end of day (after 10PM)
    const lateVoids = Object.entries(voidsByHour).filter(([h]) => Number(h) >= 22).reduce((s, [, c]) => s + c, 0);
    if (lateVoids >= 3) alerts.push(`${lateVoids} voids occurred after 10 PM — review for suspicious activity`);

    return {
        period: { start: dateRange.start, end: dateRange.end },
        summary: {
            total_orders: totalOrders,
            closed_orders: totalClosed,
            voided_count: voidedOrders.length,
            voided_value: voidValue,
            cancelled_count: cancelledOrders.length,
            cancelled_value: cancelValue,
            total_lost_value: totalLostValue,
            exception_rate: exceptionRate,
        },
        voids: {
            by_staff: Object.values(voidsByStaff).sort((a, b) => b.value - a.value),
            by_reason: voidReasons,
            by_hour: voidsByHour,
        },
        cancellations: {
            by_staff: Object.values(cancelsByStaff).sort((a, b) => b.value - a.value),
            by_reason: cancelReasons,
        },
        alerts,
        // Recent void details (limited to 20 for UI)
        recent_voids: voidedOrders.slice(0, 20).map(o => ({
            order_number: o.order_number,
            total: Number(o.total),
            type: o.type,
            reason: o.void_reason,
            staff: staffMap[o.voided_by || '']?.name || 'Unknown',
            voided_at: o.voided_at
        })),
        recent_cancellations: cancelledOrders.slice(0, 20).map(o => ({
            order_number: o.order_number,
            total: Number(o.total),
            type: o.type,
            reason: o.cancellation_reason,
            staff: staffMap[o.cancelled_by || '']?.name || 'Unknown',
            cancelled_at: o.cancelled_at
        }))
    };
}
