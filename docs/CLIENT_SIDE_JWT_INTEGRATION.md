# Client-Side JWT Integration Guide

This shows how to update the React frontend to use JWT authentication.

---

## Overview

**Current Flow** (Phase 2a):
```
User → Enter PIN → /api/auth/login → Returns staff object → No tokens stored
```

**New Flow** (Phase 2b):
```
User → Enter PIN → /api/auth/login → Returns staff + tokens → Store tokens → Use in all requests
```

---

## 1. Update Login Handler

### File: `src/auth/views/LoginView.tsx`

**Current** (doesn't store tokens):
```typescript
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pin })
});

const { staff, success } = await response.json();
// ❌ Tokens not stored or used
```

**Updated** (stores and uses tokens):
```typescript
// After successful login, extract and store tokens
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pin })
});

const { staff, tokens, success } = await response.json();

if (success && tokens) {
  // ✅ Store tokens in sessionStorage
  sessionStorage.setItem('accessToken', tokens.access_token);
  sessionStorage.setItem('refreshToken', tokens.refresh_token);
  
  // Optional: Store expiry time for proactive refresh
  const expiryTime = Date.now() + (tokens.expires_in * 1000);
  sessionStorage.setItem('accessTokenExpiry', expiryTime.toString());
}
```

---

## 2. Create API Utility Functions

### File: `src/shared/lib/apiClient.ts` (NEW)

```typescript
/**
 * Centralized API client for JWT authentication
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
    console.log('Token expiring soon, refreshing...');
    accessToken = await refreshAccessToken();
    if (!accessToken) {
      // Refresh failed, redirect to login
      redirectToLogin();
      throw new Error('Authentication failed');
    }
  }

  // Add authorization header
  const headers = {
    ...fetchOptions.headers,
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };

  // Make request
  const response = await fetch(endpoint, {
    ...fetchOptions,
    headers
  });

  // Handle token expiry (410)
  if (response.status === 410 && retry) {
    console.log('Token expired, refreshing and retrying...');
    accessToken = await refreshAccessToken();
    
    if (accessToken) {
      // Retry with new token (disable retry to prevent infinite loop)
      return apiCall(endpoint, { ...options, retry: false });
    } else {
      redirectToLogin();
      throw new Error('Session expired');
    }
  }

  // Handle other errors
  if (response.status === 401) {
    // Invalid token
    redirectToLogin();
    throw new Error('Invalid authentication');
  }

  if (response.status === 403) {
    throw new Error('Insufficient permissions');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API Error: ${response.status}`);
  }

  return response.json();
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = sessionStorage.getItem('refreshToken');

  if (!refreshToken) {
    redirectToLogin();
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
      redirectToLogin();
      return null;
    }

    const { access_token, expires_in } = await response.json();

    // Store new token and expiry
    sessionStorage.setItem('accessToken', access_token);
    const expiryTime = Date.now() + (expires_in * 1000);
    sessionStorage.setItem('accessTokenExpiry', expiryTime.toString());

    return access_token;
  } catch (error) {
    console.error('Token refresh failed:', error);
    redirectToLogin();
    return null;
  }
}

/**
 * Logout and clear tokens
 */
