# 🚀 QUICK REFERENCE: Order Creation Testing

## TL;DR - What Was Wrong & What's Fixed

### 3 Critical Issues Found
1. ❌ **Wrong API endpoint** → ✅ Fixed to `/api/orders/upsert`
2. ❌ **Mixed field names** → ✅ Standardized to snake_case
3. ❌ **Poor error handling** → ✅ Enhanced with detailed messages

---

## Test Now (Choose One)

### 🟦 Option 1: Node.js (Recommended)
```bash
cd e:\firefox3\Fireflow
node scripts/order-test.js
```
**Time**: ~30 seconds | **Output**: Detailed report ✅

### 🟩 Option 2: Browser Console
```javascript
// Paste in DevTools Console (F12) and run:
await runAllTests()
```
**Time**: ~30 seconds | **Output**: Live console output ✅

### 🟨 Option 3: Manual cURL
```bash
curl -X POST http://localhost:3001/api/orders/upsert \
  -H "Content-Type: application/json" \
  -d '{"id":"test1","restaurant_id":"r1","status":"NEW","type":"dine-in","items":[],"total":0}'
```
**Time**: ~5 seconds | **Output**: JSON response ✅

### 🟧 Option 4: Database Check
```bash
psql -U postgres -d fireflow_local -c \
  "SELECT id, type, status, total FROM orders ORDER BY created_at DESC LIMIT 5;"
```
**Time**: ~5 seconds | **Output**: Recent orders ✅

---

## Field Mapping (The Key Fix)

### What Was Sent (WRONG ❌)
```javascript
{
  tableId: "t1",              // ❌ camelCase
  guestCount: 2,              // ❌ camelCase
  customerPhone: "555-1234",  // ❌ camelCase
}
```

### What's Now Sent (RIGHT ✅)
```javascript
{
  table_id: "t1",             // ✅ snake_case
  guest_count: 2,             // ✅ snake_case
  customer_phone: "555-1234", // ✅ snake_case
  // All database fields now use snake_case
}
```

---

## All Field Names (Reference)

| Purpose | Database Name | Type |
|---------|---------------|------|
| Order ID | `id` | UUID |
| Restaurant | `restaurant_id` | UUID |
| Status | `status` | string |
| Type | `type` | string |
| Table | `table_id` | UUID |
| Guest Count | `guest_count` | integer |
| Customer | `customer_name` | string |
| Phone | `customer_phone` | string |
| Address | `delivery_address` | string |
| Service Charge | `service_charge` | decimal |
| Delivery Fee | `delivery_fee` | decimal |
| Tax | `tax` | decimal |
| Items | `items` | JSON |

---

## 3 Test Order Templates

### Template 1: Dine-in
```javascript
{
  id: 'test-dine-in',
  restaurant_id: 'YOUR_RESTAURANT_ID',
  status: 'NEW',
  type: 'dine-in',
  table_id: 'YOUR_TABLE_ID',
  guest_count: 2,
  items: [],
  total: 1000
}
```

### Template 2: Takeaway
```javascript
{
  id: 'test-takeaway',
  restaurant_id: 'YOUR_RESTAURANT_ID',
  status: 'NEW',
  type: 'takeaway',
  customer_name: 'John',
  customer_phone: '03001234567',
  items: [],
  total: 1000
}
```

### Template 3: Delivery
```javascript
{
  id: 'test-delivery',
  restaurant_id: 'YOUR_RESTAURANT_ID',
  status: 'NEW',
  type: 'delivery',
  customer_name: 'Jane',
  customer_phone: '03009876543',
  delivery_address: '123 Main St',
  delivery_fee: 500,
  items: [],
  total: 1500
}
```

---

## Files Modified

| File | What Changed |
|------|--------------|
| `components/services/orderService.ts` | ✅ Endpoint fixed + error handling |
| `components/POSView.tsx` | ✅ Field names standardized |

## Files Created

| File | Purpose |
|------|---------|
| `scripts/order-test.js` | Main test suite |
| `scripts/order-test-complete.js` | Browser-friendly tests |
| `docs/ORDER_CREATION_REPORT.md` | Full report |
| `docs/ORDER_CREATION_DEBUG.md` | Debug guide |
| `docs/ORDER_CREATION_FIX_GUIDE.md` | Step-by-step fixes |
| `docs/ORDER_CREATION_TEST_SUMMARY.md` | Test summary |

---

## Expected Test Results

### ✅ Should Pass
- Create dine-in order
- Create takeaway order
- Create delivery order
- Fetch orders
- Update order

### ✅ Should Fail Gracefully
- Missing restaurant_id (error message)
- Invalid status (error message)
- Missing items array (error message)

---

## Debugging Steps

1. **API offline?**
   ```bash
   curl http://localhost:3001/api/health
   ```

2. **Order not created?**
   - Check browser console for errors (F12)
   - Run: `node scripts/order-test.js`
   - Check server logs

3. **Wrong field names still being sent?**
   - Verify POSView.tsx was updated
   - Check HTTP request in DevTools Network tab
   - Look for `snake_case` field names

4. **Database not showing order?**
   ```bash
   psql -U postgres -d fireflow_local -c "SELECT * FROM orders WHERE id='test-order-id';"
   ```

---

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| 404 Not Found | Old endpoint | Use `/api/orders/upsert` |
| Invalid fields | camelCase used | Use snake_case |
| Missing required field | No restaurant_id | Provide `restaurant_id` |
| Type validation error | Bad status value | Use valid status enum |

---

## One-Liner Test Commands

```bash
# Test 1: Health check
curl http://localhost:3001/api/health

# Test 2: Create order (copy & paste)
curl -X POST http://localhost:3001/api/orders/upsert -H "Content-Type: application/json" -d '{"id":"test","restaurant_id":"r1","status":"NEW","type":"dine-in","items":[],"total":0}'

# Test 3: Fetch orders (replace r1 with your restaurant_id)
curl "http://localhost:3001/api/orders?restaurant_id=r1"

# Test 4: See recent orders in DB
psql -U postgres -d fireflow_local -c "SELECT id, status, type FROM orders ORDER BY created_at DESC LIMIT 3;"
```

---

## Success Indicators

✅ Orders created successfully  
✅ Fields use snake_case in database  
✅ Error messages are descriptive  
✅ No JavaScript errors in console  
✅ Test suite passes 100%  

---

## When Everything Works

After fixes are applied and tests pass:
- ✅ Users can create orders in POS
- ✅ Takeaway orders show customer details
- ✅ Delivery orders include address
- ✅ Orders sync to database immediately
- ✅ OrdersView displays all orders

---

**Need more detail?** → See [ORDER_CREATION_REPORT.md](ORDER_CREATION_REPORT.md)  
**Step by step?** → See [ORDER_CREATION_FIX_GUIDE.md](ORDER_CREATION_FIX_GUIDE.md)  
**Just debug?** → See [ORDER_CREATION_DEBUG.md](ORDER_CREATION_DEBUG.md)

---

**Status**: ✅ READY | **Version**: 2.0 | **Last Updated**: 2026-01-02
