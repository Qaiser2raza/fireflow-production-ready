# Route Protection Implementation - Step by Step

This shows exactly how to protect all routes in `src/api/server.ts` with JWT authentication.

## Strategy Overview

There are **three approaches** depending on your needs:

### Approach 1: Protect Everything at Once (RECOMMENDED)

```typescript
// Add RIGHT AFTER middleware setup (line ~50 in server.ts)
// This protects ALL /api/* routes except health check

app.use(cors());
app.use(express.json());

// ... logging middleware ...

// ⭐ ADD THIS LINE - Protects all /api/* routes
app.use('/api/*', (req, res, next) => {
  // Allow unauthenticated access to specific endpoints
  if (req.path === '/api/health' || 
      req.path === '/api/auth/login' || 
      req.path === '/api/auth/refresh') {
    return next();
  }
  // Protect everything else
  return authMiddleware(req, res, next);
});
```

### Approach 2: Selective Protection (IF you need some public endpoints)

For each route that needs auth, add the middleware:

```typescript
// Protected: Requires authentication
app.get('/api/staff/me', authMiddleware, async (req, res) => {
  res.json({ staffId: req.staffId, restaurantId: req.restaurantId });
});

// Protected: Requires manager role
app.post('/api/staff', authMiddleware, requireRole('manager'), async (req, res) => {
  // Only managers can create staff
});

// Public: No authentication required
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});
```

### Approach 3: Group Protection (IF you have multiple routes)

```typescript
// Create router for protected routes
const protectedRouter = express.Router();

// All routes added to this router are protected
protectedRouter.post('/orders', async (req, res) => { /* ... */ });
protectedRouter.get('/orders/:id', async (req, res) => { /* ... */ });
protectedRouter.patch('/orders/:id', async (req, res) => { /* ... */ });

// Protect the entire router
app.use('/api', authMiddleware, protectedRouter);

// Public routes stay on main app
app.post('/api/auth/login', async (req, res) => { /* ... */ });
app.get('/api/health', (req, res) => { /* ... */ });
```

---

## Recommended Implementation for Fireflow

Based on your current routes, **Approach 1** is best. Add this middleware in `src/api/server.ts`:

```typescript
// ==========================================
// AUTHENTICATION MIDDLEWARE - APPLY TO ALL /api/*
// ==========================================
// This middleware allows:
// - /api/health (no auth)
// - /api/auth/login (no auth)
// - /api/auth/refresh (no auth)
// - /api/pairing/generate (already has rate limiting)
// - /api/pairing/verify (already has rate limiting)
// - All other /api/* routes (REQUIRE authentication)

app.use('/api/*', (req, res, next) => {
  // Unauthenticated endpoints - skip JWT check
  const publicEndpoints = [
    '/api/health',
    '/api/auth/login',
    '/api/auth/refresh'
  ];
  
  if (publicEndpoints.includes(req.path)) {
    return next();
  }
  
  // All other endpoints require JWT
  return authMiddleware(req, res, next);
});
```

---

## Protected Endpoints Details

### 1. Operations Configuration

**Current** (uses x-staff-id):
```typescript
app.get('/api/operations/config/:restaurantId', async (req, res) => {
  const restaurantId = req.headers['x-staff-id']; // ❌ WRONG
```

**After** (uses JWT):
```typescript
app.get('/api/operations/config/:restaurantId', async (req, res) => {
  const restaurantId = req.restaurantId; // ✅ FROM JWT
  
  // Verify user belongs to this restaurant
  if (req.restaurantId !== req.params.restaurantId) {
    return res.status(403).json({ error: 'Access denied' });
  }
```

### 2. Orders Management

**Current**:
```typescript
app.post('/api/orders/upsert', async (req, res) => {
  const staffId = req.headers['x-staff-id']; // ❌ WRONG
```

