# Phase 3 Frontend Implementation — COMPLETE

**Date**: April 8, 2026  
**Status**: ✅ Complete  
**Timestamp**: `2026-04-08T00:00:00Z`

---

## 📦 Deliverables

### 1. ✅ useOrderWorkflow.ts Hook
**File**: `src/hooks/useOrderWorkflow.ts`  
**Size**: ~180 lines

**Methods Exported**:
- `fire()` - Fire items to kitchen
- `recall()` - Recall batch within 60 seconds
- `updateItemStatus()` - Update item status with transitions
- `approveSkip()` - Manager approval for skip operations

**Features**:
- Automatic JWT token injection from sessionStorage
- Error handling with descriptive messages
- Loading states for all operations
- Promise-based async/await interface

**Usage**:
```typescript
const { fire, recall, updateItemStatus, approveSkip, loading, error } = useOrderWorkflow();

// Fire items
const result = await fire(orderId, sessionId, terminalId);
if (result) {
  console.log(`Fired ${result.items_fired} items`);
}
```

---

### 2. ✅ FireOrderButton.tsx Component
**File**: `src/operations/pos/components/FireOrderButton.tsx`  
**Size**: ~150 lines

**Features**:
- Display DRAFT item count badge
- Confirmation dialog before firing
- Success/error toast notifications
- Disabled state when no draft items
- Auto-dismiss success message after 3 seconds

**Integration**:
```typescript
import { FireOrderButton } from './components/FireOrderButton';

<FireOrderButton
  orderId={order.id}
  draftItemCount={draftItems.length}
  sessionId={sessionId}
  terminalId={terminalId}
  onFireSuccess={(result) => {
    console.log(`Fired ${result.items_fired} items`);
    refreshOrderView();
  }}
/>
```

---

### 3. ✅ RecallOrderModal.tsx Component
**File**: `src/operations/pos/components/RecallOrderModal.tsx`  
**Size**: ~180 lines

**Features**:
- 60-second countdown timer with progress bar
- Color-coded warning levels (blue → orange → red)
- Real-time window expiration detection
- Recall batch version tracking
- Success/error messaging

**State Management**:
- Tracks elapsed time from fire
- Calculates remaining seconds
- Detects window expiration
- Resets on modal close

**Usage**:
```typescript
const [showRecall, setShowRecall] = useState(false);

<RecallOrderModal
  orderId={orderId}
  fireBatchId={batch.id}
  firedItemCount={itemCount}
  firedAt={new Date()}
  sessionId={sessionId}
  terminalId={terminalId}
  isOpen={showRecall}
  onClose={() => setShowRecall(false)}
  onRecallSuccess={(result) => {
    console.log(`Recalled ${result.recalled_count} items`);
  }}
/>
```

---

### 4. ✅ OrderItemStatusUpdater.tsx Component
**File**: `src/operations/kds/components/OrderItemStatusUpdater.tsx`  
**Size**: ~250 lines

**Features**:
- Status button with color-coded display
- Dropdown menu for valid status transitions
- Skip reason selector with 4 options:
  - CUSTOMER_CANCELLED
  - WRONG_ITEM
  - OUT_OF_STOCK
  - COMP
- 30-second undo window with reason input
- Real-time transition validation

**Status Colors**:
- DRAFT: Gray
- PENDING: Yellow
- PREPARING: Blue
- DONE: Green
- SERVED: Emerald
- SKIPPED: Red

**Valid Transitions**:
```
DRAFT → PENDING, SKIPPED
PENDING → PREPARING, SKIPPED
PREPARING → DONE, SKIPPED
DONE → SERVED, SKIPPED, DONE (undo)
SERVED → SKIPPED
SKIPPED → (no transitions)
```

**Usage**:
```typescript
<OrderItemStatusUpdater
  orderId={orderId}
  itemId={itemId}
  itemName="Biryani (Large)"
  currentStatus={item.item_status}
  sessionId={sessionId}
  terminalId={terminalId}
  onStatusChange={(newStatus, approvalRequired) => {
    if (approvalRequired) {
      showManagerApproval();
    }
  }}
/>
```

---

### 5. ✅ ManagerApprovalModal.tsx Component
**File**: `src/operations/kds/components/ManagerApprovalModal.tsx`  
**Size**: ~220 lines

**Features**:
- Two-step approval workflow
- Step 1: Select APPROVE or DENY
- Step 2: Enter reason + PIN
- Manager PIN validation (server-side)
- Audit trail logging
- Success/error messaging

**PIN Requirements**:
- Minimum 4 digits
- Maximum 6 digits
- Masked input (password type)
- Server-side verification

