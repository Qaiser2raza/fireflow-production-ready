# 🧠 Fireflow Complete System Specification
## Intelligent Operations Platform - Single Source of Truth

**Purpose**: THE authoritative reference for building, maintaining, and enhancing Fireflow  
**Version**: 3.0 (Corrected & Enhanced Edition)  
**Last Updated**: February 8, 2026  
**For**: AI Assistants, Developers, System Architects

---

## 📐 **SYSTEM ARCHITECTURE OVERVIEW**

### **Design Philosophy**

Fireflow is **NOT a traditional POS** - it's an **Intelligent Operations Assistant**.

```
Layer 3: 🧠 INTELLIGENCE (AI Decision Support)
         ↓ Predicts outcomes, guides decisions, auto-heals
         ↓ Self-healing, bottleneck detection, recommendations
         
Layer 2: ⚙️ OPERATIONS (Business Logic)
         ↓ Order lifecycle, transactions, validations
         ↓ Flexible rules with audit trail
         
Layer 1: 💾 DATA (Persistent State)
         ↓ Database schema, relationships
         ↓ Single source of truth
```

**Core Principles**:
1. **Intelligence assists, never blocks** - Guide users to optimal decisions
2. **Self-healing by default** - Auto-recover from data corruption
3. **Predictive, not reactive** - Detect problems before they escalate
4. **Extensible architecture** - Add features without refactoring
5. **Real-world pragmatic** - Works in restaurant chaos, not just theory

---

## 💾 **LAYER 1: DATABASE SCHEMA**

### **Status Enums (CORRECTED)**

**CRITICAL**: Use these exact enums. Previous versions had conflicts.

```prisma
enum OrderStatus {
  ACTIVE       // Working on it (DRAFT/CONFIRMED/PREPARING combined)
  READY        // Can be paid (all items done OR manager forced)
  CLOSED       // Complete (paid, table released)
  CANCELLED    // Cancelled before or after fire
  VOIDED       // Voided after payment (requires manager PIN)
}

enum ItemStatus {
  DRAFT        // Saved in POS, NOT sent to kitchen (Held)
  PENDING      // Sent to kitchen, waiting
  PREPARING    // Kitchen actively working on it
  DONE         // Kitchen finished
  SERVED       // Delivered to customer (DINE_IN only)
  SKIPPED      // Forced ready by staff (not actually made)
}

enum PaymentStatus {
  UNPAID
  PAID
  PARTIALLY_PAID
  REFUNDED
}
```

**Migration from v2.0**:
- Old `DRAFT` → New `ACTIVE`
- Old `CONFIRMED` → New `ACTIVE`
- Old `COMPLETED` → New `CLOSED`
- Old `BILL_REQUESTED` → New `READY`

### **Core Tables**

#### **orders** (Primary record)
```prisma
model orders {
  id                  String         @id @default(uuid())
  restaurant_id       String
  order_number        String         @unique
  
  // Status tracking
  status              OrderStatus    @default(ACTIVE)
  payment_status      PaymentStatus  @default(UNPAID)
  type                OrderType      // DINE_IN, TAKEAWAY, DELIVERY
  
  // Financial
  total               Decimal        @default(0)
  tax                 Decimal        @default(0)
  service_charge      Decimal        @default(0)
  discount            Decimal        @default(0)
  breakdown           Json           // Itemized totals
  
  // Type-specific links
  table_id            String?        // DINE_IN only
  customer_id         String?        // All types (optional)
  assigned_waiter_id  String?        // DINE_IN only
  assigned_driver_id  String?        // DELIVERY only
  
  // Intelligence tracking (NEW)
  predicted_complete_time  DateTime?
  bottleneck_detected      Boolean    @default(false)
  force_settled_at         DateTime?  // When staff forced payment
  force_settled_by         String?    // Staff who forced
  
  // Timestamps
  created_at          DateTime       @default(now())
  updated_at          DateTime       @default(now())
  last_action_at      DateTime?
  last_action_desc    String?
  
  // Relations
  order_items         order_items[]
  dine_in_orders      dine_in_orders?
  takeaway_orders     takeaway_orders?
  delivery_orders     delivery_orders?
  order_intelligence  order_intelligence?
}
```

