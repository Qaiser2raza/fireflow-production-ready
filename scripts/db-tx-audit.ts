import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const tx = await prisma.transactions.findFirst({});
    console.log(`TX amount: ${tx?.amount}, created_at: ${tx?.created_at.toISOString()}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
