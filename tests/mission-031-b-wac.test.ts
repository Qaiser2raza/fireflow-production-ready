/**
 * M031-B Inventory Phase B Regression Tests
 * 14-item test matrix: WAC, soft-negative, SERVED consumption, exactly-once COGS, count WAC, cross-tenant.
 */
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { stockMovementService } from '../src/api/services/inventory/StockMovementService';
import { purchaseOrderReceiveService } from '../src/api/services/inventory/PurchaseOrderReceiveService';
import { stockCountService } from '../src/api/services/inventory/StockCountService';
import { wacProjectionService } from '../src/api/services/inventory/WACProjectionService';
import { inventoryConsumptionService } from '../src/api/services/inventory/InventoryConsumptionService';
import { prisma as appPrisma } from '../src/shared/lib/prisma';

const prisma = new PrismaClient();

const results = { passed: 0, failed: 0 };

function pass(msg: string) {
    results.passed++;
    console.log(`  PASS: ${msg}`);
}

function fail(msg: string) {
    results.failed++;
    console.log(`  FAIL: ${msg}`);
}

async function setup() {
    const tenantA = await prisma.restaurants.create({
        data: {
            name: 'M031B Tenant A',
            phone: '+1111111111',
            currency: 'PKR',
            timezone: 'Asia/Karachi',
            is_active: true,
            subscription_status: 'ACTIVE',
            subscription_plan: 'BASIC',
        }
    });

    const tenantB = await prisma.restaurants.create({
        data: {
            name: 'M031B Tenant B',
            phone: '+2222222222',
            currency: 'PKR',
            timezone: 'Asia/Karachi',
            is_active: true,
            subscription_status: 'ACTIVE',
            subscription_plan: 'BASIC',
        }
    });

    const supplier = await prisma.suppliers.create({
        data: {
            name: 'M031B Supplier',
            phone: '+1234567890',
            restaurant_id: tenantA.id,
        }
    });

    return { tenantA, tenantB, supplier };
}

async function makeInventoryItem(restaurantId: string, name: string, unitCost: number) {
    return await prisma.inventory_items.create({
        data: {
            restaurant_id: restaurantId,
            name,
            unit_of_measure: 'UNITS',
            current_stock: new Decimal(0),
            minimum_stock: new Decimal(0),
            unit_cost: new Decimal(unitCost),
        }
    });
}