export async function logout(): Promise<void> {
  try {
    // Notify server
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionStorage.getItem('accessToken')}`,
        'Content-Type': 'application/json'
      }
    }).catch(() => {}); // Ignore errors
  } finally {
    // Clear tokens
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('accessTokenExpiry');
    
    // Redirect to login
    redirectToLogin();
  }
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
 * Redirect to login (clear session and navigate)
 */
export function redirectToLogin(): void {
  sessionStorage.removeItem('accessToken');
  sessionStorage.removeItem('refreshToken');
  sessionStorage.removeItem('accessTokenExpiry');
  
  // Redirect to login page
  window.location.href = '/login';
}
```

---

## 3. Update Existing API Calls

### Before

All your existing fetch calls look like this:

```typescript
// src/features/orders/OrderList.tsx
const response = await fetch('/api/orders', {
  headers: { 'x-staff-id': currentUser.id }
});
```

### After

Replace with the new utility:

```typescript
// src/features/orders/OrderList.tsx
import { apiCall } from '@/shared/lib/apiClient';

const orders = await apiCall('/api/orders');
```

### Find and Replace Pattern

Search for all old-style API calls:

```bash
# Search for x-staff-id header usage
grep -r "x-staff-id" src/

# Search for basic fetch calls
grep -r "fetch('/api/" src/
```

Replace with `apiCall()`:

```typescript
// BEFORE
const response = await fetch('/api/endpoint', {
  method: 'POST',
  headers: { 'x-staff-id': staffId },
  body: JSON.stringify(data)
});

// AFTER
const result = await apiCall('/api/endpoint', {
  method: 'POST',
  body: JSON.stringify(data)
});
```

---

## 4. Update Socket.IO Connection (if applicable)

### File: `src/shared/lib/socketClient.ts`

**Before** (sends x-staff-id):
```typescript
const socket = io('http://localhost:3000', {
  extraHeaders: {
    'x-staff-id': currentUser.id
  }
});
```

**After** (sends JWT):
```typescript
import { getAccessToken } from './apiClient';

const socket = io('http://localhost:3000', {
  extraHeaders: {
    'Authorization': `Bearer ${getAccessToken()}`
  },
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
});
```

---

## 5. Update Context/State Management

### File: `src/client/context/AppContext.tsx`

**Update login handler**:

```typescript
// In your login handler or useCallback
const handleLogin = async (pin: string) => {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });

    const { success, staff, tokens } = await response.json();

    if (success) {
      // ✅ Store tokens
      sessionStorage.setItem('accessToken', tokens.access_token);
      sessionStorage.setItem('refreshToken', tokens.refresh_token);
      const expiryTime = Date.now() + (tokens.expires_in * 1000);
      sessionStorage.setItem('accessTokenExpiry', expiryTime.toString());

      // Update app state
      setCurrentUser(staff);
      setIsAuthenticated(true);
    }
  } catch (error) {
    console.error('Login failed:', error);
    setLoginError(error.message);
  }
};
```

**Add logout handler**:

```typescript
import { logout } from '@/shared/lib/apiClient';

const handleLogout = async () => {
  await logout();
  setCurrentUser(null);
  setIsAuthenticated(false);
};
```

---

## 6. Protected Route Component

### File: `src/client/components/ProtectedRoute.tsx` (NEW)

```typescript
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { isAuthenticated } from '@/shared/lib/apiClient';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login');
    }
  }, [navigate]);

  if (!isAuthenticated()) {
    return null;
  }

  return <>{children}</>;
}
```

**Usage**:

```typescript
// In your router
import { ProtectedRoute } from '@/client/components/ProtectedRoute';

<Routes>
  <Route path="/login" element={<LoginView />} />
  <Route
    path="/dashboard"
    element={
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    }
  />
</Routes>
```

---

## 7. Example: Update Orders Component

### Before

```typescript
// src/features/orders/Orders.tsx
export function Orders() {
  const [orders, setOrders] = React.useState([]);

  React.useEffect(() => {
    const fetchOrders = async () => {
      const response = await fetch('/api/orders', {
        headers: { 'x-staff-id': currentUser.id }  // ❌ Old way
      });
      const data = await response.json();
      setOrders(data);
    };
    fetchOrders();
  }, []);

  return <OrderList orders={orders} />;
}
```

### After

```typescript
// src/features/orders/Orders.tsx
import { apiCall } from '@/shared/lib/apiClient';

export function Orders() {
  const [orders, setOrders] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true);
        // ✅ New way - JWT automatic
        const data = await apiCall('/api/orders');
        setOrders(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch');
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return <OrderList orders={orders} />;
}
```

---

## 8. Error Boundaries

### File: `src/client/components/ErrorBoundary.tsx`

```typescript
import React from 'react';
import { redirectToLogin } from '@/shared/lib/apiClient';

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('Error caught:', error);
    
    // Check if auth-related error
    if (error.message.includes('Authentication')) {
      redirectToLogin();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-red-600">
          <h1>Something went wrong</h1>
          <button onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

---

## 9. Testing the Integration

### Manual Testing Checklist

- [ ] Login with PIN → tokens stored in sessionStorage
- [ ] API call includes Authorization header
- [ ] Can call /api/orders successfully
- [ ] Wait 15+ minutes → token expires → automatic refresh
- [ ] Manual logout → tokens cleared → redirected to login
- [ ] Open DevTools Network → see "Authorization: Bearer ..."
- [ ] Invalid token → 401 → redirected to login
- [ ] Wrong role → 403 → error message shown

### Test Script

```typescript
// Run in browser console after login
console.log('Access Token:', sessionStorage.getItem('accessToken'));
console.log('Refresh Token:', sessionStorage.getItem('refreshToken'));

// Try API call
fetch('/api/orders', {
  headers: { 'Authorization': `Bearer ${sessionStorage.getItem('accessToken')}` }
})
  .then(r => r.json())
  .then(d => console.log('Orders:', d));
```

---

## 10. TypeScript Types (Optional)

### File: `src/shared/types/auth.ts`

```typescript
export interface LoginResponse {
  success: boolean;
  staff: StaffUser;
  tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number; // seconds
  };
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: 'manager' | 'waiter' | 'super_admin';
  restaurant_id: string;
}

