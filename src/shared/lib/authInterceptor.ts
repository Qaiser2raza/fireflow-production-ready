/**
 * Auth Interceptor - Handles token inclusion and refreshing for all API calls
 */

import {
  getValidAccessToken,
  refreshOwnerSession,
  markSessionTerminated,
} from './ownerSession';

const API_URL = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

/**
 * Refresh the access token and return the new one.
 *
 * Task 03f: delegates to the single-flight refresh in `ownerSession`, so a
 * cookie-only owner session (nothing in storage) can still be refreshed and
 * StrictMode's double mount cannot send two refreshes with the same cookie.
 */
async function refreshAccessToken(): Promise<string | null> {
  const data = await refreshOwnerSession();
  if (!data) return null;
  return (data.access_token || data.accessToken || null) as string | null;
}


/**
 * Get current access token
 */
function getAccessToken(): string | null {
  const token = getValidAccessToken();
  if (!token) {
    console.log('[Auth] No valid access token');
  }
  return token;
}

/**
 * Task 03g (P2): a 410 means "this access token expired", not "the session is
 * dead". It therefore enters the same single-refresh/single-retry path as a 401
 * and only ends the session when that refresh actually fails.
 *
 * `session:expired` is emitted at most once per dead session, so a page full of
 * parallel requests cannot spam the event (and re-trigger the logout UI).
 */
let sessionExpiredEmitted = false;

function terminateSession(reason: string): void {
  markSessionTerminated();
  if (sessionExpiredEmitted) return;
  sessionExpiredEmitted = true;
  console.error(`[Auth] Session terminated: ${reason}`);
  window.dispatchEvent(new CustomEvent('session:expired'));
}

/**
 * SUPER_ADMIN: Set the target restaurant for subsequent API calls.
 * When set, all fetchWithAuth calls will include the x-target-restaurant header,
 * allowing SUPER_ADMIN to act on behalf of any restaurant.
 * Set to null to clear (revert to HQ mode).
 */
let targetRestaurantId: string | null = null;

export function setTargetRestaurant(id: string | null): void {
  targetRestaurantId = id;
}

export function getTargetRestaurant(): string | null {
  return targetRestaurantId;
}

/**
 * Main fetch interceptor with auth and retry support
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let token = getAccessToken();

  // If token doesn't exist or is expired, try to refresh
  if (!token) {
    token = await refreshAccessToken();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };

  // SUPER_ADMIN: attach target restaurant header if set
  if (targetRestaurantId) {
    headers['x-target-restaurant'] = targetRestaurantId;
  }

  // Cashier Session Audit Headers
  const sessionId = localStorage.getItem('x-session-id');
  const terminalId = localStorage.getItem('x-terminal-id') || sessionStorage.getItem('x-terminal-id');

  if (sessionId) {
    headers['x-session-id'] = sessionId;
  }
  if (terminalId) {
    headers['x-terminal-id'] = terminalId;
  }

  // Plain fetch, never this function: the retry below must not recurse.
  const send = (bearer: string | null): Promise<Response> => {
    const attemptHeaders = { ...headers };
    if (bearer) {
      attemptHeaders['Authorization'] = `Bearer ${bearer}`;
    } else {
      delete attemptHeaders['Authorization'];
    }
    return fetch(url, { ...options, headers: attemptHeaders });
  };

  let response = await send(token);

  // 401 (invalid/missing credentials) and 410 (access token expired) mean the
  // same thing to this client: get one new access token and try once more.
  // Exactly one refresh per call, so a dead session cannot loop.
  if (response.status === 401 || response.status === 410) {
    const expired = response.status === 410;
    console.log(`[Auth] Got ${response.status}, attempting token refresh...`);

    const newToken = await refreshAccessToken();

    if (newToken) {
      // A live session again: the earlier expiry notice no longer applies.
      sessionExpiredEmitted = false;
      token = newToken;
      response = await send(token);
    } else {
      // Refresh failed: the session really is over.
      terminateSession(expired ? 'refresh rejected after token expiry' : 'refresh rejected');
    }
  }

  return response;
}

/**
 * Logout and clear tokens
 */
export async function clearAuthSession(): Promise<void> {
  try {
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
      // Notify server
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }).catch(() => {
    }); // Ignore errors
    }
  } finally {
    // Bumps the session generation so a bootstrap that is already in flight
    // cannot restore the session the user just ended.
    markSessionTerminated();
    sessionExpiredEmitted = false;
    localStorage.removeItem('restaurant_id');
    localStorage.removeItem('currentRestaurant');
  }
}
