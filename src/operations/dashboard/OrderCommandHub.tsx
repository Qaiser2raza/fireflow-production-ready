import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../client/App';
import {
  Clock, AlertCircle, CheckCircle2, Loader2, Bike, Zap, Circle
} from 'lucide-react';

export const OrderCommandHub: React.FC = () => {
  const { tables, orders, sections, setActiveView, seatGuests } = useAppContext();
  const [activeZone, setActiveZone] = useState<string>('ALL');

  // Filter tables by zone
  const filteredTables = useMemo(() => {
    if (activeZone === 'ALL') return tables;
    return tables.filter(t => t.section_id === activeZone);
  }, [tables, activeZone]);

  // Get dine-in orders
  const dineInOrders = useMemo(() => {
    return orders.filter(o => o.type === 'DINE_IN' && o.status !== 'PAID' && o.status !== 'CANCELLED');
  }, [orders]);

  // Get takeaway/delivery orders for pulse feed
  const pulseOrders = useMemo(() => {
    return orders.filter(o =>
      (o.type === 'TAKEAWAY' || o.type === 'DELIVERY') &&
      o.status !== 'PAID' &&
      o.status !== 'CANCELLED'
    ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [orders]);

  return (
    <div className="flex h-full bg-[#0a0e1a] text-slate-200 overflow-hidden">

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* HEADER */}
        <header className="bg-[#0f172a]/80 backdrop-blur-md border-b border-slate-800/50 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                <Circle size={6} className="fill-green-500 text-green-500" />
                ORDER COMMAND CENTER
              </div>
              <h1 className="text-2xl font-serif font-bold">
                Live <span className="text-gold-500">Operations</span>
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-6 text-sm">
                <div className="text-center">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest">Active Tables</div>
                  <div className="text-lg font-black text-white">{dineInOrders.length}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest">Pulse Orders</div>
                  <div className="text-lg font-black text-gold-500">{pulseOrders.length}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">System Status</div>
                <div className="text-sm font-bold text-green-400">● Operational</div>
              </div>
            </div>
          </div>
        </header>

        {/* ZONE TABS */}
        <div className="border-b border-slate-800/50 bg-[#0a0e1a]">
          <div className="flex px-6">
            <button
              onClick={() => setActiveZone('ALL')}
              className={`px-6 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${activeZone === 'ALL'
                ? 'border-gold-500 text-white'
                : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
            >
              All Zones
            </button>
            {sections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveZone(section.id)}
                className={`px-6 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${activeZone === section.id
                  ? 'border-gold-500 text-white'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
              >
                {section.name}
              </button>
            ))}
          </div>
        </div>

        {/* TABLE GRID */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredTables.map(table => {
              const order = dineInOrders.find(o => o.table_id === table.id);
              return (
                <TableCard
                  key={table.id}
                  table={table}
                  order={order}
                  onSeat={(count) => seatGuests(table.id, count)}
                  onOpenPOS={() => setActiveView('POS')}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT PULSE FEED */}
      <aside className="w-80 bg-[#050810] border-l border-slate-800/50 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-800/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-gold-500" />
              <h2 className="text-sm font-black uppercase tracking-widest">The Pulse</h2>
            </div>
            <span className="bg-gold-500 text-black text-xs font-black px-2 py-1 rounded">
              {pulseOrders.length} Active
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {pulseOrders.map(order => (
            <PulseCard key={order.id} order={order} />
          ))}
        </div>
      </aside>
    </div>
  );
};

// --- COMPONENTS ---

const TableCard: React.FC<{
  table: any;
  order?: any;
  onSeat: (count: number) => void;
  onOpenPOS: () => void;
}> = ({ table, order, onSeat, onOpenPOS }) => {
  const [guestCount, setGuestCount] = useState(2);

  const getStatusColor = () => {
    if (!order) return 'border-slate-700';
    if (order.status === 'BILL_REQUESTED') return 'border-red-500';
    if (order.status === 'READY' || order.status === 'SERVED') return 'border-yellow-500';
    if (order.status === 'COOKING') return 'border-green-500';
    return 'border-blue-500';
  };

  const getStatusBadge = () => {
    if (!order) return null;
    if (order.status === 'BILL_REQUESTED') return { text: 'BILL REQ', color: 'bg-red-600' };
    return null;
  };

  const getProgress = () => {
    if (!order) return 0;
    if (order.status === 'SERVED') return 100;
    if (order.status === 'READY') return 80;
    if (order.status === 'COOKING') return 50;
    return 20;
  };

  const getElapsedTime = () => {
    if (!order) return null;
    const elapsed = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
    return `${elapsed}m`;
  };

  const badge = getStatusBadge();
  const elapsed = getElapsedTime();
  const isOverdue = elapsed && parseInt(elapsed) > 15;

  return (
    <div
      className={`bg-[#1a1f2e] rounded-xl border-2 ${getStatusColor()} p-4 transition-all hover:scale-105 cursor-pointer relative`}
      onClick={order ? onOpenPOS : undefined}
    >
      {/* Status Badge */}
      {badge && (
        <div className={`absolute top-2 right-2 ${badge.color} text-white text-[8px] font-black px-2 py-1 rounded uppercase tracking-wider`}>
          {badge.text}
        </div>
      )}

      {/* Table Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xl font-black text-white">{table.name}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">
            {table.capacity} Guests
          </div>
        </div>

        {elapsed && (
          <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-400' : 'text-blue-400'}`}>
            {isOverdue ? <AlertCircle size={12} /> : <Clock size={12} />}
            <span className="text-xs font-mono">{elapsed}</span>
          </div>
        )}
      </div>

      {/* Guest Count or Status */}
      {!order ? (
        <div className="flex items-center justify-between bg-slate-900/50 rounded-lg p-2">
          <button
            onClick={(e) => { e.stopPropagation(); setGuestCount(Math.max(1, guestCount - 1)); }}
            className="w-8 h-8 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white font-bold"
          >
            −
          </button>
          <span className="font-bold text-white">{guestCount}</span>
          <button
            onClick={(e) => { e.stopPropagation(); setGuestCount(guestCount + 1); }}
            className="w-8 h-8 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white font-bold"
          >
            +
          </button>
        </div>
      ) : (
        <div className="text-center">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">{order.status}</div>
          <div className="text-sm font-black text-white">Rs. {order.total?.toLocaleString()}</div>
        </div>
      )}

      {/* Progress Bar */}
      {order && (
        <div className="mt-3">
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${getProgress() === 100 ? 'bg-yellow-500' :
                getProgress() >= 80 ? 'bg-green-500' :
                  getProgress() >= 50 ? 'bg-blue-500' : 'bg-slate-600'
                }`}
              style={{ width: `${getProgress()}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-500 text-right mt-1">{getProgress()}%</div>
        </div>
      )}

      {/* Seat Button */}
      {!order && (
        <button
          onClick={(e) => { e.stopPropagation(); onSeat(guestCount); }}
          className="w-full mt-3 bg-gold-500 hover:bg-gold-400 text-black font-black text-xs uppercase tracking-wider py-2 rounded-lg transition-all"
        >
          Seat Guests
        </button>
      )}
    </div>
  );
};

const PulseCard: React.FC<{ order: any }> = ({ order }) => {
  const getStatusColor = () => {
    if (order.status === 'READY') return 'text-yellow-500';
    if (order.status === 'COOKING') return 'text-blue-500';
    if (order.status === 'OUT_FOR_DELIVERY') return 'text-green-500';
    return 'text-slate-500';
  };

  const getStatusIcon = () => {
    if (order.status === 'READY') return CheckCircle2;
    if (order.status === 'COOKING') return Loader2;
    if (order.status === 'OUT_FOR_DELIVERY') return Bike;
    return Circle;
  };

  const StatusIcon = getStatusIcon();
  const isDelivery = order.type === 'DELIVERY';

  return (
    <div className="bg-[#1a1f2e] rounded-lg p-3 border border-slate-800/50 hover:border-slate-700 transition-all">
      <div className="flex items-start justify-between mb-2">
        <div className="text-xs font-mono text-slate-500">#{order.id.split('-').pop()}</div>
        <span className={`text-xs font-black uppercase tracking-wider px-2 py-1 rounded ${isDelivery ? 'bg-blue-900/30 text-blue-400' : 'bg-green-900/30 text-green-400'
          }`}>
          {order.type === 'TAKEAWAY' ? 'Takeaway' : 'Delivery'}
        </span>
      </div>

      <div className="font-bold text-white mb-1">{order.customer_name || 'Guest'}</div>

      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-1 text-xs ${getStatusColor()}`}>
          <StatusIcon size={14} className={order.status === 'COOKING' ? 'animate-spin' : ''} />
          <span className="uppercase tracking-wider font-bold">{order.status}</span>
        </div>
        <div className="text-sm font-black text-white">Rs. {order.total?.toLocaleString()}</div>
      </div>

      {isDelivery && order.delivery_orders?.[0] && (
        <div className="mt-2 pt-2 border-t border-slate-800/50">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Bike size={12} />
            <span>Rider in 2m</span>
          </div>
        </div>
      )}
    </div>
  );
};