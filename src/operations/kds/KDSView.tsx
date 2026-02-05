import React, { useEffect, useState, useMemo } from 'react';
import { useAppContext } from '../../client/App';
import { Order, OrderStatus, ItemStatus, Station } from '../../shared/types';
import { Clock, AlertCircle, CheckCircle2, ChefHat, Bike, ShoppingBag, CheckSquare, RotateCcw, Circle } from 'lucide-react';

export const KDSView: React.FC = () => {
  const { orders, updateOrder, stations, tables, addNotification } = useAppContext();
  const [activeStationId, setActiveStationId] = useState<string>('ALL');
  const [undoStack, setUndoStack] = useState<{ order: Order, items: any[], status: OrderStatus }[]>([]);
  const [showSafetyModal, setShowSafetyModal] = useState<{ show: boolean, order?: Order }>({ show: false });

  // Robust Station Matcher
  const isItemForStation = (item: any, stationId: string) => {
    if (stationId === 'ALL') return true;
    const stationObj = stations.find(s => s.id === stationId);
    return item.station_id === stationId || (stationObj && item.station === stationObj.name);
  };

  // Filter orders for KDS
  const kdsOrders = useMemo(() => {
    return orders.filter(o => {
      if ([OrderStatus.PAID, OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.VOID, OrderStatus.DRAFT].includes(o.status)) {
        return false;
      }
      return true;
    });
  }, [orders]);

  const activeOrders = useMemo(() => {
    return kdsOrders.filter(o => {
      const items = o.order_items || [];
      const hasVisibleItems = items.some(item => {
        const stationMatch = isItemForStation(item, activeStationId);
        const isNotReady = item.item_status !== ItemStatus.READY && item.item_status !== ItemStatus.SERVED;
        return stationMatch && isNotReady;
      });
      return hasVisibleItems;
    }).sort((a, b) => new Date(a.created_at || (a as any).timestamp || 0).getTime() - new Date(b.created_at || (b as any).timestamp || 0).getTime());
  }, [kdsOrders, activeStationId, stations]);

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    try {
      await updateOrder({
        ...last.order,
        order_items: last.items,
        status: last.status,
        last_action_desc: 'Undo last KDS action'
      });
      setUndoStack(prev => prev.slice(0, -1));
      addNotification('success', 'Action Reverted');
    } catch (e) {
      addNotification('error', 'Undo Failed');
    }
  };

  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const handleItemToggle = async (order: Order, itemIndex: number) => {
    const items = [...(order.order_items || [])];
    const item = items[itemIndex];

    let nextStatus: string;
    if (item.item_status === ItemStatus.FIRED || item.item_status === ItemStatus.PENDING) {
      nextStatus = ItemStatus.PREPARING;
    } else if (item.item_status === ItemStatus.PREPARING) {
      nextStatus = ItemStatus.READY;
    } else if (item.item_status === ItemStatus.READY) {
      nextStatus = ItemStatus.FIRED;
    } else {
      return;
    }

    const updatedItems = items.map((itm, idx) =>
      idx === itemIndex ? { ...itm, item_status: nextStatus } : itm
    );

    setUndoStack(prev => [...prev.slice(-10), { order, items: order.order_items || [], status: order.status }]);

    const allReady = updatedItems.every(i => i.item_status === ItemStatus.READY || i.item_status === ItemStatus.SERVED);
    const anyPreparing = updatedItems.some(i => i.item_status === ItemStatus.PREPARING);

    let orderStatus: OrderStatus = order.status;
    if (allReady) orderStatus = OrderStatus.READY;
    else if (anyPreparing) orderStatus = OrderStatus.PREPARING;
    else orderStatus = OrderStatus.FIRED;

    try {
      await updateOrder({
        ...order,
        order_items: updatedItems,
        status: orderStatus,
        last_action_desc: `Item ${item.item_name} marked as ${nextStatus}`
      });
    } catch (error) {
      addNotification('error', 'Update Failed');
    }
  };

  const confirmReadyAll = (order: Order) => {
    setShowSafetyModal({ show: true, order });
  };

  const handleReadyAll = async () => {
    if (!showSafetyModal.order) return;
    const order = showSafetyModal.order;
    const items = [...(order.order_items || [])];

    const updatedItems = items.map(item => {
      const isRelevant = isItemForStation(item, activeStationId);
      if (isRelevant && (item.item_status === ItemStatus.FIRED || item.item_status === ItemStatus.PREPARING || item.item_status === ItemStatus.PENDING)) {
        return { ...item, item_status: ItemStatus.READY };
      }
      return item;
    });

    const allReady = updatedItems.every(i => i.item_status === ItemStatus.READY || i.item_status === ItemStatus.SERVED);

    try {
      await updateOrder({
        ...order,
        order_items: updatedItems,
        status: allReady ? OrderStatus.READY : OrderStatus.PREPARING,
        last_action_desc: `Station items marked as READY`
      });
      setShowSafetyModal({ show: false });
      addNotification('success', 'Station Clearance Successful');
    } catch (error) {
      addNotification('error', 'Batch Update Failed');
    }
  };

  return (
    <div className="h-full w-full bg-[#020617] p-2 flex flex-col overflow-hidden">
      <div className="flex flex-col xl:flex-row justify-between items-center mb-4 px-2 gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gold-500 rounded-lg flex items-center justify-center text-black shadow-lg shadow-gold-500/20">
            <ChefHat size={18} />
          </div>
          <div>
            <h1 className="text-white text-xl font-serif tracking-tight leading-none">KDS ACTIVE</h1>
            <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Live Feed</p>
          </div>
        </div>

        <div className="flex flex-1 w-full xl:w-auto overflow-x-auto no-scrollbar items-center gap-2">
          <div className="flex bg-slate-900/40 p-1 rounded-xl border border-slate-800/50 backdrop-blur-xl items-center gap-1 mx-auto xl:mx-0">
            <button
              onClick={() => setActiveStationId('ALL')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap
                  ${activeStationId === 'ALL' ? 'bg-gold-500 text-slate-950 shadow-md' : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'}
                `}
            >
              Master
            </button>

            <div className="w-px h-4 bg-slate-800 mx-1"></div>

            <div className="flex gap-1">
              {stations.filter(s => s.is_active).map(station => (
                <button
                  key={station.id}
                  onClick={() => setActiveStationId(station.id)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap
                      ${activeStationId === station.id ? 'bg-white text-slate-950 shadow-md' : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'}
                    `}
                >
                  {station.name}
                </button>
              ))}
            </div>

            <div className="w-px h-4 bg-slate-800 mx-1"></div>

            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all text-slate-500 hover:text-white disabled:opacity-20 flex items-center gap-1.5 hover:bg-white/5"
            >
              <RotateCcw size={12} /> Recall
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-max">
          {activeOrders.map(order => (
            <KDSTicket
              key={order.id}
              order={order}
              activeStationId={activeStationId}
              stations={stations}
              tables={tables}
              onReadyAll={() => confirmReadyAll(order)}
              onToggleItem={(idx) => handleItemToggle(order, idx)}
            />
          ))}

          {activeOrders.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center opacity-30 grayscale py-20">
              <div className="w-32 h-32 border-4 border-dashed border-slate-700 rounded-full flex items-center justify-center mb-6">
                <ChefHat size={48} className="text-slate-700" />
              </div>
              <h2 className="text-4xl font-serif italic text-slate-600">Kitchen is Clear</h2>
              <p className="text-xs uppercase font-black tracking-[0.3em] text-slate-700 mt-4">Monitoring incoming "FIRE" events...</p>
            </div>
          )}
        </div>
      </div>

      {showSafetyModal.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/60 font-sans">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-900/20 rounded-2xl flex items-center justify-center text-red-500 mb-6 mx-auto">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-2xl text-white font-serif text-center mb-2">Station Clearance</h2>
            <p className="text-slate-400 text-center text-sm mb-8 leading-relaxed">
              Are you sure you want to mark all pending items for this station as <span className="text-green-500 font-bold uppercase tracking-widest">Ready</span>?
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowSafetyModal({ show: false })}
                className="flex-1 py-4 px-6 rounded-2xl bg-slate-800 text-slate-400 font-bold uppercase tracking-widest text-xs hover:bg-slate-700 transition-all border border-slate-700"
              >
                Negative
              </button>
              <button
                onClick={handleReadyAll}
                className="flex-1 py-4 px-6 rounded-2xl bg-green-600 text-white font-black uppercase tracking-widest text-xs hover:bg-green-500 transition-all shadow-xl shadow-green-900/40"
              >
                Confirm Ready
              </button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        .kds-card-vanish {
          animation: vanish 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        @keyframes vanish {
          0% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: translateY(-50px) scale(0.9); }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}} />
    </div>
  );
};

