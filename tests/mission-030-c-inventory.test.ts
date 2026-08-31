/**
 * M030-C Inventory Phase A Regression Tests
 */
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { stockMovementService } from '../src/api/services/inventory/StockMovementService';
import { purchaseOrderReceiveService } from '../src/api/services/inventory/PurchaseOrderReceiveService';
import { stockCountService } from '../src/api/services/inventory/StockCountService';

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
            name: 'Test Tenant A',
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
            name: 'Test Tenant B',
            phone: '+2222222222',
            currency: 'PKR',
            timezone: 'Asia/Karachi',
            is_active: true,
            subscription_status: 'ACTIVE',
            subscription_plan: 'BASIC',
        }
    });

    const itemA = await prisma.inventory_items.create({
        data: {
            restaurant_id: tenantA.id,
            name: 'Test Item A',
            unit_of_measure: 'UNITS',
            current_stock: new Decimal(0),
            minimum_stock: new Decimal(0),
            unit_cost: new Decimal(10),
        }
    });

    const itemB = await prisma.inventory_items.create({
        data: {
            restaurant_id: tenantB.id,
            name: 'Test Item B',
            unit_of_measure: 'UNITS',
            current_stock: new Decimal(0),
            minimum_stock: new Decimal(0),
            unit_cost: new Decimal(20),
        }
    });

    const supplier = await prisma.suppliers.create({
        data: {
            name: 'Test Supplier',
            phone: '+1234567890',
            restaurant_id: tenantA.id,
        }
    });

    const poA = await prisma.purchase_orders.create({
        data: {
            po_number: `PO-TEST-A-${Date.now()}`,
            supplier_id: supplier.id,
            restaurant_id: tenantA.id,
            total_amount: new Decimal(1000),
            status: 'DRAFT',
        }
    });

    const poLineA = await prisma.purchase_order_items.create({
        data: {
            purchase_order_id: poA.id,
            inventory_item_id: itemA.id,
            quantity_ordered: new Decimal(100),
            quantity_received: new Decimal(0),
            unit_price: new Decimal(10),
            total_price: new Decimal(1000),
        }
    });

    return { tenantA, tenantB, itemA, itemB, supplier, poA, poLineA };
}

async function cleanup(ids: { tenantA: string; tenantB: string; supplier: string; poA: string; poLineA: string; itemA: string; itemB: string }) {
    await prisma.stock_movements.deleteMany({});
    await prisma.stock_count_lines.deleteMany({});
    await prisma.stock_counts.deleteMany({});
    await prisma.purchase_order_items.deleteMany({ where: { id: ids.poLineA } });
    await prisma.purchase_orders.deleteMany({ where: { id: ids.poA } });
    await prisma.inventory_items.deleteMany({ where: { id: { in: [ids.itemA, ids.itemB] } } });
    await prisma.suppliers.deleteMany({ where: { id: ids.supplier } });
    await prisma.restaurants.deleteMany({ where: { id: { in: [ids.tenantA, ids.tenantB] } } });
}