**Approval Reasons**:
- Customer requested
- Item not prepared correctly
- Quality issues
- Custom reason field

**Security**:
- PIN is only used for audit trail
- Server verifies manager role from JWT
- Session ID linked to manager's active session
- All actions logged to approval_logs

**Usage**:
```typescript
const [showApproval, setShowApproval] = useState(false);

<ManagerApprovalModal
  orderItemId={itemId}
  itemName="Chicken Tikka"
  orderId={orderId}
  sessionId={sessionId}
  terminalId={terminalId}
  isOpen={showApproval}
  onClose={() => setShowApproval(false)}
  onApproveSuccess={() => {
    console.log('Skip approved');
    refreshOrder();
  }}
  onDenySuccess={() => {
    console.log('Skip denied');
  }}
/>
```

---

## 🔌 Integration Points

### POSView Integration
Add FireOrderButton to cart summary:

```typescript
// At top of POSView.tsx
import { FireOrderButton } from './components/FireOrderButton';

// In render, add button after submit:
<FireOrderButton
  orderId={activeOrderId}
  draftItemCount={draftItemCount}
  sessionId={sessionId}
  terminalId={terminalId}
  disabled={!currentOrderItems.length}
  onFireSuccess={handleOrderFired}
/>
```

Add RecallOrderModal state:

```typescript
const [showRecall, setShowRecall] = useState(false);
const [recallBatchId, setRecallBatchId] = useState<string | null>(null);

// When fire succeeds, store batch ID
const handleOrderFired = (result: any) => {
  storeLastBatchId(result.fire_batch_id);
  setRecallBatchId(result.fire_batch_id);
  // Auto-show recall modal for 60 seconds
  setShowRecall(true);
};

// Add modal to render
<RecallOrderModal
  isOpen={showRecall}
  orderId={activeOrderId}
  fireBatchId={recallBatchId || ''}
  firedItemCount={lastFiredCount}
  firedAt={new Date(lastFireTime)}
  sessionId={sessionId}
  terminalId={terminalId}
  onClose={() => setShowRecall(false)}
/>
```

---

### KDSView Integration
Replace item status display with updater component:

```typescript
// At top of KDSView.tsx
import { OrderItemStatusUpdater } from './components/OrderItemStatusUpdater';
import { ManagerApprovalModal } from './components/ManagerApprovalModal';

// In item render:
{items.map(item => (
  <div key={item.id} className="flex items-center justify-between">
    <span>{item.item_name}</span>
    <OrderItemStatusUpdater
      orderId={item.order_id}
      itemId={item.id}
      itemName={item.item_name}
      currentStatus={item.item_status}
      sessionId={sessionId}
      terminalId={terminalId}
      onStatusChange={(status, approval) => {
        if (approval) {
          setApprovalItemId(item.id);
          setShowApproval(true);
        }
      }}
    />
  </div>
))}

// Add approval modal
<ManagerApprovalModal
  isOpen={showApproval}
  orderItemId={approvalItemId}
  itemName={approvalItemName}
  orderId={currentOrderId}
  sessionId={sessionId}
  terminalId={terminalId}
  onClose={() => setShowApproval(false)}
/>
```

---

### KDS Real-Time Polling Fallback

Add to KDSView initialization:

