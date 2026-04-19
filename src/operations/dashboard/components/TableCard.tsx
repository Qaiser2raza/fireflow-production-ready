import React, { useState } from 'react';
import { Table, Order, Staff } from '../../../shared/types';
import { Clock, Users, CheckCircle2, FileText, Eye, Plus, Minus, Unlock } from 'lucide-react';
import { OrderDetailModal } from './OrderDetailModal';

interface TableCardProps {
    table: Table;
    order?: Order;
    onSeat: (count: number) => void;
    onOpenPOS: () => void;
    onMarkServed?: (orderId: string) => Promise<void>;
    onRequestBill?: (orderId: string) => Promise<void>;
    onUpdateStatus?: (status: 'AVAILABLE' | 'OCCUPIED' | 'DIRTY' | 'CLEANING') => Promise<void>;
    currentUser: Staff | null;
}

export const TableCard: React.FC<TableCardProps> = ({
    table,
    order,
    onSeat,
    onOpenPOS,
    onMarkServed,
    onRequestBill,
    onUpdateStatus,
    currentUser
}) => {
    const [guestCount, setGuestCount] = useState(table.capacity || 2);
    const [showDetailModal, setShowDetailModal] = useState(false);

    const getStatusInfo = () => {
        if (table.status === 'DIRTY') {
            return { color: 'border-orange-900 bg-orange-900/10', label: 'DIRTY (Needs Cleaning)', pulse: false };
        }
        if (!order) return { color: 'border-slate-800 bg-[#0f172a]', label: 'AVAILABLE', pulse: false };

        // Priority: Ready > Bill Requested > Active
        if (order.status === 'BILL_REQUESTED') {
            return { color: 'border-white bg-white/20 shadow-[0_0_20px_rgba(255,255,255,0.4)]', label: 'BILL REQUESTED', pulse: true };
        }

        if (order.status === 'READY') {
            return { color: 'border-[#D4AF37] bg-[#D4AF37]/10', label: 'READY TO SERVE', pulse: true };
        }

        if (order.status === 'ACTIVE') {
            const hasFiredItems = order.order_items?.some(i => i.item_status !== 'DRAFT');
            if (!hasFiredItems && order.order_items?.length) {
                return { color: 'border-slate-500 bg-slate-500/10', label: 'HOLDING', pulse: false };
            }
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

    const servedItems = order?.order_items?.filter(item => item.item_status === 'SERVED' || item.item_status === 'DONE') || [];
    const totalItems = order?.order_items?.length || 0;

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
                    <div className={`absolute inset-0 rounded-lg ${order?.status === 'BILL_REQUESTED' ? 'bg-white/10' : 'bg-[#D4AF37]/5'} animate-pulse`} />
                )}

                {/* Urgent Badges - Top Right */}
                <div className="absolute top-2 right-2 flex gap-1 z-30">
                    <button
                        onClick={(e) => { e.stopPropagation(); onUpdateStatus?.('AVAILABLE'); }}
                        className="bg-slate-900/80 hover:bg-red-600 text-slate-500 hover:text-white p-1 rounded backdrop-blur-sm transition-colors shadow-black/50 shadow-lg"
                        title="Force Available (Override)"
                    >
                        <Unlock size={10} />
                    </button>
                    {order && (
                        <>
                            {order.payment_status === 'PAID' && (
                                <span className="bg-emerald-500 text-white text-[8px] font-black px-2 py-0.5 rounded uppercase">
                                    PAID
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
                        </>
                    )}
                </div>

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
                    {table.status === 'DIRTY' ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-center p-6 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                                <span className="text-orange-500 font-black text-[10px] tracking-[0.2em] uppercase italic">Needs Cleaning</span>
                            </div>
                            {/* One-tap clean overlay — now always visible for clarity */}
                            <div className="absolute inset-x-0 bottom-0 bg-black/40 backdrop-blur-md transition-all duration-200 rounded-b-lg flex items-center justify-center p-3 z-20 border-t border-white/5">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onUpdateStatus?.('AVAILABLE'); }}
                                    className="w-full bg-orange-500 hover:bg-orange-400 active:scale-95 text-white font-black py-3 rounded-xl uppercase tracking-widest text-[10px] transition-all shadow-2xl flex items-center justify-center gap-2"
                                >
                                    <CheckCircle2 size={16} />
                                    Mark Cleaned
                                </button>
                            </div>
                        </div>
                    ) : !order ? (
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

                                {/* Bill Amount - Only for Admin/Manager/Cashier */}
                                {['MANAGER', 'CASHIER', 'SUPER_ADMIN', 'ADMIN'].includes(currentUser?.role || '') && (
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
                                    item.item_status === 'DONE' || item.item_status === 'SERVED'
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

                            {/* Context-Aware Primary Action */}
                            <div className="mt-4 relative z-20">
                                {(() => {
                                    if (order.status === 'BILL_REQUESTED') {
                                        return (
                                            <div className="w-full bg-amber-500/10 border border-amber-500/30 text-amber-500 font-black py-2.5 rounded-lg text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
                                              <FileText size={14} />
                                              Awaiting Payment
                                            </div>
                                        );
                                    }
                                    if (order.status === 'READY') {
                                        return (
                                            <button
                                              onClick={(e) => { e.stopPropagation(); handleMarkServed(); }}
                                              className="w-full bg-green-600 hover:bg-green-500 shadow-lg shadow-green-900/40 text-white font-black py-2.5 rounded-lg text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                            >
                                              <CheckCircle2 size={14} />
                                              Mark Served
                                            </button>
                                        );
                                    }
                                    if (currentUser?.role === 'SERVER' || currentUser?.role === 'WAITER') {
                                        if (servedItems.length === totalItems && totalItems > 0) {
                                            return (
                                                <button
                                                  onClick={(e) => { e.stopPropagation(); handleRequestBill(); }}
                                                  className="w-full bg-red-600 hover:bg-red-500 shadow-lg shadow-red-900/40 text-white font-black py-2.5 rounded-lg text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                                >
                                                  <FileText size={14} />
                                                  Request Bill
                                                </button>
                                            );
                                        } else {
                                            // Split button: Edit vs Early Bill
                                            return (
                                                <div className="flex gap-2">
                                                    <button
                                                      onClick={(e) => { e.stopPropagation(); onOpenPOS(); }}
                                                      className="flex-[2] bg-slate-800 hover:bg-slate-700 text-white font-black py-2.5 rounded-lg text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                                      title="Edit Items"
                                                    >
                                                      <Plus size={14} />
                                                      Add
                                                    </button>
                                                    <button
                                                      onClick={(e) => { e.stopPropagation(); handleRequestBill(); }}
                                                      className="flex-[1.5] bg-red-900/40 border border-red-500/20 hover:bg-red-600 text-red-500 hover:text-white font-black py-2.5 rounded-lg text-[9px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5"
                                                      title="Request Bill Early"
                                                    >
                                                      <FileText size={12} />
                                                      Early Bill
                                                    </button>
                                                </div>
                                            );
                                        }
                                    }
                                    
                                    // Fallback / Cooking for Managers/Cashiers who click the table
                                    return (
                                        <div className="flex gap-2">
                                            <button
                                              onClick={(e) => { e.stopPropagation(); onOpenPOS(); }}
                                              className="flex-1 bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 border border-[#D4AF37]/50 text-[#D4AF37] font-black py-2.5 rounded-lg text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                            >
                                              <Plus size={14} />
                                              Add Items
                                            </button>
                                            <button
                                              onClick={(e) => { e.stopPropagation(); setShowDetailModal(true); }}
                                              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-black py-2.5 rounded-lg text-[10px] uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                                            >
                                              <Eye size={14} />
                                              Details
                                            </button>
                                        </div>
                                    );
                                })()}
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
                    currentUser={currentUser}
                />
            )}
        </>
    );
};
