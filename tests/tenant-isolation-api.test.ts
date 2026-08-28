import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { restaurantProvisioningService } from '../src/api/services/onboarding/RestaurantProvisioningService';
import { JwtService } from '../src/api/services/auth/JwtService';

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
        prisma.audit_logs.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.approval_logs.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.fbr_sync_logs.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.fiscal_documents.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.fiscal_attempts.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.payments.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.payment_attempts.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.integration_deliveries.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.integrations.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.outbox.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.order_items.deleteMany({ where: { orders: { restaurant_id: restaurantId } } }),
        prisma.fire_batches.deleteMany({ where: { orders: { restaurant_id: restaurantId } } }),
        prisma.order_intelligence.deleteMany({ where: { order_id: { in: (await prisma.orders.findMany({ where: { restaurant_id: restaurantId }, select: { id: true } })).map(o => o.id) } } }),
        prisma.dine_in_orders.deleteMany({ where: { order_id: { in: (await prisma.orders.findMany({ where: { restaurant_id: restaurantId }, select: { id: true } })).map(o => o.id) } } }),
        prisma.takeaway_orders.deleteMany({ where: { order_id: { in: (await prisma.orders.findMany({ where: { restaurant_id: restaurantId }, select: { id: true } })).map(o => o.id) } } }),
        prisma.delivery_orders.deleteMany({ where: { order_id: { in: (await prisma.orders.findMany({ where: { restaurant_id: restaurantId }, select: { id: true } })).map(o => o.id) } } }),
        prisma.reservation_orders.deleteMany({ where: { order_id: { in: (await prisma.orders.findMany({ where: { restaurant_id: restaurantId }, select: { id: true } })).map(o => o.id) } } }),
        prisma.orders.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.tables.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.sections.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.menu_items.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.menu_categories.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.menu_item_variants.deleteMany({ where: { menu_item_id: { in: (await prisma.menu_items.findMany({ where: { restaurant_id: restaurantId }, select: { id: true } })).map(m => m.id) } } }),
        prisma.order_type_defaults.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.journal_entry_lines.deleteMany({ where: { journal_entries: { restaurant_id: restaurantId } } }),
        prisma.journal_entries.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.ledger_entries.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.chart_of_accounts.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.customer_ledgers.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.customers.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.expenses.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.inventory_items.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.purchase_order_items.deleteMany({ where: { purchase_orders: { restaurant_id: restaurantId } } }),
        prisma.purchase_orders.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.recipe_items.deleteMany({ where: { menu_item_id: { in: (await prisma.menu_items.findMany({ where: { restaurant_id: restaurantId }, select: { id: true } })).map(m => m.id) } } }),
        prisma.pairing_codes.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.parked_orders.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.payouts.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.printers.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.registered_devices.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.reservations.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.restaurant_features.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.rider_settlements.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.rider_shifts.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.security_events.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.staff_wallet_logs.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.stations.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.subscription_payments.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.suppliers.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.supplier_ledgers.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.system_logs.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.transactions.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.vendors.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.cashier_sessions.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.cashier_shift_logs.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.staff.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.license_keys.deleteMany({ where: { restaurant_id: restaurantId } }),
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

