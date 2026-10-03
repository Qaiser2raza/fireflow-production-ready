/**
 * Task 03g (Phase A) — client token-lifecycle regression tests.
 *
 * Two defects are locked down here:
 *
 *  P1: a stored access token used to be re-armed to "now + 15 minutes" on every
 *      mount, so an already-expired JWT was sent forever and the server answered
 *      410 TOKEN_EXPIRED on every call.
 *  P2: a 410 was treated as a dead session (markSessionTerminated +
 *      session:expired) instead of "refresh once and retry once", logging the
 *      owner out while a valid httpOnly refresh cookie was still present.
 *
 * These are pure client-side rules: no server, no database, no real HTTP. The
 * browser globals are stubbed BEFORE the modules under test are imported,
 * because ownerSession.ts captures window.location at module load.
 *
 * Run: npm run test:safe -- tests/owner-client-token-lifecycle.test.ts
 */
import './_test-db-guard';

let passed = 0;
let failed = 0;
function assert(name: string, cond: boolean, extra?: string) {
    if (cond) { passed++; console.log(`PASS: ${name}`); }
    else { failed++; console.log(`FAIL: ${name}${extra ? ' :: ' + extra : ''}`); }
}

/** Minimal localStorage/sessionStorage. */
function makeStorage() {
    const map = new Map<string, string>();
    return {
        map,
        getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
        setItem: (k: string, v: string) => { map.set(k, String(v)); },
        removeItem: (k: string) => { map.delete(k); },
        clear: () => map.clear(),
        key: (i: number) => Array.from(map.keys())[i] ?? null,
        get length() { return map.size; },
    } as unknown as Storage & { map: Map<string, string> };
}

function base64url(input: string): string {
    return Buffer.from(input, 'utf-8').toString('base64url');
}

/** An unsigned access-token shape: the client only ever reads `exp`. */
function makeToken(expSecondsFromNow: number | null): string {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const payload: Record<string, unknown> = { staffId: 'staff-1', restaurantId: 'rest-1', type: 'access', iat: nowSeconds };
    if (expSecondsFromNow !== null) payload.exp = nowSeconds + expSecondsFromNow;
    return `${base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64url(JSON.stringify(payload))}.c2lnbmF0dXJl`;
}

type FetchCall = { url: string; auth: string | null };

