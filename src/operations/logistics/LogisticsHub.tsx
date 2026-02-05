import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../client/App';
import { Order, OrderStatus, Staff } from '../../shared/types';
import { Bike, MapPin, Clock, Phone, CheckCircle2, Navigation, User, Package, Check, Printer, Send, Layers, X } from 'lucide-react';

declare global {
   interface Window {
      electronAPI?: {
         printDeliverySlip: (data: any) => void;
      };
   }
}

export const LogisticsHub: React.FC = () => {
   const { orders, drivers, assignDriverToOrder, addNotification } = useAppContext();
   const [activeTab, setActiveTab] = useState<'PENDING' | 'IN_TRANSIT'>('PENDING');
   const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
   const [isDispatching, setIsDispatching] = useState(false);

   // Filter Logic
   const pendingOrders = useMemo(() =>
      orders.filter(o =>
         o.type === 'DELIVERY' &&
         (o.status === OrderStatus.READY || o.status === OrderStatus.PREPARING || o.status === OrderStatus.FIRED) &&
         !o.delivery_orders?.[0]?.driver_id && !o.assigned_driver_id
      ).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
      [orders]);

   const inTransitOrders = useMemo(() =>
      orders.filter(o =>
         o.type === 'DELIVERY' &&
         (o.status === OrderStatus.OUT_FOR_DELIVERY || o.assigned_driver_id || o.delivery_orders?.[0]?.driver_id) && o.status !== OrderStatus.PAID && o.status !== OrderStatus.COMPLETED
      ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      [orders]);

   const toggleOrderSelection = (id: string) => {
      setSelectedOrderIds(prev =>
         prev.includes(id) ? prev.filter(oid => oid !== id) : [...prev, id]
      );
   };

   const handleBatchDispatch = async (driverId: string) => {
      if (selectedOrderIds.length === 0) return;

      setIsDispatching(true);
      try {
         // Batch assignment logic
         for (const id of selectedOrderIds) {
            await assignDriverToOrder(id, driverId);
         }

         // Trigger Electron IPC / Print Event
         if (window.electronAPI) {
            window.electronAPI.printDeliverySlip({
               orderIds: selectedOrderIds,
               driverId,
               timestamp: new Date().toISOString()
            });
         }

         addNotification('success', `Dispatched ${selectedOrderIds.length} orders to Rider`);
         setSelectedOrderIds([]);
      } catch (err) {
         addNotification('error', 'Dispatch Sync Failed');
      } finally {
         setIsDispatching(false);
      }
   };

   return (
      <div className="flex h-full bg-[#020617] text-slate-200 overflow-hidden font-sans">

         {/* --- LEFT SIDEBAR: ACTIVE FLEET --- */}
         <div className="w-80 bg-[#0B0F19] border-r border-slate-800/50 flex flex-col shrink-0 shadow-2xl z-20">
            <div className="p-8 border-b border-slate-800/50 bg-slate-900/20">
               <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-serif font-bold text-white tracking-tight">Fleet Command</h2>
                  <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400">
                     <Bike size={20} />
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
                     <span className="block text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Total Fleet</span>
                     <span className="text-2xl font-bold text-white leading-none">{drivers.length}</span>
                  </div>
                  <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
                     <span className="block text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">In Transit</span>
                     <span className="text-2xl font-bold text-blue-400 leading-none">
                        {new Set(inTransitOrders.map(o => o.assigned_driver_id || o.delivery_orders?.[0]?.driver_id)).size || 0}
                     </span>
                  </div>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
               <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600 mb-2">Available Pilots</h3>
               {drivers.map(driver => {
                  const activeRunCount = inTransitOrders.filter(o => (o.assigned_driver_id === driver.id) || (o.delivery_orders?.[0]?.driver_id === driver.id)).length;
                  const isAvailable = activeRunCount === 0;

                  return (
                     <div
                        key={driver.id}
                        className={`group relative overflow-hidden transition-all duration-300 p-4 rounded-2xl border flex items-center gap-4 ${isAvailable ? 'bg-slate-900/40 border-slate-800/50' : 'bg-blue-900/5 border-blue-900/20'
                           }`}
                     >
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shadow-xl transition-transform group-hover:scale-110 ${isAvailable ? 'bg-slate-800 text-slate-400' : 'bg-blue-600 text-white animate-pulse'
                           }`}>
                           {driver.name.charAt(0)}
                        </div>
                        <div className="flex-1">
                           <div className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors uppercase tracking-tight">{driver.name}</div>
                           <div className={`text-[10px] uppercase font-black tracking-widest mt-1 ${isAvailable ? 'text-slate-500' : 'text-blue-500'}`}>
                              {isAvailable ? 'Stationary' : `${activeRunCount} Active Deliveries`}
                           </div>
                        </div>

                        {selectedOrderIds.length > 0 && isAvailable && (
                           <button
                              onClick={() => handleBatchDispatch(driver.id)}
                              className="absolute inset-0 bg-blue-600/90 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                           >
                              <Send size={16} /> <span className="text-[10px] font-black uppercase">Assign Batch</span>
                           </button>
                        )}
                     </div>
                  );
               })}
            </div>
         </div>

         {/* --- MAIN DASHBOARD --- */}
         <div className="flex-1 flex flex-col bg-[#020617] relative">
            <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-blue-500/5 blur-[120px] pointer-events-none" />

            {/* Sub-Header */}
            <div className="p-8 border-b border-slate-800/50 bg-slate-950/40 backdrop-blur-md flex justify-between items-center z-10">
               <div className="flex gap-4 p-1.5 bg-slate-900/60 rounded-[1.5rem] border border-slate-800/50 ring-1 ring-white/5">
                  {[
                     { id: 'PENDING', label: 'Dispatch Queue', count: pendingOrders.length, color: 'gold-500' },
                     { id: 'IN_TRANSIT', label: 'In Transit', count: inTransitOrders.length, color: 'blue-500' }
                  ].map(tab => (
                     <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500 ${activeTab === tab.id
                           ? `bg-white text-slate-950 shadow-2xl`
                           : 'text-slate-500 hover:text-slate-300'
                           }`}
                     >
                        {tab.label} <span className="ml-2 py-0.5 px-2 bg-black/20 rounded-full">{tab.count}</span>
                     </button>
                  ))}
               </div>

               {selectedOrderIds.length > 0 && (
                  <div className="flex items-center gap-6 animate-in slide-in-from-right duration-500">
                     <span className="text-xs font-black uppercase tracking-widest text-gold-500 flex items-center gap-2">
                        <Layers size={16} /> {selectedOrderIds.length} Selected
                     </span>
                     <button
                        onClick={() => setSelectedOrderIds([])}
                        className="text-slate-500 hover:text-white transition-colors"
                     >
                        <X size={18} />
                     </button>
                  </div>
               )}
            </div>

            {/* Board Area */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative z-10">

               {activeTab === 'PENDING' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
                     {pendingOrders.map(order => {
                        const isSelected = selectedOrderIds.includes(order.id);
                        return (
                           <div
                              key={order.id}
                              onClick={() => toggleOrderSelection(order.id)}
                              className={`group relative h-full flex flex-col bg-slate-900/40 border-2 rounded-[2.5rem] p-6 transition-all duration-300 cursor-pointer ${isSelected ? 'border-gold-500 ring-4 ring-gold-500/10' : 'border-slate-800/50 hover:border-slate-700'
                                 }`}
                           >
                              <div className="flex justify-between items-start mb-6">
                                 <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-1">
                                       #{order.id.split('-').pop()?.toUpperCase()}
                                    </div>
                                    <h3 className="text-xl font-serif font-bold text-white group-hover:text-gold-500 transition-colors">{order.customer_name || 'Anonymous Guest'}</h3>
                                 </div>
                                 <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isSelected ? 'bg-gold-500 text-slate-950 scale-110' : 'bg-slate-800 text-slate-500 border border-slate-700'
                                    }`}>
                                    {isSelected ? <Check size={18} /> : <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />}
                                 </div>
                              </div>

                              <div className="flex-1 space-y-4">
                                 <div className="flex items-center gap-3 text-xs text-slate-400">
                                    <Phone size={14} className="text-slate-600" /> <span>{order.customer_phone}</span>
                                 </div>
                                 <div className="bg-slate-950/80 p-4 rounded-3xl border border-slate-800/50 flex gap-4 min-h-[5rem]">
                                    <MapPin size={18} className="mt-1 text-red-500 shrink-0" />
                                    <span className="text-sm text-slate-300 leading-relaxed line-clamp-2">
                                       {order.delivery_orders?.[0]?.delivery_address || order.delivery_address || 'No address provided'}
                                    </span>
                                 </div>
                              </div>

                              <div className="mt-8 flex justify-between items-center pt-6 border-t border-slate-800/50">
                                 <div className="flex items-center gap-2 text-gold-500/60 font-mono text-sm uppercase">
                                    <Clock size={14} /> <span>{Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000)}m ago</span>
                                 </div>
                                 <div className="text-2xl font-black text-white px-4 py-1.5 bg-slate-800/30 rounded-2xl">
                                    Rs. {Number(order.total).toLocaleString()}
                                 </div>
                              </div>
                           </div>
                        );
                     })}

                     {pendingOrders.length === 0 && (
                        <div className="col-span-full h-full min-h-[400px] flex flex-col items-center justify-center opacity-30 grayscale pointer-events-none">
                           <div className="w-32 h-32 border-4 border-dashed border-slate-800 rounded-full flex items-center justify-center mb-8">
                              <Package size={64} className="text-slate-800" />
                           </div>
                           <h2 className="text-3xl font-serif text-slate-700">Dispatch Queue Clear</h2>
                           <p className="text-[10px] uppercase font-black tracking-[0.4em] text-slate-800 mt-4">Awaiting kitchen handovers...</p>
                        </div>
                     )}
                  </div>
               )}

               {activeTab === 'IN_TRANSIT' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
                     {inTransitOrders.map(order => {
                        const driverId = order.assigned_driver_id || order.delivery_orders?.[0]?.driver_id;
                        const pilot = drivers.find(d => d.id === driverId);

                        return (
                           <div key={order.id} className="relative bg-slate-900/40 border-2 border-blue-900/30 rounded-[2.5rem] p-7 flex flex-col gap-6 overflow-hidden min-h-[20rem]">
                              <div className="absolute -top-10 -right-10 opacity-5">
                                 <Navigation size={200} className="rotate-45" />
                              </div>

                              <div className="flex justify-between items-start relative z-10">
                                 <div>
                                    <div className="flex items-center gap-2 mb-2">
                                       <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-lg text-[9px] font-black uppercase tracking-widest border border-blue-500/20">
                                          <Bike size={10} /> In Flight
                                       </div>
                                    </div>
                                    <h3 className="text-2xl font-serif font-bold text-white tracking-tight">{order.customer_name}</h3>
                                 </div>
                                 <div className="text-right">
                                    <div className="text-2xl font-black text-white">Rs. {Number(order.total).toLocaleString()}</div>
                                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Balance Due</span>
                                 </div>
                              </div>

                              <div className="bg-slate-950/60 p-4 rounded-3xl border border-slate-800/50 flex items-center gap-4 relative z-10">
                                 <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-black text-lg shadow-lg">
                                    {pilot?.name.charAt(0)}
                                 </div>
                                 <div>
                                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest block mb-1">Assigned Pilot</span>
                                    <span className="text-sm font-bold text-blue-400">{pilot?.name}</span>
                                 </div>
                              </div>

                              <div className="mt-auto space-y-4 relative z-10">
                                 <div className="flex gap-4 text-slate-400 text-sm">
                                    <MapPin size={18} className="text-blue-500 shrink-0 mt-1" />
                                    <span className="line-clamp-2 leading-relaxed italic">{order.delivery_orders?.[0]?.delivery_address || order.delivery_address}</span>
                                 </div>

                                 <div className="flex gap-3 pt-4 border-t border-slate-800/50">
                                    <button
                                       onClick={() => addNotification('info', 'Printing Duplicate Slip...')}
                                       className="w-14 h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 transition-all flex items-center justify-center group"
                                       title="Print Duplicate"
                                    >
                                       <Printer size={20} className="group-hover:scale-110 transition-transform" />
                                    </button>
                                    <button
                                       className="flex-1 h-14 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-widest text-[10px] transition-all shadow-xl shadow-blue-900/20 flex items-center justify-center gap-3 active:scale-[0.98]"
                                    >
                                       <CheckCircle2 size={18} /> Confirm Arrived
                                    </button>
                                 </div>
                              </div>
                           </div>
                        );
                     })}
                  </div>
               )}
            </div>
         </div>

         <style dangerouslySetInnerHTML={{
            __html: `
            .no-scrollbar::-webkit-scrollbar { display: none; }
            .custom-scrollbar::-webkit-scrollbar { width: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
         `}} />
      </div>
   );
};
