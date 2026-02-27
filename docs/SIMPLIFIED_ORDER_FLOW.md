# 🎯 Fireflow Simplified Order Flow (Pragmatic Version)

**Philosophy**: Keep operations FAST. Track everything. Let managers override when needed.

---

## 🧠 Core Principles

### 1. **Speed Over Perfection**
- Default: Allow operations to proceed
- Restriction: Only block clearly dangerous actions (e.g., paying a voided order)
- Flexibility: Manager/Cashier can override almost anything

### 2. **Three-Tier Status System (Not Ten!)**

#### **Order-Level Status (User-Facing)**
- **ACTIVE**: Order is being worked on (combines DRAFT, CONFIRMED, PREPARING)
- **READY**: Order can be settled (all items done OR manager says so)
- **CLOSED**: Order is paid/completed

#### **Item-Level Status (Kitchen-Facing)**
- **PENDING**: Sent to kitchen
- **DONE**: Kitchen finished
- **SKIPPED**: Manager marked as ready without kitchen completion

#### **Payment Status (Cashier-Facing)**
- **UNPAID**: No payment recorded
- **PAID**: Payment complete

### 3. **Manager Override = First-Class Feature**

**Not an "emergency button"** - it's a **standard operational tool**.

---

## 🔄 Simplified Flows

### **DINE-IN Flow (Normal Night)**

```
1. Waiter selects Table → Order created (status: ACTIVE, payment: UNPAID)
2. Waiter adds items → Items sent to kitchen (item_status: PENDING)
3. Kitchen marks items done → (item_status: DONE)
4. Waiter requests bill → Display shows "Bill for Table 5"
5. Cashier processes payment → (status: CLOSED, payment: PAID)
6. Table released → status: DIRTY
```

**Time**: ~2 minutes  
**Clicks**: ~8 total

---

### **DINE-IN Flow (Busy Night - Manager Override)**

```
1. Waiter selects Table → Order created
2. Waiter adds items → Items sent to kitchen
3. Customer wants to pay NOW (kitchen still cooking)
4. Cashier clicks "Settle" → System shows:
   
   ⚠️ "2 items still in kitchen. Proceed anyway?"
   
   [Cancel]  [Manager: Force Settle]
   
5. Cashier (who has CASHIER role) clicks "Force Settle"
   → System auto-marks all items as DONE
   → Payment processed
   → Audit log: "FORCED_SETTLEMENT by [cashier_name]"
```

**Time**: ~1.5 minutes  
**Clicks**: ~9 total (1 extra confirmation)  
**Manager PIN**: ❌ NOT required (cashier has authority)

---

### **When Manager PIN IS Required**

**Only for HIGH-RISK actions**:
- ✅ Void/Cancel PAID order (affects revenue)
- ✅ Delete menu items (affects historical data)
- ✅ Reduce guest count after items fired (potential theft)
- ❌ Force payment (cashier can do this)
- ❌ Mark items ready (cashier can do this)

---

## 🗂️ Database Schema Changes Needed

### **Simplify Status Enums**

#### Current (Too Complex):
```prisma
enum OrderStatus {
  DRAFT | CONFIRMED | PREPARING | READY | SERVED | 
  BILL_REQUESTED | COMPLETED | CANCELLED | VOIDED | FIRED
  // 10 statuses - TOO MANY!
}

enum ItemStatus {
  PENDING | PREPARING | READY | SERVED | FIRED | DRAFT
  // 6 statuses - confusing overlap with OrderStatus
}
```

#### Proposed (Simpler):
```prisma
enum OrderStatus {
  ACTIVE      // Working on it (was: DRAFT, CONFIRMED, PREPARING)
  READY       // Can be paid (was: READY, BILL_REQUESTED)
  CLOSED      // Done (was: COMPLETED, PAID)
  CANCELLED   // Keep as-is
  VOIDED      // Keep as-is
}

enum ItemStatus {
  PENDING     // Kitchen needs to make it
  DONE        // Kitchen finished
  SKIPPED     // Forced ready by staff (not made)
}

enum PaymentStatus {
  UNPAID
  PAID
  REFUNDED
}
```

**Benefit**: 
- Order: 5 states (down from 10)
- Items: 3 states (down from 6)
- Clearer semantics

---

## 🎯 Override Logic (The KEY Feature)

### **orders Table - Add Override Tracking**

