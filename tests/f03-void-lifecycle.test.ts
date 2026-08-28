import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE = 'http://localhost:3001/api';

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, expected: string, actual: string) {
    if (condition) { console.log(`  PASS: ${name}`); passed++; }
    else { console.log(`  FAIL: ${name} — expected ${expected}, got ${actual}`); failed++; }
}

async function makeStaff(restaurantId: string, name: string, role: string, pin: string) {
    const hash = await import('bcrypt').then(bcrypt => bcrypt.hash(pin, 10));
    return prisma.staff.create({ data: { restaurant_id: restaurantId, name, role, hashed_pin: hash, pin: '' } });
}

async function login(restaurantId: string, pin: string) {
    const res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: restaurantId, pin })
    });
    const data: any = await res.json();
    return data.tokens?.access_token || data.access_token;
}

async function patchOrder(orderId: string, body: object, token: string) {
    return fetch(`${BASE}/orders/${orderId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
}

async function setup() {
    const ts = Date.now();
    const restaurant = await prisma.restaurants.create({
        data: { name: 'Void Test Restaurant', slug: `void-test-${ts}`, phone: '03001234567', address: 'Test', currency: 'PKR', timezone: 'Asia/Karachi', subscription_plan: 'BASIC', subscription_status: 'ACTIVE' }
    });
    const rid = restaurant.id;
    await prisma.order_type_defaults.create({
        data: { restaurant_id: rid, order_type: 'TAKEAWAY', tax_enabled: true, tax_rate: 10, tax_type: 'EXCLUSIVE', svc_enabled: false, svc_rate: 0, delivery_fee: 0, discount_max: 100 }
    });
    const manager = await makeStaff(rid, 'Void Manager', 'MANAGER', '111111');
    const token = await login(rid, '111111');
    return { rid, manager, token };
}

async function cleanup(restaurantId: string) {
    await prisma.$transaction([
        prisma.outbox.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.audit_logs.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.fire_batches.deleteMany({ where: { orders: { restaurant_id: restaurantId } } }),
        prisma.takeaway_orders.deleteMany({ where: { orders: { restaurant_id: restaurantId } } }),
        prisma.dine_in_orders.deleteMany({ where: { orders: { restaurant_id: restaurantId } } }),
        prisma.delivery_orders.deleteMany({ where: { orders: { restaurant_id: restaurantId } } }),
        prisma.reservation_orders.deleteMany({ where: { orders: { restaurant_id: restaurantId } } }),
        prisma.orders.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.menu_items.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.menu_categories.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.order_type_defaults.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.staff.deleteMany({ where: { restaurant_id: restaurantId } }),
        prisma.restaurants.delete({ where: { id: restaurantId } })
    ]);
}

async function runTests() {
    console.log('--- STARTING F-03 VOID LIFECYCLE REGRESSION ---');
    const { rid, manager, token } = await setup();

    try {
        // ==========================================
        // Test 1: Void writes voided_* fields
        // ==========================================
        console.log('\n[Test 1] Void writes voided_* fields');
        const order = await prisma.orders.create({
            data: { restaurant_id: rid, type: 'TAKEAWAY', status: 'ACTIVE', total: 100, payment_status: 'UNPAID' }
        });
        await prisma.fire_batches.create({ data: { order_id: order.id, version_number: 1, created_by_user_id: manager.id, metadata_json: { item_count: 1 } } as any });

        const rVoid = await patchOrder(order.id, { status: 'VOIDED', authorized_by: manager.id, void_reason: 'Customer changed mind', void_notes: 'Kitchen notified' }, token);
        assert('void returns 200', rVoid.status === 200, '200', `${rVoid.status}`);

        const after = await prisma.orders.findUnique({ where: { id: order.id } });
        assert('voided_at written', !!after?.voided_at, 'present', after?.voided_at ? 'present' : 'missing');
        assert('voided_by written', after?.voided_by === manager.id, manager.id, String(after?.voided_by || 'missing'));
        assert('void_reason written', after?.void_reason === 'Customer changed mind', 'Customer changed mind', String(after?.void_reason || 'missing'));
        assert('void_notes written', after?.void_notes === 'Kitchen notified', 'Kitchen notified', String(after?.void_notes || 'missing'));

        // ==========================================
        // Test 2: Void creates ORDER_VOIDED outbox event
        // ==========================================
        console.log('\n[Test 2] Void creates ORDER_VOIDED outbox event');
        const outboxCount = await prisma.outbox.count({ where: { restaurant_id: rid, aggregate_id: order.id, event_type: 'ORDER_VOIDED' } });
        assert('ORDER_VOIDED outbox event exists', outboxCount === 1, '1', `${outboxCount}`);

        const outboxRow = await prisma.outbox.findFirst({ where: { restaurant_id: rid, aggregate_id: order.id, event_type: 'ORDER_VOIDED' } });
        assert('outbox aggregate_type is orders', outboxRow?.aggregate_type === 'orders', 'orders', String(outboxRow?.aggregate_type || 'missing'));
        assert('outbox payload has order_id', outboxRow?.payload?.order_id === order.id, order.id, String(outboxRow?.payload?.order_id || 'missing'));

        // ==========================================
        // Test 3: Void clears fire_batches
        // ==========================================
        console.log('\n[Test 3] Void clears fire_batches');
        const fbCount = await prisma.fire_batches.count({ where: { order_id: order.id } });
        assert('fire_batches cleared after void', fbCount === 0, '0', `fire_batches rows present = ${fbCount}`);

        // ==========================================
        // Test 4: Cancel does NOT write voided_* fields or clear fire_batches
        // ==========================================
        console.log('\n[Test 4] Cancel does not write voided_* fields');
        const cancelOrder = await prisma.orders.create({
            data: { restaurant_id: rid, type: 'TAKEAWAY', status: 'ACTIVE', total: 50, payment_status: 'UNPAID' }
        });
        const rCancel = await patchOrder(cancelOrder.id, { status: 'CANCELLED' }, token);
        assert('cancel returns 200', rCancel.status === 200, '200', `${rCancel.status}`);

        const afterCancel = await prisma.orders.findUnique({ where: { id: cancelOrder.id } });
        assert('cancel does NOT set voided_at', afterCancel?.voided_at === null, 'null', String(afterCancel?.voided_at || 'not null'));
        assert('cancel does NOT set voided_by', afterCancel?.voided_by === null, 'null', String(afterCancel?.voided_by || 'not null'));
        assert('cancel does NOT set void_reason', afterCancel?.void_reason === null, 'null', String(afterCancel?.void_reason || 'not null'));

        const cancelOutbox = await prisma.outbox.count({ where: { restaurant_id: rid, aggregate_id: cancelOrder.id, event_type: 'ORDER_VOIDED' } });
        assert('cancel does NOT create ORDER_VOIDED outbox', cancelOutbox === 0, '0', `${cancelOutbox}`);

        // ==========================================
        // Test 5: Re-void of already-voided order is blocked
        // ==========================================
        console.log('\n[Test 5] Re-void of already-voided order blocked');
        const rReVoid = await patchOrder(order.id, { status: 'VOIDED', authorized_by: manager.id }, token);
        assert('re-void blocked (no fire batches)', rReVoid.status === 400 || rReVoid.status === 500, '4xx/5xx', `${rReVoid.status}`);

        const afterReVoid = await prisma.orders.findUnique({ where: { id: order.id } });
        assert('re-void does not change voided_at', afterReVoid?.voided_at?.toISOString() === after?.voided_at?.toISOString(), 'unchanged', afterReVoid?.voided_at?.toISOString() === after?.voided_at?.toISOString() ? 'unchanged' : 'changed');

    } finally {
        await cleanup(rid);
        await prisma.$disconnect();
    }

    console.log('\n=== F-03 VOID LIFECYCLE REPORT ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    if (failed > 0) {
        console.log('F-03: NOT COMPLETE — failures detected');
        process.exit(1);
    } else {
        console.log('F-03: VERIFICATION PASSED');
        process.exit(0);
    }
}

runTests().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