#### **order_items** (Revenue tracking)
```prisma
model order_items {
  id                   String     @id @default(uuid())
  order_id             String
  menu_item_id         String
  
  // Quantities & pricing
  quantity             Int
  unit_price           Decimal    // SNAPSHOT (prevents price drift)
  total_price          Decimal
  
  // Status
  item_status          ItemStatus  @default(PENDING)
  
  // Kitchen routing
  station_id           String?     // SNAPSHOT (prevents routing changes)
  
  // Customization
  special_instructions String?
  modifications        Json?
  
  // Snapshots (for historical accuracy)
  item_name            String?     // Name at time of order
  category             String?     // Category at time of order
  
  // Timestamps
  created_at           DateTime    @default(now())
  started_at           DateTime?   // When fired to kitchen
  completed_at         DateTime?   // When marked done
  served_at            DateTime?   // When delivered to customer
  
  // Intelligence tracking (NEW)
  predicted_ready_time DateTime?
  force_ready_at       DateTime?   // If skipped by staff
  force_ready_by       String?
}
```

#### **order_intelligence** (NEW - AI tracking)
```prisma
model order_intelligence {
  id                        String   @id @default(uuid())
  order_id                  String   @unique
  
  // Predictions
  predicted_complete_time   DateTime
  predicted_duration_mins   Int
  prediction_confidence     Decimal  // 0.00 to 1.00
  
  // Actuals (for learning)
  actual_complete_time      DateTime?
  actual_duration_mins      Int?
  prediction_accuracy       Decimal?
  
  // Anomaly detection
  is_anomaly                Boolean  @default(false)
  anomaly_type              String?
  anomaly_severity          String?
  
  // Decision assistance
  recommendations_given     Json[]   // What AI suggested
  recommendation_followed   Boolean? // Did user follow advice?
  outcome_rating            Int?     // 1-5 stars (feedback loop)
  
  orders                    orders   @relation(fields: [order_id], references: [id])
}
```

### **Type Extensions (1:1 with orders)**

#### **dine_in_orders**
```prisma
model dine_in_orders {
  id                  String   @id @default(uuid())
  order_id            String   @unique
  table_id            String
  guest_count         Int
  guest_count_history Json?    // Tracks changes
  waiter_id           String?
  seated_at           DateTime @default(now())
}
```

#### **takeaway_orders**
```prisma
model takeaway_orders {
  id                 String    @id @default(uuid())
  order_id           String    @unique
  token_number       String    // Format: T001, T002, etc.
  token_date         String?   // YYYY-MM-DD (for daily reset)
  customer_name      String?
  customer_phone     String?
  pickup_time        DateTime? // Estimated ready time
  actual_pickup_time DateTime? // When actually picked up
  is_picked_up       Boolean   @default(false)
  customer_id        String?
}
```

#### **delivery_orders**
```prisma
model delivery_orders {
  id                    String    @id @default(uuid())
  order_id              String    @unique
  customer_name         String?
  customer_phone        String
  delivery_address      String?   // REQUIRED before fire
  customer_id           String?
  driver_id             String?
  
  // Dispatch tracking
  dispatched_at         DateTime?
  delivered_at          DateTime?
  delivery_duration_minutes Int?
  
  // Rider float
  float_given           Decimal   @default(0)
  expected_return       Decimal   @default(0)
  is_settled_with_rider Boolean   @default(false)
  
  // GPS tracking (NEW)
  current_lat           Decimal?
  current_lng           Decimal?
  last_location_update  DateTime?
  
  // Failure handling
  failed_reason         String?
}
```

---

## ⚙️ **LAYER 2: ORDER LIFECYCLE (Operations)**

### **Phase 1: Order Initiation**

#### **Common for All Types**

