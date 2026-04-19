import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useAppContext } from '../../client/App';
import { Order, Station } from '../../shared/types';
import { Clock, AlertCircle, CheckCircle2, ChefHat, Bike, ShoppingBag, CheckSquare, RotateCcw, Circle } from 'lucide-react';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';

export const KDSView: React.FC = () => {
  const { orders, cancelOrder, stations, tables, addNotification, currentUser, fetchInitialData, optimisticItemStatus, setOptimisticItemStatus } = useAppContext();
  const [activeStationId, setActiveStationId] = useState<string>('ALL');
  const [undoStack, setUndoStack] = useState<{ order: Order, items: any[], status: any }[]>([]);
  const [showSafetyModal, setShowSafetyModal] = useState<{ show: boolean, order?: Order }>({ show: false });
  const inFlightItems = useRef<Set<string>>(new Set());

  // Robust Station Matcher
  const isItemForStation = (item: any, stationId: string) => {
    if (stationId === 'ALL') return true;
    const stationObj = stations.find((s: any) => s.id === stationId);
    return item.station_id === stationId || (stationObj && item.station === stationObj.name);
  };

  // Filter orders for KDS
  const kdsOrders = useMemo(() => {
    return orders.filter((o: any) => {
      // v3.0 logic: Exclude finished or aborted orders
      if (['CLOSED', 'CANCELLED', 'VOIDED'].includes(o.status)) {
        return false;
      }
      return true;
    });
  }, [orders]);

  const activeOrders = useMemo(() => {
    return kdsOrders
      .map((o: Order) => ({
        ...o,
        order_items: (o.order_items || []).map((item: any) => ({
          ...item,
          item_status: item.id ? (optimisticItemStatus[item.id] || item.item_status) : item.item_status
        }))
      }))
      .filter((o: Order) => {
        const items = o.order_items || [];
        const hasVisibleItems = items.some((item: any) => {
          const stationMatch = isItemForStation(item, activeStationId);
          const isVisible = item.item_status === 'PENDING' || item.item_status === 'PREPARING';

          // Safety: ALL station shows even orphaned items
          if (activeStationId === 'ALL') return isVisible;
          return stationMatch && isVisible;
        });
        return hasVisibleItems;
      })
      .sort((a: Order, b: Order) => {
        const timeA = new Date(a.created_at || (a as any).timestamp || 0).getTime();
        const timeB = new Date(b.created_at || (b as any).timestamp || 0).getTime();
        return timeA - timeB;
      });
  }, [kdsOrders, activeStationId, stations, optimisticItemStatus]);

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    const order = last.order;

    setOptimisticItemStatus(prev => {
      const next = { ...prev };
      last.items.filter(item => item.id).forEach(item => {
        next[item.id] = item.item_status;
      });
      return next;
    });

    try {
      await Promise.all(
        last.items
          .filter(item => item.id)
          .map(item =>
            fetchWithAuth(`/api/orders/${order.id}/items/${item.id}/status`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ newStatus: item.item_status })
            })
          )
      );
      setUndoStack(prev => prev.slice(0, -1));
      addNotification('success', 'Action Reverted');
    } catch (e) {
      addNotification('error', 'Undo Failed');
    }
  };


  useEffect(() => {
    console.log('[KDS_MOUNT] optimisticItemStatus on mount:', optimisticItemStatus);
    
    // Set up periodic sync as a safety net for sockets
    const timer = setInterval(() => {
      if (inFlightItems.current.size > 0) return;
      if (fetchInitialData) fetchInitialData();
    }, 15000); 
    return () => clearInterval(timer);
  }, [fetchInitialData, optimisticItemStatus]);

  const handleItemToggle = async (order: Order, itemIndex: number) => {
    const items = [...(order.order_items || [])];
    const item = items[itemIndex];
    if (!item || !item.id) return;

    // Guard: Prevent duplicate requests for the same item (rapid clicks / double-tap)
    if (inFlightItems.current.has(item.id)) return;
    inFlightItems.current.add(item.id);

    // Resolve the REAL current status: optimistic (latest click) > rendered prop
    const effectiveStatus = optimisticItemStatus[item.id] || item.item_status;

    let nextStatus: string;
    if (effectiveStatus === 'PENDING') nextStatus = 'PREPARING';
    else if (effectiveStatus === 'PREPARING') nextStatus = 'DONE';
    else if (effectiveStatus === 'DONE') nextStatus = 'DONE'; // Backend treats DONE->DONE as an Undo
    else { inFlightItems.current.delete(item.id); return; }

    setOptimisticItemStatus(prev => ({ ...prev, [item.id]: nextStatus }));

    setUndoStack(prev => [...prev.slice(-10), {
      order,
      items: [{ id: item.id, item_status: item.item_status }],
      status: order.status
    }]);

    try {
      const res = await fetchWithAuth(
        `/api/orders/${order.id}/items/${item.id}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newStatus: nextStatus })
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || 'Update failed');
      }
      // Force context refresh in background
      if (fetchInitialData) {
        fetchInitialData();
      }
    } catch (error: any) {
      // Rollback on fail
      setOptimisticItemStatus(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      addNotification('error', `Status Update Failed: ${error.message}`);
    } finally {
      inFlightItems.current.delete(item.id);
    }
  };

  const confirmReadyAll = (order: Order) => {
    setShowSafetyModal({ show: true, order });
  };

  const handleReadyAll = async () => {
    if (!showSafetyModal.order) return;
    const order = showSafetyModal.order;
    const items = [...(order.order_items || [])];

    const itemsToUpdate = items.filter(item => {
      const isRelevant = isItemForStation(item, activeStationId);
      return isRelevant &&
        (item.item_status === 'PENDING' || item.item_status === 'PREPARING') &&
        item.id;
    });

    setOptimisticItemStatus(prev => {
      const next = { ...prev };
      itemsToUpdate.forEach(item => {
        next[item.id] = 'DONE';
      });
      return next;
    });

    try {
      await Promise.all(
        itemsToUpdate.map(item =>
          fetchWithAuth(`/api/orders/${order.id}/items/${item.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newStatus: 'DONE' })
          })
        )
      );
      setShowSafetyModal({ show: false });
      addNotification('success', 'Station Clearance Successful');
    } catch (error) {
      setOptimisticItemStatus(prev => {
        const next = { ...prev };
        itemsToUpdate.forEach(item => {
          delete next[item.id];
        });
        return next;
      });
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
            <h1 className="text-white text-lg xl:text-xl font-serif tracking-tight leading-none uppercase flex items-center gap-2">
              {currentUser?.name || 'Chef'}
              <span className="text-gold-500 font-sans text-[10px] font-black tracking-widest bg-gold-500/10 px-2.5 py-1 rounded-lg border border-gold-500/20 shadow-[0_0_10px_rgba(234,179,8,0.2)]">
                {currentUser?.role || 'LINE COOK'}
              </span>
            </h1>
            <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mt-1.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              Live Kitchen Feed
            </p>
          </div>
        </div>

        {/* Connectivity Monitor */}
        <div className="hidden md:flex items-center gap-4 bg-slate-900/50 border border-slate-800 px-4 py-2 rounded-2xl">
          <div className="flex flex-col items-end">
            <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest">Station Connectivity</span>
            <span className="text-[10px] text-green-400 font-bold uppercase">All Stations Operational</span>
          </div>
          <div className="flex -space-x-1">
            {stations.filter((s: Station) => s.is_active).map((s: Station) => (
              <div key={s.id} title={s.name} className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
                <Circle size={8} className="text-green-500 fill-green-500/20" />
              </div>
            ))}
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
              {stations.filter((s: Station) => s.is_active).map((station: Station) => (
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
          {activeOrders.map((order: any) => (
            <KDSTicket
              key={order.id}
              order={order}
              activeStationId={activeStationId}
              stations={stations}
              tables={tables}
              onReadyAll={() => confirmReadyAll(order)}
              onToggleItem={(idx) => handleItemToggle(order, idx)}
              onVoidOrder={async () => {
                const ok = await cancelOrder(order.id, 'Voided from KDS');
                if (ok) addNotification('success', `Order #${order.order_number || order.id.split('-').pop()} voided`);
              }}
              userRole={currentUser?.role || ''}
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
  onVoidOrder: () => void;
  userRole: string;
}> = ({ order, activeStationId, stations, tables, onReadyAll, onToggleItem, onVoidOrder, userRole }) => {
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
      // Exclude SERVED and PENDING items from KDS if necessary, but here we keep PENDING
      return isItemForStationInternal(item, activeStationId) &&
        item.item_status !== 'SERVED';
    });

  if (visibleItems.length === 0) return null;

  return (
    <div className={`flex flex-col bg-slate-900 border-2 rounded-2xl shadow-2xl relative overflow-hidden transition-all duration-500 ${isCritical ? 'border-red-600 animate-pulse' : isUrgent ? 'border-orange-500' : 'border-slate-800'
      }`}>
      <div className={`p-4 flex justify-between items-start ${isCritical ? 'bg-red-600' : isUrgent ? 'bg-orange-500' : 'bg-slate-800'
        }`}>
        <div className="flex-1">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/80 mb-1 drop-shadow-md">
            #{order.id.split('-').pop()?.toUpperCase()}
          </div>
          <div className="font-serif text-2xl xl:text-3xl font-bold text-white leading-none mb-1 drop-shadow-lg">{getIdentifier()}</div>

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
        {visibleItems.map((item) => (
          <div
            key={item.id || `${item.menu_item_id}-${item.originalIndex}`}
            onClick={() => onToggleItem(item.originalIndex)}
            className={`p-3 rounded-xl border transition-all duration-300 cursor-pointer group flex items-start gap-3 ${item.item_status === 'DONE'
              ? 'bg-green-500/10 border-green-500/20 opacity-50'
              : item.item_status === 'PREPARING'
                ? 'bg-gold-500/10 border-gold-500/30 shadow-lg shadow-gold-500/5'
                : 'bg-blue-500/20 border-blue-500/50 hover:bg-blue-500/30 animate-pulse' // Highlight NEW items
              }`}
          >
            <div className="mt-0.5">
              {item.item_status === 'DONE' ? (
                <CheckCircle2 size={18} className="text-green-500 animate-in zoom-in" />
              ) : item.item_status === 'PREPARING' ? (
                <CheckSquare size={18} className="text-gold-500 animate-in zoom-in" />
              ) : (
                <Circle size={18} className="text-blue-400 group-hover:text-blue-300 transition-colors" />
              )}
            </div>

            <div className="flex-1">
              <div className="flex justify-between items-start gap-2">
                <span className={`text-sm font-bold leading-tight ${item.item_status === 'DONE' ? 'text-slate-500 line-through' :
                  item.item_status === 'PREPARING' ? 'text-white' : 'text-blue-100' // Brighter text for NEW items
                  }`}>
                  {item.menu_item?.name || item.item_name}
                  {item.item_status === 'PENDING' && (
                    <span className="ml-2 px-1.5 py-0.5 bg-blue-500 text-white text-[8px] font-black uppercase tracking-wider rounded animate-pulse">NEW</span>
                  )}
                </span>
                <span className={`text-lg font-black leading-none ${item.item_status === 'DONE' ? 'text-green-500/50' :
                  item.item_status === 'PREPARING' ? 'text-gold-500' : 'text-blue-400'
                  }`}>x{item.quantity}</span>
              </div>

              {item.special_instructions && (
                <div className="mt-2 text-[10px] font-black tracking-[0.1em] text-red-400 uppercase bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/30 flex items-center gap-2 shadow-[0_0_15px_rgba(239,68,68,0.15)]">
                  <AlertCircle size={14} className="text-red-500" /> {item.special_instructions}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-slate-900/90 border-t border-slate-800 flex flex-col gap-3">
        <button
          onClick={onReadyAll}
          className="w-full h-14 sm:h-12 rounded-xl bg-green-500 hover:bg-green-400 text-slate-950 font-black uppercase tracking-[0.2em] text-sm sm:text-xs transition-all shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:shadow-[0_0_25px_rgba(34,197,94,0.5)] active:scale-[0.98] flex items-center justify-center gap-2 focus:outline-none focus:ring-4 focus:ring-green-500/50"
        >
          <CheckCircle2 size={24} className="sm:w-5 sm:h-5" /> BUMP / READY
        </button>

        {['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(userRole) && (
          <div className="flex gap-2">
            <button
              onClick={onVoidOrder}
              className="flex-1 h-10 bg-red-600 hover:bg-red-500 text-white font-black uppercase text-[9px] tracking-[0.15em] rounded-lg transition-all shadow-lg shadow-red-900/40 active:scale-95 border border-red-500/50"
            >
              Void Ticket
            </button>
            <button
              onClick={() => alert('Reassign coming in next update')}
              className="flex-1 h-10 bg-slate-800 hover:bg-blue-900/30 text-slate-400 hover:text-blue-400 font-bold uppercase text-[9px] tracking-[0.15em] rounded-lg transition-colors border border-slate-700/50 hover:border-blue-500/50"
            >
              Reassign
            </button>
          </div>
        )}
      </div>
    </div>
  );
};