```prisma
model orders {
  // ... existing fields ...
  
  // Override Tracking
  force_settled_at    DateTime?  // When staff forced payment
  force_settled_by    String?    // Staff ID who forced it
  force_settle_reason String?    // Optional: "Customer in hurry"
  
  // Simplified Payment
  payment_status      PaymentStatus @default(UNPAID)
}
```

### **order_items Table - Add Override Tracking**

```prisma
model order_items {
  // ... existing fields ...
  
  item_status         ItemStatus @default(PENDING)
  force_ready_at      DateTime?  // When staff skipped kitchen
  force_ready_by      String?    // Staff ID who forced it
}
```

---

## 🔐 Role-Based Permissions (Simplified)

| Action | WAITER | CASHIER | MANAGER |
|--------|--------|---------|---------|
| Create order | ✅ | ✅ | ✅ |
| Add items to ACTIVE order | ✅ | ✅ | ✅ |
| Fire order to kitchen | ✅ | ✅ | ✅ |
| Request bill (mark as READY) | ✅ | ✅ | ✅ |
| **Force Settle** (items not done) | ❌ | ✅ | ✅ |
| Process payment | ❌ | ✅ | ✅ |
| Void/Cancel PAID order | ❌ | ❌ | ✅ (with PIN) |
| View revenue reports | ❌ | ✅ | ✅ |

**Key Insight**: Cashiers are TRUSTED staff. They can override. Only managers can reverse completed transactions.

---

## 📊 Audit Trail (Accountability Without Restriction)

### **Don't Block - Just Log Everything**

```javascript
// When cashier forces settlement:
await prisma.audit_logs.create({
  data: {
    action_type: 'FORCED_SETTLEMENT',
    entity_type: 'ORDER',
    entity_id: order.id,
    staff_id: cashier.id,
    details: {
      items_not_ready: ['Dessert', 'Coffee'],
      reason: userProvidedReason || 'Customer request',
      order_total: order.total,
      timestamp: new Date()
    }
  }
});
```

**Manager Review (Next Day)**:
- View audit log
- See: "Cashier John forced 3 settlements last night"
- Discuss if needed (training opportunity, not punishment)

---

## 🚀 Implementation Changes Needed

### **1. Modify BaseOrderService.ts**

**Current Problem**:
```typescript
// Line 84: "Settle" button DISABLED until all items READY
if (!allItemsReady && !managerOverride) {
  throw new Error('Cannot settle - items not ready');
}
```

**Simplified Approach**:
```typescript
async settleOrder(orderId: string, staffId: string, forceSettle = false) {
  const order = await this.getOrderDetails(orderId);
  
  // Check payment status (ONLY real blocker)
  if (order.payment_status === 'PAID') {
    throw new Error('Order already paid');
  }
  
  const itemsNotReady = order.order_items.filter(
    item => item.item_status !== 'DONE'
  );
  
  // If items not done AND user didn't force, show warning
  if (itemsNotReady.length > 0 && !forceSettle) {
    return {
      success: false,
      requiresConfirmation: true,
      message: `${itemsNotReady.length} items still in kitchen`,
      items: itemsNotReady.map(i => i.item_name)
    };
  }
  
  // Proceed with settlement
  return await prisma.$transaction(async (tx) => {
    // If forced, mark all items as SKIPPED
    if (itemsNotReady.length > 0) {
      await tx.order_items.updateMany({
        where: { 
          order_id: orderId,
          item_status: { not: 'DONE' }
        },
        data: {
          item_status: 'SKIPPED',
          force_ready_at: new Date(),
          force_ready_by: staffId
        }
      });
    }
    
    // Update order
    const updated = await tx.orders.update({
      where: { id: orderId },
      data: {
        status: 'READY',
        force_settled_at: forceSettle ? new Date() : undefined,
        force_settled_by: forceSettle ? staffId : undefined
      }
    });
    
    // Log if forced
    if (forceSettle) {
      await tx.audit_logs.create({
        data: {
          action_type: 'FORCED_SETTLEMENT',
          entity_type: 'ORDER',
          entity_id: orderId,
          staff_id: staffId,
          details: { items_skipped: itemsNotReady.length }
        }
      });
    }
    
    return { success: true, order: updated };
  });
}
```

---

### **2. Update UI Components**

