import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../client/App';
import {
  OrderStatus,
  OrderType
} from '../../shared/types';
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
  Ban,
  Lock,
  FileText
} from 'lucide-react';

// Custom components from your UI library
import { Modal } from '../../shared/ui/Modal';
import { Button } from '../../shared/ui/Button';

export const OrdersView: React.FC = () => {
  const {
    orders,
    sections,
    setActiveView,
    setOrderToEdit,
    currentUser,
    voidOrder,
    cancelOrder
  } = useAppContext();

  const [viewMode, setViewMode] = useState<'TICKETS' | 'COLLECTIONS'>('TICKETS');
  const [searchQuery, setSearchQuery] = useState('');
  const [cancellingOrder, setCancellingOrder] = useState<any | null>(null);
  const [cancellationReason, setCancellationReason] = useState('Customer changed mind');
  const [isVoiding, setIsVoiding] = useState(false);
  const [managerPin, setManagerPin] = useState('');
  const [showPinEntry, setShowPinEntry] = useState(false);
  const [pendingAction, setPendingAction] = useState<() => void>(() => { });

  // --- LOGIC: PROGRESS CALCULATOR ---
  const getProgressStats = (status: OrderStatus) => {
    const map = {
      [OrderStatus.DRAFT]: { width: '10%', color: 'bg-slate-700' },
      [OrderStatus.CONFIRMED]: { width: '25%', color: 'bg-blue-500' },
      [OrderStatus.FIRED]: { width: '35%', color: 'bg-orange-600' },
      [OrderStatus.PREPARING]: { width: '50%', color: 'bg-gold-500' },
      [OrderStatus.READY]: { width: '75%', color: 'bg-green-500' },
      [OrderStatus.SERVED]: { width: '90%', color: 'bg-indigo-500' },
      [OrderStatus.COMPLETED]: { width: '100%', color: 'bg-emerald-600' },
      [OrderStatus.CANCELLED]: { width: '100%', color: 'bg-red-600' },
      [OrderStatus.VOIDED]: { width: '100%', color: 'bg-red-800' },
      [OrderStatus.BILL_REQUESTED]: { width: '85%', color: 'bg-purple-500' },
    };
    return (map as any)[status] || { width: '0%', color: 'bg-slate-500' };
  };

  // --- LOGIC: ADVANCED FILTERING ---
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // 1. View Mode Filter
      if (viewMode === 'COLLECTIONS') {
        const isDelivery = order.type === 'DELIVERY';
        const needsSettlement = order.is_settled_with_rider === false;
        return isDelivery && needsSettlement;
      }

      // 2. Search Filter (Search Table Name, Customer, or ID)
      const searchLower = (searchQuery || '').toLowerCase();
      const tableName = order.table?.name || '';
      const sectionName = sections.find(s => s.id === order.table?.section_id)?.name || '';
      const customerName = order.customer_name || order.takeaway_orders?.[0]?.customer_name || order.delivery_orders?.[0]?.customer_name || '';
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
    if (order.type === 'DELIVERY' && [OrderStatus.READY, OrderStatus.COMPLETED].includes(order.status)) {
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
                          {order.type === 'DINE_IN' && <Utensils size={14} className="text-blue-400" />}
                          {order.type === 'TAKEAWAY' && <ShoppingBag size={14} className="text-yellow-400" />}
                          {order.type === 'DELIVERY' && <Truck size={14} className="text-green-400" />}
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
                          {order.customer_name || 'Walk-in'}
                        </span>
                        {order.type === 'TAKEAWAY' ? (
                          <div className="flex items-center gap-1.5 bg-green-500/10 text-green-500 px-2 py-1 rounded-md text-[10px] font-black uppercase border border-green-500/20">
                            <ShoppingBag size={12} />
                            Token {order.takeaway_orders?.[0]?.token_number}
                          </div>
                        ) : order.type === 'DELIVERY' ? (
                          <div className="flex items-center gap-1.5 bg-blue-500/10 text-blue-500 px-2 py-1 rounded-md text-[10px] font-black uppercase border border-blue-500/20">
                            <Truck size={12} />
                            Rider {order.delivery_orders?.[0]?.driver_id?.split('-').pop() || 'Unassigned'}
                          </div>
                        ) : order.type === 'DINE_IN' ? (
                          <div className="flex items-center gap-1.5 bg-slate-800 text-slate-400 px-2 py-1 rounded-md text-[10px] font-black uppercase border border-slate-700">
                            <Utensils size={12} />
                            Table {order.table?.name || 'Walk-in'}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 bg-slate-800 text-slate-400 px-2 py-1 rounded-md text-[10px] font-black uppercase border border-slate-700">
                            <FileText size={12} />
                            {order.type}
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-slate-500">
                          <MapPin size={10} />
                          <span className="text-[10px] uppercase font-bold">{section?.name || 'Main Hall'}</span>
                        </div>
                      </div>
                    </td>

                    {/* Assignment */}
                    <td className="py-5 border-y border-slate-800/50 group-hover:border-slate-700">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
                          <User size={16} />
                        </div>
                        <div>
                          <p className="text-xs font-black text-white uppercase tracking-tight">
                            {order.dine_in_orders?.[0]?.waiter_id ? 'Waiter Assigned' : order.delivery_orders?.[0]?.driver_id ? 'Rider Assigned' : 'System'}
                          </p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                            Auto Assigned
                          </p>
                        </div>
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
                            Float: Rs. {Number(order.delivery_orders?.[0]?.float_given || 0)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-5 text-right pr-4 last:rounded-r-2xl border-y border-r border-slate-800/50 group-hover:border-slate-700">
                      <div className="flex justify-end gap-2 px-2">
                        <button
                          title="View/Edit"
                          onClick={(e) => { e.stopPropagation(); handleOrderClick(order); }}
                          className="h-9 w-9 flex items-center justify-center bg-slate-800 text-slate-400 hover:text-gold-500 hover:bg-slate-700 rounded-xl transition-all shadow-lg active:scale-90"
                        >
                          <Edit2 size={16} />
                        </button>

                        <button
                          title="Void Order"
                          onClick={(e) => {
                            e.stopPropagation();
                            const action = () => {
                              setCancellingOrder(order);
                              setIsVoiding(true);
                            };
                            if (currentUser?.role === 'MANAGER' || currentUser?.role === 'SUPER_ADMIN') {
                              action();
                            } else {
                              setPendingAction(() => action);
                              setShowPinEntry(true);
                            }
                          }}
                          className="h-9 w-9 flex items-center justify-center bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all shadow-lg active:scale-90 border border-red-500/20"
                        >
                          <Ban size={16} />
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

      {/* Cancellation/Void Modal */}
      <Modal
        isOpen={!!cancellingOrder}
        onClose={() => { setCancellingOrder(null); setIsVoiding(false); setCancellationReason('Customer changed mind'); }}
        title={isVoiding ? "SECURITY: VOID TRANSACTION" : "CANCEL ORDER"}
        size="sm"
      >
        <div className="p-6 space-y-6">
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-4">
            <AlertCircle className="text-red-500 mt-1" size={20} />
            <div>
              <p className="text-sm font-black text-white uppercase tracking-tight">Warning: Destructive Action</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 leading-relaxed">
                {isVoiding
                  ? "Voiding will reverse financials and release any locked assets. This action is permanently logged."
                  : "Cancelling will stop production and release associated table/token."}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Reason for {isVoiding ? 'Void' : 'Cancellation'}</label>
            <select
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-bold focus:border-gold-500 transition-all outline-none"
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
            >
              <option>Customer changed mind</option>
              <option>Kitchen mistake</option>
              <option>Wrong table selection</option>
              <option>Payment failed</option>
              <option>Duplicate order</option>
              <option>Test order</option>
              <option>Other (Manual Entry)</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-black uppercase tracking-widest text-[10px] py-4 rounded-xl"
              onClick={() => setCancellingOrder(null)}
            >
              Back
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest text-[10px] py-4 rounded-xl shadow-xl shadow-red-900/40"
              onClick={async () => {
                if (isVoiding) {
                  await voidOrder(cancellingOrder.id, cancellationReason, 'Direct Void from Hub', 'N/A', managerPin);
                } else {
                  await cancelOrder(cancellingOrder.id, cancellationReason);
                }
                setCancellingOrder(null);
                setIsVoiding(false);
                setManagerPin('');
              }}
            >
              Confirm {isVoiding ? 'Void' : 'Cancel'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Manager PIN Entry Modal */}
      <Modal
        isOpen={showPinEntry}
        onClose={() => { setShowPinEntry(false); setManagerPin(''); }}
        title="MANAGER AUTHORIZATION"
        size="sm"
      >
        <div className="p-8 text-center space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gold-500/10 border border-gold-500/20 text-gold-500 mb-2">
            <Lock size={40} />
          </div>
          <div>
            <h3 className="text-xl font-black text-white uppercase tracking-tight">Security Override</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2">Enter Manager Security PIN</p>
          </div>

          <input
            type="password"
            autoFocus
            maxLength={6}
            className="w-full bg-black/40 border-2 border-slate-800 rounded-2xl px-6 py-4 text-3xl text-center font-black tracking-[0.5em] text-gold-500 focus:border-gold-500 transition-all outline-none"
            value={managerPin}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '');
              setManagerPin(val);
              if (val.length === 6 || val.length === 4) {
                // Potential auto-submit? Let's keep manual for safety
              }
            }}
          />

          <div className="flex gap-3">
            <Button
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-black"
              onClick={() => setShowPinEntry(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={managerPin.length < 4}
              className="flex-1 bg-gold-500 hover:bg-gold-400 text-black font-black uppercase tracking-widest"
              onClick={async () => {
                // Verify PIN
                try {
                  const res = await fetch('/api/auth/verify-pin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pin: managerPin, requiredRole: 'MANAGER' })
                  });
                  if (res.ok) {
                    setShowPinEntry(false);
                    pendingAction();
                  } else {
                    alert('Invalid Manager PIN');
                    setManagerPin('');
                  }
                } catch (e) {
                  alert('Verification failed');
                }
              }}
            >
              Authorize
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};