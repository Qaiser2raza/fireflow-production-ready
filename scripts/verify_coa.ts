import { prisma } from '../src/shared/lib/prisma';

async function main() {
    const restaurantId = 'b1972d7d-8374-4b55-9580-95a15f18f656';
    const accounts = await prisma.chart_of_accounts.findMany({
        where: { restaurant_id: restaurantId }
    });
    console.log('COA for restaurant:', restaurantId);
    console.table(accounts.map(a => ({ id: a.id, code: a.code, name: a.name })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
