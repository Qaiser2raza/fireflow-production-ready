/**
 * Task 04b — skip-approval authorization.
 *
 * Proves the three confirmed SKIPPED paths are closed:
 *   A. POST /api/orders/skip-approval  (own-PIN, tenant-scoped, no self-approval)
 *   B. PATCH /api/orders/:orderId/items/:itemId/status (cannot bypass approval)
 *   C. PATCH /api/orders/:id + POST /api/orders upsert (cannot silently SKIPPED)
 *
 * The route is exercised over real HTTP against the mounted router (no auth
 * middleware: staffId / role / restaurantId are injected exactly as the verified
 * token would provide them). Services are called directly for the paths that live
 * behind the generic order routes.
 *
 * Run: npm run test:safe -- tests/order-skip-approval.test.ts
 */
import './_test-db-guard';
import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import orderWorkflowRoutes from '../src/api/routes/orderWorkflowRoutes';
import { orderWorkflowService } from '../src/api/services/OrderWorkflowService';
import { OrderServiceFactory } from '../src/api/services/orders/OrderServiceFactory';
import { ACTIVE } from './helpers/tenantFixtures';

const prisma = new PrismaClient();

const unique = () => crypto.randomBytes(6).toString('hex');
const PIN = {
  manager: '111111',
  admin: '222222',
  super: '333333',
  cashier: '444444',
  waiter: '555555',
};

