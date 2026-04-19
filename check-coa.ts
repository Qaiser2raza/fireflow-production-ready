import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const accounts = await p.chart_of_accounts.findMany({
  where: { restaurant_id: 'b1972d7d-8374-4b55-9580-95a15f18f656' },
  orderBy: { code: 'asc' },
  select: { code: true, name: true, type: true, is_system: true }
});
console.log('Total:', accounts.length);
accounts.forEach(a => console.log(a.code, '|', a.type, '|', a.name));
await p.$disconnect();
