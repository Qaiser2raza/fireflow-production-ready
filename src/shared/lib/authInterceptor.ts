/**
 * Auth Interceptor - Handles token inclusion and refreshing for all API calls
 */

const API_URL = 'http://localhost:3001/api';

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(): Promise<string | null> {
  try {
    const refreshToken = sessionStorage.getItem('refreshToken');

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
    sessionStorage.setItem('accessToken', data.access_token);
    const expiryTime = Date.now() + (data.expires_in * 1000);
    sessionStorage.setItem('accessTokenExpiry', expiryTime.toString());
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
  const token = sessionStorage.getItem('accessToken');
  const expiry = sessionStorage.getItem('accessTokenExpiry');

  // Check if token is expired
  if (expiry && Date.now() > parseInt(expiry)) {
    console.log('[Auth] Token expired');
    return null;
  }

  return token;
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

  console.log('[Auth] Token present:', !!token);

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
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('refreshToken');
      sessionStorage.removeItem('accessTokenExpiry');
      console.error('[Auth] Token refresh failed, session cleared');
    }
  }

  return response;
}

/**
 * Logout and clear tokens
 */
export async function clearAuthSession(): Promise<void> {
  try {
    const accessToken = sessionStorage.getItem('accessToken');
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
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('accessTokenExpiry');
    localStorage.removeItem('saved_pin');
    localStorage.removeItem('restaurant_id');
    localStorage.removeItem('currentRestaurant');
  }
}
