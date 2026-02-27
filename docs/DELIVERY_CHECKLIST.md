# 🚀 Fireflow Delivery Checklist
## Ship Working Software in 3-5 Days

**Deadline Mode**: Focus on core functionality ONLY. Intelligence layers come later.

---

## ✅ **Critical Path: Must Work**

### **Day 1: Core Order Flow** ⚡

#### **DINE-IN Flow**
- [ ] Select table → Creates order (status: DRAFT)
- [ ] Table locks (status: OCCUPIED)
- [ ] Add menu items → Saves to order_items
- [ ] Click "FIRE" → Order status: CONFIRMED
- [ ] Items appear on KDS
- [ ] KDS marks items READY
- [ ] Cashier processes payment
- [ ] Table releases (status: DIRTY)

**Test Script**:
```bash
# Manual test (no automation needed for delivery)
1. Open POS
2. Click Table 5
3. Add "Burger" + "Fries"
4. Click FIRE
5. Check KDS - items appear?
6. Mark items READY on KDS
7. Process payment
8. Check table - released?
```

**Critical Fixes Needed** (if failing):
```typescript
// In BaseOrderService.ts - ensure atomicity
await prisma.$transaction(async (tx) => {
  const order = await tx.orders.create({...});
  await tx.dine_in_orders.create({...});
  await tx.tables.update({
    where: { id: table_id },
    data: { status: 'OCCUPIED', active_order_id: order.id }
  });
});
```

---

#### **TAKEAWAY Flow**
- [ ] Select "Takeaway" → Creates order
- [ ] Add items
- [ ] Click "FIRE" → Generates token (T001, T002, etc.)
- [ ] Token shows on screen
- [ ] Process payment
- [ ] Mark as picked up

**Test Script**:
```bash
1. Open POS
2. Click "Takeaway"
3. (Optional) Enter phone
4. Add items
5. Click FIRE
6. Check token generated (T###)
7. Process payment
8. Mark picked up
```

**Critical Code** (token generation):
```typescript
// In TakeawayService.ts or similar
const today = format(new Date(), 'yyyy-MM-DD');
const lastToken = await prisma.takeaway_orders.findFirst({
  where: { token_date: today },
  orderBy: { token_number: 'desc' }
});

const nextNumber = lastToken 
  ? parseInt(lastToken.token_number.replace('T', '')) + 1 
  : 1;

const token = `T${String(nextNumber).padStart(3, '0')}`;
```

---

#### **DELIVERY Flow**
- [ ] Enter phone + address
- [ ] Add items
- [ ] Click "FIRE"
- [ ] Assign driver
- [ ] Driver marks delivered
- [ ] Process rider settlement

**Test Script**:
```bash
1. Click "Delivery"
2. Enter phone: 03001234567
3. Enter address: "123 Main St"
4. Add items
5. Click FIRE
6. Assign driver
7. (Later) Mark delivered
8. Process settlement
```

---

### **Day 2: Payment & Closing** 💰

#### **Payment Processing**
- [ ] Calculate total correctly (items + tax + service charge)
- [ ] Select payment method (Cash/Card/Online)
- [ ] Create transaction record
- [ ] Order status → PAID/COMPLETED
- [ ] Revenue updates

**Test**:
```typescript
// Verify breakdown calculation
const order = await prisma.orders.findUnique({
  where: { id },
  include: { order_items: true }
});

const itemsTotal = order.order_items.reduce(
  (sum, item) => sum + Number(item.total_price), 0
);
const tax = itemsTotal * (restaurant.tax_rate / 100);
const serviceCharge = itemsTotal * (restaurant.service_charge_rate / 100);
const total = itemsTotal + tax + serviceCharge;

// Should match order.total
```

#### **Table Management**
- [ ] Table shows OCCUPIED when order active
- [ ] Table shows DIRTY after payment
- [ ] Can't seat table if OCCUPIED
- [ ] Waiter can mark DIRTY → AVAILABLE

---

