/**
 * ORDER CREATION - COMPREHENSIVE TEST & DEBUG GUIDE
 * 
 * This file contains detailed test cases and debugging procedures
 * for the Fireflow restaurant order management system
 * 
 * Run with: node this-file.js
 * Or paste individual sections in browser console
 */

// ============================================================================
// 1. BASIC API HEALTH CHECK
// ============================================================================

console.log('TEST 1: API Health Check');
console.log('========================\n');

fetch('http://localhost:3001/api/health')
  .then(r => r.json())
  .then(data => {
    console.log('✅ API is online');
    console.log('Response:', data);
  })
  .catch(err => {
    console.error('❌ API is offline:', err.message);
    console.error('Make sure server is running at http://localhost:3001');
  });

// ============================================================================
// 2. CREATE DINE-IN ORDER TEST
// ============================================================================

async function testCreateDineInOrder() {
  console.log('\n\nTEST 2: Create Dine-in Order');
  console.log('============================\n');

  const testOrder = {
    id: 'order-dine-in-' + Date.now(),
    restaurant_id: 'rest-001', // TODO: Replace with actual restaurant ID
    status: 'NEW',
    type: 'dine-in',
    table_id: 'table-001',      // ✅ snake_case
    guest_count: 4,             // ✅ snake_case
    total: 2500,
    items: [
      {
        id: 'item-1',
        menuItemId: 'menu-001',
        quantity: 1,
        price: 2500,
        name: 'Biryani'
      }
    ],
    service_charge: 125,        // ✅ snake_case
    tax: 400,
    delivery_fee: 0,
    timestamp: new Date().toISOString()
  };

  console.log('📤 Sending order:', JSON.stringify(testOrder, null, 2));

  try {
    const res = await fetch('http://localhost:3001/api/orders/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testOrder)
    });

    console.log('📊 Response Status:', res.status);

    const result = await res.json();

    if (res.ok) {
      console.log('✅ SUCCESS: Order created');
      console.log('Order ID:', result.id);
      console.log('Full Response:', JSON.stringify(result, null, 2));
    } else {
      console.log('❌ FAILED: Order creation failed');
      console.log('Error:', result.error);
      console.log('Details:', result.details);
    }
  } catch (error) {
    console.error('🔥 ERROR:', error.message);
  }
}

// ============================================================================
// 3. CREATE TAKEAWAY ORDER TEST
// ============================================================================

async function testCreateTakeawayOrder() {
  console.log('\n\nTEST 3: Create Takeaway Order');
  console.log('=============================\n');

  const testOrder = {
    id: 'order-takeaway-' + Date.now(),
    restaurant_id: 'rest-001', // TODO: Replace with actual restaurant ID
    status: 'NEW',
    type: 'takeaway',
    customer_name: 'Ahmed Khan',        // ✅ snake_case
    customer_phone: '03001234567',      // ✅ snake_case
    total: 1500,
    items: [
      {
        id: 'item-1',
        menuItemId: 'menu-002',
        quantity: 1,
        price: 1500,
        name: 'Karahi'
      }
    ],
    tax: 240,
    timestamp: new Date().toISOString()
  };

  console.log('📤 Sending order:', JSON.stringify(testOrder, null, 2));

  try {
    const res = await fetch('http://localhost:3001/api/orders/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testOrder)
    });

    console.log('📊 Response Status:', res.status);

    const result = await res.json();

    if (res.ok) {
      console.log('✅ SUCCESS: Order created');
      console.log('Order ID:', result.id);
    } else {
      console.log('❌ FAILED');
      console.log('Error:', result.error);
    }
  } catch (error) {
    console.error('🔥 ERROR:', error.message);
  }
}

// ============================================================================
// 4. CREATE DELIVERY ORDER TEST
// ============================================================================

async function testCreateDeliveryOrder() {
  console.log('\n\nTEST 4: Create Delivery Order');
  console.log('=============================\n');

  const testOrder = {
    id: 'order-delivery-' + Date.now(),
    restaurant_id: 'rest-001', // TODO: Replace with actual restaurant ID
    status: 'NEW',
    type: 'delivery',
    customer_name: 'Fatima Ali',
    customer_phone: '03009876543',
    delivery_address: '123 Main Street, Karachi', // ✅ snake_case
    total: 3500,
    items: [
      {
        id: 'item-1',
        menuItemId: 'menu-003',
        quantity: 2,
        price: 1500,
        name: 'Tikka Boti'
      }
    ],
    service_charge: 175,
    delivery_fee: 500,          // ✅ snake_case
    tax: 560,
    timestamp: new Date().toISOString()
  };

  console.log('📤 Sending order:', JSON.stringify(testOrder, null, 2));

  try {
    const res = await fetch('http://localhost:3001/api/orders/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testOrder)
    });

    console.log('📊 Response Status:', res.status);

    const result = await res.json();

    if (res.ok) {
      console.log('✅ SUCCESS: Order created');
      console.log('Order ID:', result.id);
    } else {
      console.log('❌ FAILED');
      console.log('Error:', result.error);
    }
  } catch (error) {
    console.error('🔥 ERROR:', error.message);
  }
}