const KDSTicket: React.FC<{
  order: Order;
  activeStationId: string;
  stations: Station[];
  tables: any[];
  onReadyAll: () => void;
  onToggleItem: (idx: number) => void;
}> = ({ order, activeStationId, stations, tables, onReadyAll, onToggleItem }) => {
  const elapsed = Math.floor((Date.now() - new Date(order.created_at || (order as any).timestamp || Date.now()).getTime()) / 60000);
  const isUrgent = elapsed > 15;
  const isCritical = elapsed > 25;

  const isItemForStationInternal = (item: any, stationId: string) => {
    if (stationId === 'ALL') return true;
    const stationObj = stations.find(s => s.id === stationId);
    return item.station_id === stationId || (stationObj && item.station === stationObj.name);
  };

  const getIdentifier = () => {
    if (order.type === 'DINE_IN') {
      const table = tables.find(t => t.id === order.table_id);
      return table ? table.name : 'TABLE';
    }
    return order.type;
  };

  // Get takeaway token for display
  const getTakeawayToken = () => {
    if (order.type === 'TAKEAWAY' && order.takeaway_orders?.[0]?.token_number) {
      return order.takeaway_orders[0].token_number;
    }
    return null;
  };

  const takeawayToken = getTakeawayToken();

  const items = order.order_items || [];
  const visibleItems = items
    .map((item, originalIndex) => ({ ...item, originalIndex }))
    .filter(item => {
      return isItemForStationInternal(item, activeStationId) && item.item_status !== ItemStatus.SERVED;
    });

  if (visibleItems.length === 0) return null;

  return (
    <div className={`flex flex-col bg-slate-900 border-2 rounded-2xl shadow-2xl relative overflow-hidden transition-all duration-500 ${isCritical ? 'border-red-600 animate-pulse' : isUrgent ? 'border-orange-500' : 'border-slate-800'
      }`}>
      <div className={`p-4 flex justify-between items-start ${isCritical ? 'bg-red-600' : isUrgent ? 'bg-orange-500' : 'bg-slate-800'
        }`}>
        <div className="flex-1">
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/60 mb-1">
            #{order.id.split('-').pop()?.toUpperCase()}
          </div>
          <div className="font-serif text-2xl text-white leading-none mb-1">{getIdentifier()}</div>

          {/* Display Token Prominently for Takeaway */}
          {takeawayToken && (
            <div className="mt-2 inline-flex items-center gap-2 bg-gold-500/20 border-2 border-gold-500 px-3 py-1.5 rounded-xl">
              <ShoppingBag size={14} className="text-gold-500" />
              <span className="font-mono text-lg font-black text-gold-500 tracking-[0.2em]">
                {takeawayToken}
              </span>
            </div>
          )}
        </div>
        <div className={`flex items-center gap-2 font-mono text-xs px-3 py-1.5 rounded-xl backdrop-blur-md shadow-inner ${elapsed > 10 ? 'bg-black/40 text-white' : 'bg-white/10 text-white/90'
          }`}>
          <Clock size={14} /> <span className="font-bold">{elapsed}M</span>
        </div>
      </div>

      <div className="px-4 py-2 bg-black/20 flex justify-between items-center border-b border-white/5">
        <div className="flex gap-2">
          {order.type === 'DELIVERY' && <Bike size={12} className="text-gold-500" />}
          {order.type === 'TAKEAWAY' && <ShoppingBag size={12} className="text-gold-500" />}
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{order.type}</span>
        </div>
        <div className="text-[9px] font-bold text-slate-500">
          {new Date(order.created_at || (order as any).timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar max-h-[400px]">
        {visibleItems.map((item, idx) => (
          <div
            key={idx}
            onClick={() => onToggleItem(item.originalIndex)}
            className={`p-3 rounded-xl border transition-all duration-300 cursor-pointer group flex items-start gap-3 ${item.item_status === ItemStatus.READY
              ? 'bg-green-500/10 border-green-500/20 opacity-50'
              : item.item_status === ItemStatus.PREPARING
                ? 'bg-gold-500/10 border-gold-500/30 shadow-lg shadow-gold-500/5'
                : 'bg-slate-800/20 border-slate-700/50 hover:bg-slate-800/40'
              }`}
          >
            <div className="mt-0.5">
              {item.item_status === ItemStatus.READY ? (
                <CheckCircle2 size={18} className="text-green-500 animate-in zoom-in" />
              ) : item.item_status === ItemStatus.PREPARING ? (
                <CheckSquare size={18} className="text-gold-500 animate-in zoom-in" />
              ) : (
                <Circle size={18} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
              )}
            </div>

            <div className="flex-1">
              <div className="flex justify-between items-start gap-2">
                <span className={`text-sm font-bold leading-tight ${item.item_status === ItemStatus.READY ? 'text-slate-500 line-through' :
                  item.item_status === ItemStatus.PREPARING ? 'text-white' : 'text-slate-300'
                  }`}>
                  {item.menu_item?.name || item.item_name}
                </span>
                <span className={`text-lg font-black leading-none ${item.item_status === ItemStatus.READY ? 'text-green-500/50' : 'text-gold-500'
                  }`}>x{item.quantity}</span>
              </div>

              {item.special_instructions && (
                <div className="mt-1.5 text-[9px] text-orange-400/80 italic bg-orange-400/5 p-2 rounded-lg border border-orange-400/10">
                  {item.special_instructions}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-slate-900/80 border-t border-slate-800">
        <button
          onClick={onReadyAll}
          className="w-full h-12 rounded-xl bg-green-600 hover:bg-green-500 text-white font-black uppercase tracking-[0.2em] text-xs transition-all shadow-xl shadow-green-900/20 active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <CheckCircle2 size={18} /> Clear Station
        </button>
      </div>
    </div>
  );
};