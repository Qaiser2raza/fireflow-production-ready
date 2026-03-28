import { prisma } from '../../../shared/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

interface DateRange {
    start: Date;
    end: Date;
}

/**
 * Tax Liability Report — critical for FBR compliance.
 * Returns: tax collected (exclusive), tax included (inclusive), exempt orders,
 *          FBR sync status, and a printable summary for auditors.
 */
export async function getTaxLiabilityReport(restaurantId: string, dateRange: DateRange) {
    // Fetch all closed orders in the period
    const orders = await prisma.orders.findMany({
        where: {
            restaurant_id: restaurantId,
            status: 'CLOSED',
            created_at: { gte: dateRange.start, lte: dateRange.end }
        }
    }) as any[];

    // Accumulators
    let totalTaxCollected = new Decimal(0);
    let taxExclusiveTotal = new Decimal(0);
    let taxInclusiveTotal = new Decimal(0);
    let exemptTotal = new Decimal(0);
    let taxableRevenue = new Decimal(0);
    let nonTaxableRevenue = new Decimal(0);
    let exemptOrderCount = 0;
    let exclusiveOrderCount = 0;
    let inclusiveOrderCount = 0;

    const fbrStatus: Record<string, number> = {
        SYNCED: 0,
        PENDING: 0,
        FAILED: 0,
        NOT_APPLICABLE: 0
    };

    const taxByType: Record<string, number> = {};

    orders.forEach((order: any) => {
        const tax = Number(order.tax || 0);
        const total = Number(order.total);
        const breakdown = order.breakdown as any;

        // Determine tax mode from breakdown metadata
        const taxType = breakdown?.tax_type || 'EXCLUSIVE';
        const isExempt = breakdown?.is_tax_exempt === true;

        if (isExempt) {
            exemptOrderCount++;
            exemptTotal = exemptTotal.plus(new Decimal(total.toString()));
            nonTaxableRevenue = nonTaxableRevenue.plus(new Decimal(total.toString()));
        } else {
            totalTaxCollected = totalTaxCollected.plus(new Decimal(tax.toString()));
            taxableRevenue = taxableRevenue.plus(new Decimal(total.toString()));

            if (taxType === 'INCLUSIVE') {
                inclusiveOrderCount++;
                taxInclusiveTotal = taxInclusiveTotal.plus(new Decimal(tax.toString()));
            } else {
                exclusiveOrderCount++;
                taxExclusiveTotal = taxExclusiveTotal.plus(new Decimal(tax.toString()));
            }
        }

        // Tax by order type
        if (!taxByType[order.type]) taxByType[order.type] = 0;
        taxByType[order.type] += tax;

        // FBR sync status
        const syncStatus = order.fbr_sync_status || 'NOT_APPLICABLE';
        fbrStatus[syncStatus] = (fbrStatus[syncStatus] || 0) + 1;
    });

    // Restaurant info for FBR header
    const restaurant = await prisma.restaurants.findUnique({
        where: { id: restaurantId }
    }) as any;

    // Effective tax rate
    const effectiveTaxRate = Number(taxableRevenue) > 0
        ? Math.round((Number(totalTaxCollected) / Number(taxableRevenue)) * 10000) / 100
        : 0;


    return {
        period: { start: dateRange.start, end: dateRange.end },
        restaurant: {
            name: restaurant?.name,
            ntn: restaurant?.fbr_ntn,
            fbr_pos_id: restaurant?.fbr_pos_id,
            fbr_enabled: restaurant?.fbr_enabled,
            configured_tax_rate: Number(restaurant?.tax_rate || 0),
        },
        summary: {
            total_tax_collected: Math.round(Number(totalTaxCollected) * 100) / 100,
            tax_exclusive: Math.round(Number(taxExclusiveTotal) * 100) / 100,
            tax_inclusive: Math.round(Number(taxInclusiveTotal) * 100) / 100,
            exempt_total: Math.round(Number(exemptTotal) * 100) / 100,
            tax_exempt_revenue: Math.round(Number(exemptTotal) * 100) / 100,
            taxable_revenue: Math.round(Number(taxableRevenue) * 100) / 100,
            non_taxable_revenue: Math.round(Number(nonTaxableRevenue) * 100) / 100,
            effective_tax_rate: effectiveTaxRate,
            total_orders: orders.length,
            exclusive_order_count: exclusiveOrderCount,
            inclusive_order_count: inclusiveOrderCount,
            exempt_order_count: exemptOrderCount,
        },
        tax_by_order_type: taxByType,
        fbr_sync_status: fbrStatus,
        fbr_compliance_rate: orders.length > 0
            ? Math.round((fbrStatus.SYNCED / orders.length) * 100)
            : 0,
    };
}
