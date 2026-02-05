
import { prisma } from '../../shared/lib/prisma';

interface DateRange {
    start: Date;
    end: Date;
}

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
        // Simple frequency map for most common tables
        most_common_tables: overCapacityLogs.reduce((acc: Record<string, number>, log) => {
            const tableName = (log.details as any)?.table_name || 'Unknown';
            acc[tableName] = (acc[tableName] || 0) + 1;
            return acc;
        }, {})
    };

    return { stats, logs: overCapacityLogs };
}
