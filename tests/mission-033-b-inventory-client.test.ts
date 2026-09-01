/**
 * M033-B Inventory Client API Contract Test
 *
 * Validates the inventoryService client wrapper against the running API.
 * Uses the same authenticated integration-test pattern as mission-032-c-inventory-api.test.ts.
 *
 * Run after server is up: node --import tsx tests/mission-033-b-inventory-client.test.ts
 */

import 'dotenv/config';
process.env.NODE_ENV = 'test';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { restaurantProvisioningService } from '../src/api/services/onboarding/RestaurantProvisioningService';
import { JwtService } from '../src/api/services/auth/JwtService';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();
const jwtService = new JwtService();

let passed = 0;
let failed = 0;

function assert(testName: string, condition: boolean, expected: string, actual: string) {
    if (condition) {
        console.log(`  PASS: ${testName}`);
        passed++;
    } else {
        console.log(`  FAIL: ${testName} — expected ${expected}, got ${actual}`);
        failed++;
    }
}

async function cleanupRestaurant(restaurantId: string) {
    await prisma.$transaction([
        prisma.stock_movements.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.journal_entry_lines.deleteMany({}),
        prisma.journal_entries.deleteMany({}),
        prisma.stock_count_lines.deleteMany({}),
        prisma.stock_counts.deleteMany({}),
        prisma.purchase_order_items.deleteMany({}),
        prisma.purchase_orders.deleteMany({}),
        prisma.recipe_items.deleteMany({}),
        prisma.order_items.deleteMany({}),
        prisma.orders.deleteMany({}),
        prisma.menu_items.deleteMany({}),
        prisma.inventory_items.deleteMany({}),
        prisma.suppliers.deleteMany({}),
        prisma.chart_of_accounts.deleteMany({}),
        prisma.staff.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.restaurants.delete({ where: { id: restaurantId } }),
    ]);
}

async function createTestStaff(restaurantId: string, name: string, role: string, pin: string): Promise<any> {
    const pinHash = await bcrypt.hash(pin, 12);
    return prisma.staff.create({
        data: {
            restaurant_id: restaurantId,
            name,
            role,
            pin,
            hashed_pin: pinHash,
            status: 'active',
        },
    });
}

async function setup() {
    console.log('--- SETUP M033-B INVENTORY CLIENT API TESTS ---\n');
    await cleanupRestaurant('00000000-0000-0000-0000-000000000001').catch(() => { });

    const result = await restaurantProvisioningService.provisionRestaurant({
        name: 'M033-B Tenant',
        slug: `m033b-tenant-${Date.now()}`,
        subscriptionPlan: 'BASIC',
        subscriptionStatus: 'active',
        ownerName: 'Owner M033B',
        ownerEmail: `m033b-${Date.now()}@test.fireflow`,
    });

    if (!result.success || !result.restaurant?.id) throw new Error('Provisioning failed');

    const restaurantId = result.restaurant.id;
    await prisma.restaurants.update({
        where: { id: restaurantId },
        data: { onboarding_status: 'ACTIVE' },
    });

    const manager = await createTestStaff(restaurantId, 'Manager M033B', 'MANAGER', '111111');
    const token = jwtService.generateAccessToken(manager.id, restaurantId, 'MANAGER', 'Manager M033B');

    const item = await prisma.inventory_items.create({
        data: {
            restaurant_id: restaurantId,
            name: 'Test Item M033B',
            unit_of_measure: 'KG',
            current_stock: new Decimal(100),
            minimum_stock: new Decimal(10),
            unit_cost: new Decimal(50),
            average_unit_cost: new Decimal(50),
            total_cost_basis: new Decimal(5000),
            category: 'Dry Goods',
        },
    });

    return { restaurantId, manager, token, item };
}