**User Action**: Create new order  
**System Creates**:
1. Base `orders` record (status: ACTIVE, payment_status: UNPAID)
2. Type-specific extension (dine_in/takeaway/delivery)
3. Initial `order_intelligence` record

**CRITICAL**: Everything in ONE atomic transaction.

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Create base order
  const order = await tx.orders.create({
    data: {
      restaurant_id,
      order_number: generateOrderNumber(),
      type,
      status: 'ACTIVE',
      payment_status: 'UNPAID'
    }
  });
  
  // 2. Create type extension
  if (type === 'DINE_IN') {
    await tx.dine_in_orders.create({
      data: { order_id: order.id, table_id, guest_count }
    });
    
    // 3. Lock table (prevent double-seating)
    await tx.tables.update({
      where: { id: table_id },
      data: { 
        status: 'OCCUPIED', 
        active_order_id: order.id 
      }
    });
  }
  // ... similar for TAKEAWAY, DELIVERY
  
  // 4. Initialize intelligence
  const prediction = await predictCompletionTime(order);
  await tx.order_intelligence.create({
    data: {
      order_id: order.id,
      predicted_complete_time: prediction.time,
      predicted_duration_mins: prediction.durationMins,
      prediction_confidence: prediction.confidence
    }
  });
  
  return order;
});
```

**Validation Rules**:
- ✅ DINE_IN: `table_id` REQUIRED, table must be AVAILABLE
- ✅ DELIVERY: `delivery_address` REQUIRED before fire
- ✅ All types: `restaurant_id` REQUIRED
- ❌ DON'T validate items at creation (allow empty orders initially)

---

### **Phase 2: Item Selection**

**User Actions**: Add/remove menu items, adjust quantities, add instructions

**System Behavior**:
- Items saved immediately (no "draft" mode needed)
- Price SNAPSHOT from menu_items (prevents drift)
- Station SNAPSHOT (prevents routing changes)
- Order total recalculated on every change

```typescript
// Add item as DRAFT
await prisma.order_items.create({
  data: {
    order_id,
    menu_item_id,
    quantity,
    unit_price: menuItem.price,        // SNAPSHOT
    total_price: menuItem.price * quantity,
    item_name: menuItem.name,          // SNAPSHOT
    category: menuItem.category,       // SNAPSHOT
    station_id: menuItem.station_id,   // SNAPSHOT
    item_status: 'DRAFT',              // Held by waiter, invisible to KDS
    special_instructions
  }
});

// Recalculate order total
const itemsTotal = await calculateItemsTotal(order_id);
const tax = itemsTotal * restaurant.tax_rate / 100;
const serviceCharge = type === 'DINE_IN' 
  ? itemsTotal * restaurant.service_charge_rate / 100 
  : 0;

