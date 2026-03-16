
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const restaurants = await prisma.restaurants.findMany({
        include: { staff: true }
    });
    
    console.log('--- RESTAURANT & STAFF AUDIT ---');
    restaurants.forEach(r => {
        console.log(`\nRestaurant: ${r.name} (${r.id})`);
        if (r.staff.length === 0) {
            console.log('  (No staff)');
        }
        r.staff.forEach(s => {
            console.log(`  - Staff: ${s.name} (PIN: ${s.pin}, Role: ${s.role})`);
        });
    });
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
