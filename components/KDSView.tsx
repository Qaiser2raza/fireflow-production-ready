import React, { useEffect, useState, useMemo } from 'react';
import { useAppContext } from '../App';
import { Order, OrderStatus } from '../types';
import { Clock, AlertCircle, CheckCircle2, Circle, Loader2, ChefHat, Bike, ShoppingBag } from 'lucide-react';

export const KDSView: React.FC = () => {
  const { orders, updateOrderItemStatus, updateOrder, tables } = useAppContext();
  const [activeStation, setActiveStation] = useState<'ALL' | 'hot' | 'cold' | 'tandoor' | 'bar' | 'dessert'>('ALL');

  // --- REFINED BUSINESS LOGIC: KDS FILTERING ---
  const activeOrders = useMemo(() => {
    return orders.filter(o => {
      // 1. Terminal states and DRAFTS are never shown in KDS
      if (o.status === OrderStatus.PAID || o.status === OrderStatus.DELIVERED || o.status === OrderStatus.CANCELLED || o.status === OrderStatus.VOID || o.status === OrderStatus.DRAFT) {
        return false;
      }

      // 2. If the whole order is marked READY (meaning it's at the pass), remove from KDS
      if (o.status === OrderStatus.READY) {
        return false;
      }

      // 3. Station Specific Logic: Only show if there are items for THIS station that are NOT ready
      const hasUnfinishedStationItems = o.items.some(item => {
        const isCorrectStation = activeStation === 'ALL' || item.menuItem.station === activeStation;
        const isNotReady = item.status !== OrderStatus.READY && item.status !== OrderStatus.DELIVERED;
        return isCorrectStation && isNotReady;
      });

      return hasUnfinishedStationItems;
    }).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }, [orders, activeStation]);

  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const handleAllReady = async (order: Order) => {
    // Force items for the CURRENT station to READY
    const updatedItems = order.items.map(item => {
      const isRelevantStation = activeStation === 'ALL' || item.menuItem.station === activeStation;
      if (isRelevantStation) {
        return { ...item, status: OrderStatus.READY };
      }
      return item;
    });

    // Determine new overall order status
    const allItemsEverywhereReady = updatedItems.every(i => i.status === OrderStatus.READY || i.status === OrderStatus.DELIVERED);
    const newStatus = allItemsEverywhereReady ? OrderStatus.READY : OrderStatus.COOKING;

    // Persist change
    await updateOrder({
      ...order,
      items: updatedItems,
      status: newStatus
    });
  };

  return (
    <div className="h-full w-full bg-[#0B0F1A] p-4 flex flex-col overflow-hidden">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 px-2 gap-4">
        <div>
          <h1 className="text-slate-400 text-xl font-bold tracking-[0.2em] uppercase flex items-center gap-3">
            <span className="text-gold-500 animate-pulse">///</span> KITCHEN COMMAND
          </h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Real-time fulfillment Engine</p>
        </div>
        
        <div className="flex bg-slate-900/50 p-1 rounded-xl border border-slate-800 backdrop-blur-sm overflow-x-auto max-w-full">
          {[
            { id: 'ALL', label: 'Master View' },
            { id: 'hot', label: 'Grill/Hot' },
            { id: 'tandoor', label: 'Tandoor' },
            { id: 'cold', label: 'Pantry/Cold' },
            { id: 'bar', label: 'Beverage' },
            { id: 'dessert', label: 'Pastry' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveStation(tab.id as any)}
              className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap
                ${activeStation === tab.id 
                  ? 'bg-gold-500 text-slate-950 shadow-lg shadow-gold-500/20' 
                  : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800'}
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden no-scrollbar">
        <div className="flex h-full gap-5 min-w-max pb-4">
          {activeOrders.map(order => (
            <KDSTicket 
              key={order.id} 
              order={order} 
              stationFilter={activeStation}
              tables={tables}
              onAllReady={() => handleAllReady(order)} 
              onToggleItem={(idx, status) => updateOrderItemStatus(order.id, idx, status)}
            />
          ))}
          {activeOrders.length === 0 && (
            <div className="w-full h-full flex items-center justify-center text-slate-700 tracking-[0.5em] uppercase flex-col gap-6 animate-in fade-in duration-700">
              <ChefHat size={120} className="opacity-5" />
              <span className="text-sm font-black">Kitchen Clear</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const KDSTicket: React.FC<{ 
  order: Order; 
  stationFilter: string;
  tables: any[];
  onAllReady: () => void;
  onToggleItem: (idx: number, status: OrderStatus) => void;
}> = ({ order, stationFilter, tables, onAllReady, onToggleItem }) => {
  const elapsed = Math.floor((Date.now() - new Date(order.timestamp).getTime()) / 60000);
  
  let statusColor = 'bg-slate-800';
  if (elapsed > 15) statusColor = 'bg-red-600';
  else if (elapsed > 5) statusColor = 'bg-yellow-600';
  else statusColor = 'bg-green-600';

  // Logic to determine order source label - Resolve Table Name
  const getOrderIdentifier = () => {
    if (order.type === 'dine-in') {
      const table = tables.find(t => t.id === order.tableId || t.name === order.tableId);
      return table ? table.name : (order.tableId || 'WALK-IN');
    }
    if (order.type === 'delivery') return (
      <div className="flex items-center gap-2">
        <Bike size={18} className="text-white" />
        <span>DELIVERY</span>
      </div>
    );
    return (
      <div className="flex items-center gap-2">
        <ShoppingBag size={18} className="text-white" />
        <span>TAKEAWAY</span>
      </div>
    );
  };

  // Only show items for THIS station that are NOT ready
  const visibleItems = order.items.map((item, originalIndex) => ({...item, originalIndex})).filter(item => {
    const isCorrectStation = stationFilter === 'ALL' || item.menuItem.station === stationFilter;
    const isPending = item.status !== OrderStatus.READY && item.status !== OrderStatus.DELIVERED;
    return isCorrectStation && isPending;
  });

  const getNextStatus = (current: OrderStatus) => {
    if (current === OrderStatus.NEW) return OrderStatus.COOKING;
    if (current === OrderStatus.COOKING) return OrderStatus.READY;
    return current; 
  };

  return (
    <div className="w-80 h-full flex flex-col bg-slate-900/80 border-t-4 border-slate-700 rounded-b-xl shadow-2xl relative animate-in slide-in-from-right-4">
      <div className={`${statusColor} p-4 text-white flex justify-between items-center transition-colors duration-500 shrink-0`}>
        <div>
           <div className="font-black text-xl tracking-tight leading-none mb-1">
             {getOrderIdentifier()}
           </div>
           <div className="text-[10px] font-bold opacity-70 uppercase tracking-widest">Ref: #{order.id.split('-').pop()}</div>
        </div>
        <div className="flex items-center gap-2 font-mono text-sm bg-black/30 px-3 py-1.5 rounded-lg border border-white/10">
          <Clock size={14} /> {elapsed}m
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {visibleItems.map((item, idx) => (
          <div 
            key={idx} 
            onClick={() => onToggleItem(item.originalIndex, getNextStatus(item.status))}
            className="p-3 rounded-xl border border-slate-700 bg-slate-800/50 hover:border-gold-500/50 transition-all cursor-pointer active:scale-95"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                 {item.status === OrderStatus.COOKING ? <Loader2 size={18} className="text-yellow-500 animate-spin" /> : <Circle size={18} className="text-slate-600" />}
                 <span className="font-bold text-lg leading-tight tracking-tight text-slate-100">{item.menuItem.name}</span>
              </div>
              <div className="text-xl font-black shrink-0 text-gold-500">x{item.quantity}</div>
            </div>
            {item.notes && (
               <div className="bg-red-500/10 text-red-400 border border-red-500/20 p-2 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 mt-3">
                  <AlertCircle size={14} /> {item.notes}
               </div>
            )}
            <div className="mt-3 text-[9px] uppercase font-black tracking-widest text-slate-500 border border-slate-700 px-2 py-0.5 rounded w-fit">
               {item.status}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-slate-800 bg-slate-900/50 rounded-b-xl">
        <button 
          onClick={onAllReady}
          className="w-full h-14 rounded-xl uppercase tracking-[0.2em] font-black transition-all flex items-center justify-center gap-3 text-[11px] shadow-lg bg-green-600 hover:bg-green-500 text-white"
        >
          <CheckCircle2 size={18}/> {stationFilter === 'ALL' ? 'Mark Order Ready' : `Finish ${stationFilter}`}
        </button>
      </div>
    </div>
  );
};