import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function run() {
  const lastSession = await p.cashier_sessions.findFirst({
    where: { 
      restaurant_id: 'b1972d7d-8374-4b55-9580-95a15f18f656',
      status: 'CLOSED' 
    },
    orderBy: { closed_at: 'desc' }
  });
  console.log('Last session:', JSON.stringify(lastSession, null, 2));

  if (lastSession) {
    const jes = await p.journal_entries.findMany({
      where: {
        reference_type: { in: ['SESSION_OPEN', 'CASHIER_SESSION'] }
      },
      include: {
        journal_entry_lines: true
      }
    });
    console.log('All session journal entries with lines:', JSON.stringify(jes, null, 2));
  }
}
run().finally(() => p.$disconnect());