let passed = 0;
let failed = 0;
function assert(name: string, cond: boolean, extra?: string) {
    if (cond) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}${extra ? ' :: ' + extra : ''}`); }
}

const trash = {
    restaurants: [] as string[],
    categories: [] as string[],
    menuItems: [] as string[],
    staff: [] as string[],
    orders: [] as string[],
    orderItems: [] as string[],
    sessions: [] as string[],
};

async function teardown() {
    for (const id of trash.orderItems) await prisma.order_items.deleteMany({ where: { id } }).catch(() => { });
    for (const id of trash.orders) await prisma.orders.deleteMany({ where: { id } }).catch(() => { });
    await prisma.approval_logs.deleteMany({ where: { restaurant_id: { in: [...trash.restaurants] } } }).catch(() => { });
    await prisma.audit_logs.deleteMany({ where: { restaurant_id: { in: [...trash.restaurants] } } }).catch(() => { });
    for (const id of trash.sessions) await prisma.cashier_sessions.deleteMany({ where: { id } }).catch(() => { });
    for (const id of trash.staff) await prisma.staff.deleteMany({ where: { id } }).catch(() => { });
    for (const id of trash.menuItems) await prisma.menu_items.deleteMany({ where: { id } }).catch(() => { });
    for (const id of trash.categories) await prisma.menu_categories.deleteMany({ where: { id } }).catch(() => { });
    for (const id of trash.restaurants) await prisma.restaurants.deleteMany({ where: { id } }).catch(() => { });
}

async function makeRestaurant() {
    const restaurant = await prisma.restaurants.create({
        data: { name: `Skip Tenant ${unique()}`, slug: `skip-tenant-${unique()}`, is_active: true, onboarding_status: 'ACTIVE', subscription_status: ACTIVE },
    });
    trash.restaurants.push(restaurant.id);
    return restaurant;
}

async function makeStaff(restaurantId: string, name: string, role: string, pin: string) {
    const staff = await prisma.staff.create({
        data: { restaurant_id: restaurantId, name, role, pin: '', hashed_pin: await bcrypt.hash(pin, 10), status: 'active', email: null },
    });
    trash.staff.push(staff.id);
    return { ...staff, plainPin: pin };
}

async function makeMenuItem(restaurantId: string) {
    const category = await prisma.menu_categories.create({
        data: { restaurant_id: restaurantId, name: `Skip Category ${unique()}`, priority: 0 },
    });
    trash.categories.push(category.id);
    const item = await prisma.menu_items.create({
        data: { restaurant_id: restaurantId, category_id: category.id, category: 'Snacks', name: `Skip Item ${unique()}`, price: 500, is_available: true },
    });
    trash.menuItems.push(item.id);
    return item;
}

async function makeOrderWithItem(restaurantId: string, menuItemId: string, status: any, updatedBy?: string) {
    const order = await prisma.orders.create({
        data: {
            restaurant_id: restaurantId,
            type: 'DINE_IN',
            status: 'ACTIVE',
            total: 500,
            dine_in_orders: { create: { guest_count: 2, seated_at: new Date(), tables: { create: { restaurant_id: restaurantId, name: `Table ${unique()}`, status: 'OCCUPIED' } } } },
        },
    });
    trash.orders.push(order.id);
    const item = await prisma.order_items.create({
        data: {
            order_id: order.id,
            menu_item_id: menuItemId,
            quantity: 1,
            unit_price: 500,
            total_price: 500,
            item_status: status,
            status_updated_by: updatedBy ?? null,
            status_updated_at: new Date(),
        },
    });
    trash.orderItems.push(item.id);
    return { order, item };
}

async function makeCashierSession(restaurantId: string, openedBy: string) {
    const session = await prisma.cashier_sessions.create({
        data: { restaurant_id: restaurantId, opened_by: openedBy, opening_float: 0, status: 'OPEN' },
    });
    trash.sessions.push(session.id);
    return session;
}

async function makeOrderTypeDefaults(restaurantId: string) {
    return prisma.order_type_defaults.upsert({
        where: { restaurant_id_order_type: { restaurant_id: restaurantId, order_type: 'DINE_IN' } },
        create: { restaurant_id: restaurantId, order_type: 'DINE_IN' },
        update: {},
    });
}

let defaultSessionId = '';

type Http = { status: number; body: any };

/** Mounts the real router and injects the identity the verified token provides. */
async function startServer() {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        const identity = req.header('x-test-identity');
        if (identity) {
            const parsed = JSON.parse(identity);
            req.staffId = parsed.staffId;
            req.role = parsed.role;
            req.restaurantId = parsed.restaurantId;
        }
        next();
    });
    app.use(orderWorkflowRoutes);
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const address = server.address() as any;
    return {
        approve: async (body: any, identity: any, sessionId: string | null = defaultSessionId): Promise<Http> => {
            const res = await fetch(`http://127.0.0.1:${address.port}/skip-approval`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-test-identity': JSON.stringify(identity),
                    ...(sessionId ? { 'x-session-id': sessionId } : {}),
                },
                body: JSON.stringify(body),
            });
            return { status: res.status, body: await res.json().catch(() => ({})) };
        },
        close: () => new Promise((resolve) => server.close(resolve)),
    };
}

