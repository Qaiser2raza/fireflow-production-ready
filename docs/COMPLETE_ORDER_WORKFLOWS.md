# 🍽️ Complete Order Workflows - All Order Types

**Date**: February 5, 2026  
**System**: Fireflow Restaurant Management System  
**Version**: 1.0

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Order Type Comparison](#order-type-comparison)
3. [Dine-In Workflow](#dine-in-workflow)
4. [Takeaway Workflow](#takeaway-workflow)
5. [Delivery Workflow](#delivery-workflow)
6. [Common Elements](#common-elements)
7. [Complete System Diagram](#complete-system-diagram)
8. [Database Schema](#database-schema)
9. [API Endpoints](#api-endpoints)
10. [Code References](#code-references)

---

## Overview

Fireflow supports **three distinct order types**, each with its own workflow, validation rules, and business logic:

| Order Type | Primary Use Case | Key Feature | Payment Timing |
|------------|------------------|-------------|----------------|
| **DINE_IN** | Restaurant seating | Table management | After meal |
| **TAKEAWAY** | Quick pickup | Token system | Before/After |
| **DELIVERY** | Home delivery | Driver assignment | On delivery |

### Common Flow Pattern

```
ORDER TAKING (POS) → KITCHEN PREP (KDS) → FULFILLMENT → PAYMENT → COMPLETION
```

Each order type follows this pattern but with type-specific variations.

---

## Order Type Comparison

### Quick Reference Matrix

| Feature | DINE_IN | TAKEAWAY | DELIVERY |
|---------|---------|----------|----------|
| **Table Required** | ✅ Yes | ❌ No | ❌ No |
| **Guest Count** | ✅ Required | ❌ Optional | ❌ N/A |
| **Customer Phone** | ❌ Optional | ⚠️ Recommended | ✅ Required |
| **Customer Name** | ❌ Optional | ⚠️ Recommended | ⚠️ Recommended |
| **Address** | ❌ N/A | ❌ N/A | ⚠️ Required (for firing) |
| **Token Number** | ❌ No | ✅ Auto-generated | ❌ No |
| **Driver Assignment** | ❌ No | ❌ No | ✅ Yes |
| **Service Charge** | ✅ Yes (5%) | ❌ No | ❌ No |
| **Delivery Fee** | ❌ No | ❌ No | ✅ Yes (Rs. 200-250) |
| **Tax** | ✅ Yes (10%) | ✅ Yes (10%) | ✅ Yes (10%) |
| **Float Management** | ❌ No | ❌ No | ✅ Yes |

### Status Progression

```
DINE_IN:
DRAFT → FIRED → PREPARING → READY → SERVED → BILL_REQUESTED → PAID → COMPLETED

TAKEAWAY:
DRAFT → FIRED → PREPARING → READY → (PICKED_UP) → PAID → COMPLETED

DELIVERY:
DRAFT → FIRED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED → PAID → COMPLETED
```

---

## Dine-In Workflow

### 🎯 Use Case
Customers dining at the restaurant, seated at tables.

### 📍 Primary Interface
**Floor Management View** (`src/operations/dashboard/FloorManagementView.tsx`)

### Complete Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     DINE-IN ORDER LIFECYCLE                          │
└─────────────────────────────────────────────────────────────────────┘

1. SEATING
   ┌──────────────────┐
   │ Host/Waiter      │
   │ selects table    │
   │ Table: A-5       │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Enter guest      │
   │ count: 4         │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Table Status:    │
   │ OCCUPIED         │
   │ Order Created    │
   │ Status: DRAFT    │
   └──────────────────┘

2. ORDER TAKING (POS)
   ┌──────────────────┐
   │ Waiter opens POS │
   │ Type: DINE_IN    │
   │ Table: A-5       │
   │ Guests: 4        │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Add menu items:  │
   │ - Burger x2      │
   │ - Pizza x1       │
   │ - Coke x4        │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Calculate Total  │
   │ Subtotal: 2,500  │
   │ Service: 125 (5%)│
   │ Tax: 262.5 (10%) │
   │ Total: 2,887.50  │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ FIRE Order       │──► Status: FIRED
   │ → Kitchen        │
   └──────────────────┘

3. KITCHEN PREPARATION (KDS)
   ┌──────────────────┐
   │ Order appears    │
   │ Table: A-5       │
   │ Guests: 4        │
   │ Type: DINE_IN    │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Chef prepares    │
   │ Items: PREPARING │
   │ - Burger (GRILL) │
   │ - Pizza (KITCHEN)│
   │ - Coke (DRINKS)  │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ All items READY  │──► Status: READY
   │ → Waiter notified│
   └──────────────────┘

4. SERVICE
   ┌──────────────────┐
   │ Waiter serves    │
   │ food to table    │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Mark as SERVED   │──► Status: SERVED
   │ (Floor Mgmt)     │
   └──────────────────┘

5. BILLING & PAYMENT
   ┌──────────────────┐
   │ Customer ready   │
   │ to pay           │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Request Bill     │──► Status: BILL_REQUESTED
   │ (Floor Mgmt)     │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Process Payment  │
   │ Method: CASH     │
   │ Amount: 2,887.50 │
   │ Tendered: 3,000  │
   │ Change: 112.50   │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Order Status:    │──► Status: PAID
   │ PAID             │
   │                  │
   │ Table Status:    │
   │ DIRTY            │──► Ready for cleaning
   └──────────────────┘

6. TABLE CLEANUP
   ┌──────────────────┐
   │ Busser cleans    │
   │ table            │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Table Status:    │──► Status: AVAILABLE
   │ AVAILABLE        │
   │ Ready for next   │
   │ customers        │
   └──────────────────┘
```

### Key Features

#### 1. **Table Management**
```typescript
// Seating guests
await seatGuests(tableId, guestCount);

// Backend processing:
- Create dine_in_orders record
- Update table status: AVAILABLE → OCCUPIED
- Create order with status: DRAFT
- Link order to table
```

#### 2. **Guest Count Tracking**
```typescript
// Guest count can be adjusted
// Reductions are logged for audit
if (newCount < currentCount) {
  await tx.audit_logs.create({
    action_type: 'GUEST_COUNT_REDUCTION',
    entity_type: 'DINE_IN_ORDER',
    details: {
      old_count: currentCount,
      new_count: newCount,
      reason: 'Manual correction'
    }
  });
}
```

#### 3. **Service Charge Application**
```typescript
// Service charge only applies to DINE_IN
const serviceCharge = subtotal * 0.05; // 5%
```

#### 4. **Table Status Lifecycle**
```
AVAILABLE → OCCUPIED → DIRTY → CLEANING → AVAILABLE
```

### Database Schema

```sql
-- Dine-in specific table
CREATE TABLE dine_in_orders (
  id UUID PRIMARY KEY,
  order_id UUID UNIQUE REFERENCES orders(id),
  table_id UUID NOT NULL REFERENCES tables(id),
  guest_count INT NOT NULL,
  guest_count_history JSONB,
  waiter_id UUID REFERENCES staff(id),
  seated_at TIMESTAMP DEFAULT NOW()
);

-- Table management
CREATE TABLE tables (
  id UUID PRIMARY KEY,
  restaurant_id UUID NOT NULL,
  name VARCHAR(50) NOT NULL,
  section_id UUID REFERENCES sections(id),
  capacity INT DEFAULT 4,
  status VARCHAR(20) DEFAULT 'AVAILABLE',
  active_order_id VARCHAR(255),
  x_position INT,
  y_position INT,
  shape VARCHAR(20)
);
```

### Validation Rules

```typescript
// DineInService.ts
validateOrder(data, context) {
  if (context === 'FIRE') {
    if (!data.table_id) errors.push('table_id is required');
    if (!data.guest_count) errors.push('guest_count is required');
  }
  return { valid: errors.length === 0, errors };
}
```

---

## Takeaway Workflow

### 🎯 Use Case
Customers ordering for pickup (walk-in or phone orders).

### 📍 Primary Interface
**POS View** (`src/operations/pos/POSView.tsx`)

### Complete Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TAKEAWAY ORDER LIFECYCLE                          │
└─────────────────────────────────────────────────────────────────────┘

1. ORDER TAKING (POS)
   ┌──────────────────┐
   │ Customer calls   │
   │ or walks in      │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Staff enters:    │
   │ Type: TAKEAWAY   │
   │ Name: John Doe   │
   │ Phone: 0300-xxx  │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Add menu items:  │
   │ - Burger x3      │
   │ - Fries x2       │
   │ - Coke x3        │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Calculate Total  │
   │ Subtotal: 1,800  │
   │ Tax: 180 (10%)   │
   │ Total: 1,980     │
   │ (No service chr) │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ FIRE Order       │──► Status: FIRED
   │ → Kitchen        │
   │ TOKEN GENERATED  │
   │ Token: T007      │──► Auto-generated daily token
   │ Pickup: 20 mins  │──► Estimated time
   └──────────────────┘

2. TOKEN GENERATION
   ┌──────────────────┐
   │ System generates │
   │ daily token:     │
   │                  │
   │ Format: T###     │
   │ Today: T007      │
   │ Date: 2026-02-05 │
   │                  │
   │ Calculation:     │
   │ Base: 10 min     │
   │ + 2 min/item     │
   │ = 16 minutes     │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Print receipt    │
   │ with token       │
   │                  │
   │ ╔══════════════╗ │
   │ ║ TOKEN: T007  ║ │
   │ ║ Ready: 3:20PM║ │
   │ ║ Total: 1,980 ║ │
   │ ╚══════════════╝ │
   └──────────────────┘

3. KITCHEN PREPARATION (KDS)
   ┌──────────────────┐
   │ Order appears    │
   │ Token: T007      │
   │ Type: TAKEAWAY   │
   │ Customer: John   │
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
   │ → Counter staff  │
   │   notified       │
   └──────────────────┘

4. CUSTOMER PICKUP
   ┌──────────────────┐
   │ Customer arrives │
   │ "Token T007?"    │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Staff verifies   │
   │ token & order    │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Process Payment  │
   │ (if not prepaid) │
   │ Method: CASH     │
   │ Amount: 1,980    │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Hand over food   │
   │ Mark as:         │
   │ is_picked_up=true│──► Status: PAID
   │ actual_pickup_   │
   │ time: 3:18 PM    │
   └──────────────────┘

5. COMPLETION
   ┌──────────────────┐
   │ Order Status:    │──► Status: COMPLETED
   │ COMPLETED        │
   │                  │
   │ Token T007       │
   │ archived for day │
   └──────────────────┘
```

### Key Features

#### 1. **Daily Token System**
```typescript
// Auto-generates sequential tokens daily
// Format: T001, T002, T003, ..., T999
// Resets every day at midnight

// Token generation logic (TakeawayService.ts)
const today = new Date().toISOString().split('T')[0]; // "2026-02-05"

// Find existing tokens for today
const todaysTakeawayOrders = await tx.takeaway_orders.findMany({
  where: { token_date: today }
});

// Calculate next number
const maxNumber = Math.max(...existingTokenNumbers);
const nextNumber = maxNumber + 1;
const tokenNumber = `T${String(nextNumber).padStart(3, '0')}`; // "T007"
```

#### 2. **Estimated Pickup Time**
```typescript
// Dynamic calculation based on order complexity
const itemCount = data.items?.length || 1;
const baseMinutes = 10;
const perItemMinutes = 2;
const totalMinutes = Math.min(baseMinutes + (itemCount * perItemMinutes), 30);

// Example:
// 1 item: 10 + (1 × 2) = 12 minutes
// 5 items: 10 + (5 × 2) = 20 minutes
// 15 items: 10 + (15 × 2) = 30 minutes (capped)
```

#### 3. **Customer Lookup**
```typescript
// Phone-based customer lookup (same as delivery)
if (customerPhone.length >= 10) {
  const match = customers.find(c => c.phone.includes(customerPhone));
  if (match) {
    setCustomerName(match.name || '');
  }
}
```

#### 4. **No Service Charge**
```typescript
// Takeaway orders don't include service charge
const serviceCharge = type === 'TAKEAWAY' ? 0 : subtotal * 0.05;
```

### Database Schema

```sql
CREATE TABLE takeaway_orders (
  id UUID PRIMARY KEY,
  order_id UUID UNIQUE REFERENCES orders(id),
  token_number VARCHAR(10) NOT NULL,  -- "T001", "T002", etc.
  token_date VARCHAR(10),              -- "2026-02-05"
  customer_name VARCHAR(100),
  customer_phone VARCHAR(20),
  pickup_time TIMESTAMP,               -- Estimated
  actual_pickup_time TIMESTAMP,        -- When actually picked up
  is_picked_up BOOLEAN DEFAULT false,
  customer_id UUID REFERENCES customers(id),
  
  UNIQUE(order_id, token_number)
);
```

### Validation Rules

```typescript
// TakeawayService.ts
validateOrder(data, context) {
  // Minimal validation for takeaway
  // Token is auto-generated, so no manual input needed
  return { valid: true, errors: [] };
}
```

---

## Delivery Workflow

### 🎯 Use Case
Home delivery orders with driver assignment and cash settlement.

### 📍 Primary Interfaces
- **POS View** (order taking)
- **Logistics Hub** (dispatch & fleet management)

### Complete Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DELIVERY ORDER LIFECYCLE                          │
└─────────────────────────────────────────────────────────────────────┘

1. ORDER TAKING (POS)
   ┌──────────────────┐
   │ Customer calls   │
   │ Phone: 0300-xxx  │──► MANDATORY field
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Auto-lookup      │
   │ customer DB      │
   │ ✓ Name found     │
   │ ✓ Address found  │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Staff enters:    │
   │ Type: DELIVERY   │
   │ Phone: 0300-xxx  │──► Required
   │ Name: John Doe   │──► Recommended
   │ Address: House123│──► Required for firing
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Add menu items   │
   │ - Burger x2      │
   │ - Pizza x1       │
   │ - Coke x2        │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Calculate Total  │
   │ Subtotal: 1,500  │
   │ Tax: 150 (10%)   │
   │ Delivery: 200    │──► Delivery fee added
   │ Total: 1,850     │
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
   │ Type: 🚴 DELIVERY│
   │ Customer: John   │
   │ Phone: 0300-xxx  │
   │ Address: House123│
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
   │ Order #D7B873    │
   │ John Doe         │
   │ Rs. 1,850        │
   │ 15m ago          │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Manager selects  │
   │ 3 orders for     │
   │ batch dispatch   │
   │ ☑ #D7B873        │
   │ ☑ #D7B874        │
   │ ☑ #D7B875        │
   │ Total: Rs. 5,796 │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Assign to Rider  │
   │ Driver: Ali Khan │
   │ Float: Rs. 5,000 │──► Cash for change
   └────────┬─────────┘
            │
            ├──► Print delivery slips
            ├──► Update status: OUT_FOR_DELIVERY
            ├──► Update driver: cash_in_hand += 5000
            └──► Socket.IO broadcast

4. DELIVERY EXECUTION
   ┌──────────────────┐
   │ Rider receives:  │
   │ - 3 orders       │
   │ - Rs. 5,000 float│
   │ - Delivery slips │
   │ - GPS addresses  │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Deliver orders   │
   │ 1. House 123     │
   │    Rs. 1,850 ✓   │
   │ 2. Apartment 45  │
   │    Rs. 2,100 ✓   │
   │ 3. Office Tower  │
   │    Rs. 1,846 ✓   │
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Return to shop   │
   │ Cash collected:  │
   │ Rs. 5,796        │
   │ Float: Rs. 5,000 │
   │ Total: Rs. 10,796│
   └──────────────────┘

5. CASH SETTLEMENT
   ┌──────────────────┐
   │ Manager counts   │
   │ cash from rider  │
   │                  │
   │ Expected: 5,796  │
   │ Received: 5,796  │
   │ Float: 5,000     │
   │ Shortage: 0      │──► All good!
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ Process          │
   │ Settlement       │
   ├──────────────────┤
   │ ✓ Mark orders    │
   │   as PAID        │──► Status: PAID
   │ ✓ Update driver  │
   │   cash_in_hand   │──► -= 5000
   │ ✓ Create         │
   │   settlement     │
   │   record         │
   │ ✓ Create         │
   │   transactions   │
   └──────────────────┘

6. COMPLETION
   ┌──────────────────┐
   │ All orders:      │──► Status: COMPLETED
   │ COMPLETED        │
   │                  │
   │ Rider available  │
   │ for next batch   │
   └──────────────────┘
```

### Key Features

#### 1. **Mandatory Phone Validation**
```typescript
// POSView.tsx - Line 244
if (orderType === 'DELIVERY' && !customerPhone) {
  addNotification('error', '❌ Customer phone number is mandatory for delivery orders');
  return;
}

// Backend validation (DeliveryService.ts)
if (context === 'FIRE') {
  if (!data.delivery_address) errors.push('delivery_address is required');
  if (!data.customer_phone) errors.push('customer_phone is required');
}
```

#### 2. **Delivery Fee Calculation**
```typescript
// businessLogic.ts
const finalDeliveryFee = type === 'DELIVERY' 
  ? (deliveryFee !== undefined ? Number(deliveryFee) : settings.deliveryFeeDefault)
  : 0;

// Default: Rs. 200-250 (configurable per restaurant)
```

#### 3. **Driver Assignment & Float**
```typescript
// Logistics Hub - Batch dispatch
const handleBatchDispatch = async (driverId: string) => {
  for (const orderId of selectedOrderIds) {
    await assignDriverToOrder(orderId, driverId, floatAmount);
  }
  
  // Backend updates:
  // - orders.assigned_driver_id = driverId
  // - orders.status = 'OUT_FOR_DELIVERY'
  // - orders.float_given = floatAmount
  // - delivery_orders.driver_id = driverId
  // - delivery_orders.dispatched_at = NOW()
  // - staff.cash_in_hand += floatAmount
};
```

#### 4. **Cash Settlement**
```typescript
const settleRiderCash = async (settlement: RiderSettlement) => {
  // Calculate shortage
  const shortage = settlement.amountExpected - settlement.amountReceived;
  
  // Create settlement record
  await tx.rider_settlements.create({
    data: {
      driver_id: settlement.driverId,
      amount_expected: settlement.amountExpected,
      amount_received: settlement.amountReceived,
      amount_handed_over: settlement.amountReceived,
      shortage: shortage,
      processed_by: currentUser.id
    }
  });
  
  // Mark orders as paid
  await tx.orders.updateMany({
    where: { id: { in: settlement.orderIds } },
    data: { 
      is_settled_with_rider: true,
      status: 'PAID'
    }
  });
  
  // Update driver's cash
  await tx.staff.update({
    where: { id: settlement.driverId },
    data: { 
      cash_in_hand: { decrement: settlement.floatGiven }
    }
  });
};
```

### Database Schema

```sql
CREATE TABLE delivery_orders (
  id UUID PRIMARY KEY,
  order_id UUID UNIQUE REFERENCES orders(id),
  customer_name VARCHAR(100),
  customer_phone VARCHAR(20) NOT NULL,
  delivery_address TEXT,
  customer_id UUID REFERENCES customers(id),
  driver_id UUID REFERENCES staff(id),
  dispatched_at TIMESTAMP,
  float_given DECIMAL(10,2) DEFAULT 0,
  expected_return DECIMAL(10,2) DEFAULT 0,
  is_settled_with_rider BOOLEAN DEFAULT false
);

CREATE TABLE rider_settlements (
  id UUID PRIMARY KEY,
  restaurant_id UUID NOT NULL,
  driver_id UUID NOT NULL REFERENCES staff(id),
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  amount_collected DECIMAL(10,2),
  amount_expected DECIMAL(10,2),
  amount_handed_over DECIMAL(10,2),
  shortage DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'COMPLETED',
  processed_by UUID REFERENCES staff(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Validation Rules

```typescript
// DeliveryService.ts
validateOrder(data, context) {
  const errors = this.validateCommon(data, context);
  if (context === 'FIRE') {
    if (!data.delivery_address) errors.push('delivery_address is required');
    if (!data.customer_phone) errors.push('customer_phone is required');
  }
  return { valid: errors.length === 0, errors };
}
```

---

## Common Elements

### Shared Across All Order Types

#### 1. **Kitchen Display System (KDS)**

All order types appear in the KDS with type-specific badges:

```typescript
// KDSView.tsx
const orderBadge = {
  'DINE_IN': { icon: '🍽️', color: 'blue' },
  'TAKEAWAY': { icon: '📦', color: 'green' },
  'DELIVERY': { icon: '🚴', color: 'orange' }
};

// Item status progression (same for all types)
FIRED → PREPARING → READY → SERVED
```

#### 2. **Financial Calculations**

```typescript
// businessLogic.ts - calculateOrderTotal()
export function calculateOrderTotal(
  items: OrderItem[],
  type: OrderType,
  guestCount: number,
  deliveryFee?: number
): PaymentBreakdown {
  // 1. Calculate subtotal
  const subtotal = items.reduce((sum, item) => 
    sum + (item.unit_price * item.quantity), 0
  );
  
  // 2. Apply service charge (DINE_IN only)
  const serviceCharge = type === 'DINE_IN' 
    ? subtotal * settings.serviceChargeRate / 100
    : 0;
  
  // 3. Calculate tax (all types)
  const taxableAmount = subtotal + serviceCharge;
  const tax = settings.taxEnabled 
    ? taxableAmount * settings.taxRate / 100
    : 0;
  
  // 4. Add delivery fee (DELIVERY only)
  const finalDeliveryFee = type === 'DELIVERY'
    ? (deliveryFee || settings.deliveryFeeDefault)
    : 0;
  
  // 5. Calculate total
  const total = subtotal + serviceCharge + tax + finalDeliveryFee;
  
  return {
    subtotal,
    serviceCharge,
    tax,
    deliveryFee: finalDeliveryFee,
    discount: 0,
    total
  };
}
```

#### 3. **Order Status Management**

```typescript
// Common status transitions
export enum OrderStatus {
  DRAFT = 'DRAFT',           // Initial state
  FIRED = 'FIRED',           // Sent to kitchen
  PREPARING = 'PREPARING',   // Being cooked
  READY = 'READY',           // Ready for service/pickup/delivery
  SERVED = 'SERVED',         // DINE_IN: Food served
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY', // DELIVERY: With rider
  DELIVERED = 'DELIVERED',   // DELIVERY: Delivered to customer
  BILL_REQUESTED = 'BILL_REQUESTED', // DINE_IN: Customer wants bill
  PAID = 'PAID',             // Payment received
  COMPLETED = 'COMPLETED',   // Fully complete
  CANCELLED = 'CANCELLED',   // Cancelled
  VOIDED = 'VOIDED'          // Voided (with refund)
}
```

#### 4. **Real-time Updates (Socket.IO)**

```typescript
// All order types use Socket.IO for real-time updates
socket.on('order_status_changed', (data) => {
  // Update UI across all modules
  // - POS
  // - KDS
  // - Floor Management
  // - Logistics Hub
  // - Transactions
});

socket.on('table_change', (data) => {
  // DINE_IN specific
  // Update table status in real-time
});

socket.on('db_change_orders', (data) => {
  // Generic order updates
  // Refresh order lists
});
```

#### 5. **Customer Management**

```typescript
// Phone-based customer lookup (TAKEAWAY & DELIVERY)
useEffect(() => {
  if (cleanPhone.length >= 10 && 
      (orderType === 'TAKEAWAY' || orderType === 'DELIVERY')) {
    const match = customers.find(c => c.phone.includes(cleanPhone));
    if (match) {
      setCustomerName(match.name || '');
      setDeliveryAddress(match.address || ''); // DELIVERY only
    }
  }
}, [customerPhone, orderType]);
```

---

## Complete System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FIREFLOW ORDER MANAGEMENT SYSTEM                  │
└─────────────────────────────────────────────────────────────────────┘

                        ┌──────────────┐
                        │   POS VIEW   │
                        │ (Order Entry)│
                        └──────┬───────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
         ┌──────▼─────┐ ┌─────▼──────┐ ┌────▼──────┐
         │  DINE_IN   │ │  TAKEAWAY  │ │ DELIVERY  │
         │            │ │            │ │           │
         │ Table: A-5 │ │ Token: T007│ │ Phone: ✓  │
         │ Guests: 4  │ │ Pickup:20m │ │ Address: ✓│
         │ Service: ✓ │ │ Service: ✗ │ │ Service: ✗│
         └──────┬─────┘ └─────┬──────┘ └────┬──────┘
                │              │              │
                └──────────────┼──────────────┘
                               │
                        ┌──────▼───────┐
                        │  KDS (Kitchen)│
                        │              │
                        │ All orders   │
                        │ appear here  │
                        │ with badges  │
                        └──────┬───────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
         ┌──────▼─────┐ ┌─────▼──────┐ ┌────▼──────┐
         │   SERVED   │ │   READY    │ │   READY   │
         │            │ │            │ │           │
         │ Waiter     │ │ Customer   │ │ Logistics │
         │ serves     │ │ picks up   │ │ Hub       │
         │ at table   │ │ at counter │ │ dispatch  │
         └──────┬─────┘ └─────┬──────┘ └────┬──────┘
                │              │              │
                │              │         ┌────▼──────┐
                │              │         │  RIDER    │
                │              │         │ Delivery  │
                │              │         │ execution │
                │              │         └────┬──────┘
                │              │              │
         ┌──────▼─────┐ ┌─────▼──────┐ ┌────▼──────┐
         │BILL REQUEST│ │  PAYMENT   │ │SETTLEMENT │
         │            │ │            │ │           │
         │ Customer   │ │ Cash/Card  │ │ Cash      │
         │ ready      │ │ at counter │ │ from rider│
         └──────┬─────┘ └─────┬──────┘ └────┬──────┘
                │              │              │
                └──────────────┼──────────────┘
                               │
                        ┌──────▼───────┐
                        │     PAID     │
                        │              │
                        │ Transaction  │
                        │ recorded     │
                        └──────┬───────┘
                               │
                        ┌──────▼───────┐
                        │  COMPLETED   │
                        │              │
                        │ Order closed │
                        │ Table freed  │
                        └──────────────┘
```

---

## Database Schema

### Core Tables (All Order Types)

```sql
-- Main orders table
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  restaurant_id UUID NOT NULL,
  order_number VARCHAR(20) UNIQUE,
  status VARCHAR(50) NOT NULL,
  type VARCHAR(20) NOT NULL,  -- 'DINE_IN', 'TAKEAWAY', 'DELIVERY'
  total DECIMAL(10,2) DEFAULT 0,
  
  -- Common fields
  customer_name VARCHAR(100),
  customer_phone VARCHAR(20),
  guest_count INT,
  
  -- Financial
  service_charge DECIMAL(10,2) DEFAULT 0,
  delivery_fee DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  breakdown JSONB,
  
  -- Delivery specific (also on root for convenience)
  delivery_address TEXT,
  assigned_driver_id UUID REFERENCES staff(id),
  float_given DECIMAL(10,2) DEFAULT 0,
  expected_return DECIMAL(10,2) DEFAULT 0,
  is_settled_with_rider BOOLEAN DEFAULT false,
  
  -- Dine-in specific
  table_id UUID REFERENCES tables(id),
  assigned_waiter_id UUID REFERENCES staff(id),
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_action_by VARCHAR(255),
  last_action_desc TEXT,
  last_action_at TIMESTAMP,
  
  -- Cancellation/Void
  cancelled_at TIMESTAMP,
  cancelled_by VARCHAR(255),
  cancellation_reason TEXT,
  voided_at TIMESTAMP,
  voided_by VARCHAR(255),
  void_reason TEXT,
  
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  INDEX idx_type_status (type, status),
  INDEX idx_restaurant (restaurant_id),
  INDEX idx_table (table_id),
  INDEX idx_driver (assigned_driver_id)
);

-- Order items (common to all types)
CREATE TABLE order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id),
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  item_status VARCHAR(20) DEFAULT 'PENDING',
  station VARCHAR(50),
  station_id UUID REFERENCES stations(id),
  special_instructions TEXT,
  modifications JSONB,
  item_name VARCHAR(100),
  category VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_order (order_id),
  INDEX idx_station (station_id),
  INDEX idx_status (item_status)
);
```

### Type-Specific Extension Tables

```sql
-- Dine-in orders extension
CREATE TABLE dine_in_orders (
  id UUID PRIMARY KEY,
  order_id UUID UNIQUE NOT NULL REFERENCES orders(id),
  table_id UUID NOT NULL REFERENCES tables(id),
  guest_count INT NOT NULL,
  guest_count_history JSONB,
  waiter_id UUID REFERENCES staff(id),
  seated_at TIMESTAMP DEFAULT NOW()
);

-- Takeaway orders extension
CREATE TABLE takeaway_orders (
  id UUID PRIMARY KEY,
  order_id UUID UNIQUE NOT NULL REFERENCES orders(id),
  token_number VARCHAR(10) NOT NULL,
  token_date VARCHAR(10),  -- YYYY-MM-DD
  customer_name VARCHAR(100),
  customer_phone VARCHAR(20),
  pickup_time TIMESTAMP,
  actual_pickup_time TIMESTAMP,
  is_picked_up BOOLEAN DEFAULT false,
  customer_id UUID REFERENCES customers(id),
  
  UNIQUE(order_id, token_number)
);

-- Delivery orders extension
CREATE TABLE delivery_orders (
  id UUID PRIMARY KEY,
  order_id UUID UNIQUE NOT NULL REFERENCES orders(id),
  customer_name VARCHAR(100),
  customer_phone VARCHAR(20) NOT NULL,
  delivery_address TEXT,
  customer_id UUID REFERENCES customers(id),
  driver_id UUID REFERENCES staff(id),
  dispatched_at TIMESTAMP,
  float_given DECIMAL(10,2) DEFAULT 0,
  expected_return DECIMAL(10,2) DEFAULT 0,
  is_settled_with_rider BOOLEAN DEFAULT false
);
```

---

## API Endpoints

### Order Management (All Types)

```http
# Create order (any type)
POST /api/orders
{
  "type": "DINE_IN" | "TAKEAWAY" | "DELIVERY",
  "status": "DRAFT" | "FIRED",
  "table_id": "uuid",           // DINE_IN only
  "guest_count": 4,             // DINE_IN only
  "customer_name": "John Doe",  // TAKEAWAY, DELIVERY
  "customer_phone": "0300-xxx", // TAKEAWAY, DELIVERY (required for DELIVERY)
  "delivery_address": "...",    // DELIVERY only
  "order_items": [...],
  "total": 2887.50,
  "service_charge": 125,
  "tax": 262.5,
  "delivery_fee": 200           // DELIVERY only
}

# Update order
PATCH /api/orders/:id
{
  "status": "PREPARING",
  "guest_count": 3,  // DINE_IN only
  ...
}

# Get orders (with type filter)
GET /api/orders?type=DINE_IN
GET /api/orders?type=TAKEAWAY
GET /api/orders?type=DELIVERY
GET /api/orders?status=READY
```

### Dine-In Specific

```http
# Seat guests (creates order)
POST /api/tables/:tableId/seat
{
  "guestCount": 4
}

# Update table status
PATCH /api/tables/:tableId/status
{
  "status": "OCCUPIED" | "DIRTY" | "AVAILABLE"
}

# Request bill
PATCH /api/orders/:orderId/status
{
  "status": "BILL_REQUESTED"
}
```

### Takeaway Specific

```http
# Get today's takeaway orders (with tokens)
GET /api/orders?type=TAKEAWAY&date=2026-02-05

# Mark as picked up
PATCH /api/orders/:orderId
{
  "is_picked_up": true,
  "actual_pickup_time": "2026-02-05T15:18:00Z"
}
```

### Delivery Specific

```http
# Assign driver
POST /api/orders/:orderId/assign-driver
{
  "driverId": "uuid",
  "floatAmount": 5000
}

# Settle rider cash
POST /api/riders/settle
{
  "driverId": "uuid",
  "orderIds": ["uuid1", "uuid2", "uuid3"],
  "amountExpected": 5796,
  "amountReceived": 5796,
  "floatGiven": 5000,
  "shortage": 0,
  "processedBy": "manager-uuid",
  "notes": "All orders delivered successfully"
}

# Get delivery orders by status
GET /api/orders?type=DELIVERY&status=OUT_FOR_DELIVERY
GET /api/orders?type=DELIVERY&driver_id=uuid
```

### Payment (All Types)

```http
# Process payment
POST /api/orders/:orderId/payment
{
  "method": "CASH" | "CARD" | "RAAST",
  "amount": 2887.50,
  "tenderedAmount": 3000,
  "changeGiven": 112.50,
  "processedBy": "staff-uuid"
}
```

---

## Code References

### Frontend Components

| Component | File | Order Types | Purpose |
|-----------|------|-------------|---------|
| **POSView** | `src/operations/pos/POSView.tsx` | All | Order entry interface |
| **FloorManagementView** | `src/operations/dashboard/FloorManagementView.tsx` | DINE_IN | Table & floor management |
| **LogisticsHub** | `src/operations/logistics/LogisticsHub.tsx` | DELIVERY | Dispatch & fleet management |
| **KDSView** | `src/operations/kds/KDSView.tsx` | All | Kitchen display system |
| **TableCard** | `src/operations/dashboard/components/TableCard.tsx` | DINE_IN | Individual table display |
| **BillPreviewModal** | `src/operations/pos/components/BillPreviewModal.tsx` | All | Order summary & bill |

### Backend Services

| Service | File | Order Type | Purpose |
|---------|------|------------|---------|
| **DineInService** | `src/api/services/orders/DineInService.ts` | DINE_IN | Dine-in validation & logic |
| **TakeawayService** | `src/api/services/orders/TakeawayService.ts` | TAKEAWAY | Token generation & pickup |
| **DeliveryService** | `src/api/services/orders/DeliveryService.ts` | DELIVERY | Delivery validation & driver assignment |
| **BaseOrderService** | `src/api/services/orders/BaseOrderService.ts` | All | Common order operations |
| **OrderServiceFactory** | `src/api/services/orders/OrderServiceFactory.ts` | All | Service selection by type |

### Utilities & Logic

| Utility | File | Purpose |
|---------|------|---------|
| **businessLogic** | `src/shared/utils/businessLogic.ts` | Financial calculations (tax, service charge, delivery fee) |
| **socketClient** | `src/shared/lib/socketClient.ts` | Real-time updates via Socket.IO |
| **orderService** | `src/shared/lib/orderService.ts` | Client-side order operations |

### Type Definitions

| Type | File | Purpose |
|------|------|---------|
| **Order** | `src/shared/types.ts` | Main order interface |
| **DineInOrder** | `src/shared/types.ts` | Dine-in specific fields |
| **TakeawayOrder** | `src/shared/types.ts` | Takeaway specific fields |
| **DeliveryOrder** | `src/shared/types.ts` | Delivery specific fields |
| **OrderStatus** | `src/shared/types.ts` | Status enum |
| **OrderType** | `src/shared/types.ts` | Type enum |

---

## Summary

Fireflow's order management system provides a **unified yet flexible** approach to handling three distinct order types:

### 🍽️ **Dine-In**
- **Focus**: Table management & guest experience
- **Key Feature**: Real-time floor visualization
- **Payment**: After meal
- **Service Charge**: Yes (5%)

### 📦 **Takeaway**
- **Focus**: Quick pickup & token system
- **Key Feature**: Daily auto-generated tokens
- **Payment**: Before or after
- **Service Charge**: No

### 🚴 **Delivery**
- **Focus**: Fleet management & cash settlement
- **Key Feature**: Driver assignment & float tracking
- **Payment**: On delivery
- **Delivery Fee**: Yes (Rs. 200-250)

All three types share:
- ✅ Common KDS workflow
- ✅ Real-time Socket.IO updates
- ✅ Unified financial calculations
- ✅ Customer management
- ✅ Order status tracking
- ✅ Audit logging

---

**Document Version**: 1.0  
**Last Updated**: February 5, 2026  
**Author**: Fireflow Development Team
