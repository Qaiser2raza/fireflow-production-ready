import { Request, Response } from 'express';
import { supportSessionService } from '../src/api/services/support/SupportSessionService';
import { supportSessionMiddleware, requireSupportScope } from '../src/api/middleware/supportSessionMiddleware';

async function runTests() {
    console.log('--- STARTING SUPPORT SESSION TESTS ---');
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

    // Test 1: Create support session
    console.log('\nTest 1: Create support session');
    try {
        const session = await supportSessionService.createSession({
            restaurant_id: 'rest-123',
            scope: ['READ', 'DIAGNOSTICS'],
            reason: 'Test session',
            created_by: 'platform-user-1',
        });

        if (session && session.id && session.restaurant_id === 'rest-123') {
            console.log('PASS: Session created with id=' + session.id);
            passed++;
            const sessionId = session.id;
        } else {
            console.log('FAIL: Session creation failed');
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 2: Missing scope rejected
    console.log('\nTest 2: Missing scope rejected');
    try {
        await supportSessionService.createSession({
            restaurant_id: 'rest-123',
            scope: [],
            reason: 'Test',
            created_by: 'platform-user-1',
        });
        console.log('FAIL: Should have rejected empty scope');
        failed++;
    } catch (err) {
        console.log('PASS: Rejected empty scope');
        passed++;
    }

    // Test 3: Invalid scope rejected
    console.log('\nTest 3: Invalid scope rejected');
    try {
        await supportSessionService.createSession({
            restaurant_id: 'rest-123',
            scope: ['INVALID_SCOPE'] as any,
            reason: 'Test',
            created_by: 'platform-user-1',
        });
        console.log('FAIL: Should have rejected invalid scope');
        failed++;
    } catch (err) {
        console.log('PASS: Rejected invalid scope');
        passed++;
    }

    // Test 4: Scope enforcement - READ allowed
    console.log('\nTest 4: Scope enforcement - READ allowed');
    try {
        const middleware = requireSupportScope('READ');
        const session = await supportSessionService.createSession({
            restaurant_id: 'rest-123',
            scope: ['READ'],
            reason: 'Test',
            created_by: 'platform-user-1',
        });
        const req = { supportSession: session, supportScopes: session.scope } as any;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        middleware(req, res, next);
        if (nextCalled) {
            console.log('PASS: READ scope allowed');
            passed++;
        } else {
            console.log('FAIL: Expected next() to be called');
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 5: Scope enforcement - MENU denied without MENU scope
    console.log('\nTest 5: Scope enforcement - MENU denied without MENU scope');
    try {
        const middleware = requireSupportScope('MENU');
        const session = await supportSessionService.createSession({
            restaurant_id: 'rest-123',
            scope: ['READ'],
            reason: 'Test',
            created_by: 'platform-user-1',
        });
        const req = { supportSession: session, supportScopes: session.scope } as any;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        middleware(req, res, next);
        if (!nextCalled && res.getStatus() === 403) {
            console.log('PASS: MENU scope denied');
            passed++;
        } else {
            console.log('FAIL: Expected 403, got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 6: supportSessionMiddleware - missing session ID
    console.log('\nTest 6: supportSessionMiddleware - missing session ID');
    try {
        const req = { params: {}, headers: {} } as Request;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        await supportSessionMiddleware(req, res, next);
        if (!nextCalled && res.getStatus() === 401) {
            console.log('PASS: Rejected missing session ID');
            passed++;
        } else {
            console.log('FAIL: Expected 401, got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 7: supportSessionMiddleware - invalid session ID
    console.log('\nTest 7: supportSessionMiddleware - invalid session ID');
    try {
        const req = { params: { sessionId: 'invalid-id' }, headers: {} } as any;
        const res = createMockRes();
        let nextCalled = false;
        const next = () => { nextCalled = true; };
        await supportSessionMiddleware(req, res, next);
        if (!nextCalled && res.getStatus() === 401) {
            console.log('PASS: Rejected invalid session ID');
            passed++;
        } else {
            console.log('FAIL: Expected 401, got status=' + res.getStatus() + ', nextCalled=' + nextCalled);
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 8: Revoke session
    console.log('\nTest 8: Revoke session');
    try {
        const session = await supportSessionService.createSession({
            restaurant_id: 'rest-123',
            scope: ['READ'],
            reason: 'Test',
            created_by: 'platform-user-1',
        });
        const revoked = await supportSessionService.revokeSession(session.id, 'platform-user-1');
        if (revoked && revoked.status === 'REVOKED') {
            console.log('PASS: Session revoked');
            passed++;
        } else {
            console.log('FAIL: Session not revoked');
            failed++;
        }
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 9: Revoked session cannot be used
    console.log('\nTest 9: Revoked session cannot be used');
    try {
        const session = await supportSessionService.createSession({
            restaurant_id: 'rest-123',
            scope: ['READ'],
            reason: 'Test',
            created_by: 'platform-user-1',
        });
        await supportSessionService.revokeSession(session.id, 'platform-user-1');
        const req = { params: { sessionId: session.id }, headers: {} } as any;
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
    } catch (err) {
        console.log('FAIL: Exception:', err);
        failed++;
    }

    // Test 10: getSession returns null for non-existent session
    console.log('\nTest 10: getSession returns null for non-existent session');
    try {
        const result = await supportSessionService.getSession('non-existent-id');
        if (result === null) {
            console.log('PASS: Non-existent session returns null');
            passed++;
        } else {
            console.log('FAIL: Expected null, got=' + result);
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

    // The suite reaches Prisma only through services (shared singleton);
    // resolve it here and disconnect, then force-exit both paths.
    const { prisma } = await import('../src/shared/lib/prisma');
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

