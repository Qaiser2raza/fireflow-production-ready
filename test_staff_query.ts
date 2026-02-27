import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
    try {
        console.log('Testing staff query...');
        const staff = await prisma.staff.findMany({
            include: {
                rider_shifts: {
                    where: { status: 'OPEN' },
                    take: 1
                }
            }
        });
        console.log('Success! Found staff count:', staff.length);
        if (staff.length > 0) {
            console.log('First staff rider_shifts:', staff[0].rider_shifts);
        }
    } catch (e: any) {
        console.error('FAILED query:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}

test();