// ============================================================================
// 5. ERROR CASE: MISSING REQUIRED FIELDS
// ============================================================================

async function testMissingRequiredFields() {
  console.log('\n\nTEST 5: Error Handling - Missing restaurant_id');
  console.log('==============================================\n');

  const badOrder = {
    id: 'order-error-' + Date.now(),
    // ❌ Missing restaurant_id - this should fail
    status: 'NEW',
    type: 'dine-in',
    total: 1000,
    items: []
  };

  console.log('📤 Sending invalid order (missing restaurant_id)');

  try {
    const res = await fetch('http://localhost:3001/api/orders/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(badOrder)
    });

    const result = await res.json();

    if (!res.ok) {
      console.log('✅ CORRECT: Server rejected invalid order');
      console.log('Error Message:', result.error);
      console.log('Error Details:', result.details);
    } else {
      console.log('⚠️  UNEXPECTED: Server accepted invalid order (should have failed)');
    }
  } catch (error) {
    console.error('🔥 ERROR:', error.message);
  }
}

// ============================================================================
// 6. FETCH ALL ORDERS TEST
// ============================================================================

async function testFetchOrders() {
  console.log('\n\nTEST 6: Fetch All Orders');
  console.log('========================\n');

  const restaurantId = 'rest-001'; // TODO: Replace with actual restaurant ID

  console.log(`📥 Fetching orders for restaurant: ${restaurantId}`);

  try {
    const res = await fetch(`http://localhost:3001/api/orders?restaurant_id=${restaurantId}`);

    const orders = await res.json();

    if (res.ok) {
      console.log(`✅ SUCCESS: Fetched ${orders.length} orders`);
      console.log('Orders:', JSON.stringify(orders.slice(0, 3), null, 2)); // Show first 3
    } else {
      console.log('❌ FAILED');
      console.log('Error:', orders.error);
    }
  } catch (error) {
    console.error('🔥 ERROR:', error.message);
  }
}

// ============================================================================
// 7. DATABASE VERIFICATION
// ============================================================================

async function testDatabaseDirectly() {
  console.log('\n\nTEST 7: Database Verification');
  console.log('=============================\n');

  console.log('To verify orders in database, run in PostgreSQL terminal:');
  console.log('');
  console.log('psql -U postgres -d fireflow_local');
  console.log('');
  console.log('Then run:');
  console.log('SELECT id, status, type, total, created_at FROM orders ORDER BY created_at DESC LIMIT 10;');
  console.log('');
  console.log('Expected columns:');
  console.log('- id (UUID)');
  console.log('- status (NEW, COOKING, READY, PAID, etc.)');
  console.log('- type (dine-in, takeaway, delivery)');
  console.log('- total (numeric)');
  console.log('- created_at (timestamp)');
}

// ============================================================================
// 8. COMPREHENSIVE TEST RUNNER
// ============================================================================

async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          FIREFLOW ORDER CREATION TEST SUITE v2.0              ║');
  console.log('║                    All Tests In One File                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  // Health check first
  try {
    const health = await fetch('http://localhost:3001/api/health');
    if (!health.ok) {
      console.error('❌ API is not responding. Make sure server is running.');
      return;
    }
  } catch (err) {
    console.error('❌ Cannot reach API at http://localhost:3001');
    console.error('   Ensure the server is running');
    return;
  }

  // Run all tests
  await testCreateDineInOrder();
  await testCreateTakeawayOrder();
  await testCreateDeliveryOrder();
  await testMissingRequiredFields();
  await testFetchOrders();
  await testDatabaseDirectly();

  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST SUITE COMPLETED                        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
}

// ============================================================================
// 9. USAGE INSTRUCTIONS
// ============================================================================

console.log(`
╔════════════════════════════════════════════════════════════════╗
║                   ORDER CREATION TEST GUIDE                    ║
║                                                                ║
║ To run comprehensive tests:                                    ║
║   await runAllTests()                                          ║
║                                                                ║
║ Or run individual tests:                                       ║
║   await testCreateDineInOrder()                                ║
║   await testCreateTakeawayOrder()                              ║
║   await testCreateDeliveryOrder()                              ║
║   await testMissingRequiredFields()                            ║
║   await testFetchOrders()                                      ║
║   await testDatabaseDirectly()                                 ║
║                                                                ║
║ IMPORTANT:                                                     ║
║ 1. Replace 'rest-001' with your actual restaurant ID          ║
║ 2. Replace 'table-001' with your actual table ID              ║
║ 3. Make sure API is running at http://localhost:3001          ║
║ 4. Check browser console (F12) for detailed output            ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    testCreateDineInOrder,
    testCreateTakeawayOrder,
    testCreateDeliveryOrder,
    testMissingRequiredFields,
    testFetchOrders,
    testDatabaseDirectly,
    runAllTests
  };
}

// Auto-run if in browser console
if (typeof window !== 'undefined') {
  console.log('\n✅ Test functions loaded. Run: await runAllTests()');
}