await prisma.orders.update({
  where: { id: order_id },
  data: {
    total: itemsTotal + tax + serviceCharge,
    breakdown: {
      items: itemsTotal,
      tax,
      service_charge: serviceCharge,
      discount: 0
    }
  }
});
```

**Business Rules**:
- ✅ Can modify items while status = ACTIVE
- ⚠️ Changing items after READY requires manager override (audit logged)
- ❌ CANNOT modify items after payment_status = PAID

---

### **Phase 3: Fire (Kitchen Dispatch)**

**User Action**: Click "FIRE ORDER"

**System Logic** (CORRECTED from v2.0):

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Update order status
  await tx.orders.update({
    where: { id: order_id },
    data: {
      status: 'ACTIVE',  // Confirmed, in progress
      last_action_at: now(),
      last_action_desc: 'Order fired to kitchen'
    }
  });
  
  // 2. Update item statuses (CONDITIONAL)
  const items = await tx.order_items.findMany({
    where: { order_id },
    include: { menu_items: true }
  });
  
  for (const item of items) {
    if (item.item_status !== 'DRAFT') continue; // Only fire draft items
    
    const requiresPrep = item.menu_items.requires_prep;
    
    await tx.order_items.update({
      where: { id: item.id },
      data: {
        item_status: requiresPrep ? 'PENDING' : 'DONE',
        started_at: now(),
        station_id: item.station_id || item.menu_items.station_id
      }
    });
  }
  
  // 3. TAKEAWAY: Generate token
  if (order.type === 'TAKEAWAY') {
    const token = await generateDailyToken(tx);
    await tx.takeaway_orders.update({
      where: { order_id },
      data: {
        token_number: token,
        token_date: format(now(), 'yyyy-MM-DD'),
        pickup_time: await estimatePickupTime(items)
      }
    });
  }
  
  // 4. Broadcast to KDS (Socket.IO)
  const itemsForKDS = items.filter(i => i.item_status === 'PENDING');
  if (itemsForKDS.length > 0) {
    io.emit('NEW_KITCHEN_ORDER', {
      order_id,
      order_number: order.order_number,
      type: order.type,
      table: order.type === 'DINE_IN' ? table.name : null,
      items: itemsForKDS.map(i => ({
        id: i.id,
        name: i.item_name,
        quantity: i.quantity,
        station: i.station_id,
        instructions: i.special_instructions
      }))
    });
  }
  
  // 5. Audit log
  await tx.audit_logs.create({
    data: {
      action_type: 'ORDER_FIRED',
      entity_type: 'ORDER',
      entity_id: order_id,
      staff_id: current_user_id,
      details: { 
        items_count: items.length,
        items_to_kitchen: itemsForKDS.length
      }
    }
  });
});
```

**Token Generation Logic** (TAKEAWAY):
```typescript
async function generateDailyToken(tx) {
  const today = format(new Date(), 'yyyy-MM-DD');
  
  const lastToken = await tx.takeaway_orders.findFirst({
    where: { token_date: today },
    orderBy: { token_number: 'desc' }
  });
  
  const nextNum = lastToken 
    ? parseInt(lastToken.token_number.replace('T', '')) + 1 
    : 1;
  
  return `T${String(nextNum).padStart(3, '0')}`; // T001, T002, etc.
}
```

**Validation Before Fire**:
- ✅ Order must have at least 1 item
- ✅ DELIVERY must have delivery_address
- ✅ Table must still be OCCUPIED (DINE_IN)
- ❌ DON'T validate item preparation (kitchen handles that)

---

### **Phase 4: Kitchen Production (KDS Flow)**

**KDS Actions**:
1. Chef sees order on station screen
2. Marks item "PREPARING" (optional, visual only)
3. Marks item "DONE" when complete

**System Updates**:
```typescript
// Chef marks item DONE
await prisma.order_items.update({
  where: { id: item_id },
  data: {
    item_status: 'DONE',
    completed_at: now()
  }
});

// Check if ALL items done
const order = await prisma.orders.findUnique({
  where: { id: order_id },
  include: { order_items: true }
});

const allDone = order.order_items.every(i => 
  ['DONE', 'SERVED', 'SKIPPED'].includes(i.item_status)
);

if (allDone) {
  // Auto-advance to READY
  await prisma.orders.update({
    where: { id: order_id },
    data: { status: 'READY' }
  });
  
  // Notify cashier/waiter
  io.emit('ORDER_READY', {
    order_id,
    order_number: order.order_number,
    type: order.type
  });
}
```

**Real-Time Updates** (Socket.IO):
```typescript
// Server broadcasts
io.emit('db_change', {
  table: 'order_items',
  eventType: 'UPDATE',
  data: updatedItem
});

// Clients listen
socket.on('db_change', (event) => {
  if (event.table === 'order_items') {
    // Update UI
  }
});
```

---

### **Phase 5: Settlement & Payment**

#### **A. Normal Flow** (All items ready)

```typescript
// Simple case - just process payment
if (allItemsReady) {
  await processPayment(order_id, payment_method, staff_id);
}
```

#### **B. Complex Flow** (Items NOT ready) - **INTELLIGENCE LAYER**

