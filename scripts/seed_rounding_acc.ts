import { prisma } from '../src/shared/lib/prisma';

async function main() {
    const restaurantId = 'b1972d7d-8374-4b55-9580-95a15f18f656';
    const acc = {
        code: '4020',
        name: 'Rounding Differences',
        type: 'REVENUE' as const,
        description: 'Small gains/losses from decimal rounding',
        restaurant_id: restaurantId,
        is_active: true,
        is_system: true
    };

    const existing = await prisma.chart_of_accounts.findFirst({
        where: { restaurant_id: restaurantId, code: '4020' }
    });

    if (!existing) {
        await prisma.chart_of_accounts.create({ data: acc });
        console.log('Rounding account (4020) created for restaurant:', restaurantId);
    } else {
        console.log('Rounding account (4020) already exists.');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
