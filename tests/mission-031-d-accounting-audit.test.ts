/**
 * M031-D Inventory Phase B Accounting Integrity Audit
 * ──────────────────────────────────────────────────────────────────────────
 * Tests the accounting boundary for ORDER_COGS journal posting:
 *   1. Atomicity      — consumption committed even if COGS journal fails
 *   2. Concurrency    — two concurrent calls cannot create duplicate journals
 *   3. COA Fallback    — missing accounts produce auditable trace, not silent skip
 *   4. Zero-COGS      — zero COGS legitimately produces no journal
 *   5. Journal Authority — amounts sourced from immutable movement snapshots
 * ──────────────────────────────────────────────────────────────────────────
 */
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { purchaseOrderReceiveService } from '../src/api/services/inventory/PurchaseOrderReceiveService';
import { inventoryConsumptionService } from '../src/api/services/inventory/InventoryConsumptionService';
import { journalEntryService } from '../src/api/services/JournalEntryService';
import { prisma as appPrisma } from '../src/shared/lib/prisma';

const prisma = new PrismaClient();

const audit = { passed: 0, failed: 0, warnings: 0 };

function pass(msg: string) {
    audit.passed++;
    console.log(`  PASS: ${msg}`);
}

function fail(msg: string) {
    audit.failed++;
    console.log(`  FAIL: ${msg}`);
}

function warn(msg: string) {
    audit.warnings++;
    console.log(`  WARN: ${msg}`);
}