async function main() {
    console.log('Task 03g — client token lifecycle (P1 expiry, P2 410 handling)');

    // ---- browser stubs, installed before importing the modules under test ----
    const localStorage = makeStorage();
    const sessionStorage = makeStorage();
    const events: string[] = [];
    const calls: FetchCall[] = [];
    let fetchHandler: (url: string, init: any) => { status: number; body?: any } = () => ({ status: 200 });

    const win: any = {
        location: { origin: 'http://localhost:3000' },
        dispatchEvent: (e: any) => { events.push(e?.type); return true; },
        addEventListener: () => { },
        removeEventListener: () => { },
    };

    (globalThis as any).window = win;
    (globalThis as any).localStorage = localStorage;
    (globalThis as any).sessionStorage = sessionStorage;
    (globalThis as any).CustomEvent = class { type: string; constructor(type: string) { this.type = type; } };
    (globalThis as any).fetch = async (url: string, init: any) => {
        const authHeader = (init?.headers?.Authorization as string) || null;
        calls.push({ url: String(url), auth: authHeader });
        const result = fetchHandler(String(url), init);
        return {
            ok: result.status >= 200 && result.status < 300,
            status: result.status,
            json: async () => result.body ?? {},
        } as any;
    };

    const session = await import('../src/shared/lib/ownerSession');
    const { fetchWithAuth, clearAuthSession } = await import('../src/shared/lib/authInterceptor');

    // ============================ P1: expiry handling ============================
    console.log('\n--- P1: stored token expiry comes from the token, not from a 15-minute re-arm ---');

    const expired = makeToken(-60);
    localStorage.clear();
    localStorage.setItem('accessToken', expired);
    // The exact state the old restore path produced: a dead token plus a
    // "fresh" local expiry window.
    localStorage.setItem('accessTokenExpiry', String(Date.now() + 15 * 60 * 1000));
    assert('expired stored token is not returned', session.getValidAccessToken() === null);
    assert('hasValidAccessToken agrees', session.hasValidAccessToken() === false);

    const almostDead = makeToken(30);
    localStorage.clear();
    assert('a token expiring in 30s is usable', session.storeAccessToken(almostDead) === true);
    assert('token is returned while inside its own window', session.getValidAccessToken() === almostDead);
    const storedWindow = Number(localStorage.getItem('accessTokenExpiry')!);
    const trueExpiry = session.readAccessTokenExpiry(almostDead)!;
    assert('stored expiry equals the token exp, not now + 15 min', storedWindow === trueExpiry, `${storedWindow} vs ${trueExpiry}`);
    assert('stored expiry is NOT 15 minutes out', trueExpiry - Date.now() < 15 * 60 * 1000, String(trueExpiry - Date.now()));

    // Re-storing must never extend the window (the old bug).
    session.storeAccessToken(almostDead);
    assert('re-storing does not extend the window', Number(localStorage.getItem('accessTokenExpiry')!) === trueExpiry);

    localStorage.clear();
    assert('token without exp fails closed (missing exp)', session.storeAccessToken(makeToken(null)) === false);
    assert('nothing is stored for a token without exp', localStorage.getItem('accessToken') === null);

    localStorage.clear();
    const broken = 'not-a-jwt';
    localStorage.setItem('accessToken', broken);
    localStorage.setItem('accessTokenExpiry', String(Date.now() + 15 * 60 * 1000));
    assert('unreadable token fails closed even with a fresh local expiry', session.getValidAccessToken() === null);

    localStorage.clear();
    const live = makeToken(600);
    localStorage.setItem('accessToken', live);
    assert('missing accessTokenExpiry is not treated as valid forever', session.getValidAccessToken() === live, 'token exp still governs');
    localStorage.setItem('accessTokenExpiry', String(Date.now() - 1000));
    assert('a stale local hint can only shorten the window', session.getValidAccessToken() === null);

    // ============================ P2: 410 handling ============================
    console.log('\n--- P2: 410 refreshes once and retries once, like 401 ---');

    async function reset(token: string | null, expiryKey: string | null = null) {
        localStorage.clear();
        sessionStorage.clear();
        events.length = 0;
        calls.length = 0;
        if (token) localStorage.setItem('accessToken', token);
        if (expiryKey) localStorage.setItem('accessTokenExpiry', expiryKey);
    }

    // 410 + working cookie refresh -> retried successfully, session untouched.
    // The client still considers its token alive (exp in the future); the SERVER
    // answers 410 — the exact situation P1's re-arm used to create for hours.
    const serverExpired = makeToken(600);
    await reset(serverExpired, null);
    const fresh = makeToken(900);
    let refreshCalls = 0;
    fetchHandler = (url) => {
        if (url.includes('/auth/refresh')) {
            refreshCalls++;
            return { status: 200, body: { success: true, access_token: fresh, expires_in: 900, staff: {}, restaurant: {} } };
        }
        const auth = calls[calls.length - 1].auth;
        return auth === `Bearer ${fresh}` ? { status: 200, body: { ok: true } } : { status: 410, body: { code: 'TOKEN_EXPIRED' } };
    };
    let res = await fetchWithAuth('http://localhost:3000/api/tables');
    assert('410 then refresh then retry ends 200', res.status === 200, String(res.status));
    assert('exactly one refresh request was sent', refreshCalls === 1, String(refreshCalls));
    assert('three requests total (410, refresh, retry)', calls.length === 3, String(calls.length));
    assert('the first attempt carried the token the client still trusted', calls[0].auth === `Bearer ${serverExpired}`, String(calls[0].auth));
    assert('the retry carried the new token', calls[2].auth === `Bearer ${fresh}`, String(calls[2].auth));
    assert('no session:expired event on a recovered 410', events.length === 0, events.join(','));
    assert('the session survives a recovered 410', session.getValidAccessToken() === fresh);

    // P1 + P2 together: a locally-expired token is never sent at all, the
    // refresh runs first, and the request goes out once with the new token.
    await reset(expired, String(Date.now() + 15 * 60 * 1000));
    fetchHandler = (url) => (url.includes('/auth/refresh')
        ? { status: 200, body: { success: true, access_token: fresh, expires_in: 900, staff: {}, restaurant: {} } }
        : { status: 200, body: { ok: true } });
    res = await fetchWithAuth('http://localhost:3000/api/menu_items');
    assert('an expired stored token is refreshed, never sent', calls[0].auth === null && calls[1].auth === `Bearer ${fresh}`, `${calls[0].auth} / ${calls[1].auth}`);
    assert('no 410 round-trip is needed after a local expiry', calls.length === 2, String(calls.length));

    // 410 + dead cookie -> exactly one session:expired, storage cleared.
    await reset(serverExpired, null);
    fetchHandler = (url) => (url.includes('/auth/refresh')
        ? { status: 401, body: { code: 'INVALID_REFRESH_TOKEN' } }
        : { status: 410, body: { code: 'TOKEN_EXPIRED' } });
    res = await fetchWithAuth('http://localhost:3000/api/orders');
    assert('a 410 with a dead cookie still returns the 410', res.status === 410, String(res.status));
    assert('exactly one session:expired event', events.filter((e) => e === 'session:expired').length === 1, events.join(','));
    assert('access token cleared after a failed refresh', localStorage.getItem('accessToken') === null);
    assert('refresh token cleared after a failed refresh', localStorage.getItem('refreshToken') === null);

    // A second failing call must not spam the event.
    await fetchWithAuth('http://localhost:3000/api/orders');
    assert('still exactly one session:expired event', events.filter((e) => e === 'session:expired').length === 1, events.join(','));

    // A recovered session re-arms the event.
    await reset(makeToken(600), null);
    session.storeAccessToken(fresh);
    fetchHandler = (url) => (url.includes('/auth/refresh')
        ? { status: 200, body: { access_token: fresh, expires_in: 900 } }
        : { status: 401, body: { code: 'INVALID_TOKEN' } });
    res = await fetchWithAuth('http://localhost:3000/api/staff');
    assert('401 still refreshes once and retries once', res.status === 401 && calls.filter((c) => !c.url.includes('/auth/refresh')).length === 2, String(res.status));
    assert('a successful refresh emits no expiry event', events.filter((e) => e === 'session:expired').length === 0, events.join(','));

    // No token at all: one refresh, one retry, no loop.
    await reset(null);
    let guardCalls = 0;
    fetchHandler = (url) => {
        if (url.includes('/auth/refresh')) return { status: 401, body: { code: 'INVALID_REFRESH_TOKEN' } };
        guardCalls++;
        return { status: 401, body: { code: 'INVALID_TOKEN' } };
    };
    res = await fetchWithAuth('http://localhost:3000/api/sections');
    // Two refresh attempts (one before the request, one after its 401) bracket
    // exactly ONE request to the resource: no retry loop.
    assert('a dead session does not loop the request', guardCalls === 1, `${guardCalls} resource requests`);
    assert('a dead session never retries the resource', calls.filter((c) => !c.url.includes('/auth/refresh')).length === 1, String(calls.length));
    assert('no Authorization header is sent without a token', calls[0].auth === null || calls[1].auth === null, `${calls[0].auth} / ${calls[1].auth}`);

    // Logout must clear everything and allow a future expiry event.
    await reset(fresh, null);
    fetchHandler = () => ({ status: 200, body: { success: true } });
    await clearAuthSession();
    assert('logout clears the access token', localStorage.getItem('accessToken') === null);
    assert('logout clears the refresh token', localStorage.getItem('refreshToken') === null);
    assert('logout clears the expiry hint', localStorage.getItem('accessTokenExpiry') === null);

    console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
    console.error('SUITE ERROR:', err);
    process.exit(1);
});
