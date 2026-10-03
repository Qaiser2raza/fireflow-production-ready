/**
 * Owner session bootstrap (Task 03f).
 *
 * One place that knows how to turn a `POST /api/auth/refresh` response into a
 * live client session. The owner refresh token lives in the httpOnly
 * `ff_user_refresh` cookie, so nothing in storage proves the session exists —
 * a page reload starts with an empty access token and must silently refresh.
 *
 * Two guarantees:
 *  - SINGLE FLIGHT: a module-level promise means React StrictMode's double
 *    mount, the bootstrap effect and the auth interceptor can never send two
 *    refreshes with the same cookie (the second would look like replay and kill
 *    the whole token family).
 *  - NO RESURRECTION: `markSessionTerminated()` (logout) bumps a generation
 *    counter. A refresh that started before the logout never writes its result.
 */
const API_URL = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';

export const ACCESS_TOKEN_KEY = 'accessToken';
export const ACCESS_EXPIRY_KEY = 'accessTokenExpiry';
export const REFRESH_TOKEN_KEY = 'refreshToken';
export const STAFF_KEY = 'staff';
export const RESTAURANT_KEY = 'currentRestaurant';

export interface OwnerSessionPayload {
  access_token?: string;
  accessToken?: string;
  expires_in?: number;
  refresh_token?: string;
  staff?: Record<string, unknown> | null;
  restaurant?: Record<string, unknown> | null;
  [key: string]: unknown;
}

let inflightRefresh: Promise<OwnerSessionPayload | null> | null = null;
let sessionGeneration = 0;

/**
 * Reads the `exp` claim of an access token WITHOUT verifying the signature.
 *
 * The server is always the authority on validity; this only tells the client
 * when to stop sending a token. A token whose payload cannot be read, or that
 * carries no `exp`, is treated as unusable — never as "probably fine".
 */
export function readAccessTokenExpiry(token: string | null | undefined): number | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(normalized));
    const exp = payload?.exp;
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return null;
    return exp * 1000;
  } catch {
    return null;
  }
}

/**
 * Stores an access token with the expiry the TOKEN itself declares.
 *
 * Task 03g (P1): a token found in storage must never be re-armed to
 * "now + 15 minutes". The old code did exactly that on every mount, so an
 * already-expired JWT kept being sent and the server answered 410 forever.
 * A token with no readable `exp` is not stored at all (fail closed).
 */
export function storeAccessToken(token: string | null | undefined): boolean {
  const expiry = readAccessTokenExpiry(token);
  if (!token || expiry === null) {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(ACCESS_EXPIRY_KEY);
    return false;
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  localStorage.setItem(ACCESS_EXPIRY_KEY, String(expiry));
  return true;
}

/**
 * Returns the stored access token only while the token itself says it is alive.
 * A missing `accessTokenExpiry` is treated as expired, not as "valid forever".
 */
export function getValidAccessToken(): string | null {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token) return null;

  const tokenExpiry = readAccessTokenExpiry(token);
  if (tokenExpiry === null) return null;
  if (Date.now() >= tokenExpiry) return null;

  // A stored hint may only shorten the window, never extend it.
  const hint = localStorage.getItem(ACCESS_EXPIRY_KEY);
  if (hint) {
    const hintMs = Number(hint);
    if (Number.isFinite(hintMs) && Date.now() >= hintMs) return null;
  }
  return token;
}

function storeTokens(payload: OwnerSessionPayload): void {
  const token = payload.access_token || payload.accessToken;
  if (typeof token === 'string' && token) {
    storeAccessToken(token);
  }
  if (typeof payload.refresh_token === 'string' && payload.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, payload.refresh_token);
  }
}

/** Stores the identity half of a session response (staff + tenant). */
export function storeIdentity(payload: OwnerSessionPayload): void {
  storeTokens(payload);
  if (payload.staff) localStorage.setItem(STAFF_KEY, JSON.stringify(payload.staff));
  if (payload.restaurant) localStorage.setItem(RESTAURANT_KEY, JSON.stringify(payload.restaurant));
}

/**
 * Logout: revokes nothing here (the caller does that), but stops any in-flight
 * bootstrap from restoring the session and drops the cached single flight.
 */
export function markSessionTerminated(): void {
  sessionGeneration += 1;
  inflightRefresh = null;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(ACCESS_EXPIRY_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/** True when a stored, unexpired access token exists. */
export function hasValidAccessToken(): boolean {
  return getValidAccessToken() !== null;
}

async function performRefresh(): Promise<OwnerSessionPayload | null> {
  const generationAtStart = sessionGeneration;

  try {
    // Staff sessions still carry a body token; owner sessions rely on the cookie.
    const bodyToken = localStorage.getItem(REFRESH_TOKEN_KEY);

    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(bodyToken ? { refresh_token: bodyToken } : {}),
    });

    if (!response.ok) return null;

    const data: OwnerSessionPayload = await response.json();

    // A logout landed while this request was in flight: drop the result.
    if (sessionGeneration !== generationAtStart) return null;

    storeTokens(data);
    return data;
  } catch {
    return null;
  }
}

/**
 * Single-flight session refresh. Safe to call from anywhere: concurrent callers
 * share one HTTP request, which is what keeps replay detection quiet.
 */
export function refreshOwnerSession(): Promise<OwnerSessionPayload | null> {
  if (!inflightRefresh) {
    const pending = performRefresh().finally(() => {
      if (inflightRefresh === pending) inflightRefresh = null;
    });
    inflightRefresh = pending;
  }
  return inflightRefresh;
}
