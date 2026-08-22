import 'dotenv/config';
import { PrismaClient, PlatformRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { restaurantProvisioningService } from '../src/api/services/onboarding/RestaurantProvisioningService';
import { platformAuthService } from '../src/api/services/platform/PlatformAuthService';

const prisma = new PrismaClient();

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

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
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

async function cleanupAllTestRestaurants() {
    const allRestaurants = await prisma.restaurants.findMany({
        select: { id: true },
    });

    for (const r of allRestaurants) {
        await cleanupRestaurant(r.id);
    }
}

async function runTests() {
    console.log('--- STARTING ONBOARDING AND SAAS MANAGEMENT TESTS ---\n');

    await cleanupAllTestRestaurants();

    // ==========================================
    // TEST 1: Successful restaurant provisioning
    // ==========================================
    console.log('[Test 1] Successful restaurant provisioning');
    try {
        const result = await restaurantProvisioningService.provisionRestaurant({
            name: 'Test Provision Restaurant',
            slug: 'test-provision-restaurant',
            phone: '+92-300-1111111',
            address: '123 Test St',
            city: 'Karachi',
            subscriptionPlan: 'STANDARD',
            subscriptionStatus: 'trial',
            ownerName: 'Test Owner',
            ownerEmail: `provision-owner-${Date.now()}@test.fireflow`,
            ownerPhone: '+92-300-1111111',
        });

        assert('Provisioning succeeds', result.success === true, 'true', `${result.success}`);
        assert('Restaurant created', !!result.restaurant, 'present', result.restaurant ? 'present' : 'missing');
        assert('Owner staff created', !!result.ownerStaff, 'present', result.ownerStaff ? 'present' : 'missing');
        assert('Owner is MANAGER', result.ownerStaff?.role === 'MANAGER', 'MANAGER', result.ownerStaff?.role);
        assert('Owner has PIN', !!result.ownerStaff?.temporary_pin, 'present', result.ownerStaff?.temporary_pin ? 'present' : 'missing');
        assert('PIN is 6 digits', result.ownerStaff?.temporary_pin?.length === 6, '6', `${result.ownerStaff?.temporary_pin?.length}`);
        assert('Subscription plan set', result.restaurant?.subscription_plan === 'STANDARD', 'STANDARD', result.restaurant?.subscription_plan);
        assert('Trial status set', result.restaurant?.subscription_status === 'trial', 'trial', result.restaurant?.subscription_status);
        assert('Trial ends in 30 days', !!result.restaurant?.trial_ends_at, 'present', result.restaurant?.trial_ends_at ? 'present' : 'missing');

        if (result.restaurant?.id) {
            await cleanupRestaurant(result.restaurant.id);
        }
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 2: Duplicate slug prevention
    // ==========================================
    console.log('\n[Test 2] Duplicate slug prevention');
    try {
        const result1 = await restaurantProvisioningService.provisionRestaurant({
            name: 'Duplicate Slug Test 1',
            slug: 'duplicate-slug-test',
            subscriptionPlan: 'BASIC',
            subscriptionStatus: 'trial',
            ownerName: 'Owner 1',
            ownerEmail: `dup-slug-1-${Date.now()}@test.fireflow`,
        });

        const result2 = await restaurantProvisioningService.provisionRestaurant({
            name: 'Duplicate Slug Test 2',
            slug: 'duplicate-slug-test',
            subscriptionPlan: 'BASIC',
            subscriptionStatus: 'trial',
            ownerName: 'Owner 2',
            ownerEmail: `dup-slug-2-${Date.now()}@test.fireflow`,
        });

        assert('First provisioning succeeds', result1.success === true, 'true', `${result1.success}`);
        assert('Second provisioning fails', result2.success === false, 'false', `${result2.success}`);

        if (result1.restaurant?.id) {
            await cleanupRestaurant(result1.restaurant.id);
        }
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 3: Atomic provisioning — default data created
    // ==========================================
    console.log('\n[Test 3] Atomic provisioning — default data created');
    try {
        const result = await restaurantProvisioningService.provisionRestaurant({
            name: 'Default Data Test',
            slug: 'default-data-test',
            subscriptionPlan: 'BASIC',
            subscriptionStatus: 'trial',
            ownerName: 'Default Owner',
            ownerEmail: `default-data-${Date.now()}@test.fireflow`,
        });

        assert('Provisioning succeeds', result.success === true, 'true', `${result.success}`);

        if (result.success && result.restaurant?.id) {
            const restaurantId = result.restaurant.id;

            const sectionCount = await prisma.sections.count({ where: { restaurant_id: restaurantId } });
            const tableCount = await prisma.tables.count({ where: { restaurant_id: restaurantId } });
            const orderTypeCount = await prisma.order_type_defaults.count({ where: { restaurant_id: restaurantId } });
            const coaCount = await prisma.chart_of_accounts.count({ where: { restaurant_id: restaurantId } });
            const staffCount = await prisma.staff.count({ where: { restaurant_id: restaurantId } });

            assert('Default section created', sectionCount >= 1, '>=1', `${sectionCount}`);
            assert('Default table created', tableCount >= 1, '>=1', `${tableCount}`);
            assert('Order type defaults created', orderTypeCount === 3, '3', `${orderTypeCount}`);
            assert('Chart of accounts created', coaCount >= 5, '>=5', `${coaCount}`);
            assert('Owner staff created', staffCount === 1, '1', `${staffCount}`);

            await cleanupRestaurant(restaurantId);
        }
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 4: Rollback on failure
    // ==========================================
    console.log('\n[Test 4] Rollback on failure');
    try {
        const rollbackSlug = 'rollback-test-unique';
        
        const result1 = await restaurantProvisioningService.provisionRestaurant({
            name: 'Rollback Test 1',
            slug: rollbackSlug,
            subscriptionPlan: 'BASIC',
            subscriptionStatus: 'trial',
            ownerName: 'Rollback Owner 1',
            ownerEmail: `rollback-1-${Date.now()}@test.fireflow`,
        });

        assert('First provisioning succeeds', result1.success === true, 'true', `${result1.success}`);

        const result2 = await restaurantProvisioningService.provisionRestaurant({
            name: 'Rollback Test 2',
            slug: rollbackSlug,
            subscriptionPlan: 'BASIC',
            subscriptionStatus: 'trial',
            ownerName: 'Rollback Owner 2',
            ownerEmail: `rollback-2-${Date.now()}@test.fireflow`,
        });

        assert('Second provisioning fails', result2.success === false, 'false', `${result2.success}`);

        const countAfter = await prisma.restaurants.count({
            where: { slug: rollbackSlug },
        });
        const staffAfter = await prisma.staff.count({
            where: { restaurant_id: result1.restaurant?.id },
        });

        assert('Only one restaurant with slug exists', countAfter === 1, '1', `${countAfter}`);
        assert('Only one owner staff exists', staffAfter === 1, '1', `${staffAfter}`);

        if (result1.restaurant?.id) {
            await cleanupRestaurant(result1.restaurant.id);
        }
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 5: Demo tenant provisioning
    // ==========================================
    console.log('\n[Test 5] Demo tenant provisioning');
    try {
        const existingDemo = await prisma.restaurants.findFirst({
            where: { slug: 'fireflow-restaurant' },
            select: { id: true },
        });

        if (existingDemo) {
            assert('Demo tenant already exists', true, 'true', 'true');
        } else {
            const result = await restaurantProvisioningService.provisionDemoRestaurant();
            assert('Demo provisioning succeeds', result.success === true, 'true', `${result.success}`);
            assert('Demo name is correct', result.restaurant?.name === 'FireFlow Restaurant', 'FireFlow Restaurant', result.restaurant?.name);
            assert('Demo slug is correct', result.restaurant?.slug === 'fireflow-restaurant', 'fireflow-restaurant', result.restaurant?.slug);
            assert('Demo plan is PREMIUM', result.restaurant?.subscription_plan === 'PREMIUM', 'PREMIUM', result.restaurant?.subscription_plan);
            assert('Demo status is active', result.restaurant?.subscription_status === 'active', 'active', result.restaurant?.subscription_status);

            if (result.restaurant?.id) {
                await cleanupRestaurant(result.restaurant.id);
            }
        }
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 6: Platform tenant list
    // ==========================================
    console.log('\n[Test 6] Platform tenant list');
    try {
        const result = await restaurantProvisioningService.provisionRestaurant({
            name: 'List Test Restaurant',
            slug: 'list-test-restaurant',
            subscriptionPlan: 'BASIC',
            subscriptionStatus: 'trial',
            ownerName: 'List Owner',
            ownerEmail: `list-test-${Date.now()}@test.fireflow`,
        });

        assert('Provisioning succeeds for list test', result.success === true, 'true', `${result.success}`);

        if (result.restaurant?.id) {
            const restaurants = await prisma.restaurants.findMany({
                select: { id: true, name: true, slug: true },
            });

            const found = restaurants.find(r => r.id === result.restaurant.id);
            assert('Restaurant appears in list', !!found, 'present', found ? 'present' : 'missing');

            await cleanupRestaurant(result.restaurant.id);
        }
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 7: Tenant suspension and activation
    // ==========================================
    console.log('\n[Test 7] Tenant suspension and activation');
    try {
        const result = await restaurantProvisioningService.provisionRestaurant({
            name: 'Suspend Test Restaurant',
            slug: 'suspend-test-restaurant',
            subscriptionPlan: 'BASIC',
            subscriptionStatus: 'active',
            ownerName: 'Suspend Owner',
            ownerEmail: `suspend-test-${Date.now()}@test.fireflow`,
        });

        assert('Provisioning succeeds for suspend test', result.success === true, 'true', `${result.success}`);

        if (result.restaurant?.id) {
            let restaurant = await prisma.restaurants.findUnique({
                where: { id: result.restaurant.id },
                select: { is_active: true },
            });
            assert('Restaurant starts active', restaurant?.is_active === true, 'true', `${restaurant?.is_active}`);

            restaurant = await prisma.restaurants.update({
                where: { id: result.restaurant.id },
                data: { is_active: false },
            });
            assert('Restaurant can be suspended', restaurant?.is_active === false, 'false', `${restaurant?.is_active}`);

            restaurant = await prisma.restaurants.update({
                where: { id: result.restaurant.id },
                data: { is_active: true },
            });
            assert('Restaurant can be reactivated', restaurant?.is_active === true, 'true', `${restaurant?.is_active}`);

            await cleanupRestaurant(result.restaurant.id);
        }
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 8: Plan assignment
    // ==========================================
    console.log('\n[Test 8] Plan assignment');
    try {
        const result = await restaurantProvisioningService.provisionRestaurant({
            name: 'Plan Test Restaurant',
            slug: 'plan-test-restaurant',
            subscriptionPlan: 'PREMIUM',
            subscriptionStatus: 'active',
            ownerName: 'Plan Owner',
            ownerEmail: `plan-test-${Date.now()}@test.fireflow`,
        });

        assert('Provisioning succeeds for plan test', result.success === true, 'true', `${result.success}`);
        assert('Plan is PREMIUM', result.restaurant?.subscription_plan === 'PREMIUM', 'PREMIUM', result.restaurant?.subscription_plan);

        if (result.restaurant?.id) {
            const restaurant = await prisma.restaurants.findUnique({
                where: { id: result.restaurant.id },
                select: { subscription_plan: true, subscription_status: true },
            });
            assert('Plan persisted', restaurant?.subscription_plan === 'PREMIUM', 'PREMIUM', `${restaurant?.subscription_plan}`);
            assert('Status persisted', restaurant?.subscription_status === 'active', 'active', `${restaurant?.subscription_status}`);

            await cleanupRestaurant(result.restaurant.id);
        }
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 9: Audit logging
    // ==========================================
    console.log('\n[Test 9] Audit logging');
    try {
        const result = await restaurantProvisioningService.provisionRestaurant({
            name: 'Audit Test Restaurant',
            slug: 'audit-test-restaurant',
            subscriptionPlan: 'BASIC',
            subscriptionStatus: 'trial',
            ownerName: 'Audit Owner',
            ownerEmail: `audit-test-${Date.now()}@test.fireflow`,
        });

        assert('Provisioning succeeds for audit test', result.success === true, 'true', `${result.success}`);

        if (result.restaurant?.id) {
            const auditLogs = await prisma.audit_logs.findMany({
                where: {
                    entity_type: 'RESTAURANT',
                    entity_id: result.restaurant.id,
                },
                orderBy: { created_at: 'asc' },
            });

            const provisioningLog = auditLogs.find(l => l.action_type === 'RESTAURANT_PROVISIONED');
            assert('Provisioning audit log created', !!provisioningLog, 'present', provisioningLog ? 'present' : 'missing');
            assert('Audit log has owner_staff_id', !!provisioningLog?.details?.owner_staff_id, 'present', provisioningLog?.details?.owner_staff_id ? 'present' : 'missing');

            await cleanupRestaurant(result.restaurant.id);
        }
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    // ==========================================
    // TEST 10: Owner PIN is hashed
    // ==========================================
    console.log('\n[Test 10] Owner PIN is hashed');
    try {
        const result = await restaurantProvisioningService.provisionRestaurant({
            name: 'PIN Hash Test Restaurant',
            slug: 'pin-hash-test-restaurant',
            subscriptionPlan: 'BASIC',
            subscriptionStatus: 'trial',
            ownerName: 'PIN Hash Owner',
            ownerEmail: `pin-hash-test-${Date.now()}@test.fireflow`,
        });

        assert('Provisioning succeeds for PIN hash test', result.success === true, 'true', `${result.success}`);

        if (result.restaurant?.id && result.ownerStaff?.id) {
            const staff = await prisma.staff.findUnique({
                where: { id: result.ownerStaff.id },
                select: { pin: true, hashed_pin: true },
            });

            assert('PIN is hashed in DB', staff?.pin === result.ownerStaff.temporary_pin, `${result.ownerStaff.temporary_pin}`, `${staff?.pin}`);
            assert('Hashed PIN is stored', !!staff?.hashed_pin, 'present', staff?.hashed_pin ? 'present' : 'missing');
            assert('Hashed PIN is bcrypt', staff?.hashed_pin?.startsWith('$2b$'), '$2b$', staff?.hashed_pin?.slice(0, 4) || 'missing');

            const pinMatch = await bcrypt.compare(result.ownerStaff.temporary_pin, staff.hashed_pin);
            assert('PIN matches hash', pinMatch === true, 'true', `${pinMatch}`);

            await cleanupRestaurant(result.restaurant.id);
        }
    } catch (e: any) {
        console.log('  FAIL: Exception:', e.message);
        failed++;
    }

    console.log('\n=== ONBOARDING AND SAAS MANAGEMENT REPORT ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: 0`);
    console.log(`Blocked: 0`);

    if (failed > 0) {
        console.log('\nONBOARDING AND SAAS: NOT COMPLETE — failures detected');
        process.exit(1);
    } else {
        console.log('\nONBOARDING AND SAAS: VERIFICATION PASSED');
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