async function runTests() {
    console.log('--- STARTING TENANT ISOLATION TESTS ---\n');

    await cleanupAllRestaurants();

    // Provision two restaurants
    const resultA = await restaurantProvisioningService.provisionRestaurant({
        name: 'Tenant Isolation A',
        slug: 'tenant-isolation-a',
        subscriptionPlan: 'BASIC',
        subscriptionStatus: 'active',
        ownerName: 'Owner A',
        ownerEmail: `isolation-a-${Date.now()}@test.fireflow`,
    });

    const resultB = await restaurantProvisioningService.provisionRestaurant({
        name: 'Tenant Isolation B',
        slug: 'tenant-isolation-b',
        subscriptionPlan: 'BASIC',
        subscriptionStatus: 'active',
        ownerName: 'Owner B',
        ownerEmail: `isolation-b-${Date.now()}@test.fireflow`,
    });

    assert('Restaurant A provisioned', resultA.success === true, 'true', `${resultA.success}`);
    assert('Restaurant B provisioned', resultB.success === true, 'true', `${resultB.success}`);

    if (!resultA.success || !resultB.success || !resultA.restaurant?.id || !resultB.restaurant?.id) {
        console.log('  FAIL: Provisioning failed');
        failed++;
        await prisma.$disconnect();
        process.exit(1);
    }

    const restaurantAId = resultA.restaurant.id;
    const restaurantBId = resultB.restaurant.id;

    // Complete onboarding so non-SUPER_ADMIN staff can access protected routes
    await prisma.restaurants.updateMany({
        where: { id: { in: [restaurantAId, restaurantBId] } },
        data: { onboarding_status: 'ACTIVE' },
    });

    // Create staff for each restaurant
    const staffA = await createTestStaff(restaurantAId, 'Manager A', 'MANAGER', '111111');
    const staffB = await createTestStaff(restaurantBId, 'Manager B', 'MANAGER', '222222');

    const tokenA = jwtService.generateAccessToken(staffA.id, restaurantAId, 'MANAGER', 'Manager A');
    const tokenB = jwtService.generateAccessToken(staffB.id, restaurantBId, 'MANAGER', 'Manager B');

    // ==========================================
    // TEST 1: Staff endpoint uses authenticated restaurant
    // ==========================================
    console.log('\n[Test 1] Staff endpoint uses authenticated restaurant');
    try {
        const resA = await fetch(`http://localhost:3001/api/staff?restaurant_id=${restaurantAId}`, {
            headers: { 'Authorization': `Bearer ${tokenA}` },
        });
        const dataA = await resA.json();
        assert('Restaurant A can read own staff', resA.status === 200 && Array.isArray(dataA), '200+array', `${resA.status}`);
        
        const staffNamesA = dataA.map((s: any) => s.name);
        assert('Only Restaurant A staff returned', staffNamesA.includes('Manager A'), 'Manager A present', `${staffNamesA.join(',')}`);

        const resB = await fetch(`http://localhost:3001/api/staff?restaurant_id=${restaurantBId}`, {
            headers: { 'Authorization': `Bearer ${tokenA}` },
        });
        const dataB = await resB.json();
        assert('Restaurant A query with B ID returns A staff (server ignores client param)', resB.status === 200, '200', `${resB.status}`);
        
        const staffNamesB = dataB.map((s: any) => s.name);
        assert('No Restaurant B staff leaked', !staffNamesB.includes('Manager B'), 'Manager B absent', `${staffNamesB.join(',')}`);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 2: Menu items tenant isolation
    // ==========================================
    console.log('\n[Test 2] Menu items tenant isolation');
    try {
        const menuA = await prisma.menu_items.create({
            data: { restaurant_id: restaurantAId, name: 'Item A Only', price: 100, category: 'FOOD' },
        });
        const menuB = await prisma.menu_items.create({
            data: { restaurant_id: restaurantBId, name: 'Item B Only', price: 200, category: 'FOOD' },
        });

        // Restaurant A should only see its own menu items
        const resA = await fetch(`http://localhost:3001/api/menu_items?restaurant_id=${restaurantAId}`, {
            headers: { 'Authorization': `Bearer ${tokenA}` },
        });
        const dataA = await resA.json();
        assert('Restaurant A can read own menu', resA.status === 200, '200', `${resA.status}`);
        
        const itemNamesA = (dataA || []).map((i: any) => i.name);
        assert('Only Restaurant A menu items returned', itemNamesA.includes('Item A Only'), 'Item A Only present', `${itemNamesA.join(',')}`);

        // Restaurant A must NOT see Restaurant B menu items, even when querying with B's ID
        const resB = await fetch(`http://localhost:3001/api/menu_items?restaurant_id=${restaurantBId}`, {
            headers: { 'Authorization': `Bearer ${tokenA}` },
        });
        const dataB = await resB.json();
        assert('Restaurant A cannot read Restaurant B menu via query param override', resB.status === 200, '200 (own menu)', `${resB.status}`);
        
        const itemNamesB = (dataB || []).map((i: any) => i.name);
        assert('No Restaurant B menu items leaked to Restaurant A', !itemNamesB.includes('Item B Only'), 'Item B Only absent', `${itemNamesB.join(',')}`);

        // Restaurant B must not see Restaurant A menu items
        const resBA = await fetch(`http://localhost:3001/api/menu_items?restaurant_id=${restaurantAId}`, {
            headers: { 'Authorization': `Bearer ${tokenB}` },
        });
        const dataBA = await resBA.json();
        assert('Restaurant B cannot read Restaurant A menu via query param override', resBA.status === 200, '200 (own menu)', `${resBA.status}`);
        
        const itemNamesBA = (dataBA || []).map((i: any) => i.name);
        assert('No Restaurant A menu items leaked to Restaurant B', !itemNamesBA.includes('Item A Only'), 'Item A Only absent', `${itemNamesBA.join(',')}`);

        await prisma.menu_items.delete({ where: { id: menuA.id } });
        await prisma.menu_items.delete({ where: { id: menuB.id } });
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 3: Menu item mutations enforce tenant isolation
    // ==========================================
    console.log('\n[Test 3] Menu item mutations enforce tenant isolation');
    try {
        const menuA = await prisma.menu_items.create({
            data: { restaurant_id: restaurantAId, name: 'Item A Mutate', price: 100, category: 'FOOD' },
        });
        const menuB = await prisma.menu_items.create({
            data: { restaurant_id: restaurantBId, name: 'Item B Mutate', price: 200, category: 'FOOD' },
        });

        // Restaurant A cannot update Restaurant B menu item
        const patchRes = await fetch(`http://localhost:3001/api/menu_items`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: menuB.id, name: 'Hacked' }),
        });
        assert('Restaurant A cannot update Restaurant B menu item', patchRes.status === 403, '403', `${patchRes.status}`);

        // Restaurant A cannot delete Restaurant B menu item
        const deleteRes = await fetch(`http://localhost:3001/api/menu_items?id=${menuB.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${tokenA}` },
        });
        assert('Restaurant A cannot delete Restaurant B menu item', deleteRes.status === 403, '403', `${deleteRes.status}`);

        // Restaurant A CAN update its own menu item
        const patchOwn = await fetch(`http://localhost:3001/api/menu_items`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: menuA.id, name: 'Item A Updated' }),
        });
        assert('Restaurant A can update own menu item', patchOwn.status === 200, '200', `${patchOwn.status}`);

        await prisma.menu_items.delete({ where: { id: menuA.id } });
        await prisma.menu_items.delete({ where: { id: menuB.id } });
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 4: Platform routes blocked for restaurant users
    // ==========================================
    console.log('\n[Test 4] Platform routes blocked for restaurant users');
    try {
        const res = await fetch('http://localhost:3001/api/platform/health', {
            headers: { 'Authorization': `Bearer ${tokenA}` },
        });
        assert('Platform route rejected for restaurant user', res.status === 401 || res.status === 403, '401/403', `${res.status}`);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 5: Super admin cross-tenant access
    // ==========================================
    console.log('\n[Test 5] Super admin cross-tenant access');
    try {
        const superAdmin = await createTestStaff(restaurantAId, 'Super Admin', 'SUPER_ADMIN', '999999');
        const superToken = jwtService.generateAccessToken(superAdmin.id, restaurantAId, 'SUPER_ADMIN', 'Super Admin');

        const res = await fetch(`http://localhost:3001/api/staff?restaurant_id=${restaurantBId}`, {
            headers: {
                'Authorization': `Bearer ${superToken}`,
                'x-target-restaurant': restaurantBId,
            },
        });
        assert('Super admin can target other restaurant', res.status === 200, '200', `${res.status}`);

        const auditLogs = await prisma.audit_logs.findMany({
            where: {
                staff_id: superAdmin.id,
                action_type: 'SUPER_ADMIN_TARGET_RESTAURANT',
            },
            orderBy: { created_at: 'desc' },
            take: 1,
        });
        assert('Cross-tenant access is audited', auditLogs.length > 0, '>0', `${auditLogs.length}`);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 6: Inactive staff rejection
    // ==========================================
    console.log('\n[Test 6] Inactive staff rejection');
    try {
        const inactiveStaff = await createTestStaff(restaurantAId, 'Inactive Staff', 'MANAGER', '444444', 'inactive');
        const inactiveToken = jwtService.generateAccessToken(inactiveStaff.id, restaurantAId, 'MANAGER', 'Inactive Staff');
        const res = await fetch(`http://localhost:3001/api/staff?restaurant_id=${restaurantAId}`, {
            headers: { 'Authorization': `Bearer ${inactiveToken}` },
        });
        
        assert('Inactive staff is rejected with 403', res.status === 403, '403', `${res.status}`);
        
        const err = await res.json();
        assert('Error code indicates inactive staff', err.code === 'STAFF_INACTIVE', 'STAFF_INACTIVE', `${err.code || 'missing'}`);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 7: Reactivated staff access
    // ==========================================
    console.log('\n[Test 7: Reactivated staff access');
    try {
        const reactivateStaff = await createTestStaff(restaurantAId, 'Reactivate Staff', 'MANAGER', '555555', 'inactive');
        const reactivateToken = jwtService.generateAccessToken(reactivateStaff.id, restaurantAId, 'MANAGER', 'Reactivate Staff');
        
        // Should be rejected while inactive
        const resInactive = await fetch(`http://localhost:3001/api/staff?restaurant_id=${restaurantAId}`, {
            headers: { 'Authorization': `Bearer ${reactivateToken}` },
        });
        assert('Inactive staff rejected', resInactive.status === 403, '403', `${resInactive.status}`);

        // Reactivate staff
        await prisma.staff.update({
            where: { id: reactivateStaff.id },
            data: { status: 'active' },
        });

        // Should be accepted after reactivation (new token required per policy)
        const reactivateTokenNew = jwtService.generateAccessToken(reactivateStaff.id, restaurantAId, 'MANAGER', 'Reactivate Staff');
        const resActive = await fetch(`http://localhost:3001/api/staff?restaurant_id=${restaurantAId}`, {
            headers: { 'Authorization': `Bearer ${reactivateTokenNew}` },
        });
        assert('Reactivated staff accepted with new token', resActive.status === 200, '200', `${resActive.status}`);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 8: Staff token cannot be used against another restaurant
    // ==========================================
    console.log('\n[Test 8] Staff token cannot be used against another restaurant');
    try {
        const staffB2 = await createTestStaff(restaurantBId, 'Manager B2', 'MANAGER', '666666');
        const tokenB2 = jwtService.generateAccessToken(staffB2.id, restaurantBId, 'MANAGER', 'Manager B2');

        // Try to access Restaurant A with Restaurant B token - server should ignore query param
        const res = await fetch(`http://localhost:3001/api/staff?restaurant_id=${restaurantAId}`, {
            headers: { 'Authorization': `Bearer ${tokenB2}` },
        });
        
        assert('Staff token uses its own restaurant scope (ignores client query param)', res.status === 200, '200', `${res.status}`);
        const data = await res.json();
        const staffNames = (data || []).map((s: any) => s.name);
        assert('Only Restaurant B staff returned (no Restaurant A leak)', !staffNames.includes('Manager A'), 'Manager A absent', `${staffNames.join(',')}`);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 9: Client cannot override restaurant scope
    // ==========================================
    console.log('\n[Test 9] Client cannot override restaurant scope');
    try {
        const staffA2 = await createTestStaff(restaurantAId, 'Manager A2', 'MANAGER', '777777');
        const tokenA2 = jwtService.generateAccessToken(staffA2.id, restaurantAId, 'MANAGER', 'Manager A2');

        // Query Restaurant B menu with Restaurant A token
        const menuB = await prisma.menu_items.create({
            data: { restaurant_id: restaurantBId, name: 'Item B Secret', price: 300, category: 'FOOD' },
        });

        const res = await fetch(`http://localhost:3001/api/menu_items?restaurant_id=${restaurantBId}`, {
            headers: { 'Authorization': `Bearer ${tokenA2}` },
        });
        const data = await res.json();
        
        assert('Client restaurant_id cannot override token scope', res.status === 200, '200 (own menu)', `${res.status}`);
        const itemNames = (data || []).map((i: any) => i.name);
        assert('No cross-tenant menu items leaked', !itemNames.includes('Item B Secret'), 'Item B Secret absent', `${itemNames.join(',')}`);

        await prisma.menu_items.delete({ where: { id: menuB.id } });
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 10: Floor layout cross-tenant enforcement
    // ==========================================
    console.log('\n[Test 10] Floor layout cross-tenant enforcement');
    try {
        const sectionA = await prisma.sections.create({ data: { restaurant_id: restaurantAId, name: 'Section A', priority: 1 } });
        const sectionB = await prisma.sections.create({ data: { restaurant_id: restaurantBId, name: 'Section B', priority: 1 } });

        const resA = await fetch(`http://localhost:3001/api/floor/layout/${restaurantAId}`, {
            headers: { 'Authorization': `Bearer ${tokenA}` },
        });
        assert('Restaurant A can read own floor layout', resA.status === 200, '200', `${resA.status}`);
        const layoutA = await resA.json();
        assert('Floor layout contains own section', (layoutA.sections || []).some((s: any) => s.name === 'Section A'), 'Section A present', JSON.stringify(layoutA.sections));

        const resB = await fetch(`http://localhost:3001/api/floor/layout/${restaurantBId}`, {
            headers: { 'Authorization': `Bearer ${tokenA}` },
        });
        assert('Restaurant A cannot read Restaurant B floor layout', resB.status === 403, '403', `${resB.status}`);

        await prisma.sections.delete({ where: { id: sectionA.id } });
        await prisma.sections.delete({ where: { id: sectionB.id } });
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 11: Customer mutation cross-tenant enforcement
    // ==========================================
    console.log('\n[Test 11] Customer mutation cross-tenant enforcement');
    try {
        const customerA = await prisma.customers.create({ data: { restaurant_id: restaurantAId, name: 'Customer A', phone: '111' } });
        const customerB = await prisma.customers.create({ data: { restaurant_id: restaurantBId, name: 'Customer B', phone: '222' } });

        const patchB = await fetch(`http://localhost:3001/api/customers`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: customerB.id, name: 'Hacked Customer' }),
        });
        assert('Restaurant A cannot update Restaurant B customer', patchB.status === 403, '403', `${patchB.status}`);

        const patchOwn = await fetch(`http://localhost:3001/api/customers`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: customerA.id, name: 'Customer A Updated' }),
        });
        assert('Restaurant A can update own customer', patchOwn.status === 200, '200', `${patchOwn.status}`);

        await prisma.customers.delete({ where: { id: customerA.id } });
        await prisma.customers.delete({ where: { id: customerB.id } });
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 12: Vendor mutation cross-tenant enforcement
    // ==========================================
    console.log('\n[Test 12] Vendor mutation cross-tenant enforcement');
    try {
        const vendorA = await prisma.vendors.create({ data: { restaurant_id: restaurantAId, name: 'Vendor A', category: 'General' } });
        const vendorB = await prisma.vendors.create({ data: { restaurant_id: restaurantBId, name: 'Vendor B', category: 'General' } });

        const patchB = await fetch(`http://localhost:3001/api/vendors`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: vendorB.id, name: 'Hacked Vendor' }),
        });
        assert('Restaurant A cannot update Restaurant B vendor', patchB.status === 403, '403', `${patchB.status}`);

        const patchOwn = await fetch(`http://localhost:3001/api/vendors`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${tokenA}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: vendorA.id, name: 'Vendor A Updated' }),
        });
        assert('Restaurant A can update own vendor', patchOwn.status === 200, '200', `${patchOwn.status}`);

        await prisma.vendors.delete({ where: { id: vendorA.id } });
        await prisma.vendors.delete({ where: { id: vendorB.id } });
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 13: Menu category deletion cross-tenant enforcement
    // ==========================================
    console.log('\n[Test 13] Menu category deletion cross-tenant enforcement');
    try {
        const categoryA = await prisma.menu_categories.create({ data: { restaurant_id: restaurantAId, name: 'Cat A' } });
        const categoryB = await prisma.menu_categories.create({ data: { restaurant_id: restaurantBId, name: 'Cat B' } });

        const deleteB = await fetch(`http://localhost:3001/api/menu_categories?id=${categoryB.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${tokenA}` },
        });
        assert('Restaurant A cannot delete Restaurant B menu category', deleteB.status === 403, '403', `${deleteB.status}`);

        const deleteOwn = await fetch(`http://localhost:3001/api/menu_categories?id=${categoryA.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${tokenA}` },
        });
        assert('Restaurant A can delete own menu category', deleteOwn.status === 200, '200', `${deleteOwn.status}`);

        await prisma.menu_categories.delete({ where: { id: categoryB.id } }).catch(() => {});
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 14: Super-admin role boundary enforcement
    // ==========================================
    console.log('\n[Test 14] Super-admin role boundary enforcement');
    try {
        const res = await fetch('http://localhost:3001/api/super-admin/licenses', {
            headers: { 'Authorization': `Bearer ${tokenA}` },
        });
        assert('MANAGER cannot access super-admin licenses', res.status === 403, '403', `${res.status}`);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // Cleanup
    await cleanupRestaurant(restaurantAId);
    await cleanupRestaurant(restaurantBId);

    console.log('\n=== TENANT ISOLATION REPORT ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: 0`);
    console.log(`Blocked: 0`);

    if (failed > 0) {
        console.log('\nTENANT ISOLATION: NOT COMPLETE — failures detected');
        process.exit(1);
    } else {
        console.log('\nTENANT ISOLATION: VERIFICATION PASSED');
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