```typescript
const [usePolling, setUsePolling] = useState(false);

useEffect(() => {
  // WebSocket connection with fallback
  const socket = io('http://localhost:3001', {
    extraHeaders: { Authorization: `Bearer ${accessToken}` }
  });

  socket.on('connect', () => {
    setUsePolling(false);
    console.log('[KDS] WebSocket connected');
  });

  socket.on('disconnect', () => {
    console.log('[KDS] WebSocket disconnected, switching to polling');
    setUsePolling(true);
  });

  socket.on('order-items-updated', (data) => {
    refreshOrderItems(data);
  });

  // Polling fallback (3-second interval)
  let pollInterval: NodeJS.Timeout | null = null;
  
  const startPolling = () => {
    pollInterval = setInterval(async () => {
      const items = await fetch(
        `http://localhost:3001/api/kds/items?status=PENDING,PREPARING`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      ).then(r => r.json());
      
      refreshOrderItems(items);
    }, 3000);
  };

  socket.on('connect_error', () => {
    if (!pollInterval) startPolling();
  });

  return () => {
    socket.disconnect();
    if (pollInterval) clearInterval(pollInterval);
  };
}, []);
```

---

## 🧪 Testing Checklist

### Manual Testing

- [ ] **Fire Order Flow**
  1. Create order with DRAFT items
  2. Click Fire button
  3. Confirm dialog
  4. Verify items become PENDING
  5. Check fire_batch_id returned

- [ ] **Recall Order Flow**
  1. Fire items (creates batch)
  2. Click Recall button
  3. Check 60-second countdown timer
  4. Recall batch
  5. Verify items revert to DRAFT

- [ ] **Status Update Flow (KDS)**
  1. Click item status button
  2. Select valid transition
  3. Verify status updates
  4. Check audit log entry

- [ ] **Skip with Reason**
  1. Select SKIP transition
  2. Choose skip reason
  3. Verify item marked SKIPPED
  4. Check skip_reason in database

- [ ] **Manager Approval**
  1. Try to skip SERVED item
  2. approval_required flag returns true
  3. Open Manager Approval modal
  4. Enter reason + PIN
  5. Approve skip
  6. Verify item status updates

- [ ] **Window Expiration**
  1. Fire batch
  2. Wait >60 seconds
  3. Try to recall
  4. Verify error: "Recall window expired"

- [ ] **Undo Done (30-Sec Window)**
  1. Item status DONE
  2. Click status dropdown
  3. Select DONE (undo)
  4. Enter undo reason
  5. Verify item reverts to PREPARING

---

## 📊 Component Dependencies

```
useOrderWorkflow.ts (hook)
├── OrderItemStatusUpdater.tsx
├── FireOrderButton.tsx
├── RecallOrderModal.tsx
└── ManagerApprovalModal.tsx

App.tsx (context)
├── sessionId (from sessionStorage)
├── terminalId (from localStorage)
└── Authorization header (JWT from sessionStorage)
```

---

## 🔐 Security Features Implemented

✅ **Authentication**
- JWT token auto-injected from sessionStorage
- Bearer token in Authorization header

✅ **Session Management**
- x-session-id header on all requests
- x-terminal-id header for audit trail
- Server validates active session

✅ **Role-Based Access**
- Manager approval requires MANAGER role
- Server validates role from JWT

✅ **Audit Trail**
- All operations logged with action_type
- Staff ID and role captured
- Session ID linked to operation
- Terminal ID tracked

✅ **Tenant Isolation**
- restaurantId validated server-side
- Multi-tenant support maintained

---

## 🚀 Performance Optimizations

✅ **Minimal Re-renders**
- useCallback hooks prevent unnecessary renders
- State isolated per component
- Event handlers memoized

✅ **User Experience**
- Auto-dismiss success messages
- Loading spinners on async operations
- Disabled buttons during requests
- Error messages with context

✅ **Real-Time Sync**
- WebSocket-first approach
- Automatic polling fallback (3-second)
- Graceful degradation

---

## ✅ Completion Checklist

- [x] useOrderWorkflow.ts hook created with all methods
- [x] FireOrderButton.tsx component implemented
- [x] RecallOrderModal.tsx component implemented
- [x] OrderItemStatusUpdater.tsx component implemented
- [x] ManagerApprovalModal.tsx component implemented
- [x] All components use custom hook
- [x] JWT auto-injection from sessionStorage
- [x] Error handling with user-friendly messages
- [x] Success/error toast notifications
- [x] Loading states on all async operations
- [x] Role-based access (manager approval)
- [x] Session gate headers (x-session-id, x-terminal-id)
- [x] Time windows enforced (60-sec recall, 30-sec undo)
- [x] Audit trail integration
- [x] Fallback polling for KDS

---

## 📝 Integration Notes

### For POSView
1. Import FireOrderButton component
2. Pass draftItemCount (count items with item_status === DRAFT)
3. Pass sessionId and terminalId
4. Handle onFireSuccess callback to refresh order

### For KDSView
1. Import OrderItemStatusUpdater component
2. Import ManagerApprovalModal component
3. Replace static status display with updater component
4. Add approval modal state management
5. Implement polling fallback on connection loss

### For Order Context
1. Ensure sessionId and terminalId available from localStorage/sessionStorage
2. Pass currentUser role for manager approval validation
3. Refresh order items after fire/recall/status update

---

## 🎉 Phase 3 Status: READY FOR INTEGRATION

All frontend components are implemented and ready for:
1. Integration into POSView and KDSView
2. Testing with Phase 2 backend endpoints
3. Real-time socket.io + polling hybrid approach
4. Production deployment

**Next Steps**:
1. Copy components into appropriate directories
2. Import into POSView and KDSView
3. Test fire → recall → status update flow
4. Validate manager approval workflow
5. Performance testing under load

---

**Prepared by**: GitHub Copilot  
**Date**: April 8, 2026  
**Status**: Phase 3 Frontend Implementation Complete ✅
