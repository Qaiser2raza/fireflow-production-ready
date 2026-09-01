/**
 * M034-C Regression — RBAC + tenant isolation on PATCH /api/orders/:id/guest-count (TD-19)
 *
 * Security contract after M034-C hardening (server.ts:3161):
 *   1. No JWT            -> 401
 *   2. Insufficient role -> 403
 *   3. Cross-tenant order -> 404 (not found in the caller's tenant) + NO mutation
 *   4. Authorized same-tenant manager -> 200 + persisted update
 *   5. Spoofed x-staff-id header cannot change the effective actor (actor stays JWT-derived)
 *
 * Run after the API server is up on localhost:3001 against a disposable verify DB:
 *   $env:DATABASE_URL = '<postgres url for fireflow_verify>'
 *   npx tsx src/api/server.ts        # in one shell (NODE_ENV=test)
 *   npx tsx tests/m034c-guest-count-rbac.test.ts
 *
 * Cleanup is strictly scoped by restaurant_id (never deleteMany({})) so it is
 * safe to run; the DB must still be a disposable *_verify database (TD-14).
 */
import 'dotenv/config';
process.env.NODE_ENV = 'test';
import { PrismaClient } from '@prisma/client';
import { JwtService } from '../src/api/services/auth/JwtService';

const prisma = new PrismaClient();
const jwtService = new JwtService();
const BASE = 'http://localhost:3001';

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, expected: string, actual: string) {
    if (cond) {
        passed++;
        console.log(`  PASS: ${name}`);
    } else {
        failed++;
        console.log(`  FAIL: ${name} — expected ${expected}, got ${actual}`);
    }
}

interface Staff { id: string; name: string; role: string; token: string; }
interface Fixture {
    tenantA: string; tenantB: string;
    alice: Staff; bob: Staff; carol: Staff;
    orderA: { id: string }; orderB: { id: string };
}

let fixture: Fixture | null = null;

async function setup(): Promise<Fixture> {
    const ts = Date.now();
    const tenantA = await prisma.restaurants.create({ data: { name: `M034C-A-${ts}`, phone: '1', address: 'a' } });
    const tenantB = await prisma.restaurants.create({ data: { name: `M034C-B-${ts}`, phone: '2', address: 'b' } });

    const tableA = await prisma.tables.create({ data: { restaurant_id: tenantA.id, name: 'T-A-1', capacity: 4 } });
    const tableB = await prisma.tables.create({ data: { restaurant_id: tenantB.id, name: 'T-B-1', capacity: 4 } });

    const [alice, bob, carol] = await Promise.all([
        prisma.staff.create({ data: { restaurant_id: tenantA.id, name: 'Alice', role: 'MANAGER', pin: '000000' } }),
        prisma.staff.create({ data: { restaurant_id: tenantA.id, name: 'Bob', role: 'MANAGER', pin: '000000' } }),
        prisma.staff.create({ data: { restaurant_id: tenantA.id, name: 'Carol', role: 'CASHIER', pin: '000000' } }),
    ]);

    const orderA = await prisma.orders.create({ data: { restaurant_id: tenantA.id, type: 'DINE_IN', status: 'ACTIVE', payment_status: 'UNPAID', guest_count: 2, table_id: tableA.id } });
    await prisma.dine_in_orders.create({ data: { order_id: orderA.id, table_id: tableA.id, guest_count: 2, waiter_id: alice.id } });
    const orderB = await prisma.orders.create({ data: { restaurant_id: tenantB.id, type: 'DINE_IN', status: 'ACTIVE', payment_status: 'UNPAID', guest_count: 2, table_id: tableB.id } });
    await prisma.dine_in_orders.create({ data: { order_id: orderB.id, table_id: tableB.id, guest_count: 2, waiter_id: bob.id } });

    return {
        tenantA: tenantA.id, tenantB: tenantB.id,
        alice: { id: alice.id, name: alice.name, role: alice.role, token: jwtService.generateAccessToken(alice.id, tenantA.id, 'MANAGER', 'Alice') },
        bob: { id: bob.id, name: bob.name, role: bob.role, token: jwtService.generateAccessToken(bob.id, tenantA.id, 'MANAGER', 'Bob') },
        carol: { id: carol.id, name: carol.name, role: carol.role, token: jwtService.generateAccessToken(carol.id, tenantA.id, 'CASHIER', 'Carol') },
        orderA: { id: orderA.id }, orderB: { id: orderB.id },
    };
}

