# 🎯 Fireflow Master Blueprint v3.0: Intelligent Operations System
## The Definitive Build Specification

**Last Updated**: February 9, 2026  
**Purpose**: Single source of truth for Fireflow's intelligent order management system  
**Audience**: AI Assistants, Developers, System Architects

---

## 📐 System Architecture Philosophy

### **Three-Layer Design**

```
Layer 3: Intelligence (AI Decision Support)
         ↓ Guides & Predicts
Layer 2: Operations (Business Logic)
         ↓ Executes & Enforces
Layer 1: Data (Persistent State)
```

**Key Principles**:
1. **Intelligence assists, never blocks** - system guides users to optimal decisions
2. **Self-healing by default** - auto-recovers from data corruption
3. **Predictive, not reactive** - detects bottlenecks before customers complain
4. **Learning system** - gets smarter with every order processed

---

## 🗂️ Database Schema (Layer 1: Truth)

### **Core Tables** (see schema.prisma for full details)

```prisma
// Primary order record
orders {
  id, restaurant_id, order_number
  status: OrderStatus
  payment_status: PaymentStatus
  type: OrderType
  
  // Financial
  total, tax, service_charge, discount
  breakdown: Json  // Itemized totals
  
  // Type-specific (via foreign keys)
  table_id, customer_id, assigned_waiter_id, assigned_driver_id
  
  // Intelligence tracking
  predicted_completion_time
  bottleneck_detected
  force_settled_at, force_settled_by
}

// Type extensions (1:1 with orders)
dine_in_orders { order_id, table_id, guest_count, waiter_id }
takeaway_orders { order_id, token_number, token_date, pickup_time }
delivery_orders { order_id, customer_phone, delivery_address, driver_id }

// Revenue items
order_items {
  order_id, menu_item_id
  quantity, unit_price, total_price
  item_status: ItemStatus
  station_id  // Where to prepare
  special_instructions
  
  // Intelligence
  predicted_ready_time
  force_ready_at, force_ready_by  // If skipped
}

// Intelligence layer
order_intelligence {
  order_id
  predicted_complete_time, predicted_duration_mins
  actual_complete_time, prediction_accuracy
  bottleneck_detected, anomaly_detected
  recommendations_given, recommendation_followed
}

// Financial Layer (New)
ledger_entries {
  id, account_id, transaction_type, amount
  reference_type: ORDER | SETTLEMENT | PAYOUT | STOCK_IN
  reference_id, staff_id, created_at
}

payouts {
  id, amount, category, reference_id, notes, created_at
}
```

### **Status Enums**

```prisma
enum OrderStatus {
  ACTIVE       // Working on it (replaces DRAFT, CONFIRMED, PREPARING)
  READY        // Can be paid (replaces BILL_REQUESTED)
  CLOSED       // Complete (replaces COMPLETED, PAID)
  CANCELLED    
  VOIDED
}

enum ItemStatus {
  PENDING      // Kitchen needs to make it
  PREPARING    // Kitchen working on it (KDS marked)
  DONE         // Kitchen finished
  SERVED       // Delivered to customer (DINE_IN only)
  SKIPPED      // Forced ready by staff
}

enum PaymentStatus {
  UNPAID
  PAID
  PARTIALLY_PAID
  REFUNDED
}
```

---

## 🔄 Order Lifecycle (Layer 2: Operations)

### **Phase 1: Initiation**

**User Actions**:
- DINE_IN: Select table → Enter guests
- TAKEAWAY: (Optional) Enter phone
- DELIVERY: Enter phone → Verify address

**System Logic** (Atomic Transaction):
```typescript
await prisma.$transaction(async (tx) => {
  // 1. Create base order
  const order = await tx.orders.create({
    data: {
      restaurant_id,
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
    
    // 3. Lock table
    await tx.tables.update({
      where: { id: table_id },
      data: { status: 'OCCUPIED', active_order_id: order.id }
    });
  }
  
  // ... similar for TAKEAWAY, DELIVERY
  
  // 4. Initialize intelligence tracking
  await tx.order_intelligence.create({
    data: {
      order_id: order.id,
      predicted_complete_time: await predictCompletionTime(order),
      prediction_confidence: 0.75
    }
  });
});
```

