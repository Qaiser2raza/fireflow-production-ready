import { prisma } from '../lib/prisma';

/**
 * Shared utility to resolve business dates to UTC ranges based on the restaurant's timezone.
 * Resolves local dates correctly to avoid data "bleeding" across business days.
 * 
 * @param restaurantId UUID of the restaurant to determine the timezone
 * @param businessDate Local business date string (e.g. 'YYYY-MM-DD')
 * @returns An object containing start and end Date objects in UTC representation
 */
export async function toUTCRange(restaurantId: string, businessDate: string): Promise<{ start: Date; end: Date }> {
    const restaurant = await prisma.restaurants.findUnique({
        where: { id: restaurantId },
        select: { timezone: true }
    });
    
    // Fallback to Pakistan time if timezone is not configured
    const tz = restaurant?.timezone || 'Asia/Karachi';

    const toUTC = (localStr: string, timeZone: string, endOfDay = false) => {
        // Create a fake local time string at midnight or EOD
        const d = new Date(localStr + (endOfDay ? 'T23:59:59.999' : 'T00:00:00'));
        const localeStr = d.toLocaleString('en-US', { timeZone });
        const diff = d.getTime() - new Date(localeStr).getTime();
        return new Date(d.getTime() + diff);
    };

    return {
        start: toUTC(businessDate, tz, false),
        end:   toUTC(businessDate, tz, true),
    };
}
