import 'dotenv/config';
import { PrismaClient, PlatformRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { platformAuthService } from '../src/api/services/platform/PlatformAuthService';
import { platformJwtService } from '../src/api/services/platform/PlatformJwtService';

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
    const ownerPasswordHash = await platformAuthService.hashPassword('OwnerPass123!');
    const engineerPasswordHash = await platformAuthService.hashPassword('EngineerPass123!');
    const agentPasswordHash = await platformAuthService.hashPassword('AgentPass123!');

    const owner = await prisma.platform_users.create({
        data: {
            email: `owner-${ts}@test.fireflow`,
            password_hash: ownerPasswordHash,
            name: 'Test Owner',
            role: 'PLATFORM_OWNER',
            status: 'ACTIVE',
        },
    });

    const engineer = await prisma.platform_users.create({
        data: {
            email: `engineer-${ts}@test.fireflow`,
            password_hash: engineerPasswordHash,
            name: 'Test Engineer',
            role: 'SUPPORT_ENGINEER',
            status: 'ACTIVE',
        },
    });

    const agent = await prisma.platform_users.create({
        data: {
            email: `agent-${ts}@test.fireflow`,
            password_hash: agentPasswordHash,
            name: 'Test Agent',
            role: 'SUPPORT_AGENT',
            status: 'ACTIVE',
        },
    });

    return { owner, engineer, agent, ts };
}

async function cleanupFixtures(ts: number) {
    const suffix = `@test.fireflow`;
    const users = await prisma.platform_users.findMany({
        where: { email: { endsWith: suffix } },
    });
    const ids = users.map(u => u.id);
    if (ids.length === 0) return;

    await prisma.platform_sessions.deleteMany({ where: { platform_user_id: { in: ids } } });
    await prisma.password_reset_tokens.deleteMany({ where: { platform_user_id: { in: ids } } });
    await prisma.platform_password_history.deleteMany({ where: { platform_user_id: { in: ids } } });
    await prisma.platform_users.deleteMany({ where: { id: { in: ids } } });
    await prisma.audit_logs.deleteMany({ where: { entity_type: 'PLATFORM_USER' } });
}

