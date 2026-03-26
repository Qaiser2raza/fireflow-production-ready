import React, { useState, useEffect, useMemo } from 'react';
import { 
    X, CreditCard, Wallet, Banknote, ChevronRight, CheckCircle2, 
    Settings2, Loader2, User, Search, UserPlus, Utensils, 
    ShoppingBag, Bike, Smartphone, MapPin, Hash, Trash2, 
    ChevronDown, ChevronUp, Plus, Zap 
} from 'lucide-react';
import { CustomerComponent } from './CustomerComponent';
import { Order, PaymentBreakdown } from '../../../shared/types';

interface PaymentModalProps {
    order: Order;
    breakdown: PaymentBreakdown;
    onClose: () => void;
    onProcessPayment: (total: number, method: string, tenderedAmount: number, discountReason: string, payments?: { method: string, amount: number }[]) => Promise<void>;
    onPrintReceipt?: () => Promise<void>;
    onPaymentCompleteClose?: () => void;
    customer?: any;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
    order,
    breakdown,
    onClose,
    onProcessPayment,
    onPrintReceipt,
    onPaymentCompleteClose,
    customer
}) => {
    // Core State
    const [method, setMethod] = useState<string>('CASH');
    const [tenderedAmount, setTenderedAmount] = useState<string>('');
    const [paymentList, setPaymentList] = useState<{ method: string, amount: number }[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [discountReason, setDiscountReason] = useState<string>(order.breakdown?.discountReason || '');
    const [roundToNearest10, setRoundToNearest10] = useState(true);
    
    // Customer State
    const [selectedCustomer, setSelectedCustomer] = useState(customer);
    const [showCustomerLookup, setShowCustomerLookup] = useState(false);
    const [showAddCustomerForm, setShowAddCustomerForm] = useState(false);

    // UI State
    const [showOrderSummary, setShowOrderSummary] = useState(false);

    // Dynamic Total Calculation
    const finalTotal = useMemo(() => {
        let total = breakdown.total;
        if (roundToNearest10) {
            return Math.ceil(total / 10) * 10;
        }
        return total;
    }, [breakdown, roundToNearest10]);

    // Financial calculations
    const alreadyPaid = useMemo(() => 
        paymentList.reduce((acc, p) => acc + p.amount, 0)
    , [paymentList]);

    const remainingBalance = Math.max(0, finalTotal - alreadyPaid);
    const parsedTendered = parseFloat(tenderedAmount) || 0;
    const change = Math.max(0, (alreadyPaid + parsedTendered) - finalTotal);
    
    const canComplete = remainingBalance === 0 || 
        (method === 'CASH' && parsedTendered >= remainingBalance) || 
        (method === 'CREDIT' && !!selectedCustomer && remainingBalance > 0) ||
        (parsedTendered > 0 && !!selectedCustomer && (alreadyPaid + parsedTendered) < finalTotal); // Partial payment with Khata fallback

    // Initialize tendered to exact amount when switching (if not cash)
    useEffect(() => {
        if (method !== 'CASH' && method !== 'CREDIT') {
            setTenderedAmount(remainingBalance > 0 ? remainingBalance.toString() : '');
        } else {
            setTenderedAmount('');
        }
    }, [method, remainingBalance]);

    // Smart Suggestions
    const suggestions = useMemo(() => {
        const amount = remainingBalance > 0 ? remainingBalance : finalTotal;
        const opts = new Set<number>();
        opts.add(amount);
        opts.add(Math.ceil(amount / 10) * 10);
        opts.add(Math.ceil(amount / 50) * 50);
        opts.add(Math.ceil(amount / 100) * 100);
        opts.add(Math.ceil(amount / 500) * 500);
        return Array.from(opts).filter(v => v >= amount).sort((a, b) => a - b).slice(0, 4);
    }, [remainingBalance, finalTotal]);

    const handleQuickAmount = (amt: number) => {
        setTenderedAmount(amt.toString());
    };

    const handleNumpad = (val: string) => {
        if (val === 'DEL') {
            setTenderedAmount(prev => prev.slice(0, -1));
        } else if (val === 'CLEAR') {
            setTenderedAmount('');
        } else {
            setTenderedAmount(prev => prev + val);
        }
    };

    const addPayment = () => {
        if (parsedTendered <= 0) return;
        const amountToApply = Math.min(parsedTendered, remainingBalance);
        setPaymentList(prev => [...prev.filter(p => p.method === method), { method, amount: amountToApply }]);
        setTenderedAmount('');
    };

    const removePayment = (idx: number) => {
        setPaymentList(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSubmit = async () => {
        if (isProcessing) return;
        setIsProcessing(true);

        try {
            const finalPayments = [...paymentList];
            
            // Handle current input if it contributes to the total
            if (parsedTendered > 0) {
                const amountToApply = Math.min(parsedTendered, finalTotal - alreadyPaid);
                if (amountToApply > 0) {
                    finalPayments.push({ method, amount: amountToApply });
                }
            }

            // Automagically settle remainder via Khata if possible
            const paidSoFar = finalPayments.reduce((acc, p) => acc + p.amount, 0);
            if (paidSoFar < finalTotal && selectedCustomer) {
                finalPayments.push({ method: 'CREDIT', amount: finalTotal - paidSoFar });
            }

            // Fallback: If no payments yet (e.g. pure Cash with exact amount but not 'added')
            if (finalPayments.length === 0 && method !== 'CREDIT') {
                finalPayments.push({ method, amount: finalTotal });
            } else if (finalPayments.length === 0 && method === 'CREDIT') {
                finalPayments.push({ method: 'CREDIT', amount: finalTotal });
            }

            await onProcessPayment(finalTotal, method, parsedTendered, discountReason, finalPayments);
            setCompleted(true);
        } catch (error) {
            console.error("Payment failed", error);
            setIsProcessing(false);
        }
    };

    if (completed) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
                <div className="bg-slate-950 border border-slate-800 rounded-[3rem] p-12 flex flex-col items-center text-center shadow-2xl scale-100 animate-in zoom-in-95 duration-200 max-w-lg w-full relative overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-green-500/50 to-transparent"></div>
                    <div className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center mb-6 border border-green-500/20 shadow-[0_0_30px_rgba(34,197,94,0.1)]">
                        <CheckCircle2 size={48} className="text-green-500" />
                    </div>
                    <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter italic">Payment Successful</h2>
                    <p className="text-slate-500 text-lg mb-8">
                        {change > 0 ? (
                            <>Return Change: <span className="text-green-400 font-black">Rs. {change.toLocaleString()}</span></>
                        ) : (
                            "Transaction completed successfully"
                        )}
                    </p>
                    
                    <div className="flex gap-4 w-full">
                        <button
                            onClick={async () => {
                                if (onPrintReceipt) await onPrintReceipt();
                                if (onPaymentCompleteClose) onPaymentCompleteClose();
                                else onClose();
                            }}
                            className="flex-1 bg-white hover:bg-slate-200 text-black font-black py-5 rounded-2xl uppercase tracking-widest text-sm transition-all shadow-xl font-sans"
                        >
                            Print Receipt
                        </button>
                        <button
                            onClick={() => {
                                if (onPaymentCompleteClose) onPaymentCompleteClose();
                                else onClose();
                            }}
                            className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-black py-5 rounded-2xl uppercase tracking-widest text-sm transition-all shadow-xl font-sans border border-slate-800"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-7xl h-[95vh] bg-[#020617] border border-slate-800/50 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden relative">
                
                {/* DYNAMIC HEADER */}
                <div className="px-10 py-6 border-b border-slate-800/50 bg-slate-900/20 backdrop-blur-md flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-6">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
                            order.type === 'DINE_IN' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' :
                            order.type === 'DELIVERY' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                            'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}>
                            {order.type === 'DINE_IN' ? <Utensils size={28} /> : 
                             order.type === 'DELIVERY' ? <Bike size={28} /> : 
                             <ShoppingBag size={28} />}
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase leading-none">
                                    {order.type === 'DINE_IN' ? `Table ${order.table?.name || order.table_id || '?'}` :
                                     order.type === 'DELIVERY' ? 'Delivery Order' :
                                     `Token #${order.takeaway_orders?.[0]?.token_number || '#' + order.order_number?.slice(-4) || '?'}`}
                                </h2>
                                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-500 text-[9px] font-black tracking-widest uppercase">
                                    {order.type.replace('_', ' ')}
                                </span>
                            </div>
                            <div className="flex items-center gap-4 text-slate-500 text-xs font-bold">
                                <span className="flex items-center gap-1.5"><Hash size={14} className="opacity-50" /> {order.order_number || order.id.slice(0, 8)}</span>
                                {order.type === 'DINE_IN' && order.assigned_waiter_id && (
                                    <span className="flex items-center gap-1.5 border-l border-slate-800 pl-4 ml-1">
                                        <User size={14} className="opacity-50" /> {order.assigned_waiter_id}
                                    </span>
                                )}
                                {order.type === 'DELIVERY' && order.delivery_address && (
                                    <span className="flex items-center gap-1.5 border-l border-slate-800 pl-4 ml-1 max-w-[200px] truncate">
                                        <MapPin size={14} className="opacity-50" /> {order.delivery_address}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-12 h-12 flex items-center justify-center rounded-2xl bg-slate-900 border border-slate-800 text-slate-500 hover:text-white hover:border-slate-700 transition-all active:scale-95"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    
                    {/* LEFT COLUMN: Summary & Ledger */}
                    <div className="w-[480px] border-r border-slate-800/50 bg-slate-900/10 flex flex-col">
                        
                        <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
                            
                            {/* Order Items (Compact) */}
                            <div className="bg-slate-900/40 border border-slate-800/30 rounded-3xl overflow-hidden shrink-0">
                                <button 
                                    onClick={() => setShowOrderSummary(!showOrderSummary)}
                                    className="w-full px-6 py-4 flex items-center justify-between text-slate-400 hover:text-white transition-colors"
                                >
                                    <span className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                                        <ShoppingBag size={14} /> Order Items ({order.order_items?.length || 0})
                                    </span>
                                    {showOrderSummary ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                                {showOrderSummary && (
                                    <div className="px-6 pb-6 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                        {order.order_items?.map((item, idx) => (
                                            <div key={idx} className="flex justify-between items-center text-sm">
                                                <div className="flex items-center gap-3">
                                                    <span className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-400">
                                                        {item.quantity}
                                                    </span>
                                                    <span className="text-slate-300 font-medium">{item.item_name || 'Item'}</span>
                                                </div>
                                                <span className="text-slate-500 font-mono">Rs. {(item.total_price || 0).toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Integrated Customer Card */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-1">
                                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Customer Account</h3>
                                    <button 
                                        onClick={() => setShowCustomerLookup(true)}
                                        className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest transition-colors"
                                    >
                                        {selectedCustomer ? 'Switch Account' : 'Connect Customer'}
                                    </button>
                                </div>

                                {selectedCustomer ? (
                                    <div className="p-6 bg-indigo-500/5 border border-indigo-500/10 rounded-[2rem] relative group overflow-hidden">
                                        <div className="absolute top-0 right-0 p-4 opacity-10">
                                            <User size={64} />
                                        </div>
                                        <div className="relative">
                                            <div className="flex items-center gap-4 mb-4">
                                                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-black text-xl italic">
                                                    {selectedCustomer.name?.[0] || '?'}
                                                </div>
                                                <div>
                                                    <div className="text-lg font-black text-white italic leading-none mb-1">{selectedCustomer.name}</div>
                                                    <div className="text-xs text-slate-500 font-bold">{selectedCustomer.phone}</div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                                                    <div className="text-[9px] font-black text-slate-600 uppercase mb-0.5 tracking-tighter">Current Balance</div>
                                                    <div className="text-sm font-black text-white font-mono">Rs. {(selectedCustomer.balance || 0).toLocaleString()}</div>
                                                </div>
                                                <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                                                    <div className="text-[9px] font-black text-slate-600 uppercase mb-0.5 tracking-tighter">Credit Limit</div>
                                                    <div className="text-sm font-black text-white font-mono">Rs. {(selectedCustomer.credit_limit || 0).toLocaleString()}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => setShowCustomerLookup(true)}
                                        className="w-full p-8 border-2 border-dashed border-slate-800 rounded-[2rem] flex flex-col items-center gap-3 text-slate-500 hover:border-indigo-500/30 hover:text-indigo-400 transition-all group"
                                    >
                                        <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <UserPlus size={24} />
                                        </div>
                                        <div className="text-[10px] font-black uppercase tracking-[0.2em]">Add Customer for Khata / Tracking</div>
                                    </button>
                                )}
                            </div>

                            {/* Payment Ledger */}
                            <div className="space-y-4">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1">Payment Ledger</h3>
                                <div className="space-y-2">
                                    {paymentList.length === 0 ? (
                                        <div className="p-8 text-center bg-slate-900/20 border border-dashed border-slate-800/50 rounded-[2rem] text-slate-600 italic text-xs">
                                            No payments applied yet.
                                        </div>
                                    ) : (
                                        paymentList.map((p, i) => (
                                            <div key={i} className="flex justify-between items-center p-4 bg-slate-900/50 border border-white/5 rounded-2xl group animate-in slide-in-from-left-2 duration-300">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-indigo-400 transition-colors">
                                                        {p.method === 'CASH' && <Banknote size={20} />}
                                                        {p.method === 'CARD' && <CreditCard size={20} />}
                                                        {p.method === 'RAAST' && <Wallet size={20} />}
                                                        {p.method === 'JAZZCASH' && <Smartphone size={20} />}
                                                        {p.method === 'EASYPAISA' && <Zap size={20} />}
                                                        {p.method === 'CREDIT' && <CheckCircle2 size={20} />}
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-black text-white uppercase tracking-widest">{p.method === 'CREDIT' ? 'KHATA (CREDIT)' : p.method}</div>
                                                        <div className="text-[10px] text-slate-600 font-bold uppercase">Settle Amount</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-6">
                                                    <div className="text-xl font-black text-white italic tracking-tighter">Rs. {p.amount.toLocaleString()}</div>
                                                    <button 
                                                        onClick={() => removePayment(i)}
                                                        className="w-10 h-10 flex items-center justify-center text-slate-600 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                        </div>

                        {/* Bottom Summary Block */}
                        <div className="p-10 border-t border-slate-800/50 bg-slate-950 space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-slate-500 font-bold">
                                    <span>Subtotal</span>
                                    <span className="font-mono">Rs. {breakdown.subtotal.toLocaleString()}</span>
                                </div>
                                {breakdown.discount > 0 && (
                                    <div className="flex justify-between text-xs text-rose-500/80 font-bold italic">
                                        <span>Discount ({(breakdown.discountPercent || 0).toFixed(0)}%)</span>
                                        <span className="font-mono">-Rs. {breakdown.discount.toLocaleString()}</span>
                                    </div>
                                )}
                                {(breakdown.tax > 0 || breakdown.serviceCharge > 0 || breakdown.deliveryFee > 0) && (
                                    <div className="flex justify-between text-[10px] text-slate-600 uppercase font-black tracking-widest leading-none pt-1">
                                        <span>Extras (Tax/Service/Fee)</span>
                                        <span className="font-mono">Rs. {(breakdown.tax + breakdown.serviceCharge + breakdown.deliveryFee).toLocaleString()}</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-between items-end pt-4 border-t border-white/5">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 leading-none">Total Payable</span>
                                    <span className="text-5xl font-black text-white italic tracking-tighter leading-none">
                                        <span className="text-xl text-slate-700 font-normal mr-1 not-italic">Rs.</span>
                                        {finalTotal.toLocaleString()}
                                    </span>
                                </div>
                                <div className="text-right flex flex-col gap-1 items-end">
                                    <label className="flex items-center gap-2 cursor-pointer select-none group">
                                        <span className="text-[8px] font-black text-slate-600 group-hover:text-amber-500/50 transition-colors uppercase tracking-[0.2em]">Round to 10</span>
                                        <div 
                                            onClick={() => setRoundToNearest10(!roundToNearest10)}
                                            className={`w-8 h-4 rounded-full transition-all relative ${roundToNearest10 ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-slate-800 border border-slate-700'}`}
                                        >
                                            <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all ${roundToNearest10 ? 'right-0.5 bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'left-0.5 bg-slate-600'}`}></div>
                                        </div>
                                    </label>
                                    <Settings2 size={12} className="text-slate-800" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Numpad & Methods */}
                    <div className="flex-1 bg-black/40 flex flex-col p-10 gap-8">
                        
                        {/* Method Selector */}
                        <div className="grid grid-cols-6 gap-3 shrink-0">
                            {[
                                { id: 'CASH', label: 'CASH', icon: <Banknote size={18} /> },
                                { id: 'CARD', label: 'CARD', icon: <CreditCard size={18} /> },
                                { id: 'RAAST', label: 'RAAST', icon: <Wallet size={18} /> },
                                { id: 'JAZZCASH', label: 'JAZZ', icon: <Smartphone size={18} color="#C41C21" /> },
                                { id: 'EASYPAISA', label: 'EP', icon: <Zap size={18} color="#15B453" /> },
                                { id: 'CREDIT', label: 'KHATA', icon: <CheckCircle2 size={18} /> }
                            ].map((m) => (
                                <button
                                    key={m.id}
                                    onClick={() => setMethod(m.id)}
                                    className={`h-20 rounded-[1.5rem] border flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 ${method === m.id
                                        ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-400 shadow-2xl shadow-indigo-900/20'
                                        : 'border-slate-800 bg-slate-900/30 text-slate-500 hover:bg-slate-900/50 hover:border-slate-700'
                                    }`}
                                >
                                    {m.icon}
                                    <span className="font-black text-[9px] tracking-widest uppercase">{m.label}</span>
                                    {m.id === 'CREDIT' && !selectedCustomer && <span className="text-[7px] font-bold text-rose-500/60 leading-none">Connect</span>}
                                </button>
                            ))}
                        </div>

                        {/* Input Area */}
                        {method === 'CREDIT' && !selectedCustomer ? (
                             <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
                                <div className="w-24 h-24 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-700">
                                    <User size={48} />
                                </div>
                                <div className="max-w-xs">
                                    <h3 className="text-xl font-black text-white italic mb-2 uppercase tracking-tight">Access Khata Accounts</h3>
                                    <p className="text-slate-500 text-xs font-bold leading-relaxed mb-6">Select or register a customer to enable credit sales and partial settlements.</p>
                                    <button 
                                        onClick={() => setShowCustomerLookup(true)}
                                        className="h-14 px-8 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-indigo-900/30 flex items-center gap-3 mx-auto uppercase tracking-widest text-[10px]"
                                    >
                                        <Search size={16} /> Open Customer Hub
                                    </button>
                                </div>
                             </div>
                        ) : (
                            <div className="flex-1 flex gap-10">
                                {/* Large Numpad */}
                                <div className="flex-1 flex flex-col">
                                    <div className={`h-24 bg-slate-900/50 border-2 rounded-[2rem] px-8 flex justify-between items-center transition-all mb-8 ${remainingBalance === 0 ? 'border-green-500/30 bg-green-500/5' : 'border-slate-800'}`}>
                                        <div className="flex flex-col">
                                            <span className="text-slate-600 font-black uppercase tracking-[0.2em] text-[8px] mb-1">Enter {method} Amount</span>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${remainingBalance === 0 ? 'bg-green-500 animate-pulse' : 'bg-slate-700'}`}></div>
                                                <span className={`text-[9px] font-black uppercase tracking-widest ${remainingBalance === 0 ? 'text-green-500' : 'text-slate-500'}`}>
                                                    {remainingBalance === 0 ? 'FULLY SETTLED' : `REQUIRED: Rs. ${remainingBalance.toLocaleString()}`}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <input
                                                type="text"
                                                value={tenderedAmount}
                                                onChange={(e) => setTenderedAmount(e.target.value.replace(/[^0-9]/g, ''))}
                                                className="text-5xl font-mono text-white font-black tracking-tighter bg-transparent border-none outline-none text-right w-full placeholder:text-slate-800"
                                                placeholder="0.00"
                                                autoFocus
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-3 flex-1 pb-4">
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                                            <button key={n} onClick={() => handleNumpad(n.toString())} className="h-full bg-slate-900 border border-slate-800 hover:border-indigo-500/50 text-white text-3xl font-black rounded-[1.5rem] active:scale-95 transition-all shadow-lg hover:bg-indigo-500/5 flex items-center justify-center">
                                                {n}
                                            </button>
                                        ))}
                                        <button onClick={() => handleNumpad('CLEAR')} className="h-full bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/20 text-rose-500 font-black rounded-[1.5rem] uppercase tracking-widest text-[10px] transition-all">Clear</button>
                                        <button onClick={() => handleNumpad('0')} className="h-full bg-slate-900 border border-slate-800 text-3xl font-black rounded-[1.5rem] flex items-center justify-center">0</button>
                                        <button onClick={() => handleNumpad('DEL')} className="h-full bg-slate-900 border border-slate-800 text-slate-500 rounded-[1.5rem] flex items-center justify-center hover:text-white transition-all"><ChevronRight className="rotate-180" size={24} /></button>
                                    </div>
                                </div>

                                {/* Sidebar: Quick Actions */}
                                <div className="w-56 flex flex-col gap-4">
                                    <div className="flex-1 space-y-3 pt-2">
                                        <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4">Quick Tender</h3>
                                        {suggestions.map(amt => (
                                            <button
                                                key={amt}
                                                onClick={() => handleQuickAmount(amt)}
                                                className="w-full h-16 bg-slate-900/50 hover:bg-indigo-500/10 border border-slate-800 hover:border-indigo-500/30 text-white rounded-2xl transition-all flex flex-col items-center justify-center group"
                                            >
                                                <span className="text-[8px] font-black text-slate-600 group-hover:text-indigo-400 uppercase tracking-tighter mb-0.5">Exact Amount</span>
                                                <span className="font-mono text-lg font-black tracking-tighter group-hover:scale-105 transition-transform">Rs. {amt.toLocaleString()}</span>
                                            </button>
                                        ))}
                                        <button
                                             onClick={addPayment}
                                             disabled={parsedTendered === 0 || remainingBalance === 0}
                                             className="w-full h-20 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-black rounded-2xl transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-xs disabled:opacity-20 disabled:grayscale mt-2 group"
                                        >
                                            <Plus size={18} className="group-active:rotate-90 transition-transform" />
                                            Add Entry
                                        </button>
                                    </div>

                                    {/* Status Display */}
                                    <div className={`p-6 rounded-[2rem] border transition-all ${
                                        remainingBalance === 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 
                                        change > 0 ? 'bg-blue-500/10 border-blue-500/30' : 
                                        'bg-rose-500/5 border-rose-500/10'
                                    }`}>
                                        <div className="text-[10px] font-black uppercase tracking-widest mb-2 text-slate-500">
                                            {remainingBalance === 0 ? 'Fully Paid' : change > 0 ? 'Change Due' : 'Balance Due'}
                                        </div>
                                        <div className={`font-mono text-3xl font-black tracking-tighter ${
                                            remainingBalance === 0 ? 'text-emerald-400' : 
                                            change > 0 ? 'text-blue-400' : 
                                            'text-rose-400'
                                        }`}>
                                            Rs. {Math.abs(change > 0 ? change : remainingBalance).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* FINAL ACTION FOOTER */}
                        <div className="pt-4 border-t border-slate-800/50 mt-auto">
                            <button
                                onClick={handleSubmit}
                                disabled={isProcessing || (!canComplete && !selectedCustomer)}
                                className={`w-full h-24 rounded-[2rem] text-2xl font-black uppercase tracking-[0.2em] flex items-center justify-center gap-6 transition-all shadow-2xl relative overflow-hidden group italic ${
                                    isProcessing || (!canComplete && !selectedCustomer)
                                    ? 'bg-slate-900 text-slate-700 border border-slate-800'
                                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/40 hover:scale-[1.01] active:scale-[0.98]'
                                }`}
                            >
                                {isProcessing ? (
                                    <div className="flex items-center gap-4">
                                        <Loader2 className="animate-spin" size={32} />
                                        <span>Authorizing...</span>
                                    </div>
                                ) : (
                                    <>
                                        <span className="relative z-10 flex flex-col items-center">
                                            <span>
                                                {remainingBalance === 0 ? 'Complete & Close' : 
                                                 method === 'CREDIT' ? 'Post remaining to Khata' : 
                                                 !canComplete ? 'Select Method / Connect Khata' : 
                                                 `Charge Rs. ${parsedTendered} & Close`}
                                            </span>
                                            {alreadyPaid > 0 && remainingBalance > 0 && (
                                                <span className="text-[10px] font-black opacity-50 tracking-widest mt-1 not-italic">
                                                    Part Rs. {alreadyPaid} Received • Rs. {remainingBalance} Balance via Khata
                                                </span>
                                            )}
                                        </span>
                                        <ChevronRight size={32} className="group-hover:translate-x-2 transition-transform relative z-10" />
                                        
                                        {/* Animated background on hover */}
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Customer Lookup Overlay */}
            {showCustomerLookup && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                    <div className="w-full max-w-md animate-in zoom-in-95 duration-300">
                        <CustomerComponent 
                            mode="charge-to-account"
                            amount={remainingBalance}
                            orderId={order.id}
                            initialShowAddForm={showAddCustomerForm}
                            onConfirm={(cust) => {
                                setSelectedCustomer(cust);
                                setShowCustomerLookup(false);
                                setShowAddCustomerForm(false);
                            }}
                            onCancel={() => {
                                setShowCustomerLookup(false);
                                setShowAddCustomerForm(false);
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
