import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const p = new PrismaClient();

const ORDER_ID = 'af2e8245-324c-4923-8da5-5990154ce4a2';

async function auditOrder() {
  try {
    const order = await p.orders.findUnique({
      where: { id: ORDER_ID },
      include: {
        transactions: true,
        customers: true,
      }
    });

    if (!order) {
      console.log(`Order ${ORDER_ID} not found.`);
      return;
    }

    console.log('=== ORDER AUDIT ===');
    console.log('Order ID:', order.id);
    console.log('Order Number:', order.order_number);
    console.log('Status:', order.status);
    console.log('Payment Status:', order.payment_status);
    console.log('Customer ID:', order.customer_id);
    console.log('Customer Name:', order.customers?.name || 'N/A');
    console.log('Total:', order.total);
    
    console.log('\n--- Transactions ---');
    order.transactions.forEach(t => {
      console.log(`- Method: ${t.payment_method}, Amount: ${t.amount}, Status: ${t.status}`);
    });

    const ledgerEntries = await p.ledger_entries.findMany({
      where: { reference_id: ORDER_ID, reference_type: 'ORDER' }
    });

    console.log('\n--- Ledger Entries ---');
    if (ledgerEntries.length === 0) {
      console.log('No ledger entries found.');
    } else {
      ledgerEntries.forEach(le => {
        console.log(`- Account ID: ${le.account_id}, Type: ${le.transaction_type}, Amount: ${le.amount}, Desc: ${le.description}`);
      });
    }

    const journalEntries = await p.journal_entries.findMany({
      where: { reference_id: ORDER_ID, reference_type: 'ORDER_SALE' },
      include: { lines: true }
    });

    console.log('\n--- Journal Entries ---');
    if (journalEntries.length === 0) {
      console.log('No journal entries found.');
    } else {
      journalEntries.forEach(je => {
        console.log(`- Reference: ${je.reference_type}, Desc: ${je.description}`);
        je.lines.forEach(line => {
          console.log(`  * Account ID: ${line.account_id}, Debit: ${line.debit}, Credit: ${line.credit}`);
        });
      });
    }

  } catch (error) {
    console.error('Audit failed:', error);
  } finally {
    await p.$disconnect();
  }
}

auditOrder();
