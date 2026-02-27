# 🚴 Delivery Order Workflow - Complete Guide

**Date**: February 5, 2026  
**System**: Fireflow Restaurant Management System  
**Version**: 1.0

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [Order Taking (POS)](#order-taking-pos)
4. [Kitchen Preparation (KDS)](#kitchen-preparation-kds)
5. [Dispatch & Assignment (Logistics Hub)](#dispatch--assignment-logistics-hub)
6. [Delivery Execution](#delivery-execution)
7. [Cash Settlement with Riders](#cash-settlement-with-riders)
8. [Complete Workflow Diagram](#complete-workflow-diagram)
9. [API Endpoints](#api-endpoints)
10. [Code References](#code-references)

---

## Overview

The delivery order workflow in Fireflow handles the complete lifecycle of a delivery order from initial order taking to final cash settlement with riders. The system supports:

- ✅ **Multi-channel order taking** (POS, Phone orders)
- ✅ **Customer management** (Phone-based lookup, address storage)
- ✅ **Kitchen coordination** (KDS integration)
- ✅ **Fleet management** (Driver assignment, batch dispatch)
- ✅ **Real-time tracking** (Order status updates via Socket.IO)
- ✅ **Cash settlement** (Float management, shortage tracking)
- ✅ **Delivery fee calculation** (Configurable per restaurant)

---

## Database Schema

### Core Tables

#### 1. **`orders`** (Main Order Table)
```sql
model orders {
  id                    UUID PRIMARY KEY
  restaurant_id         UUID NOT NULL
  status                STRING (DRAFT, FIRED, PREPARING, READY, OUT_FOR_DELIVERY, DELIVERED, PAID, COMPLETED)
  type                  STRING (DELIVERY)
  total                 DECIMAL(10,2)
  customer_name         STRING?
  customer_phone        STRING?
  delivery_address      STRING?
  assigned_driver_id    UUID?
  delivery_fee          DECIMAL(10,2) DEFAULT 0
  service_charge        DECIMAL(10,2) DEFAULT 0
  tax                   DECIMAL(10,2) DEFAULT 0
  discount              DECIMAL(10,2) DEFAULT 0
  float_given           DECIMAL(10,2) DEFAULT 0
  expected_return       DECIMAL(10,2) DEFAULT 0
  is_settled_with_rider BOOLEAN DEFAULT false
  created_at            TIMESTAMP
  updated_at            TIMESTAMP
  last_action_by        STRING?
  last_action_desc      STRING?
  last_action_at        TIMESTAMP?
}
```

#### 2. **`delivery_orders`** (Delivery-Specific Extension)
```sql
model delivery_orders {
  id                    UUID PRIMARY KEY
  order_id              UUID UNIQUE (FK → orders.id)
  customer_name         STRING?
  customer_phone        STRING NOT NULL
  delivery_address      STRING?
  customer_id           UUID? (FK → customers.id)
  driver_id             UUID? (FK → staff.id)
  dispatched_at         TIMESTAMP?
  float_given           DECIMAL(10,2) DEFAULT 0
  expected_return       DECIMAL(10,2) DEFAULT 0
  is_settled_with_rider BOOLEAN DEFAULT false
}
```

#### 3. **`customers`** (Customer Database)
```sql
model customers {
  id            UUID PRIMARY KEY
  restaurant_id UUID NOT NULL
  name          STRING?
  phone         STRING NOT NULL (UNIQUE per restaurant)
  address       STRING?
  notes         STRING?
  created_at    TIMESTAMP
  updated_at    TIMESTAMP
}
```

#### 4. **`staff`** (Drivers/Riders)
```sql
model staff {
  id               UUID PRIMARY KEY
  restaurant_id    UUID NOT NULL
  name             STRING
  role             STRING (DRIVER, RIDER)
  cash_in_hand     DECIMAL(10,2) DEFAULT 0
  total_deliveries INT DEFAULT 0
  status           STRING (AVAILABLE, BUSY, OFFLINE)
}
```

#### 5. **`rider_settlements`** (Cash Settlement Records)
```sql
model rider_settlements {
  id                 UUID PRIMARY KEY
  restaurant_id      UUID NOT NULL
  driver_id          UUID NOT NULL (FK → staff.id)
  start_time         TIMESTAMP
  end_time           TIMESTAMP?
  amount_collected   DECIMAL(10,2)  -- Total cash collected from customers
  amount_expected    DECIMAL(10,2)  -- Total order amounts
  amount_handed_over DECIMAL(10,2)  -- Cash returned to restaurant
  shortage           DECIMAL(10,2) DEFAULT 0  -- Discrepancy
  status             STRING DEFAULT 'COMPLETED'
  processed_by       UUID? (FK → staff.id)
  notes              STRING?
  created_at         TIMESTAMP
}
```

---

## Order Taking (POS)

### Location
**File**: `src/operations/pos/POSView.tsx`

### Workflow

#### Step 1: Select Order Type
```typescript
// User selects "DELIVERY" from order type buttons
orderType = 'DELIVERY'
```

#### Step 2: Customer Information Entry
```typescript
// MANDATORY fields for delivery orders:
- customerPhone: string (REQUIRED - validation enforced)
- customerName: string (optional)
- deliveryAddress: string (optional but recommended)
```

**Phone Number Auto-Lookup**:
```typescript
// When phone number >= 10 digits, system auto-searches customers table
useEffect(() => {
  if (cleanPhone.length >= 10 && orderType === 'DELIVERY') {
    const match = customers.find(c => c.phone.includes(cleanPhone));
    if (match) {
      setCustomerName(match.name || '');
      setDeliveryAddress(match.address || '');
    }
  }
}, [customerPhone]);
```

#### Step 3: Add Menu Items
```typescript
// Add items to cart (same as dine-in/takeaway)
cartItems: OrderItem[] = [
  {
    menu_item_id: string,
    quantity: number,
    unit_price: number,
    total_price: number,
    item_name: string,
    station: string
  }
]
```

#### Step 4: Calculate Totals
```typescript
// Delivery fee is automatically added for DELIVERY orders
const breakdown = calculateOrderTotal(
  cartItems,
  'DELIVERY',
  0, // guest_count (not used for delivery)
  deliveryFee // From restaurant settings or custom
);

// Result:
{
  subtotal: 1500,
  serviceCharge: 75,    // 5% if enabled
  tax: 157.5,           // 10% if enabled
  deliveryFee: 200,     // Default or custom
  discount: 0,
  total: 1932.5
}
```

#### Step 5: Save or Fire Order
```typescript
// DRAFT: Save for later
const orderData = {
  type: 'DELIVERY',
  status: 'DRAFT',
  customer_name: customerName,
  customer_phone: customerPhone,  // MANDATORY
  delivery_address: deliveryAddress,
  order_items: cartItems,
  total: breakdown.total,
  delivery_fee: breakdown.deliveryFee,
  service_charge: breakdown.serviceCharge,
  tax: breakdown.tax
};

// FIRE: Send to kitchen immediately
const orderData = {
  ...above,
  status: 'FIRED'
};

// API Call
POST /api/orders
{
  ...orderData,
  restaurant_id: currentUser.restaurant_id,
  created_by: currentUser.id
}
```

### Validation Rules

```typescript
// Phone number is MANDATORY for delivery orders
if (orderType === 'DELIVERY' && !customerPhone) {
  throw new Error('Customer phone number is mandatory for delivery orders');
}

// Backend validation (DeliveryService.ts)
if (context === 'FIRE') {
  if (!data.delivery_address) errors.push('delivery_address is required');
  if (!data.customer_phone) errors.push('customer_phone is required');
}
```

---

## Kitchen Preparation (KDS)

### Location
**File**: `src/operations/kds/KDSView.tsx`

### Workflow

#### Step 1: Order Appears in KDS
```typescript
// Delivery orders appear in KDS with DELIVERY badge
// Items are grouped by station (KITCHEN, GRILL, DRINKS, etc.)

Order Display:
- Order Number: #D7B873
- Type Badge: 🚴 DELIVERY
- Customer: John Doe
- Phone: 0300-1234567
- Address: House 123, Street 45, DHA Phase 5
- Items: [Burger x2, Fries x1, Coke x2]
- Station: KITCHEN
```

#### Step 2: Kitchen Staff Marks Items
```typescript
// Item status progression:
FIRED → PREPARING → READY

// When all items are READY:
Order Status: READY (ready for dispatch)
```

#### Step 3: Order Ready Notification
```typescript
// Socket.IO event emitted
socket.emit('order_status_changed', {
  orderId: 'xxx',
  status: 'READY',
  type: 'DELIVERY'
});

// Logistics Hub receives notification
// Order appears in "Dispatch Queue"
```

---

## Dispatch & Assignment (Logistics Hub)

### Location
**File**: `src/operations/logistics/LogisticsHub.tsx`

### UI Components

#### 1. **Fleet Command Sidebar**
```typescript
// Left sidebar showing all drivers
Displays:
- Total Fleet: 5
- In Transit: 2
- Available Pilots: 3

Driver Card:
- Name: Ali Khan
- Status: Stationary / 2 Active Deliveries
- Avatar: First letter of name
- Hover Action: "Assign Batch" button
```

#### 2. **Dispatch Queue Tab**
```typescript
// Shows orders ready for dispatch
Filters:
- type === 'DELIVERY'
- status === 'READY' || 'PREPARING' || 'FIRED'
- !driver_id (not yet assigned)

Order Card:
- Order ID: #D7B873
- Customer Name: John Doe
- Phone: 0300-1234567
- Address: House 123, Street 45
- Total: Rs. 1,932
- Time: 15m ago
- Selection Checkbox
```

#### 3. **In Transit Tab**
```typescript
// Shows orders currently being delivered
Filters:
- type === 'DELIVERY'
- status === 'OUT_FOR_DELIVERY'
- driver_id EXISTS
- status !== 'PAID' && !== 'COMPLETED'

Order Card:
- Customer Name
- Total Amount (Balance Due)
- Assigned Pilot: Ali Khan
- Address
- Actions:
  - Print Duplicate Slip
  - Confirm Arrived
```

### Workflow

#### Step 1: Select Orders for Dispatch
```typescript
// Manager clicks on orders to select them
const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

const toggleOrderSelection = (id: string) => {
  setSelectedOrderIds(prev =>
    prev.includes(id) ? prev.filter(oid => oid !== id) : [...prev, id]
  );
};
```

#### Step 2: Assign to Driver (Batch Dispatch)
```typescript
const handleBatchDispatch = async (driverId: string) => {
  if (selectedOrderIds.length === 0) return;

  setIsDispatching(true);
  try {
    // Assign all selected orders to driver
    for (const id of selectedOrderIds) {
      await assignDriverToOrder(id, driverId, floatAmount);
    }

    // Print delivery slips (Electron IPC)
    if (window.electronAPI) {
      window.electronAPI.printDeliverySlip({
        orderIds: selectedOrderIds,
        driverId,
        timestamp: new Date().toISOString()
      });
    }

    addNotification('success', `Dispatched ${selectedOrderIds.length} orders`);
    setSelectedOrderIds([]);
  } catch (err) {
    addNotification('error', 'Dispatch failed');
  }
};
```

#### Step 3: Backend Processing
```typescript
// API: POST /api/orders/:id/assign-driver
{
  driverId: 'driver-uuid',
  floatAmount: 5000  // Cash given to rider for change
}

// Backend updates:
UPDATE orders SET
  assigned_driver_id = driverId,
  status = 'OUT_FOR_DELIVERY',
  float_given = floatAmount,
  expected_return = total + floatAmount,
  last_action_by = currentUser.id,
  last_action_desc = 'Assigned to driver',
  last_action_at = NOW()
WHERE id = orderId;

UPDATE delivery_orders SET
  driver_id = driverId,
  dispatched_at = NOW(),
  float_given = floatAmount,
  expected_return = total + floatAmount
WHERE order_id = orderId;

UPDATE staff SET
  cash_in_hand = cash_in_hand + floatAmount,
  total_deliveries = total_deliveries + 1
WHERE id = driverId;
```

---

## Delivery Execution

### Rider's Perspective

#### Step 1: Receive Orders
```
Rider receives:
- Printed delivery slip (via Electron thermal printer)
- Float cash: Rs. 5,000
- Orders: 3 deliveries
- Total to collect: Rs. 5,796
```

#### Step 2: Deliver Orders
```
For each order:
1. Navigate to address
2. Hand over food
3. Collect payment (cash)
4. Mark as delivered (optional mobile app - not implemented yet)
```

#### Step 3: Return to Restaurant
```
Rider returns with:
- Cash collected: Rs. 5,796
- Float: Rs. 5,000
- Total in hand: Rs. 10,796
```

### System Tracking

```typescript
// Real-time status updates via Socket.IO
socket.on('order_status_changed', (data) => {
  // Update order status in real-time
  if (data.status === 'DELIVERED') {
    // Move to settlement queue
  }
});
```

---

## Cash Settlement with Riders

### Location
**File**: `src/client/App.tsx` (settleRiderCash function)

### Workflow

#### Step 1: Identify Orders to Settle
```typescript
// Find all delivered orders for a specific rider
const riderOrders = orders.filter(o =>
  o.type === 'DELIVERY' &&
  o.assigned_driver_id === driverId &&
  o.status === 'DELIVERED' &&
  !o.is_settled_with_rider
);

// Calculate expected amounts
const totalExpected = riderOrders.reduce((sum, o) => sum + Number(o.total), 0);
const floatGiven = riderOrders.reduce((sum, o) => sum + Number(o.float_given || 0), 0);
```

#### Step 2: Count Cash Received
```typescript
// Manager counts cash from rider
const settlement: RiderSettlement = {
  driverId: 'driver-uuid',
  orderIds: ['order-1', 'order-2', 'order-3'],
  amountExpected: 5796,      // Total order amounts
  amountReceived: 5796,      // Actual cash received
  floatGiven: 5000,          // Float given at dispatch
  shortage: 0,               // Discrepancy (if any)
  timestamp: new Date(),
  processedBy: currentUser.id,
  notes: 'All orders delivered successfully'
};
```

#### Step 3: Process Settlement
```typescript
const settleRiderCash = async (settlement: RiderSettlement) => {
  try {
    // API Call
    const res = await fetch(`${API_URL}/riders/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settlement)
    });

    if (!res.ok) throw new Error('Settlement failed');

    // Backend processing:
    // 1. Create rider_settlements record
    INSERT INTO rider_settlements (
      driver_id,
      amount_collected,
      amount_expected,
      amount_handed_over,
      shortage,
      processed_by,
      notes
    ) VALUES (...);

    // 2. Update all orders
    UPDATE orders SET
      is_settled_with_rider = true,
      status = 'PAID'
    WHERE id IN (orderIds);

    // 3. Update delivery_orders
    UPDATE delivery_orders SET
      is_settled_with_rider = true
    WHERE order_id IN (orderIds);

    // 4. Update driver's cash_in_hand
    UPDATE staff SET
      cash_in_hand = cash_in_hand - floatGiven
    WHERE id = driverId;

    // 5. Create transaction records
    INSERT INTO transactions (
      order_id,
      amount,
      payment_method,
      status
    ) VALUES (orderId, total, 'CASH', 'PAID');

    addNotification('success', 'Settlement completed');
    return true;
  } catch (err) {
    addNotification('error', 'Settlement failed');
    return false;
  }
};
```

#### Step 4: Handle Shortages
```typescript
// If cash received < expected
const shortage = amountExpected - amountReceived;

if (shortage > 0) {
  // Record shortage in settlement
  settlement.shortage = shortage;
  settlement.notes = `Shortage of Rs. ${shortage}`;

  // Optional: Deduct from driver's next float
  // Or: Create expense record
  // Or: Flag for manager review
}
```

---

## Complete Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     DELIVERY ORDER LIFECYCLE                        │
└─────────────────────────────────────────────────────────────────────┘

1. ORDER TAKING (POS)
   ┌──────────────────┐
   │ Customer calls   │
   │ Phone: 0300-xxx  │──┐
   └──────────────────┘  │
                         ├──► Auto-lookup customer DB
   ┌──────────────────┐  │    ├─ Name
   │ Staff enters:    │◄─┘    ├─ Address
   │ - Phone (REQ)    │        └─ Previous orders
   │ - Name           │
   │ - Address        │
   │ - Items          │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Calculate Total  │
   │ + Delivery Fee   │
   │ + Service Charge │
   │ + Tax            │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ FIRE Order       │──► Status: FIRED
   │ → Kitchen        │
   └──────────────────┘

2. KITCHEN PREPARATION (KDS)
   ┌──────────────────┐
   │ Order appears    │
   │ Station: KITCHEN │
   │ Type: DELIVERY   │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Chef prepares    │
   │ Items: PREPARING │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ All items READY  │──► Status: READY
   │ → Logistics Hub  │
   └──────────────────┘

3. DISPATCH (LOGISTICS HUB)
   ┌──────────────────┐
   │ Dispatch Queue   │
   │ - Order #D7B873  │
   │ - Rs. 1,932      │
   │ - 15m ago        │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Manager selects  │
   │ 3 orders         │
   │ ☑ #D7B873        │
   │ ☑ #D7B874        │
   │ ☑ #D7B875        │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Assign to Rider  │
   │ Driver: Ali Khan │
   │ Float: Rs. 5,000 │
   └────────┬─────────┘
            │
            ├──► Print delivery slips
            ├──► Update order status: OUT_FOR_DELIVERY
            ├──► Update driver: cash_in_hand += 5000
            └──► Socket.IO broadcast

4. DELIVERY EXECUTION
   ┌──────────────────┐
   │ Rider receives:  │
   │ - 3 orders       │
   │ - Rs. 5,000 float│
   │ - Delivery slips │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Deliver orders   │
   │ Collect cash     │
   │ Total: Rs. 5,796 │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Return to shop   │
   │ Cash: Rs. 10,796 │
   │ (5,796 + 5,000)  │
   └──────────────────┘

5. CASH SETTLEMENT
   ┌──────────────────┐
   │ Manager counts   │
   │ Expected: 5,796  │
   │ Received: 5,796  │
   │ Float: 5,000     │
   │ Shortage: 0      │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Process          │
   │ Settlement       │
   ├──────────────────┤
   │ ✓ Mark orders    │
   │   as PAID        │
   │ ✓ Update driver  │
   │   cash_in_hand   │
   │ ✓ Create         │
   │   settlement     │
   │   record         │
   │ ✓ Create         │
   │   transactions   │
   └──────────────────┘
```

---

## API Endpoints

### Order Management

#### 1. Create Delivery Order
```http
POST /api/orders
Content-Type: application/json

{
  "type": "DELIVERY",
  "status": "FIRED",
  "customer_name": "John Doe",
  "customer_phone": "03001234567",
  "delivery_address": "House 123, Street 45, DHA Phase 5",
  "order_items": [...],
  "total": 1932.50,
  "delivery_fee": 200,
  "service_charge": 75,
  "tax": 157.50,
  "restaurant_id": "xxx"
}

Response:
{
  "success": true,
  "order": { ... },
  "message": "Order created successfully"
}
```

#### 2. Assign Driver to Order
```http
POST /api/orders/:orderId/assign-driver
Content-Type: application/json

{
  "driverId": "driver-uuid",
  "floatAmount": 5000
}

Response:
{
  "success": true,
  "message": "Driver assigned successfully"
}
```

#### 3. Update Order Status
```http
PATCH /api/orders/:orderId/status
Content-Type: application/json

{
  "status": "DELIVERED"
}

Response:
{
  "success": true,
  "order": { ... }
}
```

### Settlement

#### 4. Settle Rider Cash
```http
POST /api/riders/settle
Content-Type: application/json

{
  "driverId": "driver-uuid",
  "orderIds": ["order-1", "order-2", "order-3"],
  "amountExpected": 5796,
  "amountReceived": 5796,
  "floatGiven": 5000,
  "shortage": 0,
  "processedBy": "manager-uuid",
  "notes": "All orders delivered successfully"
}

Response:
{
  "success": true,
  "settlement": { ... },
  "message": "Settlement completed successfully"
}
```

### Customer Management

#### 5. Search Customer by Phone
```http
GET /api/customers?phone=03001234567

Response:
{
  "success": true,
  "customer": {
    "id": "xxx",
    "name": "John Doe",
    "phone": "03001234567",
    "address": "House 123, Street 45",
    "notes": "Regular customer"
  }
}
```

---

## Code References

### Frontend Components

| Component | File | Purpose |
|-----------|------|---------|
| **POSView** | `src/operations/pos/POSView.tsx` | Order taking interface |
| **LogisticsHub** | `src/operations/logistics/LogisticsHub.tsx` | Dispatch & fleet management |
| **KDSView** | `src/operations/kds/KDSView.tsx` | Kitchen display system |
| **BillPreviewModal** | `src/operations/pos/components/BillPreviewModal.tsx` | Order summary with delivery fee |

### Backend Services

| Service | File | Purpose |
|---------|------|---------|
| **DeliveryService** | `src/api/services/orders/DeliveryService.ts` | Delivery order validation & creation |
| **OrderService** | `src/api/services/orders/OrderService.ts` | Generic order operations |
| **BaseOrderService** | `src/api/services/orders/BaseOrderService.ts` | Common order logic |

### Utilities

| Utility | File | Purpose |
|---------|------|---------|
| **businessLogic** | `src/shared/utils/businessLogic.ts` | Delivery fee calculation, tax, service charge |
| **socketClient** | `src/shared/lib/socketClient.ts` | Real-time updates |

### Type Definitions

| Type | File | Purpose |
|------|------|---------|
| **Order** | `src/shared/types.ts` | Main order interface |
| **DeliveryOrder** | `src/shared/types.ts` | Delivery-specific fields |
| **RiderSettlement** | `src/shared/types.ts` | Settlement record structure |
| **Staff** | `src/shared/types.ts` | Driver/rider information |

---

## Key Features & Capabilities

### ✅ Implemented

1. **Customer Management**
   - Phone-based auto-lookup
   - Address storage and retrieval
   - Order history tracking

2. **Order Processing**
   - Delivery fee calculation
   - Tax and service charge application
   - Draft and fire modes

3. **Fleet Management**
   - Driver availability tracking
   - Batch order assignment
   - Active delivery count

4. **Real-time Updates**
   - Socket.IO integration
   - Live order status changes
   - Fleet status updates

5. **Cash Management**
   - Float tracking
   - Settlement records
   - Shortage detection

### ⏳ Pending/Future Enhancements

1. **Mobile App for Riders**
   - GPS tracking
   - Route optimization
   - Digital signatures
   - Photo proof of delivery

2. **Advanced Analytics**
   - Delivery time tracking
   - Driver performance metrics
   - Customer satisfaction ratings
   - Heat maps for delivery zones

3. **Third-Party Integration**
   - Foodpanda API
   - Cheetay integration
   - Google Maps routing

4. **Automated Dispatch**
   - AI-based driver assignment
   - Route optimization
   - Load balancing

5. **Customer Portal**
   - Order tracking
   - Live GPS location
   - ETA updates
   - Rating system

---

## Configuration

### Restaurant Settings

```typescript
// Default delivery fee (can be overridden per order)
default_delivery_fee: 250  // PKR

// Default rider float
default_rider_float: 5000  // PKR

// Tax and service charge
tax_enabled: true
tax_rate: 10  // %
service_charge_enabled: true
service_charge_rate: 5  // %
```

### Business Logic

```typescript
// File: src/shared/utils/businessLogic.ts

export const BUSINESS_SETTINGS = {
  deliveryFeeDefault: 200,
  taxRate: 10,
  serviceChargeRate: 5,
  applyTaxOnTypes: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
  applyServiceChargeOnTypes: ['DINE_IN']
};
```

---

## Testing Checklist

### Manual Testing

- [ ] **Order Creation**
  - [ ] Create delivery order with phone number
  - [ ] Verify customer auto-lookup works
  - [ ] Verify delivery fee is added
  - [ ] Verify tax and service charge calculation

- [ ] **Kitchen Flow**
  - [ ] Order appears in KDS with DELIVERY badge
  - [ ] Items can be marked as PREPARING
  - [ ] Items can be marked as READY
  - [ ] Order status updates to READY

- [ ] **Dispatch**
  - [ ] Order appears in Dispatch Queue
  - [ ] Can select multiple orders
  - [ ] Can assign to available driver
  - [ ] Float amount is recorded
  - [ ] Order status updates to OUT_FOR_DELIVERY

- [ ] **Settlement**
  - [ ] Can identify rider's delivered orders
  - [ ] Can calculate expected amount
  - [ ] Can process settlement
  - [ ] Shortage is detected if cash < expected
  - [ ] Orders are marked as PAID

### Integration Testing

- [ ] Socket.IO real-time updates work
- [ ] Database transactions are atomic
- [ ] Concurrent order assignments don't conflict
- [ ] Float calculations are accurate

---

## Troubleshooting

### Common Issues

#### 1. **Phone number validation fails**
```
Error: "Customer phone number is mandatory for delivery orders"

Solution:
- Ensure phone number is entered in POSView
- Check that phone field is not empty
- Verify validation logic in POSView.tsx line 244
```

#### 2. **Delivery fee not calculated**
```
Issue: Delivery fee shows as 0

Solution:
- Check restaurant settings: default_delivery_fee
- Verify businessLogic.ts configuration
- Ensure orderType === 'DELIVERY' in calculation
```

#### 3. **Driver assignment fails**
```
Error: "Driver assignment failed"

Solution:
- Verify driver exists in staff table
- Check driver role is 'DRIVER' or 'RIDER'
- Ensure order status is READY or PREPARING
- Check database constraints on delivery_orders table
```

#### 4. **Settlement shortage mismatch**
```
Issue: Shortage calculation incorrect

Solution:
- Verify amountExpected = sum of all order totals
- Check floatGiven is correct
- Ensure amountReceived is accurately counted
- Review settlement calculation logic
```

---

## Security Considerations

1. **Cash Handling**
   - All settlements require manager approval
   - Audit logs for all cash transactions
   - Shortage alerts above threshold

2. **Driver Access**
   - Drivers can only see their assigned orders
   - Cannot modify order amounts
   - Cannot access settlement records

3. **Data Privacy**
   - Customer phone numbers are encrypted
   - Addresses are access-controlled
   - Order history requires authentication

---

## Performance Optimization

1. **Database Indexing**
   ```sql
   CREATE INDEX idx_orders_type_status ON orders(type, status);
   CREATE INDEX idx_delivery_orders_driver ON delivery_orders(driver_id);
   CREATE INDEX idx_orders_assigned_driver ON orders(assigned_driver_id);
   ```

2. **Query Optimization**
   - Use JOIN instead of multiple queries
   - Implement pagination for order lists
   - Cache customer lookup results

3. **Real-time Updates**
   - Use Socket.IO rooms for targeted updates
   - Debounce status change events
   - Batch multiple updates

---

## Conclusion

The Fireflow delivery order workflow provides a comprehensive solution for managing delivery operations from order taking to cash settlement. The system is designed for:

- **Efficiency**: Batch dispatch, auto-lookup, real-time updates
- **Accuracy**: Automated calculations, validation rules, audit trails
- **Scalability**: Multi-driver support, concurrent orders, high volume
- **Reliability**: Database transactions, error handling, data integrity

For questions or support, refer to the main documentation or contact the development team.

---

**Document Version**: 1.0  
**Last Updated**: February 5, 2026  
**Author**: Fireflow Development Team
