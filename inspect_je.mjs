import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function inspect() {
    try {
        const count = await prisma.chart_of_accounts.count({
            where: { restaurant_id: 'b1972d7d-8374-4b55-9580-95a15f18f656' }
        });
        
        console.log("CHART OF ACCOUNTS COUNT: " + count);

        const order = await prisma.orders.findUnique({
            where: { id: 'd4bbd674-b6de-402e-84b4-dd43ae4453cf' },
            include: { transactions: true }
        });
        
        console.log("TRANSACTIONS:");
        console.log(JSON.stringify(order.transactions, null, 2));

    } catch(e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

inspect();
