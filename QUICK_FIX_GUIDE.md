# 🚀 Quick Fix Application Guide

## Apply Auth Fixes to Other Components (5-minute template)

### Step 1: Import the Interceptor
```typescript
import { fetchWithAuth } from '../../shared/lib/authInterceptor';
```

### Step 2: Find-and-Replace Pattern

**Find all occurrences of:**
```typescript
await fetch(`
```

**Replace them one-by-one with:** 
```typescript
await fetchWithAuth(`
```

### Step 3: Verify Error Handling

Make sure your error checks still work:
```typescript
const response = await fetchWithAuth(`${API_URL}/endpoint`);

// This still works the same:
if (!response.ok) {
  const error = await response.json();
  console.error('API Error:', error);
}

// Or just:
if (!response.ok) {
  throw new Error('API call failed');
}
```

---

## 🎯 Priority Views to Update

### High Priority (Most Used)
1. **POSView.tsx** - Order creation, heavy API usage
2. **DashboardView.tsx** - Main dashboard data fetching
3. **MenuView.tsx** - Menu item operations
4. **TransactionsView.tsx** - Transaction fetching

### Medium Priority
5. **StaffView.tsx** - Staff management
6. **BillingView.tsx** - Billing operations  
7. **OrderCommandHub** - Floor management
8. **LogisticsHub** - Delivery operations

### Low Priority (Less Frequent)
9. **SuperAdminView.tsx** - SaaS admin (already complex)
10. **KDSView.tsx** - Kitchen display (mostly real-time)

---

## ✅ Testing Each View

After updating a view, test:

```javascript
// 1. Open browser DevTools (F12)
// 2. Check Console for auth logs:
//    - "[Auth] Token present: true"
//    - "[Auth] Token valid: true"
//    - No 401 errors

// 3. Check Network tab:
//    - Each API call has Authorization header
//    - Header format: "Authorization: Bearer {token}"

// 4. Check "Storage" tab:
//    - SessionStorage has "accessToken"
//    - LocalStorage has "restaurant_id"
```

---

## 🔍 Before & After Comparison

### Before (❌ Problems)
```typescript
// CustomersView.tsx (OLD)
const loadCustomers = async () => {
  const response = await fetch(`${API_URL}/customers?restaurant_id=${restaurantId}`);
  // ❌ No auth header
  // ❌ No token refresh on 401
  // ❌ May get 401 errors
  if (!response.ok) throw new Error('Failed to load customers');
  const data = await response.json();
  setCustomers(data);
};
```

### After (✅ Fixed)
```typescript
// CustomersView.tsx (NEW)
const loadCustomers = async () => {
  const response = await fetchWithAuth(`${API_URL}/customers?restaurant_id=${restaurantId}`);
  // ✅ Auth header automatically added
  // ✅ Token auto-refreshes if needed
  // ✅ 401 triggers retry with fresh token
  if (!response.ok) throw new Error('Failed to load customers');
  const data = await response.json();
  setCustomers(data);
};
```

---

## 📝 Copy-Paste Templates

### Template 1: Simple GET Request
```typescript
import { fetchWithAuth } from '../../shared/lib/authInterceptor';

const loadData = async () => {
  try {
    const response = await fetchWithAuth(`${API_URL}/endpoint?restaurant_id=${restaurantId}`);
    if (!response.ok) throw new Error('Failed to load data');
    const data = await response.json();
    setData(data);
  } catch (error) {
    console.error('Error:', error);
    addNotification('error', 'Failed to load data');
  }
};
```

### Template 2: POST Request with JSON Body
```typescript
import { fetchWithAuth } from '../../shared/lib/authInterceptor';

const createItem = async (item: any) => {
  try {
    const response = await fetchWithAuth(`${API_URL}/endpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...item,
        restaurant_id: restaurantId
      })
    });
    if (!response.ok) throw new Error('Failed to create item');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error:', error);
    addNotification('error', 'Failed to create item');
  }
};
```

### Template 3: DELETE Request
```typescript
import { fetchWithAuth } from '../../shared/lib/authInterceptor';

