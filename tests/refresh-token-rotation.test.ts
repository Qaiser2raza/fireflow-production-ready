import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { restaurantProvisioningService } from '../src/api/services/onboarding/RestaurantProvisioningService';
import { JwtService } from '../src/api/services/auth/JwtService';
import { refreshTokenService } from '../src/api/services/auth/RefreshTokenService';

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
        prisma.refresh_tokens.deleteMany({ where: { restaurant_id: restaurantId } }),
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
        prisma.chart_of_accounts.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.journal_entry_lines.deleteMany({ where: { journal_entries: { restaurant_id: restaurantId } } }),
        prisma.journal_entries.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.ledger_entries.deleteMany({ where: { restaurant_id: restaurantId } }),
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

// Phase 2: provisioned tenants now start SETUP_INCOMPLETE with a forced-change
// owner PIN. Rotation fixtures predate the wizard and operate immediately —
// restore legacy fixture semantics explicitly instead of weakening the gate.
async function neutralizePhase2Restrictions(restaurantId: string, ownerStaffId: string) {
    await prisma.restaurants.update({
        where: { id: restaurantId },
        data: { onboarding_status: 'ACTIVE' }
    });
    await prisma.staff.update({
        where: { id: ownerStaffId },
        data: { must_change_pin: false, pin_expires_at: null }
    });
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

async function loginStaff(pin: string, restaurantId: string): Promise<{ status: number; body: any }> {
    const res = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, restaurant_id: restaurantId })
    });
    const data = await res.json();
    return { status: res.status, body: data };
}

async function refreshStaff(refreshToken: string): Promise<{ status: number; body: any }> {
    const res = await fetch('http://localhost:3001/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
    });
    const data = await res.json();
    return { status: res.status, body: data };
}

async function logoutStaff(staffId: string, restaurantId: string, refreshToken: string): Promise<{ status: number; body: any }> {
    const accessToken = jwtService.generateAccessToken(staffId, restaurantId, 'MANAGER', 'Logout Staff');
    const res = await fetch('http://localhost:3001/api/auth/logout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ refresh_token: refreshToken })
    });
    const data = await res.json();
    return { status: res.status, body: data };
}

