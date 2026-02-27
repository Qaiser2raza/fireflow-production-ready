import React, { useMemo } from 'react';
import { Order, Table } from '../../../shared/types';
import { X, Clock, Users, Receipt, Edit2, CheckCircle2, FileText } from 'lucide-react';

interface OrderDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: Order;
    table: Table;
    onMarkServed: () => Promise<void>;
    onRequestBill: () => Promise<void>;
    onEditInPOS: () => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
    isOpen,
    onClose,
    order,
    table,
    onMarkServed,
    onRequestBill,
    onEditInPOS
}) => {
    const elapsedMinutes = useMemo(() => {
        return Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
    }, [order.created_at]);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'READY': return 'text-gold-500 bg-gold-500/10 border-gold-500/20';
            case 'ACTIVE': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
            case 'CLOSED': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
            case 'CANCELLED': return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
            case 'VOIDED': return 'text-slate-600 bg-slate-600/10 border-slate-600/20';
            default: return 'text-slate-500 bg-slate-500/10 border-slate-500/20';
        }
    };

    const getItemStatusIcon = (itemStatus: string) => {
        if (itemStatus === 'DONE' || itemStatus === 'SERVED') return '✓';
        if (itemStatus === 'PREPARING') return '⏱';
        if (itemStatus === 'PENDING') return '🔥';
        return '○';
    };

    const getItemStatusColor = (itemStatus: string) => {
        if (itemStatus === 'DONE' || itemStatus === 'SERVED') return 'text-green-500';
        if (itemStatus === 'PREPARING') return 'text-blue-500';
        if (itemStatus === 'PENDING') return 'text-orange-500';
        return 'text-slate-500';
    };

    if (!isOpen) return null;

    const items = order.order_items || [];
    const readyItems = items.filter(i => i.item_status === 'DONE' || i.item_status === 'SERVED');
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-[#0f172a] rounded-[32px] w-full max-w-3xl border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">

                {/* Header */}
                <div className="bg-gradient-to-r from-[#1a1f2e] to-[#0f172a] p-6 border-b border-slate-800">
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                                    {table.name}
                                </h2>
                                <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${getStatusColor(order.status)}`}>
                                    {order.status.replace('_', ' ')}
                                </div>
                            </div>
                            <div className="flex items-center gap-4 text-slate-400 text-sm">
                                <div className="flex items-center gap-1.5">
                                    <Receipt size={14} />
                                    <span className="font-mono text-xs">#{order.order_number || order.id.slice(-8).toUpperCase()}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Users size={14} />
                                    <span className="font-bold">{order.guest_count || table.capacity} Guests</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Clock size={14} />
                                    <span className="font-bold">{elapsedMinutes}m ago</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-3 gap-6">

                        {/* Left Column: Items */}
                        <div className="col-span-2 space-y-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                    Order Items ({totalItems})
                                </h3>
                                <span className="text-xs font-bold text-slate-500">
                                    {readyItems.length}/{items.length} Ready
                                </span>
                            </div>

                            <div className="space-y-2">
                                {items.map((item, idx) => (
                                    <div
                                        key={item.id || idx}
                                        className="bg-[#1a1f2e] rounded-xl p-4 border border-slate-800 hover:border-slate-700 transition-all"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-3 flex-1">
                                                <span className={`text-lg ${getItemStatusColor(item.item_status)}`}>
                                                    {getItemStatusIcon(item.item_status)}
                                                </span>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-white font-bold">
                                                            {item.quantity}x {item.menu_item?.name || item.item_name}
                                                        </span>
                                                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${getItemStatusColor(item.item_status)}`}>
                                                            {item.item_status}
                                                        </span>
                                                    </div>
                                                    {item.special_instructions && (
                                                        <p className="text-xs text-slate-500 mt-1">
                                                            Note: {item.special_instructions}
                                                        </p>
                                                    )}
                                                    {item.station && (
                                                        <p className="text-[10px] text-slate-600 mt-1 uppercase tracking-wider">
                                                            Station: {item.station}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-white font-bold">
                                                    Rs. {(item.unit_price * item.quantity).toLocaleString()}
                                                </div>
                                                <div className="text-[10px] text-slate-500">
                                                    @{item.unit_price}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right Column: Timeline & Financials */}
                        <div className="space-y-6">

                            {/* Timeline */}
                            <div>
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                                    Timeline
                                </h3>
                                <div className="space-y-3">
                                    <div className="flex items-start gap-2">
                                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                                        <div>
                                            <p className="text-xs text-white font-bold">Order Created</p>
                                            <p className="text-[10px] text-slate-500">
                                                {new Date(order.created_at).toLocaleTimeString()}
                                            </p>
                                        </div>
                                    </div>
                                    {['ACTIVE', 'READY', 'CLOSED'].includes(order.status as any) && (
                                        <div className="flex items-start gap-2">
                                            <div className="w-2 h-2 rounded-full bg-orange-500 mt-1.5" />
                                            <div>
                                                <p className="text-xs text-white font-bold">Sent to Kitchen</p>
                                                <p className="text-[10px] text-slate-500">~{elapsedMinutes - 2}m ago</p>
                                            </div>
                                        </div>
                                    )}
                                    {['READY', 'CLOSED'].includes(order.status as any) && (
                                        <div className="flex items-start gap-2">
                                            <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5" />
                                            <div>
                                                <p className="text-xs text-white font-bold">Ready to Serve</p>
                                                <p className="text-[10px] text-slate-500">~{Math.max(0, elapsedMinutes - 5)}m ago</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Financials */}
                            <div className="bg-[#1a1f2e] rounded-xl p-4 border border-slate-800">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                                    Financial Summary
                                </h3>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-400">Subtotal</span>
                                        <span className="text-white font-bold">
                                            Rs. {(order.breakdown?.subtotal || order.total).toLocaleString()}
                                        </span>
                                    </div>
                                    {order.service_charge && order.service_charge > 0 && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-400">Service Charge</span>
                                            <span className="text-white font-bold">
                                                Rs. {Math.round(order.service_charge).toLocaleString()}
                                            </span>
                                        </div>
                                    )}
                                    {order.tax && order.tax > 0 && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-400">Tax</span>
                                            <span className="text-white font-bold">
                                                Rs. {Math.round(order.tax).toLocaleString()}
                                            </span>
                                        </div>
                                    )}
                                    <div className="h-px bg-slate-800 my-2" />
                                    <div className="flex justify-between">
                                        <span className="text-sm font-black text-white uppercase">Total</span>
                                        <span className="text-lg font-black text-gold-500">
                                            Rs. {Math.round(order.total).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Quick Stats */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/20">
                                    <div className="text-[10px] text-blue-400 uppercase tracking-wider font-black">
                                        Items
                                    </div>
                                    <div className="text-xl font-black text-white">{totalItems}</div>
                                </div>
                                <div className="bg-green-500/10 rounded-lg p-3 border border-green-500/20">
                                    <div className="text-[10px] text-green-400 uppercase tracking-wider font-black">
                                        Ready
                                    </div>
                                    <div className="text-xl font-black text-white">{readyItems.length}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="bg-[#0a0e1a] p-6 border-t border-slate-800">
                    <div className="flex items-center gap-3">
                        {order.status === 'READY' && (
                            <button
                                onClick={async () => {
                                    await onMarkServed();
                                    onClose();
                                }}
                                className="flex-1 bg-green-600 hover:bg-green-500 text-white font-black py-3 rounded-xl uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 shadow-lg"
                            >
                                <CheckCircle2 size={16} />
                                Mark as Served
                            </button>
                        )}
                        {order.status === 'READY' && (
                            <button
                                onClick={async () => {
                                    await onRequestBill();
                                    onClose();
                                }}
                                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-black py-3 rounded-xl uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 shadow-lg"
                            >
                                <FileText size={16} />
                                Request Bill
                            </button>
                        )}
                        <button
                            onClick={() => {
                                onEditInPOS();
                                onClose();
                            }}
                            className="flex-1 bg-gold-500 hover:bg-gold-400 text-black font-black py-3 rounded-xl uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 shadow-lg"
                        >
                            <Edit2 size={16} />
                            Edit in POS
                        </button>
                    </div>
                </div>

                <style>{`
          .custom-scrollbar::-webkit-scrollbar { width: 6px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
        `}</style>
            </div>
        </div>
    );
};
