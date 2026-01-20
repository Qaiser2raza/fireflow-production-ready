/**
 * ORDER CREATION TEST & DEBUG UTILITY
 * Tests order creation flow with various scenarios and edge cases
 */

const API_URL = 'http://localhost:3001/api';
const TEST_RESTAURANT_ID = 'test-restaurant-001';
const TEST_TABLE_ID = 'table-001';

/**
 * ============================================================================
 * TEST SCENARIOS
 * ============================================================================
 */

const testScenarios = {
  // ✅ Valid Dine-in Order
  validDineInOrder: {
    name: 'Valid Dine-in Order',
    data: {
      id: 'order-dine-in-001',
      restaurant_id: TEST_RESTAURANT_ID,
      table_id: TEST_TABLE_ID,
      status: 'NEW',
      type: 'dine-in',
      total: 2500,
      items: [
        {
          id: 'item-1',
          menuItemId: 'menu-001',
          quantity: 2,
          price: 1000,
          name: 'Biryani'
        }
      ],
      guest_count: 4,
      timestamp: new Date().toISOString()
    }
  },

  // ✅ Valid Takeaway Order
  validTakeawayOrder: {
    name: 'Valid Takeaway Order',
    data: {
      id: 'order-takeaway-001',
      restaurant_id: TEST_RESTAURANT_ID,
      status: 'NEW',
      type: 'takeaway',
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
      customerName: 'Ahmed Khan',
      customerPhone: '03001234567',
      timestamp: new Date().toISOString()
    }
  },

  // ✅ Valid Delivery Order
  validDeliveryOrder: {
    name: 'Valid Delivery Order',
    data: {
      id: 'order-delivery-001',
      restaurant_id: TEST_RESTAURANT_ID,
      status: 'NEW',
      type: 'delivery',
      total: 3500,
      items: [
        {
          id: 'item-1',
          menuItemId: 'menu-003',
          quantity: 2,
          price: 1500,
          name: 'Tikka'
        }
      ],
      customerName: 'Fatima Ali',
      customerPhone: '03009876543',
      deliveryAddress: '123 Main Street, Karachi',
      deliveryFee: 500,
      timestamp: new Date().toISOString()
    }
  },

  // ❌ Missing Required Field: restaurant_id
  missingRestaurantId: {
    name: 'Missing restaurant_id (should fail)',
    data: {
      id: 'order-fail-001',
      table_id: TEST_TABLE_ID,
      status: 'NEW',
      type: 'dine-in',
      total: 2000,
      items: []
    },
    shouldFail: true
  },

  // ❌ Missing Required Field: status
  missingStatus: {
    name: 'Missing status (should fail)',
    data: {
      id: 'order-fail-002',
      restaurant_id: TEST_RESTAURANT_ID,
      table_id: TEST_TABLE_ID,
      type: 'dine-in',
      total: 2000,
      items: []
    },
    shouldFail: true
  },

  // ❌ Invalid Status Value
  invalidStatusValue: {
    name: 'Invalid status value (should fail)',
    data: {
      id: 'order-fail-003',
      restaurant_id: TEST_RESTAURANT_ID,
      status: 'INVALID_STATUS',
      type: 'dine-in',
      total: 2000,
      items: []
    },
    shouldFail: true
  },

  // ❌ Missing Items Array
  missingItems: {
    name: 'Missing items array',
    data: {
      id: 'order-fail-004',
      restaurant_id: TEST_RESTAURANT_ID,
      status: 'NEW',
      type: 'dine-in',
      total: 0
      // no items field
    },
    shouldFail: false // items can be empty
  }
};

/**
 * ============================================================================
 * TEST FUNCTIONS
 * ============================================================================
 */

/**
 * Test creating an order
 */
async function testCreateOrder(scenarioKey) {
  const scenario = testScenarios[scenarioKey];
  if (!scenario) {
    console.error(`❌ Unknown scenario: ${scenarioKey}`);
    return;
  }

  const { name, data, shouldFail } = scenario;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📝 Testing: ${name}`);
  console.log(`${'='.repeat(70)}`);
  console.log('📤 Request Data:', JSON.stringify(data, null, 2));

  try {
    const response = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    console.log(`📊 Response Status: ${response.status}`);

    const responseData = await response.json();
    console.log('📥 Response Data:', JSON.stringify(responseData, null, 2));

    if (response.ok) {
      if (shouldFail) {
        console.log('⚠️  UNEXPECTED SUCCESS: Test should have failed but succeeded');
      } else {
        console.log('✅ SUCCESS: Order created');
      }
    } else {
      if (shouldFail) {
        console.log('✅ EXPECTED FAILURE: Test correctly failed');
      } else {
        console.log('❌ UNEXPECTED FAILURE: Test should have succeeded but failed');
      }
    }
  } catch (err) {
    console.error('🔥 ERROR:', err.message);
  }
}

/**
 * Test updating an order
 */
async function testUpdateOrder(orderId, updateData) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📝 Testing: Update Order ${orderId}`);
  console.log(`${'='.repeat(70)}`);
  console.log('📤 Update Data:', JSON.stringify(updateData, null, 2));

  try {
    const response = await fetch(`${API_URL}/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    });

    console.log(`📊 Response Status: ${response.status}`);

    const responseData = await response.json();
    console.log('📥 Response Data:', JSON.stringify(responseData, null, 2));

    if (response.ok) {
      console.log('✅ SUCCESS: Order updated');
    } else {
      console.log('❌ FAILED: Order update failed');
    }
  } catch (err) {
    console.error('🔥 ERROR:', err.message);
  }
}

/**
 * Test fetching orders
 */
async function testFetchOrders() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📝 Testing: Fetch All Orders`);
  console.log(`${'='.repeat(70)}`);

  try {
    const response = await fetch(`${API_URL}/orders?restaurant_id=${TEST_RESTAURANT_ID}`);

    console.log(`📊 Response Status: ${response.status}`);

    const orders = await response.json();
    console.log(`📥 Found ${orders.length} orders`);
    console.log(JSON.stringify(orders, null, 2));

    if (response.ok) {
      console.log('✅ SUCCESS: Orders fetched');
    } else {
      console.log('❌ FAILED: Orders fetch failed');
    }
  } catch (err) {
    console.error('🔥 ERROR:', err.message);
  }
}