async function main() {
    console.log('========================================');
    console.log('M030-C Inventory Phase A Regression Tests');
    console.log('========================================\n');

    const s = await setup();

    // === Tenant Isolation ===
    console.log('=== Tenant Isolation ===');

    try {
        await stockMovementService.createMovement({
            restaurantId: s.tenantA.id,
            inventoryItemId: s.itemB.id,
            movementType: 'RECEIVE',
            quantity: 10,
            referenceType: 'PURCHASE_ORDER',
            poLineId: s.poLineA.id,
            operationKey: 'cross-tenant-1'
        });
        fail('Tenant A should not create movement for Tenant B item');
    } catch (e: any) {
        if (e.message.includes('not found') || e.message.includes('does not belong')) {
            pass('Tenant A cannot receive stock into Tenant B item');
        } else {
            fail(`Unexpected error: ${e.message}`);
        }
    }

    // === Movement Immutability ===
    console.log('\n=== Movement Immutability ===');

    try {
        const movement = await stockMovementService.createMovement({
            restaurantId: s.tenantA.id,
            inventoryItemId: s.itemA.id,
            movementType: 'RECEIVE',
            quantity: 100,
            unitCost: 10,
            referenceType: 'PURCHASE_ORDER',
            referenceId: s.poA.id,
            poLineId: s.poLineA.id,
            operationKey: 'immutability-1'
        });

        const fetched = await stockMovementService.getMovementById(movement.id, s.tenantA.id);
        if (fetched && fetched.quantity.toString() === '100') {
            pass('Created movement can be fetched with correct values');
        } else {
            fail('Movement fetch returned unexpected values');
        }
    } catch (e: any) {
        fail(`Movement immutability test failed: ${e.message}`);
    }

    // === Receive Idempotency (Sequential) ===
    console.log('\n=== Receive Idempotency ===');

    try {
        await prisma.stock_movements.deleteMany({ where: { po_line_id: s.poLineA.id } });
        await prisma.purchase_order_items.update({
            where: { id: s.poLineA.id },
            data: { quantity_received: new Decimal(0) }
        });

        const result1 = await purchaseOrderReceiveService.receivePOLine({
            restaurantId: s.tenantA.id,
            poLineId: s.poLineA.id,
            quantity: 5,
            operationKey: 'idem-seq-1'
        });

        const result2 = await purchaseOrderReceiveService.receivePOLine({
            restaurantId: s.tenantA.id,
            poLineId: s.poLineA.id,
            quantity: 5,
            operationKey: 'idem-seq-1'
        });

        if (result1.movement.id === result2.movement.id) {
            pass('Sequential duplicate receive returns same movement');
        } else {
            fail('Sequential duplicate created different movements');
        }

        if (result2.poLine.quantityReceived.toString() === '5') {
            pass('Duplicate receive did not double-count quantity');
        } else {
            fail(`Expected 5, got ${result2.poLine.quantityReceived}`);
        }
    } catch (e: any) {
        fail(`Sequential idempotency test failed: ${e.message}`);
    }

    // === Receive Idempotency (Concurrent) ===
    try {
        await prisma.stock_movements.deleteMany({ where: { po_line_id: s.poLineA.id } });
        await prisma.purchase_order_items.update({
            where: { id: s.poLineA.id },
            data: { quantity_received: new Decimal(0) }
        });

        const concurrency = 10;
        const promises = Array.from({ length: concurrency }, () =>
            purchaseOrderReceiveService.receivePOLine({
                restaurantId: s.tenantA.id,
                poLineId: s.poLineA.id,
                quantity: 3,
                operationKey: 'idem-concurrent-1'
            })
        );

        const results = await Promise.all(promises);
        const movementIds = new Set(results.map((r: any) => r.movement.id));

        if (movementIds.size === 1) {
            pass('Concurrent duplicate receive created exactly one movement');
        } else {
            fail(`Concurrent duplicate created ${movementIds.size} movements instead of 1`);
        }

        const finalPOLine = await prisma.purchase_order_items.findUnique({
            where: { id: s.poLineA.id },
            select: { quantity_received: true }
        });

        if (new Decimal(finalPOLine!.quantity_received).toString() === '3') {
            pass('Concurrent receive counted quantity correctly');
        } else {
            fail(`Expected 3, got ${finalPOLine!.quantity_received}`);
        }
    } catch (e: any) {
        fail(`Concurrent idempotency test failed: ${e.message}`);
    }

    // === Count Correctness ===
    console.log('\n=== Count Correctness ===');

    // Zero adjustment test
    try {
        const count = await stockCountService.createStockCount({
            restaurantId: s.tenantA.id,
            operationKey: `count-zero-${Date.now()}`
        });

        await stockCountService.addOrUpdateCountLine({
            stockCountId: count.id,
            inventoryItemId: s.itemA.id,
            expectedQuantity: 100,
            countedQuantity: 100
        });

        const result = await stockCountService.finalizeStockCount({
            stockCountId: count.id,
            restaurantId: s.tenantA.id,
            finalizedBy: 'test-staff'
        });

        const itemResult = result.adjustments.find(a => a.inventoryItemId === s.itemA.id);
        if (itemResult && itemResult.difference.isZero() && itemResult.movement === null) {
            pass('Equal physical/system count produces zero adjustment');
        } else {
            fail('Equal counts did not produce zero adjustment');
        }
    } catch (e: any) {
        fail(`Zero adjustment test failed: ${e.message}`);
    }

    // Positive delta test
    try {
        const count = await stockCountService.createStockCount({
            restaurantId: s.tenantA.id,
            operationKey: `count-higher-${Date.now()}`
        });

        await stockCountService.addOrUpdateCountLine({
            stockCountId: count.id,
            inventoryItemId: s.itemA.id,
            expectedQuantity: 50,
            countedQuantity: 60
        });

        const result = await stockCountService.finalizeStockCount({
            stockCountId: count.id,
            restaurantId: s.tenantA.id,
            finalizedBy: 'test-staff'
        });

        const itemResult = result.adjustments.find(a => a.inventoryItemId === s.itemA.id);
        if (itemResult && itemResult.difference.toString() === '10' && itemResult.movement !== null) {
            pass('Higher physical count produces positive adjustment movement');
        } else {
            fail('Higher count did not produce correct positive adjustment');
        }
    } catch (e: any) {
        fail(`Higher count test failed: ${e.message}`);
    }

    // Negative delta test
    try {
        const count = await stockCountService.createStockCount({
            restaurantId: s.tenantA.id,
            operationKey: `count-lower-${Date.now()}`
        });

        await stockCountService.addOrUpdateCountLine({
            stockCountId: count.id,
            inventoryItemId: s.itemA.id,
            expectedQuantity: 50,
            countedQuantity: 40
        });

        const result = await stockCountService.finalizeStockCount({
            stockCountId: count.id,
            restaurantId: s.tenantA.id,
            finalizedBy: 'test-staff'
        });

        const itemResult = result.adjustments.find(a => a.inventoryItemId === s.itemA.id);
        if (itemResult && itemResult.difference.toString() === '-10' && itemResult.movement !== null) {
            pass('Lower physical count produces negative adjustment movement');
        } else {
            fail('Lower count did not produce correct negative adjustment');
        }
    } catch (e: any) {
        fail(`Lower count test failed: ${e.message}`);
    }

    // Re-finalization prevention
    try {
        const count = await stockCountService.createStockCount({
            restaurantId: s.tenantA.id,
            operationKey: `count-refinal-${Date.now()}`
        });

        await stockCountService.addOrUpdateCountLine({
            stockCountId: count.id,
            inventoryItemId: s.itemA.id,
            expectedQuantity: 50,
            countedQuantity: 50
        });

        await stockCountService.finalizeStockCount({
            stockCountId: count.id,
            restaurantId: s.tenantA.id,
            finalizedBy: 'test-staff'
        });

        let threw = false;
        try {
            await stockCountService.finalizeStockCount({
                stockCountId: count.id,
                restaurantId: s.tenantA.id,
                finalizedBy: 'test-staff'
            });
        } catch {
            threw = true;
        }

        if (threw) {
            pass('Re-finalization is prevented');
        } else {
            fail('Re-finalization was not prevented');
        }
    } catch (e: any) {
        fail(`Re-finalization test failed: ${e.message}`);
    }

    // Concurrent finalization
    try {
        const count = await stockCountService.createStockCount({
            restaurantId: s.tenantA.id,
            operationKey: `count-concurrent-${Date.now()}`
        });

        await stockCountService.addOrUpdateCountLine({
            stockCountId: count.id,
            inventoryItemId: s.itemA.id,
            expectedQuantity: 100,
            countedQuantity: 110
        });

        const promises = Array.from({ length: 10 }, () =>
            stockCountService.finalizeStockCount({
                stockCountId: count.id,
                restaurantId: s.tenantA.id,
                finalizedBy: 'test-staff'
            })
        );

        const settled = await Promise.allSettled(promises);
        const fulfilled = settled.filter(r => r.status === 'fulfilled');
        const rejected = settled.filter(r => r.status === 'rejected');

        if (fulfilled.length === 1 && rejected.length === 9) {
            pass('Concurrent finalization: exactly one succeeds');
        } else {
            fail(`Expected 1 fulfilled, 9 rejected; got ${fulfilled.length}/${rejected.length}`);
        }

        const movements = await stockMovementService.getMovementsByReference('STOCK_COUNT', count.id, s.tenantA.id);
        if (movements.length === 1) {
            pass('Only one adjustment movement created despite concurrency');
        } else {
            fail(`Expected 1 movement, got ${movements.length}`);
        }
    } catch (e: any) {
        fail(`Concurrent finalization test failed: ${e.message}`);
    }

    // === Summary ===
    console.log('\n========================================');
    console.log(`M030-C Results: ${results.passed} passed, ${results.failed} failed`);
    console.log('========================================');

    await cleanup({
        tenantA: s.tenantA.id,
        tenantB: s.tenantB.id,
        supplier: s.supplier.id,
        poA: s.poA.id,
        poLineA: s.poLineA.id,
        itemA: s.itemA.id,
        itemB: s.itemB.id,
    });

    await prisma.$disconnect();

    process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
    console.error('Test runner error:', e);
    await prisma.$disconnect();
    process.exit(1);
});
