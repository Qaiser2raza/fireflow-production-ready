import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const restaurant = await prisma.restaurants.findFirst();
    if (!restaurant) return;
    
    // mimic /api/restaurants/config endpoint
    const config = await prisma.operations_config.findFirst({
        where: { restaurant_id: restaurant.id }
    });
    
    // Try to get order_type_defaults via relation if that's what the API does
    const defaults = await prisma.order_type_defaults.findMany({
        where: { restaurant_id: restaurant.id }
    });
    
    console.log('=== OPERATIONS CONFIG IN DB ===');
    console.log(JSON.stringify(config, null, 2));
    console.log('=== DEFAULTS ===');
    console.log(JSON.stringify(defaults, null, 2));

}

main().catch(console.error).finally(() => prisma.$disconnect());