### **Day 3: KDS & Kitchen Flow** 🍳

#### **Kitchen Display**
- [ ] New orders appear when fired
- [ ] Shows order number, table, items
- [ ] Can filter by station (Grill, Salad, etc.)
- [ ] Mark items as PREPARING
- [ ] Mark items as READY/DONE
- [ ] Order disappears when all items done

**Critical**:
```typescript
// Socket.IO event when order fired
io.emit('NEW_KITCHEN_ORDER', {
  order_id,
  order_number,
  type: 'DINE_IN',
  table: 'T-5',
  items: [
    { name: 'Burger', quantity: 2, station: 'GRILL' },
    { name: 'Salad', quantity: 1, station: 'COLD' }
  ]
});

// KDS listens
socket.on('NEW_KITCHEN_ORDER', (order) => {
  // Add to display
});
```

---

### **Day 4: Edge Cases & Fixes** 🔧

#### **Must Handle**
- [ ] **Guest count change** (increase/decrease)
- [ ] **Order cancellation** (DRAFT or CONFIRMED only)
  - Releases table if DINE_IN
  - Logs audit
- [ ] **Manager PIN** for sensitive actions:
  - Void PAID order
  - Large discounts (>10%)
  - Cancel order with READY items
- [ ] **Network reconnection** (Socket.IO auto-reconnect)
- [ ] **Printer failure** (show error, allow manual print retry)

#### **Nice to Have** (if time)
- [ ] Order search by number/table
- [ ] Daily revenue report
- [ ] Most popular items
- [ ] Staff activity log

---

### **Day 5: Testing & Polish** ✨

#### **End-to-End Scenarios**
1. **Busy Friday Night Simulation**
   - Seat 5 tables simultaneously
   - Fire all orders at once
   - KDS receives all (check no drops)
   - Process payments
   - All tables released

2. **Edge Case Gauntlet**
   - Start order, cancel before fire
   - Fire order, customer leaves (void after payment)
   - Change guest count after items added
   - Printer offline during fire (manual recovery)

3. **Multi-User Test**
   - 2 Waiters + 1 Cashier + 1 KDS
   - Each does 3 orders
   - Check no data collision

#### **Polish**
- [ ] Loading states (spinners during API calls)
- [ ] Error messages (user-friendly, not technical)
- [ ] Success confirmations ("Order fired!", "Payment processed!")
- [ ] Disable buttons during processing (prevent double-click)

---

## ❌ **Out of Scope for Delivery**

**DON'T implement now** (add after delivery):
- ❌ Self-healing engine
- ❌ Decision assistance
- ❌ Bottleneck detection
- ❌ ML predictions
- ❌ Capacity forecasting
- ❌ Complex analytics
- ❌ Staff performance reports
- ❌ Customer loyalty program

**One exception**: If something is 90% done, finish it. Otherwise, cut it.

---

## 🐛 **Known Issues to Fix Before Delivery**

Based on your code review:

### **Issue 1: Status Enum Confusion**
**Current**: You have both PENDING and FIRED in ItemStatus enum  
**Quick Fix**: Pick one, stick to it

```typescript
// RECOMMENDED for delivery:
enum ItemStatus {
  DRAFT,      // Not fired yet
  PENDING,    // Fired to kitchen (waiting)
  PREPARING,  // Chef working on it
  READY,      // Done, can serve
  SERVED      // Delivered to customer (DINE_IN only)
}

// Use PENDING (not FIRED) everywhere
```

