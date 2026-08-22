import 'dotenv/config';
import { Request, Response } from 'express';
import { platformAuthService } from '../src/api/services/platform/PlatformAuthService';
import { platformAuthMiddleware, requirePlatformRole } from '../src/api/middleware/platformAuthMiddleware';

async function runTests() {
    console.log('--- STARTING PLATFORM AUTH SECURITY TESTS ---');
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

    // Test 1: Missing Authorization header -> 401
    console.log('\nTest 1: Missing Authorization header');
    try {
        const req = { headers: {} } as Request;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        await platformAuthMiddleware(req, res, next);
        if (!nextCalled && res.getStatus() === 401) {
            console.log('PASS: Rejected missing Authorization header');
            passed++;
        } else {
            console.log('FAIL: Expected 401, got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 2: Empty Bearer token -> 401
    console.log('\nTest 2: Empty Bearer token');
    try {
        const req = { headers: { authorization: 'Bearer ' } } as Request;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        await platformAuthMiddleware(req, res, next);
        if (!nextCalled && res.getStatus() === 401) {
            console.log('PASS: Rejected empty Bearer token');
            passed++;
        } else {
            console.log('FAIL: Expected 401, got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 3: Invalid token format -> 401
    console.log('\nTest 3: Invalid token format');
    try {
        const req = { headers: { authorization: 'Bearer invalid-token-format' } } as Request;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        await platformAuthMiddleware(req, res, next);
        if (!nextCalled && res.getStatus() === 401) {
            console.log('PASS: Rejected invalid token format');
            passed++;
        } else {
            console.log('FAIL: Expected 401, got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 4: Platform role enforcement -- SUPPORT_AGENT denied PLATFORM_OWNER route
    console.log('\nTest 4: Platform role enforcement');
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

    // Test 5: Platform role enforcement -- PLATFORM_OWNER allowed
    console.log('\nTest 5: Platform role enforcement -- PLATFORM_OWNER allowed');
    try {
        const middleware = requirePlatformRole('PLATFORM_OWNER');
        const req = { platformUser: { id: 'test', role: 'PLATFORM_OWNER' } } as any;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        middleware(req, res, next);
        if (nextCalled && res.getStatus() === 0) {
            console.log('PASS: Allowed PLATFORM_OWNER');
            passed++;
        } else {
            console.log('FAIL: Expected next() to be called, got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 6: Platform auth service initialization
    console.log('\nTest 6: PlatformAuthService initialization');
    try {
        if (platformAuthService) {
            console.log('PASS: PlatformAuthService initialized');
            passed++;
        } else {
            console.log('FAIL: PlatformAuthService not initialized');
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 7: x-target-restaurant header does not create platform authority
    console.log('\nTest 7: x-target-restaurant ignored by platform auth');
    try {
        const req = {
            headers: {
                authorization: 'Bearer some-token',
                'x-target-restaurant': 'some-restaurant-id'
            }
        } as any;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        await platformAuthMiddleware(req, res, next);
        if (!nextCalled && res.getStatus() === 401) {
            console.log('PASS: x-target-restaurant does not bypass platform auth');
            passed++;
        } else {
            console.log('FAIL: Expected 401, got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 8: Request body role does not create platform authority
    console.log('\nTest 8: Request body role ignored by platform auth');
    try {
        const req = {
            headers: { authorization: 'Bearer some-token' },
            body: { role: 'PLATFORM_OWNER' }
        } as any;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        await platformAuthMiddleware(req, res, next);
        if (!nextCalled && res.getStatus() === 401) {
            console.log('PASS: Request body role does not bypass platform auth');
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

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
});
