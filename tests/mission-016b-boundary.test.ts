// Mission 016B — Authentication & Realtime Tenant Boundary regression suite.
// Requires the API server running on :3001. Proves:
//  - tenant-scoped PIN login (missing/unknown/inactive/mismatched tenant)
//  - bcrypt-only auth after plaintext removal; null-hash never authenticates
//  - Socket.IO tenant isolation for authenticated A/B and guest sockets
//    across multiple event categories (orders, menu_categories, customers)
//  - authoritative logout revocation + preserved token-family reuse detection
//  - verify-pin tenant binding from auth context (body tenant is ignored)
import 'dotenv/config';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { io as SocketIO } from 'socket.io-client';

const prisma = new PrismaClient();
const BASE = 'http://localhost:3001';
let passed = 0, failed = 0;
function assert(name: string, cond: boolean, extra?: string) {
    if (cond) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}${extra ? ' :: ' + extra : ''}`); }
}
async function j(method: string, url: string, body?: any, token?: string, headers: Record<string, string> = {}) {
    const res = await fetch(BASE + url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
    });
    let data: any = null; try { data = await res.json(); } catch { }
    return { status: res.status, data };
}
let sessionIdHeader: Record<string, string> = {};
type Sockets = { sA?: any; sB?: any; sG?: any };

async function main() {
    // ---------- FIXTURES ----------
    const mk = (n: string) => prisma.restaurants.create({ data: { name: n, slug: `m016b-${n.toLowerCase()}-${Date.now()}`, subscription_status: 'active' } });
    const rA = await mk('M016B_A'), rB = await mk('M016B_B');
    const hash = (p: string) => bcrypt.hash(p, 10);
    const mgrA = await prisma.staff.create({ data: { restaurant_id: rA.id, name: 'MgrA', role: 'MANAGER', pin: '', hashed_pin: await hash('654321'), status: 'active' } });
    const cashA = await prisma.staff.create({ data: { restaurant_id: rA.id, name: 'CashA', role: 'CASHIER', pin: '', hashed_pin: await hash('111222'), status: 'active' } });
    const migrated = await prisma.staff.create({ data: { restaurant_id: rA.id, name: 'Migrated', role: 'CASHIER', pin: '', hashed_pin: await hash('555555'), status: 'active' } });
    const plaintextOnly = await prisma.staff.create({ data: { restaurant_id: rA.id, name: 'PlaintextOnly', role: 'CASHIER', pin: '777777', hashed_pin: null, status: 'active' } });
    const mgrB = await prisma.staff.create({ data: { restaurant_id: rB.id, name: 'MgrB', role: 'MANAGER', pin: '', hashed_pin: await hash('998877'), status: 'active' } });
    await prisma.order_type_defaults.create({ data: { restaurant_id: rA.id, order_type: 'TAKEAWAY' } });
    const csess = await prisma.cashier_sessions.create({ data: { restaurant_id: rA.id, opened_by: mgrA.id, opening_float: 0, status: 'OPEN' } });
    sessionIdHeader = { 'x-session-id': csess.id };

    const login = (pin: string, rid?: string, staffName?: string) =>
        j('POST', '/api/auth/login', { pin, ...(rid ? { restaurant_id: rid } : {}), ...(staffName ? { staff_name: staffName } : {}) });

    try {
        // ========== 1. TENANT-SCOPED PIN AUTH ==========
        const okA = await login('654321', rA.id, 'MgrA');
        assert('Tenant-scoped PIN login succeeds', okA.status === 200 && !!okA.data?.tokens?.access_token, JSON.stringify(okA.data).slice(0, 160));
        assert('JWT binds tenant A', okA.data?.staff?.restaurant_id === rA.id);
        const tokA: string = okA.data.tokens.access_token;

        // ========== 2/3. MISSING / UNKNOWN / MISMATCHED TENANT ==========
        const noTenant = await login('654321');
        assert('Missing tenant context -> 400 generic', noTenant.status === 400 && noTenant.data.error === 'Invalid credentials', JSON.stringify(noTenant.data));
        const unknownT = await login('654321', crypto.randomUUID());
        assert('Unknown tenant -> 401 generic', unknownT.status === 401 && unknownT.data.error === 'Invalid credentials', `${unknownT.status}`);
        const mismatch = await login('998877', rA.id); // B's PIN against A's tenant
        assert("Mismatched tenant (B's PIN @ A) -> 401", mismatch.status === 401 && mismatch.data.error === 'Invalid credentials', `${mismatch.status}`);

        // ========== 4. BCRYPT AFTER PLAINTEXT REMOVAL ==========
        const migLogin = await login('555555', rA.id, 'Migrated');
        assert('Migrated user (pin="") authenticates via hash', migLogin.status === 200, `${migLogin.status}`);
        const plainOnly = await login('777777', rA.id, 'PlaintextOnly');
        assert('Null-hash staff rejected despite plaintext match', plainOnly.status === 401, `${plainOnly.status}`);

        // ========== 5. LOGOUT REVOCATION + FAMILY PRESERVATION ==========
        const rt0: string = okA.data.tokens.refresh_token;
        const rot = await j('POST', '/api/auth/refresh', { refresh_token: rt0 });
        assert('Refresh rotates pre-logout', rot.status === 200 && !!rot.data.refresh_token, `${rot.status}`);
        const rt1: string = rot.data.refresh_token;
        const tokA2: string = rot.data.access_token;

        const lo = await j('POST', '/api/auth/logout', null, tokA2); // NO body — server must still revoke
        assert('Logout (no body) succeeds', [200, 204].includes(lo.status), `${lo.status}`);
        const deadAfterLogout = await j('POST', '/api/auth/refresh', { refresh_token: rt1 });
        assert('Refresh fails after logout (family revoked)', deadAfterLogout.status === 401, `${deadAfterLogout.status}`);
        const reuse = await j('POST', '/api/auth/refresh', { refresh_token: rt0 });
        assert('Reuse-detection behavior preserved (TOKEN_REUSE_DETECTED)', reuse.status === 401 && reuse.data.code === 'TOKEN_REUSE_DETECTED', JSON.stringify(reuse.data));

        // Fresh session for remaining checks
        const okA2 = await login('654321', rA.id, 'MgrA');
        const tokA3: string = okA2.data.tokens.access_token;
        const okCash = await login('111222', rA.id, 'CashA');
        const tokCash: string = okCash.data.tokens.access_token;
        void tokA;

        // ========== 6. VERIFY-PIN TENANT BINDING ==========
        const vpOk = await j('POST', '/api/auth/verify-pin', { pin: '654321', requiredRole: 'MANAGER' }, tokA3);
        assert('verify-pin manager override in-tenant OK', vpOk.status === 200 && vpOk.data?.staff?.role === 'MANAGER', JSON.stringify(vpOk.data));
        const vpRole = await j('POST', '/api/auth/verify-pin', { pin: '111222', requiredRole: 'MANAGER' }, tokCash);
        assert('Cashier fails requiredRole=MANAGER (403)', vpRole.status === 403, `${vpRole.status}`);
        const vpSpoof = await j('POST', '/api/auth/verify-pin', { pin: '111222', requiredRole: 'MANAGER', restaurant_id: rB.id }, tokCash);
        assert('Body tenant ignored by verify-pin (still 403)', vpSpoof.status === 403, `${vpSpoof.status}`);
        const vpCross = await j('POST', '/api/auth/verify-pin', { pin: '998877', requiredRole: 'MANAGER' }, tokCash);
        assert("B's PIN unusable inside A's context (401)", vpCross.status === 401, `${vpCross.status}`);

        // ========== 7. SOCKET.IO ISOLATION ACROSS CATEGORIES ==========
        const evA: any[] = [], evB: any[] = [], evG: any[] = [];
        const okB = await login('998877', rB.id, 'MgrB');
        const tokB: string = okB.data.tokens.access_token;
        const socks: Sockets = {};
        socks.sA = SocketIO(BASE, { auth: { token: tokA3 }, transports: ['websocket'], reconnection: false });
        socks.sB = SocketIO(BASE, { auth: { token: tokB }, transports: ['websocket'], reconnection: false });
        socks.sG = SocketIO(BASE, { transports: ['websocket'], reconnection: false }); // guest: no credentials
        socks.sA.on('db_change', e => evA.push(e));
        socks.sB.on('db_change', e => evB.push(e));
        socks.sG.on('db_change', e => evG.push(e));
        await Promise.all([
            new Promise(res => socks.sA.on('connect', res)),
            new Promise(res => socks.sB.on('connect', res)),
            new Promise(res => socks.sG.on('connect', res)),
        ]);
        socks.sA.emit('join', { room: `restaurant:${rA.id}` });
        socks.sB.emit('join', { room: `restaurant:${rB.id}` });
        socks.sB.emit('join', { room: `restaurant:${rA.id}` }); // unauthorized cross-join attempt
        socks.sG.emit('join', { room: `restaurant:${rA.id}` }); // guest attempting tenant room
        await new Promise(r => setTimeout(r, 500));

        // Category 1: orders
        const ord = await j('POST', '/api/orders', { restaurant_id: rA.id, type: 'TAKEAWAY', status: 'ACTIVE', total: 42 }, tokA3);
        assert('Order created in A', [200, 201].includes(ord.status), `got ${ord.status} ${JSON.stringify(ord.data).slice(0, 120)}`);
        await new Promise(r => setTimeout(r, 1800)); // allow outbox bridge + emit

        // Category 2: stations (auth-scoped write)
        const stn = await j('POST', '/api/stations', { name: 'M016B-St' }, tokA3, sessionIdHeader);
        assert('Station created in A', stn.status === 200 || stn.status === 201, `got ${stn.status} ${JSON.stringify(stn.data).slice(0, 100)}`);

        // Category 3: vendors (auth-scoped write)
        const ven = await j('POST', '/api/vendors', { name: 'M016B-Ven', category: 'PRODUCE' }, tokA3, sessionIdHeader);
        assert('Vendor created in A', ven.status === 200 || ven.status === 201, `got ${ven.status} ${JSON.stringify(ven.data).slice(0, 100)}`);

        await new Promise(r => setTimeout(r, 1500));

        assert('Tenant A socket received its own events (>=2 categories)', evA.length >= 2, `saw=${evA.length}`);
        assert('Tenant B socket received ZERO tenant-A events', evB.length === 0, `leak=${JSON.stringify(evB).slice(0, 300)}`);
        assert('Guest socket received ZERO tenant events', evG.length === 0, `leak=${JSON.stringify(evG).slice(0, 300)}`);
        const tablesSeen = new Set(evA.map(e => e.table));
        assert('Multi-category coverage on A (orders+stations+vendors)', ['orders', 'stations', 'vendors'].every(t => tablesSeen.has(t)), `seen=${[...tablesSeen].join(',')}`);

        socks.sA.disconnect(); socks.sB.disconnect(); socks.sG.disconnect();

    } finally {
        // ---------- CLEANUP (FK-safe) ----------
        try {
            const ids = [rA.id, rB.id];
            const orderIds = (await prisma.orders.findMany({ where: { restaurant_id: { in: ids } }, select: { id: true } })).map(o => o.id);
            await prisma.takeaway_orders.deleteMany({ where: { order_id: { in: orderIds } } });
            await prisma.dine_in_orders.deleteMany({ where: { order_id: { in: orderIds } } });
            await prisma.orders.deleteMany({ where: { restaurant_id: { in: ids } } });
            await prisma.menu_items.deleteMany({ where: { restaurant_id: { in: ids } } });
            await prisma.menu_categories.deleteMany({ where: { restaurant_id: { in: ids } } });
            await prisma.customers.deleteMany({ where: { restaurant_id: { in: ids } } });
            await prisma.stations.deleteMany({ where: { restaurant_id: { in: ids } } });
            await prisma.vendors.deleteMany({ where: { restaurant_id: { in: ids } } });
            await prisma.order_type_defaults.deleteMany({ where: { restaurant_id: { in: ids } } });
            await prisma.restaurants.deleteMany({ where: { id: { in: ids } } });
        } catch (e: any) {
            console.error('cleanup:', e.message);
        }
        await prisma.$disconnect();
        const { prisma: sharedPrisma } = await import('../src/shared/lib/prisma');
        await sharedPrisma.$disconnect();
    }

    console.log(`\n--- MISSION 016B BOUNDARY REGRESSION SUMMARY ---`);
    console.log(`Passed: ${passed}  Failed: ${failed}`);
    if (failed > 0) {
        console.log('MISSION 016B: NOT COMPLETE — failures detected');
        process.exit(1);
    }
    console.log('MISSION 016B: VERIFICATION PASSED');
    process.exit(0);
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
