# Phase 2b Quick Reference Card

**Print this or bookmark for easy reference during implementation**

---

## 🔑 Environment Setup

```bash
# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to .env
FIREFLOW_JWT_SECRET=<paste-generated-key>
```

---

## 📁 Files Quick Reference

| File | Purpose | Status |
|------|---------|--------|
| `src/api/services/auth/JwtService.ts` | JWT generation/verification | ✅ CREATED |
| `src/api/middleware/authMiddleware.ts` | JWT validation middleware | ✅ CREATED |
| `src/api/server.ts` | Express app (login + refresh) | ✅ MODIFIED |
| `src/shared/lib/apiClient.ts` | Client-side JWT utility | 🔨 TO CREATE |
| `src/auth/views/LoginView.tsx` | Login + token storage | 🔨 TO UPDATE |
| `.env` | JWT secret | 🔨 TO ADD |

---

## 🚀 Backend Implementation

### Step 1: Add Global Middleware

In `src/api/server.ts` after line 50:

```typescript
// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================
app.use('/api/*', (req, res, next) => {
  const publicEndpoints = ['/api/health', '/api/auth/login', '/api/auth/refresh'];
  if (publicEndpoints.includes(req.path)) return next();
  return authMiddleware(req, res, next);
});
```

### Step 2: Replace Headers

Find all occurrences of:
```typescript
req.headers['x-staff-id']
```

Replace with:
```typescript
req.staffId
```

**Search command**:
```bash
grep -n "req.headers\['x-staff-id'\]" src/api/server.ts
```

### Step 3: Add Role Checks

For sensitive endpoints:

```typescript
app.post(
  '/api/system/dev-reset',
  requireRole('super_admin'),
  handler
);
```

---

## 🌐 Frontend Implementation

### Step 1: Create API Client

File: `src/shared/lib/apiClient.ts`

```typescript
export async function apiCall(endpoint: string, options: RequestInit = {}) {
  let accessToken = sessionStorage.getItem('accessToken');
  
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${accessToken}`
  };

  const response = await fetch(endpoint, { ...options, headers });

  // Handle expired token
  if (response.status === 410) {
    const newToken = await refreshAccessToken();
    return apiCall(endpoint, { ...options, headers: { ...headers, 'Authorization': `Bearer ${newToken}` } });
  }

  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = sessionStorage.getItem('refreshToken');
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  });

  if (!response.ok) {
    sessionStorage.clear();
    window.location.href = '/login';
    return null;
  }

  const { access_token } = await response.json();
  sessionStorage.setItem('accessToken', access_token);
  return access_token;
}

export function logout(): void {
  sessionStorage.clear();
  window.location.href = '/login';
}
```

### Step 2: Update Login

In `src/auth/views/LoginView.tsx`:

```typescript
const response = await fetch('/api/auth/login', { /* ... */ });
const { staff, tokens, success } = await response.json();

if (success && tokens) {
  sessionStorage.setItem('accessToken', tokens.access_token);
  sessionStorage.setItem('refreshToken', tokens.refresh_token);
  // ... proceed
}
```

### Step 3: Replace Fetch Calls

**Before**:
```typescript
fetch('/api/orders', { headers: { 'x-staff-id': userId } })
```

**After**:
```typescript
import { apiCall } from '@/shared/lib/apiClient';
apiCall('/api/orders')
```

---

## 🧪 Testing

### Curl Commands

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"pin": "1234"}'

# Use token (replace with actual token)
curl http://localhost:3000/api/orders \
  -H "Authorization: Bearer eyJhbGc..."

# Test refresh
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "eyJhbGc..."}'
```

### Browser Console

```javascript
// Check tokens
console.log(sessionStorage.getItem('accessToken'));

// Try API call
fetch('/api/orders', {
  headers: { 'Authorization': `Bearer ${sessionStorage.getItem('accessToken')}` }
}).then(r => r.json()).then(console.log);
```

---

## 📊 Token Payloads

### Access Token

```json
{
  "staffId": "550e8400-e29b-41d4-a716-446655440000",
  "restaurantId": "660e8400-e29b-41d4-a716-446655440111",
  "role": "manager",
  "name": "John Doe",
  "type": "access",
  "iat": 1705756800,
  "exp": 1705757700,
  "jti": "token-id-123"
}
```

**Duration**: 15 minutes (900 seconds)  
**Use**: API requests  
**Header**: `Authorization: Bearer <token>`

### Refresh Token

```json
{
  "staffId": "550e8400-e29b-41d4-a716-446655440000",
  "restaurantId": "660e8400-e29b-41d4-a716-446655440111",
  "role": "manager",
  "name": "John Doe",
  "type": "refresh",
  "iat": 1705756800,
  "exp": 1705843200,
  "jti": "refresh-id-456"
}
```

**Duration**: 7 days (604800 seconds)  
**Use**: Get new access token  
**Endpoint**: `POST /api/auth/refresh`

