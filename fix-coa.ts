import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const deleted = await p.chart_of_accounts.deleteMany({
  where: { 
    restaurant_id: 'b1972d7d-8374-4b55-9580-95a15f18f656',
    code: '5030'
  }
});
console.log('Deleted:', deleted.count, 'accounts');
await p.$disconnect();
