import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../client/contexts/AppContext';
import {
   Bike, MapPin, Clock, Navigation, Package, Send, CheckCircle2,
   Banknote, AlertCircle, Zap, Check, Layers, ShoppingCart,
   X, ChevronRight, TrendingUp, RefreshCw,
   User, AlertTriangle
} from 'lucide-react';

/* ─────────────────────────── helpers ─────────────────────────── */
const fmt = (n: number) => `Rs. ${Number(n).toLocaleString()}`;
const elapsed = (date: string | Date) =>
   Math.floor((Date.now() - new Date(date).getTime()) / 60000);

/* ─────────────────────────── component ─────────────────────────── */
export const LogisticsHub: React.FC = () => {
   const { orders, drivers, addNotification, currentUser, fetchInitialData } = useAppContext();

   const [activeTab, setActiveTab] = useState<'DISPATCH' | 'MONITOR' | 'SETTLE'>('DISPATCH');
   const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
   const [isProcessing, setIsProcessing] = useState(false);

   // Dispatch modal
   const [dispatchRiderId, setDispatchRiderId] = useState<string | null>(null);

   // Shift modal
   const [shiftModal, setShiftModal] = useState<{ open: boolean; mode: 'OPEN' | 'CLOSE'; riderId: string | null }>({ open: false, mode: 'OPEN', riderId: null });
   const [shiftAmount, setShiftAmount] = useState('0');
   const [shiftNotes, setShiftNotes] = useState('');

   // Settlement cart
   const [settleRiderId, setSettleRiderId] = useState<string | null>(null);
   const [receivedCash, setReceivedCash] = useState('');
   const [settleNotes, setSettleNotes] = useState('');

   const API = 'http://localhost:3001/api';

   /* ── derived data ── */
   const pendingDispatch = useMemo(() =>
      orders.filter(o => o.type === 'DELIVERY' && (o.status === 'READY' || o.status === 'ACTIVE') && !o.assigned_driver_id)
         .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
      [orders]);

   const activeRuns = useMemo(() =>
      orders.filter(o => o.type === 'DELIVERY' && o.status === 'READY' && !!o.assigned_driver_id),
      [orders]);

   const delivered = useMemo(() =>
      orders.filter(o => o.type === 'DELIVERY' && o.status === 'DELIVERED'),
      [orders]);

   const riderStats = useMemo(() => drivers.map(d => {
      const onRoad = activeRuns.filter(o => o.assigned_driver_id === d.id);
      const pending = delivered.filter(o => o.assigned_driver_id === d.id);
      const float = Number(d.active_shift?.opening_float || 0);
      const sales = pending.reduce((s, o) => s + Number(o.total), 0);
      return { ...d, onRoad, pending, totalLiability: float + sales, hasShift: !!d.active_shift };
   }), [drivers, activeRuns, delivered]);

   const settleRider = useMemo(() => riderStats.find(r => r.id === settleRiderId), [riderStats, settleRiderId]);
   const settleOrders = useMemo(() => delivered.filter(o => o.assigned_driver_id === settleRiderId), [delivered, settleRiderId]);

   const expectedTotal = settleRider?.totalLiability ?? 0;
   const received = Number(receivedCash) || 0;
   const difference = received - expectedTotal;

   /* ── actions ── */
   const toggleOrder = (id: string) =>
      setSelectedOrderIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

   const toggleAll = () =>
      setSelectedOrderIds(p => p.length === pendingDispatch.length ? [] : pendingDispatch.map(o => o.id));

   const handleDispatch = async () => {
      if (!selectedOrderIds.length || !dispatchRiderId) return;
      setIsProcessing(true);
      try {
         for (const orderId of selectedOrderIds) {
            const res = await fetch(`${API}/orders/${orderId}/assign-driver`, {
               method: 'POST',
               headers: { 'Content-Type': 'application/json', 'x-staff-id': currentUser?.id || '', 'x-restaurant-id': currentUser?.restaurant_id || '' },
               body: JSON.stringify({ driverId: dispatchRiderId, processedBy: currentUser?.id }),
            });
            const d = await res.json();
            if (!d.success) throw new Error(d.error);
         }
         addNotification?.('success', `${selectedOrderIds.length} order(s) dispatched to ${drivers.find(d => d.id === dispatchRiderId)?.name}`);
         setSelectedOrderIds([]);
         setDispatchRiderId(null);
         fetchInitialData();
      } catch (e: any) {
         addNotification?.('error', e.message || 'Dispatch failed');
      } finally { setIsProcessing(false); }
   };

   const handleMarkDelivered = async (orderId: string) => {
      setIsProcessing(true);
      try {
         const res = await fetch(`${API}/orders/${orderId}/mark-delivered`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-staff-id': currentUser?.id || '' },
            body: JSON.stringify({ processedBy: currentUser?.id }),
         });
         if (!res.ok) throw new Error('Update failed');
         addNotification?.('success', 'Marked as Delivered');
         fetchInitialData();
      } catch { addNotification?.('error', 'Failed to mark delivered'); }
      finally { setIsProcessing(false); }
   };

   const handleOpenShift = async () => {
      if (!shiftModal.riderId) return;
      setIsProcessing(true);
      try {
         const res = await fetch(`${API}/riders/shift/open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-restaurant-id': currentUser?.restaurant_id || '' },
            body: JSON.stringify({ riderId: shiftModal.riderId, openedBy: currentUser?.id, openingFloat: Number(shiftAmount), notes: shiftNotes }),
         });
         const d = await res.json();
         if (!d.success) throw new Error(d.error);
         addNotification?.('success', 'Shift opened');
         setShiftModal({ open: false, mode: 'OPEN', riderId: null });
         setShiftAmount('0'); setShiftNotes('');
         fetchInitialData();
      } catch (e: any) { addNotification?.('error', e.message || 'Failed'); }
      finally { setIsProcessing(false); }
   };

   const handleCloseShift = async () => {
      const rider = drivers.find(d => d.id === shiftModal.riderId);
      if (!rider?.active_shift) return;
      setIsProcessing(true);
      try {
         const res = await fetch(`${API}/riders/shift/close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shiftId: rider.active_shift.id, closedBy: currentUser?.id, closingCash: Number(shiftAmount), notes: shiftNotes }),
         });
         const d = await res.json();
         if (!d.success) throw new Error(d.error);
         addNotification?.('success', 'Shift closed & reconciled');
         setShiftModal({ open: false, mode: 'OPEN', riderId: null });
         setShiftAmount('0'); setShiftNotes('');
         fetchInitialData();
      } catch (e: any) { addNotification?.('error', e.message || 'Failed'); }
      finally { setIsProcessing(false); }
   };

   const handleSettle = async () => {
      if (!settleRiderId || !settleOrders.length) return;
      // Guide to shift closure
      const rider = riderStats.find(r => r.id === settleRiderId);
      if (rider?.active_shift) {
         setShiftModal({ open: true, mode: 'CLOSE', riderId: settleRiderId });
         setShiftAmount(String(expectedTotal));
      } else {
         addNotification?.('info', 'No active shift found for this rider. Open a shift first.');
      }
   };

   /* ──────────────────────────── render ──────────────────────────── */
   return (
      <div className="lh-root">
         {/* ── LEFT PANEL: Rider Fleet ── */}
         <aside className="lh-aside">
            <div className="lh-aside-header">
               <div>
                  <h2 className="lh-title-sm">Fleet Command</h2>
                  <p className="lh-subtitle">{drivers.length} RIDERS  •  {activeRuns.length} ON ROAD</p>
               </div>
               <span className="lh-badge-blue"><Bike size={13} />{drivers.filter(d => !!d.active_shift).length} Active</span>
            </div>

            <div className="lh-rider-list">
               {riderStats.map(rider => (
                  <div
                     key={rider.id}
                     className={`lh-rider-card ${settleRiderId === rider.id ? 'lh-rider-card--active' : ''}`}
                     onClick={() => { setSettleRiderId(rider.id); setActiveTab('SETTLE'); setReceivedCash(''); }}
                  >
                     <div className="lh-rider-row">
                        <div className={`lh-avatar ${rider.hasShift ? 'lh-avatar--on' : ''}`}>
                           {rider.name[0].toUpperCase()}
                        </div>
                        <div className="lh-rider-info">
                           <p className="lh-rider-name">{rider.name}</p>
                           <div className="lh-rider-status">
                              <span className={`lh-dot ${rider.hasShift ? 'lh-dot--green' : 'lh-dot--gray'}`} />
                              {rider.hasShift ? `${rider.onRoad.length} running  •  ${rider.pending.length} pending` : 'No active shift'}
                           </div>
                        </div>
                        <div className="lh-rider-liability">
                           <p className="lh-liability-amt">{fmt(rider.totalLiability)}</p>
                           <p className="lh-liability-lbl">liability</p>
                        </div>
                     </div>

                     <div className="lh-rider-actions" onClick={e => e.stopPropagation()}>
                        {!rider.hasShift ? (
                           <button className="lh-btn lh-btn--indigo lh-btn--sm" onClick={() => { setShiftModal({ open: true, mode: 'OPEN', riderId: rider.id }); setShiftAmount('0'); setShiftNotes(''); }}>
                              <Zap size={12} /> Open Shift
                           </button>
                        ) : (
                           <>
                              <button
                                 className={`lh-btn lh-btn--emerald lh-btn--sm ${selectedOrderIds.length === 0 ? 'lh-btn--disabled' : ''}`}
                                 disabled={selectedOrderIds.length === 0}
                                 onClick={() => setDispatchRiderId(rider.id)}
                              >
                                 <Send size={12} /> Dispatch ({selectedOrderIds.length})
                              </button>
                              <button className="lh-btn lh-btn--ghost-red lh-btn--sm" onClick={() => { setShiftModal({ open: true, mode: 'CLOSE', riderId: rider.id }); setShiftAmount(String(rider.totalLiability)); setShiftNotes(''); }}>
                                 <Layers size={12} /> Close Shift
                              </button>
                           </>
                        )}
                     </div>
                  </div>
               ))}

               {drivers.length === 0 && (
                  <div className="lh-empty lh-empty--sm">
                     <Bike size={32} className="lh-empty-icon" />
                     <p>No riders registered</p>
                  </div>
               )}
            </div>

            {/* Fleet summary bar */}
            <div className="lh-fleet-bar">
               <div className="lh-fleet-stat"><p className="lh-fleet-val">{activeRuns.length}</p><p className="lh-fleet-lbl">On Road</p></div>
               <div className="lh-fleet-divider" />
               <div className="lh-fleet-stat"><p className="lh-fleet-val">{delivered.length}</p><p className="lh-fleet-lbl">To Settle</p></div>
               <div className="lh-fleet-divider" />
               <div className="lh-fleet-stat"><p className="lh-fleet-val text-indigo-400">{pendingDispatch.length}</p><p className="lh-fleet-lbl">Queued</p></div>
            </div>
         </aside>

         {/* ── MAIN AREA ── */}
         <main className="lh-main">
            {/* Header */}
            <header className="lh-header">
               <div>
                  <h1 className="lh-title">Logistics Hub</h1>
                  <p className="lh-subtitle ml-3">Mission Control  •  Delivery Operations</p>
               </div>
               <div className="lh-tabs">
                  {([
                     { id: 'DISPATCH', label: 'Dispatch Queue', icon: Package, count: pendingDispatch.length },
                     { id: 'MONITOR', label: 'Live Monitor', icon: Navigation, count: activeRuns.length },
                     { id: 'SETTLE', label: 'Settlement', icon: Banknote, count: delivered.length },
                  ] as const).map(tab => (
                     <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`lh-tab ${activeTab === tab.id ? 'lh-tab--active' : ''}`}>
                        <tab.icon size={15} />
                        {tab.label}
                        {tab.count > 0 && <span className="lh-tab-badge">{tab.count}</span>}
                     </button>
                  ))}
               </div>
            </header>

            <div className="lh-content">

               {/* ════════ DISPATCH TAB ════════ */}
               {activeTab === 'DISPATCH' && (
                  <div className="lh-table-wrapper">
                     {/* Toolbar */}
                     <div className="lh-toolbar">
                        <div className="flex items-center gap-3">
                           <input
                              type="checkbox"
                              className="lh-checkbox"
                              checked={selectedOrderIds.length === pendingDispatch.length && pendingDispatch.length > 0}
                              onChange={toggleAll}
                           />
                           <span className="lh-toolbar-label">
                              {selectedOrderIds.length > 0 ? `${selectedOrderIds.length} selected` : `${pendingDispatch.length} orders waiting`}
                           </span>
                        </div>
                        {selectedOrderIds.length > 0 && (
                           <span className="lh-toolbar-total">
                              Total: {fmt(orders.filter(o => selectedOrderIds.includes(o.id)).reduce((s, o) => s + Number(o.total), 0))}
                           </span>
                        )}
                     </div>

                     {/* Table header */}
                     {pendingDispatch.length > 0 && (
                        <div className="lh-row lh-row--header">
                           <span style={{ width: 32 }} />
                           <span className="lh-col lh-col--order">Order</span>
                           <span className="lh-col lh-col--customer">Customer</span>
                           <span className="lh-col lh-col--address">Address</span>
                           <span className="lh-col lh-col--time">Wait</span>
                           <span className="lh-col lh-col--amount">Amount</span>
                           <span className="lh-col lh-col--action" />
                        </div>
                     )}

                     {/* Rows */}
                     <div className="lh-rows">
                        {pendingDispatch.map(order => {
                           const isSelected = selectedOrderIds.includes(order.id);
                           const mins = elapsed(order.created_at);
                           const urgent = mins > 20;
                           return (
                              <div
                                 key={order.id}
                                 className={`lh-row lh-row--data ${isSelected ? 'lh-row--selected' : ''} ${urgent ? 'lh-row--urgent' : ''}`}
                                 onClick={() => toggleOrder(order.id)}
                              >
                                 <input
                                    type="checkbox"
                                    className="lh-checkbox"
                                    checked={isSelected}
                                    readOnly
                                    onClick={e => e.stopPropagation()}
                                    onChange={() => toggleOrder(order.id)}
                                 />
                                 <span className="lh-col lh-col--order">
                                    <span className="lh-order-id">#{order.id.slice(-6).toUpperCase()}</span>
                                 </span>
                                 <span className="lh-col lh-col--customer">
                                    <span className="lh-customer-name">{order.customer_name || '—'}</span>
                                    {order.customer_phone && <span className="lh-customer-phone">{order.customer_phone}</span>}
                                 </span>
                                 <span className="lh-col lh-col--address">
                                    <MapPin size={12} className="shrink-0 text-slate-500 mt-0.5" />
                                    <span className="lh-address-text">{order.delivery_orders?.[0]?.delivery_address || 'No address'}</span>
                                 </span>
                                 <span className={`lh-col lh-col--time ${urgent ? 'text-red-400' : 'text-slate-400'}`}>
                                    <Clock size={12} />
                                    {mins}m
                                 </span>
                                 <span className="lh-col lh-col--amount lh-amount">{fmt(Number(order.total))}</span>
                                 <span className="lh-col lh-col--action">
                                    {isSelected && <ChevronRight size={16} className="text-indigo-400" />}
                                 </span>
                              </div>
                           );
                        })}
                     </div>

                     {pendingDispatch.length === 0 && (
                        <div className="lh-empty">
                           <Package size={48} className="lh-empty-icon" />
                           <p className="lh-empty-title">Queue Empty</p>
                           <p className="lh-empty-sub">All delivery orders have been dispatched</p>
                        </div>
                     )}
                  </div>
               )}

               {/* ════════ MONITOR TAB ════════ */}
               {activeTab === 'MONITOR' && (
                  <div className="lh-table-wrapper">
                     <div className="lh-toolbar">
                        <span className="lh-toolbar-label">{activeRuns.length} orders on the road</span>
                        <button onClick={fetchInitialData} className="lh-btn lh-btn--ghost lh-btn--sm">
                           <RefreshCw size={13} /> Refresh
                        </button>
                     </div>

                     {activeRuns.length > 0 && (
                        <div className="lh-row lh-row--header">
                           <span className="lh-col lh-col--order">Order</span>
                           <span className="lh-col lh-col--customer">Customer</span>
                           <span className="lh-col lh-col--address">Address</span>
                           <span className="lh-col lh-col--rider">Rider</span>
                           <span className="lh-col lh-col--amount">Amount</span>
                           <span className="lh-col lh-col--action">Action</span>
                        </div>
                     )}

                     <div className="lh-rows">
                        {activeRuns.map(order => {
                           const rider = drivers.find(d => d.id === order.assigned_driver_id);
                           return (
                              <div key={order.id} className="lh-row lh-row--data">
                                 <span className="lh-col lh-col--order">
                                    <span className="lh-order-id">#{order.id.slice(-6).toUpperCase()}</span>
                                 </span>
                                 <span className="lh-col lh-col--customer">
                                    <span className="lh-customer-name">{order.customer_name || '—'}</span>
                                    {order.customer_phone && <span className="lh-customer-phone">{order.customer_phone}</span>}
                                 </span>
                                 <span className="lh-col lh-col--address">
                                    <MapPin size={12} className="shrink-0 text-slate-500 mt-0.5" />
                                    <span className="lh-address-text">{order.delivery_orders?.[0]?.delivery_address || '—'}</span>
                                 </span>
                                 <span className="lh-col lh-col--rider">
                                    <div className="lh-avatar lh-avatar--xs lh-avatar--on">{rider?.name?.[0] ?? '?'}</div>
                                    <span className="lh-rider-name-sm">{rider?.name ?? '—'}</span>
                                 </span>
                                 <span className="lh-col lh-col--amount lh-amount">{fmt(Number(order.total))}</span>
                                 <span className="lh-col lh-col--action">
                                    <button
                                       onClick={() => handleMarkDelivered(order.id)}
                                       disabled={isProcessing}
                                       className="lh-btn lh-btn--indigo lh-btn--sm"
                                    >
                                       <CheckCircle2 size={13} /> Delivered
                                    </button>
                                 </span>
                              </div>
                           );
                        })}
                     </div>

                     {activeRuns.length === 0 && (
                        <div className="lh-empty">
                           <Navigation size={48} className="lh-empty-icon" />
                           <p className="lh-empty-title">Fleet Standby</p>
                           <p className="lh-empty-sub">No orders currently on the road</p>
                        </div>
                     )}
                  </div>
               )}

               {/* ════════ SETTLE TAB ════════ */}
               {activeTab === 'SETTLE' && (
                  <div className="lh-settle-layout">
                     {/* Left: order list */}
                     <div className="lh-settle-orders">
                        <div className="lh-toolbar">
                           <span className="lh-toolbar-label">
                              {settleRider ? `${settleOrders.length} orders — ${settleRider.name}` : 'Select a rider from Fleet panel'}
                           </span>
                           {settleRiderId && (
                              <button onClick={() => { setSettleRiderId(null); setReceivedCash(''); }} className="lh-btn lh-btn--ghost lh-btn--sm">
                                 <X size={13} /> Clear
                              </button>
                           )}
                        </div>

                        {settleRider && settleOrders.length > 0 && (
                           <div className="lh-row lh-row--header">
                              <span className="lh-col lh-col--order">Order</span>
                              <span className="lh-col lh-col--customer">Customer</span>
                              <span className="lh-col lh-col--address">Address</span>
                              <span className="lh-col lh-col--time">Time</span>
                              <span className="lh-col lh-col--amount">Amount</span>
                           </div>
                        )}

                        <div className="lh-rows">
                           {settleOrders.map(order => (
                              <div key={order.id} className="lh-row lh-row--data lh-row--settle">
                                 <span className="lh-col lh-col--order">
                                    <span className="lh-order-id">#{order.id.slice(-6).toUpperCase()}</span>
                                 </span>
                                 <span className="lh-col lh-col--customer">
                                    <span className="lh-customer-name">{order.customer_name || '—'}</span>
                                 </span>
                                 <span className="lh-col lh-col--address">
                                    <MapPin size={12} className="shrink-0 text-slate-500" />
                                    <span className="lh-address-text">{order.delivery_orders?.[0]?.delivery_address || '—'}</span>
                                 </span>
                                 <span className="lh-col lh-col--time text-slate-400">
                                    {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                 </span>
                                 <span className="lh-col lh-col--amount lh-amount lh-amount--emerald">{fmt(Number(order.total))}</span>
                              </div>
                           ))}
                        </div>

                        {!settleRider && (
                           <div className="lh-empty">
                              <User size={48} className="lh-empty-icon" />
                              <p className="lh-empty-title">No Rider Selected</p>
                              <p className="lh-empty-sub">Click a rider in the Fleet panel to load their settlement</p>
                           </div>
                        )}

                        {settleRider && settleOrders.length === 0 && (
                           <div className="lh-empty">
                              <CheckCircle2 size={48} className="lh-empty-icon" />
                              <p className="lh-empty-title">All Settled</p>
                              <p className="lh-empty-sub">{settleRider.name} has no pending deliveries</p>
                           </div>
                        )}
                     </div>

                     {/* Right: Settlement cart — fixed footer layout */}
                     <div className="lh-cart">
                        {/* STICKY HEADER */}
                        <div className="lh-cart-header">
                           <ShoppingCart size={18} className="text-indigo-400" />
                           <h3 className="lh-cart-title">Settlement Cart</h3>
                           {settleRider && (
                              <span className="lh-cart-order-count">{settleOrders.length} orders</span>
                           )}
                        </div>

                        {settleRider ? (
                           <>
                              {/* SCROLLABLE BODY */}
                              <div className="lh-cart-body">
                                 {/* Rider chip */}
                                 <div className="lh-cart-rider">
                                    <div className="lh-avatar lh-avatar--sm lh-avatar--on">{settleRider.name[0]}</div>
                                    <div>
                                       <p className="lh-cart-rider-name">{settleRider.name}</p>
                                       <p className="lh-cart-rider-sub">
                                          {settleRider.onRoad.length > 0 && (
                                             <span className="lh-pill lh-pill--warn">{settleRider.onRoad.length} still on road</span>
                                          )}
                                          Shift #{settleRider.active_shift?.id?.slice(-4).toUpperCase() ?? 'None'}
                                       </p>
                                    </div>
                                 </div>

                                 {/* Per-order rows */}
                                 {settleOrders.length > 0 && (
                                    <div className="lh-cart-orders">
                                       <p className="lh-cart-label" style={{ marginBottom: '6px' }}>Delivered Orders</p>
                                       {settleOrders.map((o, i) => (
                                          <div key={o.id} className="lh-cart-order-row">
                                             <span className="lh-cart-order-num">{i + 1}</span>
                                             <div className="lh-cart-order-info">
                                                <p className="lh-cart-order-name">{o.customer_name || 'Guest'}</p>
                                                <p className="lh-cart-order-addr">{o.delivery_orders?.[0]?.delivery_address || 'No address'}</p>
                                             </div>
                                             <span className="lh-cart-order-amt">{fmt(Number(o.total))}</span>
                                          </div>
                                       ))}
                                    </div>
                                 )}

                                 {/* Breakdown */}
                                 <div className="lh-cart-breakdown">
                                    <div className="lh-cart-line">
                                       <span>Opening Float</span>
                                       <span>{fmt(Number(settleRider.active_shift?.opening_float || 0))}</span>
                                    </div>
                                    <div className="lh-cart-line">
                                       <span>Sales ({settleOrders.length} orders)</span>
                                       <span>{fmt(settleOrders.reduce((s, o) => s + Number(o.total), 0))}</span>
                                    </div>
                                    <div className="lh-cart-divider" />
                                    <div className="lh-cart-line lh-cart-line--total">
                                       <span>Total Expected</span>
                                       <span>{fmt(expectedTotal)}</span>
                                    </div>
                                 </div>

                                 {/* Cash input */}
                                 <div className="lh-cart-field">
                                    <label className="lh-cart-label">Cash Received from Rider</label>
                                    <div className="lh-cash-input-wrap">
                                       <span className="lh-cash-prefix">Rs.</span>
                                       <input
                                          type="number"
                                          className="lh-cash-input"
                                          placeholder="0"
                                          value={receivedCash}
                                          onChange={e => setReceivedCash(e.target.value)}
                                          autoFocus
                                       />
                                    </div>
                                 </div>

                                 {/* Live difference — always visible when entered */}
                                 {received > 0 && (
                                    <div className={`lh-diff ${difference >= 0 ? 'lh-diff--ok' : 'lh-diff--short'}`}>
                                       {difference >= 0
                                          ? <><TrendingUp size={15} /> Overage: {fmt(difference)}</>
                                          : <><AlertTriangle size={15} /> Shortage: {fmt(Math.abs(difference))}</>
                                       }
                                    </div>
                                 )}

                                 {/* Notes */}
                                 <div className="lh-cart-field">
                                    <label className="lh-cart-label">Notes (optional)</label>
                                    <textarea
                                       className="lh-cart-textarea"
                                       placeholder="Any discrepancies or incidents..."
                                       value={settleNotes}
                                       onChange={e => setSettleNotes(e.target.value)}
                                       rows={2}
                                    />
                                 </div>

                                 {!settleRider.active_shift && (
                                    <p className="lh-cart-warn"><AlertCircle size={13} /> Rider has no active shift. Open one first from the Fleet panel.</p>
                                 )}
                                 {settleRider.onRoad.length > 0 && (
                                    <p className="lh-cart-warn" style={{ color: '#fbbf24' }}><AlertTriangle size={13} /> {settleRider.onRoad.length} order(s) still on road — mark them delivered first.</p>
                                 )}
                              </div>

                              {/* STICKY FOOTER — always visible */}
                              <div className="lh-cart-footer">
                                 <div className="lh-cart-footer-total">
                                    <span>Expected</span>
                                    <strong>{fmt(expectedTotal)}</strong>
                                 </div>
                                 <button
                                    className="lh-btn lh-btn--indigo lh-btn--full"
                                    onClick={handleSettle}
                                    disabled={isProcessing || settleOrders.length === 0 || !settleRider.active_shift}
                                 >
                                    <Layers size={16} /> Close Shift & Reconcile
                                 </button>
                              </div>
                           </>
                        ) : (
                           <div className="lh-cart-empty">
                              <Banknote size={40} className="lh-empty-icon" />
                              <p>Select a rider from the Fleet panel to begin settlement</p>
                           </div>
                        )}
                     </div>
                  </div>
               )}
            </div>
         </main>

         {/* ════════ DISPATCH CONFIRM MODAL ════════ */}
         {dispatchRiderId && (() => {
            const riderForDispatch = riderStats.find(r => r.id === dispatchRiderId);
            const ordersForDispatch = orders.filter(o => selectedOrderIds.includes(o.id));
            const dispatchTotal = ordersForDispatch.reduce((s, o) => s + Number(o.total), 0);
            return (
               <div className="lh-overlay" onClick={() => setDispatchRiderId(null)}>
                  <div className="lh-modal lh-modal--wide" onClick={e => e.stopPropagation()}>
                     <div className="lh-modal-header">
                        <div className="lh-modal-icon lh-modal-icon--indigo"><Send size={22} /></div>
                        <div style={{ flex: 1 }}>
                           <h3 className="lh-modal-title">Confirm Dispatch</h3>
                           <p className="lh-modal-sub">
                              Assigning {selectedOrderIds.length} order{selectedOrderIds.length > 1 ? 's' : ''} to {riderForDispatch?.name}
                              {riderForDispatch && riderForDispatch.onRoad.length > 0 && (
                                 <span className="lh-pill lh-pill--warn" style={{ marginLeft: 8 }}>{riderForDispatch.onRoad.length} already on road</span>
                              )}
                           </p>
                        </div>
                        <button onClick={() => setDispatchRiderId(null)} className="lh-modal-close"><X size={18} /></button>
                     </div>

                     {/* Order list */}
                     <div className="lh-modal-order-list">
                        {ordersForDispatch.map((o, i) => (
                           <div key={o.id} className="lh-modal-order-row">
                              <span className="lh-modal-order-num">{i + 1}</span>
                              <div className="lh-modal-order-info">
                                 <p className="lh-modal-order-name">{o.customer_name || 'Guest'}</p>
                                 <p className="lh-modal-order-addr">
                                    {o.delivery_orders?.[0]?.delivery_address || 'No address on file'}
                                 </p>
                              </div>
                              <span className="lh-modal-order-amt">{fmt(Number(o.total))}</span>
                           </div>
                        ))}
                     </div>

                     <div className="lh-modal-total-bar">
                        <span>Total Collection</span>
                        <strong style={{ color: '#34d399' }}>{fmt(dispatchTotal)}</strong>
                     </div>

                     <div className="lh-modal-actions">
                        <button onClick={() => setDispatchRiderId(null)} className="lh-btn lh-btn--ghost lh-btn--full">Cancel</button>
                        <button onClick={handleDispatch} disabled={isProcessing} className="lh-btn lh-btn--emerald lh-btn--full">
                           {isProcessing ? <><RefreshCw size={14} className="animate-spin" /> Dispatching…</> : <><Send size={14} /> Send {selectedOrderIds.length} Order{selectedOrderIds.length > 1 ? 's' : ''}</>}
                        </button>
                     </div>
                  </div>
               </div>
            );
         })()}

         {/* ════════ SHIFT MODAL ════════ */}
         {shiftModal.open && (
            <div className="lh-overlay" onClick={() => setShiftModal(p => ({ ...p, open: false }))}>
               <div className="lh-modal" onClick={e => e.stopPropagation()}>
                  <div className="lh-modal-header">
                     <div className={`lh-modal-icon ${shiftModal.mode === 'OPEN' ? 'lh-modal-icon--indigo' : 'lh-modal-icon--red'}`}>
                        {shiftModal.mode === 'OPEN' ? <Zap size={22} /> : <Layers size={22} />}
                     </div>
                     <div>
                        <h3 className="lh-modal-title">{shiftModal.mode === 'OPEN' ? 'Open Rider Shift' : 'Close & Reconcile'}</h3>
                        <p className="lh-modal-sub">{drivers.find(d => d.id === shiftModal.riderId)?.name}</p>
                     </div>
                     <button onClick={() => setShiftModal(p => ({ ...p, open: false }))} className="lh-modal-close"><X size={18} /></button>
                  </div>
                  <div className="lh-modal-body">
                     <div className="lh-cart-field">
                        <label className="lh-cart-label">{shiftModal.mode === 'OPEN' ? 'Opening Float (Rs.)' : 'Cash Received (Rs.)'}</label>
                        <div className="lh-cash-input-wrap">
                           <span className="lh-cash-prefix">Rs.</span>
                           <input
                              type="number"
                              className="lh-cash-input"
                              placeholder="0"
                              value={shiftAmount}
                              autoFocus
                              onChange={e => setShiftAmount(e.target.value)}
                           />
                        </div>
                     </div>
                     <div className="lh-cart-field">
                        <label className="lh-cart-label">Notes</label>
                        <textarea
                           className="lh-cart-textarea"
                           placeholder="Shift notes..."
                           value={shiftNotes}
                           onChange={e => setShiftNotes(e.target.value)}
                           rows={3}
                        />
                     </div>
                  </div>
                  <div className="lh-modal-actions">
                     <button onClick={() => setShiftModal(p => ({ ...p, open: false }))} className="lh-btn lh-btn--ghost lh-btn--full">Cancel</button>
                     <button
                        onClick={shiftModal.mode === 'OPEN' ? handleOpenShift : handleCloseShift}
                        disabled={isProcessing}
                        className={`lh-btn lh-btn--full ${shiftModal.mode === 'OPEN' ? 'lh-btn--indigo' : 'lh-btn--red'}`}
                     >
                        {isProcessing
                           ? <><RefreshCw size={14} className="animate-spin" /> Processing…</>
                           : shiftModal.mode === 'OPEN' ? <><Check size={14} /> Activate Shift</> : <><Layers size={14} /> Finalize</>}
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* ════════ INLINE STYLES ════════ */}
         <style>{`
            .lh-root { display:flex; height:100vh; background:#060a12; color:#cbd5e1; font-family:'Inter',sans-serif; overflow:hidden; }

            /* ASIDE */
            .lh-aside { width:320px; background:#0a0f1e; border-right:1px solid #1e293b; display:flex; flex-direction:column; flex-shrink:0; }
            .lh-aside-header { padding:20px 18px 14px; border-bottom:1px solid #1e293b; display:flex; align-items:center; justify-content:space-between; }
            .lh-rider-list { flex:1; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:6px; }

            /* RIDER CARD */
            .lh-rider-card { background:#0d1424; border:1px solid #1e293b; border-radius:14px; padding:12px; cursor:pointer; transition:all .18s; }
            .lh-rider-card:hover { border-color:#334155; background:#111827; }
            .lh-rider-card--active { border-color:#4f46e5; background:#1e1b4b22; }
            .lh-rider-row { display:flex; align-items:center; gap:10px; }
            .lh-rider-info { flex:1; min-width:0; }
            .lh-rider-name { font-size:13px; font-weight:700; color:#f1f5f9; text-transform:uppercase; letter-spacing:.04em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .lh-rider-status { display:flex; align-items:center; gap:6px; font-size:11px; color:#64748b; margin-top:2px; }
            .lh-rider-liability { text-align:right; }
            .lh-liability-amt { font-size:12px; font-weight:700; color:#a5b4fc; white-space:nowrap; }
            .lh-liability-lbl { font-size:9px; color:#475569; text-transform:uppercase; letter-spacing:.08em; }
            .lh-rider-actions { display:flex; gap:6px; margin-top:10px; }

            /* AVATAR */
            .lh-avatar { width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:900; color:#fff; background:#1e293b; flex-shrink:0; }
            .lh-avatar--on { background:#4f46e5; box-shadow:0 0 12px #4f46e540; }
            .lh-avatar--sm { width:30px; height:30px; font-size:13px; border-radius:8px; }
            .lh-avatar--xs { width:24px; height:24px; font-size:11px; border-radius:6px; }

            /* DOT */
            .lh-dot { width:6px; height:6px; border-radius:50%; display:inline-block; flex-shrink:0; }
            .lh-dot--green { background:#10b981; box-shadow:0 0 6px #10b98160; }
            .lh-dot--gray { background:#475569; }

            /* FLEET BAR */
            .lh-fleet-bar { padding:12px 16px; border-top:1px solid #1e293b; background:#070b14; display:flex; align-items:center; }
            .lh-fleet-stat { flex:1; text-align:center; }
            .lh-fleet-val { font-size:18px; font-weight:900; color:#f1f5f9; }
            .lh-fleet-lbl { font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:#475569; }
            .lh-fleet-divider { width:1px; height:30px; background:#1e293b; }

            /* MAIN */
            .lh-main { flex:1; display:flex; flex-direction:column; overflow:hidden; }
            .lh-header { padding:16px 24px; border-bottom:1px solid #1e293b; display:flex; align-items:center; justify-content:space-between; background:#070b14; flex-shrink:0; }
            .lh-title { font-size:20px; font-weight:900; color:#f1f5f9; letter-spacing:-.03em; text-transform:uppercase; }
            .lh-title-sm { font-size:14px; font-weight:800; color:#f1f5f9; letter-spacing:.02em; text-transform:uppercase; }
            .lh-subtitle { font-size:10px; text-transform:uppercase; letter-spacing:.12em; color:#475569; margin-top:2px; }
            .lh-content { flex:1; overflow:hidden; display:flex; flex-direction:column; }

            /* TABS */
            .lh-tabs { display:flex; gap:4px; background:#0a0f1e; padding:4px; border-radius:12px; border:1px solid #1e293b; }
            .lh-tab { display:flex; align-items:center; gap:7px; padding:8px 16px; border-radius:8px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#64748b; transition:all .15s; cursor:pointer; border:none; background:transparent; }
            .lh-tab:hover { color:#94a3b8; }
            .lh-tab--active { background:#4f46e5; color:#fff; box-shadow:0 4px 14px #4f46e540; }
            .lh-tab-badge { background:#ffffff25; color:#fff; font-size:10px; font-weight:800; padding:1px 7px; border-radius:6px; }

            /* TABLE/ROWS */
            .lh-table-wrapper { display:flex; flex-direction:column; flex:1; overflow:hidden; }
            .lh-toolbar { display:flex; align-items:center; justify-content:space-between; padding:10px 20px; border-bottom:1px solid #1e293b; background:#08101f; }
            .lh-toolbar-label { font-size:12px; font-weight:600; color:#64748b; }
            .lh-toolbar-total { font-size:12px; font-weight:700; color:#a5b4fc; }
            .lh-row { display:flex; align-items:center; gap:0; font-size:12px; }
            .lh-row--header { padding:6px 20px; background:#060d1a; border-bottom:1px solid #1e293b; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:#475569; }
            .lh-row--data { padding:10px 20px; border-bottom:1px solid #0f1929; cursor:pointer; transition:background .12s; }
            .lh-row--data:hover { background:#0d1426; }
            .lh-row--selected { background:#1e1b4b30 !important; border-left:3px solid #4f46e5; }
            .lh-row--urgent { border-left:3px solid #f87171 !important; }
            .lh-row--settle { cursor:default; }
            .lh-rows { flex:1; overflow-y:auto; }

            /* COLs */
            .lh-col { display:flex; align-items:center; gap:5px; overflow:hidden; }
            .lh-col--order { width:90px; flex-shrink:0; }
            .lh-col--customer { width:160px; flex-shrink:0; flex-direction:column; align-items:flex-start; gap:2px; }
            .lh-col--address { flex:1; }
            .lh-col--time { width:55px; flex-shrink:0; gap:4px; }
            .lh-col--rider { width:130px; flex-shrink:0; }
            .lh-col--amount { width:100px; flex-shrink:0; justify-content:flex-end; }
            .lh-col--action { width:100px; flex-shrink:0; justify-content:flex-end; }

            .lh-order-id { font-family:monospace; font-size:11px; font-weight:700; color:#94a3b8; background:#1e293b; border-radius:5px; padding:2px 6px; }
            .lh-customer-name { font-size:12px; font-weight:600; color:#e2e8f0; }
            .lh-customer-phone { font-size:10px; color:#64748b; }
            .lh-address-text { font-size:11px; color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .lh-amount { font-size:12px; font-weight:700; color:#e2e8f0; }
            .lh-amount--emerald { color:#34d399; }
            .lh-rider-name-sm { font-size:12px; font-weight:600; color:#e2e8f0; }

            /* SETTLE LAYOUT */
            .lh-settle-layout { display:flex; flex:1; overflow:hidden; gap:0; }
            .lh-settle-orders { flex:1; display:flex; flex-direction:column; overflow:hidden; border-right:1px solid #1e293b; }

            /* CART — always-visible footer pattern */
            .lh-cart { width:340px; flex-shrink:0; background:#0a0f1e; border-left:1px solid #1e293b; display:flex; flex-direction:column; overflow:hidden; }
            .lh-cart-body { flex:1; overflow-y:auto; padding:14px; display:flex; flex-direction:column; gap:12px; }
            .lh-cart-footer { flex-shrink:0; padding:14px; border-top:1px solid #1e293b; background:#070b14; display:flex; flex-direction:column; gap:10px; }
            .lh-cart-footer-total { display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#64748b; padding:0 4px; }
            .lh-cart-footer-total strong { font-size:16px; font-weight:800; color:#f1f5f9; }

            /* Per-order rows in cart */
            .lh-cart-orders { display:flex; flex-direction:column; gap:4px; }
            .lh-cart-order-row { display:flex; align-items:flex-start; gap:8px; padding:8px 10px; background:#060d1a; border:1px solid #1e293b; border-radius:8px; }
            .lh-cart-order-num { width:18px; height:18px; border-radius:50%; background:#1e293b; color:#64748b; font-size:9px; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:1px; }
            .lh-cart-order-info { flex:1; min-width:0; }
            .lh-cart-order-name { font-size:12px; font-weight:600; color:#e2e8f0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .lh-cart-order-addr { font-size:10px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:1px; }
            .lh-cart-order-amt { font-size:12px; font-weight:700; color:#34d399; flex-shrink:0; margin-left:6px; }
            .lh-cart-order-count { margin-left:auto; font-size:10px; font-weight:700; background:#1e1b4b; color:#a5b4fc; border:1px solid #3730a3; border-radius:6px; padding:2px 8px; }

            /* pill badges */
            .lh-pill { display:inline-flex; align-items:center; font-size:9px; font-weight:800; border-radius:5px; padding:2px 6px; text-transform:uppercase; letter-spacing:.06em; }
            .lh-pill--warn { background:#451a03; color:#fbbf24; border:1px solid #78350f; }
            .lh-cart-header { display:flex; align-items:center; gap:10px; padding:14px 14px 12px; border-bottom:1px solid #1e293b; flex-shrink:0; }
            .lh-cart-title { font-size:14px; font-weight:800; color:#f1f5f9; text-transform:uppercase; letter-spacing:.05em; }
            .lh-cart-rider { display:flex; align-items:center; gap:10px; background:#111827; border:1px solid #1e293b; border-radius:10px; padding:10px; }
            .lh-cart-rider-name { font-size:13px; font-weight:700; color:#f1f5f9; text-transform:uppercase; }
            .lh-cart-rider-sub { font-size:10px; color:#64748b; margin-top:2px; }
            .lh-cart-breakdown { background:#060d1a; border:1px solid #1e293b; border-radius:10px; padding:12px; display:flex; flex-direction:column; gap:8px; }
            .lh-cart-line { display:flex; justify-content:space-between; font-size:12px; color:#64748b; }
            .lh-cart-line--total { font-size:13px; font-weight:700; color:#f1f5f9; padding-top:4px; }
            .lh-cart-divider { height:1px; background:#1e293b; }
            .lh-cart-field { display:flex; flex-direction:column; gap:6px; }
            .lh-cart-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:#475569; }
            .lh-cart-textarea { background:#060d1a; border:1px solid #1e293b; border-radius:10px; padding:10px; color:#e2e8f0; font-size:12px; resize:none; outline:none; transition:border .15s; width:100%; }
            .lh-cart-textarea:focus { border-color:#4f46e5; }
            .lh-cart-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; color:#475569; font-size:12px; text-align:center; opacity:.6; }
            .lh-cart-warn { font-size:11px; color:#f87171; display:flex; align-items:center; gap:6px; }

            /* CASH INPUT */
            .lh-cash-input-wrap { position:relative; }
            .lh-cash-prefix { position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:12px; font-weight:700; color:#64748b; }
            .lh-cash-input { width:100%; background:#060d1a; border:1px solid #1e293b; border-radius:10px; padding:12px 12px 12px 40px; color:#f1f5f9; font-size:20px; font-weight:800; outline:none; transition:border .15s; }
            .lh-cash-input:focus { border-color:#4f46e5; box-shadow:0 0 0 3px #4f46e520; }

            /* DIFF */
            .lh-diff { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; padding:10px 14px; border-radius:10px; }
            .lh-diff--ok { background:#052e16; color:#34d399; border:1px solid #166534; }
            .lh-diff--short { background:#1f0808; color:#f87171; border:1px solid #7f1d1d; }

            /* BUTTONS */
            .lh-btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; border-radius:9px; border:none; cursor:pointer; transition:all .15s; padding:7px 13px; }
            .lh-btn--sm { padding:5px 11px; font-size:10px; }
            .lh-btn--full { width:100%; padding:13px; font-size:12px; border-radius:10px; }
            .lh-btn--indigo { background:#4f46e5; color:#fff; }
            .lh-btn--indigo:hover { background:#4338ca; }
            .lh-btn--indigo:disabled { opacity:.35; cursor:not-allowed; }
            .lh-btn--emerald { background:#059669; color:#fff; }
            .lh-btn--emerald:hover { background:#047857; }
            .lh-btn--red { background:#dc2626; color:#fff; }
            .lh-btn--red:hover { background:#b91c1c; }
            .lh-btn--ghost { background:#1e293b; color:#94a3b8; }
            .lh-btn--ghost:hover { background:#334155; color:#f1f5f9; }
            .lh-btn--ghost-red { background:transparent; color:#f87171; border:1px solid #7f1d1d; }
            .lh-btn--ghost-red:hover { background:#7f1d1d30; }
            .lh-btn--disabled { opacity:.3; cursor:not-allowed; }

            /* BADGE */
            .lh-badge-blue { display:flex; align-items:center; gap:5px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; background:#1e1b4b; color:#a5b4fc; border:1px solid #3730a3; border-radius:8px; padding:4px 10px; }

            /* EMPTY */
            .lh-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; text-align:center; padding:40px; }
            .lh-empty--sm { padding:20px; }
            .lh-empty-icon { color:#1e293b; }
            .lh-empty-title { font-size:15px; font-weight:700; color:#334155; }
            .lh-empty-sub { font-size:12px; color:#1e293b; max-width:260px; }

            /* CHECKBOX */
            .lh-checkbox { width:16px; height:16px; accent-color:#4f46e5; cursor:pointer; flex-shrink:0; }

            /* ml helper */
            .ml-3 { margin-left:12px; }

            /* OVERLAY / MODAL */
            .lh-overlay { position:fixed; inset:0; background:rgba(0,0,0,.8); backdrop-filter:blur(12px); display:flex; align-items:center; justify-content:center; z-index:200; }
            .lh-modal { background:#0c1120; border:1px solid #1e293b; border-radius:20px; padding:24px; width:420px; max-width:90vw; box-shadow:0 24px 80px #0007; }
            .lh-modal--wide { width:520px; }
            .lh-modal-header { display:flex; align-items:center; gap:14px; margin-bottom:16px; }
            .lh-modal-icon { width:46px; height:46px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
            .lh-modal-icon--indigo { background:#1e1b4b; color:#a5b4fc; }
            .lh-modal-icon--red { background:#1f0808; color:#f87171; }
            .lh-modal-title { font-size:16px; font-weight:800; color:#f1f5f9; text-transform:uppercase; letter-spacing:-.01em; }
            .lh-modal-sub { font-size:11px; color:#64748b; margin-top:3px; display:flex; align-items:center; flex-wrap:wrap; gap:4px; }
            .lh-modal-close { margin-left:auto; background:none; border:none; color:#475569; cursor:pointer; padding:4px; flex-shrink:0; }
            .lh-modal-close:hover { color:#94a3b8; }
            .lh-modal-body { display:flex; flex-direction:column; gap:14px; margin-bottom:16px; background:#08101f; border-radius:12px; padding:16px; }
            .lh-modal-stat-row { display:flex; justify-content:space-between; align-items:center; font-size:13px; color:#64748b; padding:4px 0; }
            .lh-modal-stat-row strong { color:#f1f5f9; }
            .lh-modal-actions { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:16px; }
            /* dispatch modal order list */
            .lh-modal-order-list { max-height:260px; overflow-y:auto; display:flex; flex-direction:column; gap:4px; margin-bottom:12px; }
            .lh-modal-order-row { display:flex; align-items:flex-start; gap:10px; padding:10px 12px; background:#08101f; border:1px solid #1e293b; border-radius:10px; }
            .lh-modal-order-num { width:20px; height:20px; border-radius:50%; background:#1e293b; color:#64748b; font-size:9px; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px; }
            .lh-modal-order-info { flex:1; min-width:0; }
            .lh-modal-order-name { font-size:12px; font-weight:700; color:#f1f5f9; }
            .lh-modal-order-addr { font-size:11px; color:#64748b; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .lh-modal-order-amt { font-size:13px; font-weight:700; color:#34d399; white-space:nowrap; }
            .lh-modal-total-bar { display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#0d1f14; border:1px solid #166534; border-radius:10px; font-size:12px; color:#64748b; margin-bottom:4px; }
            .lh-modal-total-bar strong { font-size:16px; font-weight:800; }

            /* scrollbar */
            ::-webkit-scrollbar { width:4px; }
            ::-webkit-scrollbar-track { background:transparent; }
            ::-webkit-scrollbar-thumb { background:#1e293b; border-radius:4px; }
         `}</style>
      </div>
   );
};