#### **POS Payment Modal (OrdersView.tsx)**

**Before** (Complex):
```typescript
// Settle button shows as disabled
<Button disabled={!allItemsReady}>
  Settle Order
</Button>
```

**After** (Simple with Warning):
```typescript
const [showForceConfirm, setShowForceConfirm] = useState(false);

const handleSettle = async () => {
  const result = await settleOrder(orderId, staffId, false);
  
  if (result.requiresConfirmation) {
    // Show warning modal
    setShowForceConfirm(true);
    setItemsNotReady(result.items);
  } else {
    // Proceed to payment
    processPayment();
  }
};

const handleForceSettle = async () => {
  await settleOrder(orderId, staffId, true);
  processPayment();
};

// UI
{showForceConfirm && (
  <Modal>
    <h3>⚠️ Kitchen Still Working</h3>
    <p>{itemsNotReady.length} items not marked done by kitchen:</p>
    <ul>
      {itemsNotReady.map(item => <li>{item}</li>)}
    </ul>
    <p><strong>Customer wants to pay anyway?</strong></p>
    
    <Button onClick={handleForceSettle} variant="primary">
      Yes - Settle Anyway
    </Button>
    <Button onClick={() => setShowForceConfirm(false)}>
      Cancel - Wait for Kitchen
    </Button>
  </Modal>
)}
```

**Result**: 
- No PIN required
- 1 extra click (confirmation)
- Full audit trail
- Customer served fast

---

## 📋 Revised Blueprint Structure

### **Phase 1-3: Keep As-Is**
(Order creation, item selection, firing to kitchen)

### **Phase 4: REMOVE "Production Gate"**

**Old** (Too Restrictive):
> "Settle button DISABLED until all items READY"

**New** (Pragmatic):
> **Flexible Settlement**:
> - System checks if all items are DONE
> - If NOT: Show confirmation dialog
> - Cashier/Manager can proceed anyway
> - All forced settlements logged to audit_logs

### **Phase 5: Simplified Payment**

**DINE-IN**:
```
1. Waiter: "Request Bill" (optional - just marks order visible to cashier)
2. Cashier: Click "Settle" on order
3. If items not done: Confirm "Settle Anyway?"
4. Select payment method → Process
5. Order status: ACTIVE → CLOSED
6. Payment status: UNPAID → PAID
7. Table status: OCCUPIED → DIRTY
```

**TAKEAWAY**:
```
1. Token generated on Fire
2. Customer arrives
3. Cashier: "Settle" → Payment
4. Mark as picked up
5. Order status: ACTIVE → CLOSED
```

**DELIVERY**:
```
1. Dispatch rider (assign driver_id)
2. Rider delivers
3. Rider collects payment (if COD)
4. Rider returns to restaurant
5. Manager: Process rider settlement
```

---

## 🎯 Summary: What This Fixes

### **Before (Your Current Pain)**
- ❌ 10 order statuses to track mentally
- ❌ Manager constantly called for PIN
- ❌ Customers wait while staff navigates complex UI
- ❌ System blocks legitimate actions
- ❌ You refactor every time real-world edge case appears

### **After (Simplified)**
- ✅ 5 order statuses (ACTIVE, READY, CLOSED, CANCELLED, VOIDED)
- ✅ Cashiers trusted to make operational decisions
- ✅ Customers served immediately
- ✅ System warns but doesn't block
- ✅ Complete audit trail for accountability
- ✅ No refactoring needed - override pattern handles edge cases

---

## 🔥 Key Insight

**The problem isn't missing status tracking - it's OVER-tracking status!**

**Restaurant Operations Are**:
- 20% perfect flows
- 80% "make it work in the moment"

**Your System Should Be**:
- Simple, fast defaults
- Easy overrides with logging
- Trust your staff + verify later

**Anti-Pattern**: "System as Police" 🚨  
**Better Pattern**: "System as Assistant" 🤝

---

## 🚀 Next Steps

Want me to:

1. **Refactor BaseOrderService.ts** to implement this flexible settlement logic?
2. **Create database migration** to add override tracking fields?
3. **Update the main blueprint** with this simplified approach?
4. **Build the Force Settle UI component** with the warning modal?

This approach will **eliminate most of your refactoring cycles** because:
- Fewer states = fewer edge cases
- Override pattern = handles exceptions gracefully
- No need to predict every scenario upfront