/**
 * Test the generic upsert endpoint (used by the actual orderService)
 */
async function testUpsertOrder(data) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📝 Testing: Upsert Order (actual endpoint)`);
  console.log(`${'='.repeat(70)}`);
  console.log('📤 Request Data:', JSON.stringify(data, null, 2));

  try {
    const response = await fetch(`${API_URL}/orders/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    console.log(`📊 Response Status: ${response.status}`);

    const responseData = await response.json();
    console.log('📥 Response Data:', JSON.stringify(responseData, null, 2));

    if (response.ok) {
      console.log('✅ SUCCESS: Order upserted');
    } else {
      console.log('❌ FAILED: Order upsert failed');
    }
  } catch (err) {
    console.error('🔥 ERROR:', err.message);
  }
}

/**
 * Test field name validation (snake_case vs camelCase)
 */
async function testFieldNaming() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📝 Testing: Field Naming (snake_case vs camelCase)`);
  console.log(`${'='.repeat(70)}`);

  // Test 1: snake_case fields
  console.log('\n🔹 Test 1: snake_case fields (as sent by orderService)');
  const snakeCaseData = {
    id: 'order-naming-001',
    restaurant_id: TEST_RESTAURANT_ID,
    table_id: TEST_TABLE_ID,
    status: 'NEW',
    type: 'dine-in',
    guest_count: 2,
    total: 1000,
    items: []
  };
  await testUpsertOrder(snakeCaseData);

  // Test 2: camelCase fields
  console.log('\n🔹 Test 2: camelCase fields (as sent by POSView)');
  const camelCaseData = {
    id: 'order-naming-002',
    restaurant_id: TEST_RESTAURANT_ID,
    tableId: TEST_TABLE_ID,
    status: 'NEW',
    type: 'dine-in',
    guestCount: 2,
    total: 1000,
    items: []
  };
  await testUpsertOrder(camelCaseData);
}

/**
 * ============================================================================
 * MAIN TEST RUNNER
 * ============================================================================
 */

async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                 ORDER CREATION TEST SUITE                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  // Health check
  console.log('\n🔍 Health Check...');
  try {
    const health = await fetch(`${API_URL}/health`);
    if (health.ok) {
      console.log('✅ API is online');
    } else {
      console.log('❌ API returned error');
      return;
    }
  } catch (err) {
    console.log(`❌ Cannot connect to API: ${err.message}`);
    console.log(`   Make sure the server is running at ${API_URL}`);
    return;
  }

  // Run positive test cases
  console.log('\n\n📋 POSITIVE TEST CASES (should succeed)');
  console.log('─'.repeat(70));
  await testCreateOrder('validDineInOrder');
  await testCreateOrder('validTakeawayOrder');
  await testCreateOrder('validDeliveryOrder');

  // Run negative test cases
  console.log('\n\n📋 NEGATIVE TEST CASES (should fail gracefully)');
  console.log('─'.repeat(70));
  await testCreateOrder('missingRestaurantId');
  await testCreateOrder('missingStatus');
  await testCreateOrder('invalidStatusValue');
  await testCreateOrder('missingItems');

  // Test field naming
  console.log('\n\n📋 FIELD NAMING VALIDATION');
  console.log('─'.repeat(70));
  await testFieldNaming();

  // Test fetch orders
  console.log('\n\n📋 FETCH OPERATIONS');
  console.log('─'.repeat(70));
  await testFetchOrders();

  console.log('\n\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST SUITE COMPLETED                            ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');
}

/**
 * Export functions for use in Node.js or browser console
 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runAllTests,
    testCreateOrder,
    testUpdateOrder,
    testFetchOrders,
    testUpsertOrder,
    testFieldNaming,
    testScenarios
  };
}

// Run tests if executed directly
if (typeof require !== 'undefined' && require.main === module) {
  runAllTests().catch(console.error);
}
