import React, { useState, useEffect, useMemo } from 'react';
import { 
    X, CreditCard, Wallet, Banknote, ChevronRight, CheckCircle2, 
    Loader2, User, ShoppingBag, Bike, Smartphone, Hash, 
    Plus, Zap, Utensils
} from 'lucide-react';
import { CustomerComponent } from './CustomerComponent';
import { Order, PaymentBreakdown } from '../../../shared/types';

interface PaymentModalProps {
    order: Order;
    breakdown: PaymentBreakdown;
    onClose: () => void;
    onProcessPayment: (total: number, method: string, tenderedAmount: number, discountReason: string, payments?: { method: string, amount: number }[], customerId?: string | null) => Promise<void>;
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
    const [discountReason] = useState<string>(order?.breakdown?.discountReason || '');
    const [roundToNearest10, setRoundToNearest10] = useState(true);
    
    // Customer State
    const [selectedCustomer, setSelectedCustomer] = useState(customer);
    const [showCustomerLookup, setShowCustomerLookup] = useState(false);

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
        (method !== 'CASH' && method !== 'CREDIT' && parsedTendered === remainingBalance) || // CARD, RAAST, etc.
        (parsedTendered > 0 && !!selectedCustomer && (alreadyPaid + parsedTendered) < finalTotal);

    // Initialize tendered to exact amount when switching (if not cash)
    useEffect(() => {
        if (method !== 'CASH' && method !== 'CREDIT') {
            setTenderedAmount(remainingBalance > 0 ? remainingBalance.toString() : '');
        } else {
            setTenderedAmount('');
        }
        
        // Auto-trigger customer lookup for Khata
        if (method === 'CREDIT' && !selectedCustomer) {
            setShowCustomerLookup(true);
        }
    }, [method, remainingBalance, selectedCustomer]);

