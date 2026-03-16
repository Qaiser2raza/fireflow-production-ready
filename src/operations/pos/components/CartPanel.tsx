import React from 'react';
import { OrderItem, OrderType, Order } from '../../../shared/types';
import { X, Minus, Plus, ShoppingBag, Utensils, Bike, Users, Banknote, Printer, Flame, Loader2 } from 'lucide-react';

interface CartPanelProps {
    // Order Data
    currentOrderItems: OrderItem[];
    orderType: OrderType;
    selectedTableId: string;
    activeOrderId: string | null;
    activeOrderData?: Order;
    isReadOnly?: boolean;

    // Breakdown Data
    breakdown: {
        subtotal: number;
        tax: number;
        serviceCharge: number;
        deliveryFee: number;
        discount: number;
        total: number;
    };

    // Handlers
    onUpdateQuantity: (menuItemId: string, delta: number) => void;
    onOrderAction: (shouldFire: boolean) => void;
    onClose?: () => void;
    onShowDetails?: () => void;
    onShowPayment?: () => void;
    onShowReceipt?: () => void;
    onStartNew?: () => void;
    onTableChange?: () => void;

    // UI State
    isSubmitting?: boolean;
    tables?: any[];
    isOnMobile?: boolean;

    // Display settings
    compact?: boolean; // For mobile compact view
}

