import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../client/App';
import { OrderStatus, Staff } from '../../shared/types';
import { Bike, MapPin, Clock, Phone, CheckCircle2, Navigation, User, Package } from 'lucide-react';

// ✅ CORRECT NAMED EXPORT to match App.tsx
export const LogisticsHub: React.FC = () => {
   const { orders, drivers, assignDriverToOrder, completeDelivery, updateOrderStatus } = useAppContext();

   const [activeTab, setActiveTab] = useState<'PENDING' | 'IN_TRANSIT'>('PENDING');

   // Filter Logic
   const pendingOrders = useMemo(() =>
      orders.filter(o =>
         o.type === 'delivery' &&
         (o.status === OrderStatus.READY || o.status === OrderStatus.COOKING) &&
         !o.assignedDriverId
      ).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()), // Oldest first
      [orders]);

   const inTransitOrders = useMemo(() =>
      orders.filter(o =>
         o.type === 'delivery' &&
         (o.status === OrderStatus.OUT_FOR_DELIVERY || (o.assignedDriverId && o.status === OrderStatus.READY))
      ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      [orders]);

   const handleAssignDriver = async (orderId: string, driverId: string) => {
      // In a real app, you would call assignDriverToOrder(orderId, driverId)
      // For now, we simulate the status update if the function isn't fully implemented in context yet
      if (assignDriverToOrder) {
         await assignDriverToOrder(orderId, driverId);
      } else {
         // Fallback if context helper is missing
         await updateOrderStatus(orderId, OrderStatus.OUT_FOR_DELIVERY);
         console.log(`Assigned Driver ${driverId} to Order ${orderId}`);
      }
   };

   return (
      <div className="flex h-full bg-[#020617] text-slate-200 overflow-hidden">

         {/* --- SIDEBAR: DRIVER FLEET STATUS --- */}
         <div className="w-80 bg-[#0B0F19] border-r border-slate-800 flex flex-col shrink-0">
            <div className="p-6 border-b border-slate-800">
               <h2 className="text-xl font-serif font-bold text-white flex items-center gap-2">
                  <Bike className="text-gold-500" /> Fleet Command
               </h2>
               <div className="flex gap-4 mt-4 text-xs font-mono">
                  <div>
                     <span className="block text-slate-500 uppercase tracking-wider">Active</span>
                     <span className="text-xl font-bold text-white">{drivers.length}</span>
                  </div>
                  <div>
                     <span className="block text-slate-500 uppercase tracking-wider">On Run</span>
                     <span className="text-xl font-bold text-blue-400">
                        {drivers.filter(d => d.activeTables && d.activeTables > 0).length}
                     </span>
                  </div>
               </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
               {drivers.map(driver => {
                  const activeDeliveryCount = inTransitOrders.filter(o => o.assignedDriverId === driver.id).length;
                  return (
                     <div key={driver.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${activeDeliveryCount > 0 ? 'bg-blue-900 text-blue-300' : 'bg-green-900 text-green-300'}`}>
                           {driver.name.charAt(0)}
                        </div>
                        <div className="flex-1">
                           <div className="text-white font-bold">{driver.name}</div>
                           <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                              {activeDeliveryCount > 0 ? `${activeDeliveryCount} Active Runs` : 'Available'}
                           </div>
                        </div>
                     </div>
                  );
               })}
            </div>
         </div>

         {/* --- MAIN CONTENT --- */}
         <div className="flex-1 flex flex-col">

            {/* Header Tabs */}
            <div className="p-6 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
               <div className="flex gap-2 bg-slate-900 p-1.5 rounded-xl border border-slate-800">
                  <button
                     onClick={() => setActiveTab('PENDING')}
                     className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'PENDING' ? 'bg-gold-500 text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}
                  >
                     Dispatch Queue ({pendingOrders.length})
                  </button>
                  <button
                     onClick={() => setActiveTab('IN_TRANSIT')}
                     className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'IN_TRANSIT' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-slate-500 hover:text-white'}`}
                  >
                     In Transit ({inTransitOrders.length})
                  </button>
               </div>
            </div>

            {/* Board */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-950">

               {activeTab === 'PENDING' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                     {pendingOrders.length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center h-96 text-slate-600">
                           <Package size={48} className="opacity-20 mb-4" />
                           <span className="font-black uppercase tracking-widest">No Pending Dispatches</span>
                        </div>
                     )}
                     {pendingOrders.map(order => (
                        <div key={order.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4 shadow-xl shadow-black/50">
                           <div className="flex justify-between items-start">
                              <div>
                                 <h3 className="text-lg font-serif font-bold text-white">{order.customerName}</h3>
                                 <div className="text-xs text-slate-500 font-mono">#{order.id.split('-').pop()}</div>
                              </div>
                              <div className="bg-slate-800 px-2 py-1 rounded text-[10px] font-bold text-gold-500 border border-slate-700">
                                 {order.status}
                              </div>
                           </div>

                           <div className="space-y-2">
                              <div className="flex gap-2 text-xs text-slate-400">
                                 <Phone size={14} className="mt-0.5" /> <span>{order.customerPhone}</span>
                              </div>
                              <div className="flex gap-2 text-xs text-slate-300 bg-slate-950 p-2 rounded border border-slate-800/50">
                                 <MapPin size={14} className="mt-0.5 text-red-400" /> <span className="line-clamp-2">{order.deliveryAddress}</span>
                              </div>
                           </div>

                           <div className="border-t border-slate-800 pt-3 mt-auto">
                              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Assign Pilot</label>
                              <div className="grid grid-cols-3 gap-2">
                                 {drivers.map(driver => (
                                    <button
                                       key={driver.id}
                                       onClick={() => handleAssignDriver(order.id, driver.id)}
                                       className="py-2 bg-slate-800 hover:bg-gold-500 hover:text-black border border-slate-700 hover:border-gold-500 rounded-lg text-[10px] font-bold uppercase transition-colors"
                                    >
                                       {driver.name.split(' ')[0]}
                                    </button>
                                 ))}
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               )}

               {activeTab === 'IN_TRANSIT' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                     {inTransitOrders.map(order => {
                        const assignedDriver = drivers.find(d => d.id === order.assignedDriverId);
                        return (
                           <div key={order.id} className="bg-slate-900 border border-blue-900/30 rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden">
                              <div className="absolute top-0 right-0 p-2 opacity-10">
                                 <Navigation size={100} />
                              </div>

                              <div className="flex justify-between items-start z-10">
                                 <div>
                                    <h3 className="text-lg font-serif font-bold text-white">{order.customerName}</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                       <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-bold text-black">
                                          {assignedDriver?.name.charAt(0)}
                                       </div>
                                       <span className="text-xs text-blue-400 font-bold uppercase">{assignedDriver?.name}</span>
                                    </div>
                                 </div>
                                 <div className="text-right">
                                    <div className="text-xl font-mono font-bold text-white">Rs. {order.total.toLocaleString()}</div>
                                    <div className="text-[9px] text-slate-500 uppercase">Total Due</div>
                                 </div>
                              </div>

                              <div className="bg-black/30 p-3 rounded-lg border border-slate-800 z-10">
                                 <div className="flex gap-2 text-xs text-slate-300">
                                    <MapPin size={14} className="mt-0.5 text-blue-400" /> <span className="line-clamp-2">{order.deliveryAddress}</span>
                                 </div>
                              </div>

                              <div className="z-10 mt-2">
                                 <button
                                    onClick={() => updateOrderStatus(order.id, OrderStatus.DELIVERED)}
                                    className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-green-900/20 flex items-center justify-center gap-2"
                                 >
                                    <CheckCircle2 size={16} /> Mark Delivered
                                 </button>
                              </div>
                           </div>
                        );
                     })}
                  </div>
               )}

            </div>
         </div>
      </div>
   );
};