    // Smart Suggestions
    const suggestions = useMemo(() => {
        const amount = remainingBalance > 0 ? remainingBalance : finalTotal;
        const opts = new Set<number>();
        opts.add(amount);
        opts.add(Math.ceil(amount / 50) * 50);
        opts.add(Math.ceil(amount / 100) * 100);
        opts.add(Math.ceil(amount / 500) * 500);
        return Array.from(opts).filter(v => v >= amount).sort((a, b) => a - b).slice(0, 3);
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
        setPaymentList(prev => [...prev, { method, amount: amountToApply }]);
        setTenderedAmount('');
    };

    const handleSubmit = async () => {
        if (isProcessing) return;
        setIsProcessing(true);

        try {
            const finalPayments = [...paymentList];
            if (parsedTendered > 0) {
                const amountToApply = Math.min(parsedTendered, finalTotal - alreadyPaid);
                if (amountToApply > 0) {
                    finalPayments.push({ method, amount: amountToApply });
                }
            }
            const paidSoFar = finalPayments.reduce((acc, p) => acc + p.amount, 0);
            if (paidSoFar < finalTotal && selectedCustomer) {
                finalPayments.push({ method: 'CREDIT', amount: finalTotal - paidSoFar });
            }
            if (finalPayments.length === 0) {
                finalPayments.push({ method, amount: finalTotal });
            }

            await onProcessPayment(finalTotal, method, parsedTendered, discountReason, finalPayments, selectedCustomer?.id || customer?.id);
            setCompleted(true);
        } catch (error) {
            console.error("Payment failed", error);
            setIsProcessing(false);
        }
    };

    // Auto-print receipt when payment completes
    useEffect(() => {
        if (completed && onPrintReceipt) {
            // Small delay to let the success UI render before triggering print
            const timer = setTimeout(() => {
                onPrintReceipt().catch(err => console.error('[AutoPrint] Failed:', err));
            }, 600);
            return () => clearTimeout(timer);
        }
    }, [completed]); // intentionally exclude onPrintReceipt to avoid re-triggers

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
                    <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mb-6 animate-pulse">
                        🖨️ Receipt sent to printer...
                    </p>
                    
                    <div className="flex gap-4 w-full">
                        <button
                            onClick={async () => {
                                if (onPrintReceipt) await onPrintReceipt();
                            }}
                            className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-black py-5 rounded-2xl uppercase tracking-widest text-sm transition-all shadow-xl border border-slate-800"
                        >
                            Reprint
                        </button>
                        <button
                            onClick={() => {
                                if (onPaymentCompleteClose) onPaymentCompleteClose();
                                else onClose();
                            }}
                            className="flex-[2] bg-white hover:bg-slate-200 text-black font-black py-5 rounded-2xl uppercase tracking-widest text-sm transition-all shadow-xl"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 animate-in fade-in duration-300 overflow-hidden">
            <div className="w-full max-w-7xl h-full lg:h-[90vh] premium-glass rounded-[2.5rem] flex flex-col overflow-hidden relative">
                
                {/* HEADER */}
                <div className="px-8 py-4 border-b border-white/5 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                            order.type === 'DINE_IN' ? 'bg-indigo-500/20 text-indigo-400' :
                            order.type === 'DELIVERY' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-emerald-500/20 text-emerald-400'
                        }`}>
                            {order.type === 'DINE_IN' ? <Utensils size={24} /> : 
                             order.type === 'DELIVERY' ? <Bike size={24} /> : 
                             <ShoppingBag size={24} />}
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white italic uppercase tracking-tighter leading-none">
                                {order.type === 'DINE_IN' ? `Table ${order.table?.name || '?'}` :
                                 order.type === 'DELIVERY' ? 'Delivery' : 'Takeaway'}
                            </h2>
                            <div className="text-[10px] text-slate-500 font-bold flex items-center gap-2 mt-1">
                                <span className="flex items-center gap-1"><Hash size={12} /> {order.order_number || order.id.slice(0,8)}</span>
                                {selectedCustomer && <span className="flex items-center gap-1 border-l border-white/5 pl-2"><User size={12} /> {selectedCustomer.name}</span>}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Add/Change Customer — available for ALL payment methods */}
                        <button 
                            onClick={() => setShowCustomerLookup(true)} 
                            className={`h-10 px-4 flex items-center gap-2 rounded-xl border text-xs font-black uppercase tracking-wider transition-all ${
                                selectedCustomer 
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20' 
                                    : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-white hover:border-slate-600'
                            }`}
                        >
                            <User size={14} />
                            {selectedCustomer ? selectedCustomer.name?.split(' ')[0] || 'Customer' : 'Add Customer'}
                        </button>
                        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-slate-500 hover:text-white transition-all">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    
                    {/* LEFT: INTERACTION (Fluid & Vertically Adaptive) */}
                    <div className="flex-[1.5] min-w-[500px] flex flex-col p-6 lg:p-8 gap-4 lg:gap-6 overflow-hidden">
                        
                        {/* Method Grid */}
                        <div className="grid grid-cols-6 gap-2 shrink-0">
                            {[
                                { id: 'CASH', label: 'CASH', icon: <Banknote size={16} /> },
                                { id: 'CARD', label: 'CARD', icon: <CreditCard size={16} /> },
                                { id: 'RAAST', label: 'RAAST', icon: <Wallet size={16} /> },
                                { id: 'JAZZCASH', label: 'JAZZ', icon: <Smartphone size={16} /> },
                                { id: 'EASYPAISA', label: 'EP', icon: <Zap size={16} /> },
                                { id: 'CREDIT', label: 'KHATA', icon: <CheckCircle2 size={16} /> }
                            ].map((m) => (
                                <button
                                    key={m.id}
                                    onClick={() => setMethod(m.id)}
                                    className={`method-card h-16 ${method === m.id ? 'method-card-active' : ''}`}
                                >
                                    {m.icon}
                                    <span className="font-black text-[8px] uppercase">{m.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Numpad & Input Zone */}
                        <div className="flex-1 flex gap-6">
                                <div className="flex-1 flex flex-col gap-2 min-h-0">
                                    <div className={`h-16 lg:h-20 shrink-0 bg-black/40 border-2 rounded-2xl px-6 flex justify-between items-center transition-all ${
                                        parsedTendered === 0 ? 'border-white/5' :
                                        parsedTendered === remainingBalance ? 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.1)]' :
                                        parsedTendered > remainingBalance ? 'border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.1)]' :
                                        'border-white/10'
                                    }`}>
                                        <div className="flex flex-col">
                                            <span className="text-slate-600 font-black uppercase tracking-widest text-[8px]">{method} Input</span>
                                            <span className={`text-[10px] font-bold transition-colors ${
                                                remainingBalance === 0 ? 'text-green-500' :
                                                parsedTendered === 0 ? 'text-slate-500' :
                                                parsedTendered === remainingBalance ? 'text-green-400' :
                                                parsedTendered > remainingBalance ? 'text-indigo-400' :
                                                'text-amber-400'
                                            }`}>
                                                {remainingBalance === 0 ? (
                                                    'PAID IN FULL'
                                                ) : parsedTendered === 0 ? (
                                                    `Enter ${method} Amount`
                                                ) : parsedTendered === remainingBalance ? (
                                                    'Exact Amount - Ready to Settle'
                                                ) : parsedTendered > remainingBalance ? (
                                                    `Return Change: Rs. ${change.toLocaleString()}`
                                                ) : (
                                                    `Partial: Rs. ${(remainingBalance - parsedTendered).toLocaleString()} Left`
                                                )}
                                            </span>
                                        </div>
                                        <input
                                            type="text"
                                            value={tenderedAmount}
                                            readOnly
                                            className="text-3xl lg:text-4xl font-mono text-white font-black bg-transparent border-none outline-none text-right w-full placeholder:text-slate-800"
                                            placeholder="0"
                                        />
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 flex-1 min-h-[220px]">
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                                        <button key={n} onClick={() => handleNumpad(n.toString())} className="numpad-key">{n}</button>
                                    ))}
                                    <button onClick={() => handleNumpad('CLEAR')} className="numpad-key !text-xs !text-rose-500 bg-rose-500/5">CLEAR</button>
                                    <button onClick={() => handleNumpad('0')} className="numpad-key">0</button>
                                    <button onClick={() => handleNumpad('DEL')} className="numpad-key !text-slate-500"><ChevronRight className="rotate-180" /></button>
                                </div>
                            </div>

                            {/* Tender Sidebar */}
                            <div className="w-40 flex flex-col gap-3">
                                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Quick Tender</span>
                                {suggestions.map(amt => (
                                    <button key={amt} onClick={() => handleQuickAmount(amt)} className="h-14 method-card">
                                        <span className="text-[7px] font-black text-slate-600 uppercase">Exact</span>
                                        <span className="font-mono text-xs font-black">Rs.{amt}</span>
                                    </button>
                                ))}
                                <button 
                                    onClick={addPayment}
                                    disabled={parsedTendered === 0 || remainingBalance === 0}
                                    className="h-16 mt-auto bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-2xl flex flex-col items-center justify-center disabled:opacity-20"
                                >
                                    <Plus size={16} />
                                    <span className="text-[8px] font-black uppercase mt-1">Add Partial</span>
                                </button>
                            </div>
                        </div>

                        {/* FINAL SETTLE BUTTON */}
                        <button
                            onClick={handleSubmit}
                            disabled={isProcessing || !canComplete}
                            className={`h-24 rounded-[2rem] text-xl font-black uppercase tracking-[0.2em] flex flex-col items-center justify-center gap-1 transition-all relative overflow-hidden group shrink-0 ${
                                isProcessing || !canComplete
                                ? 'bg-slate-900 text-slate-700 border border-white/5'
                                : 'bg-indigo-600 hover:bg-slate-100 hover:text-indigo-600 text-white shadow-2xl shadow-indigo-900/40 active:scale-95'
                            }`}
                        >
                            {isProcessing ? <Loader2 className="animate-spin" /> : (
                                <>
                                    <div className="flex items-center gap-4">
                                        <span>{remainingBalance === 0 ? 'Complete Transaction' : 'Settle Amount'}</span>
                                        <ChevronRight size={24} className="group-hover:translate-x-2 transition-transform" />
                                    </div>
                                    {(method === 'CREDIT' && !selectedCustomer) && (
                                        <span className="text-[10px] text-amber-500 font-bold tracking-widest normal-case animate-pulse">
                                            ⚠️ Attach Patron account to settle Khata
                                        </span>
                                    )}
                                </>
                            )}
                        </button>
                    </div>

                    {/* RIGHT: INVOICE PREVIEW (Fluid & Restricted) */}
                    <div className="flex-1 min-w-[380px] max-w-[520px] bg-black/40 p-8 border-l border-white/5 flex flex-col overflow-y-auto no-scrollbar">
                        <div className="receipt-paper rounded-2xl p-8 flex flex-col min-h-[600px] thermal-fade">
                            <div className="flex flex-col items-center text-center mb-6">
                                <h3 className="text-xl font-black uppercase tracking-tighter">FIREFLOW</h3>
                                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Precision Dining System</div>
                            </div>
                            
                            <div className="border-y border-dashed border-slate-200 py-4 flex flex-col gap-1 mb-6">
                                <div className="flex justify-between text-[10px] font-bold">
                                    <span>INVOICE</span>
                                    <span>#{order.order_number?.slice(-8) || order.id.slice(0,8)}</span>
                                </div>
                                <div className="flex justify-between text-[10px] font-bold">
                                    <span>TABLE</span>
                                    <span>{order.table?.name || '---'}</span>
                                </div>
                                <div className="flex justify-between text-[10px] font-bold">
                                    <span>DATE</span>
                                    <span>{new Date().toLocaleDateString()}</span>
                                </div>
                            </div>

                            <div className="flex-1 space-y-4">
                                {order.order_items?.map((item, i) => (
                                    <div key={i} className="flex flex-col">
                                        <div className="flex justify-between text-xs font-black">
                                            <span>{item.quantity} x {item.item_name}</span>
                                            <span className="font-bold">{(item.total_price || 0).toLocaleString()}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 pt-6 border-t border-slate-200 space-y-2">
                                <div className="flex justify-between text-[10px] font-bold">
                                    <span>SUBTOTAL</span>
                                    <span>Rs. {breakdown.subtotal.toLocaleString()}</span>
                                </div>
                                {breakdown.discount > 0 && (
                                    <div className="flex justify-between text-[10px] font-black text-rose-600 italic">
                                        <span>DISCOUNT</span>
                                        <span>-Rs. {breakdown.discount.toLocaleString()}</span>
                                    </div>
                                )}
                                  {breakdown.tax > 0 && (
                                      <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                          <span>
                                              {breakdown.tax_type === 'INCLUSIVE'
                                                  ? 'INCL. TAX (GST 16%)'
                                                  : 'SALES TAX (GST)'}
                                          </span>
                                          <span>
                                              {breakdown.tax_type === 'INCLUSIVE'
                                                  ? `[Rs. ${Math.round(breakdown.tax).toLocaleString()}]`
                                                  : `Rs. ${Math.round(breakdown.tax).toLocaleString()}`}
                                          </span>
                                      </div>
                                  )}
                                {breakdown.serviceCharge > 0 && (
                                    <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                        <span>SERVICE CHARGE</span>
                                        <span>Rs. {breakdown.serviceCharge.toLocaleString()}</span>
                                    </div>
                                )}
                                {breakdown.deliveryFee > 0 && (
                                    <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                        <span>DELIVERY FEE</span>
                                        <span>Rs. {breakdown.deliveryFee.toLocaleString()}</span>
                                    </div>
                                )}
                                
                                <div className="flex justify-between items-end pt-4 border-t-2 border-slate-900 mt-2">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black uppercase text-slate-400 leading-none mb-1">Grand Total</span>
                                        <span className="text-3xl font-black italic tracking-tighter leading-none">Rs.{finalTotal.toLocaleString()}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <label className="flex items-center gap-1 cursor-pointer scale-75 origin-right">
                                            <span className="text-[9px] font-black text-slate-400 uppercase">Round</span>
                                            <div onClick={() => setRoundToNearest10(!roundToNearest10)} className={`w-8 h-4 rounded-full transition-all relative ${roundToNearest10 ? 'bg-indigo-500' : 'bg-slate-200'}`}>
                                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${roundToNearest10 ? 'right-0.5' : 'left-0.5'}`}></div>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {paymentList.length > 0 && (
                                <div className="mt-6 pt-6 border-t border-dashed border-slate-200 space-y-2">
                                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Paid Ledger</div>
                                    {paymentList.map((p, i) => (
                                        <div key={i} className="flex justify-between text-[10px] font-black">
                                            <span>• {p.method}</span>
                                            <span>Rs. {p.amount.toLocaleString()}</span>
                                        </div>
                                    ))}
                                    {change > 0 && (
                                        <div className="flex justify-between text-[10px] font-black text-indigo-600 pt-2 border-t border-slate-100">
                                            <span>CASH RETURN</span>
                                            <span>Rs. {change.toLocaleString()}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="mt-auto pt-10 flex flex-col items-center">
                                <div className="w-full border-t-2 border-slate-200 border-dotted mb-4"></div>
                                <div className="text-[10px] font-black uppercase tracking-[0.3em] opacity-30">Thank You</div>
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
                                onConfirm={(cust) => {
                                    setSelectedCustomer(cust);
                                    setShowCustomerLookup(false);
                                }}
                                onCancel={() => {
                                    setShowCustomerLookup(false);
                                    setMethod('CASH'); // Fallback if canceled
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
