import { prisma } from '../src/shared/lib/prisma';

const COA_ACCOUNTS = [
  // ASSETS
  { code: '1000', name: 'Cash & Cash Equivalents',       type: 'ASSET',     description: 'Physical cash in drawer' },
  { code: '1010', name: 'Card / Digital Receivables',    type: 'ASSET',     description: 'JazzCash, EasyPaisa, card payments' },
  { code: '1020', name: 'Rider Receivables',             type: 'ASSET',     description: 'Cash held by delivery riders' },
  { code: '1040', name: 'Customer Account',              type: 'ASSET',     description: 'Customer khata — positive = owes us, negative = advance held' },
  { code: '1050', name: 'Inventory Asset',               type: 'ASSET',     description: 'Value of stock on hand', is_system: true },

  // LIABILITIES
  { code: '1030', name: 'Advance Deposits (Customer)',   type: 'LIABILITY', description: 'Customer prepaid deposits — restaurant owes goods/service', is_system: true },
  { code: '2000', name: 'Tax Payable',                   type: 'LIABILITY', description: 'FBR GST collected, not yet remitted' },
  { code: '2010', name: 'Service Charge Payable',        type: 'LIABILITY', description: 'Service charge collected from customers' },
  { code: '2020', name: 'Supplier Payables',             type: 'LIABILITY', description: 'Amounts owed to suppliers on credit' },

  // EQUITY
  { code: '3000', name: "Owner's Equity",                type: 'EQUITY',    description: 'Opening capital and retained earnings', is_system: true },

  // REVENUE
  { code: '4000', name: 'Food & Beverage Revenue',       type: 'REVENUE',   description: 'Dine-in, takeaway, and delivery food sales' },
  { code: '4010', name: 'Delivery Fee Revenue',          type: 'REVENUE',   description: 'Delivery charges collected from customers' },
  { code: '4020', name: 'Rounding Differences',          type: 'REVENUE',   description: 'Small gains/losses from decimal rounding' },

  // EXPENSES
  { code: '4900', name: 'Discount Expense',              type: 'EXPENSE',   description: 'Discounts given to customers — contra-revenue', is_system: true },
  { code: '5000', name: 'Rider Payouts',                 type: 'EXPENSE',    description: 'Cash paid to delivery riders' },
  { code: '5010', name: 'General Expenses',              type: 'EXPENSE',    description: 'Miscellaneous operational expenses' },
  { code: '5020', name: 'Cost of Goods Sold',            type: 'EXPENSE',    description: 'Direct cost of menu items sold', is_system: true },
  { code: '5030', name: 'Salaries & Wages',              type: 'EXPENSE',    description: 'Staff compensation' },
];

async function main() {
  console.log('🏗️  Seeding Chart of Accounts...\n');

  const restaurant = await prisma.restaurants.findFirst({
    select: { id: true, name: true },
  });

  if (!restaurant) {
    console.error('❌ No restaurant found. Ensure the database is seeded first.');
    process.exit(1);
  }

  console.log(`📍 Restaurant: ${restaurant.name} (${restaurant.id})\n`);

  let created = 0;
  let existing = 0;

  for (const account of COA_ACCOUNTS) {
    const result = await prisma.chart_of_accounts.upsert({
      where: {
        restaurant_id_code: {
          restaurant_id: restaurant.id,
          code: account.code,
        },
      },
      create: {
        restaurant_id: restaurant.id,
        code: account.code,
        name: account.name,
        type: account.type as any,
        description: account.description,
        is_active: true,
        is_system: (account as any).is_system || false,
      },
      update: {}, // never overwrite existing accounts
    });

    const wasCreated = new Date(result.created_at).getTime() > Date.now() - 5000;
    if (wasCreated) {
      console.log(`  ✅ Created  ${account.code}  ${account.name}`);
      created++;
    } else {
      console.log(`  ⏭️  Exists   ${account.code}  ${account.name}`);
      existing++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Created:  ${created} accounts`);
  console.log(`   Existing: ${existing} accounts`);
  console.log(`   Total:    ${COA_ACCOUNTS.length} accounts\n`);

  const count = await prisma.chart_of_accounts.count({
    where: { restaurant_id: restaurant.id },
  });
  console.log(`✅ Verification: ${count} total accounts in database for this restaurant`);
}

main()
  .catch(e => { console.error('❌ Seeding failed:', e); process.exit(1); })
  .finally(() => {});
