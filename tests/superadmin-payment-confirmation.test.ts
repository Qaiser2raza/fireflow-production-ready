/**
 * Task 04c — manual Super Admin payment confirmation.
 *
 * Proves the smallest auditable manual billing workflow:
 *   - SUPER_ADMIN only, and the local database is the source of truth
 *   - a manual payment activates a TRIAL tenant and extends an ACTIVE one
 *   - an expired or suspended tenant starts a fresh period from today
 *   - the same payment reference can never be confirmed twice
 *   - every activation appends exactly one subscription_events row
 *   - an evidence row on its own never grants access
 *
 * The route is exercised over real HTTP against the mounted router with an
 * identity-injecting middleware standing in for authMiddleware (the same
 * pattern as tests/order-skip-approval.test.ts); the service is called
 * directly where the behaviour belongs to the service, not the route.
 *
 * Run: npm run test:safe -- tests/superadmin-payment-confirmation.test.ts
 */
import './_test-db-guard';
import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import superAdminRoutes from '../src/api/routes/superAdminRoutes';
import { jwtService } from '../src/api/services/auth/JwtService';
import {
  confirmSubscriptionPayment,
  ConfirmPaymentError,
  MANUAL_PAYMENT_METHODS,
  MANUAL_PAYMENT_PERIOD_DAYS,
} from '../src/api/services/tenant/confirmSubscriptionPayment';
import { getTenantAccess } from '../src/api/services/tenant/getTenantAccess';
import { ACTIVE, GRACE, SUSPENDED, TRIAL, expiredDate, futureDate, pastDate } from './helpers/tenantFixtures';

const prisma = new PrismaClient();

const unique = () => crypto.randomBytes(6).toString('hex');
const DAY_MS = 24 * 60 * 60 * 1000;

let passed = 0;
let failed = 0;
function assert(name: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`PASS: ${name}`); }
  else { failed++; console.log(`FAIL: ${name}${extra ? ' :: ' + extra : ''}`); }
}

const trash = { restaurants: [] as string[], staff: [] as string[], payments: [] as string[] };

async function teardown() {
  for (const id of trash.payments) {
    await prisma.subscription_payments.deleteMany({ where: { id } }).catch(() => {});
  }
  await prisma.subscription_payments.deleteMany({ where: { restaurant_id: { in: [...trash.restaurants] } } }).catch(() => {});
  await prisma.subscription_events.deleteMany({ where: { restaurant_id: { in: [...trash.restaurants] } } }).catch(() => {});
  for (const id of trash.staff) {
    await prisma.staff.deleteMany({ where: { id } }).catch(() => {});
  }
  for (const id of trash.restaurants) {
    await prisma.restaurants.deleteMany({ where: { id } }).catch(() => {});
  }
}

async function makeRestaurant(status: any = TRIAL, expiresAt: Date | null = null) {
  const restaurant = await prisma.restaurants.create({
    data: {
      name: `Billing Tenant ${unique()}`,
      slug: `billing-tenant-${unique()}`,
      is_active: true,
      onboarding_status: 'ACTIVE',
      subscription_status: status,
      trial_ends_at: futureDate(10),
      subscription_expires_at: expiresAt,
    },
  });
  trash.restaurants.push(restaurant.id);
  return restaurant;
}

async function makeStaff(restaurantId: string, role: string) {
  const staff = await prisma.staff.create({
    data: {
      restaurant_id: restaurantId,
      name: `Billing ${role} ${unique()}`,
      role,
      pin: '',
      hashed_pin: await bcrypt.hash('999999', 10),
      status: 'active',
    },
  });
  trash.staff.push(staff.id);
  return staff;
}

type Http = { status: number; body: any };

/**
 * Mounts the REAL router behind its own authMiddleware + requireRole('SUPER_ADMIN'),
 * so the authorization assertions below exercise the production gate rather than
 * a stand-in. Requests carry a genuinely signed access token.
 */
