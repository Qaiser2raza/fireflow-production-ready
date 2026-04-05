/**
 * Auth Interceptor - Handles token inclusion and refreshing for all API calls
 */

const API_URL = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(): Promise<string | null> {
  try {
    const refreshToken = localStorage.getItem('refreshToken');

    if (!refreshToken) {
      console.log('[Auth] No refresh token available');
      return null;
    }

    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });

    if (!response.ok) {
      console.error('[Auth] Refresh token invalid or expired');
      return null;
    }

    const data = await response.json();
    localStorage.setItem('accessToken', data.access_token);
    const expiryTime = Date.now() + (data.expires_in * 1000);
    localStorage.setItem('accessTokenExpiry', expiryTime.toString());
    console.log('[Auth] Token refreshed successfully');
    return data.access_token;
  } catch (err) {
    console.error('[Auth] Refresh failed:', err);
    return null;
  }
}

/**
 * Get current access token
 */
function getAccessToken(): string | null {
  const token = localStorage.getItem('accessToken');
  const expiry = localStorage.getItem('accessTokenExpiry');

  // Check if token is expired
  if (expiry && Date.now() > parseInt(expiry)) {
    console.log('[Auth] Token expired');
    return null;
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
  let response = await fetch(url, { ...options, headers });

  // If we get 401, try to refresh token and retry once
  if (response.status === 401) {
    console.log('[Auth] Got 401, attempting token refresh...');
    const newToken = await refreshAccessToken();

    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(url, { ...options, headers });
    } else {
      // Refresh failed, clear session
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('accessTokenExpiry');
      console.error('[Auth] Token refresh failed, session cleared');
    }
  }

  // Handle 410 Gone (Session Expired)
  if (response.status === 410) {
    console.error('[Auth] Session expired (410)');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('accessTokenExpiry');
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
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('accessTokenExpiry');
    localStorage.removeItem('saved_pin');
    localStorage.removeItem('restaurant_id');
    localStorage.removeItem('currentRestaurant');
  }
}
