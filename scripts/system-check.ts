import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runCheck(name: string, query: string) {
    console.log(`\n--- ${name} ---`);
    try {
        const result: any[] = await prisma.$queryRawUnsafe(query);
        if (result.length === 0) {
            console.log('No results found.');
        } else {
            result.forEach(row => {
                console.log(Object.values(row)[0]);
            });
        }
    } catch (error: any) {
        console.error(`Error running ${name}:`, error.message);
    }
}

async function main() {
    console.log('STARTING DATABASE CHECKS...');

    // CHECK 1
    await runCheck('CHECK 1 (order_items columns)', `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'order_items' 
        ORDER BY column_name;
    `);

    // CHECK 2
    await runCheck('CHECK 2 (audit_logs columns)', `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'audit_logs' 
        ORDER BY column_name;
    `);

    // CHECK 3
    await runCheck('CHECK 3 (public tables)', `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
    `);

    console.log('\nCHECKS COMPLETED.');
}

main()
    .catch((e) => {
        console.error('Check script failed:', e);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
