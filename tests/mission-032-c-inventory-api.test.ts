/**
 * M032-C Inventory API Integration Audit
 * HTTP-boundary regression suite for the mounted inventoryRoutes.
 * Uses the same authenticated integration-test pattern as tenant-isolation-api.test.ts.
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

async function cleanupAllRestaurants() {
    const all = await prisma.restaurants.findMany({ select: { id: true } });
    for (const r of all) {
        await cleanupRestaurant(r.id);
    }
}

async function createTestStaff(restaurantId: string, name: string, role: string, pin: string, status: string = 'active'): Promise<any> {
    const pinHash = await bcrypt.hash(pin, 12);
    return prisma.staff.create({
        data: {
            restaurant_id: restaurantId,
            name,
            role,
            pin,
            hashed_pin: pinHash,
            status,
        },
    });
}

async function setup() {
    console.log('--- SETUP M032-C INVENTORY API TESTS ---\n');
    await cleanupAllRestaurants();

    // Provision two restaurants
    const resultA = await restaurantProvisioningService.provisionRestaurant({
        name: 'M032-C Tenant A',
        slug: 'm032c-tenant-a',
        subscriptionPlan: 'BASIC',
        subscriptionStatus: 'active',
        ownerName: 'Owner A',
        ownerEmail: `m032c-a-${Date.now()}@test.fireflow`,
    });

    const resultB = await restaurantProvisioningService.provisionRestaurant({
        name: 'M032-C Tenant B',
        slug: 'm032c-tenant-b',
        subscriptionPlan: 'BASIC',
        subscriptionStatus: 'active',
        ownerName: 'Owner B',
        ownerEmail: `m032c-b-${Date.now()}@test.fireflow`,
    });

    if (!resultA.success || !resultB.success || !resultA.restaurant?.id || !resultB.restaurant?.id) {
        throw new Error('Provisioning failed');
    }

    const restaurantAId = resultA.restaurant.id;
    const restaurantBId = resultB.restaurant.id;

    await prisma.restaurants.updateMany({
        where: { id: { in: [restaurantAId, restaurantBId] } },
        data: { onboarding_status: 'ACTIVE' },
    });

    // Create staff for each restaurant
    const managerA = await createTestStaff(restaurantAId, 'Manager A', 'MANAGER', '111111');
    const adminA = await createTestStaff(restaurantAId, 'Admin A', 'ADMIN', '222222');
    const cashierA = await createTestStaff(restaurantAId, 'Cashier A', 'CASHIER', '333333');
    const superAdminA = await createTestStaff(restaurantAId, 'Super Admin A', 'SUPER_ADMIN', '444444');

    const managerB = await createTestStaff(restaurantBId, 'Manager B', 'MANAGER', '555555');
    const adminB = await createTestStaff(restaurantBId, 'Admin B', 'ADMIN', '666666');

    // Create suppliers for each restaurant
    const supplierA = await prisma.suppliers.create({
        data: { restaurant_id: restaurantAId, name: 'Supplier A', phone: '+1111111111' },
    });
    const supplierB = await prisma.suppliers.create({
        data: { restaurant_id: restaurantBId, name: 'Supplier B', phone: '+2222222222' },
    });

    // Generate tokens
    const tokenManagerA = jwtService.generateAccessToken(managerA.id, restaurantAId, 'MANAGER', 'Manager A');
    const tokenAdminA = jwtService.generateAccessToken(adminA.id, restaurantAId, 'ADMIN', 'Admin A');
    const tokenCashierA = jwtService.generateAccessToken(cashierA.id, restaurantAId, 'CASHIER', 'Cashier A');
    const tokenSuperAdminA = jwtService.generateAccessToken(superAdminA.id, restaurantAId, 'SUPER_ADMIN', 'Super Admin A');
    const tokenManagerB = jwtService.generateAccessToken(managerB.id, restaurantBId, 'MANAGER', 'Manager B');
    const tokenAdminB = jwtService.generateAccessToken(adminB.id, restaurantBId, 'ADMIN', 'Admin B');

    return {
        restaurantAId,
        restaurantBId,
        managerA,
        adminA,
        cashierA,
        superAdminA,
        managerB,
        adminB,
        supplierA,
        supplierB,
        tokenManagerA,
        tokenAdminA,
        tokenCashierA,
        tokenSuperAdminA,
        tokenManagerB,
        tokenAdminB,
    };
}

async function runTests() {
    console.log('--- STARTING M032-C INVENTORY API INTEGRATION AUDIT ---\n');
    const s = await setup();

    // TEST 1: Unauthenticated -> 401
    console.log('[Test 1] Unauthenticated requests to inventory routes return 401');
    try {
        const res = await fetch('http://localhost:3001/api/inventory/items');
        assert('GET /api/inventory/items unauthenticated', res.status === 401, '401', `${res.status}`);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 2: Tenant A can read own inventory, Tenant B cannot access Tenant A's items
    console.log('\n[Test 2] Tenant isolation in inventory listing');
    try {
        const resA = await fetch('http://localhost:3001/api/inventory/items', {
            headers: { 'Authorization': `Bearer ${s.tokenManagerA}` },
        });
        assert('Tenant A can read own inventory', resA.status === 200, '200', `${resA.status}`);
        const dataA = await resA.json();
        assert('Tenant A inventory items returned', dataA.items !== undefined, 'items array', `absent`);

        // Cross-tenant access
        const resB = await fetch(`http://localhost:3001/api/inventory/items?restaurant_id=${s.restaurantBId}`, {
            headers: { 'Authorization': `Bearer ${s.tokenManagerA}` },
        });
        assert('Tenant A cannot override to read Tenant B via query param', resB.status === 200, '200 (own items)', `${resB.status}`);
        const dataB = await resB.json();
        assert('Cross-tenant isolation enforced (no Tenant B items)', !dataB.items?.some((item: any) => item.restaurantId === s.restaurantBId), 'isolation', 'leaked');
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 3: CASHIER forbidden from write operations (receive, counts)
    console.log('\n[Test 3] CASHIER role cannot perform write operations');
    try {
        const res = await fetch('http://localhost:3001/api/inventory/receive/00000000-0000-0000-0000-000000000000', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.tokenCashierA}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity: 10, operationKey: 'test-cashier' }),
        });
        assert('CASHIER receive forbidden', res.status === 403, '403', `${res.status}`);

        const countRes = await fetch('http://localhost:3001/api/inventory/counts', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.tokenCashierA}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ operationKey: 'test-cashier-count' }),
        });
        assert('CASHIER count creation forbidden', countRes.status === 403, '403', `${countRes.status}`);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 4: Manager receive -> creates movement + WAC update
    console.log('\n[Test 4] Manager receive creates movement and updates WAC');
    try {
        // Create a test item
        const item = await prisma.inventory_items.create({
            data: {
                restaurant_id: s.restaurantAId,
                name: 'Test Item',
                unit_of_measure: 'UNITS',
                current_stock: new Decimal(0),
                unit_cost: new Decimal(10),
                average_unit_cost: new Decimal(10),
                total_cost_basis: new Decimal(0),
                minimum_stock: new Decimal(0),
                category: 'Test',
            },
        });

        const po = await prisma.purchase_orders.create({
            data: {
                po_number: `PO-M32C-${Date.now()}`,
                supplier_id: s.supplierA.id,
                restaurant_id: s.restaurantAId,
                total_amount: new Decimal(100),
                status: 'DRAFT',
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

        const res = await fetch(`http://localhost:3001/api/inventory/receive/${poLine.id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.tokenManagerA}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity: 5, operationKey: 'm32c-receive' }),
        });
        assert('Manager receive returns success', res.status === 200, '200', `${res.status}`);
        const data = await res.json();
        assert('Movement created in response', data.movement?.id, 'has movement id', 'missing');

        // Verify movement exists
        const movement = await prisma.stock_movements.findFirst({ where: { operation_key: 'm32c-receive', restaurant_id: s.restaurantAId } });
        assert('Movement persisted in DB', movement !== null, 'found', 'not found');

        // Verify WAC updated via projection service
        const projection = await prisma.inventory_items.findFirst({ where: { id: item.id, restaurant_id: s.restaurantAId }, select: { current_stock: true, average_unit_cost: true } });
        assert('WAC projection updated', projection?.current_stock.toString() === '5', 'stock=5', `stock=${projection?.current_stock}`);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 5: Duplicate receive -> idempotent (no duplicate movement)
    console.log('\n[Test 5] Duplicate receive is idempotent');
    try {
        const item = await prisma.inventory_items.create({
            data: {
                restaurant_id: s.restaurantAId,
                name: 'Test Item Dup',
                unit_of_measure: 'UNITS',
                current_stock: new Decimal(0),
                unit_cost: new Decimal(20),
                average_unit_cost: new Decimal(20),
                total_cost_basis: new Decimal(0),
                minimum_stock: new Decimal(0),
                category: 'Test',
            },
        });

        const po = await prisma.purchase_orders.create({
            data: {
                po_number: `PO-M32C-${Date.now()}`,
                supplier_id: s.supplierA.id,
                restaurant_id: s.restaurantAId,
                total_amount: new Decimal(200),
                status: 'DRAFT',
            },
        });
        const poLine = await prisma.purchase_order_items.create({
            data: {
                purchase_order_id: po.id,
                inventory_item_id: item.id,
                quantity_ordered: new Decimal(5),
                quantity_received: new Decimal(0),
                unit_price: new Decimal(20),
                total_price: new Decimal(100),
            },
        });

        // First receive
        const res1 = await fetch(`http://localhost:3001/api/inventory/receive/${poLine.id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.tokenManagerA}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity: 2, operationKey: 'm32c-dup-receive' }),
        });
        assert('First receive succeeds', res1.status === 200, '200', `${res1.status}`);
        const data1 = await res1.json();
        const movementId1 = data1.movement?.id;

        // Duplicate receive
        const res2 = await fetch(`http://localhost:3001/api/inventory/receive/${poLine.id}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.tokenManagerA}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity: 2, operationKey: 'm32c-dup-receive' }),
        });
        assert('Duplicate receive returns same movement id', res2.status === 200, '200', `${res2.status}`);
        const data2 = await res2.json();
        assert('Same movement ID returned', data2.movement?.id === movementId1, 'id match', 'id mismatch');

        // Verify only one movement in DB
        const movements = await prisma.stock_movements.findMany({ where: { operation_key: 'm32c-dup-receive', restaurant_id: s.restaurantAId } });
        assert('Only one movement persisted for duplicate', movements.length === 1, '1 movement', `${movements.length}`);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 6: Stock count lifecycle -> OPEN → CLOSED with adjustment movement
    console.log('\n[Test 6] Stock count lifecycle OPEN → CLOSED');
    try {
        // Create stock count
        const countRes = await fetch('http://localhost:3001/api/inventory/counts', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.tokenManagerA}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ operationKey: 'm32c-count' }),
        });
        assert('Count creation succeeds', countRes.status === 201, '201', `${countRes.status}`);
        const countData = await countRes.json();
        const countId = countData.stockCount.id;

        // Add lines
        const item = await prisma.inventory_items.create({
            data: {
                restaurant_id: s.restaurantAId,
                name: 'Test Count Item',
                unit_of_measure: 'UNITS',
                current_stock: new Decimal(10),
                unit_cost: new Decimal(5),
                average_unit_cost: new Decimal(5),
                total_cost_basis: new Decimal(50),
                minimum_stock: new Decimal(0),
                category: 'Test',
            },
        });

        const lineRes = await fetch(`http://localhost:3001/api/inventory/counts/${countId}/lines`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${s.tokenManagerA}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ inventoryItemId: item.id, expectedQuantity: 10, countedQuantity: 12 }),
        });
        assert('Line addition succeeds', lineRes.status === 200, '200', `${lineRes.status}`);

        // Finalize
        const finalizeRes = await fetch(`http://localhost:3001/api/inventory/counts/${countId}/finalize`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.tokenManagerA}`, 'Content-Type': 'application/json' },
        });
        assert('Count finalization succeeds', finalizeRes.status === 200, '200', `${finalizeRes.status}`);
        const finalizeData = await finalizeRes.json();
        assert('Adjustment movement created', finalizeData.adjustments[0]?.movementId, 'has movement', 'missing');

        // Verify movement created
        const movement = await prisma.stock_movements.findFirst({ where: { reference_type: 'STOCK_COUNT', reference_id: countId, restaurant_id: s.restaurantAId } });
        assert('Adjustment movement persisted', movement !== null, 'found', 'not found');
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 7: Concurrent finalize -> exactly one adjustment movement
    console.log('\n[Test 7] Concurrent finalize produces exactly one adjustment movement');
    try {
        const countRes = await fetch('http://localhost:3001/api/inventory/counts', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.tokenManagerA}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ operationKey: 'm32c-concurrent-count' }),
        });
        const countId = (await countRes.json()).stockCount.id;

        const item = await prisma.inventory_items.create({
            data: {
                restaurant_id: s.restaurantAId,
                name: 'Test Concurrent Item',
                unit_of_measure: 'UNITS',
                current_stock: new Decimal(20),
                unit_cost: new Decimal(3),
                average_unit_cost: new Decimal(3),
                total_cost_basis: new Decimal(60),
                minimum_stock: new Decimal(0),
                category: 'Test',
            },
        });

        // Add line for the item
        await fetch(`http://localhost:3001/api/inventory/counts/${countId}/lines`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${s.tokenManagerA}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ inventoryItemId: item.id, expectedQuantity: 20, countedQuantity: 25 }),
        });

        // Concurrent finalize calls (promise.all)
        const promises = Array.from({ length: 5 }, () => fetch(`http://localhost:3001/api/inventory/counts/${countId}/finalize`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.tokenManagerA}`, 'Content-Type': 'application/json' },
        }));

        const responses = await Promise.all(promises);
        const successCount = responses.filter(res => res.status === 200).length;
        assert('All concurrent finalizations succeed or conflict gracefully', successCount > 0, '>0', `${successCount}`);

        // Verify exactly one adjustment movement despite concurrent calls
        const movements = await prisma.stock_movements.findMany({ where: { reference_type: 'STOCK_COUNT', reference_id: countId, restaurant_id: s.restaurantAId } });
        assert('Only one adjustment movement persisted despite concurrent calls', movements.length === 1, '1 movement', `${movements.length}`);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 8: Negative-stock endpoint -> tenant-scoped results only
    console.log('\n[Test 8] Negative-stock endpoint tenant isolation');
    try {
        const itemA = await prisma.inventory_items.create({
            data: {
                restaurant_id: s.restaurantAId,
                name: 'Negative A',
                unit_of_measure: 'UNITS',
                current_stock: new Decimal(-5),
                unit_cost: new Decimal(1),
                average_unit_cost: new Decimal(1),
                total_cost_basis: new Decimal(-5),
                minimum_stock: new Decimal(0),
                category: 'Test',
            },
        });

        const itemB = await prisma.inventory_items.create({
            data: {
                restaurant_id: s.restaurantBId,
                name: 'Negative B',
                unit_of_measure: 'UNITS',
                current_stock: new Decimal(-10),
                unit_cost: new Decimal(2),
                average_unit_cost: new Decimal(2),
                total_cost_basis: new Decimal(-20),
                minimum_stock: new Decimal(0),
                category: 'Test',
            },
        });

        const resA = await fetch('http://localhost:3001/api/inventory/negative-stock', {
            headers: { 'Authorization': `Bearer ${s.tokenManagerA}` },
        });
        assert('Tenant A can read negative stock', resA.status === 200, '200', `${resA.status}`);
        const dataA = await resA.json();
        assert('Tenant A only sees its own negative items', dataA.items.length === 1 && dataA.items[0].id === itemA.id, '1 item', `${dataA.items.length}`);

        const resB = await fetch('http://localhost:3001/api/inventory/negative-stock', {
            headers: { 'Authorization': `Bearer ${s.tokenManagerB}` },
        });
        assert('Tenant B can read its own negative stock', resB.status === 200, '200', `${resB.status}`);
        const dataB = await resB.json();
        assert('Tenant B only sees its own negative items', dataB.items.length === 1 && dataB.items[0].id === itemB.id, '1 item', `${dataB.items.length}`);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 9: Consumption endpoint -> movement + exactly one ORDER_COGS journal
    console.log('\n[Test 9] Consumption creates movement and exactly one ORDER_COGS journal');
    try {
        // Create a test item
        const item = await prisma.inventory_items.create({
            data: {
                restaurant_id: s.restaurantAId,
                name: 'Test Consumed Item',
                unit_of_measure: 'UNITS',
                current_stock: new Decimal(50),
                unit_cost: new Decimal(10),
                average_unit_cost: new Decimal(10),
                total_cost_basis: new Decimal(500),
                minimum_stock: new Decimal(0),
                category: 'Test',
            },
        });

        // Create COA entries for COGS journal
        await prisma.chart_of_accounts.createMany({
            data: [
                { restaurant_id: s.restaurantAId, code: '1060', name: 'Inventory Asset', type: 'ASSET' },
                { restaurant_id: s.restaurantAId, code: '5020', name: 'COGS', type: 'EXPENSE' },
            ],
            skipDuplicates: true,
        });

        // Create order and menu items for consumption
        const menu = await prisma.menu_items.create({
            data: { restaurant_id: s.restaurantAId, name: 'Test Dish', price: new Decimal(30), category: 'FOOD', station: 'KITCHEN' },
        });
        await prisma.recipe_items.create({
            data: { menu_item_id: menu.id, inventory_item_id: item.id, quantity_required: new Decimal(0.5) },
        });

const order = await prisma.orders.create({
            data: {
                restaurant_id: s.restaurantAId,
                order_number: `ORD${Date.now().toString().slice(-8)}`,
                type: 'DINE_IN',
                status: 'ACTIVE',
                payment_status: 'UNPAID',
                total: new Decimal(30),
            },
        });
        await prisma.order_items.create({
            data: {
                order_id: order.id,
                menu_item_id: menu.id,
                quantity: 2,
                unit_price: new Decimal(15),
                total_price: new Decimal(30),
                item_name: 'Test Dish',
                category: 'FOOD',
                station: 'KITCHEN',
                item_status: 'DRAFT',
            },
        });

        const res = await fetch(`http://localhost:3001/api/inventory/orders/${order.id}/consume`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.tokenManagerA}`, 'Content-Type': 'application/json' },
        });
        assert('Consumption succeeds', res.status === 200, '200', `${res.status}`);
        const data = await res.json();
        assert('Movement created', data.movements.length === 1, '1 movement', `${data.movements.length}`);

        // Verify exactly one ORDER_COGS journal
        const journalCount = await prisma.journal_entries.count({
            where: { reference_type: 'ORDER_COGS', reference_id: order.id, restaurant_id: s.restaurantAId },
        });
        assert('Exactly one ORDER_COGS journal created despite concurrent calls', journalCount === 1, '1 journal', `${journalCount}`);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // TEST 10: Concurrent consumption -> still converges to one logical result
    console.log('\n[Test 10] Concurrent consumption converges to one logical result');
    try {
        // Create a test item
        const item = await prisma.inventory_items.create({
            data: {
                restaurant_id: s.restaurantAId,
                name: 'Test Concurrent Consume',
                unit_of_measure: 'UNITS',
                current_stock: new Decimal(100),
                unit_cost: new Decimal(5),
                average_unit_cost: new Decimal(5),
                total_cost_basis: new Decimal(500),
                minimum_stock: new Decimal(0),
                category: 'Test',
            },
        });

        // Create COA entries for COGS journal
        await prisma.chart_of_accounts.createMany({
            data: [
                { restaurant_id: s.restaurantAId, code: '1060', name: 'Inventory Asset', type: 'ASSET' },
                { restaurant_id: s.restaurantAId, code: '5020', name: 'COGS', type: 'EXPENSE' },
            ],
            skipDuplicates: true,
        });

        // Create order and menu items for consumption
        const menu = await prisma.menu_items.create({
            data: { restaurant_id: s.restaurantAId, name: 'Concurrent Dish', price: new Decimal(20), category: 'FOOD', station: 'KITCHEN' },
        });
        await prisma.recipe_items.create({
            data: { menu_item_id: menu.id, inventory_item_id: item.id, quantity_required: new Decimal(0.2) },
        });

        const order = await prisma.orders.create({
            data: {
                restaurant_id: s.restaurantAId,
                order_number: `ORD${Date.now().toString().slice(-8)}C`,
                type: 'DINE_IN',
                status: 'ACTIVE',
                payment_status: 'UNPAID',
                total: new Decimal(20),
            },
        });
        await prisma.order_items.create({
            data: {
                order_id: order.id,
                menu_item_id: menu.id,
                quantity: 1,
                unit_price: new Decimal(20),
                total_price: new Decimal(20),
                item_name: 'Concurrent Dish',
                category: 'FOOD',
                station: 'KITCHEN',
                item_status: 'DRAFT',
            },
        });

        // Concurrent consumption calls
        const promises = Array.from({ length: 10 }, () => fetch(`http://localhost:3001/api/inventory/orders/${order.id}/consume`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${s.tokenManagerA}`, 'Content-Type': 'application/json' },
        }));

        const responses = await Promise.all(promises);
        const successCount = responses.filter(res => res.status === 200).length;
        assert('All concurrent consumption calls succeed', successCount === 10, '10 success', `${successCount}`);

        // Verify only one movement created
        const movements = await prisma.stock_movements.findMany({
            where: { reference_type: 'RECIPE_USAGE', reference_id: order.id, restaurant_id: s.restaurantAId },
        });
        assert('Only one movement created despite concurrent calls', movements.length === 1, '1 movement', `${movements.length}`);

        // Verify only one ORDER_COGS journal despite concurrent calls
        const journalCount = await prisma.journal_entries.count({
            where: { reference_type: 'ORDER_COGS', reference_id: order.id, restaurant_id: s.restaurantAId },
        });
        assert('Only one ORDER_COGS journal created despite concurrent calls', journalCount === 1, '1 journal', `${journalCount}`);
    } catch (e) {
        failed++;
        console.log('  FAIL: Exception', e);
    }

    // Cleanup
    await cleanupRestaurant(s.restaurantAId);
    await cleanupRestaurant(s.restaurantBId);

    console.log('\n=== M032-C INVENTORY API AUDIT REPORT ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: 0`);

    if (failed > 0) {
        console.log('\nM032-C: INVENTORY API AUDIT FAILED — failures detected');
        process.exit(1);
    } else {
        console.log('\nM032-C: INVENTORY API AUDIT PASSED');
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
