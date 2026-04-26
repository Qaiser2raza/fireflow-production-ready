import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function run() {
  const lines = await p.journal_entry_lines.findMany({
    where: {
      chart_of_accounts: { code: { in: ['2010', '4030', '1040'] } }
    },
    include: {
      chart_of_accounts: { select: { code: true, name: true } },
      journal_entries: { select: { 
        reference_type: true, 
        reference_id: true,
        description: true,
        created_at: true 
      }}
    },
    orderBy: { journal_entries: { created_at: 'asc' } }
  });
  console.log(JSON.stringify(lines.map(l => ({
    account: l.chart_of_accounts?.code,
    debit: l.debit,
    credit: l.credit,
    ref_type: l.journal_entries?.reference_type,
    description: l.journal_entries?.description,
    created_at: l.journal_entries?.created_at
  })), null, 2));
}
run().finally(() => p.$disconnect());
