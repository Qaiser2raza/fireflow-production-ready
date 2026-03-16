
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../client/contexts/AppContext';
import { OrderStatus, Order } from '../../shared/types';
import { Phone, MapPin, Navigation, CheckCircle2, Bike, LogOut, Package, ArrowLeft, Banknote, X, RefreshCw, AlertTriangle } from 'lucide-react';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';

export const RiderView: React.FC = () => {
   const { currentUser, orders, completeDelivery, failDelivery, logout, fetchInitialData } = useAppContext();
   const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
   const [activeShift, setActiveShift] = useState<any>(null);
   const [isLoading, setIsLoading] = useState(false);

   const API = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

   const fetchShift = async () => {
      if (!currentUser?.id) return;
      setIsLoading(true);
      try {
         const res = await fetchWithAuth(`${API}/riders/${currentUser.id}/active-shift`);
         const d = await res.json();
         if (d.success) setActiveShift(d.shift);
      } catch (e) {
         console.error("Failed to fetch shift", e);
      } finally {
         setIsLoading(false);
      }
   };

   useEffect(() => {
      fetchShift();
      const interval = setInterval(fetchShift, 30000);
      return () => clearInterval(interval);
   }, [currentUser?.id]);

   // Filter orders for this rider
   const myOrders = orders.filter(o =>
      (o.assigned_driver_id === currentUser?.id || o.delivery_orders?.[0]?.driver_id === currentUser?.id) &&
      (o.status === OrderStatus.READY || o.status === OrderStatus.DELIVERED || o.status === OrderStatus.CLOSED)
   ).sort((a, b) => new Date(b.created_at || b.timestamp || 0).getTime() - new Date(a.created_at || a.timestamp || 0).getTime());

   const activeOrders = myOrders.filter(o =>
      o.status === OrderStatus.READY && !o.delivery_orders?.[0]?.delivered_at
   );

   // Orders that rider has delivered but not yet settled with cashier
   const pendingSettlementOrders = myOrders.filter(o =>
      o.status === OrderStatus.DELIVERED
   );

   const handleComplete = (order: Order) => {
      if (window.confirm(`Confirm collection of Rs. ${(order.total ?? 0).toLocaleString()} from customer?`)) {
         completeDelivery(order.id);
         setSelectedOrder(null);
         setTimeout(fetchShift, 1000);
      }
   };

   const handleFail = (orderId: string) => {
      const reason = window.prompt("Enter reason for failure (e.g., Customer not present, Refused):");
      if (reason) {
         failDelivery(orderId, reason);
         setSelectedOrder(null);
      }
   };

   // Liability calculation
   const float = Number(activeShift?.opening_float || 0);
   const collectedCash = pendingSettlementOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
   const totalLiability = float + collectedCash;

   // Detail View
   if (selectedOrder) {
      return (
         <div className="h-full w-full bg-slate-950 flex flex-col relative overflow-hidden">
            {/* Top Bar */}
            <div className="p-6 pt-8 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
               <button onClick={() => setSelectedOrder(null)} className="p-2 -ml-2 rounded-full hover:bg-slate-800 text-white">
                  <ArrowLeft size={24} />
               </button>
               <div className="font-serif font-bold text-xl text-white">#{selectedOrder.id.slice(-6).toUpperCase()}</div>
               <div className="w-8"></div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 pb-24">
               {/* Customer Info */}
               <div className="bg-slate-900 rounded-2xl p-6 mb-6 border border-slate-800">
                  <div className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-4 font-mono">Customer</div>
                  <h2 className="text-2xl font-bold text-white mb-1">{selectedOrder.customer_name || selectedOrder.customerName}</h2>
                  <div className="flex items-center gap-2 text-indigo-400 font-mono text-lg mb-4">{selectedOrder.customer_phone || selectedOrder.customerPhone}</div>

                  <div className="flex gap-3">
                     <button className="flex-1 bg-slate-800 py-3 rounded-xl flex items-center justify-center gap-2 text-white font-bold border border-slate-700">
                        <Phone size={18} /> Call
                     </button>
                     <button className="flex-1 bg-indigo-600 py-3 rounded-xl flex items-center justify-center gap-2 text-white font-bold shadow-lg shadow-indigo-900/50">
                        <Navigation size={18} /> Map
                     </button>
                  </div>
               </div>

               {/* Address */}
               <div className="bg-slate-900 rounded-2xl p-6 mb-6 border border-slate-800">
                  <div className="flex items-start gap-4">
                     <MapPin className="text-indigo-400 mt-1 shrink-0" size={24} />
                     <p className="text-slate-300 text-lg leading-relaxed">{selectedOrder.delivery_orders?.[0]?.delivery_address || selectedOrder.deliveryAddress}</p>
                  </div>
               </div>

               {/* Order Summary */}
               <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
                  <div className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-4 font-mono">Items</div>
                  <div className="space-y-4">
                     {(selectedOrder.order_items || []).map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between items-center border-b border-slate-800 pb-3 last:border-0 last:pb-0">
                           <div className="flex gap-3 items-center">
                              <div className="bg-slate-800 text-white font-bold w-8 h-8 rounded flex items-center justify-center text-sm">
                                 {item.quantity}
                              </div>
                              <div className="text-slate-200">{item.item_name || 'Item'}</div>
                           </div>
                           <div className="text-slate-500 text-sm">Rs. {Number(item.total_price || 0).toLocaleString()}</div>
                        </div>
                     ))}
                  </div>
                  <div className="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center">
                     <span className="text-slate-400 font-bold uppercase text-xs">Total to Collect</span>
                     <span className="text-2xl font-serif text-emerald-400 font-bold">Rs. {(selectedOrder.total ?? 0).toLocaleString()}</span>
                  </div>
               </div>
            </div>

            {/* Fixed Bottom Action */}
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-slate-900/90 backdrop-blur border-t border-slate-800">
               {selectedOrder.status === OrderStatus.READY ? (
                  <div className="flex flex-col gap-3">
                     <button
                        onClick={() => handleComplete(selectedOrder)}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg uppercase tracking-widest shadow-xl shadow-emerald-900/30 flex items-center justify-center gap-3"
                     >
                        <Banknote size={24} /> Confirm Collection
                     </button>
                     <button
                        onClick={() => handleFail(selectedOrder.id)}
                        className="w-full bg-slate-800 border border-slate-700 text-red-500 py-3 rounded-2xl font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2"
                     >
                        <X size={18} /> Failed / Return
                     </button>
                  </div>
               ) : (
                  <div className="w-full bg-emerald-950/30 text-emerald-500 border border-emerald-900/50 py-4 rounded-2xl font-bold text-center flex items-center justify-center gap-2">
                     <CheckCircle2 size={20} /> Order Delivered
                  </div>
               )}
            </div>
         </div>
      );
   }

   // Dashboard View
   return (
      <div className="h-full w-full bg-[#020617] flex flex-col font-sans">
         {/* Top Header */}
         <div className="p-6 pt-8 bg-slate-900/50 border-b border-slate-800/50 flex justify-between items-center backdrop-blur-md">
            <div className="flex items-center gap-3">
               <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-lg shadow-indigo-900/40 border border-indigo-400/20">
                  <Bike size={24} />
               </div>
               <div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mb-0.5">Active Rider</div>
                  <div className="text-white font-bold text-xl tracking-tight leading-none">{currentUser?.name}</div>
               </div>
            </div>
            <div className="flex gap-2">
               <button onClick={() => { fetchShift(); fetchInitialData?.(); }} className={`p-3 bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-all ${isLoading ? 'animate-spin' : ''}`}>
                  <RefreshCw size={20} />
               </button>
               <button onClick={logout} className="p-3 bg-red-950/20 rounded-xl text-red-500 hover:bg-red-500 hover:text-white transition-all border border-red-500/20">
                  <LogOut size={20} />
               </button>
            </div>
         </div>

         {/* Liability Dashboard */}
         <div className="p-6">
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-5">
                  <Banknote size={120} />
               </div>

               <div className="flex justify-between items-start mb-6">
                  <div>
                     <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Total Liability</h3>
                     <div className="text-4xl font-serif text-white font-black tracking-tight">
                        Rs. {totalLiability.toLocaleString()}
                     </div>
                  </div>
                  {activeShift ? (
                     <div className="bg-indigo-500/10 text-indigo-400 text-[10px] font-black px-3 py-1.5 rounded-full border border-indigo-500/20 tracking-tighter">
                        SHIFT #{activeShift.id.slice(-4).toUpperCase()}
                     </div>
                  ) : (
                     <div className="bg-red-500/10 text-red-500 text-[10px] font-black px-3 py-1.5 rounded-full border border-red-500/20 tracking-tighter flex items-center gap-1">
                        <AlertTriangle size={10} /> NO ACTIVE SHIFT
                     </div>
                  )}
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
                     <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Opening Float</div>
                     <div className="text-white font-bold text-lg">Rs. {float.toLocaleString()}</div>
                  </div>
                  <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
                     <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Collected Cash</div>
                     <div className="text-emerald-400 font-bold text-lg">Rs. {collectedCash.toLocaleString()}</div>
                  </div>
               </div>
            </div>
         </div>

         {/* Run List */}
         <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2">
            <div className="flex items-center justify-between mb-4">
               <h3 className="text-indigo-400 text-xs font-bold uppercase tracking-[0.2em]">Assignment Queue</h3>
               <span className="text-slate-600 text-[10px] font-bold uppercase">{activeOrders.length + pendingSettlementOrders.length} Orders</span>
            </div>

            <div className="space-y-4">
               {activeOrders.length === 0 && pendingSettlementOrders.length === 0 && (
                  <div className="text-center py-20">
                     <Package size={48} className="mx-auto text-slate-800 mb-4 opacity-20" />
                     <p className="text-slate-500 font-bold tracking-widest uppercase text-xs">Waiting for Orders</p>
                  </div>
               )}

               {/* Active Orders Section */}
               {activeOrders.map(order => (
                  <div
                     key={order.id}
                     onClick={() => setSelectedOrder(order)}
                     className="bg-slate-900 border-l-4 border-l-indigo-500 border-slate-800 p-5 rounded-2xl shadow-xl active:scale-95 transition-all group"
                  >
                     <div className="flex justify-between items-start mb-3">
                        <div className="text-[10px] bg-indigo-500 text-white font-black px-2 py-0.5 rounded tracking-tighter">ON ROAD</div>
                        <div className="text-slate-500 font-mono text-xs">{new Date(order.created_at || order.timestamp || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                     </div>
                     <div className="text-white font-bold text-lg mb-1 leading-tight">{order.customer_name || order.customerName || 'Guest'}</div>
                     <div className="text-slate-400 text-sm leading-snug mb-4 line-clamp-2">{order.delivery_orders?.[0]?.delivery_address || order.deliveryAddress}</div>

                     <div className="flex justify-between items-center pt-3 border-t border-slate-800/50">
                        <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold uppercase tracking-tighter">
                           <Package size={14} className="text-slate-600" /> {(order.order_items || []).length} Items
                        </div>
                        <div className="text-white font-serif font-black text-lg">Rs. {Number(order.total).toLocaleString()}</div>
                     </div>
                  </div>
               ))}

               {/* Pending Settlement (Delivered but not CLOSED) */}
               {pendingSettlementOrders.length > 0 && (
                  <>
                     <div className="pt-6 pb-2">
                        <h3 className="text-emerald-500/50 text-[10px] font-bold uppercase tracking-[0.3em]">Delivered - To Be Settled</h3>
                     </div>
                     {pendingSettlementOrders.map(order => (
                        <div
                           key={order.id}
                           onClick={() => setSelectedOrder(order)}
                           className="bg-slate-900/40 border border-emerald-900/20 p-5 rounded-2xl opacity-80"
                        >
                           <div className="flex justify-between items-start mb-2">
                              <div className="text-emerald-500 font-black text-[10px] flex items-center gap-1 tracking-tighter uppercase"><CheckCircle2 size={12} /> Cash on Hand</div>
                              <div className="text-slate-600 font-mono text-[10px]">#{order.id.slice(-6).toUpperCase()}</div>
                           </div>
                           <div className="text-slate-300 font-bold mb-1">{order.customer_name || order.customerName}</div>
                           <div className="text-emerald-500/80 font-serif font-bold">Rs. {Number(order.total).toLocaleString()}</div>
                        </div>
                     ))}
                  </>
               )}
            </div>
         </div>
      </div>
   );
};