**After**:
```typescript
app.post('/api/orders/upsert', async (req, res) => {
  const staffId = req.staffId; // ✅ FROM JWT
  const restaurantId = req.restaurantId; // ✅ FROM JWT
  
  // staffId is now verified by authMiddleware
```

### 3. Menu Management

**Current**:
```typescript
app.get('/api/menu_items', async (req, res) => {
  // No authentication
```

**After** (if you want to protect):
```typescript
app.get('/api/menu_items', async (req, res) => {
  // Automatically protected by global middleware
  // req.staffId available if needed for filtering
```

### 4. Device Pairing

**Current** (has rate limiting, no auth):
```typescript
app.post('/api/pairing/generate', pairingGenerateLimiter, async (req, res) => {
  // Generate code - typically done by manager
```

**Option A: Keep as public** (current approach):
```typescript
app.post('/api/pairing/generate', pairingGenerateLimiter, async (req, res) => {
  // Client can call without authentication
  // Code expires in 5 minutes anyway
```

**Option B: Require manager role**:
```typescript
app.post(
  '/api/pairing/generate',
  pairingGenerateLimiter,
  authMiddleware,
  requireRole('manager'), // Only managers can generate codes
  async (req, res) => {
    // Manager-only endpoint
```

### 5. List Paired Devices

**Current**:
```typescript
app.get('/api/pairing/devices', async (req, res) => {
  // Anyone can see devices
```

**After** (require manager):
```typescript
app.get('/api/pairing/devices', authMiddleware, requireRole('manager'), async (req, res) => {
  // Only managers can see devices for their restaurant
  const devices = await prisma.registered_devices.findMany({
    where: { restaurant_id: req.restaurantId }
  });
  res.json(devices);
```

### 6. Admin Operations

**Current** (unprotected):
```typescript
app.post('/api/system/dev-reset', async (req, res) => {
  // ❌ DANGEROUS - anyone can reset
```

**After** (protect with super_admin):
```typescript
app.post(
  '/api/system/dev-reset',
  authMiddleware,
  requireRole('super_admin'),
  async (req, res) => {
    // Only super_admin can reset
```

---

## Implementation Checklist

### Step 1: Add Global Middleware

In `src/api/server.ts` after line 50 (after other middleware setup):

```typescript
// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================
app.use('/api/*', (req, res, next) => {
  const publicEndpoints = [
    '/api/health',
    '/api/auth/login',
    '/api/auth/refresh'
  ];
  
  if (publicEndpoints.includes(req.path)) {
    return next();
  }
  
  return authMiddleware(req, res, next);
});
```

### Step 2: Update Protected Routes

Replace all `req.headers['x-staff-id']` with `req.staffId`:

```bash
# Search and replace
Find: req.headers['x-staff-id']
Replace: req.staffId
```

Also replace `req.headers['x-restaurant-id']` with `req.restaurantId`:

```bash
Find: req.headers['x-restaurant-id']
Replace: req.restaurantId
```

### Step 3: Add Role Checks Where Needed

For sensitive operations:

```typescript
// Delete operations
app.delete('/api/staff/:id', authMiddleware, requireRole('manager'), async (req, res) => {
  // Only managers can delete staff
});

// Admin operations
app.post('/api/system/*', authMiddleware, requireRole('super_admin'), async (req, res) => {
  // Only super admins
});
```

### Step 4: Update Client Requests

**Before**:
```typescript
const response = await fetch('/api/orders', {
  headers: { 'x-staff-id': userId }
});
```

**After**:
```typescript
const token = sessionStorage.getItem('accessToken');
const response = await fetch('/api/orders', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### Step 5: Test Each Endpoint

```bash
# Test unauthenticated - should work
curl http://localhost:3000/api/health

# Test authenticated - should fail without token
curl http://localhost:3000/api/orders

# Test with token - should work
curl http://localhost:3000/api/orders \
  -H "Authorization: Bearer eyJhbGc..."
