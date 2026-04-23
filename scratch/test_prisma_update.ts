import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const sessionId = 'ca981407-fdb9-49d1-8228-083bb250916c';
  const id = '264c6d0d-7162-45ef-badd-ba9535fb4804'; // the DINE_IN order from 10:28
  
  const updatedOrder = await prisma.orders.update({
      where: { id },
      data: {
          session_id: sessionId || undefined,
      }
  });
  console.log("Updated order session:", updatedOrder.session_id);
}
main().finally(() => prisma.$disconnect());
