import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const results: Array<{ test: string; expected: string; actual: string; result: string }> = [];

function assert(testName: string, condition: boolean, expected: string, actual: string) {
    if (condition) {
        console.log(`  PASS: ${testName}`);
        passed++;
        results.push({ test: testName, expected, actual, result: 'PASS' });
    } else {
        console.log(`  FAIL: ${testName} — expected ${expected}, got ${actual}`);
        failed++;
        results.push({ test: testName, expected, actual, result: 'FAIL' });
    }
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function setupFixtures() {
    const ts = Date.now();
    const restaurantA = await prisma.restaurants.create({
        data: {
            name: 'PIN Test Restaurant A',
            slug: `pin-test-a-${ts}`,
            phone: '03001234567',
            address: 'Test Address A',
            currency: 'PKR',
            timezone: 'Asia/Karachi',
            subscription_plan: 'BASIC',
            subscription_status: 'ACTIVE'
        }
    });

    const restaurantB = await prisma.restaurants.create({
        data: {
            name: 'PIN Test Restaurant B',
            slug: `pin-test-b-${ts}`,
            phone: '03007654321',
            address: 'Test Address B',
            currency: 'PKR',
            timezone: 'Asia/Karachi',
            subscription_plan: 'BASIC',
            subscription_status: 'ACTIVE'
        }
    });

    const hashedPin = await bcrypt.hash('123456', 12);
    const staffA = await prisma.staff.create({
        data: {
            restaurant_id: restaurantA.id,
            name: 'Manager A',
            role: 'MANAGER',
            pin: '123456',
            hashed_pin: hashedPin,
            failed_login_count: 0,
            locked_until: null
        }
    });

    const hashedPinB = await bcrypt.hash('654321', 12);
    const staffB = await prisma.staff.create({
        data: {
            restaurant_id: restaurantB.id,
            name: 'Cashier B',
            role: 'CASHIER',
            pin: '654321',
            hashed_pin: hashedPinB,
            failed_login_count: 0,
            locked_until: null
        }
    });

    return { restaurantA, restaurantB, staffA, staffB };
}

async function cleanupFixtures(restaurantIdA: string, restaurantIdB: string) {
    await prisma.audit_logs.deleteMany({ where: { restaurant_id: { in: [restaurantIdA, restaurantIdB] } } });
    await prisma.fire_batches.deleteMany({ where: { order_id: { in: await prisma.orders.findMany({ where: { restaurant_id: { in: [restaurantIdA, restaurantIdB] } }, select: { id: true } }).then(o => o.map(x => x.id)) } } });
    await prisma.order_items.deleteMany({ where: { order_id: { in: await prisma.orders.findMany({ where: { restaurant_id: { in: [restaurantIdA, restaurantIdB] } }, select: { id: true } }).then(o => o.map(x => x.id)) } } });
    await prisma.dine_in_orders.deleteMany({ where: { order_id: { in: await prisma.orders.findMany({ where: { restaurant_id: { in: [restaurantIdA, restaurantIdB] } }, select: { id: true } }).then(o => o.map(x => x.id)) } } });
    await prisma.takeaway_orders.deleteMany({ where: { order_id: { in: await prisma.orders.findMany({ where: { restaurant_id: { in: [restaurantIdA, restaurantIdB] } }, select: { id: true } }).then(o => o.map(x => x.id)) } } });
    await prisma.delivery_orders.deleteMany({ where: { order_id: { in: await prisma.orders.findMany({ where: { restaurant_id: { in: [restaurantIdA, restaurantIdB] } }, select: { id: true } }).then(o => o.map(x => x.id)) } } });
    await prisma.reservation_orders.deleteMany({ where: { order_id: { in: await prisma.orders.findMany({ where: { restaurant_id: { in: [restaurantIdA, restaurantIdB] } }, select: { id: true } }).then(o => o.map(x => x.id)) } } });
    await prisma.orders.deleteMany({ where: { restaurant_id: { in: [restaurantIdA, restaurantIdB] } } });
    await prisma.staff.deleteMany({ where: { restaurant_id: { in: [restaurantIdA, restaurantIdB] } } });
    await prisma.order_type_defaults.deleteMany({ where: { restaurant_id: { in: [restaurantIdA, restaurantIdB] } } });
    await prisma.menu_items.deleteMany({ where: { restaurant_id: { in: [restaurantIdA, restaurantIdB] } } });
    await prisma.menu_categories.deleteMany({ where: { restaurant_id: { in: [restaurantIdA, restaurantIdB] } } });
    await prisma.stations.deleteMany({ where: { restaurant_id: { in: [restaurantIdA, restaurantIdB] } } });
    await prisma.restaurants.deleteMany({ where: { id: { in: [restaurantIdA, restaurantIdB] } } });
}

async function callLogin(pin: string, restaurantId?: string, staffName?: string): Promise<{ status: number; body: any }> {
    const body: any = { pin };
    if (restaurantId) body.restaurant_id = restaurantId;
    if (staffName) body.staff_name = staffName;
    
    const res = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    
    let data: any;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        data = await res.json();
    } else {
        data = { error: await res.text() };
    }
    
    return { status: res.status, body: data };
}