**CRITICAL CHANGE from v2.0**: Don't BLOCK - ASSIST!

```typescript
async function settleOrder(order_id, staff_id, options = {}) {
  const order = await getOrderWithContext(order_id);
  const itemsNotReady = order.order_items.filter(
    i => !['DONE', 'SERVED'].includes(i.item_status)
  );
  
  if (itemsNotReady.length === 0) {
    // Normal flow
    return await processPayment(order_id, options.payment_method, staff_id);
  }
  
  // Items not ready - invoke AI guidance
  if (!options.forceSettle) {
    const guidance = await DecisionEngine.analyzeSettlement(order_id);
    
    return {
      requiresDecision: true,
      itemsNotReady: itemsNotReady.map(i => ({
        name: i.item_name,
        estimatedReadyIn: await predictCompletionTime(i)
      })),
      customerContext: guidance.customerContext,
      recommendations: guidance.recommendations
    };
  }
  
  // User chose to force settle
  return await processForceSettlement(order_id, staff_id, options);
}

async function processForceSettlement(order_id, staff_id, options) {
  await prisma.$transaction(async (tx) => {
    // 1. Mark pending items as SKIPPED
    await tx.order_items.updateMany({
      where: {
        order_id,
        item_status: { notIn: ['DONE', 'SERVED'] }
      },
      data: {
        item_status: 'SKIPPED',
        force_ready_at: now(),
        force_ready_by: staff_id
      }
    });
    
    // 2. Update order
    await tx.orders.update({
      where: { id: order_id },
      data: {
        status: 'READY',
        force_settled_at: now(),
        force_settled_by: staff_id
      }
    });
    
    // 3. Process payment
    await processPayment(tx, order_id, options.payment_method, staff_id);
    
    // 4. Audit log
    await tx.audit_logs.create({
      data: {
        action_type: 'FORCED_SETTLEMENT',
        entity_type: 'ORDER',
        entity_id: order_id,
        staff_id,
        details: {
          items_skipped: itemsNotReady.length,
          reason: options.reason || 'Customer request'
        }
      }
    });
  });
}
```

#### **C. Payment Processing**

```typescript
async function processPayment(tx, order_id, payment_method, staff_id) {
  const order = await tx.orders.findUnique({
    where: { id: order_id },
    include: { dine_in_orders: true, tables: true }
  });
  
  // 1. Create transaction record
  await tx.transactions.create({
    data: {
      restaurant_id: order.restaurant_id,
      order_id,
      amount: order.total,
      payment_method,
      status: 'COMPLETED'
    }
  });
  
  // 2. Update order status
  await tx.orders.update({
    where: { id: order_id },
    data: {
      status: 'CLOSED',
      payment_status: 'PAID'
    }
  });
  
  // 3. Type-specific cleanup
  if (order.type === 'DINE_IN') {
    await tx.tables.update({
      where: { id: order.table_id },
      data: {
        status: 'DIRTY',
        active_order_id: null
      }
    });
  }
  
  if (order.type === 'TAKEAWAY') {
    await tx.takeaway_orders.update({
      where: { order_id },
      data: {
        is_picked_up: true,
        actual_pickup_time: now()
      }
    });
  }
  
  // 4. Service charge distribution (if applicable)
  if (order.service_charge > 0) {
    await distributeServiceCharge(
      tx, 
      order.service_charge, 
      order.restaurant_id,
      order.assigned_waiter_id
    );
  }
}
```

**Service Charge Distribution** (NEW implementation):
```typescript
async function distributeServiceCharge(tx, amount, restaurant_id, waiter_id) {
  // Log to staff wallet
  await tx.staff_wallet_logs.create({
    data: {
      restaurant_id,
      staff_id: waiter_id,
      amount,
      action_type: 'SERVICE_CHARGE_CREDIT',
      reference_id: order_id,
      notes: 'Service charge from completed order'
    }
  });
  
  // Update staff record (if tracking cumulative)
  // Implementation depends on wallet system design
}
```

