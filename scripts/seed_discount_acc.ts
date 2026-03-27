import { prisma } from '../src/shared/lib/prisma';

async function main() {
    const restaurantId = 'b1972d7d-8374-4b55-9580-95a15f18f656';
    const acc = {
        code: '5020',
        name: 'Discounts Given',
        type: 'EXPENSE' as const,
        description: 'Discounts applied to customer bills (recorded as expense/contra-revenue)',
        restaurant_id: restaurantId,
        is_active: true,
        is_system: true
    };

    const existing = await prisma.chart_of_accounts.findFirst({
        where: { restaurant_id: restaurantId, code: '5020' }
    });

    if (!existing) {
        await prisma.chart_of_accounts.create({ data: acc });
        console.log('Discount account (5020) created for restaurant:', restaurantId);
    } else {
        console.log('Discount account (5020) already exists.');
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
