const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const tablePositions = [
        { name: 'T-01', x: 100, y: 100 },
        { name: 'T-02', x: 300, y: 100 },
        { name: 'T-03', x: 500, y: 100 },
        { name: 'T-04', x: 100, y: 300 },
        { name: 'T-05', x: 300, y: 300 },
    ];

    for (const pos of tablePositions) {
        try {
            await prisma.tables.update({
                where: {
                    restaurant_id_name: {
                        restaurant_id: 'f1f3108a-ef06-49ac-b168-3505bb816236',
                        name: pos.name
                    }
                },
                data: {
                    x_position: pos.x,
                    y_position: pos.y
                }
            });
            console.log(`Updated position for ${pos.name}`);
        } catch (error) {
            console.error(`Failed to update ${pos.name}: ${error.message}`);
        }
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
