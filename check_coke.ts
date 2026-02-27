
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const items = await prisma.menu_items.findMany({
        where: {
            name: {
                contains: 'Coke',
                mode: 'insensitive'
            }
        },
        include: {
            stations: true // Include station details
        }
    });

    console.log('Found Items:', JSON.stringify(items, null, 2));
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