---

## 🧠 **LAYER 3: INTELLIGENCE (AI Decision Support)**

### **Self-Healing Engine**

**Purpose**: Automatically detect and fix data corruption

**Runs**: Every 30 seconds in background

```typescript
class AutoHealingService {
  async detectAndHealInconsistencies() {
    // 1. Stuck tables
    const stuckTables = await prisma.tables.findMany({
      where: {
        status: 'OCCUPIED',
        active_order_id: null
      }
    });
    
    for (const table of stuckTables) {
      const orphanedOrder = await prisma.orders.findFirst({
        where: {
          table_id: table.id,
          payment_status: 'UNPAID',
          status: { notIn: ['CANCELLED', 'VOIDED'] }
        }
      });
      
      if (orphanedOrder) {
        // Reconnect
        await prisma.tables.update({
          where: { id: table.id },
          data: { active_order_id: orphanedOrder.id }
        });
        await this.logHealing('TABLE_RECONNECTION', table.id);
      } else {
        // Release
        await prisma.tables.update({
          where: { id: table.id },
          data: { status: 'AVAILABLE' }
        });
        await this.logHealing('TABLE_RELEASE', table.id);
      }
    }
    
    // 2. Orphaned items
    // 3. Status mismatches
    // 4. Missing transactions
    // ... more patterns
  }
}
```

---

### **Decision Assistance Engine**

**Purpose**: Guide staff to optimal decisions

**Example: Settlement Recommendation**

```typescript
class DecisionEngine {
  async analyzeSettlement(order_id) {
    const order = await getOrderWithContext(order_id);
    const itemsNotReady = order.order_items.filter(/** ... */);
    
    const recommendations = [];
    
    // Rec 1: Only non-essentials pending
    if (itemsNotReady.every(i => i.category === 'DESSERT')) {
      recommendations.push({
        action: 'SETTLE_NOW_DELIVER_LATER',
        confidence: 0.88,
        reasoning: 'Only desserts pending. Settle now, serve when ready.',
        script: 'Your desserts will be ready in ~3 minutes. Would you like to settle now?'
      });
    }
    
    // Rec 2: High-value customer + delay
    const customer = await getCustomerContext(order.customer_id);
    if (customer.lifetimeValue > 50000 && hasSignificantDelay) {
      recommendations.push({
        action: 'GOODWILL_DISCOUNT',
        confidence: 0.92,
        reasoning: 'Valuable regular customer. Protect relationship.',
        discountAmount: Math.min(order.total * 0.10, 500),
        script: 'Apologies for the delay. Let me apply a courtesy discount.'
      });
    }
    
    // ... more recommendations
    
    return {
      recommendations: recommendations.sort((a, b) => b.confidence - a.confidence),
      customerContext: customer,
      itemsNotReady
    };
  }
}
```

---

## 🛡️ **CRITICAL IMPLEMENTATION RULES**

### **For AI Assistants Building This System**

1. **ALWAYS use transactions** for multi-step operations
   ```typescript
   // ✅ CORRECT
   await prisma.$transaction(async (tx) => {
     await tx.orders.create({...});
     await tx.dine_in_orders.create({...});
     await tx.tables.update({...});
   });
   
   // ❌ WRONG
   await prisma.orders.create({...});
   await prisma.dine_in_orders.create({...});  // Could fail, leaving orphan
   ```

2. **SNAPSHOT prices and metadata** when creating order_items
   ```typescript
   // ✅ CORRECT
   unit_price: menuItem.price,      // Never reference menu_items.price later
   item_name: menuItem.name,        // Historical accuracy
   
   // ❌ WRONG
   unit_price: { connect: { menu_item_id } }  // Price can change!
   ```

3. **VALIDATE before destructive actions**, not before creates
   ```typescript
   // ✅ CORRECT: Allow empty orders, validate on Fire
   if (action === 'FIRE' && items.length === 0) {
     throw new Error('Cannot fire empty order');
   }
   
   // ❌ WRONG: Don't block order creation
   if (items.length === 0) {
     throw new Error(...)  // User can't even start!
   }
   ```

