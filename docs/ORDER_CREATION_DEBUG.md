# Order Creation Debugging Guide

## Issues Found

### 1. **API Endpoint Mismatch**
**Problem**: The `orderService.ts` calls `/api/orders` but the server has `/api/orders/upsert` endpoint.

```typescript
// orderService.ts (WRONG)
const res = await fetch(`${API_URL}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
});
```

**Server Endpoints** (in server.cjs):
- `POST /api/:table/upsert` (for upsert operations)
- `POST /api/:table` (for insert operations)
- `PATCH /api/:table` (for updates)

**Solution**: Change orderService to use the correct endpoint:
```typescript
// CORRECT:
const res = await fetch(`${API_URL}/orders/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
});
```

---

### 2. **Field Naming Inconsistency**
**Problem**: Client sends camelCase fields, but server expects snake_case.

**Client Code** (POSView.tsx):
```typescript
const orderData = {
  id: activeOrderId || generateSensibleId(),
  tableId: selectedTableId,  // ❌ camelCase
  guestCount: guestCount,    // ❌ camelCase
  customerName: customerName, // ✓ OK
}
```

**Server Validation** (server.cjs):
The database schema likely uses snake_case (`table_id`, `guest_count`), but the orderService sends snake_case:

```typescript
// orderService sends:
{
  restaurant_id: currentUser?.restaurant_id,
  table_id: tableId,           // ✓ snake_case
  guest_count: guestCount      // ✓ snake_case
}
```

**Problem Areas**:
- POSView uses camelCase: `tableId`, `guestCount`, `customerPhone`
- orderService converts to snake_case but may be inconsistent
- App.tsx uses both: `tableId` in some places, `table_id` in others

**Solution**: Standardize all client-side code to send snake_case:
```typescript
const orderData = {
  id: activeOrderId || generateSensibleId(),
  restaurant_id: currentUser?.restaurant_id,
  table_id: selectedTableId,    // ✅ snake_case
  guest_count: guestCount,      // ✅ snake_case
  customer_name: customerName,  // ✅ snake_case
  customer_phone: customerPhone // ✅ snake_case
}
```

---

### 3. **Missing ID Generation**
**Problem**: The server generates ID if missing, but it's unreliable across different endpoints.

```javascript
// server.cjs line 452
if (!data.id) data.id = crypto.randomUUID();
```

**Best Practice**: Always generate ID on the client side before sending:
```typescript
import { generateSensibleId } from '../businessLogic';

const orderData = {
  id: activeOrderId || generateSensibleId(),  // ✅ Always provide
  // ... rest of data
}
```

---

### 4. **Missing Required Fields Validation**
**Problem**: The validation is incomplete and only checks for `restaurant_id` and `status`.

```javascript
// server.cjs line 333-338
function validateOrderPayload(payload, { partial = false } = {}) {
    if (!partial) {
        if (!payload.restaurant_id) errors.push('restaurant_id is required');
        if (!payload.status) errors.push('status is required');
    }
    // ... more validation
}
```

**Missing Checks**:
- No validation for `status` being one of valid enum values (partially done)
- No validation of `type` field
- No validation of minimum required order data
- No validation that `items` is an array

**Solution**: Enhance validation:
```javascript
function validateOrderPayload(payload, { partial = false } = {}) {
    const errors = [];
    
    if (!partial) {
        if (!payload.restaurant_id) errors.push('restaurant_id is required');
        if (!payload.status) errors.push('status is required');
        if (!payload.type) errors.push('type is required');
        if (!Array.isArray(payload.items)) errors.push('items must be an array');
    }
    
    if ('status' in payload && !ORDER_STATUS_VALUES.includes(payload.status)) {
        errors.push(`status must be one of: ${ORDER_STATUS_VALUES.join(', ')}`);
    }
    
    if ('type' in payload && !['dine-in', 'takeaway', 'delivery'].includes(payload.type)) {
        errors.push('type must be one of: dine-in, takeaway, delivery');
    }
    
    return { valid: errors.length === 0, errors };
}
```

---

### 5. **Items Array Structure**
**Problem**: Items structure may not match database schema.

**Current Client Code** (POSView.tsx):
```typescript
items: finalItems  // Items have: id, menuItemId, quantity, etc.
```

**Database Schema** (Prisma): Check `prisma/schema.prisma` for actual structure.

**Recommendation**: Define a strict interface:
```typescript
interface OrderItem {
  id: string;              // Line item ID
  menuItemId: string;      // Reference to menu item
  quantity: number;
  price: number;           // Price at time of order
  name: string;
  specialInstructions?: string;
}

interface Order {
  id: string;
  restaurant_id: string;
  table_id?: string;       // For dine-in
  status: OrderStatus;
  type: OrderType;
  items: OrderItem[];
  total: number;
  serviceCharge?: number;
  tax?: number;
  deliveryFee?: number;
  guest_count?: number;
  customer_name?: string;
  customer_phone?: string;
  delivery_address?: string;
  timestamp: Date;
}
```

---

## Testing Steps

### 1. **Run the Test Suite**
```bash
cd e:\firefox3\Fireflow
node scripts/order-test.js
```

This will:
- ✅ Check API connectivity
- ✅ Test valid order creation (dine-in, takeaway, delivery)
- ✅ Test error cases (missing required fields)
- ✅ Test field naming (snake_case vs camelCase)
- ✅ Test fetch operations

### 2. **Check API Endpoint**
```bash
# Health check
curl http://localhost:3001/api/health

# Fetch orders
curl "http://localhost:3001/api/orders?restaurant_id=test-restaurant-001"

# Create order using generic endpoint
curl -X POST http://localhost:3001/api/orders/upsert \
  -H "Content-Type: application/json" \
  -d '{
    "id": "order-001",
    "restaurant_id": "rest-001",
    "status": "NEW",
    "type": "dine-in",
    "items": [],
    "total": 0
  }'
```

### 3. **Browser Console Debugging**
```javascript
// In browser console, test orderService directly
import { orderService } from './components/services/orderService.ts';

const testOrder = {
  id: 'test-order-001',
  restaurant_id: 'rest-001',
  status: 'NEW',
  type: 'dine-in',
  items: [],
  total: 0
};

orderService.createOrder(testOrder)
  .then(result => console.log('✅ Success:', result))
  .catch(err => console.error('❌ Error:', err));
```

---

## Quick Fixes Needed

1. **Fix orderService.ts endpoint**:
   - Change `/api/orders` to `/api/orders/upsert`
   - OR create dedicated `/api/orders` POST endpoint

2. **Standardize field names**:
   - Ensure all client code sends snake_case
   - Update POSView.tsx and App.tsx to use `table_id`, `guest_count`, `customer_phone`

3. **Add ID generation check**:
   - Verify `generateSensibleId()` is called before sending to server
   - Log generated IDs for debugging

4. **Enhance server validation**:
   - Add type, items, and enum value validation
   - Return detailed error messages

5. **Test in all scenarios**:
   - Dine-in orders (with table_id)
   - Takeaway orders (with customer_name)
   - Delivery orders (with delivery_address)
   - Draft orders (minimal fields)
   - Order updates (after creation)

---

## Database Schema Check

To verify the exact field names expected:
```bash
# From server terminal
psql -U postgres -d fireflow_local -c "\d orders;"
```

This will show the exact column names and types your orders table expects.
