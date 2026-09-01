/**
 * M033-D Stock Count UI Client Regression Test
 *
 * Validates the stock count client API contract against the running API.
 * Uses the same authenticated integration-test pattern as mission-033-c-receiving-client.test.ts.
 *
 * Run after server is up: node --import tsx tests/mission-033-d-stock-count-client.test.ts
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
        prisma.stock_movements.deleteMany({}),
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
    console.log('--- SETUP M033-D STOCK COUNT CLIENT TESTS ---\n');
    await cleanupRestaurant('00000000-0000-0000-0000-000000000001').catch(() => { });

    const result = await restaurantProvisioningService.provisionRestaurant({
        name: 'M033-D Tenant',
        slug: `m033d-tenant-${Date.now()}`,
        subscriptionPlan: 'BASIC',
        subscriptionStatus: 'active',
        ownerName: 'Owner M033D',
        ownerEmail: `m033d-${Date.now()}@test.fireflow`,
    });

    if (!result.success || !result.restaurant?.id) throw new Error('Provisioning failed');

    const restaurantId = result.restaurant.id;
    await prisma.restaurants.update({
        where: { id: restaurantId },
        data: { onboarding_status: 'ACTIVE' },
    });

    const manager = await createTestStaff(restaurantId, 'Manager M033D', 'MANAGER', '111111');
    const managerToken = jwtService.generateAccessToken(manager.id, restaurantId, 'MANAGER', 'Manager M033D');

    const cashier = await createTestStaff(restaurantId, 'Cashier M033D', 'CASHIER', '333333');
    const cashierToken = jwtService.generateAccessToken(cashier.id, restaurantId, 'CASHIER', 'Cashier M033D');

    const item1 = await prisma.inventory_items.create({
        data: {
            restaurant_id: restaurantId,
            name: 'Flour M033D',
            unit_of_measure: 'KG',
            current_stock: new Decimal(10),
            unit_cost: new Decimal(2),
            average_unit_cost: new Decimal(2),
            total_cost_basis: new Decimal(20),
            minimum_stock: new Decimal(5),
            category: 'Ingredients',
        },
    });

    const item2 = await prisma.inventory_items.create({
        data: {
            restaurant_id: restaurantId,
            name: 'Sugar M033D',
            unit_of_measure: 'KG',
            current_stock: new Decimal(5),
            unit_cost: new Decimal(1),
            average_unit_cost: new Decimal(1),
            total_cost_basis: new Decimal(5),
            minimum_stock: new Decimal(3),
            category: 'Ingredients',
        },
    });

    return { restaurantId, manager, managerToken, cashier, cashierToken, item1, item2 };
}

async function runTests() {
    console.log('--- STARTING M033-D STOCK COUNT CLIENT API CONTRACT TESTS ---\n');
    const s = await setup();

    let createdCountId: string | null = null;

    // TEST 1: GET /api/inventory/counts returns list (empty initially)
    console.log('[Test 1] GET /api/inventory/counts returns empty list initially');
    try {
        const res = await fetch('http://localhost:3001/api/inventory/counts', {
            headers: { 'Authorization': `Bearer ${s.managerToken}` },
        });
        assert('Status 200', res.status === 200, '200', `${res.status}`);
        const data = await res.json();
        assert('success field is true', data.success === true, 'true', `${data.success}`);
        assert('stockCounts is an array', Array.isArray(data.stockCounts), 'array', typeof data.stockCounts);
        assert('stockCounts is empty', data.stockCounts.length === 0, '0', `${data.stockCounts.length}`);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 2: POST /api/inventory/counts creates a new stock count
    console.log('\n[Test 2] POST /api/inventory/counts creates a new stock count');
    const operationKey = `count-m033d-${Date.now()}`;
    try {
        const res = await fetch('http://localhost:3001/api/inventory/counts', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.managerToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ operationKey }),
        });
        assert('Status 201', res.status === 201, '201', `${res.status}`);
        const data = await res.json();
        assert('success field is true', data.success === true, 'true', `${data.success}`);
        assert('stockCount has id', !!data.stockCount?.id, 'has id', 'missing');
        assert('stockCount status is OPEN', data.stockCount?.status === 'OPEN', 'OPEN', data.stockCount?.status);
        assert('stockCount operationKey matches', data.stockCount?.operationKey === operationKey, operationKey, data.stockCount?.operationKey);
        createdCountId = data.stockCount.id;
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 3: Duplicate operationKey is rejected
    console.log('\n[Test 3] POST /api/inventory/counts rejects duplicate operationKey');
    try {
        const res = await fetch('http://localhost:3001/api/inventory/counts', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.managerToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ operationKey }),
        });
        assert('Status 400 for duplicate', res.status === 400, '400', `${res.status}`);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 4: CASHIER cannot create stock count (role gating)
    console.log('\n[Test 4] CASHIER role cannot create stock count');
    try {
        const res = await fetch('http://localhost:3001/api/inventory/counts', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.cashierToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ operationKey: `cashier-count-${Date.now()}` }),
        });
        assert('CASHIER create forbidden', res.status === 403, '403', `${res.status}`);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 5: PATCH /api/inventory/counts/:id/lines adds a line
    console.log('\n[Test 5] PATCH /api/inventory/counts/:id/lines adds a count line');
    assert('countId exists from Test 2', !!createdCountId, 'non-null', createdCountId || 'null');
    try {
        const res = await fetch(`http://localhost:3001/api/inventory/counts/${createdCountId}/lines`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${s.managerToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                inventoryItemId: s.item1.id,
                expectedQuantity: 10,
                countedQuantity: 9.5,
            }),
        });
        assert('Status 200', res.status === 200, '200', `${res.status}`);
        const data = await res.json();
        assert('success field is true', data.success === true, 'true', `${data.success}`);
        assert('line has id', !!data.line?.id, 'has id', 'missing');
        assert('line expectedQuantity is 10', data.line?.expectedQuantity === 10, '10', data.line?.expectedQuantity);
        assert('line countedQuantity is 9.5', data.line?.countedQuantity === 9.5, '9.5', data.line?.countedQuantity);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 6: GET /api/inventory/counts/:id returns count with lines
    console.log('\n[Test 6] GET /api/inventory/counts/:id returns count with lines');
    try {
        const res = await fetch(`http://localhost:3001/api/inventory/counts/${createdCountId}`, {
            headers: { 'Authorization': `Bearer ${s.managerToken}` },
        });
        assert('Status 200', res.status === 200, '200', `${res.status}`);
        const data = await res.json();
        assert('success field is true', data.success === true, 'true', `${data.success}`);
        assert('stockCount has id', data.stockCount?.id === createdCountId, createdCountId, data.stockCount?.id);
        assert('lines array has 1 item', data.stockCount?.lines?.length === 1, '1', `${data.stockCount?.lines?.length}`);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 7: CASHIER cannot finalize (role gating)
    console.log('\n[Test 7] CASHIER role cannot finalize stock count');
    try {
        const res = await fetch(`http://localhost:3001/api/inventory/counts/${createdCountId}/finalize`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.cashierToken}`, 'Content-Type': 'application/json' },
        });
        assert('CASHIER finalize forbidden', res.status === 403, '403', `${res.status}`);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 8: POST /api/inventory/counts/:id/finalize creates adjustments
    console.log('\n[Test 8] POST /api/inventory/counts/:id/finalize creates adjustments');
    try {
        const res = await fetch(`http://localhost:3001/api/inventory/counts/${createdCountId}/finalize`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.managerToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        assert('Status 200', res.status === 200, '200', `${res.status}`);
        const data = await res.json();
        assert('success field is true', data.success === true, 'true', `${data.success}`);
        assert('stockCount status is CLOSED', data.stockCount?.status === 'CLOSED', 'CLOSED', data.stockCount?.status);
        assert('adjustments is array', Array.isArray(data.adjustments), 'array', typeof data.adjustments);
        assert('adjustments has 1 item', data.adjustments?.length === 1, '1', `${data.adjustments?.length}`);

        const adj = data.adjustments[0];
        assert('adjustment difference is -0.5', adj.difference === -0.5, '-0.5', adj.difference);
        assert('adjustment has movementId', adj.movementId !== null, 'non-null', adj.movementId || 'null');
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 9: Cannot finalize a CLOSED count (idempotency)
    console.log('\n[Test 9] Cannot finalize an already-closed count');
    try {
        const res = await fetch(`http://localhost:3001/api/inventory/counts/${createdCountId}/finalize`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.managerToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        assert('Status 409 for double finalize', res.status === 409, '409', `${res.status}`);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 10: GET /api/inventory/counts?status=CLOSED returns the finalized count
    console.log('\n[Test 10] GET /api/inventory/counts?status=CLOSED returns finalized count');
    try {
        const res = await fetch('http://localhost:3001/api/inventory/counts?status=CLOSED', {
            headers: { 'Authorization': `Bearer ${s.managerToken}` },
        });
        assert('Status 200', res.status === 200, '200', `${res.status}`);
        const data = await res.json();
        assert('stockCounts has 1 item', data.stockCounts.length === 1, '1', `${data.stockCounts.length}`);
        assert('count status is CLOSED', data.stockCounts[0]?.status === 'CLOSED', 'CLOSED', data.stockCounts[0]?.status);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // Cleanup
    await cleanupRestaurant(s.restaurantId);

    console.log('\n=== M033-D STOCK COUNT CLIENT REPORT ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: 0`);

    if (failed > 0) {
        console.log('\nM033-D: STOCK COUNT CLIENT FAILED');
        process.exit(1);
    } else {
        console.log('\nM033-D: STOCK COUNT CLIENT PASSED');
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});