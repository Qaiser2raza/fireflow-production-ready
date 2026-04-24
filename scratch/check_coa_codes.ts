import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCOA() {
    const restaurantId = 'b1972d7d-8374-4b55-9580-95a15f18f656';
    const codes = ['1000', '1020'];

    console.log(`Checking COA for Restaurant: ${restaurantId}`);
    
    const accounts = await prisma.chart_of_accounts.findMany({
        where: {
            restaurant_id: restaurantId,
            code: { in: codes }
        }
    });

    if (accounts.length === 0) {
        console.log('❌ No accounts found for these codes.');
    } else {
        accounts.forEach(acc => {
            console.log(`✅ Found: Code ${acc.code} | Name: ${acc.name} | ID: ${acc.id}`);
        });
    }

    await prisma.$disconnect();
}

checkCOA().catch(err => {
    console.error(err);
    process.exit(1);
});
