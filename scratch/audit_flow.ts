import dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import { JournalEntryService } from '../src/api/services/JournalEntryService';

const p = new PrismaClient();
const jes = new JournalEntryService();

const restaurantId = 'b1972d7d-8374-4b55-9580-95a15f18f656';

async function run() {
  console.log('--- STEP 1 — Verify Seed Data ---');

  const restaurantsCount = await p.restaurants.count();
  const staffCount = await p.staff.count();
  const menuItemsCount = await p.menu_items.count();
  const tablesCount = await p.tables.count();
  const coaCount = await p.chart_of_accounts.count();
  const orderTypeDefaultsCount = await p.order_type_defaults.count();

  console.log(`Restaurants count: ${restaurantsCount}`);
  console.log(`Staff count: ${staffCount}`);
  console.log(`Menu Items count: ${menuItemsCount}`);
  console.log(`Tables count: ${tablesCount}`);
  console.log(`Chart of Accounts count: ${coaCount}`);
  console.log(`Order Type Defaults count: ${orderTypeDefaultsCount}`);

  const dineInDefault = await p.order_type_defaults.findUnique({
    where: {
      restaurant_id_order_type: {
        restaurant_id: restaurantId,
        order_type: 'DINE_IN'
      }
    }
  });
  console.log('DINE_IN Defaults:', JSON.stringify(dineInDefault, null, 2));

  console.log('\n--- STEP 2 — Simulate a Dine-In Order Flow ---');

  // Find first available table
  const table = await p.tables.findFirst({
    where: { restaurant_id: restaurantId, status: 'AVAILABLE' }
  });
  if (!table) throw new Error('No available table found');
  console.log(`Selected Table: ${table.name} (ID: ${table.id})`);

  // Find first waiter
  const waiter = await p.staff.findFirst({
    where: { restaurant_id: restaurantId, role: 'WAITER' }
  });
  if (!waiter) throw new Error('No waiter found');
  console.log(`Selected Waiter: ${waiter.name} (ID: ${waiter.id})`);

  // Get first 2 menu items
  const menuItems = await p.menu_items.findMany({
    where: { restaurant_id: restaurantId },
    take: 2
  });
  if (menuItems.length < 2) throw new Error('Not enough menu items to run simulation');
  
  const mi1 = menuItems[0];
  const mi2 = menuItems[1];
  console.log(`Menu Item 1: ${mi1.name} (Price: ${mi1.price})`);
  console.log(`Menu Item 2: ${mi2.name} (Price: ${mi2.price})`);

  // 2a. Create order
  const order = await p.orders.create({
    data: {
      restaurant_id: restaurantId,
      type: 'DINE_IN',
      status: 'ACTIVE',
      payment_status: 'UNPAID',
      table_id: table.id,
      assigned_waiter_id: waiter.id,
      order_number: 'TEST-001',
      total: 0
    }
  });
  console.log(`Created Order: ${order.order_number} (ID: ${order.id})`);

  const dineInOrder = await p.dine_in_orders.create({
    data: {
      order_id: order.id,
      table_id: table.id,
      guest_count: 2,
      waiter_id: waiter.id
    }
  });

  // 2b. Add 2 order items
  const qty1 = 2;
  const qty2 = 1;
  const oi1 = await p.order_items.create({
    data: {
      order_id: order.id,
      menu_item_id: mi1.id,
      quantity: qty1,
      unit_price: mi1.price,
      total_price: Number(mi1.price) * qty1,
      item_name: mi1.name,
      category: mi1.category,
      item_status: 'DRAFT'
    }
  });
  const oi2 = await p.order_items.create({
    data: {
      order_id: order.id,
      menu_item_id: mi2.id,
      quantity: qty2,
      unit_price: mi2.price,
      total_price: Number(mi2.price) * qty2,
      item_name: mi2.name,
      category: mi2.category,
      item_status: 'DRAFT'
    }
  });
  console.log(`Added Order Item 1: ${oi1.item_name} x ${oi1.quantity}`);
  console.log(`Added Order Item 2: ${oi2.item_name} x ${oi2.quantity}`);

  // 2c. Call recalculateTotals equivalent
  const subtotal = Number(oi1.total_price) + Number(oi2.total_price);
  const taxRate = Number(dineInDefault?.tax_rate || 16);
  const taxAmount = (subtotal * taxRate) / (100 + taxRate);
  
  const svcRate = Number(dineInDefault?.svc_rate || 5);
  const svcBase = subtotal - taxAmount;
  const svcAmount = (svcBase * svcRate) / 100;
  
  const rawTotal = subtotal + svcAmount;
  const roundedTotal = Math.round(rawTotal / 10) * 10;

  const rounded = {
    subtotal: Math.round(subtotal * 100) / 100,
    taxable_amount: Math.round(subtotal * 100) / 100,
    tax_amount: Math.round(taxAmount * 100) / 100,
    svc_amount: Math.round(svcAmount * 100) / 100,
    total: roundedTotal
  };

  const breakdown = {
    discount_type: 'flat',
    discount_value: 0,
    discountReason: '',
    tax_enabled: true,
    service_charge_enabled: true,
    delivery_fee_enabled: false,
    subtotal: rounded.subtotal,
    discount_amount: 0,
    taxable_amount: rounded.taxable_amount,
    tax_rate: taxRate,
    tax_type: 'INCLUSIVE',
    tax_amount: rounded.tax_amount,
    tax_exempt: false,
    svc_rate: svcRate,
    svc_amount: rounded.svc_amount,
    delivery_fee: 0,
    raw_total: rawTotal,
    total: rounded.total
  };

  // Update order with totals
  const updatedOrder = await p.orders.update({
    where: { id: order.id },
    data: {
      tax: rounded.tax_amount,
      service_charge: rounded.svc_amount,
      total: rounded.total,
      breakdown: breakdown as any
    }
  });

  console.log(`Financial Totals:`);
  console.log(`- Subtotal: Rs. ${subtotal}`);
  console.log(`- Tax (16% Inclusive): Rs. ${rounded.tax_amount}`);
  console.log(`- Service Charge (5% on pre-tax net): Rs. ${rounded.svc_amount}`);
  console.log(`- Grand Total (Rounded): Rs. ${rounded.total}`);

  // 2d. Simulate fire — update items to PENDING status
  await p.order_items.updateMany({
    where: { order_id: order.id },
    data: { item_status: 'PENDING' }
  });
  console.log(`Fired order! Items transitioned to PENDING status.`);

  // 2e. Simulate settle — update order to CLOSED/PAID and create transaction
  const settledOrder = await p.orders.update({
    where: { id: order.id },
    data: {
      status: 'CLOSED',
      payment_status: 'PAID',
      closed_at: new Date()
    }
  });
  console.log(`Settled order! Order status is now ${settledOrder.status}, Payment status is ${settledOrder.payment_status}`);

  const transaction = await p.transactions.create({
    data: {
      restaurant_id: restaurantId,
      order_id: order.id,
      amount: rounded.total,
      payment_method: 'CASH',
      status: 'PAID'
    }
  });
  console.log(`Created Transaction of Rs. ${transaction.amount} via ${transaction.payment_method}`);

  // Trigger double-entry journaling using JournalEntryService directly
  await jes.recordOrderSaleJournal(order.id, p);

  console.log('\n--- STEP 3 — Verify Journal Entries ---');
  const journalEntries = await p.journal_entries.findMany({
    where: { reference_id: order.id, reference_type: 'ORDER_SALE' },
    include: { journal_entry_lines: { include: { chart_of_accounts: true } } }
  });

  if (journalEntries.length === 0) {
    console.log('No ORDER_SALE journal was created.');
  } else {
    for (const je of journalEntries) {
      console.log(`Journal Entry Created: ID ${je.id}`);
      console.log(`- Type: ${je.reference_type}`);
      console.log(`- Date: ${je.date}`);
      console.log(`- Description: ${je.description}`);
      console.log(`Lines:`);
      let sumDebit = 0;
      let sumCredit = 0;
      for (const line of je.journal_entry_lines) {
        console.log(`  * ${line.chart_of_accounts.code} - ${line.chart_of_accounts.name} | DR: ${line.debit} | CR: ${line.credit} | Description: ${line.description}`);
        sumDebit += Number(line.debit);
        sumCredit += Number(line.credit);
      }
      console.log(`Total Debit: ${sumDebit} | Total Credit: ${sumCredit} | Balances? ${sumDebit === sumCredit ? 'YES' : 'NO'}`);
    }
  }

  console.log('\n--- STEP 4 — Check Trial Balance ---');
  const allLines = await p.journal_entry_lines.findMany({
    include: { chart_of_accounts: true }
  });

  const totalsMap: Record<string, { code: string; name: string; debit: number; credit: number }> = {};
  for (const line of allLines) {
    const acc = line.chart_of_accounts;
    if (!totalsMap[acc.id]) {
      totalsMap[acc.id] = { code: acc.code, name: acc.name, debit: 0, credit: 0 };
    }
    totalsMap[acc.id].debit += Number(line.debit);
    totalsMap[acc.id].credit += Number(line.credit);
  }

  let totalD = 0;
  let totalC = 0;
  console.log('Account Ledger Trial Balance Summary:');
  for (const [id, val] of Object.entries(totalsMap)) {
    const net = val.debit - val.credit;
    console.log(`- ${val.code} | ${val.name.padEnd(30)} | DR: Rs. ${val.debit.toFixed(2).padStart(10)} | CR: Rs. ${val.credit.toFixed(2).padStart(10)} | NET: Rs. ${net.toFixed(2).padStart(10)}`);
    totalD += val.debit;
    totalC += val.credit;
  }
  console.log(`Grand Totals - Total Debits: Rs. ${totalD.toFixed(2)} | Total Credits: Rs. ${totalC.toFixed(2)} | Balanced? ${Math.abs(totalD - totalC) < 0.01 ? 'YES' : 'NO'}`);

  console.log('\n--- STEP 5 — Cleaning Up Test Records ---');
  // Delete the created transaction, order items, dine_in_order, order, and journal entries
  await p.journal_entry_lines.deleteMany({
    where: {
      journal_entries: {
        reference_id: order.id,
        reference_type: 'ORDER_SALE'
      }
    }
  });
  await p.journal_entries.deleteMany({
    where: { reference_id: order.id, reference_type: 'ORDER_SALE' }
  });
  await p.transactions.deleteMany({ where: { order_id: order.id } });
  await p.order_items.deleteMany({ where: { order_id: order.id } });
  await p.dine_in_orders.deleteMany({ where: { order_id: order.id } });
  await p.orders.deleteMany({ where: { id: order.id } });
  console.log('Cleanup completed successfully! Database restored to clean seeded state.');
}

run()
  .catch(err => {
    console.error('Error during simulation:', err);
  })
  .finally(() => p.$disconnect());