async function runTests() {
    console.log('--- STARTING M033-B INVENTORY CLIENT API CONTRACT TESTS ---\n');
    const s = await setup();

    // TEST 1: GET /api/inventory/items returns correct shape
    console.log('[Test 1] GET /api/inventory/items returns correct response shape');
    try {
        const res = await fetch('http://localhost:3001/api/inventory/items', {
            headers: { 'Authorization': `Bearer ${s.token}` },
        });
        assert('Status 200', res.status === 200, '200', `${res.status}`);
        const data = await res.json();
        assert('success field is true', data.success === true, 'true', `${data.success}`);
        assert('items is an array', Array.isArray(data.items), 'array', typeof data.items);
        assert('item has expected fields', 'isNegative' in (data.items[0] || {}), 'true', 'missing');
        assert('item name is string', typeof (data.items[0]?.name) === 'string', 'string', typeof data.items[0]?.name);
        assert('currentStock is number', typeof (data.items[0]?.currentStock) === 'number', 'number', typeof data.items[0]?.currentStock);
        assert('averageUnitCost is number', typeof (data.items[0]?.averageUnitCost) === 'number', 'number', typeof data.items[0]?.averageUnitCost);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 2: GET /api/inventory/items/:id returns correct shape
    console.log('\n[Test 2] GET /api/inventory/items/:id returns correct response shape');
    try {
        const res = await fetch(`http://localhost:3001/api/inventory/items/${s.item.id}`, {
            headers: { 'Authorization': `Bearer ${s.token}` },
        });
        assert('Status 200', res.status === 200, '200', `${res.status}`);
        const data = await res.json();
        assert('success field is true', data.success === true, 'true', `${data.success}`);
        assert('item.id matches', data.item?.id === s.item.id, s.item.id, data.item?.id);
        assert('item has isNegative', 'isNegative' in data.item, 'true', 'missing');
        assert('item has movements endpoint field', 'averageUnitCost' in data.item, 'true', 'missing');
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 3: GET /api/inventory/items/:id/movements returns correct shape
    console.log('\n[Test 3] GET /api/inventory/items/:id/movements returns correct response shape');
    try {
        const res = await fetch(`http://localhost:3001/api/inventory/items/${s.item.id}/movements`, {
            headers: { 'Authorization': `Bearer ${s.token}` },
        });
        assert('Status 200', res.status === 200, '200', `${res.status}`);
        const data = await res.json();
        assert('success field is true', data.success === true, 'true', `${data.success}`);
        assert('itemId returned', data.itemId === s.item.id, s.item.id, data.itemId);
        assert('movements is array', Array.isArray(data.movements), 'array', typeof data.movements);
        assert('count is number', typeof data.count === 'number', 'number', typeof data.count);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 4: GET /api/inventory/negative-stock returns correct shape
    console.log('\n[Test 4] GET /api/inventory/negative-stock returns correct response shape');
    try {
        const res = await fetch('http://localhost:3001/api/inventory/negative-stock', {
            headers: { 'Authorization': `Bearer ${s.token}` },
        });
        assert('Status 200', res.status === 200, '200', `${res.status}`);
        const data = await res.json();
        assert('success field is true', data.success === true, 'true', `${data.success}`);
        assert('items is array', Array.isArray(data.items), 'array', typeof data.items);
        assert('count is number', typeof data.count === 'number', 'number', typeof data.count);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 5: GET /api/inventory/items/:id/wac returns correct shape
    console.log('\n[Test 5] GET /api/inventory/items/:id/wac returns correct response shape');
    try {
        const res = await fetch(`http://localhost:3001/api/inventory/items/${s.item.id}/wac`, {
            headers: { 'Authorization': `Bearer ${s.token}` },
        });
        assert('Status 200', res.status === 200, '200', `${res.status}`);
        const data = await res.json();
        assert('success field is true', data.success === true, 'true', `${data.success}`);
        assert('itemId returned', data.itemId === s.item.id, s.item.id, data.itemId);
        assert('averageUnitCost is number', typeof data.averageUnitCost === 'number', 'number', typeof data.averageUnitCost);
        assert('currentQuantity is number', typeof data.currentQuantity === 'number', 'number', typeof data.currentQuantity);
        assert('totalCostBasis is number', typeof data.totalCostBasis === 'number', 'number', typeof data.totalCostBasis);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 6: No client-supplied restaurant_id in requests (tenant isolation)
    console.log('\n[Test 6] No restaurant_id param accepted from client');
    try {
        const res = await fetch(`http://localhost:3001/api/inventory/items?restaurant_id=00000000-0000-0000-0000-000000000099`, {
            headers: { 'Authorization': `Bearer ${s.token}` },
        });
        assert('Status 200 (tenant context from JWT)', res.status === 200, '200', `${res.status}`);
        const data = await res.json();
        assert('Returns own tenant items only', !data.items?.some((i: any) => i.id === s.item.id === false), 'no cross-tenant', 'cross-tenant leak');
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // Cleanup
    await cleanupRestaurant(s.restaurantId);

    console.log('\n=== M033-B CLIENT API CONTRACT REPORT ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: 0`);

    if (failed > 0) {
        console.log('\nM033-B: CLIENT API CONTRACT FAILED');
        process.exit(1);
    } else {
        console.log('\nM033-B: CLIENT API CONTRACT PASSED');
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
