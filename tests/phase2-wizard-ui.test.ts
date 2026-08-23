// Phase 2 — FirstLoginWizard UI regression suite.
// Requires the API server running on :3001 (NODE_ENV=test). Proves:
//  - step derivation rules (PIN step present iff forced; profile/review always)
//  - distinct server codes map to distinct user-facing guidance
//  - live contract sequence exactly as the component performs it:
//    onboarding/status -> auth/change-pin -> onboarding/profile ->
//    onboarding/complete (incl. 409 ALREADY_ACTIVE tolerance)
//  - login payload exposes must_change_pin / onboarding_status for redirect
//  - PIN_EXPIRED carries its distinct code for LoginView messaging
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE = 'http://localhost:3001';
let passed = 0, failed = 0;
function assert(name: string, cond: boolean, extra?: string) {
    if (cond) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}${extra ? ' :: ' + extra : ''}`); }
}
async function j(method: string, url: string, body?: any, token?: string) {
    const res = await fetch(BASE + url, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    let data: any = null; try { data = await res.json(); } catch { }
    return { status: res.status, data };
}

async function main() {
    // ========== 1. PURE STEP LOGIC ==========
    const { deriveWizardSteps, wizardErrorMessage, isSetupFinished } =
        await import('../src/features/onboarding/wizardLogic');

    const withPin = deriveWizardSteps({ pin_change_required: true });
    assert('Steps include PIN change when forced', withPin[0].id === 'change_pin' && withPin.length === 3);
    assert('Step order is fixed (pin -> profile -> review)', withPin.map(s => s.id).join(',') === 'change_pin,profile,review');
    const noPin = deriveWizardSteps({ pin_change_required: false });
    assert('PIN step omitted when not required', noPin[0].id === 'profile' && noPin.length === 2);

    assert('ALREADY_ACTIVE maps to tolerant guidance', wizardErrorMessage('ALREADY_ACTIVE', 'x').includes('already completed'));
    assert('PIN_EXPIRED maps distinctly', wizardErrorMessage('PIN_EXPIRED', 'x').includes('expired'));
    assert('PIN_CHANGE_REQUIRED maps distinctly', wizardErrorMessage('PIN_CHANGE_REQUIRED', 'x').includes('Change your PIN'));
    assert('Unknown codes use fallback', wizardErrorMessage(undefined, 'fallback') === 'fallback');

    assert('isSetupFinished true only when ACTIVE and no forced change',
        isSetupFinished({ onboarding_status: 'ACTIVE' }, false) === true &&
        isSetupFinished({ onboarding_status: 'ACTIVE' }, true) === false &&
        isSetupFinished({ onboarding_status: 'SETUP_INCOMPLETE' }, false) === false);

    // ========== 2. LIVE CONTRACT SEQUENCE ==========
    const ts = Date.now();
    const rVault = await prisma.restaurants.create({ data: { name: `P2W_VAULT_${ts}`, slug: `p2w-vault-${ts}`, subscription_status: 'active' } });
    const sa = await prisma.staff.create({ data: { restaurant_id: rVault.id, name: 'SuperW', role: 'SUPER_ADMIN', pin: '', hashed_pin: await bcrypt.hash('121212', 10), status: 'active' } });

    const login = async (pin: string, rid: string, name?: string) =>
        j('POST', '/api/auth/login', { pin, restaurant_id: rid, ...(name ? { staff_name: name } : {}) });

    try {
        const superTok: string = (await login('121212', rVault.id, 'SuperW')).data?.tokens?.access_token;

        // Expired-PIN holder on an ACTIVE legacy tenant
        const rLegacy = await prisma.restaurants.create({ data: { name: `P2W_LEGACY_${ts}`, slug: `p2w-legacy-${ts}`, subscription_status: 'active' } });
        const expiredStaff = await prisma.staff.create({
            data: {
                restaurant_id: rLegacy.id, name: 'Expired Wizard Holder', role: 'CASHIER', pin: '',
                hashed_pin: await bcrypt.hash('555555', 10), status: 'active',
                pin_expires_at: new Date(Date.now() - 60_000)
            }
        });
        const expiredAttempt = await login('555555', rLegacy.id, 'Expired Wizard Holder');
        assert('Login surfaces PIN_EXPIRED code for LoginView messaging', expiredAttempt.status === 403 && expiredAttempt.data?.code === 'PIN_EXPIRED');

        // Provision fresh tenant through the same route Vault UI uses
        const prov = await j('POST', '/api/super-admin/restaurants/provision', {
            name: `Wizard UI Cafe ${ts}`, slug: `wizard-ui-cafe-${ts}`,
            owner_name: 'UI Owner', owner_email: `ui-${ts}@p2w.example`,
        }, superTok);
        assert('Provision 201 (Vault flow)', prov.status === 201);
        const rid: string = prov.data.restaurant.id;
        const issuedPin: string = prov.data.ownerStaff.temporary_pin;

        const firstLogin = await login(issuedPin, rid, 'UI Owner');
        assert('Login exposes must_change_pin', firstLogin.data?.staff?.must_change_pin === true);
        assert('Login exposes SETUP_INCOMPLETE', firstLogin.data?.restaurant?.onboarding_status === 'SETUP_INCOMPLETE');
        const tok: string = firstLogin.data.tokens.access_token;

        // Step: onboarding/status — exact fields the wizard renders from
        const status = await j('GET', '/api/onboarding/status', undefined, tok);
        assert('Status reachable during restriction', status.status === 200);
        assert('Status shape matches wizard expectations',
            status.data?.onboarding_status === 'SETUP_INCOMPLETE' &&
            typeof status.data?.requirements?.pin_change_required === 'boolean' &&
            typeof status.data?.requirements?.profile_fields?.name === 'boolean' &&
            typeof status.data?.requirements?.profile_fields?.address === 'boolean' &&
            typeof status.data?.requirements?.profile_fields?.phone === 'boolean');

        // Step: change-pin (wrong old first)
        assert('Wrong old PIN rejected 401', (await j('POST', '/api/auth/change-pin', { old_pin: '000000', new_pin: '444555' }, tok)).status === 401);
        const changed = await j('POST', '/api/auth/change-pin', { old_pin: issuedPin, new_pin: '654321' }, tok);
        assert('Change-pin succeeds in wizard flow', changed.status === 200);

        // Status now reports no forced change
        const status2 = await j('GET', '/api/onboarding/status', undefined, tok);
        assert('Status reflects cleared pin requirement', status2.data?.requirements?.pin_change_required === false);

        // Step: profile patch (allowlisted fields)
        const prof = await j('PATCH', '/api/onboarding/profile', { address: '12 Test Street', phone: '+92-300-0000000' }, tok);
        assert('Profile patch accepts allowlisted fields', prof.status === 200);
        const badName = await j('PATCH', '/api/onboarding/profile', { name: 'A' }, tok);
        assert('Profile rejects too-short name', badName.status === 400);

        // Step: complete (+ replay tolerance)
        const complete = await j('POST', '/api/onboarding/complete', {}, tok);
        assert('Completion activates tenant', complete.status === 200 && complete.data?.onboarding_status === 'ACTIVE');
        const replay = await j('POST', '/api/onboarding/complete', {}, tok);
        assert('Replay refused as ALREADY_ACTIVE', replay.status === 409 && replay.data?.code === 'ALREADY_ACTIVE');

        // Operational access restored post-wizard
        const op = await j('GET', `/api/onboarding/status`, undefined, tok);
        assert('Session remains valid post-completion', op.status === 200 && op.data.onboarding_status === 'ACTIVE');

        idsToClean.push(rVault.id, rLegacy.id, rid);
    } finally {
        for (const r of idsToClean) {
            await prisma.outbox.deleteMany({ where: { restaurant_id: r } });
            await prisma.owner_invites.deleteMany({ where: { restaurant_id: r } });
            await prisma.audit_logs.deleteMany({ where: { restaurant_id: r } });
            await prisma.order_type_defaults.deleteMany({ where: { restaurant_id: r } });
            await prisma.chart_of_accounts.deleteMany({ where: { restaurant_id: r } });
            await prisma.tables.deleteMany({ where: { restaurant_id: r } });
            await prisma.sections.deleteMany({ where: { restaurant_id: r } });
            await prisma.staff.deleteMany({ where: { restaurant_id: r } });
            await prisma.restaurants.deleteMany({ where: { id: r } }).catch(() => { });
        }
    }

    console.log(`\n=== PHASE 2 WIZARD UI: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
}

const idsToClean: string[] = [];
main().catch(e => { console.error('FATAL:', e); process.exit(1); });