export interface RefreshResponse {
  access_token: string;
  expires_in: number;
}

export interface JwtPayload {
  staffId: string;
  restaurantId: string;
  role: string;
  type: 'access' | 'refresh';
  iat: number; // issued at
  exp: number; // expiration
  jti: string; // jwt id
}
```

---

## Migration Checklist

### Phase 1: Add API Client (Non-breaking)

- [ ] Create `src/shared/lib/apiClient.ts`
- [ ] Update `LoginView.tsx` to store tokens
- [ ] Test login and token storage

### Phase 2: Update Components

- [ ] Update Orders component to use `apiCall()`
- [ ] Update Menu component to use `apiCall()`
- [ ] Update Staff component to use `apiCall()`
- [ ] Update all other data-fetching components

### Phase 3: Socket.IO

- [ ] Update Socket.IO connection to use JWT
- [ ] Test real-time updates still work

### Phase 4: Remove Old Headers

- [ ] Search for all `x-staff-id` usage
- [ ] Remove from fetch calls
- [ ] Verify no regressions

### Phase 5: Testing

- [ ] Test all protected routes
- [ ] Test token expiry and refresh
- [ ] Test error handling (401, 403, 410)
- [ ] Test logout
- [ ] Load test with multiple concurrent requests

---

## Common Issues

### Issue: "Authorization header missing"

**Cause**: `apiCall()` not used, or token not stored

**Fix**: 
```typescript
// Make sure to use apiCall
const data = await apiCall('/api/endpoint');

// Check token exists
console.log(sessionStorage.getItem('accessToken'));
```

### Issue: "Token refresh failing"

**Cause**: Refresh token expired (7 days), or invalid

**Fix**: User must log in again to get new refresh token

### Issue: "Infinite redirect loop"

**Cause**: `redirectToLogin()` called during login attempt

**Fix**: Don't wrap login form in `ProtectedRoute`

```typescript
<Routes>
  <Route path="/login" element={<LoginView />} /> {/* Unprotected */}
  <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
</Routes>
```

---

## Summary

**Files to Create/Modify**:
1. ✅ Create `src/shared/lib/apiClient.ts` - Central API handler
2. ✅ Modify `src/auth/views/LoginView.tsx` - Store tokens on login
3. ✅ Modify all data-fetching components - Use `apiCall()`
4. ✅ Create `src/client/components/ProtectedRoute.tsx` - Route protection
5. ✅ Update `src/shared/lib/socketClient.ts` - JWT in Socket.IO

**Testing**: 
- Login flow
- Token storage
- API requests with JWT
- Token refresh on expiry
- Error handling
- Logout

**Result**: 🟢 Secure, production-ready JWT authentication

---

**Implementation by**: Ralf  
**Date**: Jan 20, 2026
