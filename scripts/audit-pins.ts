
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- STAFF PIN AUDIT ---');
    const pins = ['555', '5555'];
    
    for (const pin of pins) {
        const staffList = await prisma.staff.findMany({
            where: { pin },
            include: { restaurants: true }
        });
        
        console.log(`\nPIN: ${pin} (${staffList.length} matches)`);
        staffList.forEach(s => {
            console.log(`- Staff: ${s.name} (${s.id})`);
            console.log(`  Restaurant: ${s.restaurants?.name} (${s.restaurants?.id})`);
            console.log(`  Role: ${s.role}`);
        });
    }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
