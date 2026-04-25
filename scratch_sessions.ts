import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("=== SESSIONS ===");
    const sessions = await prisma.$queryRaw`
        SELECT * FROM cashier_sessions
        WHERE restaurant_id = 'b1972d7d-8374-4b55-9580-95a15f18f656'
        AND DATE(opened_at) = CURRENT_DATE;
    `;
    console.log(JSON.stringify(sessions, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
