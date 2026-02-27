/**
 * JWT Authentication API Client
 * Handles token inclusion, expiry, and refresh automatically
 */

interface ApiOptions extends RequestInit {
    retry?: boolean;
}

/**
 * Make authenticated API call with automatic token refresh on expiry
 */
export async function apiCall(
    endpoint: string,
    options: ApiOptions = {}
): Promise<any> {
    const { retry = true, ...fetchOptions } = options;

    // Get current access token
    let accessToken = sessionStorage.getItem('accessToken');

    // Check if token is about to expire (within 1 minute)
    const expiryTime = sessionStorage.getItem('accessTokenExpiry');
    if (expiryTime && Date.now() > parseInt(expiryTime) - 60000) {
        console.log('[JWT] Token expiring soon, refreshing...');
        accessToken = await refreshAccessToken();
        if (!accessToken) {
            // Refresh failed, redirect to login
            console.error('[JWT] Refresh failed, clearing session');
            clearAuthSession();
            throw new Error('Authentication failed');
        }
    }

    // Add authorization header if token exists
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(fetchOptions.headers as Record<string, string>)
    };

    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    // Make request
    const response = await fetch(endpoint, {
        ...fetchOptions,
        headers
    });

    // Handle token expiry (410)
    if (response.status === 410 && retry) {
        console.log('[JWT] Token expired (410), refreshing and retrying...');
        accessToken = await refreshAccessToken();

        if (accessToken) {
            // Retry with new token (disable retry to prevent infinite loop)
            return apiCall(endpoint, { ...options, retry: false });
        } else {
            clearAuthSession();
            throw new Error('Session expired');
        }
    }

    // Handle other errors
    if (response.status === 401) {
        // Invalid token
        console.error('[JWT] Unauthorized (401), clearing session');
        clearAuthSession();
        throw new Error('Invalid authentication');
    }

    if (response.status === 403) {
        throw new Error('Insufficient permissions');
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || error.error || `API Error: ${response.status}`);
    }

    return response.json();
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(): Promise<string | null> {
    const refreshToken = sessionStorage.getItem('refreshToken');

    if (!refreshToken) {
        console.error('[JWT] No refresh token available');
        return null;
    }

    try {
        const response = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken })
        });

        if (!response.ok) {
            // Refresh token invalid or expired
            console.error('[JWT] Refresh token invalid or expired');
            return null;
        }

        const { access_token, expires_in } = await response.json();

        // Store new token and expiry
        sessionStorage.setItem('accessToken', access_token);
        const expiryTime = Date.now() + (expires_in * 1000);
        sessionStorage.setItem('accessTokenExpiry', expiryTime.toString());

        console.log('[JWT] Token refreshed successfully');
        return access_token;
    } catch (error) {
        console.error('[JWT] Token refresh failed:', error);
        return null;
    }
}

/**
 * Logout and clear tokens
 */
export async function logoutJWT(): Promise<void> {
    try {
        const accessToken = sessionStorage.getItem('accessToken');
        if (accessToken) {
            // Notify server
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }).catch(() => { }); // Ignore errors
        }
    } finally {
        clearAuthSession();
    }
}

/**
 * Clear authentication session
 */
function clearAuthSession(): void {
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('accessTokenExpiry');
    localStorage.removeItem('saved_pin');
}

/**
 * Get current access token (for manual use if needed)
 */
export function getAccessToken(): string | null {
    return sessionStorage.getItem('accessToken');
}

/**
 * Check if authenticated
 */
export function isAuthenticated(): boolean {
    return !!sessionStorage.getItem('accessToken');
}

/**
 * Store JWT tokens after login
 */
export function storeTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
    sessionStorage.setItem('accessToken', accessToken);
    sessionStorage.setItem('refreshToken', refreshToken);
    const expiryTime = Date.now() + (expiresIn * 1000);
    sessionStorage.setItem('accessTokenExpiry', expiryTime.toString());
    console.log('[JWT] Tokens stored successfully');
}