**Failure Handling**:
- Transaction fails → All changes rolled back
- Self-healing detects orphaned records → Auto-cleanup

---

### **Phase 2: Item Selection**

**User Actions**:
- Tap menu items
- Add special instructions
- Adjust quantities

**System Logic**:
```typescript
// Items saved immediately (ACTIVE order allows modifications)
await prisma.order_items.create({
  data: {
    order_id,
    menu_item_id,
    quantity,
    unit_price,  // SNAPSHOT price (prevents price drift)
    total_price: unit_price * quantity,
    item_status: 'PENDING',  // Not fired yet
    station_id,  // Snapshot station (prevents routing changes)
    item_name,   // Snapshot name (audit trail)
    category     // Snapshot category
  }
});

// Update order total
await prisma.orders.update({
  where: { id: order_id },
  data: {
    total: await calculateOrderTotal(order_id),
    breakdown: await generateBreakdown(order_id)
  }
});
```

**Intelligence Layer**:
```typescript
// Predict item prep time
const predicted_ready_timeconst = now + await predictPrepTime(menu_item_id);

// Check kitchen capacity
const bottleneck = await detectBottleneck();
if (bottleneck) {
  await notifyUser({
    type: 'WARNING',
    message: `Kitchen at ${bottleneck.utilization}% capacity. ~${bottleneck.delayMinutes} min delay expected.`
  });
}
```

---

### **Phase 3: Fire (Kitchen Dispatch)**

**User Action**: Click "FIRE ORDER"

**System Logic**:
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
  
  // 2. Update item statuses (conditional)
  const items = await tx.order_items.findMany({
    where: { order_id },
    include: { menu_items: true }
  });
  
  for (const item of items) {
    const newStatus = item.menu_items.requires_prep 
      ? 'PENDING'   // Send to kitchen
      : 'DONE';     // Skip kitchen (e.g., packaged drinks)
    
    await tx.order_items.update({
      where: { id: item.id },
      data: { 
        item_status: newStatus,
        station_id: item.station_id || item.menu_items.station_id  // Snapshot
      }
    });
  }
  
  // 3. TAKEAWAY: Generate token
  if (order.type === 'TAKEAWAY') {
    const token = await generateDailyToken();
    await tx.takeaway_orders.update({
      where: { order_id },
      data: {
        token_number: token,
        token_date: format(now(), 'yyyy-MM-DD'),
        pickup_time: await estimatePickupTime(items)
      }
    });
  }
  
  // 4. Broadcast to KDS
  const itemsForKDS = items.filter(i => i.item_status === 'PENDING');
  if (itemsForKDS.length > 0) {
    io.emit('NEW_KITCHEN_ORDER', {
      order_id,
      order_number: order.order_number,
      items: itemsForKDS,
      priority: await calculatePriority(order)
    });
  }
  
  // 5. Log audit
  await tx.audit_logs.create({
    data: {
      action_type: 'ORDER_FIRED',
      entity_type: 'ORDER',
      entity_id: order_id,
      staff_id: current_user_id,
      details: { items_count: items.length }
    }
  });
});
```

**Intelligence Layer**:
```typescript
// Predict completion
const predicted_time = await ml.predictCompletionTime({
  items,
  current_kitchen_load: await getKitchenLoad(),
  historical_patterns: await getHistoricalData(),
  day_of_week: now().getDay(),
  hour: now().getHours()
});

await prisma.order_intelligence.update({
  where: { order_id },
  data: {
    predicted_complete_time: predicted_time,
    prediction_confidence: 0.85
  }
});
```

---

### **Phase 4: Kitchen Production (KDS Flow)**

**KDS Actions**:
- Chef views items on station screen
- Marks item "Preparing" (optional)
- Marks item "Done" when complete

**System Logic**:
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
  // Auto-advance order to READY
  await prisma.orders.update({
    where: { id: order_id },
    data: { status: 'READY' }
  });
  
  // Notify waiter/cashier
  io.emit('ORDER_READY', { order_id, order_number: order.order_number });
}
```

