import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../client/App';
import { OrderStatus, Order, OrderType } from '../../shared/types';
import { Search, Filter, Clock, Users, Receipt, ArrowRight, ShoppingBag, Truck, Utensils, XCircle, CheckCircle2, History, AlertCircle, FileText } from 'lucide-react';

export const ActivityLog: React.FC = () => {
   const { orders, tables, servers, setOrderToEdit, setActiveView } = useAppContext();

   // States
   const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'>('ALL');
   const [searchQuery, setSearchQuery] = useState('');
   const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

   // Grouped Statuses for Filter Logic
   const activeStatuses = [OrderStatus.DRAFT, OrderStatus.NEW, OrderStatus.COOKING, OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY];
   const completedStatuses = [OrderStatus.DELIVERED, OrderStatus.PAID];
   const cancelledStatuses = [OrderStatus.CANCELLED, OrderStatus.VOID];

   // Filtering Logic
   const filteredOrders = useMemo(() => {
      return orders.filter(order => {
         // 1. Status Filter
         let matchesStatus = true;
         if (filterStatus === 'ACTIVE') matchesStatus = activeStatuses.includes(order.status);
         if (filterStatus === 'COMPLETED') matchesStatus = completedStatuses.includes(order.status);
         if (filterStatus === 'CANCELLED') matchesStatus = cancelledStatuses.includes(order.status);

         // 2. Search Filter (ID or Customer Name)
         const query = searchQuery.toLowerCase();
         const matchesSearch =
            order.id.toLowerCase().includes(query) ||
            (order.customerName || '').toLowerCase().includes(query) ||
            (order.tableId ? tables.find(t => t.id === order.tableId)?.name.toLowerCase().includes(query) : false);

         return matchesStatus && matchesSearch;
      }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // Newest first
   }, [orders, filterStatus, searchQuery, tables]);

   // UI Helper: Get Icon based on Order Type
   const getTypeIcon = (type: OrderType) => {
      switch (type) {
         case 'DINE_IN': return <Utensils size={14} />;
         case 'TAKEAWAY': return <ShoppingBag size={14} />;
         case 'DELIVERY': return <Truck size={14} />;
         default: return <Utensils size={14} />;
      }
   };

   // UI Helper: Status Badge Color
   const getStatusColor = (status: OrderStatus) => {
      if (activeStatuses.includes(status)) return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      if (completedStatuses.includes(status)) return 'bg-green-500/20 text-green-400 border-green-500/50';
      if (cancelledStatuses.includes(status)) return 'bg-red-500/20 text-red-400 border-red-500/50';
      return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
   };

   const formatTime = (date: Date) => {
      return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
   };

   const handleEditOrder = (order: Order) => {
      if (completedStatuses.includes(order.status) || cancelledStatuses.includes(order.status)) return;
      setOrderToEdit(order);
      setActiveView('POS');
   };

   return (
      <div className="flex h-full bg-[#020617] text-slate-200 overflow-hidden relative">

         {/* LEFT PANE: LIST */}
         <div className={`flex-1 flex flex-col min-w-0 ${selectedOrder ? 'hidden lg:flex' : 'flex'}`}>

            {/* Header */}
            <div className="p-6 border-b border-slate-800 bg-[#0B0F19]">
               <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                     <History className="text-gold-500" /> Activity Log
                  </h2>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 flex gap-1">
                     {['ALL', 'ACTIVE', 'COMPLETED', 'CANCELLED'].map((tab) => (
                        <button
                           key={tab}
                           onClick={() => setFilterStatus(tab as any)}
                           className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${filterStatus === tab
                              ? 'bg-gold-500 text-black shadow-lg shadow-gold-500/20'
                              : 'text-slate-500 hover:text-white hover:bg-slate-800'
                              }`}
                        >
                           {tab}
                        </button>
                     ))}
                  </div>
               </div>

               <div className="relative">
                  <Search className="absolute left-4 top-3.5 text-slate-500" size={18} />
                  <input
                     type="text"
                     placeholder="Search Order ID, Customer, Table..."
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                     className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-slate-300 focus:border-gold-500 outline-none transition-colors placeholder:text-slate-600"
                  />
               </div>
            </div>

            {/* Order List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
               {filteredOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-600">
                     <FileText size={48} className="opacity-20 mb-4" />
                     <span className="text-sm font-black uppercase tracking-widest">No Records Found</span>
                  </div>
               ) : (
                  filteredOrders.map((order) => {
                     const table = tables.find(t => t.id === order.tableId);
                     const server = servers.find(s => s.id === order.assignedWaiterId);

                     return (
                        <div
                           key={order.id}
                           onClick={() => setSelectedOrder(order)}
                           className={`group bg-slate-900/50 border border-slate-800/50 hover:bg-slate-900 hover:border-gold-500/30 rounded-2xl p-4 cursor-pointer transition-all duration-200 relative overflow-hidden ${selectedOrder?.id === order.id ? 'border-gold-500 bg-slate-900' : ''}`}
                        >
                           <div className="flex justify-between items-start">
                              <div className="flex items-center gap-4">
                                 <div className={`w-12 h-12 rounded-xl flex items-center justify-center border bg-slate-950 ${selectedOrder?.id === order.id ? 'border-gold-500 text-gold-500' : 'border-slate-800 text-slate-500 group-hover:text-gold-500 group-hover:border-gold-500/50'}`}>
                                    {getTypeIcon(order.type)}
                                 </div>
                                 <div>
                                    <div className="flex items-center gap-2 mb-1">
                                       <span className="font-bold text-white text-lg">
                                          {order.type === 'DINE_IN' ? (table?.name || 'Table ?') : (order.customerName || 'Walk-in')}
                                       </span>
                                       <span className="text-[10px] text-slate-500 font-mono">#{order.id.split('-').pop()}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                                       <span className="flex items-center gap-1"><Clock size={12} /> {formatTime(order.timestamp)}</span>
                                       {server && <span className="flex items-center gap-1"><Users size={12} /> {server.name}</span>}
                                    </div>
                                 </div>
                              </div>

                              <div className="text-right">
                                 <div className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest mb-2 ${getStatusColor(order.status)}`}>
                                    {order.status.replace('_', ' ')}
                                 </div>
                                 <div className="text-white font-mono font-bold">
                                    Rs. {order.total.toLocaleString()}
                                 </div>
                              </div>
                           </div>
                        </div>
                     );
                  })
               )}
            </div>
         </div>

         {/* RIGHT PANE: DETAILS (Slide over or static depending on screen size) */}
         {selectedOrder && (
            <div className="w-full lg:w-[450px] bg-[#0B0F19] border-l border-slate-800 flex flex-col shrink-0 absolute inset-0 lg:static z-20">

               {/* Detail Header */}
               <div className="p-6 border-b border-slate-800 flex justify-between items-start bg-slate-950/50">
                  <div>
                     <button onClick={() => setSelectedOrder(null)} className="lg:hidden mb-4 flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-widest"><ArrowRight className="rotate-180" size={14} /> Back</button>
                     <h3 className="text-xl font-serif font-bold text-white">Order Details</h3>
                     <p className="text-xs text-slate-500 font-mono mt-1">ID: {selectedOrder.id}</p>
                  </div>
                  <button onClick={() => setSelectedOrder(null)} className="hidden lg:block p-2 hover:bg-slate-800 rounded-full text-slate-500"><ArrowRight size={20} /></button>
               </div>

               {/* Detail Content */}
               <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

                  {/* Status Banner */}
                  <div className={`p-4 rounded-xl border mb-6 flex items-center gap-3 ${getStatusColor(selectedOrder.status)}`}>
                     {completedStatuses.includes(selectedOrder.status) ? <CheckCircle2 size={24} /> : cancelledStatuses.includes(selectedOrder.status) ? <XCircle size={24} /> : <AlertCircle size={24} />}
                     <div>
                        <div className="font-black uppercase tracking-widest text-xs">Current Status</div>
                        <div className="font-bold text-lg">{selectedOrder.status}</div>
                     </div>
                  </div>

                  {/* Items */}
                  <div className="space-y-4 mb-8">
                     <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-4">Ordered Items</h4>
                     {selectedOrder.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-800/50 last:border-0">
                           <div className="flex gap-3">
                              <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-xs font-bold text-white">{item.quantity}</div>
                              <div>
                                 <div className="text-sm text-slate-300 font-medium">{item.menuItem.name}</div>
                                 <div className="text-[10px] text-slate-600 uppercase">{item.status}</div>
                              </div>
                           </div>
                           <div className="text-sm font-mono text-slate-400">{(item.price * item.quantity).toLocaleString()}</div>
                        </div>
                     ))}
                  </div>

                  {/* Financials */}
                  <div className="bg-slate-900 rounded-xl p-4 space-y-2 mb-8 border border-slate-800">
                     <div className="flex justify-between text-xs text-slate-400"><span>Subtotal</span><span>Rs. {selectedOrder.breakdown?.subtotal || selectedOrder.total}</span></div>
                     {selectedOrder.type === 'delivery' && <div className="flex justify-between text-xs text-slate-400"><span>Delivery Fee</span><span>Rs. {selectedOrder.deliveryFee || 0}</span></div>}
                     <div className="border-t border-slate-800 pt-2 flex justify-between text-lg font-bold text-white font-serif"><span>Total</span><span>Rs. {selectedOrder.total.toLocaleString()}</span></div>
                  </div>

                  {/* Meta Info */}
                  <div className="space-y-3">
                     <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Metadata</h4>
                     <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                           <span className="block text-slate-500 mb-1">Type</span>
                           <span className="text-white font-bold uppercase">{selectedOrder.type}</span>
                        </div>
                        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                           <span className="block text-slate-500 mb-1">Date</span>
                           <span className="text-white font-bold">{new Date(selectedOrder.timestamp).toLocaleDateString()}</span>
                        </div>
                        {selectedOrder.customerPhone && (
                           <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 col-span-2">
                              <span className="block text-slate-500 mb-1">Customer Phone</span>
                              <span className="text-white font-bold font-mono">{selectedOrder.customerPhone}</span>
                           </div>
                        )}
                        {selectedOrder.deliveryAddress && (
                           <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 col-span-2">
                              <span className="block text-slate-500 mb-1">Address</span>
                              <span className="text-white">{selectedOrder.deliveryAddress}</span>
                           </div>
                        )}
                     </div>
                  </div>

               </div>

               {/* Actions Footer */}
               {activeStatuses.includes(selectedOrder.status) && (
                  <div className="p-4 border-t border-slate-800 bg-slate-950">
                     <button
                        onClick={() => handleEditOrder(selectedOrder)}
                        className="w-full py-4 bg-gold-500 text-slate-950 font-black uppercase tracking-widest rounded-xl hover:bg-gold-400 transition-colors shadow-lg shadow-gold-500/10 flex items-center justify-center gap-2"
                     >
                        <Receipt size={16} /> Recall to POS
                     </button>
                  </div>
               )}
            </div>
         )}

      </div>
   );
};