4. **NEVER block operations** - assist with recommendations instead
   ```typescript
   // ✅ CORRECT
   if (itemsNotReady) {
     return { requiresDecision: true, recommendations: [...] };
   }
   
   // ❌ WRONG
   if (itemsNotReady) {
     throw new Error('Items not ready');  // Blocks legitimate override
   }
   ```

5. **ALWAYS broadcast real-time updates** (Socket.IO)
   ```typescript
   // After every data change
   io.emit('db_change', {
     table: 'orders',
     eventType: 'UPDATE',
     data: updatedOrder
   });
   ```

---

## 🗺️ **COMPLETE RELATIONSHIP MAP**

```
restaurants
   ├── orders (1:N)
   │   ├── order_items (1:N)
   │   │   └── menu_items (N:1, SNAPSHOT)
   │   │   └── stations (N:1, SNAPSHOT)
   │   ├── dine_in_orders (1:1)
   │   │   └── tables (N:1)
   │   ├── takeaway_orders (1:1)
   │   ├── delivery_orders (1:1)
   │   │   └── staff [driver] (N:1)
   │   ├── transactions (1:N, usually 1:1)
   │   └── order_intelligence (1:1)
   ├── tables (1:N)
   ├── menu_items (1:N)
   └── staff (1:N)
```

---

## 📊 **STATUS TRANSITION DIAGRAMS**

### **Order-Level Status**

```
ACTIVE ────┬───> READY ───> CLOSED
           │
           ├───> CANCELLED
           │
           └───> (After payment) ─> VOIDED
```

### **Item-Level Status**

```
PENDING ───> PREPARING ───> DONE ───> SERVED
   │                                     
   └─────> (Manager override) ───> SKIPPED
```

---

## 🎯 **DELIVERY PRIORITIES**

### **Phase 1: Core Functionality** (Ship First)
- ✅ All 3 order types (DINE_IN, TAKEAWAY, DELIVERY)
- ✅ Fire to KDS with real-time updates
- ✅ Payment processing
- ✅ Table locking/releasing
- ✅ Token generation (TAKEAWAY)

### **Phase 2: Intelligence Layer** (Add After Delivery)
- 🚧 Self-healing engine
- 🚧 Decision assistance
- 🚧 Bottleneck detection
- 🚧 ML predictions

---

## 📝 **VERSION HISTORY & KEY CHANGES**

### **v3.0 (Current) - February 8, 2026**
**Major Changes**:
- ✅ Corrected status enums (removed conflicts)
- ✅ Separated payment_status from order status
- ✅ Added intelligence layer architecture
- ✅ Added self-healing patterns
- ✅ Added decision assistance framework
- ✅ Clarified FIRE logic (PENDING, not FIRED)
- ✅ Added force settlement with audit trail
- ✅ Documented complete payment flows
- ✅ Added service charge distribution logic

**Deprecated**:
- ❌ Removed ambiguous DRAFT/CONFIRMED split (now both ACTIVE)
- ❌ Removed BILL_REQUESTED (now just READY)
- ❌ Removed overly strict validation (now guide, don't block)

---

## 🚀 **FOR AI ASSISTANTS: HOW TO USE THIS DOCUMENT**

**When building new features**:
1. Read this document first
2. Check status enums - use exact names
3. Follow transaction patterns (no partial saves)
4. Add intelligence hooks (don't just implement, assist)
5. Update this document with changes

**When debugging**:
1. Check if code matches this spec
2. If mismatch: code is wrong (fix code)
3. If spec is wrong: update spec, then fix code

**When user requests "simple" changes**:
1. Check: Is this already covered?
2. If yes: Implement per spec
3. If no: Propose addition to spec first, then implement

---

**This is THE authoritative source. All other docs are references or archives.**

**Last verified**: February 8, 2026  
**Next review**: After Phase 2 (Intelligence) implementation
