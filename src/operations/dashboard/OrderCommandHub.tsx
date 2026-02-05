import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../client/App';
import {
  CheckCircle2, Loader2, Bike, Zap, LayoutGrid, Map as MapIcon, Circle
} from 'lucide-react';
import { LiveFloorView } from './LiveFloorView';
import { TableCard } from './components/TableCard';
import { MetricsDashboard } from './components/MetricsDashboard';
import { RecallModal } from './components/RecallModal';
import { Order, OrderStatus } from '../../shared/types';

export const OrderCommandHub: React.FC = () => {
  const { tables, orders, sections, setActiveView, seatGuests, setOrderToEdit, updateOrderStatus, cancelOrder, voidOrder, currentUser } = useAppContext();
  const [activeZone, setActiveZone] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'GRID' | 'FLOOR'>('GRID');
  const [showRecallModal, setShowRecallModal] = useState(false);

  // Filter tables by zone
  const filteredTables = useMemo(() => {
    if (activeZone === 'ALL') return tables;
    return tables.filter(t => t.section_id === activeZone);
  }, [tables, activeZone]);

  // Get dine-in orders
  const dineInOrders = useMemo(() => {
    return orders.filter(o => o.type === 'DINE_IN' && o.status !== OrderStatus.PAID && o.status !== OrderStatus.CANCELLED);
  }, [orders]);

  // Get takeaway/delivery orders for pulse feed
  const pulseOrders = useMemo(() => {
    return orders.filter(o =>
      (o.type === 'TAKEAWAY' || o.type === 'DELIVERY') &&
      o.status !== OrderStatus.PAID &&
      o.status !== OrderStatus.CANCELLED
    ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [orders]);

  // Sort tables by urgency
  const sortedTables = useMemo(() => {
    return [...filteredTables].sort((a, b) => {
      const orderA = dineInOrders.find(o => o.table_id === a.id);
      const orderB = dineInOrders.find(o => o.table_id === b.id);

      // Calculate urgency scores
      const getUrgencyScore = (order: Order | undefined) => {
        if (!order) return 0; // Available tables last

        const elapsed = Math.floor((Date.now() - new Date(order.created_at || order.timestamp || 0).getTime()) / 60000);

        if (order.status === OrderStatus.BILL_REQUESTED) return 1000; // Highest priority
        if (elapsed > 60) return 900; // Overdue
        if (order.status === OrderStatus.READY) return 800; // Ready to serve
        if (elapsed > 45) return 700; // Slow
        if (order.status === OrderStatus.PREPARING || order.status === OrderStatus.FIRED) return 600;
        return 500; // Other occupied
      };

      return getUrgencyScore(orderB) - getUrgencyScore(orderA);
    });
  }, [filteredTables, dineInOrders]);

  const handleOrderClick = (order: Order) => {
    if (order.type === 'DELIVERY' && [OrderStatus.READY, OrderStatus.COMPLETED].includes(order.status)) {
      setActiveView('dispatch');
    } else {
      setOrderToEdit(order);
      setActiveView('pos');
    }
  };

  return (
    <div className="flex h-full bg-[#0a0e1a] text-slate-200 overflow-hidden">

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* HEADER */}
        <header className="bg-[#0f172a]/80 backdrop-blur-md border-b border-slate-800/50 px-6 py-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">
                ORDER COMMAND CENTER
              </div>
              <h1 className="text-xl font-serif font-bold">
                Live <span className="text-gold-500">Operations</span>
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex bg-[#050810] p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => setViewMode('GRID')}
                  className={`p-2 rounded-md transition-all ${viewMode === 'GRID' ? 'bg-gold-500 text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}
                  title="Grid View"
                >
                  <LayoutGrid size={18} />
                </button>
                <button
                  onClick={() => setViewMode('FLOOR')}
                  className={`p-2 rounded-md transition-all ${viewMode === 'FLOOR' ? 'bg-gold-500 text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}
                  title="Floor Plan View"
                >
                  <MapIcon size={18} />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* METRICS DASHBOARD */}
        <MetricsDashboard
          orders={orders}
          tables={tables}
          currentUser={currentUser}
          onDraftClick={() => setShowRecallModal(true)}
        />

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

        {/* MAIN DISPLAY AREA */}
        <div className="flex-1 overflow-hidden relative">
          {viewMode === 'GRID' ? (
            <div className="h-full overflow-y-auto p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {sortedTables.map(table => {
                  const order = dineInOrders.find(o => o.table_id === table.id);
                  return (
                    <TableCard
                      key={table.id}
                      table={table}
                      order={order}
                      currentUser={currentUser}
                      onSeat={(count) => seatGuests(table.id, count)}
                      onOpenPOS={() => {
                        if (order) setOrderToEdit(order);
                        setActiveView('POS');
                      }}
                      onMarkServed={async (orderId) => {
                        await updateOrderStatus(orderId, OrderStatus.SERVED);
                      }}
                      onRequestBill={async (orderId) => {
                        await updateOrderStatus(orderId, OrderStatus.BILL_REQUESTED);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            <LiveFloorView
              tables={tables}
              sections={sections}
              activeZoneId={activeZone}
              orders={dineInOrders}
              onSeat={(id, count) => seatGuests(id, count)}
              onTableClick={(table, order) => {
                if (order) {
                  setOrderToEdit(order);
                  setActiveView('POS');
                } else {
                  // If empty, maybe open quick seat or wait for user action
                }
              }}
            />
          )}
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

      {/* Recall Modal for Draft Orders */}
      {showRecallModal && (
        <RecallModal
          isOpen={showRecallModal}
          onClose={() => setShowRecallModal(false)}
          onSelectOrder={handleOrderClick}
          onDeleteOrder={async (id) => {
            await cancelOrder(id, 'Deleted by Manager');
          }}
          currentUser={currentUser}
          orders={orders}
        />
      )}
    </div>
  );
};

// --- COMPONENTS ---

const PulseCard: React.FC<{ order: any }> = ({ order }) => {
  const getStatusColor = () => {
    if (order.status === 'READY') return 'text-yellow-500';
    if (order.status === 'PREPARING') return 'text-blue-500';
    if (order.status === 'OUT_FOR_DELIVERY') return 'text-green-500';
    return 'text-slate-500';
  };

  const getStatusIcon = () => {
    if (order.status === 'READY') return CheckCircle2;
    if (order.status === 'PREPARING') return Loader2;
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
          <StatusIcon size={14} className={order.status === 'PREPARING' ? 'animate-spin' : ''} />
          <span className="uppercase tracking-wider font-bold">{order.status}</span>
        </div>
        <div className="text-sm font-black text-white">Rs. {order.total?.toLocaleString()}</div>
      </div>

      {/* Mini Completion Bar */}
      <div className="mt-2">
        <div className="h-1 bg-black/40 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ${order.status === 'READY' || order.status === 'SERVED' || order.status === 'PAID' ? 'bg-green-500' :
              order.status === 'PREPARING' ? 'bg-blue-500' :
                order.status === 'OUT_FOR_DELIVERY' ? 'bg-gold-500' : 'bg-slate-700'
              }`}
            style={{
              width: `${order.status === 'READY' || order.status === 'SERVED' || order.status === 'PAID' ? 100 :
                order.status === 'PREPARING' ? 60 :
                  order.status === 'OUT_FOR_DELIVERY' ? 80 : 20
                }%`
            }}
          />
        </div>
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