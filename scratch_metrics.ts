import { PrismaClient } from '@prisma/client';
import { AccountingService } from './src/api/services/AccountingService.ts';

const prisma = new PrismaClient();
const accounting = new AccountingService();

async function main() {
    const metrics = await accounting.getSessionMetrics('b1972d7d-8374-4b55-9580-95a15f18f656', '2026-04-24');
    console.log(JSON.stringify(metrics.metrics, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
