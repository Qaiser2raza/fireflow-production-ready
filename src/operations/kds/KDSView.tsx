import React, { useEffect, useState, useMemo } from 'react';
import { useAppContext } from '../../client/App';
import { Order, OrderStatus } from '../../shared/types';
import { Clock, AlertCircle, CheckCircle2, Circle, Loader2, ChefHat, Bike, ShoppingBag } from 'lucide-react';

export const KDSView: React.FC = () => {
  const { orders, updateOrder, tables, addNotification } = useAppContext();
  const [activeStation, setActiveStation] = useState<'ALL' | 'hot' | 'cold' | 'tandoor' | 'bar' | 'dessert'>('ALL');

  // --- REFINED BUSINESS LOGIC: KDS FILTERING ---
  const activeOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.status === OrderStatus.PAID ||
        o.status === OrderStatus.DELIVERED ||
        o.status === OrderStatus.CANCELLED ||
        o.status === OrderStatus.VOID ||
        o.status === OrderStatus.DRAFT ||
        o.status === OrderStatus.READY) {
        return false;
      }

      // Updated to use order_items and menu_item.station
      const items = o.order_items || [];
      const hasUnfinishedStationItems = items.some(item => {
        const station = item.menu_item?.station || 'hot';
        const isCorrectStation = activeStation === 'ALL' || station === activeStation;
        const isNotReady = item.item_status !== OrderStatus.READY;
        return isCorrectStation && isNotReady;
      });

      return hasUnfinishedStationItems;
    }).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [orders, activeStation]);

  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const handleItemToggle = async (order: Order, itemIndex: number) => {
    const items = order.order_items || [];
    const item = items[itemIndex];

    let nextStatus: OrderStatus;
    if (item.item_status === OrderStatus.NEW) {
      nextStatus = OrderStatus.COOKING;
    } else if (item.item_status === OrderStatus.COOKING) {
      nextStatus = OrderStatus.READY;
    } else {
      return;
    }

    const updatedItems = items.map((itm, idx) =>
      idx === itemIndex ? { ...itm, item_status: nextStatus } : itm
    );

    const allReady = updatedItems.every(i => i.item_status === OrderStatus.READY);
    const anyInProgress = updatedItems.some(i => i.item_status === OrderStatus.COOKING);

    let orderStatus: OrderStatus = OrderStatus.NEW;
    if (allReady) orderStatus = OrderStatus.READY;
    else if (anyInProgress) orderStatus = OrderStatus.COOKING;

    try {
      await updateOrder({
        ...order,
        order_items: updatedItems,
        status: orderStatus
      });
      addNotification('success', `Item marked as ${nextStatus.toLowerCase()}`);
    } catch (error) {
      addNotification('error', 'Failed to update item status');
    }
  };

  const handleAllReady = async (order: Order) => {
    const items = order.order_items || [];
    const updatedItems = items.map(item => {
      const station = item.menu_item?.station || 'hot';
      const isRelevantStation = activeStation === 'ALL' || station === activeStation;
      if (isRelevantStation && (item.item_status === OrderStatus.NEW || item.item_status === OrderStatus.COOKING)) {
        return { ...item, item_status: OrderStatus.READY };
      }
      return item;
    });

    const allItemsReady = updatedItems.every(i => i.item_status === OrderStatus.READY);

    try {
      await updateOrder({
        ...order,
        order_items: updatedItems,
        status: allItemsReady ? OrderStatus.READY : OrderStatus.COOKING
      });
      addNotification('success', allItemsReady ? 'Order complete' : 'Station items ready');
    } catch (error) {
      addNotification('error', 'Failed to update order status');
    }
  };

  return (
    <div className="h-full w-full bg-[#0B0F1A] p-4 flex flex-col overflow-hidden">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 px-2 gap-4">
        <div>
          <h1 className="text-slate-400 text-xl font-bold tracking-[0.2em] uppercase flex items-center gap-3">
            <span className="text-gold-500 animate-pulse">///</span> KITCHEN COMMAND
          </h1>
        </div>

        <div className="flex bg-slate-900/50 p-1 rounded-xl border border-slate-800 backdrop-blur-sm overflow-x-auto max-w-full">
          {['ALL', 'hot', 'tandoor', 'cold', 'bar', 'dessert'].map(id => (
            <button
              key={id}
              onClick={() => setActiveStation(id as any)}
              className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap
                ${activeStation === id ? 'bg-gold-500 text-slate-950' : 'text-slate-500 hover:text-slate-200'}
              `}
            >
              {id === 'ALL' ? 'Master' : id}
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
              onToggleItem={(idx) => handleItemToggle(order, idx)}
            />
          ))}
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
  onToggleItem: (idx: number) => void;
}> = ({ order, stationFilter, tables, onAllReady, onToggleItem }) => {
  const elapsed = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);

  const getOrderIdentifier = () => {
    if (order.type === 'DINE_IN') {
      const dineIn = order.dine_in_orders?.[0];
      const table = tables.find(t => t.id === dineIn?.table_id);
      return table ? table.name : 'TABLE';
    }
    return order.type;
  };

  const items = order.order_items || [];
  const visibleItems = items
    .map((item, originalIndex) => ({ ...item, originalIndex }))
    .filter(item => {
      const station = item.menu_item?.station || 'hot';
      const isCorrectStation = stationFilter === 'ALL' || station === stationFilter;
      return isCorrectStation && item.item_status !== OrderStatus.READY;
    });

  if (visibleItems.length === 0) return null;

  return (
    <div className="w-80 h-full flex flex-col bg-slate-900/80 border-t-4 border-slate-700 rounded-b-xl shadow-2xl relative">
      <div className={`p-4 text-white flex justify-between items-center ${elapsed > 15 ? 'bg-red-600' : 'bg-green-600'}`}>
        <div>
          <div className="font-black text-xl mb-1">{getOrderIdentifier()}</div>
          <div className="text-[10px] opacity-70">#{order.id.split('-').pop()}</div>
        </div>
        <div className="flex items-center gap-2 font-mono text-sm bg-black/30 px-3 py-1.5 rounded-lg">
          <Clock size={14} /> {elapsed}m
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {visibleItems.map((item, idx) => (
          <div
            key={idx}
            onClick={() => onToggleItem(item.originalIndex)}
            className="p-3 rounded-xl border border-slate-700 bg-slate-800/50 cursor-pointer"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {item.item_status === OrderStatus.COOKING ? (
                  <Loader2 size={18} className="text-yellow-500 animate-spin" />
                ) : (
                  <Circle size={18} className="text-slate-600" />
                )}
                <span className="font-bold text-slate-100">{item.menu_item?.name || item.item_name}</span>
              </div>
              <div className="text-xl font-black text-gold-500">x{item.quantity}</div>
            </div>
            <div className="mt-3 text-[9px] uppercase font-black text-slate-500">{item.item_status}</div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-slate-800">
        <button
          onClick={onAllReady}
          className="w-full h-14 rounded-xl bg-green-600 hover:bg-green-500 text-white font-black uppercase"
        >
          Mark Ready
        </button>
      </div>
    </div>
  );
};