async function makePO(tenantId: string, supplierId: string, itemId: string, ordered: number, unitPrice: number) {
    const po = await prisma.purchase_orders.create({
        data: {
            po_number: `PO-M031B-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            supplier_id: supplierId,
            restaurant_id: tenantId,
            total_amount: new Decimal(ordered * unitPrice),
            status: 'DRAFT',
        }
    });
    const line = await prisma.purchase_order_items.create({
        data: {
            purchase_order_id: po.id,
            inventory_item_id: itemId,
            quantity_ordered: new Decimal(ordered),
            quantity_received: new Decimal(0),
            unit_price: new Decimal(unitPrice),
            total_price: new Decimal(ordered * unitPrice),
        }
    });
    return { po, line };
}

async function cleanup() {
    await prisma.journal_entry_lines.deleteMany({});
    await prisma.stock_movements.deleteMany({});
    await prisma.stock_count_lines.deleteMany({});
    await prisma.stock_counts.deleteMany({});
    await prisma.recipe_items.deleteMany({});
    await prisma.purchase_order_items.deleteMany({});
    await prisma.purchase_orders.deleteMany({});
    await prisma.suppliers.deleteMany({});
    await prisma.inventory_items.deleteMany({});
    await prisma.order_items.deleteMany({});
    await prisma.orders.deleteMany({});
    await prisma.menu_items.deleteMany({});
    await prisma.restaurants.deleteMany({});
    await prisma.chart_of_accounts.deleteMany({});
}

function approx(actual: Decimal, expected: number, tolerance = 0.01) {
    return Math.abs(Number(actual.toString()) - expected) < tolerance;
}

async function test1_weightedAverageReceive(s: any) {
    console.log('\n=== Test 1: Weighted-Average Receive ===');
    const item = await makeInventoryItem(s.tenantA.id, 'T1 Rice', 10);
    const { po, line } = await makePO(s.tenantA.id, s.supplier.id, item.id, 200, 12);

    const r1 = await purchaseOrderReceiveService.receivePOLine({
        restaurantId: s.tenantA.id, poLineId: line.id, quantity: 100, operationKey: 't1-r1'
    });

    const proj1 = await wacProjectionService.recalcWAC(item.id, s.tenantA.id);
    if (approx(proj1.averageUnitCost, 12, 0.0001) && approx(proj1.currentQuantity, 100)) {
        pass('Receive 100@12 -> WAC=12, qty=100');
    } else {
        fail(`WAC=${proj1.averageUnitCost}, qty=${proj1.currentQuantity}`);
    }

    const r2 = await purchaseOrderReceiveService.receivePOLine({
        restaurantId: s.tenantA.id, poLineId: line.id, quantity: 100, operationKey: 't1-r2'
    });
    const proj2 = await wacProjectionService.recalcWAC(item.id, s.tenantA.id);
    if (approx(proj2.averageUnitCost, 12, 0.0001) && approx(proj2.currentQuantity, 200)) {
        pass('Sequential receive 100@12 -> WAC=12, qty=200 (no change)');
    } else {
        fail(`WAC=${proj2.averageUnitCost}, qty=${proj2.currentQuantity}`);
    }

    const fetched = await stockMovementService.getMovementById(r1.movement.id, s.tenantA.id);
    if (fetched && fetched.totalCost.toString() === '1200') {
        pass('Movement cost snapshot: total_cost=1200 (100 * 12)');
    } else {
        fail(`totalCost=${fetched?.totalCost}`);
    }

    const r3 = await purchaseOrderReceiveService.receivePOLine({
        restaurantId: s.tenantA.id, poLineId: line.id, quantity: 100, operationKey: 't1-r2'  // duplicate
    });
    if (r3.movement.id === r2.movement.id) {
        pass('Duplicate receive does not create new movement');
    } else {
        fail('Duplicate receive created different movement');
    }
}

async function test2_sequentialReceivesChangingCosts(s: any) {
    console.log('\n=== Test 2: Sequential Receives With Changing Costs ===');
    const item = await makeInventoryItem(s.tenantA.id, 'T2 Oil', 50);
    // Two separate PO lines with different prices to test changing WAC
    const supplier = await prisma.suppliers.create({
        data: { name: 'M031B Supplier', phone: '+1234567890', restaurant_id: s.tenantA.id }
    });
    const { po: po1, line: line1 } = await makePO(s.tenantA.id, supplier.id, item.id, 100, 100);
    const { po: po2, line: line2 } = await makePO(s.tenantA.id, supplier.id, item.id, 100, 200);

    await purchaseOrderReceiveService.receivePOLine({
        restaurantId: s.tenantA.id, poLineId: line1.id, quantity: 100, operationKey: 't2-r1'
    });
    let proj = await wacProjectionService.recalcWAC(item.id, s.tenantA.id);
    if (approx(proj.averageUnitCost, 100, 0.0001)) pass('First receive 100@100 -> WAC=100');

    await purchaseOrderReceiveService.receivePOLine({
        restaurantId: s.tenantA.id, poLineId: line2.id, quantity: 100, operationKey: 't2-r2'
    });
    proj = await wacProjectionService.recalcWAC(item.id, s.tenantA.id);
    if (approx(proj.averageUnitCost, 150, 0.0001)) pass('Second receive 100@200 -> WAC=150 ((100*100+100*200)/200)');
    else fail(`WAC=${proj.averageUnitCost} (expected 150)`);
}

async function test3_softNegativeStock(s: any) {
    console.log('\n=== Test 3: Soft-Negative Stock ===');
    const item = await makeInventoryItem(s.tenantA.id, 'T3 Chicken', 0);

    await stockMovementService.createMovement({
        restaurantId: s.tenantA.id,
        inventoryItemId: item.id,
        movementType: 'CONSUME',
        quantity: -50,
        unitCost: 100,
        referenceType: 'RECIPE_USAGE',
        referenceId: null,
        operationKey: 't3-consume',
        createdBy: 'system'
    });

    await wacProjectionService.updateAverageCost(
        item.id, s.tenantA.id, new Decimal(-50), new Decimal(100)
    );

    const qty = await wacProjectionService.getCurrentQuantity(item.id, s.tenantA.id);
    if (qty.toString() === '-50') {
        pass('Negative quantity allowed: -50');
    } else {
        fail(`Expected -50, got ${qty}`);
    }

    const itemRow = await prisma.inventory_items.findUnique({ where: { id: item.id } });
    if (new Decimal(itemRow!.current_stock).toString() === '-50') {
        pass('inventory_items.current_stock reflects soft-negative: -50');
    } else {
        fail(`current_stock=${itemRow?.current_stock}`);
    }
}

async function test4_negativeToPositiveReplenishment(s: any) {
    console.log('\n=== Test 4: Negative-to-Positive Replenishment ===');
    const item = await makeInventoryItem(s.tenantA.id, 'T4 Salt', 0);
    const { po, line } = await makePO(s.tenantA.id, s.supplier.id, item.id, 200, 25);

    await stockMovementService.createMovement({
        restaurantId: s.tenantA.id,
        inventoryItemId: item.id,
        movementType: 'CONSUME',
        quantity: -80,
        unitCost: 20,
        referenceType: 'RECIPE_USAGE',
        referenceId: null,
        operationKey: 't4-consume',
        createdBy: 'system'
    });

    await wacProjectionService.updateAverageCost(
        item.id, s.tenantA.id, new Decimal(-80), new Decimal(20)
    );
    let qty = await wacProjectionService.getCurrentQuantity(item.id, s.tenantA.id);
    if (qty.toString() !== '-80') { fail(`Pre-state wrong: ${qty}`); return; }

    await purchaseOrderReceiveService.receivePOLine({
        restaurantId: s.tenantA.id, poLineId: line.id, quantity: 100, operationKey: 't4-r1'
    });
    qty = await wacProjectionService.getCurrentQuantity(item.id, s.tenantA.id);
    const proj = await wacProjectionService.recalcWAC(item.id, s.tenantA.id);
    const expectedBasis = -80 * 20 + 100 * 25;
    const expectedAvg = expectedBasis / 20;
    if (qty.toString() === '20' && approx(proj.averageUnitCost, expectedAvg, 0.01)) {
        pass(`Replenish from -80 -> +20, WAC=${proj.averageUnitCost.toString()} (expected ${expectedAvg})`);
    } else {
        fail(`qty=${qty}, WAC=${proj.averageUnitCost}, expected qty=20, avg=${expectedAvg}`);
    }
}

async function test5_costSnapshotImmutability(s: any) {
    console.log('\n=== Test 5: Cost Snapshot Immutability ===');
    const item = await makeInventoryItem(s.tenantA.id, 'T5 Sugar', 10);
    const { po, line } = await makePO(s.tenantA.id, s.supplier.id, item.id, 100, 10);

    const r = await purchaseOrderReceiveService.receivePOLine({
        restaurantId: s.tenantA.id, poLineId: line.id, quantity: 100, operationKey: 't5-r1'
    });

    const fetched1 = await stockMovementService.getMovementById(r.movement.id, s.tenantA.id);
    const snapshotUnit = fetched1!.unitCost.toString();
    const snapshotTotal = fetched1!.totalCost.toString();

    const mvtRow: any = await prisma.stock_movements.findUnique({ where: { id: r.movement.id } });
    if (mvtRow.unit_cost.toString() !== snapshotUnit) {
        fail(`unit_cost drift: ${mvtRow.unit_cost} vs ${snapshotUnit}`); return;
    }
    if (mvtRow.total_cost.toString() !== snapshotTotal) {
        fail(`total_cost drift: ${mvtRow.total_cost} vs ${snapshotTotal}`); return;
    }

    const updated = await prisma.inventory_items.update({
        where: { id: item.id },
        data: { unit_cost: new Decimal(999) }
    });
    if (new Decimal(updated.unit_cost).toString() === '999') pass('Inventory master can be updated');
    else fail(`Master update failed: ${updated.unit_cost}`);

    const mvtRow2: any = await prisma.stock_movements.findUnique({ where: { id: r.movement.id } });
    if (mvtRow2.unit_cost.toString() === snapshotUnit && mvtRow2.total_cost.toString() === snapshotTotal) {
        pass('Movement snapshot immutable to master unit_cost change');
    } else {
        fail(`Snapshot mutated: unit=${mvtRow2.unit_cost}, total=${mvtRow2.total_cost}`);
    }
}

async function test6_servedConsumption(s: any) {
    console.log('\n=== Test 6: SERVED Consumption ===');
    const item = await makeInventoryItem(s.tenantA.id, 'T6 Flour', 0);
    const menu = await prisma.menu_items.create({
        data: { restaurant_id: s.tenantA.id, name: 'T6 Bread', price: new Decimal(50), category: 'Baked', station: 'KITCHEN' }
    });
    await prisma.recipe_items.create({
        data: { menu_item_id: menu.id, inventory_item_id: item.id, quantity_required: new Decimal(0.5) }
    });
    const { po, line } = await makePO(s.tenantA.id, s.supplier.id, item.id, 100, 40);
    await purchaseOrderReceiveService.receivePOLine({
        restaurantId: s.tenantA.id, poLineId: line.id, quantity: 100, operationKey: 't6-r1'
    });

    const order = await prisma.orders.create({
        data: {
            restaurant_id: s.tenantA.id,
            order_number: `T6-${Date.now()}`,
            type: 'DINE_IN',
            status: 'ACTIVE',
            payment_status: 'UNPAID',
            total: new Decimal(100),
        }
    });
    await prisma.order_items.create({
        data: {
            order_id: order.id, menu_item_id: menu.id, quantity: 2,
            unit_price: new Decimal(50), total_price: new Decimal(100),
            item_name: 'T6 Bread', category: 'Baked', station: 'KITCHEN', item_status: 'DRAFT'
        }
    });

    const result = await inventoryConsumptionService.consumeOrderOnServed({
        orderId: order.id, restaurantId: s.tenantA.id
    });

    if (result.movements.length === 1) pass('One consumption movement created (1 inventory item)');
    else fail(`Got ${result.movements.length} movements`);

    if (result.movements[0].quantity.toString() === '-1') pass('Consumed qty = -1 (2 menu * 0.5 ingredient)');
    else fail(`Consumed qty=${result.movements[0].quantity}`);

    if (approx(result.totalCogs, 40, 0.0001)) pass(`COGS = 40 (1 * WAC 40)`);
    else fail(`COGS=${result.totalCogs}`);

    const qty = await wacProjectionService.getCurrentQuantity(item.id, s.tenantA.id);
    if (qty.toString() === '99') pass('Inventory: 100 - 1 = 99');
    else fail(`Inventory qty=${qty}`);
}

async function test7_duplicateServedIdempotency(s: any) {
    console.log('\n=== Test 7: Duplicate SERVED Idempotency ===');
    const item = await makeInventoryItem(s.tenantA.id, 'T7 Yeast', 0);
    const menu = await prisma.menu_items.create({
        data: { restaurant_id: s.tenantA.id, name: 'T7 Roll', price: new Decimal(30), category: 'Baked', station: 'KITCHEN' }
    });
    await prisma.recipe_items.create({
        data: { menu_item_id: menu.id, inventory_item_id: item.id, quantity_required: new Decimal(0.1) }
    });
    const { po, line } = await makePO(s.tenantA.id, s.supplier.id, item.id, 50, 200);
    await purchaseOrderReceiveService.receivePOLine({
        restaurantId: s.tenantA.id, poLineId: line.id, quantity: 50, operationKey: 't7-r1'
    });

    const order = await prisma.orders.create({
        data: {
            restaurant_id: s.tenantA.id,
            order_number: `T7-${Date.now()}`,
            type: 'DINE_IN', status: 'ACTIVE', payment_status: 'UNPAID', total: new Decimal(30),
        }
    });
    await prisma.order_items.create({
        data: {
            order_id: order.id, menu_item_id: menu.id, quantity: 1,
            unit_price: new Decimal(30), total_price: new Decimal(30),
            item_name: 'T7 Roll', category: 'Baked', station: 'KITCHEN', item_status: 'DRAFT'
        }
    });

    const r1 = await inventoryConsumptionService.consumeOrderOnServed({ orderId: order.id, restaurantId: s.tenantA.id });
    const r2 = await inventoryConsumptionService.consumeOrderOnServed({ orderId: order.id, restaurantId: s.tenantA.id });

    if (r1.movements.length === 1 && r2.movements.length === 1) {
        if (r1.movements[0].id === r2.movements[0].id) {
            pass('Duplicate SERVED returns same movement (idempotent)');
        } else {
            fail('Duplicate SERVED created new movement');
        }
    } else {
        fail(`Movements: r1=${r1.movements.length}, r2=${r2.movements.length}`);
    }

    const qty = await wacProjectionService.getCurrentQuantity(item.id, s.tenantA.id);
    if (qty.toString() === '49.9') pass(`Inventory: 50 - 0.1 = 49.9 (no double-consume)`);
    else fail(`Inventory qty=${qty}`);
}

async function test8_concurrentConsumption(s: any) {
    console.log('\n=== Test 8: Concurrent SERVED Consumption ===');
    const item = await makeInventoryItem(s.tenantA.id, 'T8 Tomato', 0);
    const menu = await prisma.menu_items.create({
        data: { restaurant_id: s.tenantA.id, name: 'T8 Sauce', price: new Decimal(40), category: 'Baked', station: 'KITCHEN' }
    });
    await prisma.recipe_items.create({
        data: { menu_item_id: menu.id, inventory_item_id: item.id, quantity_required: new Decimal(0.2) }
    });
    const { po, line } = await makePO(s.tenantA.id, s.supplier.id, item.id, 100, 50);
    await purchaseOrderReceiveService.receivePOLine({
        restaurantId: s.tenantA.id, poLineId: line.id, quantity: 100, operationKey: 't8-r1'
    });

    const order = await prisma.orders.create({
        data: {
            restaurant_id: s.tenantA.id,
            order_number: `T8-${Date.now()}`,
            type: 'DINE_IN', status: 'ACTIVE', payment_status: 'UNPAID', total: new Decimal(40),
        }
    });
    await prisma.order_items.create({
        data: {
            order_id: order.id, menu_item_id: menu.id, quantity: 1,
            unit_price: new Decimal(40), total_price: new Decimal(40),
            item_name: 'T8 Sauce', category: 'Baked', station: 'KITCHEN', item_status: 'DRAFT'
        }
    });

    const concurrency = 10;
    const promises = Array.from({ length: concurrency }, () =>
        inventoryConsumptionService.consumeOrderOnServed({ orderId: order.id, restaurantId: s.tenantA.id })
    );
    const settled = await Promise.allSettled(promises);
    const fulfilled = settled.filter(r => r.status === 'fulfilled');
    if (fulfilled.length === concurrency) pass(`Concurrent: all ${concurrency} consume calls succeeded (each idempotent)`);
    else fail(`Concurrent: ${fulfilled.length}/${concurrency} succeeded`);

    const consumeMovements = await prisma.stock_movements.findMany({
        where: { reference_type: 'RECIPE_USAGE', reference_id: order.id, restaurant_id: s.tenantA.id }
    });
    if (consumeMovements.length === 1) pass('Only 1 consumption movement despite 10 concurrent calls');
    else fail(`Got ${consumeMovements.length} consumption movements`);

    const qty = await wacProjectionService.getCurrentQuantity(item.id, s.tenantA.id);
    if (qty.toString() === '99.8') pass(`Inventory: 100 - 0.2 = 99.8 (no double-consume)`);
    else fail(`Inventory qty=${qty}`);
}

async function test9_oneCogsJournalPerOrder(s: any) {
    console.log('\n=== Test 9: One ORDER_COGS Journal Per Order ===');
    const item = await makeInventoryItem(s.tenantA.id, 'T9 Milk', 0);
    const menu = await prisma.menu_items.create({
        data: { restaurant_id: s.tenantA.id, name: 'T9 Latte', price: new Decimal(60), category: 'Drinks', station: 'KITCHEN' }
    });
    await prisma.recipe_items.create({
        data: { menu_item_id: menu.id, inventory_item_id: item.id, quantity_required: new Decimal(0.3) }
    });
    const { po, line } = await makePO(s.tenantA.id, s.supplier.id, item.id, 50, 100);
    await purchaseOrderReceiveService.receivePOLine({
        restaurantId: s.tenantA.id, poLineId: line.id, quantity: 50, operationKey: 't9-r1'
    });

    const order = await prisma.orders.create({
        data: {
            restaurant_id: s.tenantA.id,
            order_number: `T9-${Date.now()}`,
            type: 'DINE_IN', status: 'ACTIVE', payment_status: 'UNPAID', total: new Decimal(60),
        }
    });
    await prisma.order_items.create({
        data: {
            order_id: order.id, menu_item_id: menu.id, quantity: 1,
            unit_price: new Decimal(60), total_price: new Decimal(60),
            item_name: 'T9 Latte', category: 'Drinks', station: 'KITCHEN', item_status: 'DRAFT'
        }
    });

    // Seed COA for COGS journal posting
    await prisma.chart_of_accounts.createMany({
        data: [
            { restaurant_id: s.tenantA.id, code: '1060', name: 'Inventory Asset', type: 'ASSET' },
            { restaurant_id: s.tenantA.id, code: '5020', name: 'COGS', type: 'EXPENSE' },
        ],
        skipDuplicates: true,
    });

    // Test 9a: Call production consumption path (which internally posts COGS journal)
    const consume = await inventoryConsumptionService.consumeOrderOnServed({
        orderId: order.id,
        restaurantId: s.tenantA.id
    });
    const totalCogs = consume.totalCogs;

    // Verify the journal was created via production path
    const jCount = await prisma.journal_entries.count({
        where: { reference_type: 'ORDER_COGS', reference_id: order.id, restaurant_id: s.tenantA.id }
    });
    if (jCount === 1) pass('One ORDER_COGS journal for the order');
    else fail(`Got ${jCount} journals`);

    // Test 9b: Idempotency — calling again should NOT create a second journal
    await inventoryConsumptionService.consumeOrderOnServed({
        orderId: order.id,
        restaurantId: s.tenantA.id
    });
    const jCount2 = await prisma.journal_entries.count({
        where: { reference_type: 'ORDER_COGS', reference_id: order.id, restaurant_id: s.tenantA.id }
    });
    if (jCount2 === 1) pass('Idempotent: still one ORDER_COGS journal after second call');
    else fail(`Got ${jCount2} journals after second call`);

    // Test 9c: Verify journal lines balance
    const journal = await prisma.journal_entries.findFirst({
        where: { reference_type: 'ORDER_COGS', reference_id: order.id, restaurant_id: s.tenantA.id },
        include: { journal_entry_lines: true }
    });
    if (journal && journal.journal_entry_lines.length === 2) {
        const lines = journal.journal_entry_lines;
        const cogsLine = lines.find(l => l.debit.toString() === totalCogs.toString());
        const invLine = lines.find(l => l.credit.toString() === totalCogs.toString());
        if (cogsLine && invLine) {
            pass('Journal lines balance: DR COGS = CR Inventory');
        } else {
            fail('Journal lines do not balance');
        }
    } else {
        fail(`Journal has ${journal?.journal_entry_lines.length || 0} lines, expected 2`);
    }
}

async function test10_journalAmountEqualsMovements(s: any) {
    console.log('\n=== Test 10: COGS Journal Amount = Sum of Movement Costs ===');
    const item = await makeInventoryItem(s.tenantA.id, 'T10 Beans', 0);
    const menu = await prisma.menu_items.create({
        data: { restaurant_id: s.tenantA.id, name: 'T10 Coffee', price: new Decimal(80), category: 'Drinks', station: 'KITCHEN' }
    });
    await prisma.recipe_items.create({
        data: { menu_item_id: menu.id, inventory_item_id: item.id, quantity_required: new Decimal(0.25) }
    });
    const { po, line } = await makePO(s.tenantA.id, s.supplier.id, item.id, 50, 200);
    await purchaseOrderReceiveService.receivePOLine({
        restaurantId: s.tenantA.id, poLineId: line.id, quantity: 50, operationKey: 't10-r1'
    });

    const order = await prisma.orders.create({
        data: {
            restaurant_id: s.tenantA.id,
            order_number: `T10-${Date.now()}`,
            type: 'DINE_IN', status: 'ACTIVE', payment_status: 'UNPAID', total: new Decimal(80),
        }
    });
    await prisma.order_items.create({
        data: {
            order_id: order.id, menu_item_id: menu.id, quantity: 1,
            unit_price: new Decimal(80), total_price: new Decimal(80),
            item_name: 'T10 Coffee', category: 'Drinks', station: 'KITCHEN', item_status: 'DRAFT'
        }
    });

    const consume = await inventoryConsumptionService.consumeOrderOnServed({ orderId: order.id, restaurantId: s.tenantA.id });
    const movementCosts = consume.movements.reduce((s, m) => s.plus(new Decimal(m.totalCost.toString()).abs()), new Decimal(0));
    if (consume.totalCogs.toString() === movementCosts.toString()) {
        pass(`COGS total (${consume.totalCogs}) === sum of movement totalCost absolute values (${movementCosts})`);
    } else {
        fail(`Mismatch: cogs=${consume.totalCogs}, sum=${movementCosts}`);
    }
}

async function test11_positiveCountAdjustmentAtWAC(s: any) {
    console.log('\n=== Test 11: Positive Count Adjustment at WAC ===');
    const item = await makeInventoryItem(s.tenantA.id, 'T11 Pepper', 0);
    const { po, line } = await makePO(s.tenantA.id, s.supplier.id, item.id, 100, 80);
    await purchaseOrderReceiveService.receivePOLine({
        restaurantId: s.tenantA.id, poLineId: line.id, quantity: 100, operationKey: 't11-r1'
    });

    const count = await stockCountService.createStockCount({
        restaurantId: s.tenantA.id, operationKey: `t11-count-${Date.now()}`
    });
    await stockCountService.addOrUpdateCountLine({
        stockCountId: count.id, inventoryItemId: item.id,
        expectedQuantity: 100, countedQuantity: 110
    });
    const result = await stockCountService.finalizeStockCount({
        stockCountId: count.id, restaurantId: s.tenantA.id, finalizedBy: 'tester'
    });
    const adj = result.adjustments[0];
    if (adj.movement && adj.movement.unitCost.toString() === '80') {
        pass('Positive adjustment valued at WAC=80');
    } else {
        fail(`unitCost=${adj.movement?.unitCost}, expected 80`);
    }

    const qty = await wacProjectionService.getCurrentQuantity(item.id, s.tenantA.id);
    if (qty.toString() === '110') pass('Inventory: 100 + 10 = 110');
    else fail(`Inventory qty=${qty}`);
}

async function test12_negativeCountAdjustmentAtWAC(s: any) {
    console.log('\n=== Test 12: Negative Count Adjustment at WAC ===');
    const item = await makeInventoryItem(s.tenantA.id, 'T12 Cumin', 0);
    const { po, line } = await makePO(s.tenantA.id, s.supplier.id, item.id, 100, 60);
    await purchaseOrderReceiveService.receivePOLine({
        restaurantId: s.tenantA.id, poLineId: line.id, quantity: 100, operationKey: 't12-r1'
    });

    const count = await stockCountService.createStockCount({
        restaurantId: s.tenantA.id, operationKey: `t12-count-${Date.now()}`
    });
    await stockCountService.addOrUpdateCountLine({
        stockCountId: count.id, inventoryItemId: item.id,
        expectedQuantity: 100, countedQuantity: 85
    });
    const result = await stockCountService.finalizeStockCount({
        stockCountId: count.id, restaurantId: s.tenantA.id, finalizedBy: 'tester'
    });
    const adj = result.adjustments[0];
    if (adj.movement && adj.movement.unitCost.toString() === '60') {
        pass('Negative adjustment valued at WAC=60');
    } else {
        fail(`unitCost=${adj.movement?.unitCost}`);
    }
    if (adj.difference.toString() === '-15') pass('Difference = -15');
    else fail(`Difference=${adj.difference}`);
}

async function test13_zeroVarianceNoMovement(s: any) {
    console.log('\n=== Test 13: Zero Variance Creates No Movement ===');
    const item = await makeInventoryItem(s.tenantA.id, 'T13 Water', 0);
    const { po, line } = await makePO(s.tenantA.id, s.supplier.id, item.id, 100, 5);
    await purchaseOrderReceiveService.receivePOLine({
        restaurantId: s.tenantA.id, poLineId: line.id, quantity: 100, operationKey: 't13-r1'
    });

    const count = await stockCountService.createStockCount({
        restaurantId: s.tenantA.id, operationKey: `t13-count-${Date.now()}`
    });
    await stockCountService.addOrUpdateCountLine({
        stockCountId: count.id, inventoryItemId: item.id,
        expectedQuantity: 100, countedQuantity: 100
    });
    const result = await stockCountService.finalizeStockCount({
        stockCountId: count.id, restaurantId: s.tenantA.id, finalizedBy: 'tester'
    });
    if (result.adjustments[0].movement === null) pass('Zero variance: no movement created');
    else fail('Zero variance still created movement');

    const mvtCount = await prisma.stock_movements.count({ where: { reference_type: 'STOCK_COUNT', reference_id: count.id } });
    if (mvtCount === 0) pass('No stock_movements row for zero variance');
    else fail(`Got ${mvtCount} stock_movements`);
}

async function test14_crossTenantRejection(s: any) {
    console.log('\n=== Test 14: Cross-Tenant Rejection ===');
    const itemA = await makeInventoryItem(s.tenantA.id, 'T14 A-Item', 10);
    const itemB = await makeInventoryItem(s.tenantB.id, 'T14 B-Item', 20);

    let threw = false;
    try {
        await stockMovementService.createMovement({
            restaurantId: s.tenantA.id,
            inventoryItemId: itemB.id,
            movementType: 'CONSUME',
            quantity: 5,
            referenceType: 'RECIPE_USAGE',
            referenceId: 'cross-tenant-attack',
            operationKey: 't14-cross',
            createdBy: 'attacker'
        });
    } catch { threw = true; }
    if (threw) pass('Tenant A cannot consume from Tenant B item');
    else fail('Cross-tenant consume was allowed');

    const menu = await prisma.menu_items.create({
        data: { restaurant_id: s.tenantA.id, name: 'T14 Dish', price: new Decimal(50), category: 'Test', station: 'KITCHEN' }
    });
    await prisma.recipe_items.create({
        data: { menu_item_id: menu.id, inventory_item_id: itemB.id, quantity_required: new Decimal(0.5) }
    });
    const order = await prisma.orders.create({
        data: {
            restaurant_id: s.tenantA.id,
            order_number: `T14-${Date.now()}`,
            type: 'DINE_IN', status: 'ACTIVE', payment_status: 'UNPAID', total: new Decimal(50),
        }
    });
    await prisma.order_items.create({
        data: {
            order_id: order.id, menu_item_id: menu.id, quantity: 1,
            unit_price: new Decimal(50), total_price: new Decimal(50),
            item_name: 'T14 Dish', category: 'Test', station: 'KITCHEN', item_status: 'DRAFT'
        }
    });

    threw = false;
    try {
        await inventoryConsumptionService.consumeOrderOnServed({
            orderId: order.id, restaurantId: s.tenantA.id
        });
    } catch { threw = true; }
    if (threw) pass('consumeOrderOnServed rejects cross-tenant recipe resolution');
    else fail('Cross-tenant recipe consumption was allowed');
}

async function main() {
    console.log('========================================');
    console.log('M031-B Inventory Phase B Regression Tests');
    console.log('========================================');

    await cleanup();
    const s = await setup();

    try {
        await test1_weightedAverageReceive(s);
        await test2_sequentialReceivesChangingCosts(s);
        await test3_softNegativeStock(s);
        await test4_negativeToPositiveReplenishment(s);
        await test5_costSnapshotImmutability(s);
        await test6_servedConsumption(s);
        await test7_duplicateServedIdempotency(s);
        await test8_concurrentConsumption(s);
        await test9_oneCogsJournalPerOrder(s);
        await test10_journalAmountEqualsMovements(s);
        await test11_positiveCountAdjustmentAtWAC(s);
        await test12_negativeCountAdjustmentAtWAC(s);
        await test13_zeroVarianceNoMovement(s);
        await test14_crossTenantRejection(s);
    } catch (e: any) {
        fail(`Unexpected error in tests: ${e.message}\n${e.stack}`);
    }

    console.log('\n========================================');
    console.log(`M031-B Results: ${results.passed} passed, ${results.failed} failed`);
    console.log('========================================');

    await cleanup();
    await prisma.$disconnect();
    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
    console.error('Test runner error:', e);
    await cleanup();
    await prisma.$disconnect();
    process.exit(1);
});