import React, { useState, useEffect, useMemo } from 'react';
import { X, CreditCard, Wallet, Banknote, ChevronRight, CheckCircle2, Settings2 } from 'lucide-react';
import { Order, PaymentBreakdown } from '../../../shared/types';

interface PaymentModalProps {
    order: Order;
    breakdown: PaymentBreakdown; // We should pass the calculated breakdown
    onClose: () => void;
    onProcessPayment: (amount: number, method: 'CASH' | 'CARD' | 'RAAST' | 'RIDER_WALLET', tenderedAmount?: number) => Promise<void>;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
    order,
    breakdown,
    onClose,
    onProcessPayment
}) => {
    const [method, setMethod] = useState<'CASH' | 'CARD' | 'RAAST'>('CASH');
    const [tenderedAmount, setTenderedAmount] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [completed, setCompleted] = useState(false);

    // Toggles for adjustments
    const [applyTax, setApplyTax] = useState(true);
    const [applyServiceCharge, setApplyServiceCharge] = useState(true);
    const [roundToNearest10, setRoundToNearest10] = useState(true);

    // Dynamic Total Calculation
    const finalTotal = useMemo(() => {
        let total = breakdown.subtotal;
        if (applyTax) total += breakdown.tax;
        if (applyServiceCharge) total += breakdown.serviceCharge;
        total -= breakdown.discount;
        total += breakdown.deliveryFee;

        if (roundToNearest10) {
            return Math.ceil(total / 10) * 10;
        }
        return total;
    }, [breakdown, applyTax, applyServiceCharge, roundToNearest10]);

    // Initialize tendered to exact amount when switching to non-cash
    useEffect(() => {
        if (method !== 'CASH') {
            setTenderedAmount(finalTotal.toString());
        } else {
            setTenderedAmount('');
        }
    }, [method, finalTotal]);

    // Smart Suggestions
    const suggestions = useMemo(() => {
        const amount = finalTotal;
        const opts = new Set<number>();

        opts.add(amount); // Exact
        opts.add(Math.ceil(amount / 10) * 10);
        opts.add(Math.ceil(amount / 50) * 50);
        opts.add(Math.ceil(amount / 100) * 100);
        opts.add(Math.ceil(amount / 500) * 500);
        opts.add(Math.ceil(amount / 1000) * 1000);
        if (amount < 5000) opts.add(5000);

        return Array.from(opts).filter(v => v >= amount).sort((a, b) => a - b).slice(0, 5);
    }, [finalTotal]);

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

    const parsedTendered = parseFloat(tenderedAmount) || 0;
    const change = parsedTendered - finalTotal;
    const sufficientFunds = parsedTendered >= finalTotal;

    const handleSubmit = async () => {
        if (!sufficientFunds && method === 'CASH') return;

        setIsProcessing(true);
        try {
            await onProcessPayment(finalTotal, method, parsedTendered);
            setCompleted(true);
            setTimeout(() => {
                onClose();
            }, 2000);
        } catch (error) {
            console.error("Payment failed", error);
            setIsProcessing(false);
        }
    };

    if (completed) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 flex flex-col items-center text-center shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
                    <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
                        <CheckCircle2 size={48} className="text-green-500" />
                    </div>
                    <h2 className="text-3xl font-bold text-white mb-2">Payment Successful!</h2>
                    <p className="text-slate-400 text-lg">Change Due: <span className="text-white font-bold">Rs. {change > 0 ? change.toLocaleString() : 0}</span></p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-6xl h-[90vh] bg-[#0B0F19] border border-slate-800 rounded-3xl shadow-2xl flex overflow-hidden">

                {/* LEFT COLUMN: Order Summary & Settings */}
                <div className="w-[350px] bg-slate-900/50 border-r border-slate-800 flex flex-col h-full">
                    <div className="p-6 border-b border-slate-800">
                        <h2 className="text-xl font-bold text-white mb-1">Order Summary</h2>
                        <div className="text-slate-500 text-sm">#{order.order_number || order.id.slice(0, 8)}</div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                        {order.order_items?.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                                <div className="text-slate-300">
                                    <span className="font-bold text-white">{item.quantity}x</span> {item.menu_item?.name || 'Item'}
                                </div>
                                <div className="text-slate-400 font-mono">
                                    {((item.total_price || 0)).toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Adjustments */}
                    <div className="p-6 border-t border-slate-800 bg-slate-900/30 space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-sm text-slate-400 flex items-center gap-2 cursor-pointer select-none">
                                <input type="checkbox" checked={applyTax} onChange={e => setApplyTax(e.target.checked)} className="rounded bg-slate-800 border-slate-700 text-gold-500 focus:ring-0" />
                                Apply Tax
                            </label>
                            <span className="text-slate-500 text-xs font-mono">{breakdown.tax.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <label className="text-sm text-slate-400 flex items-center gap-2 cursor-pointer select-none">
                                <input type="checkbox" checked={applyServiceCharge} onChange={e => setApplyServiceCharge(e.target.checked)} className="rounded bg-slate-800 border-slate-700 text-gold-500 focus:ring-0" />
                                Service Charge
                            </label>
                            <span className="text-slate-500 text-xs font-mono">{breakdown.serviceCharge.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <label className="text-sm text-slate-400 flex items-center gap-2 cursor-pointer select-none">
                                <input type="checkbox" checked={roundToNearest10} onChange={e => setRoundToNearest10(e.target.checked)} className="rounded bg-slate-800 border-slate-700 text-gold-500 focus:ring-0" />
                                Round to 10
                            </label>
                            <Settings2 size={12} className="text-slate-600" />
                        </div>
                    </div>

                    {/* Totals */}
                    <div className="p-6 bg-slate-900 border-t border-slate-800">
                        <div className="flex justify-between text-slate-400 mb-2">
                            <span>Subtotal</span>
                            <span>{breakdown.subtotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-end pt-4 border-t border-slate-800/50">
                            <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Payable Total</span>
                            <span className="text-3xl font-black text-white italic">
                                <span className="text-lg text-slate-600 font-normal mr-1">Rs.</span>
                                {finalTotal.toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Payment Interface */}
                <div className="flex-1 flex flex-col bg-[#0B0F19] relative">
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-800 text-slate-500 hover:text-white transition-colors z-10"
                    >
                        <X size={24} />
                    </button>

                    <div className="p-8 pb-0">
                        <div className="grid grid-cols-3 gap-4">
                            {['CASH', 'CARD', 'RAAST'].map((m) => (
                                <button
                                    key={m}
                                    onClick={() => setMethod(m as any)}
                                    className={`h-20 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${method === m
                                        ? 'border-gold-500/50 bg-gold-500/10 text-gold-400 shadow-lg shadow-gold-900/10'
                                        : 'border-slate-800 bg-slate-900/50 text-slate-500 hover:bg-slate-900 hover:border-slate-700'
                                        }`}
                                >
                                    {m === 'CASH' && <Banknote size={24} />}
                                    {m === 'CARD' && <CreditCard size={24} />}
                                    {m === 'RAAST' && <Wallet size={24} />}
                                    <span className="font-bold text-xs tracking-widest">{m}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 p-8 flex flex-col gap-6 overflow-hidden">
                        {method === 'CASH' ? (
                            <div className="flex gap-6 h-full">
                                {/* Numpad & Input */}
                                <div className="flex-1 flex flex-col">
                                    <div className={`bg-slate-900/50 border-2 rounded-2xl p-6 mb-6 flex justify-between items-center transition-colors ${sufficientFunds ? 'border-green-500/30' : 'border-slate-800'}`}>
                                        <div className="flex flex-col">
                                            <span className="text-slate-500 font-bold uppercase tracking-widest text-[8px]">Tendered Amount</span>
                                            {sufficientFunds && change > 0 && (
                                                <div className="flex items-center gap-1.5 mt-1 text-green-400 animate-in slide-in-from-left-2 transition-all">
                                                    <Banknote size={12} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">Return: Rs. {change.toLocaleString()}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-5xl font-mono text-white font-bold tracking-tighter">
                                            {parsedTendered > 0 ? parsedTendered.toLocaleString() : <span className="text-slate-700">0</span>}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-3 flex-1">
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                                            <button key={n} onClick={() => handleNumpad(n.toString())} className="bg-slate-800 hover:bg-slate-700 text-white text-3xl font-bold rounded-xl active:scale-95 transition-all shadow-lg border-b-4 border-slate-900 active:border-b-0 active:translate-y-1">
                                                {n}
                                            </button>
                                        ))}
                                        <button onClick={() => handleNumpad('CLEAR')} className="bg-red-900/20 hover:bg-red-900/30 text-red-400 font-bold rounded-xl uppercase tracking-widest text-xs border border-red-900/30">Clear</button>
                                        <button onClick={() => handleNumpad('0')} className="bg-slate-800 hover:bg-slate-700 text-white text-3xl font-bold rounded-xl border-b-4 border-slate-900 active:border-b-0 active:translate-y-1">0</button>
                                        <button onClick={() => handleNumpad('DEL')} className="bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl"><ChevronRight className="rotate-180 mx-auto" /></button>
                                    </div>
                                </div>

                                {/* Sidebar: Suggestions & Change */}
                                <div className="w-64 flex flex-col gap-3">
                                    <div className="space-y-2">
                                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">One-Tap Cash</div>
                                        {suggestions.map(amt => (
                                            <button
                                                key={amt}
                                                onClick={() => handleQuickAmount(amt)}
                                                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-mono text-lg rounded-xl border border-slate-700 transition-colors flex justify-between px-4"
                                            >
                                                <span className="text-slate-500 text-sm">Rs.</span>
                                                <span className="font-bold">{amt.toLocaleString()}</span>
                                            </button>
                                        ))}
                                    </div>

                                    <div className={`mt-auto p-6 rounded-2xl border-2 transition-all ${sufficientFunds ? 'bg-green-500/10 border-green-500/50' : 'bg-red-500/5 border-red-500/20'}`}>
                                        <div className="text-xs text-slate-400 font-bold uppercase mb-1">
                                            {sufficientFunds ? 'Change Due' : 'More Required'}
                                        </div>
                                        <div className={`text-3xl font-black font-mono tracking-tighter ${sufficientFunds ? 'text-green-400' : 'text-red-400'}`}>
                                            Rs. {Math.abs(change).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center">
                                <div className="w-32 h-32 rounded-full bg-slate-900 border-4 border-slate-800 flex items-center justify-center mb-8 animate-pulse">
                                    {method === 'CARD' ? <CreditCard size={64} className="text-blue-500" /> : <Wallet size={64} className="text-teal-500" />}
                                </div>
                                <h3 className="text-2xl font-bold text-white mb-2">Process {method} Payment</h3>
                                <div className="bg-slate-900 px-6 py-3 rounded-xl border border-slate-800">
                                    <span className="text-slate-500 mr-2">Amount to Charge:</span>
                                    <span className="text-white font-bold text-xl">Rs. {finalTotal.toLocaleString()}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ALWAYS VISIBLE FOOTER */}
                    <div className="p-8 pt-0 mt-auto">
                        <button
                            onClick={handleSubmit}
                            disabled={isProcessing || (method === 'CASH' && !sufficientFunds)}
                            className={`w-full h-20 rounded-2xl text-2xl font-black uppercase tracking-widest flex items-center justify-center gap-4 transition-all shadow-xl ${isProcessing || (method === 'CASH' && !sufficientFunds)
                                ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/50 hover:scale-[1.01] active:scale-[0.99]'
                                }`}
                        >
                            {isProcessing ? (
                                <>Processing...</>
                            ) : (
                                <>
                                    <div className="flex flex-col items-center leading-tight">
                                        <span>Complete & Close</span>
                                        {method === 'CASH' && sufficientFunds && change > 0 && (
                                            <span className="text-[10px] text-indigo-200 font-bold opacity-80 tracking-widest mt-1">
                                                Return Change: Rs. {change.toLocaleString()}
                                            </span>
                                        )}
                                    </div>
                                    <ChevronRight size={28} />
                                </>
                            )}
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
};