export const CartPanel: React.FC<CartPanelProps> = ({
    currentOrderItems,
    orderType,
    selectedTableId,
    activeOrderId,
    activeOrderData,
    isReadOnly = false,
    breakdown,
    onUpdateQuantity,
    onOrderAction,
    onClose,
    onShowDetails,
    onShowPayment,
    onShowReceipt,
    onStartNew,
    isSubmitting = false,
    tables = [],
    compact = false,
}) => {
    const isEmpty = currentOrderItems.length === 0;
    
    return (
        <div className={`bg-[#0B0F19] flex flex-col h-full shrink-0 z-20 shadow-2xl relative ${
            compact ? 'max-h-[60vh]' : ''
        }`}>

            {/* Cart Header */}
            <div className="p-4 md:p-6 border-b border-white/5 bg-slate-950/50 backdrop-blur-md shrink-0">
                <div className="flex justify-between items-center mb-3 md:mb-4">
                    <h2 className="text-lg md:text-xl font-serif font-bold text-white">Current Order</h2>
                    {activeOrderId ? (
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-lg">EDITING</span>
                    ) : (
                        <span className="px-2 py-1 bg-green-500/20 text-green-400 text-[10px] font-black uppercase tracking-widest rounded-lg">NEW</span>
                    )}
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="ml-2 p-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                            title="Close"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>

                {/* Quick Info Cards */}
                <div className={`flex gap-2 ${compact ? 'flex-col' : ''}`}>
                    <button
                        onClick={onShowDetails}
                        className="flex-1 bg-slate-900 border border-slate-800 p-2 md:p-3 rounded-xl flex items-center justify-between group hover:border-gold-500/50 transition-colors text-xs md:text-sm"
                    >
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 md:w-8 md:h-8 rounded-lg bg-slate-800 flex items-center justify-center text-gold-500 shrink-0">
                                {orderType === 'DINE_IN' ? <Utensils size={14} /> : orderType === 'DELIVERY' ? <Bike size={14} /> : <ShoppingBag size={14} />}
                            </div>
                            <div className="text-left hidden md:block">
                                <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Type</div>
                                <div className="text-xs font-bold text-white uppercase">{orderType.replace('_', ' ')}</div>
                            </div>
                        </div>
                    </button>

                    {orderType === 'DINE_IN' && (
                        <button className="flex-1 bg-slate-900 border border-slate-800 p-2 md:p-3 rounded-xl flex items-center justify-between group text-xs md:text-sm">
                            <div className="flex items-center gap-2">
                                <Users size={14} className="text-slate-500 shrink-0" />
                                <div className="text-left hidden md:block">
                                    <div className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Table</div>
                                    <div className="text-xs font-bold text-white">{tables?.find(t => t.id === selectedTableId)?.name || 'Select'}</div>
                                </div>
                            </div>
                        </button>
                    )}
                </div>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 p-3 md:p-4">
                {isEmpty ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                        <ShoppingBag size={40} className="mb-3" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Cart Empty</span>
                    </div>
                ) : (
                    currentOrderItems.map((item, idx) => (
                        <div key={`${item.menu_item_id}-${idx}`} className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-2 md:p-3 flex justify-between items-center group hover:bg-slate-900 transition-colors text-xs md:text-sm">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 md:w-8 md:h-8 rounded-lg bg-slate-950 flex items-center justify-center text-white font-bold text-[10px] md:text-xs border border-slate-800 shrink-0">
                                    {item.quantity}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-xs md:text-sm font-medium text-white truncate">{item.item_name}</div>
                                    <div className="text-[9px] md:text-[10px] text-slate-500 font-mono">Rs. {item.unit_price}</div>
                                </div>
                            </div>

                            {!isReadOnly && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    <button 
                                        onClick={() => onUpdateQuantity(item.menu_item_id, -1)} 
                                        className="w-6 h-6 md:w-8 md:h-8 rounded-lg bg-slate-800 hover:bg-red-500/20 hover:text-red-500 flex items-center justify-center transition-colors"
                                    >
                                        <Minus size={12} className="md:w-4 md:h-4" />
                                    </button>
                                    <button 
                                        onClick={() => onUpdateQuantity(item.menu_item_id, 1)} 
                                        className="w-6 h-6 md:w-8 md:h-8 rounded-lg bg-slate-800 hover:bg-green-500/20 hover:text-green-500 flex items-center justify-center transition-colors"
                                    >
                                        <Plus size={12} className="md:w-4 md:h-4" />
                                    </button>
                                </div>
                            )}
                            <div className="font-bold text-white text-xs md:text-sm font-mono tracking-tight ml-2 shrink-0">
                                Rs. {(item.quantity * item.unit_price).toLocaleString()}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer / Breakdown */}
            <div className="p-3 md:p-6 bg-[#0B0F19] border-t border-white/5 space-y-3 md:space-y-4 shrink-0">
                {/* Breakdown Details */}
                <div className="space-y-1 md:space-y-1.5 text-[8px] md:text-[9px] font-black tracking-widest uppercase">
                    <div className="flex justify-between text-slate-500">
                        <span className="opacity-60">Subtotal</span>
                        <span className="text-white font-mono tracking-normal">Rs. {breakdown.subtotal.toLocaleString()}</span>
                    </div>
                    {breakdown.serviceCharge > 0 && (
                        <div className="flex justify-between text-slate-500">
                            <span className="opacity-60 text-blue-400">Service (5%)</span>
                            <span className="text-white font-mono tracking-normal">Rs. {breakdown.serviceCharge.toLocaleString()}</span>
                        </div>
                    )}
                    {breakdown.tax > 0 && (
                        <div className="flex justify-between text-slate-500">
                            <span className="opacity-60 text-gold-500/80">Tax (16%)</span>
                            <span className="text-white font-mono tracking-normal">Rs. {breakdown.tax.toLocaleString()}</span>
                        </div>
                    )}
                    {breakdown.deliveryFee > 0 && (
                        <div className="flex justify-between text-slate-500">
                            <span className="opacity-60 text-blue-400">Delivery Fee</span>
                            <span className="text-white font-mono tracking-normal">Rs. {breakdown.deliveryFee.toLocaleString()}</span>
                        </div>
                    )}
                </div>

                {/* Total */}
                <div className="flex justify-between items-baseline border-t border-white/5 pt-3 md:pt-4">
                    <span className="text-[8px] md:text-[9px] text-slate-500 font-black tracking-[0.3em] uppercase opacity-60">Total</span>
                    <div className="flex flex-col items-end leading-none">
                        <span className="text-xl md:text-2xl font-black text-white italic tracking-tighter">
                            Rs. {breakdown.total.toLocaleString()}
                        </span>
                    </div>
                </div>

                {/* Actions */}
                {isReadOnly ? (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                        <div className="text-green-500 font-black uppercase tracking-widest text-[9px] md:text-xs mb-1">
                            {activeOrderData?.status.replace(/_/g, ' ')}
                        </div>
                        <div className="text-slate-500 text-[9px] md:text-[10px]">
                            This order is locked for editing.
                        </div>
                        <button onClick={onStartNew} className="mt-2 text-[9px] md:text-xs text-white underline">Start New Order</button>
                    </div>
                ) : (
                    <div className={`flex gap-2 ${compact ? 'flex-col' : ''}`}>
                        <button
                            onClick={onShowReceipt}
                            disabled={isEmpty}
                            className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors disabled:opacity-20 flex-shrink-0"
                            title="Print Preview"
                        >
                            <Printer size={16} className="md:w-5 md:h-5" />
                        </button>

                        <button
                            disabled={isEmpty || isSubmitting}
                            onClick={() => onOrderAction(false)}
                            className="flex-1 bg-slate-900 border border-slate-800/50 h-8 md:h-10 rounded-xl text-slate-500 font-black text-[8px] md:text-[9px] tracking-[0.2em] hover:bg-slate-800 hover:text-white transition-all active:scale-95 disabled:opacity-20 uppercase"
                        >
                            {isSubmitting ? <Loader2 className="animate-spin mx-auto opacity-50 w-3 h-3 md:w-4 md:h-4" /> : 'Save'}
                        </button>

                        <button
                            disabled={isEmpty || isSubmitting}
                            onClick={() => {
                                const hasUnfiredItems = currentOrderItems.some(i => i.item_status === 'DRAFT');
                                hasUnfiredItems ? onOrderAction(true) : onShowPayment?.();
                            }}
                            className={`flex-[1.5] md:flex-[2] h-8 md:h-10 rounded-xl text-white font-black text-[8px] md:text-[9px] tracking-[0.2em] shadow-xl transition-all active:scale-95 disabled:opacity-20 flex items-center justify-center gap-1 md:gap-2 uppercase italic ${
                                currentOrderItems.some(i => i.item_status === 'DRAFT') 
                                    ? 'bg-gradient-to-br from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 shadow-orange-900/40' 
                                    : 'bg-green-600 hover:bg-green-500 shadow-green-900/40'
                            }`}
                        >
                            {isSubmitting ? <Loader2 className="animate-spin w-3 h-3 md:w-4 md:h-4" /> : (
                                <>
                                    {currentOrderItems.some(i => i.item_status === 'DRAFT') ? (
                                        <>
                                            <Flame size={12} className="md:w-4 md:h-4 animate-pulse" />
                                            <span>Fire</span>
                                        </>
                                    ) : (
                                        <>
                                            <Banknote size={12} className="md:w-4 md:h-4" />
                                            <span>Pay</span>
                                        </>
                                    )}
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};