async function callApi(method: string, path: string, body?: any, token?: string): Promise<{ status: number; body: any }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`http://localhost:3001${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
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

async function login(email: string, password: string): Promise<{ status: number; body: any }> {
    return callApi('POST', '/api/platform/auth/login', { email, password });
}

async function runTests() {
    console.log('--- STARTING PHASE 2: PLATFORM EMAIL/PASSWORD AUTHENTICATION ---');

    const { owner, engineer, agent, ts } = await setupFixtures();

    try {
        // ==========================================
        // TEST 1: Valid login
        // ==========================================
        console.log('\n[Test 1] Valid login');
        try {
            const { status, body } = await login(owner.email, 'OwnerPass123!');
            assert('Valid login returns 200', status === 200, '200', `${status}`);
            assert('Response contains access_token', !!body.tokens?.access_token, 'present', body.tokens?.access_token ? 'present' : 'missing');
            assert('Response contains user', !!body.user, 'present', body.user ? 'present' : 'missing');
            assert('must_change_password is false', body.must_change_password === false, 'false', `${body.must_change_password}`);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
        }

        // ==========================================
        // TEST 2: Invalid credentials
        // ==========================================
        console.log('\n[Test 2] Invalid credentials');
        try {
            const { status } = await login(owner.email, 'wrongpassword');
            assert('Invalid password returns 401', status === 401, '401', `${status}`);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
        }

        // ==========================================
        // TEST 3: Email enumeration prevention
        // ==========================================
        console.log('\n[Test 3] Email enumeration prevention');
        try {
            const r1 = await login('nonexistent@test.fireflow', 'password');
            const r2 = await login(owner.email, 'wrongpassword');
            const r3 = await login(agent.email, 'wrongpassword');

            assert('Non-existent email returns 401', r1.status === 401, '401', `${r1.status}`);
            assert('Wrong password returns 401', r2.status === 401, '401', `${r2.status}`);
            assert('Agent wrong password returns 401', r3.status === 401, '401', `${r3.status}`);
            assert('All errors identical', r1.body.error === r2.body.error && r2.body.error === r3.body.error, 'true', 'compare');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
        }

        // ==========================================
        // TEST 4: Password policy enforcement
        // ==========================================
        console.log('\n[Test 4] Password policy enforcement');
        try {
            const ownerLoginForPolicy = await login(owner.email, 'OwnerPass123!');
            const ownerTokenForPolicy = ownerLoginForPolicy.body.tokens?.access_token;

            const short = await callApi('POST', '/api/platform/auth/create-account', {
                email: `short-${ts}@test.fireflow`,
                password: 'Short1!',
                name: 'Short',
                role: 'SUPPORT_AGENT',
            }, ownerTokenForPolicy);

            const longPassword = 'A'.repeat(129) + '1!';
            const long = await callApi('POST', '/api/platform/auth/create-account', {
                email: `long-${ts}@test.fireflow`,
                password: longPassword,
                name: 'Long',
                role: 'SUPPORT_AGENT',
            }, ownerTokenForPolicy);

            assert('Short password rejected', short.status === 400, '400', `${short.status}`);
            assert('Long password rejected', long.status === 400, '400', `${long.status}`);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
        }

        // ==========================================
        // TEST 5: Password hashing (bcrypt with prefix)
        // ==========================================
        console.log('\n[Test 5] Password hashing');
        try {
            const hash = await platformAuthService.hashPassword('TestPass123!');
            assert('Hash has bcrypt prefix', hash.startsWith('$bcrypt$'), '$bcrypt$', hash.slice(0, 8));
            assert('Hash is 68 chars total', hash.length === 68, '68', `${hash.length}`);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
        }

        // ==========================================
        // TEST 6: Five-failure lockout
        // ==========================================
        console.log('\n[Test 6] Five-failure lockout');
        try {
            const lockoutPasswordHash = await platformAuthService.hashPassword('LockoutPass123!');
            const lockoutUser = await prisma.platform_users.create({
                data: {
                    email: `lockout-${ts}@test.fireflow`,
                    password_hash: lockoutPasswordHash,
                    name: 'Lockout Test',
                    role: 'SUPPORT_AGENT',
                    status: 'ACTIVE',
                },
            });

            for (let i = 0; i < 5; i++) {
                await login(lockoutUser.email, 'wrongpassword');
            }

            const updated = await prisma.platform_users.findUnique({
                where: { id: lockoutUser.id },
                select: { failed_login_count: true, locked_until: true },
            });

            assert('Account locked after 5 failures', !!updated?.locked_until, 'locked', updated?.locked_until ? 'locked' : 'not locked');
            assert('Failed count is 5', updated?.failed_login_count === 5, '5', `${updated?.failed_login_count}`);

            await prisma.platform_users.delete({ where: { id: lockoutUser.id } });
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
        }

        // ==========================================
        // TEST 7: Lockout enforcement
        // ==========================================
        console.log('\n[Test 7] Lockout enforcement');
        try {
            const lockedPasswordHash = await platformAuthService.hashPassword('LockedPass123!');
            const lockedUser = await prisma.platform_users.create({
                data: {
                    email: `locked-${ts}@test.fireflow`,
                    password_hash: lockedPasswordHash,
                    name: 'Locked Test',
                    role: 'SUPPORT_AGENT',
                    status: 'ACTIVE',
                    failed_login_count: 5,
                    locked_until: new Date(Date.now() + 30 * 60 * 1000),
                },
            });

            const { status } = await login(lockedUser.email, 'LockedPass123!');
            assert('Locked account returns 401', status === 401, '401', `${status}`);

            await prisma.platform_users.delete({ where: { id: lockedUser.id } });
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
        }

        // ==========================================
        // TEST 8: Lockout expiry
        // ==========================================
        console.log('\n[Test 8] Lockout expiry');
        try {
            const expiryPasswordHash = await platformAuthService.hashPassword('ExpiryPass123!');
            const expiryUser = await prisma.platform_users.create({
                data: {
                    email: `expiry-${ts}@test.fireflow`,
                    password_hash: expiryPasswordHash,
                    name: 'Expiry Test',
                    role: 'SUPPORT_AGENT',
                    status: 'ACTIVE',
                    failed_login_count: 5,
                    locked_until: new Date(Date.now() - 1000),
                },
            });

            const { status, body } = await login(expiryUser.email, 'ExpiryPass123!');
            assert('Expired lockout allows login', status === 200, '200', `${status}`);
            assert('Login returns tokens', !!body.tokens?.access_token, 'present', body.tokens?.access_token ? 'present' : 'missing');

            await prisma.platform_users.delete({ where: { id: expiryUser.id } });
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
        }

        // ==========================================
        // TEST 9: Successful login resets counter
        // ==========================================
        console.log('\n[Test 9] Successful login resets counter');
        try {
            const counterPasswordHash = await platformAuthService.hashPassword('CounterPass123!');
            const counterUser = await prisma.platform_users.create({
                data: {
                    email: `counter-${ts}@test.fireflow`,
                    password_hash: counterPasswordHash,
                    name: 'Counter Test',
                    role: 'SUPPORT_AGENT',
                    status: 'ACTIVE',
                    failed_login_count: 3,
                },
            });

            await login(counterUser.email, 'CounterPass123!');
            const updated = await prisma.platform_users.findUnique({
                where: { id: counterUser.id },
                select: { failed_login_count: true, locked_until: true },
            });

            assert('Failed count reset to 0', updated?.failed_login_count === 0, '0', `${updated?.failed_login_count}`);
            assert('Lockout cleared', updated?.locked_until === null, 'null', updated?.locked_until ? 'set' : 'null');

            await prisma.platform_users.delete({ where: { id: counterUser.id } });
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
        }

        // ==========================================
        // TEST 10: Password change
        // ==========================================
        console.log('\n[Test 10] Password change');
        try {
            const changePasswordHash = await platformAuthService.hashPassword('ChangePass123!');
            const changeUser = await prisma.platform_users.create({
                data: {
                    email: `change-${ts}@test.fireflow`,
                    password_hash: changePasswordHash,
                    name: 'Change Test',
                    role: 'SUPPORT_AGENT',
                    status: 'ACTIVE',
                },
            });

            const { body: loginBody10 } = await login(changeUser.email, 'ChangePass123!');
            const token10 = loginBody10.tokens?.access_token;

            const changeResult = await callApi('POST', '/api/platform/auth/change-password', {
                current_password: 'ChangePass123!',
                new_password: 'NewChangePass123!',
            }, token10);

            assert('Password change succeeds', changeResult.status === 200, '200', `${changeResult.status}`);

            const newLogin = await login(changeUser.email, 'NewChangePass123!');
            assert('New password works', newLogin.status === 200, '200', `${newLogin.status}`);

            const oldLogin = await login(changeUser.email, 'ChangePass123!');
            assert('Old password rejected', oldLogin.status === 401, '401', `${oldLogin.status}`);

            await prisma.platform_users.delete({ where: { id: changeUser.id } });
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
        }

        // ==========================================
        // TEST 11: Password reuse prevention
        // ==========================================
        console.log('\n[Test 11] Password reuse prevention');
        try {
            const reusePasswordHash = await platformAuthService.hashPassword('ReusePass123!');
            const reuseUser = await prisma.platform_users.create({
                data: {
                    email: `reuse-${ts}@test.fireflow`,
                    password_hash: reusePasswordHash,
                    name: 'Reuse Test',
                    role: 'SUPPORT_AGENT',
                    status: 'ACTIVE',
                },
            });

            const { body: loginBody2 } = await login(reuseUser.email, 'ReusePass123!');
            const token2 = loginBody2.tokens?.access_token;

            const reuseResult = await callApi('POST', '/api/platform/auth/change-password', {
                current_password: 'ReusePass123!',
                new_password: 'ReusePass123!',
            }, token2);

            assert('Password reuse rejected', reuseResult.status === 400, '400', `${reuseResult.status}`);

            await prisma.platform_users.delete({ where: { id: reuseUser.id } });
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
        }

        // ==========================================
        // TEST 12: must_change_password enforcement
        // ==========================================
        console.log('\n[Test 12] must_change_password enforcement');
        try {
            const tempPasswordHash = await platformAuthService.hashPassword('TempPass123!');
            const tempUser = await prisma.platform_users.create({
                data: {
                    email: `temp-${ts}@test.fireflow`,
                    password_hash: tempPasswordHash,
                    name: 'Temp Test',
                    role: 'SUPPORT_AGENT',
                    status: 'ACTIVE',
                    must_change_password: true,
                },
            });

            const { status, body: tempLogin } = await login(tempUser.email, 'TempPass123!');
            assert('Login succeeds with must_change_password', status === 200, '200', `${status}`);
            assert('must_change_password is true in response', tempLogin.must_change_password === true, 'true', `${tempLogin.must_change_password}`);

            await prisma.platform_users.delete({ where: { id: tempUser.id } });
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
        }

        // ==========================================
        // TEST 13: Account creation role restrictions
        // ==========================================
        console.log('\n[Test 13] Account creation role restrictions');
        try {
            const { body: agentLogin } = await login(agent.email, 'AgentPass123!');
            const agentToken = agentLogin.tokens?.access_token;

            const createOwner = await callApi('POST', '/api/platform/auth/create-account', {
                email: `newowner-${ts}@test.fireflow`,
                password: 'NewOwnerPass123!',
                name: 'New Owner',
                role: 'PLATFORM_OWNER',
            }, agentToken);

            assert('Creating PLATFORM_OWNER as agent rejected', createOwner.status === 403, '403', `${createOwner.status}`);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
        }

        // ==========================================
        // TEST 14: Case-insensitive email uniqueness
        // ==========================================
        console.log('\n[Test 14] Case-insensitive email uniqueness');
        try {
            const ownerLogin2 = await login(owner.email, 'OwnerPass123!');
            assert('Owner login succeeds for duplicate test', ownerLogin2.status === 200, '200', `${ownerLogin2.status}`);
            const ownerToken2 = ownerLogin2.body.tokens?.access_token;

            const duplicate = await callApi('POST', '/api/platform/auth/create-account', {
                email: `Owner-${ts}@test.fireflow`,
                password: 'DuplicatePass123!',
                name: 'Duplicate',
                role: 'SUPPORT_AGENT',
            }, ownerToken2);

            assert('Duplicate email (different case) rejected', duplicate.status === 400, '400', `${duplicate.status}`);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
        }

        // ==========================================
        // TEST 15: Audit hygiene
        // ==========================================
        console.log('\n[Test 15] Audit hygiene');
        try {
            const auditLogs = await prisma.audit_logs.findMany({
                where: { entity_type: 'PLATFORM_USER' },
                orderBy: { created_at: 'desc' },
                take: 10,
            });

            let leaked = false;
            for (const log of auditLogs) {
                const details = JSON.stringify(log.details);
                if (details.includes('password') || details.includes('token') || details.includes('OwnerPass123!') || details.includes('NewOwnerPass123!')) {
                    leaked = true;
                    break;
                }
            }

            assert('No passwords in audit logs', !leaked, 'false', leaked ? 'leaked' : 'clean');
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
        }

        // ==========================================
        // TEST 16: Supabase/FireFlow identity separation
        // ==========================================
        console.log('\n[Test 16] Supabase/FireFlow identity separation');
        try {
            const fakeSupabaseToken = platformJwtService.generateAccessToken('fake-supabase-id', 'PLATFORM_OWNER', false, 15);
            const supabaseResult = await callApi('GET', '/api/platform/health', undefined, fakeSupabaseToken);
            assert('Supabase token without mapping rejected', supabaseResult.status === 401, '401', `${supabaseResult.status}`);
        } catch (e: any) {
            console.log('  FAIL: Exception:', e.message);
            failed++;
        }

    } finally {
        await cleanupFixtures(ts);
        await prisma.$disconnect();
    }

    console.log('\n=== PHASE 2: PLATFORM EMAIL/PASSWORD AUTHENTICATION REPORT ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: 0`);
    console.log(`Blocked: 0`);

    if (failed > 0) {
        console.log('\nPHASE 2: NOT COMPLETE — failures detected');
        process.exit(1);
    } else {
        console.log('\nPHASE 2: VERIFICATION PASSED');
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
