import React from 'react';
import { Order, PaymentBreakdown } from '../../../shared/types';
import { X, Printer, ArrowRight, Receipt, DollarSign } from 'lucide-react';

interface BillPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: Order;
    breakdown: PaymentBreakdown;
    onPrintBill: () => void;
    onProceedToSettlement: () => void;
}

export const BillPreviewModal: React.FC<BillPreviewModalProps> = ({
    isOpen,
    onClose,
    order,
    breakdown,
    onPrintBill,
    onProceedToSettlement
}) => {
    if (!isOpen) return null;

    const items = order.order_items || [];
    const total = Math.round(breakdown.total);

    return (
        <div className="fixed inset-0 z-[105] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-[#0f172a] rounded-[32px] w-full max-w-2xl border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">

                {/* Header */}
                <div className="bg-gradient-to-r from-[#1a1f2e] to-[#0f172a] p-6 border-b border-slate-800">
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <Receipt size={24} className="text-gold-500" />
                                <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                                    Bill Preview
                                </h2>
                            </div>
                            <div className="flex items-center gap-4 text-slate-400 text-sm">
                                <span className="font-mono text-xs">
                                    Order #{order.order_number || order.id.slice(-8).toUpperCase()}
                                </span>
                                {order.table && (
                                    <span className="bg-blue-500/10 text-blue-400 px-2 py-1 rounded text-xs font-bold">
                                        {order.table.name}
                                    </span>
                                )}
                                <span className="text-xs">
                                    {order.guest_count} Guest{order.guest_count !== 1 ? 's' : ''}
                                </span>
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

                {/* Bill Content */}
                <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {/* Itemized List */}
                    <div className="space-y-3 mb-6">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                            Order Items
                        </h3>
                        {items.map((item, idx) => (
                            <div
                                key={item.id || idx}
                                className="flex items-center justify-between bg-[#1a1f2e] rounded-xl p-4 border border-slate-800"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-gold-500/10 flex items-center justify-center border border-gold-500/20">
                                        <span className="text-gold-500 font-black text-sm">
                                            {item.quantity}×
                                        </span>
                                    </div>
                                    <div>
                                        <div className="text-white font-bold">
                                            {item.menu_item?.name || item.item_name}
                                        </div>
                                        <div className="text-[10px] text-slate-500 font-mono">
                                            @ Rs. {Number(item.unit_price).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-white font-black">
                                    Rs. {(item.unit_price * item.quantity).toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Financial Breakdown */}
                    <div className="bg-black/30 rounded-2xl p-6 border border-slate-800">
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm text-slate-400 font-bold uppercase">
                                <span>Subtotal</span>
                                <span>Rs. {breakdown.subtotal.toLocaleString()}</span>
                            </div>
                            {breakdown.tax > 0 && (
                                <div className="flex justify-between text-xs text-slate-500 font-bold uppercase">
                                    <span>Tax (GST)</span>
                                    <span>Rs. {Math.round(breakdown.tax).toLocaleString()}</span>
                                </div>
                            )}
                            {breakdown.serviceCharge > 0 && (
                                <div className="flex justify-between text-xs text-slate-500 font-bold uppercase">
                                    <span>Service Charge</span>
                                    <span>Rs. {Math.round(breakdown.serviceCharge).toLocaleString()}</span>
                                </div>
                            )}
                            {breakdown.deliveryFee > 0 && (
                                <div className="flex justify-between text-xs text-slate-500 font-bold uppercase">
                                    <span>Delivery Fee</span>
                                    <span>Rs. {Math.round(breakdown.deliveryFee).toLocaleString()}</span>
                                </div>
                            )}
                            {breakdown.discount > 0 && (
                                <div className="flex justify-between text-xs text-green-500 font-bold uppercase">
                                    <span>Discount</span>
                                    <span>- Rs. {Math.round(breakdown.discount).toLocaleString()}</span>
                                </div>
                            )}
                            <div className="h-px bg-slate-700 my-3" />
                            <div className="flex justify-between items-center">
                                <span className="text-lg font-black text-white uppercase">Total Amount</span>
                                <span className="text-3xl font-black text-gold-500">
                                    Rs. {total.toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Additional Info */}
                    <div className="mt-4 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                        <div className="flex items-center gap-2 text-blue-400 text-xs">
                            <DollarSign size={14} />
                            <span className="font-bold">
                                Bill generated at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="bg-[#0a0e1a] p-6 border-t border-slate-800">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onPrintBill}
                            className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-black py-4 rounded-xl uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 border border-slate-700 shadow-lg"
                        >
                            <Printer size={16} />
                            Print Bill
                        </button>
                        <button
                            onClick={onProceedToSettlement}
                            className="flex-[2] bg-gold-500 hover:bg-gold-400 text-black font-black py-4 rounded-xl uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-gold-500/20"
                        >
                            Proceed to Settlement
                            <ArrowRight size={16} />
                        </button>
                    </div>
                    <p className="text-center text-[10px] text-slate-600 font-bold uppercase tracking-widest mt-4">
                        Review bill before processing payment
                    </p>
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
