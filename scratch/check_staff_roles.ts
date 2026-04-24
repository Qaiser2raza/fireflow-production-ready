import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkStaffRoles() {
    const restaurantId = 'b1972d7d-8374-4b55-9580-95a15f18f656';

    console.log(`--- STAFF LIST FOR RESTAURANT: ${restaurantId} ---`);
    const staff = await prisma.$queryRaw`
        SELECT id, name, role, status 
        FROM staff 
        WHERE restaurant_id = ${restaurantId}::uuid
        ORDER BY created_at ASC
    `;
    console.table(staff);

    await prisma.$disconnect();
}

checkStaffRoles().catch(err => {
    console.error(err);
    process.exit(1);
});