**Intelligence Layer**:
```typescript
// Track accuracy
const intelligence = await prisma.order_intelligence.findUnique({
  where: { order_id }
});

const actual_duration = differenceInMinutes(now(), order.created_at);
const predicted_duration = intelligence.predicted_duration_mins;

await prisma.order_intelligence.update({
  where: { order_id },
  data: {
    actual_complete_time: now(),
    actual_duration_mins: actual_duration,
    prediction_accuracy: calculateAccuracy(predicted_duration, actual_duration)
  }
});

// ML learns from this for future predictions
await ml.trainModel({ predicted_duration, actual_duration, features: {...} });
```

---

### **Phase 5: Settlement (Payment Flow)**

**Normal Flow** (All items ready):
```typescript
// 1. Cashier clicks "Settle"
// 2. System checks: all items DONE/SERVED?
const allReady = order.order_items.every(i => 
  ['DONE', 'SERVED'].includes(i.item_status)
);

if (allReady) {
  // Simple path - proceed to payment
  return { allowPayment: true, guidance: null };
}
```

**Complex Flow** (Items NOT ready) - **INTELLIGENCE ASSISTS**:

```typescript
// 1. Cashier clicks "Settle" on order with pending items
// 2. System invokes Decision Engine
const guidance = await DecisionEngine.analyzeSettlement(order_id);

// 3. UI shows recommendations
return {
  allowPayment: true,  // Never block
  requiresDecision: true,
  guidance: {
    itemsNotReady: [...],
    customerContext: { isRegular, lifetimeValue, ... },
    recommendations: [
      {
        action: 'SETTLE_WITH_DISCOUNT',
        confidence: 0.92,
        reasoning: 'Valuable customer + delay. Protect relationship.',
        discountAmount: 150,
        script: 'Apologies for the delay. Let me apply a courtesy discount...'
      },
      {
        action: 'ASK_TO_WAIT',
        confidence: 0.78,
        reasoning: 'Items ready in <3 min. Customer likely willing.',
        script: 'Your order is plating now. Ready in ~2 minutes.'
      },
      // ... more options
    ]
  }
};

// 4. Cashier selects recommended action
// 5. System executes & logs
await executeSettlement({
  order_id,
  action: selectedRecommendation.action,
  discount: selectedRecommendation.discountAmount,
  staff_id
});

// Log for ML learning
await prisma.order_intelligence.update({
  where: { order_id },
  data: {
    recommendations_given: guidance.recommendations,
    recommendation_followed: selectedRecommendation.action
  }
});
```

**Payment Processing**:
```typescript
await prisma.$transaction(async (tx) => {
  // 1. Update order
  await tx.orders.update({
    where: { id: order_id },
    data: {
      status: 'CLOSED',
      payment_status: 'PAID'
    }
  });
  
  // 2. Create transaction record
  await tx.transactions.create({
    data: {
      restaurant_id,
      order_id,
      amount: finalAmount,  // After discount
      payment_method,
      status: 'COMPLETED'
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
  
  // 4. Service charge distribution (if DINE_IN)
  if (order.service_charge > 0) {
    await distributeServiceCharge(tx, order.service_charge, order.restaurant_id);
  }
  
  // 5. Audit log
  await tx.audit_logs.create({
    data: {
      action_type: 'PAYMENT_PROCESSED',
      entity_type: 'ORDER',
      entity_id: order_id,
      staff_id,
      details: {
        amount: final_amount,
        method: payment_method,
        discount_applied: discount > 0
      }
    }
  });
});
```

---

### **Phase 6: Logistics Hub & Rider Debt**

**Overview**: Specifically for `DELIVERY` orders, the system transitions from "Order Management" to "Agent Management".