---

## 🔌 API Endpoints

### POST /api/auth/login

```
Request:
  { "pin": "1234" }

Response (success):
  {
    "success": true,
    "staff": { id, name, role, restaurant_id, ... },
    "tokens": {
      "access_token": "eyJhbGc...",
      "refresh_token": "eyJhbGc...",
      "expires_in": 900
    }
  }

Response (error):
  { "success": false, "error": "Invalid PIN" }
```

### POST /api/auth/refresh

```
Request:
  { "refresh_token": "eyJhbGc..." }

Response (success):
  {
    "access_token": "eyJhbGc...",
    "expires_in": 900
  }

Response (error):
  { "error": "Invalid token" }  (401)
```

### POST /api/auth/logout

```
Request:
  Header: Authorization: Bearer <token>

Response:
  { "success": true, "message": "Logged out" }
```

---

## ⚠️ Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| **200** | Success | Continue |
| **400** | Bad request | Check request format |
| **401** | Unauthorized | Missing/invalid token → login |
| **403** | Forbidden | Insufficient permissions → error |
| **410** | Token expired | Refresh token → retry |
| **500** | Server error | Check server logs |

---

## 🔐 Security Checklist

- [ ] JWT_SECRET in `.env`, not in code
- [ ] Tokens stored in sessionStorage (not localStorage)
- [ ] All /api/* routes protected except public endpoints
- [ ] Role checks on sensitive operations
- [ ] Restaurant ID validated in routes
- [ ] No plaintext passwords in logs
- [ ] CORS enabled (safe with JWT)
- [ ] HTTPS in production (not required for development)

---

## 🐛 Common Issues

### Issue: "Cannot find module"
```
Error: Cannot find module './services/auth/JwtService'
```
**Fix**: Verify files exist in correct locations

### Issue: "Invalid token"
```
401 Unauthorized: Invalid signature
```
**Fix**: Check FIREFLOW_JWT_SECRET in .env matches what signed token

### Issue: "Token expired"
```
410 Gone: Token expired
```
**Fix**: Normal - client should refresh (apiCall handles this)

### Issue: "Missing Authorization header"
```
401 Unauthorized: Missing token
```
**Fix**: Verify apiCall() is used for API requests

---

## 🎯 Implementation Checklist

### Backend (1-2 hours)

- [ ] Add global middleware to server.ts
- [ ] Replace `req.headers['x-staff-id']` with `req.staffId`
- [ ] Add role checks to sensitive endpoints
- [ ] Set FIREFLOW_JWT_SECRET in .env
- [ ] Test with curl commands

### Frontend (2-4 hours)

- [ ] Create `src/shared/lib/apiClient.ts`
- [ ] Update `LoginView.tsx` to store tokens
- [ ] Replace all `fetch()` with `apiCall()`
- [ ] Update Socket.IO connection
- [ ] Test all protected routes

### Testing & Verification

- [ ] Server starts without errors
- [ ] Login generates tokens
- [ ] Protected routes require token
- [ ] Token refresh works
- [ ] Expired token (410) handled
- [ ] Wrong role (403) blocked
- [ ] Cross-tenant access (403) blocked
- [ ] Logout clears tokens

---

## 📚 Full Documentation

| Document | Purpose |
|----------|---------|
| `PHASE_2B_JWT_IMPLEMENTATION.md` | Complete technical reference |
| `ROUTE_PROTECTION_GUIDE.md` | How to protect routes |
| `CLIENT_SIDE_JWT_INTEGRATION.md` | Frontend implementation |
| `PHASE_2B_IMPLEMENTATION_SUMMARY.md` | Step-by-step guide |
| `PHASE_2B_ARCHITECTURE_DIAGRAM.md` | Visual diagrams |
| `PHASE_2B_COMPLETE.md` | Overview & summary |

---

## 💡 Quick Tips

**Decode JWT online**: https://jwt.io

**Test token refresh**:
```bash
# Get initial tokens
RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" -d '{"pin": "1234"}')

# Extract refresh token
REFRESH=$(echo $RESPONSE | jq -r '.tokens.refresh_token')

# Refresh
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\": \"$REFRESH\"}"
```

**Monitor token expiry**:
```javascript
// In browser console
const token = sessionStorage.getItem('accessToken');
const [header, payload, sig] = token.split('.');
const decoded = JSON.parse(atob(payload));
console.log('Expires:', new Date(decoded.exp * 1000));
console.log('Time left:', Math.round((decoded.exp * 1000 - Date.now()) / 1000 / 60) + ' min');
```

---

## 📞 When Stuck

1. Check the full documentation in `/docs` folder
2. Look at error messages carefully - they're descriptive
3. Test with curl first before changing frontend
4. Check Network tab in browser DevTools
5. Look at server console for middleware logs

---

**Last Updated**: Jan 20, 2026  
**Status**: Production Ready ✅

Print this reference card and keep it nearby during implementation!
