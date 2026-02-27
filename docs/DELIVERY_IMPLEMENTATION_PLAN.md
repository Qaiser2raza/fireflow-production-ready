# 🚀 Delivery Workflow - Complete Implementation Plan

**Date**: February 5, 2026  
**Estimated Time**: 2 weeks (10 working days)  
**Developer**: 1 Full-stack Developer  
**Status**: Ready to Implement

---

## 📋 Table of Contents

1. [Phase 1: Driver Assignment (Days 1-3)](#phase-1-driver-assignment)
2. [Phase 2: Cash Settlement (Days 4-6)](#phase-2-cash-settlement)
3. [Phase 3: Delivery Tracking (Days 7-8)](#phase-3-delivery-tracking)
4. [Phase 4: Testing & Polish (Days 9-10)](#phase-4-testing--polish)
5. [File Structure](#file-structure)
6. [Database Migrations](#database-migrations)
7. [API Endpoints](#api-endpoints)
8. [Testing Strategy](#testing-strategy)

---

## Phase 1: Driver Assignment (Days 1-3)

### Day 1: Backend API Implementation

#### File 1: Create Driver Assignment Endpoint
**Location**: `src/api/routes/deliveryRoutes.ts` (NEW FILE)

```typescript
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

// Schema validation
const assignDriverSchema = z.object({
  driverId: z.string().uuid(),
  floatAmount: z.number().min(0).default(5000),
  processedBy: z.string().uuid()
});

// POST /api/orders/:orderId/assign-driver
router.post('/:orderId/assign-driver', async (req, res) => {
  try {
    const { orderId } = req.params;
    const validated = assignDriverSchema.parse(req.body);
    const { driverId, floatAmount, processedBy } = validated;

    // Use transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 1. Check if order exists and is assignable
      const order = await tx.orders.findUnique({
        where: { id: orderId },
        include: { delivery_orders: true }
      });

      if (!order) {
        throw new Error('Order not found');
      }

      if (order.type !== 'DELIVERY') {
        throw new Error('Order is not a delivery order');
      }

      if (order.assigned_driver_id) {
        throw new Error('Order already assigned to a driver');
      }

      // 2. Check if driver exists and is available
      const driver = await tx.staff.findUnique({
        where: { id: driverId }
      });

      if (!driver) {
        throw new Error('Driver not found');
      }

      if (driver.role !== 'DRIVER' && driver.role !== 'RIDER') {
        throw new Error('Staff member is not a driver');
      }

      // 3. Update order
      const updatedOrder = await tx.orders.update({
        where: { id: orderId },
        data: {
          assigned_driver_id: driverId,
          status: 'OUT_FOR_DELIVERY',
          float_given: floatAmount,
          expected_return: Number(order.total) + floatAmount,
          last_action_by: processedBy,
          last_action_desc: `Assigned to driver ${driver.name}`,
          last_action_at: new Date()
        }
      });

      // 4. Update delivery_orders
      if (order.delivery_orders && order.delivery_orders.length > 0) {
        await tx.delivery_orders.update({
          where: { order_id: orderId },
          data: {
            driver_id: driverId,
            dispatched_at: new Date(),
            float_given: floatAmount,
            expected_return: Number(order.total) + floatAmount
          }
        });
      }

      // 5. Update driver's cash in hand
      await tx.staff.update({
        where: { id: driverId },
        data: {
          cash_in_hand: {
            increment: floatAmount
          },
          total_deliveries: {
            increment: 1
          }
        }
      });

      // 6. Create audit log
      await tx.audit_logs.create({
        data: {
          action_type: 'DRIVER_ASSIGNED',
          entity_type: 'ORDER',
          entity_id: orderId,
          staff_id: processedBy,
          details: {
            driver_id: driverId,
            driver_name: driver.name,
            float_given: floatAmount,
            order_total: order.total
          }
        }
      });

      return updatedOrder;
    });

    res.json({
      success: true,
      order: result,
      message: 'Driver assigned successfully'
    });

  } catch (error) {
    console.error('Driver assignment error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/orders/:orderId/mark-delivered
router.post('/:orderId/mark-delivered', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { processedBy } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.orders.findUnique({
        where: { id: orderId },
        include: { delivery_orders: true }
      });

      if (!order) {
        throw new Error('Order not found');
      }

      if (order.status !== 'OUT_FOR_DELIVERY') {
        throw new Error('Order is not out for delivery');
      }

      // Calculate delivery duration
      const deliveryOrder = order.delivery_orders?.[0];
      const dispatchedAt = deliveryOrder?.dispatched_at;
      const deliveredAt = new Date();
      const durationMinutes = dispatchedAt 
        ? Math.round((deliveredAt.getTime() - new Date(dispatchedAt).getTime()) / 60000)
        : null;

      // Update order
      const updatedOrder = await tx.orders.update({
        where: { id: orderId },
        data: {
          status: 'DELIVERED',
          last_action_by: processedBy,
          last_action_desc: 'Marked as delivered',
          last_action_at: deliveredAt
        }
      });

      // Update delivery_orders
      if (deliveryOrder) {
        await tx.delivery_orders.update({
          where: { order_id: orderId },
          data: {
            delivered_at: deliveredAt,
            delivery_duration_minutes: durationMinutes
          }
        });
      }

      // Create audit log
      await tx.audit_logs.create({
        data: {
          action_type: 'ORDER_DELIVERED',
          entity_type: 'ORDER',
          entity_id: orderId,
          staff_id: processedBy,
          details: {
            delivered_at: deliveredAt,
            duration_minutes: durationMinutes
          }
        }
      });

      return updatedOrder;
    });

    res.json({
      success: true,
      order: result,
      message: 'Order marked as delivered'
    });

  } catch (error) {
    console.error('Mark delivered error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
```

#### File 2: Register Routes
**Location**: `src/api/server.ts` (MODIFY)

```typescript
// Add this import at the top
import deliveryRoutes from './routes/deliveryRoutes';

// Add this route registration (around line 50-60)
app.use('/api/orders', deliveryRoutes);
```

---

### Day 2: Frontend - Float Amount Input

#### File 3: Update Logistics Hub
**Location**: `src/operations/logistics/LogisticsHub.tsx` (MODIFY)

```typescript
// Add state for float amount (around line 20)
const [floatAmount, setFloatAmount] = useState<number>(5000);
const [showFloatInput, setShowFloatInput] = useState(false);
const [selectedDriver, setSelectedDriver] = useState<string | null>(null);

// Update handleBatchDispatch function (replace existing)
const handleBatchDispatch = async (driverId: string) => {
  if (selectedOrderIds.length === 0) {
    addNotification('error', 'Please select at least one order');
    return;
  }

  // Show confirmation dialog
  const driver = drivers.find(d => d.id === driverId);
  const totalAmount = selectedOrderIds.reduce((sum, id) => {
    const order = orders.find(o => o.id === id);
    return sum + (order?.total || 0);
  }, 0);

  const confirmed = window.confirm(
    `Assign ${selectedOrderIds.length} orders to ${driver?.name}?\n\n` +
    `Float: Rs. ${floatAmount.toLocaleString()}\n` +
    `Total to collect: Rs. ${totalAmount.toLocaleString()}\n` +
    `Expected return: Rs. ${(totalAmount + floatAmount).toLocaleString()}`
  );

  if (!confirmed) return;

  setIsDispatching(true);
  try {
    // Assign each order
    for (const id of selectedOrderIds) {
      const response = await fetch(`${API_URL}/orders/${id}/assign-driver`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-staff-id': currentUser.id 
        },
        body: JSON.stringify({
          driverId,
          floatAmount,
          processedBy: currentUser.id
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Assignment failed');
      }
    }

    // Print delivery slips
    if (window.electronAPI) {
      window.electronAPI.printDeliverySlip({
        orderIds: selectedOrderIds,
        driverId,
        driverName: driver?.name,
        floatAmount,
        totalAmount,
        timestamp: new Date().toISOString()
      });
    }

    addNotification('success', `✓ Dispatched ${selectedOrderIds.length} orders to ${driver?.name}`);
    setSelectedOrderIds([]);
    setShowFloatInput(false);
    
    // Refresh orders
    window.location.reload(); // Or use proper state management

  } catch (err) {
    console.error('Dispatch error:', err);
    addNotification('error', `Dispatch failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  } finally {
    setIsDispatching(false);
  }
};

// Add float input modal (add before closing div)
{showFloatInput && selectedDriver && (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
      <h3 className="text-xl font-bold text-white mb-4">Enter Float Amount</h3>
      
      <div className="mb-6">
        <label className="block text-sm text-slate-400 mb-2">
          Cash to give rider for change
        </label>
        <input
          type="number"
          value={floatAmount}
          onChange={(e) => setFloatAmount(Number(e.target.value))}
          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white text-lg"
          placeholder="5000"
          min="0"
          step="500"
          autoFocus
        />
        <p className="text-xs text-slate-500 mt-2">
          Recommended: Rs. 5,000 - 10,000
        </p>
      </div>

      <div className="bg-slate-800/50 rounded-lg p-4 mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-400">Orders selected:</span>
          <span className="text-white font-medium">{selectedOrderIds.length}</span>
        </div>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-400">Total to collect:</span>
          <span className="text-white font-medium">
            Rs. {selectedOrderIds.reduce((sum, id) => {
              const order = orders.find(o => o.id === id);
              return sum + (order?.total || 0);
            }, 0).toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Float amount:</span>
          <span className="text-green-400 font-medium">Rs. {floatAmount.toLocaleString()}</span>
        </div>
        <div className="border-t border-slate-700 mt-3 pt-3 flex justify-between">
          <span className="text-white font-semibold">Expected return:</span>
          <span className="text-white font-bold text-lg">
            Rs. {(selectedOrderIds.reduce((sum, id) => {
              const order = orders.find(o => o.id === id);
              return sum + (order?.total || 0);
            }, 0) + floatAmount).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => {
            setShowFloatInput(false);
            setSelectedDriver(null);
          }}
          className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            if (selectedDriver) {
              handleBatchDispatch(selectedDriver);
            }
          }}
          disabled={isDispatching}
          className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {isDispatching ? 'Assigning...' : 'Confirm Dispatch'}
        </button>
      </div>
    </div>
  </div>
)}

// Update driver card button click (find the "Assign Batch" button and modify)
<button
  onClick={() => {
    if (selectedOrderIds.length === 0) {
      addNotification('error', 'Please select orders first');
      return;
    }
    setSelectedDriver(driver.id);
    setShowFloatInput(true);
  }}
  className="..."
>
  Assign Batch ({selectedOrderIds.length})
</button>
```

---

### Day 3: Mark as Delivered Function

#### File 4: Add Mark Delivered Button
**Location**: `src/operations/logistics/LogisticsHub.tsx` (MODIFY)

```typescript
// Add function to mark as delivered
const handleMarkDelivered = async (orderId: string) => {
  const order = orders.find(o => o.id === orderId);
  
  const confirmed = window.confirm(
    `Mark order as delivered?\n\n` +
    `Customer: ${order?.customer_name || 'N/A'}\n` +
    `Total: Rs. ${order?.total?.toLocaleString() || '0'}`
  );

  if (!confirmed) return;

  try {
    const response = await fetch(`${API_URL}/orders/${orderId}/mark-delivered`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-staff-id': currentUser.id 
      },
      body: JSON.stringify({
        processedBy: currentUser.id
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to mark as delivered');
    }

    addNotification('success', '✓ Order marked as delivered');
    window.location.reload(); // Or use proper state management

  } catch (err) {
    console.error('Mark delivered error:', err);
    addNotification('error', `Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
};

// In the "In Transit" tab, add button to each order card
// Find the order card rendering and add:
<button
  onClick={() => handleMarkDelivered(order.id)}
  className="w-full mt-3 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
>
  <Check size={16} />
  Confirm Delivered
</button>
```

---

## Phase 2: Cash Settlement (Days 4-6)

### Day 4: Settlement Backend

#### File 5: Settlement Endpoint
**Location**: `src/api/routes/deliveryRoutes.ts` (ADD TO EXISTING FILE)

```typescript
// Add to existing deliveryRoutes.ts

const settlementSchema = z.object({
  driverId: z.string().uuid(),
  orderIds: z.array(z.string().uuid()),
  amountExpected: z.number(),
  amountReceived: z.number(),
  floatGiven: z.number(),
  shortage: z.number().default(0),
  processedBy: z.string().uuid(),
  notes: z.string().optional()
});

// POST /api/riders/settle
router.post('/riders/settle', async (req, res) => {
  try {
    const validated = settlementSchema.parse(req.body);
    const {
      driverId,
      orderIds,
      amountExpected,
      amountReceived,
      floatGiven,
      shortage,
      processedBy,
      notes
    } = validated;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Verify all orders belong to this driver and are delivered
      const orders = await tx.orders.findMany({
        where: {
          id: { in: orderIds },
          assigned_driver_id: driverId,
          status: 'DELIVERED'
        },
        include: { delivery_orders: true }
      });

      if (orders.length !== orderIds.length) {
        throw new Error('Some orders are not valid for settlement');
      }

      // 2. Verify amounts
      const calculatedTotal = orders.reduce((sum, o) => sum + Number(o.total), 0);
      if (Math.abs(calculatedTotal - amountExpected) > 0.01) {
        throw new Error(`Amount mismatch: expected ${calculatedTotal}, got ${amountExpected}`);
      }

      // 3. Create settlement record
      const settlement = await tx.rider_settlements.create({
        data: {
          restaurant_id: orders[0].restaurant_id,
          driver_id: driverId,
          start_time: orders[0].delivery_orders?.[0]?.dispatched_at || new Date(),
          end_time: new Date(),
          amount_collected: amountReceived,
          amount_expected: amountExpected,
          amount_handed_over: amountReceived,
          shortage: shortage,
          status: 'COMPLETED',
          processed_by: processedBy,
          notes: notes || null
        }
      });

      // 4. Update all orders
      await tx.orders.updateMany({
        where: { id: { in: orderIds } },
        data: {
          is_settled_with_rider: true,
          status: 'PAID',
          last_action_by: processedBy,
          last_action_desc: 'Cash settled with rider',
          last_action_at: new Date()
        }
      });

      // 5. Update delivery_orders
      await tx.delivery_orders.updateMany({
        where: { order_id: { in: orderIds } },
        data: {
          is_settled_with_rider: true
        }
      });

      // 6. Update driver's cash in hand
      await tx.staff.update({
        where: { id: driverId },
        data: {
          cash_in_hand: {
            decrement: floatGiven
          }
        }
      });

      // 7. Create transaction records for each order
      for (const order of orders) {
        await tx.transactions.create({
          data: {
            restaurant_id: order.restaurant_id,
            order_id: order.id,
            amount: Number(order.total),
            payment_method: 'CASH',
            status: 'PAID',
            processed_by: processedBy,
            notes: `Settled with rider - Settlement ID: ${settlement.id}`
          }
        });
      }

      // 8. Create audit log
      await tx.audit_logs.create({
        data: {
          action_type: 'RIDER_SETTLEMENT',
          entity_type: 'SETTLEMENT',
          entity_id: settlement.id,
          staff_id: processedBy,
          details: {
            driver_id: driverId,
            order_count: orderIds.length,
            amount_expected: amountExpected,
            amount_received: amountReceived,
            shortage: shortage
          }
        }
      });

      return settlement;
    });

    res.json({
      success: true,
      settlement: result,
      message: 'Settlement completed successfully'
    });

  } catch (error) {
    console.error('Settlement error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/riders/:driverId/pending-settlement
router.get('/riders/:driverId/pending-settlement', async (req, res) => {
  try {
    const { driverId } = req.params;

    const orders = await prisma.orders.findMany({
      where: {
        assigned_driver_id: driverId,
        status: 'DELIVERED',
        is_settled_with_rider: false
      },
      include: {
        delivery_orders: true,
        order_items: true
      },
      orderBy: {
        created_at: 'asc'
      }
    });

    const totalExpected = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const totalFloat = orders.reduce((sum, o) => sum + Number(o.float_given || 0), 0);

    res.json({
      success: true,
      orders,
      summary: {
        orderCount: orders.length,
        totalExpected,
        totalFloat,
        expectedReturn: totalExpected + totalFloat
      }
    });

  } catch (error) {
    console.error('Pending settlement error:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
```

---

### Day 5-6: Settlement UI

#### File 6: Settlement View Component
**Location**: `src/operations/logistics/SettlementView.tsx` (NEW FILE)

```typescript
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../client/App';
import { DollarSign, AlertCircle, Check, X } from 'lucide-react';

interface PendingSettlement {
  orders: any[];
  summary: {
    orderCount: number;
    totalExpected: number;
    totalFloat: number;
    expectedReturn: number;
  };
}

export const SettlementView: React.FC = () => {
  const { drivers, currentUser, addNotification } = useAppContext();
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [pendingOrders, setPendingOrders] = useState<PendingSettlement | null>(null);
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Load pending orders when driver is selected
  useEffect(() => {
    if (selectedDriver) {
      loadPendingOrders(selectedDriver);
    } else {
      setPendingOrders(null);
    }
  }, [selectedDriver]);

  const loadPendingOrders = async (driverId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/riders/${driverId}/pending-settlement`, {
        headers: { 'x-staff-id': currentUser.id }
      });

      if (!response.ok) throw new Error('Failed to load pending orders');

      const data = await response.json();
      setPendingOrders(data);
      
      // Auto-fill expected amount
      setAmountReceived(data.summary.totalExpected.toString());

    } catch (error) {
      console.error('Load error:', error);
      addNotification('error', 'Failed to load pending orders');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSettle = async () => {
    if (!selectedDriver || !pendingOrders) return;

    const received = Number(amountReceived);
    const expected = pendingOrders.summary.totalExpected;
    const floatGiven = pendingOrders.summary.totalFloat;
    const shortage = expected - received;

    // Confirmation
    const confirmed = window.confirm(
      `Settle ${pendingOrders.summary.orderCount} orders?\n\n` +
      `Expected: Rs. ${expected.toLocaleString()}\n` +
      `Received: Rs. ${received.toLocaleString()}\n` +
      `Float: Rs. ${floatGiven.toLocaleString()}\n` +
      `Shortage: Rs. ${shortage.toLocaleString()}`
    );

    if (!confirmed) return;

    setIsProcessing(true);
    try {
      const response = await fetch(`${API_URL}/riders/settle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-staff-id': currentUser.id
        },
        body: JSON.stringify({
          driverId: selectedDriver,
          orderIds: pendingOrders.orders.map(o => o.id),
          amountExpected: expected,
          amountReceived: received,
          floatGiven: floatGiven,
          shortage: shortage,
          processedBy: currentUser.id,
          notes: notes || undefined
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Settlement failed');
      }

      addNotification('success', '✓ Settlement completed successfully');
      
      // Reset
      setSelectedDriver(null);
      setPendingOrders(null);
      setAmountReceived('');
      setNotes('');

    } catch (error) {
      console.error('Settlement error:', error);
      addNotification('error', `Settlement failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const shortage = pendingOrders 
    ? pendingOrders.summary.totalExpected - Number(amountReceived || 0)
    : 0;

  return (
    <div className="h-full bg-[#050810] text-slate-200 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Cash Settlement</h1>
          <p className="text-slate-400">Settle cash with delivery riders</p>
        </div>

        {/* Driver Selection */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-3">
            Select Rider
          </label>
          <select
            value={selectedDriver || ''}
            onChange={(e) => setSelectedDriver(e.target.value || null)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white"
          >
            <option value="">-- Select a rider --</option>
            {drivers
              .filter(d => d.role === 'DRIVER' || d.role === 'RIDER')
              .map(driver => (
                <option key={driver.id} value={driver.id}>
                  {driver.name} - Cash in hand: Rs. {(driver.cash_in_hand || 0).toLocaleString()}
                </option>
              ))}
          </select>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-slate-700 border-t-blue-500"></div>
            <p className="text-slate-400 mt-4">Loading pending orders...</p>
          </div>
        )}

        {/* Pending Orders */}
        {pendingOrders && !isLoading && (
          <>
            {/* Summary Card */}
            <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 border border-blue-800/30 rounded-2xl p-6 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Orders</div>
                  <div className="text-2xl font-bold text-white">
                    {pendingOrders.summary.orderCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Expected</div>
                  <div className="text-2xl font-bold text-green-400">
                    Rs. {pendingOrders.summary.totalExpected.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Float Given</div>
                  <div className="text-2xl font-bold text-blue-400">
                    Rs. {pendingOrders.summary.totalFloat.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Total Return</div>
                  <div className="text-2xl font-bold text-white">
                    Rs. {pendingOrders.summary.expectedReturn.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Order List */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                Pending Orders ({pendingOrders.orders.length})
              </h3>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {pendingOrders.orders.map(order => (
                  <div
                    key={order.id}
                    className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 flex justify-between items-center"
                  >
                    <div>
                      <div className="font-medium text-white">
                        {order.customer_name || 'Customer'}
                      </div>
                      <div className="text-sm text-slate-400">
                        {order.delivery_orders?.[0]?.delivery_address || 'No address'}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {new Date(order.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-green-400">
                        Rs. {Number(order.total).toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-500">
                        Float: Rs. {Number(order.float_given || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Settlement Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
              <h3 className="text-lg font-semibold text-white mb-4">Settlement Details</h3>
              
              <div className="space-y-4">
                {/* Amount Received */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Cash Received from Rider
                  </label>
                  <input
                    type="number"
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white text-xl font-bold"
                    placeholder="0"
                    min="0"
                    step="1"
                  />
                </div>

                {/* Shortage Alert */}
                {shortage !== 0 && (
                  <div className={`p-4 rounded-lg flex items-start gap-3 ${
                    shortage > 0 
                      ? 'bg-red-900/20 border border-red-800/30' 
                      : 'bg-green-900/20 border border-green-800/30'
                  }`}>
                    <AlertCircle className={shortage > 0 ? 'text-red-400' : 'text-green-400'} size={20} />
                    <div>
                      <div className="font-semibold text-white">
                        {shortage > 0 ? 'Shortage Detected' : 'Excess Amount'}
                      </div>
                      <div className={shortage > 0 ? 'text-red-400' : 'text-green-400'}>
                        Rs. {Math.abs(shortage).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white"
                    rows={3}
                    placeholder="Any additional notes..."
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setSelectedDriver(null);
                  setPendingOrders(null);
                  setAmountReceived('');
                  setNotes('');
                }}
                className="flex-1 px-6 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <X size={20} />
                Cancel
              </button>
              <button
                onClick={handleSettle}
                disabled={isProcessing || !amountReceived}
                className="flex-1 px-6 py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold"
              >
                <Check size={20} />
                {isProcessing ? 'Processing...' : 'Complete Settlement'}
              </button>
            </div>
          </>
        )}

        {/* Empty State */}
        {!selectedDriver && !isLoading && (
          <div className="text-center py-16">
            <DollarSign size={64} className="mx-auto text-slate-700 mb-4" />
            <p className="text-slate-400 text-lg">Select a rider to begin settlement</p>
          </div>
        )}

        {selectedDriver && pendingOrders && pendingOrders.orders.length === 0 && !isLoading && (
          <div className="text-center py-16">
            <Check size={64} className="mx-auto text-green-500 mb-4" />
            <p className="text-slate-400 text-lg">No pending orders for this rider</p>
          </div>
        )}
      </div>
    </div>
  );
};
```

#### File 7: Add Settlement to Navigation
**Location**: `src/client/App.tsx` (MODIFY)

```typescript
// Import the component
import { SettlementView } from '../operations/logistics/SettlementView';

// Add to navigation (find the navigation section and add)
{currentUser.role === 'MANAGER' && (
  <button
    onClick={() => setActiveView('SETTLEMENT')}
    className={`... ${activeView === 'SETTLEMENT' ? 'active' : ''}`}
  >
    <DollarSign size={20} />
    Settlement
  </button>
)}

// Add to view rendering (find the switch/if statement for views)
{activeView === 'SETTLEMENT' && <SettlementView />}
```

---

## Phase 3: Delivery Tracking (Days 7-8)

### Day 7: Database Migration

#### File 8: Add Missing Columns
**Location**: `prisma/migrations/add_delivery_tracking.sql` (NEW FILE)

```sql
-- Add delivery tracking fields
ALTER TABLE delivery_orders 
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS delivery_duration_minutes INTEGER;

-- Add driver location fields (for future GPS tracking)
ALTER TABLE delivery_orders
ADD COLUMN IF NOT EXISTS current_lat DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS current_lng DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS last_location_update TIMESTAMP;

-- Add failed delivery reason
ALTER TABLE delivery_orders
ADD COLUMN IF NOT EXISTS failed_reason TEXT;

-- Add driver availability
ALTER TABLE staff
ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS average_delivery_time_minutes INTEGER;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_delivery_orders_driver_id ON delivery_orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_delivered_at ON delivery_orders(delivered_at);
```

Run migration:
```bash
npx prisma db push
npx prisma generate
```

---

### Day 8: Delivery Reports

#### File 9: Delivery Reports Component
**Location**: `src/operations/reports/DeliveryReports.tsx` (NEW FILE)

```typescript
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../client/App';
import { TrendingUp, Clock, DollarSign, Truck } from 'lucide-react';

export const DeliveryReports: React.FC = () => {
  const { orders, drivers } = useAppContext();
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('today');

  // Filter delivery orders
  const deliveryOrders = orders.filter(o => o.type === 'DELIVERY');

  // Calculate metrics
  const metrics = {
    totalOrders: deliveryOrders.length,
    completedOrders: deliveryOrders.filter(o => o.status === 'COMPLETED').length,
    totalRevenue: deliveryOrders
      .filter(o => o.status === 'PAID' || o.status === 'COMPLETED')
      .reduce((sum, o) => sum + Number(o.total), 0),
    averageOrderValue: deliveryOrders.length > 0
      ? deliveryOrders.reduce((sum, o) => sum + Number(o.total), 0) / deliveryOrders.length
      : 0,
    averageDeliveryTime: deliveryOrders
      .filter(o => o.delivery_orders?.[0]?.delivery_duration_minutes)
      .reduce((sum, o) => sum + (o.delivery_orders?.[0]?.delivery_duration_minutes || 0), 0) /
      deliveryOrders.filter(o => o.delivery_orders?.[0]?.delivery_duration_minutes).length || 0
  };

  // Driver performance
  const driverStats = drivers.map(driver => {
    const driverOrders = deliveryOrders.filter(o => o.assigned_driver_id === driver.id);
    const completedOrders = driverOrders.filter(o => o.status === 'COMPLETED');
    
    return {
      driver,
      totalDeliveries: driverOrders.length,
      completedDeliveries: completedOrders.length,
      totalRevenue: completedOrders.reduce((sum, o) => sum + Number(o.total), 0),
      averageTime: driverOrders
        .filter(o => o.delivery_orders?.[0]?.delivery_duration_minutes)
        .reduce((sum, o) => sum + (o.delivery_orders?.[0]?.delivery_duration_minutes || 0), 0) /
        driverOrders.filter(o => o.delivery_orders?.[0]?.delivery_duration_minutes).length || 0
    };
  }).filter(s => s.totalDeliveries > 0);

  return (
    <div className="h-full bg-[#050810] text-slate-200 p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Delivery Reports</h1>
          <p className="text-slate-400">Performance metrics and analytics</p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-blue-900/20 to-blue-800/10 border border-blue-800/30 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <Truck className="text-blue-400" size={24} />
              <span className="text-xs text-slate-400">Total</span>
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              {metrics.totalOrders}
            </div>
            <div className="text-sm text-slate-400">Delivery Orders</div>
          </div>

          <div className="bg-gradient-to-br from-green-900/20 to-green-800/10 border border-green-800/30 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <DollarSign className="text-green-400" size={24} />
              <span className="text-xs text-slate-400">Revenue</span>
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              Rs. {metrics.totalRevenue.toLocaleString()}
            </div>
            <div className="text-sm text-slate-400">Total Earned</div>
          </div>

          <div className="bg-gradient-to-br from-purple-900/20 to-purple-800/10 border border-purple-800/30 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <TrendingUp className="text-purple-400" size={24} />
              <span className="text-xs text-slate-400">Average</span>
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              Rs. {metrics.averageOrderValue.toFixed(0)}
            </div>
            <div className="text-sm text-slate-400">Order Value</div>
          </div>

          <div className="bg-gradient-to-br from-orange-900/20 to-orange-800/10 border border-orange-800/30 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <Clock className="text-orange-400" size={24} />
              <span className="text-xs text-slate-400">Speed</span>
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              {metrics.averageDeliveryTime.toFixed(0)} min
            </div>
            <div className="text-sm text-slate-400">Avg Delivery Time</div>
          </div>
        </div>

        {/* Driver Performance */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-6">Driver Performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Driver</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Deliveries</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Completed</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Revenue</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-slate-400">Avg Time</th>
                </tr>
              </thead>
              <tbody>
                {driverStats.map(stat => (
                  <tr key={stat.driver.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-4 px-4">
                      <div className="font-medium text-white">{stat.driver.name}</div>
                    </td>
                    <td className="py-4 px-4 text-right text-white">{stat.totalDeliveries}</td>
                    <td className="py-4 px-4 text-right text-green-400">{stat.completedDeliveries}</td>
                    <td className="py-4 px-4 text-right text-white">
                      Rs. {stat.totalRevenue.toLocaleString()}
                    </td>
                    <td className="py-4 px-4 text-right text-slate-300">
                      {stat.averageTime > 0 ? `${stat.averageTime.toFixed(0)} min` : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
```

---

## Phase 4: Testing & Polish (Days 9-10)

### Day 9: Integration Testing

Create test file:
**Location**: `tests/delivery-workflow.test.ts` (NEW FILE)

```typescript
import { describe, it, expect } from 'vitest';

describe('Delivery Workflow', () => {
  it('should create delivery order with mandatory phone', async () => {
    // Test order creation
  });

  it('should assign driver with float amount', async () => {
    // Test driver assignment
  });

  it('should mark order as delivered', async () => {
    // Test delivery confirmation
  });

  it('should settle cash with rider', async () => {
    // Test settlement
  });

  it('should detect shortage in settlement', async () => {
    // Test shortage detection
  });
});
```

### Day 10: Documentation & Deployment

1. Update README with new features
2. Create user guide for settlement
3. Test on staging environment
4. Deploy to production

---

## File Structure

```
fireflow/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   └── deliveryRoutes.ts          ← NEW
│   │   └── server.ts                       ← MODIFY
│   ├── operations/
│   │   ├── logistics/
│   │   │   ├── LogisticsHub.tsx            ← MODIFY
│   │   │   └── SettlementView.tsx          ← NEW
│   │   └── reports/
│   │       └── DeliveryReports.tsx         ← NEW
│   └── client/
│       └── App.tsx                         ← MODIFY
├── prisma/
│   └── migrations/
│       └── add_delivery_tracking.sql       ← NEW
├── tests/
│   └── delivery-workflow.test.ts           ← NEW
└── docs/
    ├── DELIVERY_IMPLEMENTATION_PLAN.md     ← THIS FILE
    ├── DELIVERY_WORKFLOW_GAP_ANALYSIS.md
    └── COMPLETE_ORDER_WORKFLOWS.md
```

---

## Database Migrations

Run these commands in order:

```bash
# 1. Add new columns
npx prisma db push

# 2. Regenerate Prisma client
npx prisma generate

# 3. Restart backend server
npm run dev
```

---

## API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/orders/:id/assign-driver` | Assign driver to order |
| POST | `/api/orders/:id/mark-delivered` | Mark order as delivered |
| POST | `/api/riders/settle` | Settle cash with rider |
| GET | `/api/riders/:id/pending-settlement` | Get pending orders for settlement |

---

## Testing Strategy

### Manual Testing Checklist

- [ ] Create delivery order in POS
- [ ] Verify order appears in Logistics Hub
- [ ] Select multiple orders
- [ ] Enter float amount
- [ ] Assign to driver
- [ ] Verify order status changes to OUT_FOR_DELIVERY
- [ ] Mark order as delivered
- [ ] Open Settlement view
- [ ] Select driver
- [ ] Verify pending orders load
- [ ] Enter cash received
- [ ] Complete settlement
- [ ] Verify orders marked as PAID
- [ ] Check driver's cash_in_hand updated
- [ ] View delivery reports

### Automated Testing

```bash
npm run test
```

---

## Deployment Checklist

- [ ] All code committed to Git
- [ ] Database migrations run
- [ ] Environment variables set
- [ ] Backend server restarted
- [ ] Frontend rebuilt
- [ ] User documentation updated
- [ ] Team training completed
- [ ] Backup database before deployment
- [ ] Monitor logs for errors
- [ ] Test on staging first

---

## Timeline Summary

| Phase | Days | Deliverables |
|-------|------|--------------|
| **Phase 1** | 3 | Driver assignment + float input + mark delivered |
| **Phase 2** | 3 | Cash settlement UI + backend |
| **Phase 3** | 2 | Delivery tracking + reports |
| **Phase 4** | 2 | Testing + deployment |
| **Total** | **10 days** | **Complete delivery workflow** |

---

## Success Criteria

✅ Driver can be assigned to multiple orders with float amount  
✅ Orders can be marked as delivered  
✅ Cash settlement process works end-to-end  
✅ Shortage detection works correctly  
✅ Delivery time is tracked  
✅ Reports show accurate metrics  
✅ No data loss or corruption  
✅ Real-time updates work  
✅ User-friendly UI  
✅ Proper error handling  

---

## Support & Maintenance

After deployment:
- Monitor error logs daily
- Collect user feedback
- Fix bugs within 24 hours
- Plan Phase 4 (GPS tracking, notifications) based on business needs

---

**Document Version**: 1.0  
**Last Updated**: February 5, 2026  
**Ready for Implementation**: ✅ YES
