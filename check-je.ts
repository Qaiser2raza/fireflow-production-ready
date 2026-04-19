
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function main() {
    console.log('--- JOURNAL ENTRY VERIFICATION SCRIPT ---');
    
    // Find the latest order sale journal
    const latestJE = await prisma.journal_entries.findFirst({
        where: { reference_type: 'ORDER_SALE' },
        orderBy: { date: 'desc' },
        include: { journal_entry_lines: true }
    });

    if (!latestJE) {
        console.log('No ORDER_SALE journal entries found.');
        return;
    }

    console.log(`Checking Journal Entry: ${latestJE.id}`);
    console.log(`Reference: ${latestJE.reference_type} / ${latestJE.reference_id}`);
    console.log(`Description: ${latestJE.description}`);
    console.log(`Date: ${latestJE.date}`);
    console.log('------------------------------------------');

    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);

    console.log('LINES:');
    for (const line of latestJE.journal_entry_lines) {
        const dr = new Decimal(line.debit.toString());
        const cr = new Decimal(line.credit.toString());
        totalDebit = totalDebit.plus(dr);
        totalCredit = totalCredit.plus(cr);
        
        console.log(`  - Account: ${line.account_id} | DR: ${dr.toFixed(2)} | CR: ${cr.toFixed(2)} | ${line.description}`);
    }

    console.log('------------------------------------------');
    console.log(`TOTAL DEBIT:  ${totalDebit.toFixed(2)}`);
    console.log(`TOTAL CREDIT: ${totalCredit.toFixed(2)}`);
    console.log(`DIFFERENCE:   ${totalDebit.minus(totalCredit).toFixed(2)}`);

    if (totalDebit.equals(totalCredit)) {
        console.log('✅ VERDICT: JOURNAL IS BALANCED');
    } else {
        const diff = totalDebit.minus(totalCredit);
        if (diff.abs().lte(10)) {
            console.log('⚠️ VERDICT: IMBALANCED BUT WITHIN ROUNDING TOLERANCE (10 PKR)');
        } else {
            console.log('❌ VERDICT: JOURNAL IS IMBALANCED');
        }
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