```

---

## Common Patterns

### Pattern: Always Verify Restaurant ID

```typescript
app.get('/api/restaurant/:id/orders', authMiddleware, async (req, res) => {
  // Verify user belongs to this restaurant
  if (req.restaurantId !== req.params.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  // Fetch orders for this restaurant
  const orders = await prisma.orders.findMany({
    where: { restaurant_id: req.restaurantId }
  });
  
  res.json(orders);
});
```

### Pattern: Role-Based Access

```typescript
// Anyone authenticated can read
app.get('/api/staff', authMiddleware, async (req, res) => {
  const staff = await prisma.staff.findMany({
    where: { restaurant_id: req.restaurantId }
  });
  res.json(staff);
});

// Only managers can create
app.post('/api/staff', authMiddleware, requireRole('manager'), async (req, res) => {
  const staff = await prisma.staff.create({
    data: { ...req.body, restaurant_id: req.restaurantId }
  });
  res.json(staff);
});

// Only managers can modify
app.patch('/api/staff/:id', authMiddleware, requireRole('manager'), async (req, res) => {
  const staff = await prisma.staff.update({
    where: { id: req.params.id },
    data: req.body
  });
  res.json(staff);
});

// Only managers can delete
app.delete('/api/staff/:id', authMiddleware, requireRole('manager'), async (req, res) => {
  await prisma.staff.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});
```

### Pattern: Audit Logging

```typescript
app.post('/api/critical-operation', authMiddleware, async (req, res) => {
  const staffId = req.staffId;
  
  // Perform operation
  const result = await prisma.critical_data.create({ data: req.body });
  
  // Log the operation
  await prisma.audit_logs.create({
    data: {
      staff_id: staffId,
      restaurant_id: req.restaurantId,
      action: 'CRITICAL_OPERATION',
      details: JSON.stringify(req.body),
      timestamp: new Date()
    }
  });
  
  res.json(result);
});
```

---

## Error Handling

The middleware automatically returns proper error codes:

| Status | Meaning | Cause |
|--------|---------|-------|
| **401** | Unauthorized | Missing/invalid token, wrong format |
| **410** | Gone | Token expired (client should refresh) |
| **403** | Forbidden | Wrong role, wrong restaurant |

Handle in client:

```typescript
async function apiCall(endpoint: string, options = {}) {
  const token = sessionStorage.getItem('accessToken');
  
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    // Invalid token - send user to login
    window.location.href = '/login';
  }

  if (response.status === 410) {
    // Token expired - refresh and retry
    const refreshResponse = await fetch('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({
        refresh_token: sessionStorage.getItem('refreshToken')
      })
    });
    const { access_token } = await refreshResponse.json();
    sessionStorage.setItem('accessToken', access_token);
    
    // Retry original request
    return apiCall(endpoint, options);
  }

  if (response.status === 403) {
    // Permission denied
    alert('You do not have permission to perform this action');
  }

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  return response.json();
}
```

---

## Migration Path

### Phase 1: Add Middleware (NON-BREAKING)

- Add global middleware that skips if no token
- Accepts both JWT and x-staff-id headers (dual mode)
- All routes work with either authentication method

### Phase 2: Require JWT (BREAKING)

- Remove support for x-staff-id header
- All routes require valid JWT
- Update all clients to send JWT

### Phase 3: Token Blacklist (OPTIONAL)

- Add Redis for token blacklist
- Tokens revoked on logout
- Prevents token reuse after logout

---

## Questions?

For detailed implementation patterns, see:
- [PHASE_2B_JWT_IMPLEMENTATION.md](./PHASE_2B_JWT_IMPLEMENTATION.md)
- [src/api/middleware/authMiddleware.ts](../src/api/middleware/authMiddleware.ts)
- [src/api/services/auth/JwtService.ts](../src/api/services/auth/JwtService.ts)

**Implementation by**: Ralf  
**Date**: Jan 20, 2026
