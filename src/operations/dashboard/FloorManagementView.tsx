import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../client/App';
import { ActionRibbon } from './components/ActionRibbon';
import { TableCard } from './components/TableCard';
import { RecallModal } from './components/RecallModal';
import { LiveFloorView } from './LiveFloorView';
import { LayoutGrid, Map as MapIcon, RotateCcw } from 'lucide-react';

export const FloorManagementView: React.FC = () => {
    const {
        tables,
        orders,
        sections,
        setActiveView,
        seatGuests,
        setOrderToEdit,
        updateOrderStatus
    } = useAppContext();

    const [activeZone, setActiveZone] = useState<string>('ALL');
    const [viewMode, setViewMode] = useState<'GRID' | 'FLOOR'>('GRID');
    const [isRecallOpen, setIsRecallOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Get dine-in orders
    const dineInOrders = useMemo(() => {
        return orders.filter(o => o.type === 'DINE_IN' && o.status !== 'PAID' && o.status !== 'CANCELLED');
    }, [orders]);

    // Hall Capacity Stats
    const stats = useMemo(() => {
        const zoneTables = activeZone === 'ALL' ? tables : tables.filter(t => t.section_id === activeZone);
        const total = zoneTables.reduce((acc, t) => acc + (t.capacity || 0), 0);
        const occupied = zoneTables.reduce((acc, t) => {
            const order = dineInOrders.find(o => o.table_id === t.id);
            return acc + (order?.guest_count || 0);
        }, 0);
        return { total, occupied, tableCount: zoneTables.length };
    }, [tables, activeZone, dineInOrders]);

    // Filter tables by zone and intelligent search
    const filteredTables = useMemo(() => {
        let baseTables = tables;

        // Apply Zone Filter
        if (activeZone === 'ALL') {
            // "Active Orders" view: Only show tables that have an associated live order
            baseTables = tables.filter(t => dineInOrders.some(o => o.table_id === t.id));
        } else {
            baseTables = tables.filter(t => t.section_id === activeZone);
        }

        // Apply Intelligent Search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            return baseTables.filter(t => {
                const order = dineInOrders.find(o => o.table_id === t.id);
                const matchesTable = t.name.toLowerCase().includes(q);
                const matchesGuest = order?.customer_name?.toLowerCase().includes(q);
                const matchesStatus = order?.status?.toLowerCase().includes(q);
                const matchesItems = order?.order_items?.some(item =>
                    item.item_name?.toLowerCase().includes(q)
                );

                return matchesTable || matchesGuest || matchesStatus || matchesItems;
            });
        }

        return baseTables;
    }, [tables, activeZone, dineInOrders, searchQuery]);

    const handleSelectOrder = (order: any) => {
        setOrderToEdit(order);
        setActiveView('POS');
    };

    return (
        <div className="flex h-full bg-[#050810] text-slate-200 overflow-hidden font-sans">

            {/* MAIN CONTENT */}
            <div className="flex-1 flex flex-col overflow-hidden relative">

                {/* ACTION RIBBON */}
                <ActionRibbon
                    onSearch={setSearchQuery}
                    activeOrdersCount={dineInOrders.length}
                    totalCapacity={stats.total}
                    occupiedCapacity={stats.occupied}
                    onRecallClick={() => setIsRecallOpen(true)}
                />

                {/* ZONE & VIEW CONTROLS */}
                <div className="bg-[#0a0e1a]/80 backdrop-blur-md border-b border-slate-800/50 flex items-center justify-between px-6">
                    <div className="flex overflow-x-auto no-scrollbar">
                        <button
                            onClick={() => setActiveZone('ALL')}
                            className={`px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] border-b-2 transition-all shrink-0 ${activeZone === 'ALL' ? 'border-gold-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
                                }`}
                        >
                            Active
                        </button>
                        {sections.map(section => (
                            <button
                                key={section.id}
                                onClick={() => setActiveZone(section.id)}
                                className={`px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] border-b-2 transition-all shrink-0 ${activeZone === section.id ? 'border-gold-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
                                    }`}
                            >
                                {section.name}
                            </button>
                        ))}
                    </div>

                    <div className="flex bg-black/40 p-1 rounded-xl border border-slate-800 ml-4">
                        <button
                            onClick={() => setViewMode('GRID')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'GRID' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                        >
                            <LayoutGrid size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode('FLOOR')}
                            className={`p-2 rounded-lg transition-all ${viewMode === 'FLOOR' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                        >
                            <MapIcon size={16} />
                        </button>
                    </div>
                </div>

                {/* DISPLAY AREA */}
                <main className="flex-1 overflow-hidden relative">
                    {viewMode === 'GRID' ? (
                        <div className="h-full overflow-y-auto p-8 custom-scrollbar bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.03)_0%,transparent_100%)]">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                                {filteredTables.map(table => {
                                    const order = dineInOrders.find(o => o.table_id === table.id);
                                    return (
                                        <TableCard
                                            key={table.id}
                                            table={table}
                                            order={order}
                                            onSeat={(count) => seatGuests(table.id, count)}
                                            onOpenPOS={() => {
                                                if (order) setOrderToEdit(order);
                                                setActiveView('POS');
                                            }}
                                            onMarkServed={async (orderId) => {
                                                await updateOrderStatus(orderId, 'SERVED' as any);
                                            }}
                                            onRequestBill={async (orderId) => {
                                                await updateOrderStatus(orderId, 'BILL_REQUESTED' as any);
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
                            onTableClick={(_table, order) => {
                                if (order) {
                                    setOrderToEdit(order);
                                    setActiveView('POS');
                                }
                            }}
                        />
                    )}

                    {/* Quick Refresh Float */}
                    <button
                        className="absolute bottom-6 right-6 p-4 bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl text-slate-400 hover:text-white transition-all active:scale-95"
                        onClick={() => window.location.reload()}
                    >
                        <RotateCcw size={20} />
                    </button>
                </main>
            </div>

            {/* RECALL MODAL */}
            <RecallModal
                isOpen={isRecallOpen}
                onClose={() => setIsRecallOpen(false)}
                orders={orders}
                onSelectOrder={handleSelectOrder}
            />

            <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(30, 41, 59, 0.5); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(51, 65, 85, 0.8); }
      `}</style>
        </div>
    );
};