async function cleanup(f: Fixture) {
    await prisma.$transaction([
        prisma.dine_in_orders.deleteMany({ where: { order_id: { in: [f.orderA.id, f.orderB.id] } } }),
        prisma.orders.deleteMany({ where: { restaurant_id: { in: [f.tenantA, f.tenantB] } } }),
        prisma.tables.deleteMany({ where: { restaurant_id: { in: [f.tenantA, f.tenantB] } } }),
        prisma.staff.deleteMany({ where: { restaurant_id: { in: [f.tenantA, f.tenantB] } } }),
        prisma.restaurants.deleteMany({ where: { id: { in: [f.tenantA, f.tenantB] } } }),
    ]);
}

async function run() {
    fixture = await setup();
    const f = fixture;

    // --- TEST 1: No JWT -> 401 ---
    try {
        const res = await fetch(`${BASE}/api/orders/${f.orderA.id}/guest-count`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guest_count: 3 }),
        });
        assert('T1 no JWT -> 401', res.status === 401, '401', `${res.status}`);
    } catch (e: any) { assert('T1 no JWT -> 401 (no exception)', false, '200-range', `EXCEPTION: ${e.message}`); failed++; }

    // --- TEST 2: Insufficient role (CASHIER) -> 403 ---
    try {
        const res = await fetch(`${BASE}/api/orders/${f.orderA.id}/guest-count`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${f.carol.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ guest_count: 3 }),
        });
        assert('T2 CASHIER -> 403', res.status === 403, '403', `${res.status}`);
    } catch (e: any) { assert('T2 no exception', false, '403', `EXCEPTION: ${e.message}`); failed++; }

    // --- TEST 3: Cross-tenant (tenant-A manager on tenant-B order) -> 404 + no mutation ---
    try {
        const before = await prisma.orders.findUnique({ where: { id: f.orderB.id }, select: { guest_count: true } });
        const res = await fetch(`${BASE}/api/orders/${f.orderB.id}/guest-count`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${f.alice.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ guest_count: 9 }),
        });
        const after = await prisma.orders.findUnique({ where: { id: f.orderB.id }, select: { guest_count: true } });
        assert('T3 cross-tenant -> 404', res.status === 404, '404', `${res.status}`);
        assert('T3 cross-tenant order unmodified', before!.guest_count === after!.guest_count, `${before!.guest_count}`, `${after!.guest_count}`);
    } catch (e: any) { assert('T3 no exception', false, '404', `EXCEPTION: ${e.message}`); failed++; }

    // --- TEST 4: Authorized same-tenant manager -> 200 + persisted update ---
    try {
        const res = await fetch(`${BASE}/api/orders/${f.orderA.id}/guest-count`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${f.alice.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ guest_count: 3 }),
        });
        const body = await res.json();
        assert('T4 authorized -> 200', res.status === 200, '200', `${res.status}`);
        assert('T4 guest_count updated to 3 (response)', body.order?.guest_count === 3, '3', `${body.order?.guest_count}`);
        const now = await prisma.orders.findUnique({ where: { id: f.orderA.id }, select: { guest_count: true } });
        assert('T4 persisted on DB', now!.guest_count === 3, '3', `${now!.guest_count}`);
    } catch (e: any) { assert('T4 no exception', false, '200', `EXCEPTION: ${e.message}`); failed++; }

    // --- TEST 5: Spoofed x-staff-id cannot change the effective actor ---
    try {
        const res = await fetch(`${BASE}/api/orders/${f.orderA.id}/guest-count`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${f.alice.token}`, 'Content-Type': 'application/json', 'x-staff-id': f.bob.id },
            body: JSON.stringify({ guest_count: 4 }),
        });
        const body = await res.json();
        assert('T5 with spoofed x-staff-id -> 200 (header ignored)', res.status === 200, '200', `${res.status}`);
        assert('T5 actor is alice (JWT-derived), not bob', body.order?.last_action_by === f.alice.id, f.alice.id, `${body.order?.last_action_by}`);
    } catch (e: any) { assert('T5 no exception', false, '200', `EXCEPTION: ${e.message}`); failed++; }
}

run()
    .then(async () => {
        if (fixture) await cleanup(fixture).catch((e) => console.error('[M034-C] cleanup error:', e.message));
        console.log(`\nM034-C: ${passed} passed, ${failed} failed`);
        await prisma.$disconnect();
        process.exit(failed === 0 ? 0 : 1);
    })
    .catch(async (e) => {
        console.error('M034-C fatal:', e);
        if (fixture) await cleanup(fixture).catch(() => {});
        await prisma.$disconnect();
        process.exit(1);
    });
