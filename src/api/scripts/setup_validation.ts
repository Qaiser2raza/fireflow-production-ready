import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('--- Discovery Mode: Testing Data ---');

    // 1. Restaurant
    const restaurant = await prisma.restaurants.findFirst();
    if (!restaurant) throw new Error('No restaurant found');
    console.log(`Restaurant Found: ${restaurant.name} (${restaurant.id})`);

    // 2. Staff (Manager/Admin for Void)
    const staff = await prisma.staff.findFirst({
        where: { 
            restaurant_id: restaurant.id,
            role: { in: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] } 
        }
    });
    if (!staff) throw new Error('No Manager/Admin staff found for this restaurant');
    console.log(`Staff Found: ${staff.name} (${staff.id}) - Role: ${staff.role}`);

    // 3. Accounts
    const accountCodes = ['1000', '1010', '1040', '1060', '2020', '2030', '2100', '4000', '4010', '4020', '5000'];
    const accounts = await prisma.chart_of_accounts.findMany({
        where: { 
            restaurant_id: restaurant.id,
            code: { in: accountCodes }
        }
    });

    console.log(`Accounts Found (${accounts.length}/${accountCodes.length}):`);
    accounts.forEach(a => console.log(`  Code: ${a.code} -> ID: ${a.id} (${a.name})`));

    const missing = accountCodes.filter(code => !accounts.find(a => a.code === code));
    if (missing.length > 0) {
        console.warn(`WARNING: Missing accounts: ${missing.join(', ')}`);
    }

    // 4. Test Customer (Khata)
    let customer = await prisma.customers.findFirst({
        where: { restaurant_id: restaurant.id, credit_enabled: true }
    });
    if (!customer) {
        console.log('No Khata customer found. Creating test customer...');
        customer = await prisma.customers.create({
            data: {
                restaurant_id: restaurant.id,
                name: 'TEST KHATA CUSTOMER',
                phone: '0000000000',
                credit_enabled: true,
            }
        });
    }
    console.log(`Customer Found: ${customer.name} (${customer.id})`);

    // 5. Test Supplier
    let supplier = await prisma.suppliers.findFirst({
        where: { restaurant_id: restaurant.id }
    });
    if (!supplier) {
        console.log('No supplier found. Creating test supplier...');
        supplier = await prisma.suppliers.create({
            data: {
                restaurant_id: restaurant.id,
                name: 'TEST VALIDATION SUPPLIER',
                phone: '1111111111'
            }
        });
    }
    console.log(`Supplier Found: ${supplier.name} (${supplier.id})`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