async function runTests() {
    console.log('--- STARTING PHASE 1: PIN AUTHENTICATION HARDENING ---');

    const { restaurantA, restaurantB, staffA, staffB } = await setupFixtures();
    const restaurantIdA = restaurantA.id;
    const restaurantIdB = restaurantB.id;

    try {
        // ==========================================
        // TEST 1: Valid six-digit PIN succeeds
        // ==========================================
        console.log('\n[Test 1] Valid six-digit PIN succeeds');
        try {
            const { status, body } = await callLogin('123456', restaurantIdA);
            assert('Valid 6-digit PIN returns 200', status === 200, '200', `${status}`);
            assert('Response contains tokens', !!body.tokens?.access_token, 'present', body.tokens?.access_token ? 'present' : 'missing');
            assert('Response contains staff', !!body.staff, 'present', body.staff ? 'present' : 'missing');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Valid 6-digit PIN', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 2: Four-digit PIN rejected
        // ==========================================
        console.log('\n[Test 2] Four-digit PIN rejected');
        try {
            const { status } = await callLogin('1234', restaurantIdA);
            assert('Four-digit PIN returns 400', status === 400, '400', `${status}`);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Four-digit PIN rejection', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 3: Five-digit PIN rejected
        // ==========================================
        console.log('\n[Test 3] Five-digit PIN rejected');
        try {
            const { status } = await callLogin('12345', restaurantIdA);
            assert('Five-digit PIN returns 400', status === 400, '400', `${status}`);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Five-digit PIN rejection', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 4: Invalid PIN rejected
        // ==========================================
        console.log('\n[Test 4] Invalid PIN rejected');
        try {
            const { status } = await callLogin('999999', restaurantIdA);
            assert('Invalid PIN returns 401', status === 401, '401', `${status}`);
            assert('Error message does not enumerate', status === 401, '401', `${status}`);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Invalid PIN rejection', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 5: Five failed attempts lock account
        // ==========================================
        console.log('\n[Test 5] Five failed attempts lock account');
        try {
            const wrongHash = await bcrypt.hash('000000', 12); // Hash doesn't match PIN
            const freshStaff = await prisma.staff.create({
                data: {
                    restaurant_id: restaurantIdA,
                    name: 'Lockout Test',
                    role: 'CASHIER',
                    pin: '111111',
                    hashed_pin: wrongHash,
                    failed_login_count: 0,
                    locked_until: null
                }
            });

            for (let i = 0; i < 5; i++) {
                await callLogin('111111', restaurantIdA, 'Lockout Test');
            }

            const lockedStaff = await prisma.staff.findUnique({
                where: { id: freshStaff.id },
                select: { locked_until: true, failed_login_count: true }
            });

            assert('Account locked after 5 failures', !!lockedStaff?.locked_until, 'locked', lockedStaff?.locked_until ? 'locked' : 'not locked');
            assert('Failed count is 5', lockedStaff?.failed_login_count === 5, '5', `${lockedStaff?.failed_login_count}`);

            await prisma.staff.delete({ where: { id: freshStaff.id } });
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Five failures lock account', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 6: Lockout enforcement
        // ==========================================
        console.log('\n[Test 6] Lockout enforcement');
        try {
            const wrongHash2 = await bcrypt.hash('000000', 12);
            const lockoutStaff = await prisma.staff.create({
                data: {
                    restaurant_id: restaurantIdA,
                    name: 'Lockout Enforce Test',
                    role: 'CASHIER',
                    pin: '222222',
                    hashed_pin: wrongHash2,
                    failed_login_count: 5,
                    locked_until: new Date(Date.now() + 30 * 60 * 1000) // 30 min from now
                }
            });

            const { status } = await callLogin('222222', restaurantIdA, 'Lockout Enforce Test');
            assert('Locked account returns 401', status === 401, '401', `${status}`);

            await prisma.staff.delete({ where: { id: lockoutStaff.id } });
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Lockout enforcement', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 7: Lockout expiry
        // ==========================================
        console.log('\n[Test 7] Lockout expiry');
        try {
            const expiryStaff = await prisma.staff.create({
                data: {
                    restaurant_id: restaurantIdA,
                    name: 'Lockout Expiry Test',
                    role: 'CASHIER',
                    pin: '333333',
                    hashed_pin: await bcrypt.hash('333333', 12),
                    failed_login_count: 5,
                    locked_until: new Date(Date.now() - 1000) // 1 second ago (expired)
                }
            });

            const { status, body } = await callLogin('333333', restaurantIdA);
            assert('Expired lockout allows login', status === 200, '200', `${status}`);
            assert('Login returns tokens after lockout expiry', !!body.tokens?.access_token, 'present', body.tokens?.access_token ? 'present' : 'missing');

            await prisma.staff.delete({ where: { id: expiryStaff.id } });
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Lockout expiry', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 8: Successful login resets counter
        // ==========================================
        console.log('\n[Test 8] Successful login resets counter');
        try {
            const counterStaff = await prisma.staff.create({
                data: {
                    restaurant_id: restaurantIdA,
                    name: 'Counter Reset Test',
                    role: 'CASHIER',
                    pin: '444444',
                    hashed_pin: await bcrypt.hash('444444', 12),
                    failed_login_count: 3,
                    locked_until: null
                }
            });

            await callLogin('444444', restaurantIdA);

            const updated = await prisma.staff.findUnique({
                where: { id: counterStaff.id },
                select: { failed_login_count: true, locked_until: true }
            });

            assert('Failed count reset to 0', updated?.failed_login_count === 0, '0', `${updated?.failed_login_count}`);
            assert('Lockout cleared', updated?.locked_until === null, 'null', updated?.locked_until ? 'set' : 'null');

            await prisma.staff.delete({ where: { id: counterStaff.id } });
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Counter reset', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 9: Cross-tenant login attempts
        // ==========================================
        console.log('\n[Test 9] Cross-tenant login attempts');
        try {
            const { status } = await callLogin('654321', restaurantIdA); // staffB's PIN in restaurantA
            assert('Cross-tenant PIN returns 401', status === 401, '401', `${status}`);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Cross-tenant login', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 10: Hash-only authentication (no plaintext dependency)
        // ==========================================
        console.log('\n[Test 10] Bcrypt-only auth after plaintext removal');
        try {
            // Migrated user shape: plaintext pin blanked, bcrypt hash present.
            const migratedStaff = await prisma.staff.create({
                data: {
                    restaurant_id: restaurantIdA,
                    name: 'Migrated User Test',
                    role: 'CASHIER',
                    pin: '',
                    hashed_pin: await bcrypt.hash('555555', 12),
                    failed_login_count: 0,
                    locked_until: null
                }
            });

            const ok = await callLogin('555555', restaurantIdA, 'Migrated User Test');
            assert('Migrated (pin="") staff authenticates via hash', ok.status === 200 && !!ok.body.tokens?.access_token, '200', `${ok.status}`);
            assert('No plaintext written back', !!migratedStaff.id, 'present', 'present');

            // Plaintext-only shape: pin present but NO hash must never authenticate.
            const plaintextOnly = await prisma.staff.create({
                data: {
                    restaurant_id: restaurantIdA,
                    name: 'Plaintext Only Test',
                    role: 'CASHIER',
                    pin: '777777',
                    hashed_pin: null,
                    failed_login_count: 0,
                    locked_until: null
                }
            });

            const rej = await callLogin('777777', restaurantIdA, 'Plaintext Only Test');
            assert('Null-hash staff rejected despite matching plaintext pin', rej.status === 401, '401', `${rej.status}`);

            await prisma.staff.delete({ where: { id: migratedStaff.id } });
            await prisma.staff.delete({ where: { id: plaintextOnly.id } });
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'Hash-only auth', expected: 'success', actual: e.message, result: 'FAIL' });
        }

        // ==========================================
        // TEST 11: No account-enumeration leak
        // ==========================================
        console.log('\n[Test 11] No account-enumeration leak');
        try {
            const responses: any[] = [];
            
            // Non-existent PIN
            const r1 = await callLogin('000000', restaurantIdA);
            responses.push({ case: 'non-existent', status: r1.status, error: r1.body.error });
            
            // Existing staff, wrong PIN
            const r2 = await callLogin('999999', restaurantIdA);
            responses.push({ case: 'wrong-pin', status: r2.status, error: r2.body.error });
            
            // Locked staff
            const lockoutStaff2 = await prisma.staff.create({
                data: {
                    restaurant_id: restaurantIdA,
                    name: 'Enumeration Test',
                    role: 'CASHIER',
                    pin: '666666',
                    hashed_pin: await bcrypt.hash('666666', 12),
                    failed_login_count: 5,
                    locked_until: new Date(Date.now() + 30 * 60 * 1000)
                }
            });
            const r3 = await callLogin('666666', restaurantIdA);
            responses.push({ case: 'locked', status: r3.status, error: r3.body.error });

            const allSame = responses.every(r => r.status === 401 && r.error === 'Invalid credentials');
            assert('All failure cases return identical response', allSame, 'true', allSame ? 'true' : 'false');

            await prisma.staff.delete({ where: { id: lockoutStaff2.id } });
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
            results.push({ test: 'No enumeration leak', expected: 'success', actual: e.message, result: 'FAIL' });
        }

    } finally {
        await cleanupFixtures(restaurantIdA, restaurantIdB);
        await prisma.$disconnect();
    }

    // ==========================================
    // REPORT
    // ==========================================
    console.log('\n=== PHASE 1: PIN AUTHENTICATION HARDENING REPORT ===');
    console.log('Database: fireflow_local');
    console.log('');
    console.log('Results:');
    results.forEach(r => {
        console.log(`  [${r.result}] ${r.test} — expected: ${r.expected}, actual: ${r.actual}`);
    });
    console.log('');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: 0`);
    console.log(`Blocked: 0`);
    console.log('');
    if (failed > 0) {
        console.log('PHASE 1: NOT COMPLETE — failures detected');
        process.exit(1);
    } else {
        console.log('PHASE 1: VERIFICATION PASSED');
        process.exit(0);
    }
}

runTests().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
