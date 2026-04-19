import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function wipeTransactionalData() {
  console.log("Starting transactional data wipe on LOCAL database...");

  try {
    // Delete in reverse order of dependencies
    await prisma.transactions.deleteMany();
    await prisma.order_items.deleteMany();
    await prisma.dine_in_orders.deleteMany();
    await prisma.takeaway_orders.deleteMany();
    await prisma.delivery_orders.deleteMany();
    await prisma.reservation_orders.deleteMany();
    await prisma.order_intelligence.deleteMany();
    await prisma.orders.deleteMany();
    
    await prisma.cashier_shift_logs.deleteMany();
    await prisma.cashier_sessions.deleteMany();

    await prisma.ledger_entries.deleteMany();
    
    await prisma.rider_settlements.deleteMany();
    await prisma.rider_shifts.deleteMany();

    console.log("✅ Successfully wiped all ghost orders and sessions from 127.0.0.1 local instance.");
  } catch (err) {
    console.error("Error wiping data:", err);
  } finally {
    await prisma.$disconnect();
  }
}

wipeTransactionalData();
