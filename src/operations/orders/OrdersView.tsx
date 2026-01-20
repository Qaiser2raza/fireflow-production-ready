import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../client/App';
import { 
  OrderStatus, 
  OrderType, 
  ItemStatus 
} from '@prisma/client'; // Syncing with your Prisma Enums
import {
  Search,
  ClipboardList,
  Wallet,
  X,
  AlertCircle,
  Clock,
  Utensils,
  ShoppingBag,
  Truck,
  Edit2,
  MapPin,
  User,
  ArrowUpRight
} from 'lucide-react';

// Custom components from your UI library
import { Modal } from '../../shared/ui/Modal';
import { Button } from '../../shared/ui/Button';

export const ActivityLog: React.FC = () => {
  const {
    orders,
    setOrderToEdit,
    setActiveView,
    cancelOrder,
    tables,
    sections
  } = useAppContext();

  const [viewMode, setViewMode] = useState<'TICKETS' | 'COLLECTIONS'>('TICKETS');
  const [searchQuery, setSearchQuery] = useState('');
  const [cancellingOrder, setCancellingOrder] = useState<any | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');

  // --- LOGIC: PROGRESS CALCULATOR ---
  const getProgressStats = (status: OrderStatus) => {
    const map = {
      [OrderStatus.DRAFT]: { width: '10%', color: 'bg-slate-700' },
      [OrderStatus.CONFIRMED]: { width: '25%', color: 'bg-blue-500' },
      [OrderStatus.PREPARING]: { width: '50%', color: 'bg-gold-500' },
      [OrderStatus.READY]: { width: '75%', color: 'bg-orange-500' },
      [OrderStatus.SERVED]: { width: '90%', color: 'bg-indigo-500' },
      [OrderStatus.COMPLETED]: { width: '100%', color: 'bg-green-500' },
      [OrderStatus.CANCELLED]: { width: '100%', color: 'bg-red-600' },
      [OrderStatus.VOIDED]: { width: '100%', color: 'bg-red-800' },
      [OrderStatus.BILL_REQUESTED]: { width: '85%', color: 'bg-purple-500' },
    };
    return map[status] || { width: '0%', color: 'bg-slate-500' };
  };

  // --- LOGIC: ADVANCED FILTERING ---
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // 1. View Mode Filter
      if (viewMode === 'COLLECTIONS') {
        // Only show Delivery/Takeaway that isn't settled yet
        const isDelivery = order.type === OrderType.DELIVERY;
        const needsSettlement = order.delivery_order?.is_settled_with_rider === false;
        return isDelivery && needsSettlement;
      }

      // 2. Search Filter (Search Table Name, Customer, or ID)
      const searchLower = searchQuery.toLowerCase();
      const tableName = order.table?.name || '';
      const sectionName = sections.find(s => s.id === order.table?.section_id)?.name || '';
      const customerName = order.customer_name || order.takeaway_order?.customer_name || order.delivery_order?.customer_name || '';
      const orderId = order.id.split('-').pop() || '';

      return (
        orderId.toLowerCase().includes(searchLower) ||
        tableName.toLowerCase().includes(searchLower) ||
        customerName.toLowerCase().includes(searchLower) ||
        sectionName.toLowerCase().includes(searchLower)
      );
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [orders, searchQuery, viewMode, sections]);

  const handleOrderClick = (order: any) => {
    if (order.type === OrderType.DELIVERY && [OrderStatus.READY, OrderStatus.COMPLETED].includes(order.status)) {
      setActiveView('dispatch');
    } else {
      setOrderToEdit(order);
      setActiveView('pos');
    }
  };

  return (
    <div className="flex h-full w-full bg-slate-950 flex-col overflow-hidden font-sans">
      
      {/* Header Area */}
      <div className="h-20 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-6">
          <div className="space-y-1">
             <h1 className="text-xl font-bold text-white tracking-tight">CONTROL HUB</h1>
             <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Operational Stream</p>
          </div>
          
          <div className="flex p-1 bg-slate-950 rounded-xl border border-slate-800 ml-4">
            <button
              onClick={() => setViewMode('TICKETS')}
              className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${viewMode === 'TICKETS' ? 'bg-gold-500 text-slate-950' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <ClipboardList size={14} /> Ticket Stream
            </button>
            <button
              onClick={() => setViewMode('COLLECTIONS')}
              className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${viewMode === 'COLLECTIONS' ? 'bg-gold-500 text-slate-950' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Wallet size={14} /> Rider Cash
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl w-72 focus-within:border-gold-500/50 transition-colors">
            <Search size={16} className="text-slate-600" />
            <input
              className="bg-transparent border-none outline-none text-white text-sm placeholder-slate-600 w-full"
              placeholder="Filter by Table, Zone, or Phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button onClick={() => setActiveView('dashboard')} className="p-2 text-slate-500 hover:text-white transition-colors bg-slate-900 rounded-lg border border-slate-800">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar">
        {filteredOrders.length === 0 ? (
          <div className="py-40 text-center text-slate-700 font-black uppercase tracking-[0.4em] opacity-30">
            No Active Logs
          </div>
        ) : (
          <table className="w-full text-left border-separate border-spacing-y-3">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-4">
                <th className="pb-2 pl-4">Timestamp</th>
                <th className="pb-2">Reference</th>
                <th className="pb-2">Source & Zone</th>
                <th className="pb-2">Assignment</th>
                <th className="pb-2">Production Status</th>
                <th className="pb-2 text-right">Financials</th>
                <th className="pb-2 text-right pr-4">Control</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => {
                const stats = getProgressStats(order.status as OrderStatus);
                const section = sections.find(s => s.id === order.table?.section_id);
                
                return (
                  <tr 
                    key={order.id}
                    onClick={() => handleOrderClick(order)}
                    className="bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800 rounded-xl transition-all cursor-pointer group shadow-sm"
                  >
                    {/* Time */}
                    <td className="py-5 pl-4 first:rounded-l-2xl border-y border-l border-slate-800/50 group-hover:border-slate-700">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-xs text-white font-mono">
                          <Clock size={12} className="text-gold-500" />
                          {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <span className="text-[9px] text-slate-600 font-bold uppercase ml-5">
                          {new Date(order.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </td>

                    {/* ID */}
                    <td className="py-5 border-y border-slate-800/50 group-hover:border-slate-700">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-slate-950 border border-slate-800`}>
                          {order.type === OrderType.DINE_IN && <Utensils size={14} className="text-blue-400" />}
                          {order.type === OrderType.TAKEAWAY && <ShoppingBag size={14} className="text-yellow-400" />}
                          {order.type === OrderType.DELIVERY && <Truck size={14} className="text-green-400" />}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-white font-mono font-bold text-sm tracking-tighter">
                            #{order.id.split('-').pop()?.toUpperCase()}
                          </span>
                          <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{order.type}</span>
                        </div>
                      </div>
                    </td>

                    {/* Source / Table */}
                    <td className="py-5 border-y border-slate-800/50 group-hover:border-slate-700">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white uppercase tracking-tight">
                          {order.table?.name || order.takeaway_order?.token_number || order.customer_name || 'Walk-in'}
                        </span>
                        <div className="flex items-center gap-1 text-slate-500">
                          <MapPin size={10} />
                          <span className="text-[10px] uppercase font-bold">{section?.name || 'Main Hall'}</span>
                        </div>
                      </div>
                    </td>

                    {/* Assignment */}
                    <td className="py-5 border-y border-slate-800/50 group-hover:border-slate-700">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                          <User size={12} className="text-slate-400" />
                        </div>
                        <span className="text-xs text-slate-300 font-medium">
                          {order.assigned_waiter?.name || order.assigned_driver?.name || 'Waiting...'}
                        </span>
                      </div>
                    </td>

                    {/* Status Progress */}
                    <td className="py-5 border-y border-slate-800/50 group-hover:border-slate-700 w-64">
                      <div className="space-y-2 pr-8">
                        <div className="flex justify-between items-center">
                          <span className={`text-[9px] font-black uppercase tracking-[0.15em] ${stats.color.replace('bg-', 'text-')}`}>
                            {order.status}
                          </span>
                          <span className="text-[9px] text-slate-600 font-bold">{stats.width}</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden p-[1px] border border-slate-800/50">
                          <div
                            className={`h-full rounded-full transition-all duration-1000 ease-out ${stats.color}`}
                            style={{ width: stats.width }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Financials */}
                    <td className="py-5 text-right border-y border-slate-800/50 group-hover:border-slate-700">
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-bold text-white font-mono">
                          Rs. {Number(order.total).toLocaleString()}
                        </span>
                        {viewMode === 'COLLECTIONS' && (
                           <span className="text-[9px] text-orange-500 font-black uppercase">
                             Float: Rs. {Number(order.delivery_order?.float_given || 0)}
                           </span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-5 text-right pr-4 last:rounded-r-2xl border-y border-r border-slate-800/50 group-hover:border-slate-700">
                      <div className="flex justify-end gap-2">
                        <button className="h-8 w-8 flex items-center justify-center bg-slate-800 text-slate-400 hover:text-gold-500 hover:bg-slate-700 rounded-lg transition-all">
                          <Edit2 size={14} />
                        </button>
                        <button className="h-8 w-8 flex items-center justify-center bg-slate-800/50 text-slate-600 hover:text-white hover:bg-slate-800 rounded-lg">
                          <ArrowUpRight size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* RETAINED: CANCELLATION MODAL LOGIC (Hidden for brevity) */}
      <Modal isOpen={!!cancellingOrder} onClose={() => setCancellingOrder(null)} title="Void Log Sequence" size="sm">
         {/* ... (Your existing cancellation reason logic) ... */}
      </Modal>
    </div>
  );
};