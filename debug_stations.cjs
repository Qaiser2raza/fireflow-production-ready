
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const items = await prisma.menu_items.findMany({
        include: { stations: true }
    });

    console.log('Total items:', items.length);
    const mismatches = items.filter(i => {
        if (!i.stations) return false;
        return i.station !== i.stations.name;
    });

    console.log('Mismatches found:', mismatches.length);
    mismatches.slice(0, 10).forEach(i => {
        console.log(`Item: ${i.name} | Station String: ${i.station} | Station Obj Name: ${i.stations.name}`);
    });

    const itemsWithNoId = items.filter(i => !i.station_id);
    console.log('Items with no station_id:', itemsWithNoId.length);

    process.exit(0);
}

main();
