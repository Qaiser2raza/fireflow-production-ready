import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const RID = 'ead5877d-f633-42e7-810b-87d79e43a79b';
    const journal = await prisma.journal_entries.findFirst({
        where: { restaurant_id: RID, reference_id: 'T08' },
        include: { lines: { include: { chart_of_accounts: true } } }
    });

    if (!journal) {
        console.error('Journal entry T08 not found.');
        return;
    }

    console.log(`--- T08 JOURNAL AUDIT [${journal.id}] ---`);
    journal.lines.forEach(line => {
        const type = line.debit.gt(0) ? 'DR' : 'CR';
        const val = line.debit.gt(0) ? line.debit : line.credit;
        console.log(`${type} | ${line.chart_of_accounts.code.padEnd(5)} | ${line.chart_of_accounts.name.padEnd(25)} | ${val.toString()}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
