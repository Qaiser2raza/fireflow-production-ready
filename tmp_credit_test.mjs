import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const p = new PrismaClient();

const RESTAURANT_ID = 'b1972d7d-8374-4b55-9580-95a15f18f656';
const CUSTOMER_ID   = '56fe8a88-d169-48b7-bcb7-d769a2a17275'; // Qaiser Raza

// Enable credit with a generous limit
await p.customers.update({
  where: { id: CUSTOMER_ID },
  data: { credit_enabled: true }
});
console.log('✓ Credit enabled for Qaiser Raza');

// Check customer ledger balance
const ledger = await p.customer_ledgers.findMany({
  where: { restaurant_id: RESTAURANT_ID, customer_id: CUSTOMER_ID },
  orderBy: { created_at: 'desc' }, take: 3,
  select: { entry_type: true, amount: true, balance_after: true, description: true }
});
console.log('Customer ledger entries:', JSON.stringify(ledger, null, 2));

await p.$disconnect();