async function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/super-admin', superAdminRoutes);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = (server.address() as any).port;

  return {
    confirm: async (restaurantId: string, body: any, token: string | null): Promise<Http> => {
      const res = await fetch(`http://127.0.0.1:${port}/api/super-admin/tenants/${restaurantId}/confirm-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function main() {
  console.log('Task 04c — manual Super Admin payment confirmation');

  try {
    // A SUPER_ADMIN and a MANAGER, each in their own tenant, so the role gate is
    // decided by a real verified token rather than an injected header.
    const adminTenant = await makeRestaurant(ACTIVE, futureDate(60));
    const managerTenant = await makeRestaurant(ACTIVE, futureDate(60));
    const superAdmin = await makeStaff(adminTenant.id, 'SUPER_ADMIN');
    const manager = await makeStaff(managerTenant.id, 'MANAGER');

    const adminToken = jwtService.generateAccessToken(superAdmin.id, adminTenant.id, 'SUPER_ADMIN', superAdmin.name);
    const managerToken = jwtService.generateAccessToken(manager.id, managerTenant.id, 'MANAGER', manager.name);

    // ---------------- 1. authorization ----------------
    const authTenant = await makeRestaurant(TRIAL);
    const http = await startServer();

    const unauthenticated = await http.confirm(
      authTenant.id,
      { amount: 2500, paymentMethod: 'BANK_TRANSFER', periodDays: 30 },
      null
    );
    assert('an unauthenticated request is refused with 401', unauthenticated.status === 401, `${unauthenticated.status} ${JSON.stringify(unauthenticated.body)}`);

    const asManager = await http.confirm(
      authTenant.id,
      { amount: 2500, paymentMethod: 'BANK_TRANSFER', periodDays: 30 },
      managerToken
    );
    assert('a MANAGER is refused with 403', asManager.status === 403, `${asManager.status} ${JSON.stringify(asManager.body)}`);
    assert('the refused authorization wrote no payment',
      (await prisma.subscription_payments.count({ where: { restaurant_id: authTenant.id } })) === 0);
    assert('the refused authorization changed no status',
      (await prisma.restaurants.findUnique({ where: { id: authTenant.id } }))?.subscription_status === TRIAL);

    // ---------------- 2. activation from TRIAL ----------------
    const before = new Date();
    let r = await http.confirm(
      authTenant.id,
      { amount: 2500, paymentMethod: 'BANK_TRANSFER', periodDays: 30, transactionRef: `REF-${unique()}`, note: 'paid via WhatsApp' },
      adminToken
    );
    assert('SUPER_ADMIN activates a TRIAL tenant with one action', r.status === 200 && r.body.success === true, `${r.status} ${JSON.stringify(r.body)}`);
    assert('the tenant is now ACTIVE',
      (await prisma.restaurants.findUnique({ where: { id: authTenant.id } }))?.subscription_status === ACTIVE);

    const activated = await prisma.restaurants.findUnique({ where: { id: authTenant.id } });
    const expectedEnd = new Date(before.getTime() + 30 * DAY_MS);
    assert('a lapsed trial starts its period from today, not from the old trial end',
      Math.abs((activated!.subscription_expires_at!.getTime() - expectedEnd.getTime())) < 60_000,
      `${activated?.subscription_expires_at?.toISOString()} vs ${expectedEnd.toISOString()}`);
    assert('the confirmation reports it did not extend an existing period',
      r.body.extendedExistingPeriod === false && r.body.periodDays === 30, JSON.stringify(r.body));

    const payment = await prisma.subscription_payments.findFirst({ where: { restaurant_id: authTenant.id } });
    trash.payments.push(payment!.id);
    assert('the payment records the amount actually received',
      Number(payment!.amount) === 2500 && payment!.payment_method === 'BANK_TRANSFER', JSON.stringify(payment));
    assert('the payment records the billing period, verifier and time',
      payment!.billing_period === '30d' && payment!.verified_by === superAdmin.id && !!payment!.verified_at, JSON.stringify(payment));
    assert('the payment records the admin note as the proof pointer',
      payment!.payment_proof === 'paid via WhatsApp', JSON.stringify(payment));

    const events = await prisma.subscription_events.findMany({ where: { restaurant_id: authTenant.id } });
    assert('activation appends exactly one subscription event', events.length === 1, JSON.stringify(events));
    assert('the event records the transition and the verifier',
      events[0]?.from_status === TRIAL && events[0]?.to_status === ACTIVE
      && events[0]?.actor_type === 'SUPER_ADMIN' && events[0]?.actor_id === superAdmin.id,
      JSON.stringify(events[0]));
    assert('the activated tenant derives FULL access', (await getTenantAccess(prisma, authTenant.id)).mode === 'FULL');

    // ---------------- 3. extension of a live subscription ----------------
    const currentEnd = (await prisma.restaurants.findUnique({ where: { id: authTenant.id } }))!.subscription_expires_at!;
    r = await http.confirm(
      authTenant.id,
      { amount: 2500, paymentMethod: 'JAZZCASH', periodDays: 90 },
      adminToken
    );
    assert('an ACTIVE tenant is extended by a second payment', r.status === 200 && r.body.extendedExistingPeriod === true, `${r.status} ${JSON.stringify(r.body)}`);
    const extended = await prisma.restaurants.findUnique({ where: { id: authTenant.id } });
    const expectedExtended = new Date(currentEnd.getTime() + 90 * DAY_MS);
    assert('extension adds to the current expiry instead of truncating it',
      Math.abs(extended!.subscription_expires_at!.getTime() - expectedExtended.getTime()) < 1000,
      `${extended?.subscription_expires_at?.toISOString()} vs ${expectedExtended.toISOString()}`);
    const extendEvents = await prisma.subscription_events.findMany({ where: { restaurant_id: authTenant.id } });
    assert('an extension on an already-ACTIVE tenant writes no status event (no fake transition)',
      extendEvents.length === 1, JSON.stringify(extendEvents));
    assert('both payments are on file',
      (await prisma.subscription_payments.count({ where: { restaurant_id: authTenant.id } })) === 2);

    // ---------------- 4. expired / suspended / trial tenants ----------------
    const lapsed = await makeRestaurant(SUSPENDED, pastDate(40));
    r = await http.confirm(lapsed.id, { amount: 1000, paymentMethod: 'CASH', periodDays: 180 }, adminToken);
    const lapsedAfter = await prisma.restaurants.findUnique({ where: { id: lapsed.id } });
    assert('a SUSPENDED tenant with a past expiry starts from today',
      r.status === 200 && r.body.extendedExistingPeriod === false
      && Math.abs(lapsedAfter!.subscription_expires_at!.getTime() - (Date.now() + 180 * DAY_MS)) < 60_000,
      `${r.body.extendedExistingPeriod} ${lapsedAfter?.subscription_expires_at?.toISOString()}`);
    assert('the lapsed tenant is ACTIVE again',
      lapsedAfter?.subscription_status === ACTIVE && (await getTenantAccess(prisma, lapsed.id)).mode === 'FULL');

    const grace = await makeRestaurant(GRACE, pastDate(2));
    r = await http.confirm(grace.id, { amount: 500, paymentMethod: 'EASYPAISA', periodDays: 365 }, adminToken);
    const graceAfter = await prisma.restaurants.findUnique({ where: { id: grace.id } });
    assert('a GRACE tenant past its expiry starts from today, not from the grace date',
      r.status === 200 && r.body.extendedExistingPeriod === false
      && Math.abs(graceAfter!.subscription_expires_at!.getTime() - (Date.now() + 365 * DAY_MS)) < 60_000,
      `${r.body.extendedExistingPeriod} ${graceAfter?.subscription_expires_at?.toISOString()}`);

    // a live TRIAL keeps its remaining time rather than restarting
    const liveTrial = await makeRestaurant(TRIAL, futureDate(5));
    r = await http.confirm(liveTrial.id, { amount: 500, paymentMethod: 'OTHER', periodDays: 30 }, adminToken);
    const liveTrialEnd = (await prisma.restaurants.findUnique({ where: { id: liveTrial.id } }))!.subscription_expires_at!;
    assert('a TRIAL whose period is still running is extended, not restarted',
      r.body.extendedExistingPeriod === true && liveTrialEnd.getTime() > Date.now() + 34 * DAY_MS,
      liveTrialEnd.toISOString());

    // ---------------- 5. duplicate protection ----------------
    const dupTenant = await makeRestaurant(TRIAL);
    const sharedRef = `DUP-${unique()}`;
    const first = await http.confirm(dupTenant.id, { amount: 750, paymentMethod: 'BANK_TRANSFER', periodDays: 30, transactionRef: sharedRef }, adminToken);
    assert('the first confirmation of a reference succeeds', first.status === 200, `${first.status} ${JSON.stringify(first.body)}`);
    const endAfterFirst = (await prisma.restaurants.findUnique({ where: { id: dupTenant.id } }))!.subscription_expires_at!;

    const second = await http.confirm(dupTenant.id, { amount: 750, paymentMethod: 'BANK_TRANSFER', periodDays: 30, transactionRef: sharedRef }, adminToken);
    assert('the same reference cannot be confirmed twice', second.status === 409 && second.body.code === 'DUPLICATE_PAYMENT', `${second.status} ${JSON.stringify(second.body)}`);
    assert('the duplicate granted no extra period',
      (await prisma.restaurants.findUnique({ where: { id: dupTenant.id } }))!.subscription_expires_at!.getTime() === endAfterFirst.getTime());
    assert('the duplicate created no second payment row',
      (await prisma.subscription_payments.count({ where: { restaurant_id: dupTenant.id } })) === 1);
    assert('the duplicate created no second event',
      (await prisma.subscription_events.count({ where: { restaurant_id: dupTenant.id } })) === 1);

    // ---------------- 6. input validation ----------------
    const valTenant = await makeRestaurant(TRIAL);
    for (const periodDays of [7, 45, 0, -30, '30 days']) {
      const bad = await http.confirm(valTenant.id, { amount: 100, paymentMethod: 'CASH', periodDays }, adminToken);
      assert(`periodDays ${JSON.stringify(periodDays)} is refused with 400`, bad.status === 400 && bad.body.code === 'INVALID_INPUT', `${bad.status} ${bad.body?.code}`);
    }
    for (const method of ['BITCOIN', '', '  ']) {
      const bad = await http.confirm(valTenant.id, { amount: 100, paymentMethod: method, periodDays: 30 }, adminToken);
      assert(`paymentMethod ${JSON.stringify(method)} is refused with 400`, bad.status === 400 && bad.body.code === 'INVALID_INPUT', `${bad.status} ${bad.body?.code}`);
    }
    // A known method is accepted case-insensitively and stored canonically, so a
    // form that sends "cash" cannot create a second spelling of the same method.
    const normalized = await http.confirm(valTenant.id, { amount: 100, paymentMethod: 'cash', periodDays: 30 }, adminToken);
    const normalizedRow = await prisma.subscription_payments.findFirst({ where: { restaurant_id: valTenant.id } });
    assert('a known method is accepted in any case and stored uppercase',
      normalized.status === 200 && normalizedRow?.payment_method === 'CASH', `${normalized.status} ${normalizedRow?.payment_method}`);
    await prisma.subscription_payments.deleteMany({ where: { restaurant_id: valTenant.id } }).catch(() => {});
    await prisma.subscription_events.deleteMany({ where: { restaurant_id: valTenant.id } }).catch(() => {});
    await prisma.restaurants.update({ where: { id: valTenant.id }, data: { subscription_status: TRIAL, subscription_expires_at: null } }).catch(() => {});
    for (const amount of [0, -5, 'free', null]) {
      const bad = await http.confirm(valTenant.id, { amount, paymentMethod: 'CASH', periodDays: 30 }, adminToken);
      assert(`amount ${JSON.stringify(amount)} is refused with 400`, bad.status === 400 && bad.body.code === 'INVALID_INPUT', `${bad.status} ${bad.body?.code}`);
    }    const futurePaid = await http.confirm(valTenant.id, { amount: 100, paymentMethod: 'CASH', periodDays: 30, paymentDate: '2099-01-01' }, adminToken);
    assert('a future paymentDate is refused with 400', futurePaid.status === 400, `${futurePaid.status} ${futurePaid.body?.code}`);
    const missing = await http.confirm(crypto.randomUUID(), { amount: 100, paymentMethod: 'CASH', periodDays: 30 }, adminToken);
    assert('an unknown restaurant is refused with 404', missing.status === 404 && missing.body.code === 'RESTAURANT_NOT_FOUND', `${missing.status} ${missing.body?.code}`);
    assert('no rejected validation wrote a payment row',
      (await prisma.subscription_payments.count({ where: { restaurant_id: valTenant.id } })) === 0);
    assert('no rejected validation changed the tenant status',
      (await prisma.restaurants.findUnique({ where: { id: valTenant.id } }))?.subscription_status === TRIAL);

    // ---------------- 7. every documented period and method works ----------------
    const allowedTenant = await makeRestaurant(TRIAL);
    let allPeriods = true;
    for (const periodDays of MANUAL_PAYMENT_PERIOD_DAYS) {
      for (const method of MANUAL_PAYMENT_METHODS) {
        const ok = await confirmSubscriptionPayment(prisma, {
          restaurantId: allowedTenant.id,
          amount: 100,
          paymentMethod: method,
          periodDays,
          adminId: superAdmin.id,
        });
        if (ok.periodDays !== periodDays || ok.toStatus !== ACTIVE) {
          allPeriods = false;
        }
      }
    }
    assert('every documented period (30/90/180/365) and method activates successfully', allPeriods);

    // ---------------- 8. payment date is recorded as the payment, not the approval ----------
    const datedTenant = await makeRestaurant(TRIAL);
    const paidOn = new Date(Date.now() - 3 * DAY_MS);
    await confirmSubscriptionPayment(prisma, {
      restaurantId: datedTenant.id,
      amount: 100,
      paymentMethod: 'BANK_TRANSFER',
      periodDays: 30,
      paymentDate: paidOn,
      adminId: superAdmin.id,
    });
    const datedRow = await prisma.subscription_payments.findFirst({ where: { restaurant_id: datedTenant.id } });
    assert('the payment row carries the date the customer actually paid',
      Math.abs(datedRow!.created_at!.getTime() - paidOn.getTime()) < 1000
      && (datedRow!.verified_at!.getTime() - paidOn.getTime()) > 2 * DAY_MS,
      JSON.stringify(datedRow));

    // ---------------- 9. an evidence row alone never grants access ----------------
    // The tenant must be genuinely lapsed BEFORE the evidence row exists: a TRIAL
    // whose trial end date is still in the future is legitimately FULL, because
    // access is derived from the end date that matches the stored status.
    const evidenceTenant = await makeRestaurant(TRIAL, pastDate(1));
    await prisma.restaurants.update({
      where: { id: evidenceTenant.id },
      data: { trial_ends_at: expiredDate(40) },
    });
    const evidence = await prisma.subscription_payments.create({
      data: {
        restaurant_id: evidenceTenant.id,
        amount: 100,
        payment_method: 'BANK_TRANSFER',
        transaction_id: `proof-${unique()}`,
        status: 'pending',
      },
    });
    trash.payments.push(evidence.id);
    const evidenceTenantAfter = await prisma.restaurants.findUnique({ where: { id: evidenceTenant.id } });
    assert('a pending evidence row leaves the tenant status untouched',
      evidenceTenantAfter?.subscription_status === TRIAL, String(evidenceTenantAfter?.subscription_status));
    assert('a pending evidence row grants no access',
      (await getTenantAccess(prisma, evidenceTenant.id)).mode === 'READ_ONLY',
      (await getTenantAccess(prisma, evidenceTenant.id)).mode);

    // the same payment can then be confirmed on top of that evidence
    const confirmEvidence = await http.confirm(
      evidenceTenant.id,
      { amount: 100, paymentMethod: 'BANK_TRANSFER', periodDays: 30, transactionRef: evidence.transaction_id },
      adminToken
    );
    assert('confirming with the reference of an existing pending row reuses that row',
      confirmEvidence.status === 200 && confirmEvidence.body.confirmedExisting === true,
      `${confirmEvidence.status} ${JSON.stringify(confirmEvidence.body)}`);
    assert('reusing the evidence row created no duplicate payment',
      (await prisma.subscription_payments.count({ where: { restaurant_id: evidenceTenant.id } })) === 1);

    // ---------------- 10. local database is the only source ----------------
    const localTenant = await makeRestaurant(TRIAL);
    await confirmSubscriptionPayment(prisma, {
      restaurantId: localTenant.id,
      amount: 100,
      paymentMethod: 'CASH',
      periodDays: 30,
      adminId: superAdmin.id,
    });
    const localRow = await prisma.subscription_payments.findFirst({ where: { restaurant_id: localTenant.id } });
    assert('the confirmation wrote a LOCAL subscription_payments row (no cloud round trip)',
      !!localRow && localRow.status === 'verified' && localRow.verified_by === superAdmin.id,
      JSON.stringify(localRow));

    let missingError: any = null;
    try {
      await confirmSubscriptionPayment(prisma, {
        restaurantId: crypto.randomUUID(),
        amount: 100,
        paymentMethod: 'CASH',
        periodDays: 30,
        adminId: superAdmin.id,
      });
    } catch (err: any) {
      missingError = err;
    }
    assert('an unknown restaurant raises RESTAURANT_NOT_FOUND from the service itself',
      missingError instanceof ConfirmPaymentError && missingError.code === 'RESTAURANT_NOT_FOUND',
      String(missingError?.code));

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
