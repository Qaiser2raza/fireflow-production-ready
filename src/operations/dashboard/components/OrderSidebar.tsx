import React from 'react';
import { Order, OrderStatus } from '../../../shared/types';
import { Zap, Clock, ChevronRight, Bike, Package } from 'lucide-react';

interface OrderSidebarProps {
    orders: Order[];
    onOrderClick: (order: Order) => void;
    className?: string;
}

export const OrderSidebar: React.FC<OrderSidebarProps> = ({ orders, onOrderClick, className = '' }) => {
    const takeawayOrders = orders.filter(o => o.type === 'TAKEAWAY');
    const deliveryOrders = orders.filter(o => o.type === 'DELIVERY');

    return (
        <aside className={`flex flex-col bg-[#050810] border-l border-slate-800/50 h-full overflow-hidden ${className}`}>
            {/* Header */}
            <div className="p-6 border-b border-slate-800/50 bg-[#0a0e1a]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Zap size={18} className="text-[#D4AF37] fill-[#D4AF37]" />
                        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">The Pulse</h2>
                    </div>
                    <div className="flex gap-2">
                        <div className="bg-[#D4AF37]/10 text-[#D4AF37] text-[10px] font-black px-2 py-1 rounded-md border border-[#D4AF37]/20">
                            {orders.length} ACTIVE
                        </div>
                    </div>
                </div>
            </div>

            {/* Sections */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* Delivery Section */}
                {deliveryOrders.length > 0 && (
                    <div className="p-4">
                        <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Bike size={12} />
                            Delivery Dispatch
                        </div>
                        <div className="space-y-3">
                            {deliveryOrders.map(order => (
                                <PulseItem key={order.id} order={order} onClick={() => onOrderClick(order)} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Takeaway Section */}
                {takeawayOrders.length > 0 && (
                    <div className="p-4 border-t border-slate-800/30">
                        <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Package size={12} />
                            Takeaway Queue
                        </div>
                        <div className="space-y-3">
                            {takeawayOrders.map(order => (
                                <PulseItem key={order.id} order={order} onClick={() => onOrderClick(order)} />
                            ))}
                        </div>
                    </div>
                )}

                {orders.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full opacity-20 grayscale py-20">
                        <Zap size={48} className="mb-4" />
                        <p className="text-xs font-black uppercase tracking-widest">No Active Pulse</p>
                    </div>
                )}
            </div>

            {/* Footer / Summary stats */}
            <div className="p-4 bg-[#0a0e1a] border-t border-slate-800/50">
                <button className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-black py-3 rounded-xl uppercase tracking-widest text-[10px] transition-all">
                    View All Passive Orders
                </button>
            </div>
        </aside>
    );
};

const PulseItem: React.FC<{ order: Order; onClick: () => void }> = ({ order, onClick }) => {
    const elapsed = Math.floor((Date.now() - new Date(order.created_at || (order as any).timestamp || Date.now()).getTime()) / 60000);

    const getStatusStyle = () => {
        switch (order.status) {
            case OrderStatus.READY: return 'border-[#D4AF37] text-[#D4AF37]';
            case OrderStatus.FIRED:
            case OrderStatus.PREPARING: return 'border-[#F59E0B] text-[#F59E0B]';
            default: return 'border-slate-700 text-slate-400';
        }
    };

    return (
        <div
            onClick={onClick}
            className="bg-[#0f172a] hover:bg-[#1e293b] border border-slate-800/50 rounded-xl p-4 transition-all cursor-pointer group"
        >
            <div className="flex justify-between items-start mb-2">
                <div>
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                        #{order.id.slice(-4)} • {order.type}
                    </div>
                    <div className="text-sm font-black text-white group-hover:text-[#D4AF37] transition-colors uppercase">
                        {order.customer_name || 'Anonymous'}
                    </div>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-slate-500">
                    <Clock size={10} />
                    {elapsed}m
                </div>
            </div>

            <div className="flex items-center justify-between mt-4">
                <div className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${getStatusStyle()}`}>
                    {order.status}
                </div>
                <div className="text-slate-300 font-black text-sm">
                    Rs. {Number(order.total).toLocaleString()}
                </div>
            </div>

            <div className="mt-3 overflow-hidden h-1 bg-slate-800 rounded-full">
                <div
                    className={`h-full transition-all duration-700 ${order.status === OrderStatus.READY ? 'bg-[#D4AF37]' : 'bg-[#F59E0B]'}`}
                    style={{ width: order.status === OrderStatus.READY ? '100%' : '50%' }}
                />
            </div>
        </div>
    );
};
