import { prisma } from '../src/shared/lib/prisma';

async function main() {
    const restaurantId = 'b1972d7d-8374-4b55-9580-95a15f18f656';
    const rounding = await prisma.chart_of_accounts.findFirst({
        where: { restaurant_id: restaurantId, code: '4020' }
    });
    console.log('ROUNDING_ACC_CHECK:', JSON.stringify(rounding));
}

main().catch(console.error).finally(() => prisma.$disconnect());