async function runTests() {
    console.log('--- STARTING REFRESH TOKEN ROTATION TESTS ---\n');

    await cleanupAllRestaurants();

    // Provision a restaurant
    const result = await restaurantProvisioningService.provisionRestaurant({
        name: 'Refresh Token Test Restaurant',
        slug: 'refresh-token-test-' + Date.now(),
        subscriptionPlan: 'BASIC',
        subscriptionStatus: 'active',
        ownerName: 'Refresh Owner',
        ownerEmail: `refresh-${Date.now()}@test.fireflow`,
    });

    assert('Restaurant provisioned', result.success === true, 'true', `${result.success}`);
    if (!result.success || !result.restaurant?.id) {
        console.log('  FAIL: Provisioning failed');
        await prisma.$disconnect();
        process.exit(1);
    }

    const restaurantId = result.restaurant.id;
    await neutralizePhase2Restrictions(restaurantId, result.ownerStaff!.id);

    // ==========================================
    // TEST 1: Successful login issues refresh token
    // ==========================================
    console.log('\n[Test 1] Successful login issues refresh token');
    let test1RefreshToken: string | undefined;
    try {
        const staff = await createTestStaff(restaurantId, 'Login Staff 1', 'MANAGER', '111111');
        const loginResult = await loginStaff('111111', restaurantId);
        assert('Login returns 200', loginResult.status === 200, '200', `${loginResult.status}`);
        assert('Response contains access_token', !!loginResult.body.tokens?.access_token, 'present', loginResult.body.tokens?.access_token ? 'present' : 'missing');
        assert('Response contains refresh_token', !!loginResult.body.tokens?.refresh_token, 'present', loginResult.body.tokens?.refresh_token ? 'present' : 'missing');
        assert('Refresh token is opaque (not JWT)', !loginResult.body.tokens?.refresh_token?.includes('.'), 'no dots', loginResult.body.tokens?.refresh_token?.includes('.') ? 'jwt-like' : 'opaque');
        test1RefreshToken = loginResult.body.tokens?.refresh_token;
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 2: Successful refresh token rotation
    // ==========================================
    console.log('\n[Test 2] Successful refresh token rotation');
    try {
        const staff = await createTestStaff(restaurantId, 'Login Staff 2', 'MANAGER', '222222');
        const loginResult = await loginStaff('222222', restaurantId);
        const refreshToken = loginResult.body.tokens?.refresh_token;
        assert('Login returns 200', loginResult.status === 200, '200', `${loginResult.status}`);
        assert('Response contains refresh_token', !!refreshToken, 'present', refreshToken ? 'present' : 'missing');

        const refreshResult = await refreshStaff(refreshToken);
        assert('Refresh returns 200', refreshResult.status === 200, '200', `${refreshResult.status}`);
        assert('Response contains new access_token', !!refreshResult.body.access_token, 'present', refreshResult.body.access_token ? 'present' : 'missing');
        assert('Response contains new refresh_token', !!refreshResult.body.refresh_token, 'present', refreshResult.body.refresh_token ? 'present' : 'missing');
        assert('New refresh token is different', refreshResult.body.refresh_token !== refreshToken, 'different', refreshResult.body.refresh_token === refreshToken ? 'same' : 'different');
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 3: Reuse of revoked refresh token detects family-wide revocation
    // ==========================================
    console.log('\n[Test 3] Reuse of revoked refresh token');
    try {
        const staff = await createTestStaff(restaurantId, 'Login Staff 3', 'MANAGER', '333333');
        const loginResult = await loginStaff('333333', restaurantId);
        const refreshToken1 = loginResult.body.tokens?.refresh_token;

        const refresh1 = await refreshStaff(refreshToken1);
        assert('First refresh succeeds', refresh1.status === 200, '200', `${refresh1.status}`);

        const refreshToken2 = refresh1.body.refresh_token;
        const refresh2 = await refreshStaff(refreshToken2);
        assert('Second refresh succeeds', refresh2.status === 200, '200', `${refresh2.status}`);

        const refreshToken3 = refresh2.body.refresh_token;

        // Try to reuse the first refresh token (revoked)
        const reuseResult = await refreshStaff(refreshToken1);
        assert('Reuse of first token returns 401', reuseResult.status === 401, '401', `${reuseResult.status}`);
        assert('Error code indicates token reuse', reuseResult.body.code === 'TOKEN_REUSE_DETECTED', 'TOKEN_REUSE_DETECTED', `${reuseResult.body.code || 'missing'}`);

        // Try to reuse the second refresh token (also revoked)
        const reuseResult2 = await refreshStaff(refreshToken2);
        assert('Reuse of second token returns 401', reuseResult2.status === 401, '401', `${reuseResult2.status}`);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 4: Expired refresh token rejected
    // ==========================================
    console.log('\n[Test 4] Expired refresh token rejected');
    try {
        const staff = await createTestStaff(restaurantId, 'Login Staff 4', 'MANAGER', '444444');
        const loginResult = await loginStaff('444444', restaurantId);
        const refreshToken = loginResult.body.tokens?.refresh_token;

        // Manually expire the token in DB
        const tokenHash = refreshTokenService.hashToken(refreshToken);
        const tokenRecord = await prisma.refresh_tokens.findFirst({
            where: { token_hash: tokenHash },
        });
        if (tokenRecord) {
            await prisma.refresh_tokens.update({
                where: { id: tokenRecord.id },
                data: { expires_at: new Date(Date.now() - 1000) },
            });
        }

        const expiredResult = await refreshStaff(refreshToken);
        assert('Expired token returns 401', expiredResult.status === 401, '401', `${expiredResult.status}`);
        assert('Error code indicates invalid refresh token', expiredResult.body.code === 'INVALID_REFRESH_TOKEN', 'INVALID_REFRESH_TOKEN', `${expiredResult.body.code || 'missing'}`);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 5: Invalid and tampered refresh tokens rejected
    // ==========================================
    console.log('\n[Test 5] Invalid and tampered refresh tokens');
    try {
        const invalidResult = await refreshStaff('not-a-valid-token');
        assert('Invalid token returns 401', invalidResult.status === 401, '401', `${invalidResult.status}`);

        const tamperedResult = await refreshStaff('abcdef1234567890abcdef1234567890');
        assert('Tampered token returns 401', tamperedResult.status === 401, '401', `${tamperedResult.status}`);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 6: Logout revokes refresh token
    // ==========================================
    console.log('\n[Test 6] Logout revokes refresh token');
    try {
        const staff = await createTestStaff(restaurantId, 'Login Staff 6', 'MANAGER', '666666');
        const loginResult = await loginStaff('666666', restaurantId);
        const refreshToken = loginResult.body.tokens?.refresh_token;

        const logoutResult = await logoutStaff(staff.id, restaurantId, refreshToken);
        assert('Logout returns 200', logoutResult.status === 200, '200', `${logoutResult.status}`);

        // Try to use the refresh token after logout
        const postLogoutRefresh = await refreshStaff(refreshToken);
        assert('Refresh after logout returns 401', postLogoutRefresh.status === 401, '401', `${postLogoutRefresh.status}`);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 7: Concurrent refresh requests with same token
    // ==========================================
    console.log('\n[Test 7] Concurrent refresh requests');
    try {
        const staff = await createTestStaff(restaurantId, 'Login Staff 7', 'MANAGER', '777777');
        const loginResult = await loginStaff('777777', restaurantId);
        const refreshToken = loginResult.body.tokens?.refresh_token;

        // Send two concurrent refresh requests with the same token
        const [result1, result2] = await Promise.all([
            refreshStaff(refreshToken),
            refreshStaff(refreshToken),
        ]);

        const successCount = [result1, result2].filter(r => r.status === 200).length;
        assert('At least one concurrent refresh succeeds', successCount >= 1, '>=1', `${successCount}`);
        assert('At most one concurrent refresh succeeds', successCount <= 1, '<=1', `${successCount}`);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 8: Inactive staff refresh rejected
    // ==========================================
    console.log('\n[Test 8] Inactive staff refresh rejected');
    try {
        const inactiveStaff = await createTestStaff(restaurantId, 'Inactive Refresh', 'MANAGER', '888888', 'inactive');
        
        // Create a refresh token for the inactive staff (simulating pre-deactivation token)
        const { token: fakeRefresh } = await refreshTokenService.createStaffRefreshToken(inactiveStaff.id, restaurantId);
        
        const refreshResult = await refreshStaff(fakeRefresh);
        assert('Inactive staff refresh returns 401', refreshResult.status === 401, '401', `${refreshResult.status}`);
        assert('Error code indicates inactive staff', refreshResult.body.code === 'STAFF_INACTIVE', 'STAFF_INACTIVE', `${refreshResult.body.code || 'missing'}`);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 9: Inactive restaurant refresh rejected
    // ==========================================
    console.log('\n[Test 9] Inactive restaurant refresh rejected');
    try {
        await prisma.restaurants.update({
            where: { id: restaurantId },
            data: { is_active: false },
        });

        const staff = await createTestStaff(restaurantId, 'Active Staff 9', 'MANAGER', '999999', 'active');
        const { token: fakeRefresh } = await refreshTokenService.createStaffRefreshToken(staff.id, restaurantId);

        const refreshResult = await refreshStaff(fakeRefresh);
        assert('Inactive restaurant refresh returns 403', refreshResult.status === 403, '403', `${refreshResult.status}`);
        assert('Error code indicates inactive restaurant', refreshResult.body.code === 'RESTAURANT_INACTIVE', 'RESTAURANT_INACTIVE', `${refreshResult.body.code || 'missing'}`);

        // Reactivate restaurant
        await prisma.restaurants.update({
            where: { id: restaurantId },
            data: { is_active: true },
        });
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 10: Tenant isolation - refresh token scoped to restaurant
    // ==========================================
    console.log('\n[Test 10] Tenant isolation for refresh tokens');
    try {
        const resultB = await restaurantProvisioningService.provisionRestaurant({
            name: 'Refresh Token Test B',
            slug: 'refresh-token-b-' + Date.now(),
            subscriptionPlan: 'BASIC',
            subscriptionStatus: 'active',
            ownerName: 'Owner B',
            ownerEmail: `refresh-b-${Date.now()}@test.fireflow`,
        });

        if (resultB.success && resultB.restaurant?.id) {
            await neutralizePhase2Restrictions(resultB.restaurant.id, resultB.ownerStaff!.id);
            const staffB = await createTestStaff(resultB.restaurant.id, 'Manager B', 'MANAGER', '666666');
            const tokenB = jwtService.generateAccessToken(staffB.id, resultB.restaurant.id, 'MANAGER', 'Manager B');

            // Restaurant B staff should not be able to access Restaurant A resources
            const resB = await fetch(`http://localhost:3001/api/staff?restaurant_id=${restaurantId}`, {
                headers: { 'Authorization': `Bearer ${tokenB}` },
            });
            const dataB = await resB.json();
            assert('Restaurant B staff cannot read Restaurant A staff', resB.status === 200, '200 (own scope)', `${resB.status}`);

            const staffNamesB = Array.isArray(dataB) ? dataB.map((s: any) => s.name) : [];
            assert('No Restaurant A staff leaked', Array.isArray(dataB) && !staffNamesB.includes('Refresh Owner'), 'Refresh Owner absent', `${staffNamesB.join(',')}`);
        }

        await cleanupRestaurant(resultB.restaurant!.id);
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
        if (resultB?.restaurant?.id) {
            await cleanupRestaurant(resultB.restaurant.id).catch(() => { });
        }
    }

    // Cleanup
    await cleanupRestaurant(restaurantId);

    console.log('\n=== REFRESH TOKEN ROTATION REPORT ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: 0`);
    console.log(`Blocked: 0`);

    if (failed > 0) {
        console.log('\nREFRESH TOKEN ROTATION: NOT COMPLETE — failures detected');
        process.exit(1);
    } else {
        console.log('\nREFRESH TOKEN ROTATION: VERIFICATION PASSED');
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