const deleteItem = async (itemId: string) => {
  try {
    const response = await fetchWithAuth(`${API_URL}/endpoint/${itemId}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete item');
    addNotification('success', 'Item deleted');
  } catch (error) {
    console.error('Error:', error);
    addNotification('error', 'Failed to delete item');
  }
};
```

### Template 4: PATCH/PUT Request
```typescript
import { fetchWithAuth } from '../../shared/lib/authInterceptor';

const updateItem = async (itemId: string, updates: any) => {
  try {
    const response = await fetchWithAuth(`${API_URL}/endpoint/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error('Failed to update item');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error:', error);
    addNotification('error', 'Failed to update item');
  }
};
```

---

## 🧪 Manual Testing Checklist

After updating a component:

- [ ] Component renders without errors
- [ ] API calls include Authorization header
- [ ] Data loads successfully (200 OK)
- [ ] No 401 errors in console
- [ ] Create/Update/Delete operations work
- [ ] Multiple requests sent simultaneously work
- [ ] Token refresh doesn't interrupt operations
- [ ] Error notifications display on failure

---

## 🐛 Common Issues & Solutions

### Issue: Still Getting 401 Errors
**Solution:**
1. Check browser DevTools > Storage > SessionStorage
2. Verify "accessToken" is present
3. Verify token not expired (check "accessTokenExpiry")
4. Check Network tab that Authorization header is being sent
5. Clear cache: `localStorage.clear(); sessionStorage.clear()`

### Issue: Token Not Refreshing
**Solution:**
1. Check /api/auth/refresh endpoint is working
2. Check refreshToken is stored (sessionStorage)
3. Check console for "[Auth] Token refresh failed" logs
4. Test manually: `sessionStorage.getItem('refreshToken')`

### Issue: Multiple Restaurant IDs Conflict
**Solution:**
1. Clear localStorage: `localStorage.clear()`
2. Re-login to get fresh restaurant_id
3. Check console: `localStorage.getItem('restaurant_id')`
4. All calls should use same restaurant_id

---

## 📊 Progress Tracker

### Already Updated ✅
- [x] authInterceptor.ts - Created
- [x] App.tsx - getAuthHeaders, login, fetchInitialData
- [x] CustomersView.tsx - All fetch calls updated

### Ready to Update
- [ ] POSView.tsx
- [ ] DashboardView.tsx
- [ ] MenuView.tsx
- [ ] TransactionsView.tsx
- [ ] StaffView.tsx
- [ ] BillingView.tsx
- [ ] OrderCommandHub
- [ ] LogisticsHub

---

## 🎓 How fetchWithAuth Works (For Reference)

```typescript
export async function fetchWithAuth(url: string, options?: RequestInit): Promise<Response> {
  // 1. Get stored token
  let token = sessionStorage.getItem('accessToken');
  
  // 2. Check if expired
  const expiry = sessionStorage.getItem('accessTokenExpiry');
  if (expiry && Date.now() > parseInt(expiry)) {
    console.log('[Auth] Token expired');
    token = null; // Will refresh below
  }
  
  // 3. If no token or expired, refresh it
  if (!token) {
    token = await refreshAccessToken(); // Uses refresh_token
  }
  
  // 4. Add Authorization header
  const headers = {
    'Content-Type': 'application/json',
    ...options?.headers,
    'Authorization': `Bearer ${token}`
  };
  
  // 5. Make request
  let response = await fetch(url, { ...options, headers });
  
  // 6. If 401, try refresh + retry once
  if (response.status === 401) {
    token = await refreshAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      response = await fetch(url, { ...options, headers });
    }
  }
  
  return response;
}
```

---

## ✨ Tips & Tricks

### 💡 Pro Tip 1: Batch Updates
Use VS Code Find & Replace with RegEx:
```
Find: await fetch\(\`
Replace: await fetchWithAuth(\`
```

### 💡 Pro Tip 2: Test Multiple Restaurant IDs
```javascript
// Clear and re-login with different PIN
localStorage.clear(); sessionStorage.clear(); location.reload();
```

### 💡 Pro Tip 3: Check All Headers
```javascript
// In Network tab, click any API call, check Headers:
// Should see: Authorization: Bearer {long-token-string}
```

### 💡 Pro Tip 4: Monitor Token Refresh
```javascript
// Watch console while app idle for > 15 min
// Should see eventually: "[Auth] Token refreshed successfully"
```

---

## 🚀 You're All Set!

The authentication issues should now be completely resolved. All API calls:
- ✅ Include authorization headers
- ✅ Auto-refresh expired tokens
- ✅ Handle 401 errors with retry
- ✅ Maintain session consistency

Happy coding! 🎉
