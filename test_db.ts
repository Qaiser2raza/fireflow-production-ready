import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
    try {
        console.log('Testing DB connection...');
        const result = await prisma.$queryRaw`SELECT 1`;
        console.log('Success:', result);
    } catch (err) {
        console.error('DB Connection Failed:', err);
    } finally {
        await prisma.$disconnect();
    }
}

test();