**The Rider-as-Debtor Model**:
- **Assignment**: When marked "In Transit", the order total + float is debited to the Rider's Ledger.
- **Delivery Confirmation**: Rider marks "Delivered" via app or Dispatcher marks via Hub. Status changes to "Delivered" but debt remains in Rider's hands.
- **Settlement**: Physical cash is handed over to the cashier.

**System Logic (Batch Dispatch)**:
```typescript
// Assigning multiple orders to one rider
await prisma.$transaction(async (tx) => {
  for (const id of orderIds) {
    await tx.orders.update({
      where: { id },
      data: { 
        assigned_driver_id,
        float_given: total_float / orderIds.length,
        status: 'READY' 
      }
    });
  }
  // Increment Rider Liability
  await tx.staff.update({
    where: { id: riderId },
    data: { cash_in_hand: { increment: total_sales + total_float } }
  });
});
```

**System Logic (Settlement)**:
- **Checkbox Selection**: User selects specific orders to settle.
- **Partial Settlement**: If a rider pays less than the total, the remaining balance stays in their `cash_in_hand` field for future shifts.

---

## 🧠 Intelligence Layer (Layer 3: AI Assist)

### **Background Services** (Always Running)

```typescript
// 1. Self-Healing Engine (every 30 seconds)
setInterval(async () => {
  await AutoHealingService.detectAndFix([
    'ORPHANED_ITEMS',
    'STUCK_TABLES',
    'STATUS_MISMATCHES',
    'MISSING_TRANSACTIONS'
  ]);
}, 30000);

// 2. Bottleneck Detector (every 30 seconds)
setInterval(async () => {
  const bottleneck = await BottleneckDetector.detect();
  if (bottleneck) {
    await notifyManager({
      type: 'BOTTLENECK_ALERT',
      location: bottleneck.location,
      severity: bottleneck.severity,
      recommendations: bottleneck.recommendations
    });
  }
}, 30000);

// 3. Anomaly Detector (every minute)
setInterval(async () => {
  const anomalies = await AnomalyDetector.findAnomalies([
    'ORDERS_TAKING_TOO_LONG',
    'REVENUE_DISCREPANCIES',
    'STAFF_PERFORMANCE_OUTLIERS'
  ]);
  
  for (const anomaly of anomalies) {
    await investigateAnomaly(anomaly);
  }
}, 60000);

// 4. Capacity Forecaster (daily at 4 PM)
cron.schedule('0 16 * * *', async () => {
  const forecast = await CapacityPlanner.predictTonightDemand();
  
  if (forecast.staffing.gap > 0) {
    await notifyManager({
      type: 'STAFFING_RECOMMENDATION',
      message: `Call ${forecast.staffing.gap} backup staff. Predicted ${forecast.predictedOrders} orders tonight.`,
      staffSuggestions: await getAvailableBackupStaff()
    });
  }
});
```

### **Real-Time Assistance**

```typescript
// Decision Engine invoked on-demand
const guidance = await DecisionEngine.assist({
  context: 'SETTLEMENT',
  order_id,
  user_id
});

const guidance = await DecisionEngine.assist({
  context: 'REFUND_REQUEST',
  order_id,
  reason: customer_complaint
});

const guidance = await DecisionEngine.assist({
  context: 'BULK_DISCOUNT',
  orders: large_party_orders
});
```

---

## ⚠️ Error Handling & Recovery

### **Principles**:
1. **Never crash** - catch all errors, log, continue
2. **Self-heal** - auto-fix known corruption patterns
3. **Degrade gracefully** - if ML unavailable, use fallback rules
4. **Alert humans** - only for critical issues requiring manual intervention

### **Example: Printer Failure**

```typescript
try {
  await sendToKitchenPrinter(order);
} catch (error) {
  // 1. Log failure
  await logError(error);
  
  // 2. Fallback strategies
  const strategies = [
    () => sendToBackupPrinter(order),
    () => displayOnKDSTablet(order),
    () => sendToManagerPhone(order),
    () => createManualPrintJob(order)
  ];
  
  for (const strategy of strategies) {
    try {
      await strategy();
      break;  // Success - stop trying
    } catch (e) {
      continue;  // Try next strategy
    }
  }
  
  // 3. Alert if all strategies failed
  await alertManager({
    type: 'CRITICAL',
    message: 'All printer fallbacks failed. Order may not reach kitchen.',
    order_id
  });
}
```

