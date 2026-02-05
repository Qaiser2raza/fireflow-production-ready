import React, { useState } from 'react';
import { Table, Order, OrderStatus, Staff } from '../../../shared/types';
import { Clock, Users, CheckCircle2, FileText, Eye, Edit2, Plus, Minus } from 'lucide-react';
import { OrderDetailModal } from './OrderDetailModal';

interface TableCardProps {
    table: Table;
    order?: Order;
    onSeat: (count: number) => void;
    onOpenPOS: () => void;
    onMarkServed?: (orderId: string) => Promise<void>;
    onRequestBill?: (orderId: string) => Promise<void>;
    currentUser: Staff | null;
}

export const TableCard: React.FC<TableCardProps> = ({
    table,
    order,
    onSeat,
    onOpenPOS,
    onMarkServed,
    onRequestBill,
    currentUser
}) => {
    const [guestCount, setGuestCount] = useState(table.capacity || 2);
    const [showDetailModal, setShowDetailModal] = useState(false);

    const getStatusInfo = () => {
        if (!order) return { color: 'border-slate-800 bg-[#0f172a]', label: 'AVAILABLE', pulse: false };

        // Priority: Bill Requested > Ready > Fired > Occupied
        if (order.status === OrderStatus.BILL_REQUESTED) {
            return { color: 'border-[#FBBF24] bg-[#FBBF24]/10', label: 'BILL REQUESTED', pulse: false };
        }

        if (order.status === OrderStatus.READY) {
            return { color: 'border-[#D4AF37] bg-[#D4AF37]/10', label: 'READY TO SERVE', pulse: true };
        }

        if (order.status === OrderStatus.FIRED || order.status === OrderStatus.PREPARING) {
            return { color: 'border-[#F59E0B] bg-[#F59E0B]/10', label: 'COOKING', pulse: false };
        }

        // Default Occupied (Blue)
        return { color: 'border-[#3B82F6] bg-[#3B82F6]/10', label: 'OCCUPIED', pulse: false };
    };

    const status = getStatusInfo();
    const elapsed = order ? Math.floor((Date.now() - new Date(order.created_at || order.timestamp || 0).getTime()) / 60000) : null;
    const isSlow = elapsed !== null && elapsed > 45;
    const isOverdue = elapsed !== null && elapsed > 60;

    const handleMarkServed = async () => {
        if (order && onMarkServed) {
            await onMarkServed(order.id);
        }
    };

    const handleRequestBill = async () => {
        if (order && onRequestBill) {
            await onRequestBill(order.id);
        }
    };

    // ENHANCED VALIDATION: Bill request only when all items served
    const servedItems = order?.order_items?.filter(item => item.item_status === 'SERVED' || item.item_status === 'READY') || [];
    const totalItems = order?.order_items?.length || 0;
    const canRequestBill = order && totalItems > 0 && servedItems.length === totalItems;
    const billTooltip = !canRequestBill && order
        ? `${servedItems.length}/${totalItems} items served - Need all items served to request bill`
        : 'Request bill from customer';

    return (
        <>
            <div
                onClick={() => {
                    if (order) {
                        setShowDetailModal(true);
                    }
                }}
                className={`
                    relative group rounded-lg border-2 p-3 transition-all duration-300 cursor-pointer
                    ${status.color} shadow-lg 
                    ${status.pulse ? 'animate-gold-pulse' : 'hover:scale-[1.02]'}
                    ${isOverdue ? 'animate-pulse' : ''}
                `}
            >
                {/* Background Micro-animation for Gold Pulse */}
                {status.pulse && (
                    <div className="absolute inset-0 rounded-lg bg-[#D4AF37]/5 animate-pulse" />
                )}

                {/* Urgent Badges - Top Right */}
                {order && (
                    <div className="absolute top-2 right-2 flex gap-1">
                        {order.status === OrderStatus.BILL_REQUESTED && (
                            <span className="bg-yellow-500 text-black text-[8px] font-black px-2 py-0.5 rounded uppercase animate-pulse">
                                BILL REQ
                            </span>
                        )}
                        {isOverdue && (
                            <span className="bg-red-600 text-white text-[8px] font-black px-2 py-0.5 rounded uppercase animate-pulse">
                                OVERDUE
                            </span>
                        )}
                        {isSlow && !isOverdue && (
                            <span className="bg-red-500 text-white text-[8px] font-black px-2 py-0.5 rounded uppercase">
                                SLOW
                            </span>
                        )}
                    </div>
                )}

                <div className="flex justify-between items-start relative z-10">
                    <div>
                        <h3 className="text-lg font-black text-white tracking-tight">{table.name}</h3>
                        {!order && (
                            <div className="flex items-center gap-1 text-slate-400 mt-0.5">
                                <Users size={12} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">
                                    {table.capacity} SEATS
                                </span>
                            </div>
                        )}
                    </div>

                    {order && (
                        <div className={`flex flex-col items-end ${isOverdue ? 'text-[#EF4444]' : isSlow ? 'text-[#F59E0B]' : 'text-slate-400'}`}>
                            <div className="flex items-center gap-1">
                                <Clock size={12} />
                                <span className="font-mono text-xs font-bold">{elapsed}m</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-3 relative z-10">
                    {!order ? (
                        <div className="space-y-2">
                            {/* Always-visible Guest Controls */}
                            <div className="flex items-center justify-between bg-slate-900/50 rounded-lg p-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setGuestCount(Math.max(1, guestCount - 1)); }}
                                    className="p-1.5 hover:bg-slate-800 rounded transition-colors"
                                >
                                    <Minus size={14} className="text-slate-400" />
                                </button>
                                <div className="flex items-center gap-1.5">
                                    <Users size={14} className="text-slate-400" />
                                    <span className="text-lg font-black text-white">{guestCount}</span>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setGuestCount(Math.min(table.capacity + 2, guestCount + 1)); }}
                                    className="p-1.5 hover:bg-slate-800 rounded transition-colors"
                                >
                                    <Plus size={14} className="text-slate-400" />
                                </button>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); onSeat(guestCount); }}
                                className="w-full bg-[#3B82F6] hover:bg-blue-400 text-white font-black py-2.5 rounded-lg uppercase tracking-widest text-[10px] transition-all shadow-lg active:scale-95"
                            >
                                Seat Now
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {/* Guest Count + Bill Amount (role-based) */}
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-1.5 text-slate-400">
                                    <Users size={12} />
                                    <span className="text-[10px] font-bold">{order.guest_count} GUESTS</span>
                                </div>

                                {/* Bill Amount - Only for Manager/Cashier */}
                                {(currentUser?.role === 'MANAGER' || currentUser?.role === 'CASHIER') && (
                                    <div className="text-right">
                                        <span className="text-[9px] text-slate-500 uppercase tracking-wider block">Total</span>
                                        <span className="text-base font-black text-white">
                                            Rs. {Number(order.total).toLocaleString()}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Order Progress Bar - Item-Based */}
                            {(() => {
                                const items = order.order_items || [];
                                const totalItems = items.length;
                                const readyItems = items.filter(item =>
                                    item.item_status === 'READY' || item.item_status === 'SERVED'
                                ).length;
                                const progress = totalItems > 0 ? Math.round((readyItems / totalItems) * 100) : 0;

                                return (
                                    <div className="mt-3">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Progress</span>
                                            <span className="text-[10px] font-mono font-bold text-white">
                                                {readyItems}/{totalItems} items ({progress}%)
                                            </span>
                                        </div>
                                        <div className="h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                                            <div
                                                className={`h-full transition-all duration-1000 ease-out ${progress === 100 ? 'bg-green-500' :
                                                    progress >= 75 ? 'bg-[#D4AF37]' :
                                                        progress >= 25 ? 'bg-blue-500' : 'bg-slate-600'
                                                    }`}
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Quick Action Menu on Hover */}
                            <div className="absolute inset-x-5 bottom-5 opacity-0 group-hover:opacity-100 transition-all duration-200 space-y-1.5">
                                {order.status === OrderStatus.READY && onMarkServed && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleMarkServed(); }}
                                        className="w-full bg-green-600/90 backdrop-blur-md border border-green-500/30 hover:bg-green-500 text-white font-black py-2 rounded-lg text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                    >
                                        <CheckCircle2 size={12} />
                                        Mark Served
                                    </button>
                                )}
                                {(order.status === OrderStatus.SERVED || order.status === OrderStatus.READY) && onRequestBill && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (canRequestBill) {
                                                handleRequestBill();
                                            }
                                        }}
                                        disabled={!canRequestBill}
                                        title={billTooltip}
                                        className={`w-full backdrop-blur-md border text-white font-black py-2 rounded-lg text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${canRequestBill
                                                ? 'bg-red-600/90 border-red-500/30 hover:bg-red-500 cursor-pointer'
                                                : 'bg-gray-700/50 border-gray-600/30 cursor-not-allowed opacity-60'
                                            }`}
                                    >
                                        <FileText size={12} />
                                        {canRequestBill ? 'Request Bill' : `Bill (${servedItems.length}/${totalItems})`}
                                    </button>
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowDetailModal(true); }}
                                    className="w-full bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/20 text-white font-black py-2 rounded-lg text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                >
                                    <Eye size={12} />
                                    View Details
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onOpenPOS(); }}
                                    className="w-full bg-gold-500/90 backdrop-blur-md border border-gold-400/30 hover:bg-gold-400 text-black font-black py-2 rounded-lg text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                >
                                    <Edit2 size={12} />
                                    Edit Order
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* CSS for Gold Pulse */}
                <style>{`
                    @keyframes gold-pulse {
                        0% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.4); }
                        70% { box-shadow: 0 0 0 10px rgba(212, 175, 55, 0); }
                        100% { box-shadow: 0 0 0 0 rgba(212, 175, 55, 0); }
                    }
                    .animate-gold-pulse {
                        animation: gold-pulse 2s infinite;
                    }
                `}</style>
            </div>

            {/* Order Detail Modal */}
            {order && showDetailModal && (
                <OrderDetailModal
                    isOpen={showDetailModal}
                    onClose={() => setShowDetailModal(false)}
                    order={order}
                    table={table}
                    onMarkServed={handleMarkServed}
                    onRequestBill={handleRequestBill}
                    onEditInPOS={onOpenPOS}
                />
            )}
        </>
    );
};
