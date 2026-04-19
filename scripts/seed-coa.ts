import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const RESTAURANT_ID = 'b1972d7d-8374-4b55-9580-95a15f18f656';

const ACCOUNTS = [
  // ASSETS
  { code: '1000', name: 'Cash', type: 'ASSET', is_system: true },
  { code: '1010', name: 'Card Receivable', type: 'ASSET', is_system: true },
  { code: '1020', name: 'Rider Receivable', type: 'ASSET', is_system: true },
  { code: '1040', name: 'Customer AR', type: 'ASSET', is_system: true },
  { code: '1060', name: 'Inventory Asset', type: 'ASSET', is_system: true },
  // LIABILITIES
  { code: '2000', name: 'Tax Payable', type: 'LIABILITY', is_system: true },
  { code: '2010', name: 'Service Charge Payable', type: 'LIABILITY', is_system: true },
  { code: '2020', name: 'Supplier Payable', type: 'LIABILITY', is_system: true },
  // REVENUE
  { code: '4000', name: 'Food & Beverage Revenue', type: 'REVENUE', is_system: true },
  { code: '4010', name: 'Delivery Fee Revenue', type: 'REVENUE', is_system: true },
  { code: '4020', name: 'Rounding Differences', type: 'REVENUE', is_system: true },
  // EXPENSES
  { code: '4900', name: 'Discount Expense', type: 'EXPENSE', is_system: true },
  { code: '5000', name: 'Rider Expense', type: 'EXPENSE', is_system: true },
  { code: '5010', name: 'General Expense', type: 'EXPENSE', is_system: true },
  { code: '5020', name: 'Cost of Goods Sold', type: 'EXPENSE', is_system: true },
];

async function main() {
  console.log(`Seeding COA for restaurant ${RESTAURANT_ID}...`);
  
  for (const acc of ACCOUNTS) {
    await prisma.chart_of_accounts.upsert({
      where: { 
        restaurant_id_code: { 
          restaurant_id: RESTAURANT_ID, 
          code: acc.code 
        }
      },
      update: { name: acc.name, type: acc.type, is_system: acc.is_system },
      create: { restaurant_id: RESTAURANT_ID, ...acc }
    });
    console.log(`Upserted [${acc.code}] ${acc.name}`);
  }

  const count = await prisma.chart_of_accounts.count({
    where: { restaurant_id: RESTAURANT_ID }
  });
  console.log(`\nCompleted! Total COA count: ${count}`);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
