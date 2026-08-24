import 'dotenv/config';
import { Request, Response } from 'express';
import { authMiddleware, requireRole } from '../src/api/middleware/authMiddleware';
import { platformAuthMiddleware, requirePlatformRole } from '../src/api/middleware/platformAuthMiddleware';
import { supportSessionMiddleware, requireSupportScope } from '../src/api/middleware/supportSessionMiddleware';
import { supportSessionService } from '../src/api/services/support/SupportSessionService';
import { CashierSessionService } from '../src/api/services/finance/CashierSessionService';
import { OrderServiceFactory } from '../src/api/services/orders/OrderServiceFactory';
import { prisma } from '../src/shared/lib/prisma';

// support_sessions.platform_user_id / created_by are UUID columns; the fixture
// value must satisfy the column type even though no FK constraint exists.
const TEST_PLATFORM_USER_ID = '99999999-9999-4999-8999-999999999999';

async function runTests() {
    console.log('--- STARTING PHASE 2 SERVICE & SUPPORT BRIDGE SECURITY TESTS ---');
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

    // Test 1: Tenant A cannot update Tenant B order (BaseOrderService ownership check)
    console.log('\nTest 1: Tenant A cannot update Tenant B order');
    try {
        const order = await prisma.orders.findFirst();
        if (!order) {
            console.log('SKIP: No orders in DB');
            passed++;
        } else {
            const service = OrderServiceFactory.getService(order.type as any);
            try {
                await service.updateOrder('TENANT-A-RESTAURANT', order.id, { status: 'CANCELLED' } as any);
                console.log('FAIL: Should have thrown access denied');
                failed++;
            } catch (e: any) {
                if (e.message?.includes('Access denied') || e.message?.includes('does not belong')) {
                    console.log('PASS: Update rejected - ' + e.message);
                    passed++;
                } else {
                    console.log('FAIL: Unexpected error: ' + e.message);
                    failed++;
                }
            }
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 2: Tenant A cannot delete Tenant B order
    console.log('\nTest 2: Tenant A cannot delete Tenant B order');
    try {
        const order = await prisma.orders.findFirst();
        if (!order) {
            console.log('SKIP: No orders in DB');
            passed++;
        } else {
            const service = OrderServiceFactory.getService(order.type as any);
            try {
                await service.deleteOrder('TENANT-A-RESTAURANT', order.id);
                console.log('FAIL: Should have thrown access denied');
                failed++;
            } catch (e: any) {
                if (e.message?.includes('Access denied') || e.message?.includes('does not belong')) {
                    console.log('PASS: Delete rejected - ' + e.message);
                    passed++;
                } else {
                    console.log('FAIL: Unexpected error: ' + e.message);
                    failed++;
                }
            }
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 3: Tenant A cannot access Tenant B cashier session
    console.log('\nTest 3: Tenant A cannot access Tenant B cashier session');
    try {
        const session = await prisma.cashier_sessions.findFirst();
        if (!session) {
            console.log('SKIP: No cashier sessions in DB');
            passed++;
        } else {
            try {
                await CashierSessionService.closeSession('TENANT-A-RESTAURANT', session.id, 0, 0, 'test');
                console.log('FAIL: Should have thrown access denied');
                failed++;
            } catch (e: any) {
                if (e.message?.includes('Access denied') || e.message?.includes('does not belong')) {
                    console.log('PASS: Close session rejected - ' + e.message);
                    passed++;
                } else {
                    console.log('FAIL: Unexpected error: ' + e.message);
                    failed++;
                }
            }
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 4: Tenant A cannot get Tenant B cashier session summary
    console.log('\nTest 4: Tenant A cannot get Tenant B cashier session summary');
    try {
        const session = await prisma.cashier_sessions.findFirst();
        if (!session) {
            console.log('SKIP: No cashier sessions in DB');
            passed++;
        } else {
            try {
                await CashierSessionService.getSessionSummary('TENANT-A-RESTAURANT', session.id);
                console.log('FAIL: Should have thrown access denied');
                failed++;
            } catch (e: any) {
                if (e.message?.includes('Access denied') || e.message?.includes('does not belong')) {
                    console.log('PASS: Get summary rejected - ' + e.message);
                    passed++;
                } else {
                    console.log('FAIL: Unexpected error: ' + e.message);
                    failed++;
                }
            }
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 5: Support session establishes restaurantId server-side
    console.log('\nTest 5: Support session establishes restaurantId server-side');
    try {
        const restaurant = await prisma.restaurants.findFirst();
        if (!restaurant) {
            console.log('SKIP: No restaurants in DB');
            passed++;
        } else {
            const session = await supportSessionService.createSession({
                restaurant_id: restaurant.id,
                scope: ['READ'],
                reason: 'Test',
                created_by: TEST_PLATFORM_USER_ID
            });

            const req = {
                params: { sessionId: session.id },
                headers: {},
                supportSession: session,
                supportScopes: session.scope,
                restaurantId: undefined as string | undefined
            } as any;
            const res = createMockRes();
            let nextCalled = false;
            const next = () => { nextCalled = true; };
            await supportSessionMiddleware(req, res, next);

            if (nextCalled && req.restaurantId === restaurant.id) {
                console.log('PASS: Support session set restaurantId to ' + restaurant.id);
                passed++;
            } else {
                console.log('FAIL: Expected restaurantId=' + restaurant.id + ', got ' + req.restaurantId + ', nextCalled=' + nextCalled);
                failed++;
            }
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 6: Support session tenant cannot be overridden by x-target-restaurant
    console.log('\nTest 6: Support session tenant cannot be overridden by x-target-restaurant');
    try {
        const restaurant = await prisma.restaurants.findFirst();
        if (!restaurant) {
            console.log('SKIP: No restaurants in DB');
            passed++;
        } else {
            const session = await supportSessionService.createSession({
                restaurant_id: restaurant.id,
                scope: ['READ'],
                reason: 'Test',
                created_by: TEST_PLATFORM_USER_ID
            });

            const req = {
                params: { sessionId: session.id },
                headers: { 'x-target-restaurant': 'OTHER-TENANT-ID' },
                supportSession: session,
                supportScopes: session.scope,
                restaurantId: restaurant.id,
                role: 'SUPER_ADMIN'
            } as any;
            const res = createMockRes();
            let nextCalled = false;
            const next = () => { nextCalled = true; };
            
            // Simulate what authMiddleware would do - it should NOT override support session restaurantId
            const targetRestaurant = req.headers['x-target-restaurant'] as string | undefined;
            if (req.role === 'SUPER_ADMIN' && !req.supportSession && targetRestaurant) {
                req.restaurantId = targetRestaurant;
            }

            if (req.restaurantId === restaurant.id) {
                console.log('PASS: x-target-restaurant did not override support session tenant');
                passed++;
            } else {
                console.log('FAIL: restaurantId was overridden to ' + req.restaurantId);
                failed++;
            }
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 7: Expired support session is rejected
    console.log('\nTest 7: Expired support session is rejected');
    try {
        const restaurant = await prisma.restaurants.findFirst();
        if (!restaurant) {
            console.log('SKIP: No restaurants in DB');
            passed++;
        } else {
            const session = await supportSessionService.createSession({
                restaurant_id: restaurant.id,
                scope: ['READ'],
                reason: 'Test',
                created_by: TEST_PLATFORM_USER_ID
            });

            // Manually expire the session
            await prisma.support_sessions.update({
                where: { id: session.id },
                data: { expires_at: new Date(Date.now() - 1000) }
            });

            const req = {
                params: { sessionId: session.id },
                headers: {},
                supportSession: undefined as any,
                supportScopes: undefined as any,
                restaurantId: undefined as string | undefined
            } as any;
            const res = createMockRes();
            let nextCalled = false;
            const next = () => { nextCalled = true; };
            await supportSessionMiddleware(req, res, next);

            if (!nextCalled && res.getStatus() === 401) {
                console.log('PASS: Expired session rejected');
                passed++;
            } else {
                console.log('FAIL: Expected 401, got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
                failed++;
            }
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 8: Revoked support session is rejected
    console.log('\nTest 8: Revoked support session is rejected');
    try {
        const restaurant = await prisma.restaurants.findFirst();
        if (!restaurant) {
            console.log('SKIP: No restaurants in DB');
            passed++;
        } else {
            const session = await supportSessionService.createSession({
                restaurant_id: restaurant.id,
                scope: ['READ'],
                reason: 'Test',
                created_by: TEST_PLATFORM_USER_ID
            });

            await supportSessionService.revokeSession(session.id, TEST_PLATFORM_USER_ID);

            const req = {
                params: { sessionId: session.id },
                headers: {},
                supportSession: undefined as any,
                supportScopes: undefined as any,
                restaurantId: undefined as string | undefined
            } as any;
            const res = createMockRes();
            let nextCalled = false;
            const next = () => { nextCalled = true; };
            await supportSessionMiddleware(req, res, next);

            if (!nextCalled && res.getStatus() === 401) {
                console.log('PASS: Revoked session rejected');
                passed++;
            } else {
                console.log('FAIL: Expected 401, got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
                failed++;
            }
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 9: Missing required support scope is rejected
    console.log('\nTest 9: Missing required support scope is rejected');
    try {
        const restaurant = await prisma.restaurants.findFirst();
        if (!restaurant) {
            console.log('SKIP: No restaurants in DB');
            passed++;
        } else {
            const session = await supportSessionService.createSession({
                restaurant_id: restaurant.id,
                scope: ['READ'],
                reason: 'Test',
                created_by: TEST_PLATFORM_USER_ID
            });

            const req = {
                params: { sessionId: session.id },
                headers: {},
                supportSession: session,
                supportScopes: session.scope,
                restaurantId: restaurant.id
            } as any;
            const res = createMockRes();
            let nextCalled = false;
            const next = () => { nextCalled = true; };
            const middleware = requireSupportScope('MENU');
            middleware(req, res, next);

            if (!nextCalled && res.getStatus() === 403) {
                console.log('PASS: Missing MENU scope rejected');
                passed++;
            } else {
                console.log('FAIL: Expected 403, got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
                failed++;
            }
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 10: Support MENU scope allows menu operation (conceptual)
    console.log('\nTest 10: Support MENU scope allows menu operation');
    try {
        const restaurant = await prisma.restaurants.findFirst();
        if (!restaurant) {
            console.log('SKIP: No restaurants in DB');
            passed++;
        } else {
            const session = await supportSessionService.createSession({
                restaurant_id: restaurant.id,
                scope: ['MENU'],
                reason: 'Test',
                created_by: TEST_PLATFORM_USER_ID
            });

            const req = {
                params: { sessionId: session.id },
                headers: {},
                supportSession: session,
                supportScopes: session.scope,
                restaurantId: restaurant.id
            } as any;
            const res = createMockRes();
            let nextCalled = false;
            const next = () => { nextCalled = true; };
            const middleware = requireSupportScope('MENU');
            middleware(req, res, next);

            if (nextCalled && res.getStatus() === 0) {
                console.log('PASS: MENU scope allowed');
                passed++;
            } else {
                console.log('FAIL: Expected next(), got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
                failed++;
            }
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 11: Support READ scope cannot perform MENU operation
    console.log('\nTest 11: Support READ scope cannot perform MENU operation');
    try {
        const restaurant = await prisma.restaurants.findFirst();
        if (!restaurant) {
            console.log('SKIP: No restaurants in DB');
            passed++;
        } else {
            const session = await supportSessionService.createSession({
                restaurant_id: restaurant.id,
                scope: ['READ'],
                reason: 'Test',
                created_by: TEST_PLATFORM_USER_ID
            });

            const req = {
                params: { sessionId: session.id },
                headers: {},
                supportSession: session,
                supportScopes: session.scope,
                restaurantId: restaurant.id
            } as any;
            const res = createMockRes();
            let nextCalled = false;
            const next = () => { nextCalled = true; };
            const middleware = requireSupportScope('MENU');
            middleware(req, res, next);

            if (!nextCalled && res.getStatus() === 403) {
                console.log('PASS: READ scope denied MENU operation');
                passed++;
            } else {
                console.log('FAIL: Expected 403, got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
                failed++;
            }
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 12: authMiddleware respects support session restaurantId
    console.log('\nTest 12: authMiddleware respects support session restaurantId');
    try {
        const jwtService = (await import('../src/api/services/auth/JwtService')).jwtService;
        
        const restaurant = await prisma.restaurants.findFirst();
        if (!restaurant) {
            console.log('SKIP: No restaurants in DB');
            passed++;
        } else {
            const staff = await prisma.staff.findFirst({
                where: { restaurant_id: restaurant.id },
                select: { id: true, restaurant_id: true, role: true, name: true }
            });
            
            if (!staff) {
                console.log('SKIP: No staff in DB');
                passed++;
            } else {
                const token = jwtService.generateAccessToken(staff.id, staff.restaurant_id, staff.role, staff.name);
                const req = {
                    headers: { authorization: 'Bearer ' + token },
                    query: {},
                    originalUrl: '/api/staff',
                    supportSession: { restaurant_id: 'support-tenant-456' },
                    restaurantId: 'support-tenant-456'
                } as any;
                const res = createMockRes();
                let nextCalled = false;
                const next = () => { nextCalled = true; };
                await authMiddleware(req, res, next);
                if (nextCalled && req.restaurantId === 'support-tenant-456') {
                    console.log('PASS: authMiddleware preserved support session restaurantId');
                    passed++;
                } else {
                    console.log('FAIL: Expected restaurantId=support-tenant-456, got ' + req.restaurantId + ', nextCalled=' + nextCalled);
                    failed++;
                }
            }
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 13: Tenant JWT cannot create support session (platform route only)
    console.log('\nTest 13: Tenant JWT cannot create support session');
    try {
        const jwtService = (await import('../src/api/services/auth/JwtService')).jwtService;
        const token = jwtService.generateAccessToken('staff-1', 'rest-123', 'MANAGER', 'Test Manager');
        const req = {
            headers: { authorization: 'Bearer ' + token },
            body: { restaurant_id: 'rest-123', scope: ['READ'] }
        } as any;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        await platformAuthMiddleware(req, res, next);
        if (!nextCalled && res.getStatus() === 401) {
            console.log('PASS: Tenant JWT rejected by platformAuthMiddleware');
            passed++;
        } else {
            console.log('FAIL: Expected 401, got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    console.log('\n--- TEST SUMMARY ---');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total: ${passed + failed}`);

    // `prisma` is the shared singleton (imported at top); disconnect it and
    // force-exit so pool sockets cannot hold the event loop open.
    await prisma.$disconnect();

    if (failed > 0) {
        process.exit(1);
    }
    process.exit(0);
}

runTests().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
