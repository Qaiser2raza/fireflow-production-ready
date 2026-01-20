
import React, { useState } from 'react';
import { useAppContext } from '../../client/App';
import { OrderStatus, Order } from '../../shared/types';
import { Phone, MapPin, Navigation, CheckCircle2, User, LogOut, Package, ArrowLeft, Clock, DollarSign } from 'lucide-react';

export const DriverView: React.FC = () => {
   const { currentUser, orders, completeDelivery, logout } = useAppContext();
   const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

   // Filter orders for this driver
   const myOrders = orders.filter(o =>
      o.assignedDriverId === currentUser?.id &&
      (o.status === OrderStatus.OUT_FOR_DELIVERY || o.status === OrderStatus.DELIVERED)
   ).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

   const activeOrders = myOrders.filter(o => o.status === OrderStatus.OUT_FOR_DELIVERY);
   const completedOrders = myOrders.filter(o => o.status === OrderStatus.DELIVERED || o.status === OrderStatus.PAID);

   const handleComplete = (order: Order) => {
      if (window.confirm(`Confirm collection of Rs. ${(order.total ?? 0).toLocaleString()} from customer?`)) {
         completeDelivery(order.id);
         setSelectedOrder(null);
      }
   };

   // Detail View
   if (selectedOrder) {
      return (
         <div className="h-full w-full bg-slate-950 flex flex-col relative overflow-hidden">
            {/* Top Bar */}
            <div className="p-6 pt-8 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
               <button onClick={() => setSelectedOrder(null)} className="p-2 -ml-2 rounded-full hover:bg-slate-800 text-white">
                  <ArrowLeft size={24} />
               </button>
               <div className="font-serif font-bold text-xl text-white">#{selectedOrder.id.split('-')[1]}</div>
               <div className="w-8"></div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 pb-24">
               {/* Customer Info */}
               <div className="bg-slate-900 rounded-2xl p-6 mb-6 border border-slate-800">
                  <div className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-4">Customer</div>
                  <h2 className="text-2xl font-bold text-white mb-1">{selectedOrder.customerName}</h2>
                  <div className="flex items-center gap-2 text-gold-500 font-mono text-lg mb-4">{selectedOrder.customerPhone}</div>

                  <div className="flex gap-3">
                     <button className="flex-1 bg-slate-800 py-3 rounded-xl flex items-center justify-center gap-2 text-white font-bold border border-slate-700">
                        <Phone size={18} /> Call
                     </button>
                     <button className="flex-1 bg-blue-600 py-3 rounded-xl flex items-center justify-center gap-2 text-white font-bold shadow-lg shadow-blue-900/50">
                        <Navigation size={18} /> Map
                     </button>
                  </div>
               </div>

               {/* Address */}
               <div className="bg-slate-900 rounded-2xl p-6 mb-6 border border-slate-800">
                  <div className="flex items-start gap-4">
                     <MapPin className="text-gold-500 mt-1 shrink-0" size={24} />
                     <p className="text-slate-300 text-lg leading-relaxed">{selectedOrder.deliveryAddress}</p>
                  </div>
               </div>

               {/* Order Summary */}
               <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
                  <div className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-4">Order Items</div>
                  <div className="space-y-4">
                     {selectedOrder.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center border-b border-slate-800 pb-3 last:border-0 last:pb-0">
                           <div className="flex gap-3 items-center">
                              <div className="bg-slate-800 text-white font-bold w-8 h-8 rounded flex items-center justify-center text-sm">
                                 {item.quantity}
                              </div>
                              <div className="text-slate-200">{item.menuItem.name}</div>
                           </div>
                           <div className="text-slate-500 text-sm">Rs. {Number((item.menuItem.price ?? 0) * (item.quantity ?? 0)).toLocaleString()}</div>
                        </div>
                     ))}
                  </div>
                  <div className="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center">
                     <span className="text-slate-400 font-bold uppercase">Total to Collect</span>
                     <span className="text-2xl font-serif text-gold-500 font-bold">Rs. {(selectedOrder.total ?? 0).toLocaleString()}</span>
                  </div>
               </div>
            </div>

            {/* Fixed Bottom Action */}
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-slate-900/90 backdrop-blur border-t border-slate-800">
               {selectedOrder.status === OrderStatus.OUT_FOR_DELIVERY ? (
                  <button
                     onClick={() => handleComplete(selectedOrder)}
                     className="w-full bg-green-600 hover:bg-green-500 text-white py-4 rounded-2xl font-bold text-lg uppercase tracking-widest shadow-xl shadow-green-900/30 flex items-center justify-center gap-3 animate-pulse"
                  >
                     <DollarSign size={24} /> Confirm Rs. {(selectedOrder.total ?? 0).toLocaleString()} Collected
                  </button>
               ) : (
                  <div className="w-full bg-slate-800 text-slate-500 py-4 rounded-2xl font-bold text-center border border-slate-700 flex items-center justify-center gap-2">
                     <CheckCircle2 size={20} /> Payment Already Collected
                  </div>
               )}
            </div>
         </div>
      );
   }

   // Dashboard View
   return (
      <div className="h-full w-full bg-slate-950 flex flex-col">
         {/* Header */}
         <div className="p-6 pt-8 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-full bg-gold-500 text-black flex items-center justify-center font-bold text-lg">
                  <User size={20} />
               </div>
               <div>
                  <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Driver</div>
                  <div className="text-white font-bold text-lg leading-none">{currentUser?.name}</div>
               </div>
            </div>
            <button onClick={logout} className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white">
               <LogOut size={20} />
            </button>
         </div>

         {/* Stats */}
         <div className="grid grid-cols-2 gap-4 p-6">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
               <div className="text-3xl font-serif text-white mb-1">{activeOrders.length}</div>
               <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Active</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
               <div className="text-3xl font-serif text-green-500 mb-1">{completedOrders.length}</div>
               <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Completed</div>
            </div>
         </div>

         {/* List Title */}
         <div className="px-6 pb-2">
            <h3 className="text-gold-500 text-xs font-bold uppercase tracking-[0.2em] mb-1">Your Run</h3>
         </div>

         {/* Orders List */}
         <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
            {activeOrders.length === 0 && completedOrders.length === 0 && (
               <div className="text-center py-10 text-slate-600">No orders assigned yet.</div>
            )}

            {/* Active Orders Section */}
            {activeOrders.map(order => (
               <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="bg-slate-900 border border-gold-500/50 p-5 rounded-2xl shadow-lg relative group active:scale-95 transition-transform"
               >
                  <div className="flex justify-between items-start mb-3">
                     <div className="bg-gold-500 text-black text-xs font-bold px-2 py-1 rounded">ACTIVE</div>
                     <div className="text-slate-400 font-mono text-xs">{new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                  <div className="text-white font-bold text-lg mb-1">{order.customerName}</div>
                  <div className="text-slate-400 text-sm leading-tight mb-4">{order.deliveryAddress}</div>

                  <div className="flex justify-between items-center border-t border-slate-800 pt-3">
                     <div className="flex items-center gap-1 text-slate-500 text-xs">
                        <Package size={14} /> {order.items.length} Items
                     </div>
                     <div className="text-gold-500 font-mono font-bold">Rs. {order.total.toLocaleString()}</div>
                  </div>
               </div>
            ))}

            {/* Completed Orders Divider */}
            {completedOrders.length > 0 && activeOrders.length > 0 && (
               <div className="py-4 flex items-center gap-4">
                  <div className="h-px bg-slate-800 flex-1"></div>
                  <div className="text-xs text-slate-600 font-bold uppercase tracking-widest">History</div>
                  <div className="h-px bg-slate-800 flex-1"></div>
               </div>
            )}

            {/* Completed Orders */}
            {completedOrders.map(order => (
               <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl opacity-60 grayscale hover:grayscale-0 transition-all"
               >
                  <div className="flex justify-between items-start mb-2">
                     <div className="text-green-600 font-bold text-xs flex items-center gap-1"><CheckCircle2 size={12} /> CASH COLLECTED</div>
                     <div className="text-slate-500 font-mono text-xs">#{order.id.split('-')[1]}</div>
                  </div>
                  <div className="text-slate-300 font-bold mb-1">{order.customerName}</div>
                  <div className="text-slate-500 text-xs truncate">{order.deliveryAddress}</div>
               </div>
            ))}
         </div>
      </div>
   );
};
