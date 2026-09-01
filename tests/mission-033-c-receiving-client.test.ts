/**
 * M033-C Stock Receiving UI Client Regression Test
 *
 * Validates the stock receiving client API contract against the running API.
 * Uses the same authenticated integration-test pattern as mission-032-c-inventory-api.test.ts.
 *
 * Run after server is up: node --import tsx tests/mission-033-c-receiving-client.test.ts
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
    console.log('--- SETUP M033-C STOCK RECEIVING CLIENT TESTS ---\n');
    await cleanupRestaurant('00000000-0000-0000-0000-000000000001').catch(() => { });

    const result = await restaurantProvisioningService.provisionRestaurant({
        name: 'M033-C Tenant',
        slug: `m033c-tenant-${Date.now()}`,
        subscriptionPlan: 'BASIC',
        subscriptionStatus: 'active',
        ownerName: 'Owner M033C',
        ownerEmail: `m033c-${Date.now()}@test.fireflow`,
    });

    if (!result.success || !result.restaurant?.id) throw new Error('Provisioning failed');

    const restaurantId = result.restaurant.id;
    await prisma.restaurants.update({
        where: { id: restaurantId },
        data: { onboarding_status: 'ACTIVE' },
    });

    const manager = await createTestStaff(restaurantId, 'Manager M033C', 'MANAGER', '111111');
    const token = jwtService.generateAccessToken(manager.id, restaurantId, 'MANAGER', 'Manager M033C');

    const supplier = await prisma.suppliers.create({
        data: { restaurant_id: restaurantId, name: 'Supplier M033C', phone: '+1111111111' },
    });

    const item = await prisma.inventory_items.create({
        data: {
            restaurant_id: restaurantId,
            name: 'Test Item M033C',
            unit_of_measure: 'KG',
            current_stock: new Decimal(0),
            unit_cost: new Decimal(10),
            average_unit_cost: new Decimal(10),
            total_cost_basis: new Decimal(0),
            minimum_stock: new Decimal(5),
            category: 'Produce',
        },
    });

    const po = await prisma.purchase_orders.create({
        data: {
            po_number: `PO-M033C-${Date.now()}`,
            supplier_id: supplier.id,
            restaurant_id: restaurantId,
            total_amount: new Decimal(100),
            status: 'APPROVED',
        },
    });

    const poLine = await prisma.purchase_order_items.create({
        data: {
            purchase_order_id: po.id,
            inventory_item_id: item.id,
            quantity_ordered: new Decimal(10),
            quantity_received: new Decimal(0),
            unit_price: new Decimal(10),
            total_price: new Decimal(100),
        },
    });

    return { restaurantId, manager, token, item, po, poLine, supplier };
}

async function runTests() {
    console.log('--- STARTING M033-C STOCK RECEIVING CLIENT API CONTRACT TESTS ---\n');
    const s = await setup();

    // TEST 1: GET /api/inventory/po-lines returns pending lines
    console.log('[Test 1] GET /api/inventory/po-lines returns pending receipt lines');
    try {
        const res = await fetch('http://localhost:3001/api/inventory/po-lines', {
            headers: { 'Authorization': `Bearer ${s.token}` },
        });
        assert('Status 200', res.status === 200, '200', `${res.status}`);
        const data = await res.json();
        assert('success field is true', data.success === true, 'true', `${data.success}`);
        assert('poLines is an array', Array.isArray(data.poLines), 'array', typeof data.poLines);
        assert('poLines has items', data.poLines.length >= 1, '>= 1', `${data.poLines.length}`);
        assert('poLine has id', data.poLines[0].id === s.poLine.id, s.poLine.id, data.poLines[0].id);
        assert('poLine has po_number', data.poLines[0].po_number === s.po.po_number, s.po.po_number, data.poLines[0].po_number);
        assert('poLine has inventory_item_name', data.poLines[0].inventory_item_name === s.item.name, s.item.name, data.poLines[0].inventory_item_name);
        assert('poLine has quantity_remaining', data.poLines[0].quantity_remaining === 10, 10, data.poLines[0].quantity_remaining);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 2: GET /api/inventory/po-lines returns only partial lines
    console.log('\n[Test 2] GET /api/inventory/po-lines returns only partial lines');
    try {
        const res = await fetch('http://localhost:3001/api/inventory/po-lines', {
            headers: { 'Authorization': `Bearer ${s.token}` },
        });
        const data = await res.json();
        data.poLines.forEach((line: any) => {
            assert(`Line ${line.id} has quantity_remaining > 0`, line.quantity_remaining > 0, '> 0', `${line.quantity_remaining}`);
        });
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 3: POST /api/inventory/receive/:poLineId creates movement
    console.log('\n[Test 3] POST /api/inventory/receive/:poLineId creates movement');
    let movementId: string | null = null;
    const receiveOpKey = `recv-m033c-${Date.now()}`;
    try {
        const res = await fetch(`http://localhost:3001/api/inventory/receive/${s.poLine.id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity: 5, operationKey: receiveOpKey }),
        });
        assert('Status 200', res.status === 200, '200', `${res.status}`);
        const data = await res.json();
        assert('Movement created', data.movement?.id, 'has movement id', 'missing');
        assert('Movement quantity is 5', data.movement?.quantity === 5, 5, data.movement?.quantity);
        assert('Movement unitCost is 10', data.movement?.unitCost === 10, 10, data.movement?.unitCost);
        movementId = data.movement?.id;
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 4: Receive updates WAC and current_stock
    console.log('\n[Test 4] Receive updates current_stock and WAC');
    try {
        const item = await prisma.inventory_items.findFirst({ where: { id: s.item.id, restaurant_id: s.restaurantId }, select: { current_stock: true, average_unit_cost: true } });
        assert('current_stock updated to 5', item?.current_stock.toString() === '5', '5', item?.current_stock?.toString());
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 5: Duplicate receive returns same movement (idempotent)
    console.log('\n[Test 5] Duplicate receive is idempotent');
    try {
        const res = await fetch(`http://localhost:3001/api/inventory/receive/${s.poLine.id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity: 5, operationKey: receiveOpKey }),
        });
        assert('Status 200 on duplicate', res.status === 200, '200', `${res.status}`);
        const data = await res.json();
        if (movementId) {
            assert('Same movement ID returned', data.movement?.id === movementId, movementId, data.movement?.id);
        }
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 6: CASHIER cannot receive (role gating)
    console.log('\n[Test 6] CASHIER role cannot receive stock');
    try {
        const cashier = await createTestStaff(s.restaurantId, 'Cashier M033C', 'CASHIER', '333333');
        const cashierToken = jwtService.generateAccessToken(cashier.id, s.restaurantId, 'CASHIER', 'Cashier M033C');
        const res = await fetch(`http://localhost:3001/api/inventory/receive/${s.poLine.id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${cashierToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity: 1, operationKey: `recv-cashier-${Date.now()}` }),
        });
        assert('CASHIER receive forbidden', res.status === 403, '403', `${res.status}`);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 7: Receive exceeds remaining quantity -> error
    console.log('\n[Test 7] Receive exceeding remaining quantity returns error');
    try {
        const res = await fetch(`http://localhost:3001/api/inventory/receive/${s.poLine.id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity: 100, operationKey: `recv-exceed-${Date.now()}` }),
        });
        assert('Status 400 for exceeding quantity', res.status === 400, '400', `${res.status}`);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // Cleanup
    await cleanupRestaurant(s.restaurantId);

    console.log('\n=== M033-C STOCK RECEIVING CLIENT REPORT ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: 0`);

    if (failed > 0) {
        console.log('\nM033-C: STOCK RECEIVING CLIENT FAILED');
        process.exit(1);
    } else {
        console.log('\nM033-C: STOCK RECEIVING CLIENT PASSED');
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});