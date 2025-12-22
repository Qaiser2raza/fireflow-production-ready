
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../App';
import { OrderStatus, Order, OrderType } from '../types';
import { 
  Search, 
  ClipboardList, 
  Wallet, 
  X,
  AlertCircle,
  Clock,
  ChevronRight,
  MoreVertical,
  Utensils,
  ShoppingBag,
  Truck,
  Eye,
  Trash2,
  Edit2
} from 'lucide-react';

import { OrderStatusBadge } from './order/OrderStatusBadge';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { OrderCard } from './order/OrderCard';
import { Badge } from './ui/Badge';

export const OrdersView: React.FC = () => {
  const { 
    orders, 
    setOrderToEdit, 
    setActiveView, 
    cancelOrder, 
    updateOrderStatus,
    tables
  } = useAppContext();

  const [viewMode, setViewMode] = useState<'TICKETS' | 'COLLECTIONS'>('TICKETS');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<Order | null>(null);
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');

  const filteredOrders = useMemo(() => {
    return orders
      .filter(o => {
        if (viewMode === 'COLLECTIONS') {
           return (o.status === OrderStatus.DELIVERED || o.status === OrderStatus.OUT_FOR_DELIVERY) && !o.isSettledWithRider;
        }
        
        const matchesStatus = filterStatus === 'ALL' 
           ? true
           : o.status === filterStatus;

        const searchLower = (searchQuery || '').toLowerCase();
        const table = tables.find(t => t.id === o.tableId || t.name === o.tableId);
        const tableName = table ? table.name : (o.tableId || '');

        return matchesStatus && (
          (o.id || '').toLowerCase().includes(searchLower) ||
          tableName.toLowerCase().includes(searchLower) ||
          (o.customerName || '').toLowerCase().includes(searchLower)
        );
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [orders, filterStatus, searchQuery, viewMode, tables]);

  const handleCancelConfirm = async () => {
    if (cancellingOrder && cancellationReason) {
      const success = await cancelOrder(cancellingOrder.id, cancellationReason);
      if (success) {
        setCancellingOrder(null);
        setCancellationReason('');
        setSelectedOrderForDetail(null);
      }
    }
  };

  const handleOrderClick = (order: Order) => {
    // INTELLIGENT ROUTING LOGIC
    if (order.type === 'delivery') {
      // If it's a delivery order and it's already prepared or shipped, go to Dispatch
      if ([OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED].includes(order.status)) {
        setActiveView('dispatch');
        return;
      }
    }
    
    // Otherwise (Dine-in, Takeaway, or "Editing" stage Delivery), go to POS
    setOrderToEdit(order);
    setActiveView('pos');
  };

  const getOrderTypeIcon = (type: OrderType) => {
    switch (type) {
      case 'dine-in': return <Utensils size={14} className="text-blue-400" />;
      case 'takeaway': return <ShoppingBag size={14} className="text-yellow-400" />;
      case 'delivery': return <Truck size={14} className="text-green-400" />;
      default: return null;
    }
  };

  const getProgressWidth = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.DRAFT: return '5%';
      case OrderStatus.NEW: return '25%';
      case OrderStatus.COOKING: return '50%';
      case OrderStatus.READY: return '75%';
      case OrderStatus.PAID: 
      case OrderStatus.DELIVERED: return '100%';
      default: return '0%';
    }
  };

  const getProgressColor = (status: OrderStatus) => {
     if (status === OrderStatus.CANCELLED || status === OrderStatus.VOID) return 'bg-red-500';
     if (status === OrderStatus.PAID || status === OrderStatus.DELIVERED) return 'bg-green-500';
     return 'bg-gold-500';
  };

  return (
    <div className="flex h-full w-full bg-slate-950 flex-col overflow-hidden">
      
      {/* Header Area */}
      <div className="h-20 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-6">
           <h1 className="text-xl font-serif text-white tracking-wide uppercase">Operational Log</h1>
           <div className="flex p-1 bg-slate-950 rounded-xl border border-slate-800">
              <button 
                onClick={() => setViewMode('TICKETS')}
                className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2
                  ${viewMode === 'TICKETS' ? 'bg-gold-500 text-slate-950 shadow-lg' : 'text-slate-500 hover:text-slate-300'}
                `}
              >
                <cite><ClipboardList size={14} /></cite> Ticket Stream
              </button>
              <button 
                onClick={() => setViewMode('COLLECTIONS')}
                className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 relative
                  ${viewMode === 'COLLECTIONS' ? 'bg-gold-500 text-slate-950 shadow-lg' : 'text-slate-500 hover:text-slate-300'}
                `}
              >
                <cite><Wallet size={14} /></cite> Collections
              </button>
           </div>
        </div>

        <div className="flex items-center gap-4">
           <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl w-64 focus-within:border-gold-500/50 transition-colors">
              <Search size={18} className="text-slate-600" />
              <input 
                className="bg-transparent border-none outline-none text-white text-sm placeholder-slate-600"
                placeholder="Search Logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
           </div>
          <button onClick={() => setActiveView('dashboard')} className="p-2 text-slate-500 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Main Content: List View */}
      <div className="flex-1 overflow-hidden flex flex-col">
         <div className="flex-1 overflow-y-auto px-8 py-4 custom-scrollbar">
           {filteredOrders.length === 0 ? (
             <div className="py-40 text-center text-slate-700 font-black uppercase tracking-[0.4em] opacity-30">
               No log entries found
             </div>
           ) : (
             <table className="w-full text-left border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <th className="px-4 py-2">Time</th>
                    <th className="px-4 py-2">Ref ID</th>
                    <th className="px-4 py-2">Protocol</th>
                    <th className="px-4 py-2">Source / Table</th>
                    <th className="px-4 py-2">Production Status</th>
                    <th className="px-4 py-2 text-right">Unit Total</th>
                    <th className="px-4 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(order => {
                    const table = tables.find(t => t.id === order.tableId || t.name === order.tableId);
                    const tableName = table ? table.name : (order.customerName || 'Walk-in');
                    
                    return (
                      <tr 
                        key={order.id} 
                        onClick={() => handleOrderClick(order)}
                        className="bg-slate-900/40 hover:bg-slate-900 border border-slate-800 rounded-xl transition-all cursor-pointer group"
                      >
                        <td className="px-4 py-4 first:rounded-l-xl border-y border-l border-slate-800/50 group-hover:border-slate-700">
                          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                            <cite><Clock size={12} /></cite>
                            {order.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="px-4 py-4 border-y border-slate-800/50 group-hover:border-slate-700">
                          <span className="text-gold-500 font-mono font-bold text-xs uppercase tracking-tight">
                            #{order.id.split('-').pop()}
                          </span>
                        </td>
                        <td className="px-4 py-4 border-y border-slate-800/50 group-hover:border-slate-700">
                           <div className="flex items-center gap-2">
                              {getOrderTypeIcon(order.type)}
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-slate-300 transition-colors">
                                {order.type}
                              </span>
                           </div>
                        </td>
                        <td className="px-4 py-4 border-y border-slate-800/50 group-hover:border-slate-700">
                          <div className="text-sm font-medium text-white truncate max-w-[120px]">
                            {tableName}
                          </div>
                        </td>
                        <td className="px-4 py-4 border-y border-slate-800/50 group-hover:border-slate-700 w-1/4">
                          <div className="space-y-1.5">
                             <div className="flex justify-between items-center px-1">
                                <span className={`text-[9px] font-black uppercase tracking-widest ${order.status === OrderStatus.DRAFT ? 'text-slate-600' : 'text-gold-500'}`}>
                                   {order.status}
                                </span>
                             </div>
                             <div className="h-1.5 w-full bg-slate-950 rounded-full border border-slate-800/50 overflow-hidden">
                                <div 
                                   className={`h-full transition-all duration-700 ease-out ${getProgressColor(order.status)}`} 
                                   style={{ width: getProgressWidth(order.status) }} 
                                />
                             </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right border-y border-slate-800/50 group-hover:border-slate-700 font-mono font-bold text-white">
                          Rs. {Math.round(order.total).toLocaleString()}
                        </td>
                        <td className="px-4 py-4 text-right last:rounded-r-xl border-y border-r border-slate-800/50 group-hover:border-slate-700">
                          <div className="flex justify-end gap-2">
                            <button 
                              className="p-2 bg-slate-800 text-slate-400 hover:text-gold-500 hover:bg-slate-700 rounded-lg transition-all"
                              title="Resolve Action"
                            >
                              <Edit2 size={14} />
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
      </div>

      {/* CANCELLATION MODAL */}
      <Modal
        isOpen={!!cancellingOrder}
        onClose={() => setCancellingOrder(null)}
        title="Void Log Sequence"
        size="sm"
        footer={
          <div className="flex gap-3 w-full">
            <Button variant="ghost" onClick={() => setCancellingOrder(null)} className="flex-1">Abort</Button>
            <Button 
              variant="danger" 
              disabled={!cancellationReason} 
              onClick={handleCancelConfirm}
              className="flex-1"
            >
              Finalize Void
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="bg-red-900/10 border border-red-500/20 p-4 rounded-xl flex items-start gap-3 text-red-400 text-xs leading-relaxed">
            <AlertCircle size={18} className="shrink-0" />
            <p>Initiating void sequence. This releases all inventory and cancels kitchen production. Enter reason to proceed.</p>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">CANCELLATION REASON</label>
            <textarea 
              autoFocus
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="e.g. Test entry, Guest change of mind"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-white text-sm outline-none focus:border-red-500 h-32 resize-none shadow-inner"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