---

## 🎯 Role-Based Access (Security)

| Action | WAITER | CASHIER | MANAGER |
|--------|--------|---------|---------|
| Create order | ✅ | ✅ | ✅ |
| Add/remove items (ACTIVE status) | ✅ | ✅ | ✅ |
| Fire order | ✅ | ✅ | ✅ |
| **Force settle** (items not ready) | ❌ | ✅ | ✅ |
| Process payment | ❌ | ✅ | ✅ |
| Apply discount >10% | ❌ | ❌ | ✅ (with PIN) |
| Void/Cancel PAID order | ❌ | ❌ | ✅ (with PIN) |
| View revenue reports | ❌ | ✅ | ✅ |
| Access intelligence dashboard | ❌ | ✅ (limited) | ✅ (full) |

---

## 📊 Success Metrics

**System Reliability**:
- Data corruption incidents: 0 (auto-healed)
- System uptime: >99.9%
- Auto-recovery success rate: >95%

**Operational Efficiency**:
- Average order creation time: <2 minutes
- Settlement time (complex orders): <3 minutes (vs 5+ before)
- Manager PIN requests: <5 per shift (vs 20-30 before)

**Intelligence Accuracy**:
- Completion time prediction: ±5 minutes
- Bottleneck detection lead time: 10-15 minutes before customer complaints
- Recommendation acceptance rate: >70%

**Customer Satisfaction**:
- Wait time complaints: <3 per week (vs 8-12 before)
- Positive reviews mentioning "fast service": +40%

---

## 🚀 Implementation Status

- ✅ Core order flow (CRUD operations)
- ✅ Type-specific extensions (Dine-In, Takeaway, Delivery)
- ✅ KDS integration
- ✅ Logistics Hub (Grid/List Views, Batch Dispatch, Delivery Confirmation)
- ✅ Rider Settlement System (Multi-order checkbox settlement)
- ✅ Financial Architecture Specification (Double-entry ledger design)
- � **Delivery Module AUDIT COMPLETE** (Critical issues found - See DELIVERY_AUDIT_SUMMARY.md)
- �🚧 **Customer Address Management** (CRITICAL - Required for delivery operations)
- 🚧 **Logistics & Settlement Merge** (HIGH PRIORITY - UX improvement)
- 🚧 Intelligence Layer (Phases 1-4 in progress)
- 🚧 Cash Drawer & Payout Management
- 🚧 Z-Report & End-of-Day Reconciliation
- 📋 Supplier Ledger & Inventory Integration (Planned)
- 📋 ML prediction models (Planned)

---

## 📚 Related Documents

- `INTELLIGENT_SYSTEM_ARCHITECTURE.md` - Full AI capabilities specification
- `FINANCIAL_ARCHITECTURE.md` - Double-entry ledger & reconciliation system
- `IMPLEMENTATION_ROADMAP.md` - Phase-by-phase build guide
- `DELIVERY_AUDIT_SUMMARY.md` - **🚨 CRITICAL: Delivery module audit (Feb 2026)**  
- `DELIVERY_MODULE_AUDIT.md` - Full technical delivery audit (900+ lines)
- `DELIVERY_QUICK_FIX.md` - Action plan for delivery fixes
- `CUSTOMER_TAB_ANALYSIS.md` - Customer management UX decision (Feb 2026)
- `CUSTOMER_FLOW_DIAGRAM.md` - Customer data flow architecture
- `CUSTOMER_TAB_QUICK_REF.md` - Revised customer tab decision (Updated after audit)
- `../prisma/schema.prisma` - Database schema source of truth
- `../src/api/services/orders/` - Service layer implementation

---

**This blueprint is a LIVING DOCUMENT. Update it with every significant change.**
