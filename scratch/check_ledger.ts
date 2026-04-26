import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();
const p = new PrismaClient();
async function run() {
  const entries = await p.ledger_entries.findMany({
    where: { 
      restaurant_id: 'b1972d7d-8374-4b55-9580-95a15f18f656'
    },
    select: {
      transaction_type: true,
      amount: true,
      reference_type: true,
      description: true,
      account_id: true,
      created_at: true
    },
    orderBy: { created_at: 'asc' }
  });
  console.log(JSON.stringify(entries, null, 2));
}
run().finally(() => p.$disconnect());
