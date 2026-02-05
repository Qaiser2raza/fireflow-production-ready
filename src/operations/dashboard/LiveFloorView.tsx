
import React, { useMemo } from 'react';
import { Table, Order, TableStatus, OrderStatus, Section } from '../../shared/types';
import { Users, AlertCircle, Clock } from 'lucide-react';

interface LiveFloorViewProps {
    tables: Table[];
    sections: Section[];
    activeZoneId: string;
    orders: Order[];
    onTableClick: (table: Table, order?: Order) => void;
    onSeat: (tableId: string, count: number) => void;
}

export const LiveFloorView: React.FC<LiveFloorViewProps> = ({
    tables,
    activeZoneId,
    orders,
    onTableClick,
    onSeat
}) => {
    const filteredTables = useMemo(() => {
        if (activeZoneId === 'ALL') return tables;
        return tables.filter(t => t.section_id === activeZoneId);
    }, [tables, activeZoneId]);

    const getTableStatusColor = (table: Table, order?: Order) => {
        if (table.status === TableStatus.OUT_OF_SERVICE) return 'border-slate-800 bg-slate-900 opacity-50';
        if (table.status === TableStatus.DIRTY) return 'border-red-500/50 bg-red-950/20';
        if (table.status === TableStatus.CLEANING) return 'border-blue-500/50 bg-blue-950/20';
        if (table.status === TableStatus.RESERVED) return 'border-purple-500/50 bg-purple-950/20';

        if (!order) return 'border-emerald-500/30 bg-emerald-950/5';

        // Status based on order
        if (order.status === OrderStatus.BILL_REQUESTED) return 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)] bg-amber-950/20';
        if (order.status === OrderStatus.READY) return 'border-blue-500 bg-blue-950/20';
        return 'border-emerald-500 bg-emerald-950/20';
    };

    const getTableTime = (order?: Order) => {
        if (!order) return null;
        const elapsed = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
        return `${elapsed}m`;
    };

    return (
        <div className="w-full h-full relative overflow-auto p-8 bg-[#050810] min-h-[600px] border border-slate-800/50 rounded-2xl shadow-inner group">
            {/* Legend / Status Overlay */}
            <div className="absolute top-4 right-4 flex flex-col gap-2 z-10 pointer-events-none">
                {[
                    { color: 'bg-emerald-500', label: 'Available' },
                    { color: 'bg-emerald-600 border border-white/20', label: 'Occupied' },
                    { color: 'bg-amber-500 animate-pulse', label: 'Bill Requested' },
                    { color: 'bg-red-500', label: 'Needs Cleaning' }
                ].map(s => (
                    <div key={s.label} className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-sm px-2 py-1 rounded border border-slate-800">
                        <div className={`w-2 h-2 rounded-full ${s.color}`} />
                        <span className="text-[9px] font-black uppercase tracking-tighter text-slate-400">{s.label}</span>
                    </div>
                ))}
            </div>

            <div className="relative w-[1200px] h-[800px] mx-auto scale-90 origin-top">
                {/* Decorative Grid */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                    style={{
                        backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
                        backgroundSize: '40px 40px'
                    }}
                />

                {filteredTables.map(table => {
                    const order = orders.find(o => o.table_id === table.id);
                    const time = getTableTime(order);
                    const isOverCapacity = order && (order.guest_count || 0) > table.capacity;

                    return (
                        <div
                            key={table.id}
                            onClick={() => onTableClick(table, order)}
                            className={`
                absolute transition-all duration-300 cursor-pointer
                flex flex-col items-center justify-center border-2
                hover:scale-105 hover:z-50 group/table shadow-lg
                ${getTableStatusColor(table, order)}
                ${table.shape === 'ROUND' || table.shape === 'OVAL' ? 'rounded-full' : 'rounded-2xl'}
              `}
                            style={{
                                left: `${table.x_position}px`,
                                top: `${table.y_position}px`,
                                width: `${table.width || 100}px`,
                                height: `${table.height || 100}px`,
                                transform: `rotate(${table.rotation || 0}deg)`,
                            }}
                        >
                            <div className="flex flex-col items-center justify-center p-2 text-center select-none">
                                <div className="flex items-center gap-1 mb-0.5">
                                    <div className="text-white font-black text-xl group-hover/table:text-gold-500 transition-colors uppercase tracking-tight">
                                        {table.name}
                                    </div>
                                    {isOverCapacity && (
                                        <div className="bg-amber-500 p-0.5 rounded-full animate-bounce">
                                            <AlertCircle size={10} className="text-black" />
                                        </div>
                                    )}
                                </div>

                                {order ? (
                                    <div className="flex flex-col items-center gap-0.5">
                                        <div className="flex items-center gap-1 text-[10px] font-black text-gold-500/80 uppercase">
                                            <Users size={10} /> {order.guest_count}
                                        </div>
                                        {time && (
                                            <div className="flex items-center gap-1 text-[9px] font-mono text-slate-500">
                                                <Clock size={10} /> {time}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest opacity-0 group-hover/table:opacity-100 transition-opacity">
                                        {table.capacity} Seats
                                    </div>
                                )}
                            </div>

                            {!order && table.status === TableStatus.AVAILABLE && (
                                <div className="absolute inset-0 bg-emerald-500/20 opacity-0 group-hover/table:opacity-100 flex items-center justify-center rounded-inherit transition-opacity">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onSeat(table.id, table.capacity); }}
                                        className="bg-emerald-500 text-black p-2 rounded-full shadow-xl transform scale-50 group-hover/table:scale-100 transition-transform"
                                    >
                                        <Users size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