### **Issue 2: Transaction Missing Order Link**
**Problem**: transactions.order_id is optional (shouldn't be)  
**Quick Fix**: Don't change schema, just enforce in code

```typescript
// When creating transaction
if (!order_id) {
  throw new Error('Transaction must be linked to order');
}

await prisma.transactions.create({
  data: {
    order_id,  // Always required
    amount,
    payment_method,
    status: 'COMPLETED'
  }
});
```

### **Issue 3: Table Lock Race Condition**
**Problem**: Two waiters could seat same table simultaneously  
**Quick Fix**: Add lock check

```typescript
// Before creating order
const table = await prisma.tables.findUnique({
  where: { id: table_id }
});

if (table.status === 'OCCUPIED') {
  throw new Error('Table already occupied');
}

// Then proceed with transaction
```

---

## 📋 **Delivery Day Checklist**

### **Before Demo**
- [ ] Restart server
- [ ] Clear test data (or seed fresh data)
- [ ] Test on actual hardware (tablet/POS screen)
- [ ] Check printer connectivity
- [ ] Verify network stability
- [ ] Have backup plan (screenshots/video if live demo fails)

### **During Demo**
- [ ] Run through happy path first (DINE_IN order start to finish)
- [ ] Show TAKEAWAY flow
- [ ] Show KDS updates real-time
- [ ] Show payment processing
- [ ] Mention "more features coming" for missing items

### **After Demo**
- [ ] Collect feedback
- [ ] Note critical bugs
- [ ] DO NOT promise immediate fixes
- [ ] Schedule follow-up for intelligence features

---

## 🎯 **Success Criteria (Minimum Viable)**

Your delivery is successful if:

✅ **DINE-IN**: Table → Add items → Fire → KDS shows → Pay → Table releases  
✅ **TAKEAWAY**: Create → Fire → Token generates → Pay → Mark picked up  
✅ **DELIVERY**: Create → Fire → Assign driver → (Settlement can be manual for demo)  
✅ **No crashes** during 30-minute demo  
✅ **Real-time updates** (KDS, table statuses via Socket.IO)  

**That's it.** Everything else is bonus.

---

## 🚨 **Emergency Fixes**

If something breaks day-of:

### **Server won't start**
```bash
# Check logs
npm run dev

# If port in use
netstat -ano | findstr :3001
taskkill /PID <pid> /F

# Nuclear option: restart computer
```

### **Database connection fails**
```bash
# Check .env file
DATABASE_URL="postgresql://..."

# Test connection
npx prisma db pull
```

### **Socket.IO not updating**
```javascript
// Client-side debug
socket.on('connect', () => console.log('Connected!'));
socket.on('disconnect', () => console.log('Disconnected!'));

// Force reconnect
socket.disconnect();
socket.connect();
```

### **KDS not showing orders**
```typescript
// Server-side: Force emit
io.emit('db_change', {
  table: 'orders',
  eventType: 'UPDATE',
  data: order
});

// Client-side: Log all events
socket.onAny((event, data) => {
  console.log('Received:', event, data);
});
```

---

## 📞 **Support Plan**

**During delivery**:
- Have this checklist open
- Have server logs visible
- Have database admin tool ready (Prisma Studio)

```bash
# Keep these running in separate terminals
Terminal 1: npm run dev        # Server
Terminal 2: npx prisma studio  # Database viewer
Terminal 3: tail -f logs/app.log  # If you have logging
```

---

## 🎉 **Post-Delivery: Next Phase**

**Once delivered, THEN we add**:
1. Week 1: Self-healing engine (prevents data corruption)
2. Week 2: Decision assist (reduces manager PIN spam)
3. Week 3: Bottleneck detection
4. Week 4+: ML predictions, analytics

**For now**: Ship it! 🚀

---

## 📝 **Quick Reference: Current Code Locations**

```
Core Services:
- src/api/services/orders/BaseOrderService.ts
- src/api/services/orders/DineInService.ts
- src/api/services/orders/TakeawayService.ts
- src/api/services/orders/DeliveryService.ts

UI Components:
- src/operations/orders/OrdersView.tsx
- src/operations/dashboard/components/OrderCommandHub.tsx
- src/operations/kds/KitchenDisplay.tsx

Database:
- prisma/schema.prisma
- prisma/seed.ts (test data)

Config:
- .env (DATABASE_URL, PORT, etc.)
```

---

**Need help with any specific issue?** Tell me what's broken and I'll fix it NOW! ⚡
