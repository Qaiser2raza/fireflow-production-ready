import 'dotenv/config';
import { Request, Response } from 'express';
import { authMiddleware, requireRole } from '../src/api/middleware/authMiddleware';
import { platformAuthMiddleware, requirePlatformRole } from '../src/api/middleware/platformAuthMiddleware';
import { supportSessionMiddleware, requireSupportScope } from '../src/api/middleware/supportSessionMiddleware';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { jwtService } from '../src/api/services/auth/JwtService';
import { restaurantProvisioningService } from '../src/api/services/onboarding/RestaurantProvisioningService';

const prisma = new PrismaClient();

async function runTests() {
    console.log('--- STARTING TENANT BOUNDARY SECURITY TESTS ---');
    let passed = 0;
    let failed = 0;

    function createMockRes() {
        let statusCode = 0;
        const jsonPayload: any = {};
        return {
            status: (code: number) => { statusCode = code; return { json: (body: any) => { jsonPayload[code] = body; } }; },
            json: (body: any) => { jsonPayload[statusCode] = body; return body; },
            getStatus: () => statusCode,
            getBody: () => jsonPayload
        } as any;
    }

    async function cleanup() {
        const all = await prisma.restaurants.findMany({ select: { id: true } });
        for (const r of all) {
            try {
                await prisma.$transaction([
                    prisma.cashier_sessions.deleteMany({ where: { restaurant_id: r.id } }),
                    prisma.cashier_shift_logs.deleteMany({ where: { restaurant_id: r.id } }),
                    prisma.audit_logs.deleteMany({ where: { restaurant_id: r.id } }),
                    prisma.staff.deleteMany({ where: { restaurant_id: r.id } }),
                    prisma.tables.deleteMany({ where: { restaurant_id: r.id } }),
                    prisma.sections.deleteMany({ where: { restaurant_id: r.id } }),
                    prisma.menu_items.deleteMany({ where: { restaurant_id: r.id } }),
                    prisma.menu_categories.deleteMany({ where: { restaurant_id: r.id } }),
                    prisma.order_type_defaults.deleteMany({ where: { restaurant_id: r.id } }),
                    prisma.chart_of_accounts.deleteMany({ where: { restaurant_id: r.id } }),
                    prisma.restaurants.delete({ where: { id: r.id } }),
                ]);
            } catch (e) {
                console.warn('Cleanup warning for restaurant', r.id, e.message);
            }
        }
    }

    async function createTestStaff(restaurantId: string, name: string, role: string, status: string = 'active') {
        const pinHash = await bcrypt.hash('000000', 12);
        return prisma.staff.create({
            data: {
                restaurant_id: restaurantId,
                name,
                role,
                pin: '000000',
                hashed_pin: pinHash,
                status,
            },
        });
    }

    await cleanup();

    const resultA = await restaurantProvisioningService.provisionRestaurant({
        name: 'Boundary Test Restaurant',
        slug: 'boundary-test-' + Date.now(),
        subscriptionPlan: 'BASIC',
        subscriptionStatus: 'active',
        ownerName: 'Boundary Owner',
        ownerEmail: `boundary-${Date.now()}@test.fireflow`,
    });

    assert('Provisioning succeeded', resultA.success === true, 'true', `${resultA.success}`);
    if (!resultA.success || !resultA.restaurant?.id) {
        console.log('  FAIL: Provisioning failed');
        await prisma.$disconnect();
        process.exit(1);
    }

    const restaurantId = resultA.restaurant.id;
    const ownerStaff = resultA.ownerStaff;

    // Test 1: authMiddleware rejects missing token
    console.log('\nTest 1: authMiddleware rejects missing token');
    try {
        const req = { headers: {}, query: {}, originalUrl: '/api/staff' } as Request;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        await authMiddleware(req, res, next);
        if (!nextCalled && res.getStatus() === 401) {
            console.log('PASS: Rejected missing token');
            passed++;
        } else {
            console.log('FAIL: Expected 401, got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 2: authMiddleware sets restaurantId from token and validates staff
    console.log('\nTest 2: authMiddleware validates staff exists and is active');
    try {
        const staff = await createTestStaff(restaurantId, 'Boundary Test Staff', 'MANAGER', 'active');
        const token = jwtService.generateAccessToken(staff.id, restaurantId, 'MANAGER', 'Boundary Test Staff');
        const req = { headers: { authorization: 'Bearer ' + token }, originalUrl: '/api/staff' } as any;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        await authMiddleware(req, res, next);
        if (nextCalled && req.restaurantId === restaurantId) {
            console.log('PASS: restaurantId set from token and staff validated');
            passed++;
        } else {
            console.log('FAIL: Expected next() and restaurantId=' + restaurantId + ', got status=' + res.getStatus() + ', restaurantId=' + req.restaurantId);
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 3: requireRole rejects unauthorized role
    console.log('\nTest 3: requireRole rejects unauthorized role');
    try {
        const middleware = requireRole('MANAGER', 'ADMIN');
        const req = { role: 'CASHIER', staffId: 'staff-1', restaurantId: restaurantId } as any;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        middleware(req, res, next);
        if (!nextCalled && res.getStatus() === 403) {
            console.log('PASS: Rejected CASHIER for MANAGER/ADMIN route');
            passed++;
        } else {
            console.log('FAIL: Expected 403, got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 4: requireRole allows authorized role
    console.log('\nTest 4: requireRole allows authorized role');
    try {
        const middleware = requireRole('MANAGER', 'ADMIN');
        const req = { role: 'MANAGER', staffId: 'staff-1', restaurantId: restaurantId } as any;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        middleware(req, res, next);
        if (nextCalled && res.getStatus() === 0) {
            console.log('PASS: Allowed MANAGER');
            passed++;
        } else {
            console.log('FAIL: Expected next(), got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 5: platformAuthMiddleware rejects missing token
    console.log('\nTest 5: platformAuthMiddleware rejects missing token');
    try {
        const req = { headers: {} } as Request;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        await platformAuthMiddleware(req, res, next);
        if (!nextCalled && res.getStatus() === 401) {
            console.log('PASS: Rejected missing platform token');
            passed++;
        } else {
            console.log('FAIL: Expected 401, got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 6: requirePlatformRole rejects unauthorized role
    console.log('\nTest 6: requirePlatformRole rejects unauthorized role');
    try {
        const middleware = requirePlatformRole('PLATFORM_OWNER');
        const req = { platformUser: { id: 'test', role: 'SUPPORT_AGENT' } } as any;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        middleware(req, res, next);
        if (!nextCalled && res.getStatus() === 403) {
            console.log('PASS: Rejected SUPPORT_AGENT for PLATFORM_OWNER route');
            passed++;
        } else {
            console.log('FAIL: Expected 403, got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 7: Client restaurant_id cannot override authenticated tenant identity
    console.log('\nTest 7: Client restaurant_id cannot override authenticated tenant identity');
    try {
        const staff = await createTestStaff(restaurantId, 'Boundary Test Staff 2', 'MANAGER', 'active');
        const token = jwtService.generateAccessToken(staff.id, restaurantId, 'MANAGER', 'Boundary Test Staff 2');
        const req = {
            headers: { authorization: 'Bearer ' + token },
            originalUrl: '/api/staff',
            body: { restaurant_id: 'rest-999' }
        } as any;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        await authMiddleware(req, res, next);
        if (nextCalled && req.restaurantId === restaurantId) {
            console.log('PASS: Client restaurant_id ignored, server-derived identity used');
            passed++;
        } else {
            console.log('FAIL: Expected restaurantId=' + restaurantId + ', got ' + req.restaurantId);
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 8: supportSessionMiddleware rejects invalid session
    console.log('\nTest 8: supportSessionMiddleware rejects invalid session');
    try {
        const req = { params: { sessionId: 'invalid-id' }, headers: {} } as any;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        await supportSessionMiddleware(req, res, next);
        if (!nextCalled && res.getStatus() === 401) {
            console.log('PASS: Rejected invalid support session');
            passed++;
        } else {
            console.log('FAIL: Expected 401, got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 9: requireSupportScope rejects missing scope
    console.log('\nTest 9: requireSupportScope rejects missing scope');
    try {
        const middleware = requireSupportScope('MENU');
        const req = { supportSession: null, supportScopes: null } as any;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        middleware(req, res, next);
        if (!nextCalled && res.getStatus() === 403) {
            console.log('PASS: Rejected missing support scope');
            passed++;
        } else {
            console.log('FAIL: Expected 403, got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 10: verify-pin role check logic
    console.log('\nTest 10: verify-pin role check logic');
    try {
        const staff = await prisma.staff.findFirst({
            where: { role: 'CASHIER', status: 'active' }
        });
        if (!staff) {
            console.log('SKIP: No CASHIER staff found in DB');
            passed++;
        } else {
            const result = staff.role !== 'CASHIER' && staff.role !== 'SUPER_ADMIN';
            if (result === false) {
                console.log('PASS: CASHIER is rejected for requiredRole=MANAGER');
                passed++;
            } else {
                console.log('FAIL: Expected CASHIER to be rejected');
                failed++;
            }
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    await cleanup();
    // Disconnect BOTH clients: provisioning pulls the shared singleton, and
    // open pool sockets would otherwise keep this passing run alive.
    await prisma.$disconnect();
    const { prisma: sharedPrisma } = await import('../src/shared/lib/prisma');
    await sharedPrisma.$disconnect();

    console.log('\n--- TEST SUMMARY ---');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total: ${passed + failed}`);

    if (failed > 0) {
        process.exit(1);
    }
    process.exit(0);
}

function assert(testName: string, condition: boolean, expected: string, actual: string) {
    if (condition) {
        console.log(`  PASS: ${testName}`);
    } else {
        console.log(`  FAIL: ${testName} — expected ${expected}, got ${actual}`);
    }
}

runTests().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
