import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const todayStartLocal = new Date();
    todayStartLocal.setHours(0, 0, 0, 0);

    const orders = await prisma.orders.findMany({
        where: {
            // we will fetch all today to see what their statuses are
        }
    });

    const txs = await prisma.transactions.findMany({});

    console.log(`Total Orders: ${orders.length}`);
    console.log(`Total Transactions: ${txs.length}`);

    let salesAgg = 0;
    txs.forEach(t => salesAgg += Number(t.amount));

    console.log(`Sales Agg (All TX) = ${salesAgg}`);

    const tzMap = new Map();
    orders.forEach(o => {
        const d = o.created_at;
        const key = `${o.status} | ${o.payment_status} | ${d.toISOString()}`;
        console.log(`Order ${o.id.slice(0,8)}: ${key} -> Total: ${o.total}, Tax: ${o.tax}, Service: ${o.service_charge}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
