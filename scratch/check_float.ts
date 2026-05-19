import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function run() {
  const restaurantId = 'b1972d7d-8374-4b55-9580-95a15f18f656';
  
  const cashAccount = await p.chart_of_accounts.findFirst({
    where: { restaurant_id: restaurantId, code: '1000' },
    select: { id: true }
  });
  
  if (!cashAccount) { console.log('No cash account'); return; }
  
  const lines = await p.journal_entry_lines.findMany({
    where: { account_id: cashAccount.id },
    select: {
      debit: true,
      credit: true,
      reference_type: true,
      description: true,
      journal_entries: {
        select: {
          created_at: true
        }
      }
    }
  });

  // Sort by journal_entries.created_at in JS
  lines.sort((a, b) => {
    const timeA = new Date(a.journal_entries?.created_at || 0).getTime();
    const timeB = new Date(b.journal_entries?.created_at || 0).getTime();
    return timeA - timeB;
  });
  
  let balance = 0;
  lines.forEach(l => {
    const dr = Number(l.debit || 0);
    const cr = Number(l.credit || 0);
    balance += dr - cr;
    console.log({
      ref_type: l.reference_type,
      description: l.description,
      debit: dr,
      credit: cr,
      running_balance: balance,
      created_at: l.journal_entries?.created_at
    });
  });
  
  console.log('FINAL GL CASH BALANCE:', balance);
  
  const result = await p.journal_entry_lines.aggregate({
    where: { account_id: cashAccount.id },
    _sum: { debit: true, credit: true }
  });
  console.log('AGGREGATE:', {
    totalDebit: Number(result._sum.debit || 0),
    totalCredit: Number(result._sum.credit || 0),
    net: Number(result._sum.debit || 0) - Number(result._sum.credit || 0)
  });
}
run().finally(() => p.$disconnect());
