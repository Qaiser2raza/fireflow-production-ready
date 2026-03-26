import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  console.log('--- COA Accounts ---');
  const accounts = await p.chart_of_accounts.findMany({ select: { code: true, name: true } });
  accounts.forEach(a => console.log(a.code, a.name));

  console.log('\n--- Restaurant Features ---');
  const feature = await p.restaurant_features.findFirst();
  console.log(JSON.stringify(feature?.features, null, 2));

  await p.$disconnect();
}
main();
