import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fix() {
    const r = await prisma.restaurants.findFirst({ select: { id: true, name: true } });
    if (!r) { console.error('No restaurant found'); process.exit(1); }

    const updated = await prisma.chart_of_accounts.update({
        where: { restaurant_id_code: { restaurant_id: r.id, code: '1030' } },
        data: { name: 'Advance Deposits (Customer)', type: 'LIABILITY' }
    });

    console.log('Fixed account 1030:');
    console.log(`  name: ${updated.name}`);
    console.log(`  type: ${updated.type}`);
    await prisma.$disconnect();
}

fix().catch(e => { console.error(e); process.exit(1); });