async function main() {
    console.log('Task 04b — skip approval authorization');

    try {
        const tenantA = await makeRestaurant();
        const tenantB = await makeRestaurant();
        await makeOrderTypeDefaults(tenantA.id);
        const menuA = await makeMenuItem(tenantA.id);
        const menuB = await makeMenuItem(tenantB.id);

        const manager = await makeStaff(tenantA.id, 'Skip Manager', 'MANAGER', PIN.manager);
        const admin = await makeStaff(tenantA.id, 'Skip Admin', 'ADMIN', PIN.admin);
        const superAdmin = await makeStaff(tenantA.id, 'Skip Super', 'SUPER_ADMIN', PIN.super);
        const cashier = await makeStaff(tenantA.id, 'Skip Cashier', 'CASHIER', PIN.cashier);
        const waiter = await makeStaff(tenantA.id, 'Skip Waiter', 'WAITER', PIN.waiter);

        const sessionA = await makeCashierSession(tenantA.id, manager.id);
        defaultSessionId = sessionA.id;
        const foreignSession = await makeCashierSession(tenantB.id, (await makeStaff(tenantB.id, 'Other Tenant Staff', 'MANAGER', PIN.manager)).id);

        const http = await startServer();
        const identity = (staffId: string, role: string, restaurantId = tenantA.id) => ({ staffId, role, restaurantId });

        // ---------------- 1. CASHIER cannot approve ----------------
        const cashierTarget = await makeOrderWithItem(tenantA.id, menuA.id, 'SERVED', waiter.id);
        let r = await http.approve(
            { orderItemId: cashierTarget.item.id, approvalAction: 'APPROVE_SKIP', managerPin: PIN.cashier, reason: 'self' },
            identity(cashier.id, 'CASHIER')
        );
        assert('CASHIER is refused with 403', r.status === 403 && r.body.code === 'INSUFFICIENT_PERMISSION', `${r.status} ${r.body?.code}`);
        assert('CASHIER attempt did not mutate the item',
            (await prisma.order_items.findUnique({ where: { id: cashierTarget.item.id } }))?.item_status === 'SERVED');

        // ---------------- 2. MANAGER / ADMIN / SUPER_ADMIN with OWN PIN ----------------
        for (const approver of [
            { staff: manager, role: 'MANAGER' },
            { staff: admin, role: 'ADMIN' },
            { staff: superAdmin, role: 'SUPER_ADMIN' },
        ]) {
            const target = await makeOrderWithItem(tenantA.id, menuA.id, 'SERVED', waiter.id);
            const ok = await http.approve(
                { orderItemId: target.item.id, approvalAction: 'APPROVE_SKIP', managerPin: approver.staff.plainPin, reason: 'guest left' },
                identity(approver.staff.id, approver.role)
            );
            assert(`${approver.role} with own PIN approves another user's item`, ok.status === 200 && ok.body.success === true, `${ok.status} ${JSON.stringify(ok.body)}`);
            assert(`${approver.role} item is SKIPPED`,
                (await prisma.order_items.findUnique({ where: { id: target.item.id } }))?.item_status === 'SKIPPED');

            const approval = await prisma.approval_logs.findFirst({ where: { target_entity_id: target.item.id } });
            assert(`${approver.role} approval log records approver + requester`,
                approval?.approved_by_user_id === approver.staff.id && approval?.requested_by_user_id === waiter.id && approval?.action_type === 'APPROVE_SKIP',
                JSON.stringify(approval));
            const audit = await prisma.audit_logs.findFirst({
                where: { entity_id: target.item.id, action_type: 'MANAGER_APPROVE_SKIP' },
            });
            assert(`${approver.role} audit log records the state change`,
                audit?.from_state === 'SERVED' && audit?.to_state === 'SKIPPED', JSON.stringify(audit));
        }

        // ---------------- 3. wrong / blank PIN ----------------
        const wrongPinTarget = await makeOrderWithItem(tenantA.id, menuA.id, 'SERVED', waiter.id);
        r = await http.approve(
            { orderItemId: wrongPinTarget.item.id, approvalAction: 'APPROVE_SKIP', managerPin: '999999', reason: 'x' },
            identity(manager.id, 'MANAGER')
        );
        assert('wrong PIN is refused with 401', r.status === 401 && r.body.code === 'INVALID_APPROVAL_PIN', `${r.status} ${r.body?.code}`);
        assert('wrong PIN did not mutate the item',
            (await prisma.order_items.findUnique({ where: { id: wrongPinTarget.item.id } }))?.item_status === 'SERVED');

        const blankPinTarget = await makeOrderWithItem(tenantA.id, menuA.id, 'SERVED', waiter.id);
        r = await http.approve(
            { orderItemId: blankPinTarget.item.id, approvalAction: 'APPROVE_SKIP', reason: 'x' },
            identity(manager.id, 'MANAGER')
        );
        assert('missing PIN is refused with 401', r.status === 401 && r.body.code === 'APPROVAL_PIN_REQUIRED', `${r.status} ${r.body?.code}`);

        const pinAudit = await prisma.audit_logs.count({ where: { restaurant_id: tenantA.id, action_type: 'APPROVAL_PIN_FAILED' } });
        assert('failed approval PINs are audited', pinAudit >= 2, String(pinAudit));
        assert('a wrong PIN feeds the staff lockout counter',
            (await prisma.staff.findUnique({ where: { id: manager.id }, select: { failed_login_count: true } }))?.failed_login_count === 1);

        // another manager's PIN must not work for this actor
        const otherPinTarget = await makeOrderWithItem(tenantA.id, menuA.id, 'SERVED', waiter.id);
        r = await http.approve(
            { orderItemId: otherPinTarget.item.id, approvalAction: 'APPROVE_SKIP', managerPin: PIN.admin, reason: 'x' },
            identity(manager.id, 'MANAGER')
        );
        assert("another manager's PIN is refused", r.status === 401 && r.body.code === 'INVALID_APPROVAL_PIN', `${r.status} ${r.body?.code}`);
        await prisma.staff.update({ where: { id: manager.id }, data: { failed_login_count: 0, locked_until: null } });

        // ---------------- 4. no self-approval ----------------
        const selfTarget = await makeOrderWithItem(tenantA.id, menuA.id, 'SERVED', manager.id);
        r = await http.approve(
            { orderItemId: selfTarget.item.id, approvalAction: 'APPROVE_SKIP', managerPin: PIN.manager, reason: 'mine' },
            identity(manager.id, 'MANAGER')
        );
        assert('manager cannot approve an item they last updated', r.status === 403 && r.body.code === 'SELF_APPROVAL_FORBIDDEN', `${r.status} ${r.body?.code}`);
        assert('self-approval attempt did not mutate the item',
            (await prisma.order_items.findUnique({ where: { id: selfTarget.item.id } }))?.item_status === 'SERVED');
        const selfDenials = await prisma.audit_logs.findMany({
            where: { entity_id: selfTarget.item.id, action_type: 'SKIP_APPROVAL_DENIED' },
        });
        assert('denied self-approval is audited',
            selfDenials.length === 1 && (selfDenials[0].details as any)?.reason === 'self_approval', JSON.stringify(selfDenials));

        // ---------------- 5. cross-tenant target ----------------
        const foreignTarget = await makeOrderWithItem(tenantB.id, menuB.id, 'SERVED', null);
        r = await http.approve(
            { orderItemId: foreignTarget.item.id, approvalAction: 'APPROVE_SKIP', managerPin: PIN.manager, reason: 'x' },
            identity(manager.id, 'MANAGER', tenantA.id)
        );
        assert('cross-tenant item is rejected with 403', r.status === 403 && r.body.code === 'CROSS_TENANT_APPROVAL', `${r.status} ${r.body?.code}`);
        assert('cross-tenant item is NOT mutated',
            (await prisma.order_items.findUnique({ where: { id: foreignTarget.item.id } }))?.item_status === 'SERVED');
        assert('no approval log was written for the foreign item',
            (await prisma.approval_logs.count({ where: { target_entity_id: foreignTarget.item.id } })) === 0);
        const crossDenials = await prisma.audit_logs.findMany({
            where: {
                entity_id: foreignTarget.item.id,
                action_type: 'SKIP_APPROVAL_DENIED',
                staff_id: manager.id,          // recorded against the ACTOR, not anyone
                restaurant_id: tenantA.id,     // recorded against the ACTOR's tenant, never the victim's
            },
        });
        assert('the cross-tenant denial survives the rollback and is audited',
            crossDenials.length === 1 && (crossDenials[0].details as any)?.reason === 'cross_tenant_target', JSON.stringify(crossDenials));
        // The foreign tenant's own log space must not have been written to: the denial
        // belongs to the approver's tenant, not the one that owns the target item.
        const victimTenantWrites = await prisma.audit_logs.count({
            where: { restaurant_id: tenantB.id, entity_id: foreignTarget.item.id, action_type: 'SKIP_APPROVAL_DENIED' },
        });
        assert("the denial was not written into the victim tenant's audit space", victimTenantWrites === 0, String(victimTenantWrites));

        // ---------------- 5b. the session reference must be real and same-tenant ----------
        // `approval_logs.approved_by_session_id` is a foreign key to cashier_sessions,
        // so an unverified client header used to surface as a 500.
        const unknownSessionTarget = await makeOrderWithItem(tenantA.id, menuA.id, 'SERVED', waiter.id);
        r = await http.approve(
            { orderItemId: unknownSessionTarget.item.id, approvalAction: 'APPROVE_SKIP', managerPin: PIN.manager, reason: 'x' },
            identity(manager.id, 'MANAGER'),
            '99999999-9999-4999-8999-999999999999'
        );
        assert('an unknown session reference is refused with 400 (not a 500)',
            r.status === 400 && r.body.code === 'INVALID_SESSION_REFERENCE', `${r.status} ${r.body?.code}`);
        assert('an unknown session reference did not mutate the item',
            (await prisma.order_items.findUnique({ where: { id: unknownSessionTarget.item.id } }))?.item_status === 'SERVED');

        const foreignSessionTarget = await makeOrderWithItem(tenantA.id, menuA.id, 'SERVED', waiter.id);
        r = await http.approve(
            { orderItemId: foreignSessionTarget.item.id, approvalAction: 'APPROVE_SKIP', managerPin: PIN.manager, reason: 'x' },
            identity(manager.id, 'MANAGER'),
            foreignSession.id
        );
        assert("another tenant's session reference is refused with 400",
            r.status === 400 && r.body.code === 'INVALID_SESSION_REFERENCE', `${r.status} ${r.body?.code}`);
        assert("another tenant's session reference did not mutate the item",
            (await prisma.order_items.findUnique({ where: { id: foreignSessionTarget.item.id } }))?.item_status === 'SERVED');
        assert('no approval log carries a foreign session',
            (await prisma.approval_logs.count({ where: { target_entity_id: foreignSessionTarget.item.id } })) === 0);

        // the accepted approval above did record the caller's own session
        const sessionRecorded = await prisma.approval_logs.findFirst({
            where: { approved_by_session_id: sessionA.id },
            select: { approved_by_session_id: true },
        });
        assert('an approved skip records the verified same-tenant session', sessionRecorded?.approved_by_session_id === sessionA.id);

        // ---------------- 6. status PATCH cannot bypass approval ----------------
        for (const from of ['DRAFT', 'PENDING', 'PREPARING', 'DONE', 'SERVED'] as any[]) {
            const target = await makeOrderWithItem(tenantA.id, menuA.id, from, waiter.id);
            const out = await orderWorkflowService.updateOrderItemStatus(
                target.order.id, target.item.id, 'SKIPPED', tenantA.id, cashier.id, 'sess', 'CASHIER', 'COMP'
            );
            assert(`${from} -> SKIPPED via the status endpoint reports approval_required`, out.approval_required === true, JSON.stringify(out));
            assert(`${from} -> SKIPPED left the item untouched`,
                (await prisma.order_items.findUnique({ where: { id: target.item.id } }))?.item_status === from);
        }

        // ---------------- 7/8. order update + upsert cannot silently SKIPPED ----------------
        const service = OrderServiceFactory.getService('DINE_IN');
        for (const from of ['DONE', 'SERVED'] as any[]) {
            const target = await makeOrderWithItem(tenantA.id, menuA.id, from, waiter.id);
            let thrown: any = null;
            try {
                // Exactly what PATCH /api/orders/:id calls (server.ts:2198) and what
                // POST /api/orders calls for an upsert (server.ts:2123-2124).
                await service.updateOrder(tenantA.id, target.order.id, {
                    items: [{ id: target.item.id, menu_item_id: menuA.id, quantity: 0, unit_price: 500, item_status: from }],
                } as any);
            } catch (err: any) {
                thrown = err;
            }
            assert(`zeroing a ${from} item through the order update is refused`,
                thrown?.code === 'SKIP_APPROVAL_REQUIRED' && thrown?.statusCode === 403, JSON.stringify(thrown));
            assert(`the ${from} item survived the refused update`,
                (await prisma.order_items.findUnique({ where: { id: target.item.id } }))?.item_status === from);
        }

        const serverSource = fs.readFileSync(path.join(process.cwd(), 'src/api/server.ts'), 'utf-8');
        assert('POST /api/orders delegates an upsert to the same guarded service method',
            serverSource.includes('service.updateOrder(req.restaurantId!, data.id, data)'));

        // ---------------- 8b. closure pass: no other route into SKIPPED ----------------

        // (a) caller-supplied item_status: 'SKIPPED' on a claimed line.
        //     The stored weight of SKIPPED (7) beats every other weight, so the status
        //     guard used to persist it verbatim — a cashier could name the status.
        const suppliedStatus = await makeOrderWithItem(tenantA.id, menuA.id, 'PENDING', waiter.id);
        let thrown: any = null;
        try {
            await service.updateOrder(tenantA.id, suppliedStatus.order.id, {
                // `authorized_by` is the DTO's documented actor field; it is what the
                // existing ORDER_CANCELLED/ORDER_VOIDED audits in this method use.
                authorized_by: waiter.id,
                items: [{ id: suppliedStatus.item.id, menu_item_id: menuA.id, quantity: 2, unit_price: 500, item_status: 'SKIPPED' }],
            } as any);
        } catch (err: any) { thrown = err; }
        assert('a caller-supplied SKIPPED status is refused',
            thrown?.code === 'SKIP_APPROVAL_REQUIRED' && thrown?.statusCode === 403, JSON.stringify(thrown));
        const suppliedAfter = await prisma.order_items.findUnique({ where: { id: suppliedStatus.item.id } });
        assert('the caller-supplied SKIPPED did not mutate the item',
            suppliedAfter?.item_status === 'PENDING' && Number(suppliedAfter?.quantity) === 1, JSON.stringify(suppliedAfter));
        const suppliedDenial = await prisma.audit_logs.findFirst({
            where: { entity_id: suppliedStatus.item.id, action_type: 'SKIP_APPROVAL_DENIED', staff_id: waiter.id },
        });
        assert('the refused caller-supplied SKIPPED is audited against the actor',
            (suppliedDenial?.details as any)?.reason === 'caller_supplied_skipped_status'
            && (suppliedDenial?.details as any)?.source === 'order_update'
            && (suppliedDenial?.details as any)?.actor_id === waiter.id, JSON.stringify(suppliedDenial));

        // (b) a served line simply OMITTED from the payload, which used to be zeroed to
        //     SKIPPED with only an ITEM_QUANTITY_REDUCED audit.
        for (const from of ['DONE', 'SERVED'] as any[]) {
            const omitted = await makeOrderWithItem(tenantA.id, menuA.id, from, waiter.id);
            thrown = null;
            try {
                // The payload claims a DIFFERENT line and simply leaves the served one out.
                await service.updateOrder(tenantA.id, omitted.order.id, {
                    items: [{ id: menuA.id, menu_item_id: menuA.id, quantity: 1, unit_price: 500, item_status: 'PENDING' }],
                } as any);
            } catch (err: any) { thrown = err; }
            assert(`omitting a ${from} item through the order update is refused`,
                thrown?.code === 'SKIP_APPROVAL_REQUIRED' && thrown?.statusCode === 403, JSON.stringify(thrown));
            const omittedAfter = await prisma.order_items.findUnique({ where: { id: omitted.item.id } });
            assert(`the omitted ${from} item was not skipped`,
                omittedAfter?.item_status === from && Number(omittedAfter?.quantity) === 1, JSON.stringify(omittedAfter));
            const omittedDenial = await prisma.audit_logs.findFirst({
                where: { entity_id: omitted.item.id, action_type: 'SKIP_APPROVAL_DENIED' },
            });
            assert(`the omitted ${from} item refusal is audited`,
                (omittedDenial?.details as any)?.reason === 'omitted_served_item', JSON.stringify(omittedDenial));
        }

        // (c) atomicity: a refused skip must not leave the UNRELATED edits in the same
        //     payload applied. The refusal is thrown inside the transaction precisely so
        //     the whole update rolls back, not just the skipped line.
        const atomic = await makeOrderWithItem(tenantA.id, menuA.id, 'SERVED', waiter.id);
        const atomicOrderBefore = await prisma.orders.findUnique({ where: { id: atomic.order.id } });
        const atomicItemsBefore = await prisma.order_items.count({ where: { order_id: atomic.order.id } });
        thrown = null;
        try {
            await service.updateOrder(tenantA.id, atomic.order.id, {
                status: 'SERVED',
                items: [
                    { id: atomic.item.id, menu_item_id: menuA.id, quantity: 0, unit_price: 500, item_status: 'SERVED' },
                    { id: crypto.randomUUID(), menu_item_id: menuA.id, quantity: 1, unit_price: 500, item_status: 'PENDING' },
                ],
            } as any);
        } catch (err: any) { thrown = err; }
        const atomicAfter = await prisma.orders.findUnique({ where: { id: atomic.order.id } });
        const atomicItemsAfter = await prisma.order_items.count({ where: { order_id: atomic.order.id } });
        assert('a refused skip rolls the whole order update back',
            thrown?.code === 'SKIP_APPROVAL_REQUIRED'
            && atomicAfter?.status === atomicOrderBefore?.status
            && atomicItemsAfter === atomicItemsBefore
            && (await prisma.order_items.findUnique({ where: { id: atomic.item.id } }))?.item_status === 'SERVED',
            `${atomicOrderBefore?.status}->${atomicAfter?.status} items ${atomicItemsBefore}->${atomicItemsAfter}`);

        // (d) the refusal above must NOT be a 500 and must leave no approval log.
        assert('a refused skip never produces an approval log',
            (await prisma.approval_logs.count({ where: { target_entity_id: atomic.item.id } })) === 0);

        // (e) the gate is a refusal only: the same item is skippable through the
        //     approved path, with the approver's own PIN.
        const approvedAfterRefusal = await http.approve(
            { orderItemId: atomic.item.id, approvalAction: 'APPROVE_SKIP', managerPin: PIN.manager, reason: 'guest left' },
            identity(manager.id, 'MANAGER')
        );
        assert('the refused item is still skippable through the approved path',
            approvedAfterRefusal.status === 200
            && (await prisma.order_items.findUnique({ where: { id: atomic.item.id } }))?.item_status === 'SKIPPED',
            `${approvedAfterRefusal.status} ${JSON.stringify(approvedAfterRefusal.body)}`);

        // (f) DENY_SKIP: a manager can refuse, and that changes nothing.
        const denyTarget = await makeOrderWithItem(tenantA.id, menuA.id, 'SERVED', waiter.id);
        const denied = await http.approve(
            { orderItemId: denyTarget.item.id, approvalAction: 'DENY_SKIP', managerPin: PIN.manager, reason: 'not yet' },
            identity(manager.id, 'MANAGER')
        );
        assert('DENY_SKIP is accepted with the approver own PIN',
            denied.status === 200 && denied.body?.data?.approved === false, `${denied.status} ${JSON.stringify(denied.body)}`);
        assert('DENY_SKIP left the item untouched',
            (await prisma.order_items.findUnique({ where: { id: denyTarget.item.id } }))?.item_status === 'SERVED');
        const denyLog = await prisma.approval_logs.findFirst({ where: { target_entity_id: denyTarget.item.id } });
        assert('DENY_SKIP is recorded in the approval log',
            denyLog?.action_type === 'DENY_SKIP' && denyLog?.approved_by_user_id === manager.id, JSON.stringify(denyLog));
        const denyAudit = await prisma.audit_logs.findFirst({
            where: { entity_id: denyTarget.item.id, action_type: 'MANAGER_DENY_SKIP' },
        });
        assert('DENY_SKIP is audited without a state change',
            denyAudit?.from_state === 'SERVED' && denyAudit?.to_state === 'SERVED', JSON.stringify(denyAudit));

        // (g) KDS client contract. The live hook sends the approver's own PIN to the
        //     live endpoint; prove the SERVER accepts exactly that request shape.
        const kdsTarget = await makeOrderWithItem(tenantA.id, menuA.id, 'SERVED', waiter.id);
        const kdsResult = await http.approve(
            { orderItemId: kdsTarget.item.id, approvalAction: 'APPROVE_SKIP', reason: 'guest left', managerPin: PIN.manager },
            identity(manager.id, 'MANAGER')
        );
        assert('the exact KDS client payload approves through the live endpoint',
            kdsResult.status === 200
            && (await prisma.order_items.findUnique({ where: { id: kdsTarget.item.id } }))?.item_status === 'SKIPPED',
            `${kdsResult.status} ${JSON.stringify(kdsResult.body)}`);

        // The client binding itself: no React test harness exists in this repo, so the
        // hook/modal wiring is asserted at the source level. This is the one static
        // check here and it exists only to pin the PIN to the live request.
        const hookSource = fs.readFileSync(path.join(process.cwd(), 'src/operations/kds/hooks/useOrderWorkflow.ts'), 'utf-8');
        const modalSource = fs.readFileSync(path.join(process.cwd(), 'src/operations/kds/components/ManagerApprovalModal.tsx'), 'utf-8');
        assert('the live KDS hook posts the manager PIN to the live skip-approval endpoint',
            hookSource.includes("fetchWithAuth('/api/orders/skip-approval'")
            && /approveSkip = useCallback\([\s\S]*managerPin\?: string/.test(hookSource)
            && hookSource.includes('JSON.stringify({ orderItemId, approvalAction, reason, managerPin })'),
            'hook must send managerPin to /api/orders/skip-approval');
        assert('the KDS modal passes the collected PIN through to the approval request',
            /terminalId,\s*\n\s*managerPin\s*\n\s*\)/.test(modalSource) && !modalSource.includes('PIN-verified:'),
            'modal must forward the PIN, not fold it into the reason text');

        // ---------------- 9. normal transitions still work ----------------
        const flow = await makeOrderWithItem(tenantA.id, menuA.id, 'PENDING', null);
        for (const [index, next] of (['PREPARING', 'DONE', 'SERVED'] as any[]).entries()) {
            const out = await orderWorkflowService.updateOrderItemStatus(
                flow.order.id, flow.item.id, next, tenantA.id, waiter.id, 'sess', 'WAITER'
            );
            assert(`normal transition ${index + 1} -> ${next} succeeds`, out.status === next && out.approval_required === false, JSON.stringify(out));
        }
        const flowItem = await prisma.order_items.findUnique({ where: { id: flow.item.id } });
        assert('normal transitions mutate the item and keep the actor', flowItem?.item_status === 'SERVED' && flowItem?.status_updated_by === waiter.id);

        // a non-skip quantity edit on a served item is still allowed
        const reduceTarget = await makeOrderWithItem(tenantA.id, menuA.id, 'SERVED', waiter.id);
        await prisma.order_items.update({ where: { id: reduceTarget.item.id }, data: { quantity: 3, total_price: 1500 } });
        const reduced = await service.updateOrder(tenantA.id, reduceTarget.order.id, {
            items: [{ id: reduceTarget.item.id, menu_item_id: menuA.id, quantity: 1, unit_price: 500, item_status: 'SERVED' }],
        } as any);
        assert('a legitimate non-zero quantity edit still succeeds',
            (await prisma.order_items.findUnique({ where: { id: reduceTarget.item.id } }))?.quantity === 1 && !!reduced);

        await http.close();
    } catch (err: any) {
        failed++;
        console.log(`FAIL: suite threw :: ${err.message}`);
    } finally {
        await teardown();
        await prisma.$disconnect();
    }

    console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
}

main();