async function setup() {
    const tenant = await prisma.restaurants.create({
        data: {
            name: 'M031D Audit Tenant',
            phone: '+9999999999',
            currency: 'PKR',
            timezone: 'Asia/Karachi',
            is_active: true,
            subscription_status: 'ACTIVE',
            subscription_plan: 'BASIC',
        }
    });

    // Seed COA accounts needed for COGS journal posting
    await prisma.chart_of_accounts.createMany({
        data: [
            { restaurant_id: tenant.id, code: '1060', name: 'Inventory Asset', type: 'ASSET' },
            { restaurant_id: tenant.id, code: '5020', name: 'Cost of Goods Sold', type: 'EXPENSE' },
            { restaurant_id: tenant.id, code: '1000', name: 'Cash', type: 'ASSET' },
            { restaurant_id: tenant.id, code: '4000', name: 'Food Revenue', type: 'REVENUE' },
        ],
        skipDuplicates: true,
    });

    const supplier = await prisma.suppliers.create({
        data: {
            name: 'M031D Supplier',
            phone: '+1234567890',
            restaurant_id: tenant.id,
        }
    });

    return { tenant, supplier };
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
            po_number: `PO-M031D-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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

async function makeOrderWithMenu(tenantId: string, itemId: string, orderQty: number) {
    const menu = await prisma.menu_items.create({
        data: { restaurant_id: tenantId, name: 'Audit Menu Item', price: new Decimal(100), category: 'Main', station: 'KITCHEN' }
    });
    await prisma.recipe_items.create({
        data: { menu_item_id: menu.id, inventory_item_id: itemId, quantity_required: new Decimal(1) }
    });
    const order = await prisma.orders.create({
        data: {
            restaurant_id: tenantId,
            order_number: `M031D-${Date.now()}`,
            type: 'DINE_IN', status: 'ACTIVE', payment_status: 'UNPAID', total: new Decimal(100),
        }
    });
    await prisma.order_items.create({
        data: {
            order_id: order.id, menu_item_id: menu.id, quantity: orderQty,
            unit_price: new Decimal(100), total_price: new Decimal(100),
            item_name: 'Audit Item', category: 'Main', station: 'KITCHEN', item_status: 'DRAFT'
        }
    });
    return order;
}

async function cleanup(tenantId: string) {
    await prisma.journal_entry_lines.deleteMany({
        where: { journal_entries: { restaurant_id: tenantId } }
    });
    await prisma.journal_entries.deleteMany({ where: { restaurant_id: tenantId } });
    await prisma.stock_movements.deleteMany({ where: { restaurant_id: tenantId } });
    await prisma.stock_count_lines.deleteMany({ where: { stock_counts: { restaurant_id: tenantId } } });
    await prisma.stock_counts.deleteMany({ where: { restaurant_id: tenantId } });
    await prisma.recipe_items.deleteMany({ where: { menu_items: { restaurant_id: tenantId } } });
    await prisma.purchase_order_items.deleteMany({ where: { purchase_orders: { restaurant_id: tenantId } } });
    await prisma.purchase_orders.deleteMany({ where: { restaurant_id: tenantId } });
    await prisma.suppliers.deleteMany({ where: { restaurant_id: tenantId } });
    await prisma.inventory_items.deleteMany({ where: { restaurant_id: tenantId } });
    await prisma.order_items.deleteMany({ where: { orders: { restaurant_id: tenantId } } });
    await prisma.orders.deleteMany({ where: { restaurant_id: tenantId } });
    await prisma.menu_items.deleteMany({ where: { restaurant_id: tenantId } });
    await prisma.chart_of_accounts.deleteMany({ where: { restaurant_id: tenantId } });
    await prisma.restaurants.deleteMany({ where: { id: tenantId } });
}

// ─── TEST 1: Atomicity ────────────────────────────────────────────────────────
/**
 * Verify consumption is committed even if the COGS journal throws.
 * Strategy: remove COA accounts to force the journal post to return early,
 * then verify stock movements were still created.
 */
async function test1_atomicity() {
    console.log('\n=== Audit 1: Atomicity — Consumption committed if COGS journal fails ===');

    const { tenant, supplier } = await setup();
    const item = await makeInventoryItem(tenant.id, 'Atomicity Item', 50);
    const { po, line } = await makePO(tenant.id, supplier.id, item.id, 100, 50);
    await purchaseOrderReceiveService.receivePOLine({
        restaurantId: tenant.id, poLineId: line.id, quantity: 100, operationKey: 'a1-r1'
    });

    // Remove COA accounts to force journal to skip
    await prisma.chart_of_accounts.deleteMany({
        where: { restaurant_id: tenant.id, code: { in: ['1060', '5020'] } }
    });

    const order = await makeOrderWithMenu(tenant.id, item.id, 1);

    // Capture console.warn to verify the warning is emitted
    let warnLogged = false;
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => {
        if (args[0]?.includes?.('COGS journal post failed') || args[0]?.includes?.('[JE] recordOrderCOGSJournal')) warnLogged = true;
        originalWarn.apply(console, args);
    };

    const result = await inventoryConsumptionService.consumeOrderOnServed({
        orderId: order.id, restaurantId: tenant.id
    });

    console.warn = originalWarn;

    // Verify consumption happened despite journal skip
    const movements = await prisma.stock_movements.findMany({
        where: { restaurant_id: tenant.id, reference_id: order.id }
    });
    if (movements.length === 1) {
        pass('Consumption movement created even with COA missing');
    } else {
        fail(`Expected 1 movement, got ${movements.length}`);
    }

    // Verify journal was NOT created (accounts missing)
    const journal = await prisma.journal_entries.findFirst({
        where: { reference_type: 'ORDER_COGS', reference_id: order.id, restaurant_id: tenant.id }
    });
    if (!journal) {
        pass('No ORDER_COGS journal created when accounts missing');
    } else {
        fail('Unexpected journal created without accounts');
    }

    // Verify COGS cost was still calculated
    if (result.totalCogs.toString() === '50') {
        pass('Total COGS calculated correctly: 50');
    } else {
        fail(`Total COGS was ${result.totalCogs}, expected 50`);
    }

    // Verify the warning was emitted
    if (warnLogged) {
        pass('COGS journal failure emitted a console.warn');
    } else {
        fail('COGS journal failure did NOT emit a console.warn — silent failure');
    }

    await cleanup(tenant.id);
}

// ─── TEST 2: Concurrency ───────────────────────────────────────────────────
/**
 * Verify two concurrent consumeOrderOnServed calls cannot create duplicate journals.
 * Strategy: call consumeOrderOnServed twice in parallel and verify exactly 1 journal.
 */
async function test2_concurrency() {
    console.log('\n=== Audit 2: Concurrency — No duplicate journals under concurrent calls ===');

    const { tenant, supplier } = await setup();
    const item = await makeInventoryItem(tenant.id, 'Concurrency Item', 100);
    const { po, line } = await makePO(tenant.id, supplier.id, item.id, 100, 100);
    await purchaseOrderReceiveService.receivePOLine({
        restaurantId: tenant.id, poLineId: line.id, quantity: 100, operationKey: 'a2-r1'
    });

    const order = await makeOrderWithMenu(tenant.id, item.id, 1);

    // Clear any prior consumption
    await prisma.stock_movements.deleteMany({
        where: { restaurant_id: tenant.id, reference_id: order.id }
    });
    await prisma.journal_entries.deleteMany({
        where: { reference_type: 'ORDER_COGS', reference_id: order.id, restaurant_id: tenant.id }
    });

    // Call twice in parallel — same operation (default prefix 'CONSUME')
    // This tests the real-world scenario of duplicate SERVED events
    const [result1, result2] = await Promise.all([
        inventoryConsumptionService.consumeOrderOnServed({
            orderId: order.id, restaurantId: tenant.id
        }),
        inventoryConsumptionService.consumeOrderOnServed({
            orderId: order.id, restaurantId: tenant.id
        }),
    ]);

    // Verify exactly 1 journal
    const jCount = await prisma.journal_entries.count({
        where: { reference_type: 'ORDER_COGS', reference_id: order.id, restaurant_id: tenant.id }
    });
    if (jCount === 1) {
        pass('Exactly 1 ORDER_COGS journal after concurrent calls');
    } else {
        fail(`Got ${jCount} ORDER_COGS journals — concurrency created duplicates`);
    }

    // Verify exactly 1 consumption movement (idempotency at movement level)
    const mCount = await prisma.stock_movements.count({
        where: { restaurant_id: tenant.id, reference_id: order.id }
    });
    if (mCount === 1) {
        pass('Exactly 1 consumption movement (idempotency)');
    } else {
        fail(`Got ${mCount} consumption movements`);
    }

    // Verify both callers got the same result
    if (result1.totalCogs.equals(result2.totalCogs)) {
        pass('Both callers got same totalCogs result');
    } else {
        fail(`Caller 1: ${result1.totalCogs}, Caller 2: ${result2.totalCogs}`);
    }

    await cleanup(tenant.id);
}

// ─── TEST 3: COA Fallback Auditability ──────────────────────────────────────
/**
 * Verify missing accounts produce a console.warn, not silent failure.
 */
async function test3_coa_fallback() {
    console.log('\n=== Audit 3: COA Fallback — Missing accounts produce auditable trace ===');

    const { tenant, supplier } = await setup();
    const item = await makeInventoryItem(tenant.id, 'COA Fallback Item', 50);
    const { po, line } = await makePO(tenant.id, supplier.id, item.id, 50, 50);
    await purchaseOrderReceiveService.receivePOLine({
        restaurantId: tenant.id, poLineId: line.id, quantity: 50, operationKey: 'a3-r1'
    });

    // Remove COA accounts to force fallback
    await prisma.chart_of_accounts.deleteMany({
        where: { restaurant_id: tenant.id, code: { in: ['1060', '5020'] } }
    });

    const order = await makeOrderWithMenu(tenant.id, item.id, 1);

    let warnMessage = '';
    const originalWarn = console.warn;
    console.warn = (msg: string, ...args: any[]) => {
        warnMessage = String(msg);
        originalWarn(msg, ...args);
    };

    await inventoryConsumptionService.consumeOrderOnServed({
        orderId: order.id, restaurantId: tenant.id
    });

    console.warn = originalWarn;

    // The service emits a warn on journal failure; additionally the journal service
    // silently returns when accounts are missing. We track both paths.
    const journal = await prisma.journal_entries.findFirst({
        where: { reference_type: 'ORDER_COGS', reference_id: order.id, restaurant_id: tenant.id }
    });

    if (!journal) {
        pass('No journal created when accounts missing (expected)');
    } else {
        fail('Unexpected journal created without accounts');
    }

    if (warnMessage.includes('COGS journal post failed') || warnMessage.includes('[JE] recordOrderCOGSJournal')) {
        pass('Missing COA produced a console.warn');
    } else {
        warn('No specific warning for missing COA — check if audit trail is sufficient');
    }

    await cleanup(tenant.id);
}

// ─── TEST 4: Zero-COGS Behavior ─────────────────────────────────────────────
/**
 * Verify zero COGS produces no journal entry.
 */
async function test4_zero_cogs() {
    console.log('\n=== Audit 4: Zero-COGS — No journal created when consumption cost is zero ===');

    const { tenant, supplier } = await setup();
    const item = await makeInventoryItem(tenant.id, 'Zero COGS Item', 0); // unit cost = 0
    const { po, line } = await makePO(tenant.id, supplier.id, item.id, 100, 0);
    await purchaseOrderReceiveService.receivePOLine({
        restaurantId: tenant.id, poLineId: line.id, quantity: 100, operationKey: 'a4-r1'
    });

    const order = await makeOrderWithMenu(tenant.id, item.id, 1);

    const result = await inventoryConsumptionService.consumeOrderOnServed({
        orderId: order.id, restaurantId: tenant.id
    });

    const journal = await prisma.journal_entries.findFirst({
        where: { reference_type: 'ORDER_COGS', reference_id: order.id, restaurant_id: tenant.id }
    });

    if (result.totalCogs.isZero()) {
        pass('Total COGS is zero');
    } else {
        fail(`Total COGS should be zero, got ${result.totalCogs}`);
    }

    if (!journal) {
        pass('No ORDER_COGS journal created for zero COGS');
    } else {
        fail('Journal created for zero COGS — should be skipped');
    }

    await cleanup(tenant.id);
}

// ─── TEST 5: Journal Authority — Amounts from Immutable Snapshots ────────────
/**
 * Verify journal COGS amount matches the sum of movement total_cost snapshots,
 * NOT the current WAC or inventory master cost.
 */
async function test5_journal_authority() {
    console.log('\n=== Audit 5: Journal Authority — Amounts from immutable movement snapshots ===');

    const { tenant, supplier } = await setup();
    const item = await makeInventoryItem(tenant.id, 'Authority Item', 100);
    const { po, line } = await makePO(tenant.id, supplier.id, item.id, 100, 100);
    await purchaseOrderReceiveService.receivePOLine({
        restaurantId: tenant.id, poLineId: line.id, quantity: 100, operationKey: 'a5-r1'
    });

    // Verify initial WAC
    const itemAfterReceive = await prisma.inventory_items.findUnique({ where: { id: item.id } });
    const wacAfterReceive = Number(itemAfterReceive?.average_unit_cost?.toString() || 0);
    if (wacAfterReceive === 100) {
        pass('Initial WAC after receive: 100');
    } else {
        fail(`WAC after receive should be 100, got ${wacAfterReceive}`);
    }

    const order = await makeOrderWithMenu(tenant.id, item.id, 1);

    // Consume the order
    const result = await inventoryConsumptionService.consumeOrderOnServed({
        orderId: order.id, restaurantId: tenant.id
    });

    // Read the immutable movement total_cost snapshots
    const movements = await prisma.stock_movements.findMany({
        where: { restaurant_id: tenant.id, reference_id: order.id, movement_type: 'CONSUME' }
    });
    const sumFromSnapshots = movements.reduce(
        (sum, m) => sum.plus(new Decimal(m.total_cost.toString()).abs()),
        new Decimal(0)
    );

    // Journal amount should match movement snapshots
    const journal = await prisma.journal_entries.findFirst({
        where: { reference_type: 'ORDER_COGS', reference_id: order.id, restaurant_id: tenant.id },
        include: { journal_entry_lines: true }
    });

    if (journal && journal.journal_entry_lines.length === 2) {
        const cogsLine = journal.journal_entry_lines.find(l => l.debit && Number(l.debit) > 0);
        const journalCogs = new Decimal(cogsLine?.debit?.toString() || '0');

        if (journalCogs.equals(sumFromSnapshots)) {
            pass(`Journal COGS (${journalCogs}) matches sum of movement snapshots (${sumFromSnapshots})`);
        } else {
            fail(`Journal COGS (${journalCogs}) != movement snapshots (${sumFromSnapshots})`);
        }

        // Verify journal amount matches service result
        if (journalCogs.equals(result.totalCogs)) {
            pass(`Journal COGS matches consumeOrderOnServed result`);
        } else {
            fail(`Journal COGS (${journalCogs}) != service result (${result.totalCogs})`);
        }

        // Now change the master unit_cost and verify journal amount does NOT change
        await prisma.inventory_items.update({
            where: { id: item.id },
            data: { unit_cost: new Decimal(999) }
        });

        const journalAfterUpdate = await prisma.journal_entries.findFirst({
            where: { reference_type: 'ORDER_COGS', reference_id: order.id, restaurant_id: tenant.id },
            include: { journal_entry_lines: true }
        });
        const cogsLineAfter = journalAfterUpdate?.journal_entry_lines.find(l => l.debit && Number(l.debit) > 0);
        const journalCogsAfter = new Decimal(cogsLineAfter?.debit?.toString() || '0');

        if (journalCogsAfter.equals(journalCogs)) {
            pass('Journal COGS unchanged after master cost update — immutable snapshot confirmed');
        } else {
            fail(`Journal COGS changed from ${journalCogs} to ${journalCogsAfter} after master update`);
        }
    } else {
        fail(`Journal not found or wrong line count: ${journal?.journal_entry_lines.length || 0}`);
    }

    await cleanup(tenant.id);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
    console.log('========================================');
    console.log('M031-D Inventory Phase B Accounting Integrity Audit');
    console.log('========================================');

    try {
        await test1_atomicity();
        await test2_concurrency();
        await test3_coa_fallback();
        await test4_zero_cogs();
        await test5_journal_authority();
    } catch (e) {
        fail(`Audit threw: ${e instanceof Error ? e.message : e}`);
        console.error(e);
    }

    console.log('\n========================================');
    console.log(`M031-D Audit Results: ${audit.passed} passed, ${audit.failed} failed, ${audit.warnings} warnings`);
    console.log('========================================');

    if (audit.failed > 0) {
        process.exit(1);
    }
}

main()
    .then(() => prisma.$disconnect())
    .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
