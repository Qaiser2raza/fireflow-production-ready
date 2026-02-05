import React, { useMemo } from 'react';
import { Order, OrderStatus } from '../../../shared/types';
import { X, Clock, FileText, ChevronRight, History, Trash2, Lock } from 'lucide-react';

interface RecallModalProps {
    orders: Order[];
    isOpen: boolean;
    onClose: () => void;
    onSelectOrder: (order: Order) => void;
    onDeleteOrder?: (id: string) => void;
    currentUser: any | null;
}

export const RecallModal: React.FC<RecallModalProps> = ({ orders, isOpen, onClose, onSelectOrder, onDeleteOrder, currentUser }) => {
    const draftOrders = useMemo(() => {
        return orders
            .filter(o => o.status === OrderStatus.DRAFT)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }, [orders]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative w-full max-w-2xl bg-[#0a0e1a] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in duration-300">
                {/* Header */}
                <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-black/20">
                    <div>
                        <h2 className="text-xl font-black text-white uppercase tracking-[0.1em]">Recall Order Drafts</h2>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
                            Showing {draftOrders.length} pending drafts
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl text-slate-500 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {draftOrders.length > 0 ? (
                        draftOrders.map(order => (
                            <div
                                key={order.id}
                                onClick={() => { onSelectOrder(order); onClose(); }}
                                className="group bg-[#0f172a] hover:bg-[#1e293b] border border-slate-800/50 rounded-2xl p-5 flex items-center justify-between transition-all cursor-pointer hover:border-blue-500/50"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                                        <FileText size={24} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-black text-white group-hover:text-blue-400 transition-colors uppercase flex items-center gap-2">
                                            {order.customer_name || 'Anonymous Order'}
                                            {order.type === 'DINE_IN' && order.table?.name && (
                                                <span className="text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-lg text-[10px]">
                                                    {order.table.name}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-slate-500 font-mono mt-1">
                                            <span className="flex items-center gap-1">
                                                <Clock size={12} />
                                                {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <span className="bg-slate-800 px-2 py-0.5 rounded text-[10px] font-black uppercase text-slate-400">
                                                {order.type}
                                            </span>
                                            <span className="text-[10px] text-slate-600 font-bold uppercase">
                                                {order.order_items?.length || 0} Items
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="text-right flex items-center gap-4">
                                    <div>
                                        <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Total Amount</div>
                                        <div className="text-lg font-black text-[#D4AF37]">
                                            Rs. {Number(order.total).toLocaleString()}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <ChevronRight size={20} className="text-slate-700 group-hover:text-white transition-all transform group-hover:translate-x-1" />

                                        {(currentUser?.role === 'MANAGER' || currentUser?.role === 'SUPER_ADMIN') && onDeleteOrder && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (window.confirm('Are you sure you want to delete this draft?')) {
                                                        onDeleteOrder(order.id);
                                                    }
                                                }}
                                                className="p-2.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all border border-red-500/20 shadow-lg"
                                                title="Delete draft forever"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-600">
                            <History size={48} className="mb-4 opacity-20" />
                            <p className="text-sm font-black uppercase tracking-widest opacity-50">No draft orders found</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-black/20 border-t border-slate-800 text-center text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">
                    Drafts are cleared after 24 hours
                </div>
            </div>

            <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
      `}</style>
        </div>
    );
};
