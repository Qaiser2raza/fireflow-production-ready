import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../client/App';
import { Order, OrderType } from '../../shared/types';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';
import {
   Search, Clock, Receipt, ArrowRight, ShoppingBag,
   Truck, Utensils, XCircle, CheckCircle2, History,
   FileText, Calendar, Wallet, HandCoins, Timer,
   LayoutGrid, List as ListIcon, MoreHorizontal, Unlock,
   Printer, Trash2, Slash
} from 'lucide-react';
import { getCompositeStatus } from '../../shared/lib/orderStatus';
import { ReceiptPreviewModal } from '../../shared/components/ReceiptPreviewModal';

export const ActivityLog: React.FC = () => {
   const { orders, tables, setOrderToEdit, setActiveView, currentUser, addNotification, fetchInitialData, voidOrder } = useAppContext();

   // States
   const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'>('ALL');
   const [filterType, setFilterType] = useState<OrderType | 'ALL'>('ALL');
   const [viewMode, setViewMode] = useState<'CARDS' | 'LIST'>('CARDS');
   const [searchQuery, setSearchQuery] = useState('');
   const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
   const [showPrintModal, setShowPrintModal] = useState(false);

   // Grouped Statuses for Filter Logic (v3.0)
   const activeStatuses = ['ACTIVE', 'PENDING', 'PREPARING', 'READY', 'SERVED', 'BILL_REQUESTED'];
   const completedStatuses = ['CLOSED', 'DELIVERED'];   // DELIVERED = cash in rider's hand (settled at logistics)
   const cancelledStatuses = ['CANCELLED', 'VOIDED'];

   // Filtering Logic
   const filteredOrders = useMemo(() => {
      return orders.filter(order => {
         // 1. Status Filter
         let matchesStatus = true;
         if (filterStatus === 'ACTIVE') matchesStatus = activeStatuses.includes(order.status) && order.payment_status !== 'PAID';
         if (filterStatus === 'COMPLETED') matchesStatus = (completedStatuses.includes(order.status) || order.payment_status === 'PAID') && !cancelledStatuses.includes(order.status);
         if (filterStatus === 'CANCELLED') matchesStatus = cancelledStatuses.includes(order.status);

         // 2. Type Filter
         let matchesType = true;
         if (filterType !== 'ALL') matchesType = order.type === filterType;

         // 3. Search Filter (ID, Number, Token, or Customer Name)
         const query = searchQuery.toLowerCase();
         const matchesSearch =
            order.id.toLowerCase().includes(query) ||
            (order.order_number || '').toLowerCase().includes(query) ||
            (order.takeaway_orders?.[0]?.token_number || '').toLowerCase().includes(query) ||
            (order.customerName || order.customer_name || '').toLowerCase().includes(query) ||
            (order.table_id ? tables?.find(t => t.id === order.table_id)?.name.toLowerCase().includes(query) : false);

         return matchesStatus && matchesType && matchesSearch;
      }).sort((a, b) => {
         const timeA = new Date(a.created_at || a.timestamp || 0).getTime();
         const timeB = new Date(b.created_at || b.timestamp || 0).getTime();
         return timeB - timeA;
      });
   }, [orders, filterStatus, filterType, searchQuery, tables]);

   const getProgress = (order: Order) => {
      if (order.payment_status === 'PAID' || order.status === 'CLOSED') return 100;
      if (order.status === 'CANCELLED' || order.status === 'VOIDED') return 100;

      switch (order.status) {
         case 'PENDING': return 25;
         case 'PREPARING': return 65;
         case 'READY': return 90;
         default: return 40;
      }
   };

   // UI Helper: Get Icon based on Order Type
   const getTypeIcon = (type: OrderType) => {
      switch (type) {
         case 'DINE_IN': return <Utensils size={14} />;
         case 'TAKEAWAY': return <ShoppingBag size={14} />;
         case 'DELIVERY': return <Truck size={14} />;
         case 'RESERVATION': return <Calendar size={14} />;
         default: return <Utensils size={14} />;
      }
   };

   const formatTime = (date: any) => {
      if (!date) return '--:--';
      return new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
   };

   const handleEditOrder = (order: Order) => {
      setOrderToEdit(order);
      setActiveView('POS');
   };

   const handleUnlockOrder = async (order: Order) => {
      if (!confirm(`Are you sure you want to unlock Order #${order.order_number || order.id.slice(-4)}? This will void all associated transactions.`)) return;
      try {
         const res = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/orders/${order.id}/unlock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'Manager manual unlock' })
         });

         if (!res.ok) {
            const result = await res.json();
            throw new Error(result.error || 'Failed to unlock order');
         }

         addNotification('success', 'Order unlocked and returned to ACTIVE state.');
         setSelectedOrder(null);
         fetchInitialData();
      } catch (err: any) {
         addNotification('error', err.message);
      }
   };
   const handleVoidOrder = async (order: Order) => {
      const reason = window.prompt(`Enter VOID reason for Order #${order.order_number || order.id.slice(-4)}:`, 'Mistake / Customer Cancellation');
      if (!reason) return;
      
      const pin = window.prompt('Enter Manager PIN to authorize VOID:');
      if (!pin) return;

      try {
         const success = await voidOrder(
            order.id,
            reason,
            'Administrative Void from Command Hub',
            'CASH', // Default refund method for now
            pin
         );

         if (success) {
            setSelectedOrder(null);
            fetchInitialData();
         }
      } catch (err: any) {
         addNotification('error', err.message);
      }
   };

   const handleDeleteOrder = async (order: Order) => {
      if (!confirm(`DELETE ORDER #${order.order_number || order.id.slice(-4)}? This cannot be undone and will be removed from logs.`)) return;
      try {
         const res = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/orders/${order.id}`, {
            method: 'DELETE'
         });

         if (!res.ok) throw new Error('Failed to delete order');
         addNotification('success', 'Order has been deleted');
         setSelectedOrder(null);
         fetchInitialData();
      } catch (err: any) {
         addNotification('error', err.message);
      }
   };

   return (
      <div className="flex h-full bg-[#020617] text-slate-200 overflow-hidden relative">

         {/* LEFT PANE: LIST */}
         <div className={`flex-1 flex flex-col min-w-0 ${selectedOrder ? 'hidden lg:flex' : 'flex'}`}>

            {/* Header - Compact Flow Ops */}
            <div className="px-6 py-4 border-b border-slate-800 bg-[#0B0F19]/50 backdrop-blur-md sticky top-0 z-30">
               <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <h2 className="text-lg font-black text-white flex items-center gap-2 shrink-0 tracking-tighter uppercase italic">
                     <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                     Live Flow Ops
                  </h2>

                  <div className="flex bg-slate-900/50 p-1 rounded-lg border border-slate-800 shrink-0">
                     <button
                        onClick={() => setViewMode('CARDS')}
                        className={`p-1.5 rounded-md transition-all ${viewMode === 'CARDS' ? 'bg-slate-700 text-gold-500 shadow-inner' : 'text-slate-500 hover:text-slate-300'}`}
                        title="Grid View"
                     >
                        <LayoutGrid size={14} />
                     </button>
                     <button
                        onClick={() => setViewMode('LIST')}
                        className={`p-1.5 rounded-md transition-all ${viewMode === 'LIST' ? 'bg-slate-700 text-gold-500 shadow-inner' : 'text-slate-500 hover:text-slate-300'}`}
                        title="List View"
                     >
                        <ListIcon size={14} />
                     </button>
                  </div>

                  {/* Type Filter */}
                  <div className="flex bg-slate-900/50 p-1 rounded-lg border border-slate-800 shrink-0">
                     {['ALL', 'DINE_IN', 'TAKEAWAY', 'DELIVERY'].map((type) => (
                        <button
                           key={type}
                           onClick={() => setFilterType(type as any)}
                           className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all ${filterType === type ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-500 hover:text-white'}`}
                        >
                           {type === 'ALL' ? 'All' : type === 'DINE_IN' ? 'Dine' : type === 'TAKEAWAY' ? 'Take' : 'Del'}
                        </button>
                     ))}
                  </div>

                  {/* Status Filter */}
                  <div className="flex bg-slate-900/50 p-1 rounded-lg border border-slate-800 shrink-0">
                     {['ALL', 'ACTIVE', 'COMPLETED', 'CANCELLED'].map((tab) => (
                        <button
                           key={tab}
                           onClick={() => setFilterStatus(tab as any)}
                           className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all ${filterStatus === tab ? 'bg-gold-500 text-black shadow-lg shadow-gold-500/20' : 'text-slate-500 hover:text-white'}`}
                        >
                           {tab}
                        </button>
                     ))}
                  </div>

                  {/* Search - Integrated */}
                  <div className="relative flex-1 min-w-[180px]">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                     <input
                        type="text"
                        placeholder="Search Token, Customer, Table..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-300 focus:border-gold-500 outline-none transition-colors placeholder:text-slate-600"
                     />
                  </div>
               </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
               {filteredOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-600">
                     <FileText size={48} className="opacity-20 mb-4" />
                     <span className="text-sm font-black uppercase tracking-widest">No Active Operations</span>
                  </div>
               ) : viewMode === 'CARDS' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                     {filteredOrders.map((order) => {
                        const table = tables.find(t => t.id === order.table_id);
                        const token = order.takeaway_orders?.[0]?.token_number || (order as any).token_number;
                        const progress = getProgress(order);
                        const statusStyle = getCompositeStatus(order.status, order.payment_status);

                        const typeColors = {
                           DINE_IN: 'border-blue-500/30 text-blue-400',
                           TAKEAWAY: 'border-emerald-500/30 text-emerald-400',
                           DELIVERY: 'border-purple-500/30 text-purple-400',
                           RESERVATION: 'border-amber-500/30 text-amber-400'
                        };

                        return (
                           <div
                              key={order.id}
                              onClick={() => setSelectedOrder(order)}
                              className={`group bg-[#0B0F19]/40 border rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:bg-[#0B0F19]/80 shadow-lg ${selectedOrder?.id === order.id ? 'border-gold-500 ring-1 ring-gold-500/50 scale-[1.01]' : 'border-slate-800/80 hover:border-slate-700'}`}
                           >
                              <div className="p-4 space-y-3">
                                 {/* Top Row: Type Indicator & Token */}
                                 <div className="flex justify-between items-center">
                                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-widest ${typeColors[order.type as keyof typeof typeColors]}`}>
                                       {getTypeIcon(order.type)}
                                       {order.type.replace('_', ' ')}
                                    </div>
                                    {token && (
                                       <div className="text-gold-500 font-black text-xs px-2 py-0.5 bg-gold-500/10 rounded-md border border-gold-500/20">
                                          #{token}
                                       </div>
                                    )}
                                 </div>

                                 {/* Main Info */}
                                 <div>
                                    <h3 className="text-base font-bold text-white truncate leading-tight">
                                       {order.type === 'DINE_IN' ? (table?.name || 'Table ?') : (order.customerName || order.customer_name || 'Walk-in')}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1">
                                       <span className="text-[10px] text-slate-500 font-medium">{formatTime(order.created_at || order.timestamp)}</span>
                                       {order.order_number && <span className="text-[9px] text-slate-600 font-mono">#{order.order_number.slice(-4)}</span>}
                                    </div>
                                 </div>

                                 {/* Stats & Progress */}
                                 <div className="space-y-2">
                                    <div className="flex justify-between items-end">
                                       <div className="flex flex-col">
                                          <span className="text-[8px] text-slate-600 uppercase font-black tracking-tighter">Live Status</span>
                                          <span className={`text-[10px] font-black uppercase ${statusStyle.color}`}>
                                             {statusStyle.label}
                                          </span>
                                       </div>
                                       <div className="text-right">
                                          <span className="text-[10px] font-mono font-bold text-white">Rs. {order.total.toLocaleString()}</span>
                                       </div>
                                    </div>

                                    {/* Progress Bar Container */}
                                    <div className="h-1.5 bg-slate-800/50 rounded-full overflow-hidden flex gap-0.5 p-0.5">
                                       {[1, 2, 3, 4].map((step) => {
                                          const stepProgress = step * 25;
                                          const isActive = progress >= stepProgress;
                                          return (
                                             <div
                                                key={step}
                                                className={`flex-1 h-full rounded-sm transition-all duration-500 ${isActive ? (cancelledStatuses.includes(order.status) ? 'bg-rose-500' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]') : 'bg-slate-700/30'}`}
                                             />
                                          );
                                       })}
                                    </div>
                                 </div>

                                 {/* Action Row - Visible when selected */}
                                 {selectedOrder?.id === order.id && (
                                    <div className="pt-2">
                                       <button
                                          onClick={(e) => { e.stopPropagation(); handleEditOrder(order); }}
                                          className="w-full py-2 bg-gradient-to-r from-gold-600 to-gold-400 text-black text-[10px] font-black uppercase tracking-widest rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-gold-500/20 active:scale-95 transition-transform"
                                       >
                                          <Receipt size={12} /> Recall to POS
                                       </button>
                                    </div>
                                 )}
                              </div>
                           </div>
                        );
                     })}
                  </div>
               ) : (
                  /* LIST VIEW: Ultra Dense Table */
                  <div className="bg-[#0B0F19]/30 rounded-xl border border-slate-800/50 overflow-hidden backdrop-blur-sm">
                     <table className="w-full text-left border-collapse">
                        <thead>
                           <tr className="border-b border-slate-800 bg-slate-900/40">
                              <th className="px-6 py-4 text-[9px] font-black uppercase text-slate-500 tracking-widest">Order / Token</th>
                              <th className="px-6 py-4 text-[9px] font-black uppercase text-slate-500 tracking-widest">Type</th>
                              <th className="px-6 py-4 text-[9px] font-black uppercase text-slate-500 tracking-widest">Destination</th>
                              <th className="px-6 py-4 text-[9px] font-black uppercase text-slate-500 tracking-widest">Time</th>
                              <th className="px-6 py-4 text-[9px] font-black uppercase text-slate-500 tracking-widest">Live Status</th>
                              <th className="px-6 py-4 text-[9px] font-black uppercase text-slate-500 tracking-widest text-right">Settlement</th>
                              <th className="px-6 py-4 text-center"><MoreHorizontal size={14} className="text-slate-600 inline" /></th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                           {filteredOrders.map((order) => {
                              const table = tables.find(t => t.id === order.table_id);
                              const token = order.takeaway_orders?.[0]?.token_number || (order as any).token_number;
                              const statusStyle = getCompositeStatus(order.status, order.payment_status);
                              const progress = getProgress(order);

                              return (
                                 <tr
                                    key={order.id}
                                    onClick={() => setSelectedOrder(order)}
                                    className={`group cursor-pointer transition-colors ${selectedOrder?.id === order.id ? 'bg-gold-500/5 shadow-inner' : 'hover:bg-white/5'}`}
                                 >
                                    <td className="px-6 py-3 whitespace-nowrap">
                                       <div className="flex flex-col">
                                          <span className="text-xs font-bold text-white tracking-tight">#{order.order_number?.slice(-6) || '---'}</span>
                                          {token && <span className="text-[10px] text-gold-500 font-black">#{token}</span>}
                                       </div>
                                    </td>
                                    <td className="px-6 py-3">
                                       <div className="flex items-center gap-2">
                                          <div className="p-1.5 rounded-md bg-slate-900 border border-slate-800 text-slate-500">
                                             {getTypeIcon(order.type)}
                                          </div>
                                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{order.type.split('_')[0]}</span>
                                       </div>
                                    </td>
                                    <td className="px-6 py-3">
                                       <span className="text-xs font-bold text-slate-200">
                                          {order.type === 'DINE_IN' ? (table?.name || 'T-?') : (order.customerName || order.customer_name || 'Walk-in')}
                                       </span>
                                    </td>
                                    <td className="px-6 py-3 text-xs font-medium text-slate-500 italic">
                                       {formatTime(order.created_at || order.timestamp)}
                                    </td>
                                    <td className="px-6 py-3">
                                        <div className="flex flex-col gap-1.5 w-32">
                                           <div className={`text-[9px] font-black uppercase tracking-widest ${statusStyle.color}`}>
                                              {statusStyle.label}
                                           </div>
                                          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                                             <div
                                                className={`h-full transition-all duration-500 ${cancelledStatuses.includes(order.status) ? 'bg-rose-500' : 'bg-emerald-500'}`}
                                                style={{ width: `${progress}%` }}
                                             />
                                          </div>
                                       </div>
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                       <span className="text-xs font-mono font-black text-white">Rs. {order.total.toLocaleString()}</span>
                                    </td>
                                    <td className="px-6 py-3 text-center">
                                       <button
                                          onClick={(e) => { e.stopPropagation(); handleEditOrder(order); }}
                                          className="p-2 hover:bg-gold-500 hover:text-black rounded-lg transition-all text-gold-500"
                                       >
                                          <Receipt size={14} />
                                       </button>
                                    </td>
                                 </tr>
                              );
                           })}
                        </tbody>
                     </table>
                  </div>
               )}
            </div>
         </div>

         {/* RIGHT PANE: DETAILS */}
         {selectedOrder && (
            <div className="w-full lg:w-[480px] bg-[#0B0F19] border-l border-slate-800 flex flex-col shrink-0 absolute inset-0 lg:static z-20 shadow-2xl">

               {/* Detail Header */}
               <div className="p-8 border-b border-slate-800 flex justify-between items-start bg-slate-950/50">
                  <div className="space-y-2">
                     <button onClick={() => setSelectedOrder(null)} className="lg:hidden mb-4 flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-widest hover:text-white transition-colors"><ArrowRight className="rotate-180" size={14} /> Back to List</button>
                     <div className="flex items-center gap-3">
                        <div className="p-2 bg-gold-500/10 rounded-lg text-gold-500">
                           <History size={20} />
                        </div>
                        <h3 className="text-2xl font-serif font-bold text-white tracking-tight">Timeline Entry</h3>
                     </div>
                     <p className="text-xs text-slate-500 font-mono">Reference: {selectedOrder.id}</p>
                  </div>
                  <button onClick={() => setSelectedOrder(null)} className="hidden lg:block p-2 hover:bg-slate-800 rounded-full text-slate-500 transition-colors"><ArrowRight size={24} /></button>
               </div>

               {/* Detail Content */}
               <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-10">

                  {/* High Fidelity Status Card */}
                   <div className="relative group">
                      <div className={`p-6 rounded-2xl border flex items-center gap-5 transition-all duration-500 ${getCompositeStatus(selectedOrder.status, selectedOrder.payment_status).bg} ${getCompositeStatus(selectedOrder.status, selectedOrder.payment_status).color} border-current/20`}>
                         <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shadow-inner">
                            {selectedOrder.payment_status === 'PAID' ? <CheckCircle2 size={32} /> : cancelledStatuses.includes(selectedOrder.status as string) ? <XCircle size={32} /> : <Timer size={32} />}
                         </div>
                         <div>
                            <div className="font-black uppercase tracking-[0.2em] text-[10px] opacity-70 mb-1">State Configuration</div>
                            <div className="font-serif text-2xl font-bold">{getCompositeStatus(selectedOrder.status, selectedOrder.payment_status).label}</div>
                         </div>
                      </div>
                   </div>

                  {/* Financial Architecture */}
                  <div className="space-y-6">
                     <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] flex items-center gap-3">
                        <div className="h-px flex-1 bg-slate-800"></div>
                        Financials
                        <div className="h-px flex-1 bg-slate-800"></div>
                     </h4>

                     <div className="bg-slate-900/40 rounded-3xl p-6 space-y-4 border border-slate-800 shadow-inner">
                        <div className="flex justify-between items-center text-sm">
                           <span className="text-slate-400 font-medium">Gross Subtotal</span>
                           <span className="text-white font-mono">Rs. {(selectedOrder.breakdown?.subtotal || (selectedOrder.order_items || []).reduce((sum, i) => sum + Number(i.total_price || Number(i.unit_price) * i.quantity || 0), 0) || 0).toLocaleString()}</span>
                        </div>

                        {(selectedOrder.tax !== undefined && selectedOrder.tax > 0) && (
                           <div className="flex justify-between items-center text-sm">
                              <span className="text-slate-400 font-medium">Tax Calculation</span>
                              <span className="text-rose-400 font-mono">+Rs. {selectedOrder.tax.toLocaleString()}</span>
                           </div>
                        )}

                        {(selectedOrder.service_charge !== undefined && selectedOrder.service_charge > 0) && (
                           <div className="flex justify-between items-center text-sm">
                              <span className="text-slate-400 font-medium">Service Premium</span>
                              <span className="text-blue-400 font-mono">+Rs. {selectedOrder.service_charge.toLocaleString()}</span>
                           </div>
                        )}

                        {selectedOrder.type === 'DELIVERY' && (
                           <div className="flex justify-between items-center text-sm">
                              <span className="text-slate-400 font-medium">Logistics Fee</span>
                              <span className="text-amber-400 font-mono">+Rs. {selectedOrder.delivery_fee || 0}</span>
                           </div>
                        )}

                        <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                           <div className="flex flex-col">
                              <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Grand Total</span>
                              <span className="text-white text-xs font-medium opacity-50">Settlement Currency: PKR</span>
                           </div>
                           <div className="text-3xl font-serif font-bold text-gold-500">
                              <span className="text-sm font-sans mr-1 opacity-50">Rs.</span>
                              {selectedOrder.total.toLocaleString()}
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* Core Content Analysis */}
                  <div className="space-y-6">
                     <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] flex items-center gap-3">
                        <div className="h-px flex-1 bg-slate-800"></div>
                        Order Contents
                        <div className="h-px flex-1 bg-slate-800"></div>
                     </h4>

                     <div className="space-y-3">
                        {(selectedOrder.order_items || (selectedOrder as any).items || []).map((item: any, idx: number) => (
                           <div key={idx} className="group bg-slate-900/20 hover:bg-slate-900/40 border border-slate-800/50 rounded-2xl p-4 flex justify-between items-center transition-all">
                              <div className="flex gap-4">
                                 <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-sm font-bold text-gold-500 shadow-lg">
                                    {item.quantity}x
                                 </div>
                                 <div className="space-y-0.5">
                                    <div className="text-sm text-slate-200 font-bold group-hover:text-white transition-colors tracking-tight">
                                       {item.item_name || 'Unknown Item'}
                                    </div>
                                    <div className="flex items-center gap-2">
                                       <div className={`w-1.5 h-1.5 rounded-full ${item.item_status === 'SERVED' ? 'bg-emerald-500' : 'bg-gold-500'}`}></div>
                                       <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{item.item_status || item.status || 'PROCESSED'}</div>
                                    </div>
                                 </div>
                              </div>
                              <div className="text-sm font-mono text-slate-400 font-bold">
                                 {(Number(item.unit_price || item.price) * item.quantity).toLocaleString()}
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>

                  {/* Technical Metadata */}
                  <div className="space-y-6 pb-12">
                     <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] flex items-center gap-3">
                        <div className="h-px flex-1 bg-slate-800"></div>
                        Metadata Overview
                        <div className="h-px flex-1 bg-slate-800"></div>
                     </h4>

                     <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800 hover:border-slate-700 transition-colors">
                           <span className="block text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1 opacity-60">Logistics Type</span>
                           <div className="flex items-center gap-2 text-white font-bold">
                              {getTypeIcon(selectedOrder.type)}
                              <span className="tracking-tight uppercase text-sm">{selectedOrder.type.replace(/_/g, ' ')}</span>
                           </div>
                        </div>

                        <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800 hover:border-slate-700 transition-colors">
                           <span className="block text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1 opacity-60">Temporal Stamp</span>
                           <div className="flex items-center gap-2 text-white font-bold">
                              <Clock size={14} className="text-gold-500" />
                              <span className="text-sm">{new Date(selectedOrder.created_at || selectedOrder.timestamp || 0).toLocaleDateString()}</span>
                           </div>
                        </div>

                        {(selectedOrder.customer_phone || selectedOrder.customerPhone) && (
                           <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800 hover:border-slate-700 transition-colors col-span-2">
                              <span className="block text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1 opacity-60">Signal Origin (Phone)</span>
                              <div className="flex items-center gap-2 text-white font-bold font-mono">
                                 <Wallet size={14} className="text-emerald-500" />
                                 <span className="text-lg">{selectedOrder.customer_phone || selectedOrder.customerPhone}</span>
                              </div>
                           </div>
                        )}

                        {(selectedOrder.delivery_address || (selectedOrder as any).deliveryAddress) && (
                           <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800 hover:border-slate-700 transition-colors col-span-2">
                              <span className="block text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1 opacity-60">Terminal Destination</span>
                              <div className="flex items-start gap-2 text-white text-sm leading-relaxed">
                                 <Truck size={14} className="text-blue-500 mt-1 shrink-0" />
                                 <span>{selectedOrder.delivery_address || (selectedOrder as any).deliveryAddress}</span>
                              </div>
                           </div>
                        )}

                        {selectedOrder.last_action_by && (
                           <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800 hover:border-slate-700 transition-colors col-span-2">
                              <span className="block text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1 opacity-60">Last System Intervention</span>
                              <div className="flex items-center gap-2 text-slate-300 text-xs italic">
                                 <HandCoins size={14} className="text-purple-500" />
                                 <span>{selectedOrder.last_action_desc || 'Standard transaction processing'}</span>
                              </div>
                           </div>
                        )}
                     </div>
                  </div>

               </div>

               {/* Command Override */}
               <div className="p-6 border-t border-slate-800 bg-slate-950/80 backdrop-blur-sm space-y-3">
                  <div className="flex gap-3">
                     <button
                        onClick={() => setShowPrintModal(true)}
                        className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-white font-black uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 active:scale-95"
                     >
                        <Printer size={18} /> Print
                     </button>
                     
                     {activeStatuses.includes(selectedOrder.status as string) ? (
                        <button
                           onClick={() => handleEditOrder(selectedOrder)}
                           className="flex-[2] py-4 bg-gradient-to-r from-gold-600 to-gold-400 text-slate-950 font-black uppercase tracking-[0.2em] rounded-xl hover:from-gold-500 hover:to-gold-300 transition-all shadow-xl shadow-gold-500/10 flex items-center justify-center gap-3 active:scale-95"
                        >
                           <Receipt size={18} /> Recall
                        </button>
                     ) : (
                        ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(currentUser?.role || '') && (
                           <button
                              onClick={() => handleUnlockOrder(selectedOrder)}
                              className="flex-[2] py-4 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-black uppercase tracking-[0.2em] rounded-xl hover:bg-indigo-500/20 transition-all shadow-xl flex items-center justify-center gap-3 active:scale-95"
                           >
                              <Unlock size={18} /> Unlock
                           </button>
                        )
                     )}
                  </div>

                  {/* Destructive Actions (Admin/Manager Only) */}
                  {['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(currentUser?.role || '') && (
                     <div className="flex gap-3 pt-2">
                        <button
                           onClick={() => handleVoidOrder(selectedOrder)}
                           className="flex-1 py-3 bg-red-900/10 hover:bg-red-900/20 text-red-500 border border-red-500/20 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2"
                        >
                           <Slash size={14} /> Void
                        </button>
                        <button
                           onClick={() => handleDeleteOrder(selectedOrder)}
                           className="flex-1 py-3 bg-slate-900 hover:bg-red-500 hover:text-white border border-slate-800 text-slate-500 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2"
                        >
                           <Trash2 size={14} /> Delete
                        </button>
                     </div>
                  )}
               </div>

               {/* Print Modal */}
               <ReceiptPreviewModal 
                  isOpen={showPrintModal}
                  onClose={() => setShowPrintModal(false)}
                  order={selectedOrder}
                  title={`Order #${selectedOrder.order_number || selectedOrder.id.slice(-6)}`}
               />
            </div>
         )}
      </div>
   );
};
