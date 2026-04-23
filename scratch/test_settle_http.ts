import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function testSettle() {
  const sessionId = 'ca981407-fdb9-49d1-8228-083bb250916c'; // Active session
  
  // 1. Create a dummy order
  const order = await prisma.orders.create({
    data: {
      restaurant_id: '8a2e584a-9e19-4b6d-a7b6-1215b3c58e72', // Get from existing
      order_number: 'TEST-' + Date.now(),
      type: 'TAKEAWAY',
      status: 'ACTIVE',
      payment_status: 'UNPAID',
      total: 100,
    }
  });

  console.log("Created order:", order.id);

  // 2. Fetch settle API directly
  // We need to bypass auth or pass token? It's better to just call the API over HTTP if it's running.
  // Assuming the server is running on port 3001
  const res = await fetch(`http://localhost:3001/api/orders/${order.id}/settle`, {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test', // if auth is bypassed in test mode?
          'x-session-id': sessionId,
          'x-restaurant-id': '8a2e584a-9e19-4b6d-a7b6-1215b3c58e72'
      },
      body: JSON.stringify({
          amount: 100,
          paymentMethod: 'CASH',
          total: 100
      })
  });
  
  const text = await res.text();
  console.log("Settle Response:", res.status, text);

  // 3. Check DB
  const updated = await prisma.orders.findUnique({ where: { id: order.id }});
  console.log("Updated order session:", updated?.session_id);
  
}
testSettle().finally(() => prisma.$disconnect());
