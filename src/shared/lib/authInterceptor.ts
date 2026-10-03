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

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

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

  let response = await fetch(url, { ...options, headers });

  // If we get 401, refresh once and retry the request exactly once.
  if (response.status === 401) {
    console.log('[Auth] Got 401, attempting token refresh...');
    const newToken = await refreshAccessToken();

    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(url, { ...options, headers });
    } else {
      // Refresh failed: end the session and stop any in-flight bootstrap.
      markSessionTerminated();
      console.error('[Auth] Token refresh failed, session cleared');
    }
  }

  // Handle 410 Gone (Session Expired)
  if (response.status === 410) {
    console.error('[Auth] Session expired (410)');
    markSessionTerminated();
    window.dispatchEvent(new CustomEvent('session:expired'));
    return response;
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
    localStorage.removeItem('restaurant_id');
    localStorage.removeItem('currentRestaurant');
  }
}
