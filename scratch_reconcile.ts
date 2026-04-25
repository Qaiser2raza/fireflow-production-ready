import { PrismaClient } from '@prisma/client';
import { CashierSessionService } from './src/api/services/finance/CashierSessionService.ts';

const prisma = new PrismaClient();

async function main() {
    const summary = await CashierSessionService.getSessionSummary('3023af46-0d86-4e1a-b478-913e01c49860');
    console.log(JSON.stringify(summary.calculatedSummary, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
