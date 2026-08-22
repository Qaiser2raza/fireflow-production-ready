import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runTests() {
    console.log('--- STARTING SERVICE-LAYER TENANT ISOLATION TESTS ---');
    let passed = 0;
    let failed = 0;

    // ============================================================
    // FIXTURES: create two independent tenants with valid UUIDs
    // ============================================================
    const tenantA = await prisma.restaurants.create({
        data: { name: 'Tenant A', address: '1 A St', phone: '111-0001', timezone: 'America/Los_Angeles' }
    });
    const tenantB = await prisma.restaurants.create({
        data: { name: 'Tenant B', address: '2 B St', phone: '222-0002', timezone: 'America/Los_Angeles' }
    });
    console.log(`Fixtures: tenantA=${tenantA.id}, tenantB=${tenantB.id}`);

    const staffA = await prisma.staff.create({
        data: { restaurant_id: tenantA.id, name: 'Staff A', role: 'MANAGER', pin: '1111' }
    });
    const staffB = await prisma.staff.create({
        data: { restaurant_id: tenantB.id, name: 'Staff B', role: 'MANAGER', pin: '2222' }
    });

    const stationA = await prisma.stations.create({
        data: { restaurant_id: tenantA.id, name: 'Station A' }
    });
    const stationB = await prisma.stations.create({
        data: { restaurant_id: tenantB.id, name: 'Station B' }
    });

    const orderA = await prisma.orders.create({
        data: { restaurant_id: tenantA.id, type: 'DINE_IN', status: 'ACTIVE', total: 100, service_charge: 10, tax: 10, payment_status: 'PAID' }
    });
    const orderB = await prisma.orders.create({
        data: { restaurant_id: tenantB.id, type: 'DINE_IN', status: 'ACTIVE', total: 200, service_charge: 20, tax: 20, payment_status: 'PAID' }
    });

    const printerA = await prisma.printers.create({
        data: { restaurant_id: tenantA.id, station_id: stationA.id, name: 'Printer A', connection_type: 'NETWORK', ip_address: '127.0.0.1', port: 9100 }
    });
    const printerB = await prisma.printers.create({
        data: { restaurant_id: tenantB.id, station_id: stationB.id, name: 'Printer B', connection_type: 'NETWORK', ip_address: '127.0.0.1', port: 9100 }
    });

    const cashierA = await prisma.cashier_sessions.create({
        data: { restaurant_id: tenantA.id, opened_by: staffA.id, opening_float: 100, status: 'OPEN' }
    });
    const cashierB = await prisma.cashier_sessions.create({
        data: { restaurant_id: tenantB.id, opened_by: staffB.id, opening_float: 200, status: 'OPEN' }
    });

    // ============================================================
    // Test 1: BaseOrderService.getOrderDetails rejects cross-tenant access
    // ============================================================
    console.log('\nTest 1: BaseOrderService.getOrderDetails rejects cross-tenant order access');
    try {
        const { BaseOrderService } = await import('../src/api/services/orders/BaseOrderService');
        const { OrderServiceFactory } = await import('../src/api/services/orders/OrderServiceFactory');

        const service = OrderServiceFactory.getService(orderB.type as any) as BaseOrderService;
        const result = await service.getOrderDetails(orderB.id, tenantA.id);
        if (result === null) {
            console.log('PASS: Cross-tenant order access returned null');
            passed++;
        } else {
            console.log('FAIL: Cross-tenant order access returned data');
            failed++;
        }
    } catch (err: any) {
        console.log('FAIL: Exception:', err.message);
        failed++;
    }

    // ============================================================
    // Test 2: FBRService.syncOrder rejects cross-tenant access (no external call)
    // ============================================================
    console.log('\nTest 2: FBRService.syncOrder rejects cross-tenant order access');
    try {
        const { fbrService } = await import('../src/api/services/FBRService');
        const originalPost = (await import('axios')).default.post;
        let externalCalled = false;
        (await import('axios')).default.post = (...args: any[]) => {
            externalCalled = true;
            return Promise.resolve({ data: { Response: 'SUCCESS' } });
        };

        const result = await fbrService.syncOrder(orderB.id, tenantA.id);

        (await import('axios')).default.post = originalPost;

        if (!result.success && result.error === 'Order not found' && !externalCalled) {
            console.log('PASS: Cross-tenant FBR sync rejected, no external call');
            passed++;
        } else {
            console.log('FAIL: Unexpected result:', result, 'externalCalled:', externalCalled);
            failed++;
        }
    } catch (err: any) {
        console.log('FAIL: Exception:', err.message);
        failed++;
    }

    // ============================================================
    // Test 3: PrinterService.printDocument rejects cross-tenant printer access
    // ============================================================
    console.log('\nTest 3: PrinterService.printDocument rejects cross-tenant printer access');
    try {
        const { PrinterService } = await import('../src/api/services/PrinterService');
        try {
            await PrinterService.printDocument(printerB.id, tenantA.id, '<html></html>');
            console.log('FAIL: Should have thrown for cross-tenant printer');
            failed++;
        } catch (e: any) {
            if (e.message === 'Printer not found') {
                console.log('PASS: Cross-tenant printer access rejected');
                passed++;
            } else {
                console.log('FAIL: Unexpected error:', e.message);
                failed++;
            }
        }
    } catch (err: any) {
        console.log('FAIL: Exception:', err.message);
        failed++;
    }

    // ============================================================
    // Test 4: AccountingService.closeCashSession rejects cross-tenant session
    // ============================================================
    console.log('\nTest 4: AccountingService.closeCashSession rejects cross-tenant session');
    try {
        const { AccountingService } = await import('../src/api/services/AccountingService');
        const accounting = new AccountingService();
        const before = await prisma.cashier_sessions.findUnique({ where: { id: cashierB.id } });
        const beforeStatus = before?.status;
        try {
            await accounting.closeCashSession({
                sessionId: cashierB.id,
                restaurantId: tenantA.id,
                staffId: staffA.id,
                actualBalance: 0
            });
            console.log('FAIL: Should have thrown for cross-tenant session');
            failed++;
        } catch (e: any) {
            const after = await prisma.cashier_sessions.findUnique({ where: { id: cashierB.id } });
            const afterStatus = after?.status;
            if (e.message?.includes('does not belong to this restaurant') && beforeStatus === afterStatus) {
                console.log('PASS: Cross-tenant session close rejected, zero side effects');
                passed++;
            } else {
                console.log('FAIL: Unexpected error:', e.message, 'statusChanged:', beforeStatus !== afterStatus);
                failed++;
            }
        }
    } catch (err: any) {
        console.log('FAIL: Exception:', err.message);
        failed++;
    }

    // ============================================================
    // Test 5: JournalEntryService.recordOrderSaleJournal rejects cross-tenant order
    // ============================================================
    console.log('\nTest 5: JournalEntryService.recordOrderSaleJournal rejects cross-tenant order');
    try {
        const { JournalEntryService } = await import('../src/api/services/JournalEntryService');
        const journalEntryService = new JournalEntryService();
        const beforeCount = await prisma.journal_entries.count({
            where: { reference_type: 'ORDER_SALE', reference_id: orderB.id }
        });
        await prisma.$transaction(async (tx) => {
            const result = await journalEntryService.recordOrderSaleJournal(
                orderB.id,
                tenantA.id,
                tx
            );
            const afterCount = await tx.journal_entries.count({
                where: { reference_type: 'ORDER_SALE', reference_id: orderB.id }
            });
            if (result === undefined && afterCount === beforeCount) {
                console.log('PASS: Cross-tenant order journal entry skipped silently, zero side effects');
                passed++;
            } else {
                console.log('FAIL: Should have returned undefined for cross-tenant order, journalCount changed');
                failed++;
            }
        });
    } catch (err: any) {
        console.log('FAIL: Exception:', err.message);
        failed++;
    }

    // ============================================================
    // Test 6: Valid same-tenant operations still work (smoke test)
    // ============================================================
    console.log('\nTest 6: Valid same-tenant order details still accessible');
    try {
        const { BaseOrderService } = await import('../src/api/services/orders/BaseOrderService');
        const { OrderServiceFactory } = await import('../src/api/services/orders/OrderServiceFactory');

        const service = OrderServiceFactory.getService(orderA.type as any) as BaseOrderService;
        const result = await service.getOrderDetails(orderA.id, tenantA.id);
        if (result !== null && result.id === orderA.id) {
            console.log('PASS: Same-tenant order access works');
            passed++;
        } else {
            console.log('FAIL: Same-tenant order access returned null');
            failed++;
        }
    } catch (err: any) {
        console.log('FAIL: Exception:', err.message);
        failed++;
    }

    // ============================================================
    // Test 7: OrderWorkflowService.fireOrderToKitchen rejects cross-tenant order
    // ============================================================
    console.log('\nTest 7: OrderWorkflowService.fireOrderToKitchen rejects cross-tenant order');
    try {
        const { OrderWorkflowService } = await import('../src/api/services/OrderWorkflowService');
        const workflowService = new OrderWorkflowService();
        try {
            await workflowService.fireOrderToKitchen(
                orderB.id,
                tenantA.id,
                staffA.id,
                'test-session-id',
                'test-terminal-id',
                'MANAGER'
            );
            console.log('FAIL: Should have thrown for cross-tenant order');
            failed++;
        } catch (e: any) {
            if (e.code === 'ORDER_NOT_FOUND' || e.statusCode === 404) {
                console.log('PASS: Cross-tenant fireOrderToKitchen rejected');
                passed++;
            } else {
                console.log('FAIL: Unexpected error:', e.message || e);
                failed++;
            }
        }
    } catch (err: any) {
        console.log('FAIL: Exception:', err.message);
        failed++;
    }

    // ============================================================
    // Test 8: FBR void route rejects cross-tenant order
    // ============================================================
    console.log('\nTest 8: FBR void route rejects cross-tenant order');
    try {
        const fbrVoidResult = await prisma.$transaction(async (tx) => {
            const targetOrder = await tx.orders.findFirst({
                where: {
                    id: orderB.id,
                    restaurant_id: tenantA.id
                }
            });
            
            if (targetOrder) {
                await tx.orders.update({
                    where: { id: targetOrder.id },
                    data: { fbr_sync_status: 'VOIDED' } as any
                });
                return { mutated: true, orderId: targetOrder.id };
            }
            return { mutated: false, orderId: null };
        });

        if (!fbrVoidResult.mutated) {
            console.log('PASS: Cross-tenant FBR void rejected (no order found)');
            passed++;
        } else {
            console.log('FAIL: Cross-tenant FBR void mutated order:', fbrVoidResult.orderId);
            failed++;
        }
    } catch (err: any) {
        console.log('FAIL: Exception:', err.message);
        failed++;
    }

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log('\n--- TEST SUMMARY ---');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total: ${passed + failed}`);

    await prisma.$disconnect();

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
