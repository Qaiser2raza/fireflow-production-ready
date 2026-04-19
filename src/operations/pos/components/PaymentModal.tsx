import React, { useState, useEffect, useMemo } from 'react';
import {
    X, CreditCard, Wallet, Banknote, ChevronRight, CheckCircle2,
    Loader2, User, ShoppingBag, Bike, Smartphone, Hash,
    Zap, Utensils, Trash2, Plus, AlertTriangle, Printer
} from 'lucide-react';
import { CustomerComponent } from './CustomerComponent';
import { ThermalReceipt } from '../../../shared/components/ThermalReceipt';
import { Order, PaymentBreakdown } from '../../../shared/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentLine {
    method: string;
    amount: number;
    customerId?: string;
    customerName?: string;
}

interface PaymentModalProps {
    order: Order;
    breakdown: PaymentBreakdown;
    onClose: () => void;
    onProcessPayment: (
        total: number,
        method: string,
        tenderedAmount: number,
        discountReason: string,
        payments?: { method: string; amount: number }[],
        customerId?: string | null
    ) => Promise<boolean | void>;
    onPrintReceipt?: (autoPrint?: boolean, finalOrder?: any) => Promise<void>;
    onPaymentCompleteClose?: () => void;
    customer?: any;
}

// ─── Payment Method Config ────────────────────────────────────────────────────

const METHODS = [
    { id: 'CASH',      label: 'CASH',  icon: <Banknote   size={16} />, color: 'emerald' },
    { id: 'CARD',      label: 'CARD',  icon: <CreditCard size={16} />, color: 'blue' },
    { id: 'RAAST',     label: 'RAAST', icon: <Wallet     size={16} />, color: 'violet' },
    { id: 'JAZZCASH',  label: 'JAZZ',  icon: <Smartphone size={16} />, color: 'red' },
    { id: 'EASYPAISA', label: 'EP',    icon: <Zap        size={16} />, color: 'green' },
    { id: 'CREDIT',    label: 'KHATA', icon: <User       size={16} />, color: 'amber' },
];

const METHOD_COLORS: Record<string, string> = {
    CASH:      'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    CARD:      'text-blue-400    bg-blue-500/10    border-blue-500/30',
    RAAST:     'text-violet-400  bg-violet-500/10  border-violet-500/30',
    JAZZCASH:  'text-red-400     bg-red-500/10     border-red-500/30',
    EASYPAISA: 'text-green-400   bg-green-500/10   border-green-500/30',
    CREDIT:    'text-amber-400   bg-amber-500/10   border-amber-500/30',
};

// ─── Component ────────────────────────────────────────────────────────────────
import { useAppContext } from '../../../client/contexts/AppContext';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';

export const PaymentModal: React.FC<PaymentModalProps> = ({
    order,
    breakdown,
    onClose,
    onProcessPayment,
    onPrintReceipt,
    onPaymentCompleteClose,
    customer,
}) => {
    const { currentUser, activeSession, setActiveSession, addNotification } = useAppContext();
    const isCashierWithoutSession = ["CASHIER", "MANAGER"].includes(currentUser?.role || '') && !activeSession;
    
    // Shift inline state
    const [openingFloat, setOpeningFloat] = useState<string>('0');
    const [isOpeningShift, setIsOpeningShift] = useState(false);
    // ── Core state ──────────────────────────────────────────────────────────
    const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
    const [inputMethod,  setInputMethod]  = useState<string>('CASH');
    const [inputAmount,  setInputAmount]  = useState<string>('');
    // BUG-07 FIX: roundToNearest10 is used in finalTotal calc; setter kept with _ prefix as feature placeholder
    const [roundToNearest10, _setRoundToNearest10] = useState(true);

    // ── Customer state ──────────────────────────────────────────────────────
    const [selectedCustomer,   setSelectedCustomer]   = useState<any>(customer || null);
    const [showCustomerLookup, setShowCustomerLookup] = useState(false);
    // Pending customer lookup: after selection, add the staged CREDIT line
    const [pendingCreditAmount, setPendingCreditAmount] = useState<number | null>(null);

    // ── Processing state ────────────────────────────────────────────────────
    const [isProcessing, setIsProcessing] = useState(false);
    const [completed,    setCompleted]    = useState(false);
    const [willPrint,    setWillPrint]    = useState(false);
    const [error,        setError]        = useState<string | null>(null);

    const discountReason = order?.breakdown?.discountReason || '';

    // ── Financial derivations ───────────────────────────────────────────────
    const finalTotal = useMemo(() => {
        const t = breakdown.total;
        return roundToNearest10 ? Math.ceil(t / 10) * 10 : t;
    }, [breakdown, roundToNearest10]);

    const committed = useMemo(
        () => paymentLines.reduce((s, l) => s + l.amount, 0),
        [paymentLines]
    );

    const remaining  = Math.max(0, finalTotal - committed);
    const change     = Math.max(0, committed - finalTotal);
    const parsedInput = parseFloat(inputAmount) || 0;

    // ── Settle gate ─────────────────────────────────────────────────────────
    // Rule: committed >= finalTotal AND every CREDIT line has a customerId
    const creditLinesValid = paymentLines
        .filter(l => l.method === 'CREDIT')
        .every(l => !!l.customerId);

    const pendingInputValid = inputMethod !== 'CREDIT' || !!selectedCustomer;

    // Can settle if either we already added enough lines OR the un-added input covers it.
    const canSettle = 
        (committed >= finalTotal && paymentLines.length > 0 && creditLinesValid) ||
        (committed + parsedInput >= finalTotal && parsedInput > 0 && creditLinesValid && pendingInputValid);

    // ── Live Receipt Preview Order ──────────────────────────────────────────
    const previewOrder = useMemo(() => {
        return {
            ...order,
            customer_name: selectedCustomer?.name || order.customer_name || order.customerName,
            customer_phone: selectedCustomer?.phone || order.customer_phone || order.customerPhone,
            payment_method: inputMethod, // Fallback for when no lines are added yet
            total: finalTotal,
            payment_status: canSettle ? 'PAID' : 'PENDING',
            breakdown: {
                ...breakdown,
                paymentBreakdown: paymentLines.length > 0 || (parsedInput > 0 && committed + parsedInput >= finalTotal)
                     ? [
                         ...paymentLines.map(l => ({ 
                           method: l.method, 
                           amount: l.amount 
                         })),
                         ...(parsedInput > 0 && committed < finalTotal ? [{
                             method: inputMethod,
                             amount: Math.min(parsedInput, remaining)
                         }] : [])
                       ]
                     : []
            }
        };
    }, [order, finalTotal, breakdown, paymentLines, parsedInput, remaining, inputMethod, canSettle, selectedCustomer]);

    // ── Smart quick-tender suggestions ──────────────────────────────────────
    const suggestions = useMemo(() => {
        const base = remaining > 0 ? remaining : finalTotal;
        const opts = new Set<number>();
        opts.add(base);
        opts.add(Math.ceil(base / 50)  * 50);
        opts.add(Math.ceil(base / 100) * 100);
        opts.add(Math.ceil(base / 500) * 500);
        return Array.from(opts).filter(v => v >= base).sort((a, b) => a - b).slice(0, 3);
    }, [remaining, finalTotal]);

    // ── Auto-open customer lookup when switching to CREDIT ──────────────────
    useEffect(() => {
        if (inputMethod === 'CREDIT' && !selectedCustomer) {
            setShowCustomerLookup(true);
        }
    }, [inputMethod]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Numpad ──────────────────────────────────────────────────────────────
    const handleNumpad = (val: string) => {
        if (val === 'DEL')   { setInputAmount(prev => prev.slice(0, -1)); return; }
        if (val === 'CLEAR') { setInputAmount(''); return; }
        // Prevent double decimal
        if (val === '.' && inputAmount.includes('.')) return;
        setInputAmount(prev => prev + val);
    };

    // ── Add payment line ────────────────────────────────────────────────────
    const handleAddLine = () => {
        const amount = Math.min(parsedInput, remaining);
        if (amount <= 0) return;

        if (inputMethod === 'CREDIT') {
            if (!selectedCustomer) {
                // Stage the amount, open customer lookup
                setPendingCreditAmount(amount);
                setShowCustomerLookup(true);
                return;
            }
            // Customer already attached — add directly
            setPaymentLines(prev => [...prev, {
                method:       'CREDIT',
                amount,
                customerId:   selectedCustomer.id,
                customerName: selectedCustomer.name,
            }]);
        } else {
            setPaymentLines(prev => [...prev, { method: inputMethod, amount }]);
        }

        setInputAmount('');
        setError(null);
    };

    // ── Quick shortcuts ─────────────────────────────────────────────────────
    const handleFullKhata = () => {
        if (remaining <= 0) return;
        if (!selectedCustomer) {
            setPendingCreditAmount(remaining);
            setShowCustomerLookup(true);
            return;
        }
        setPaymentLines(prev => [...prev, {
            method:       'CREDIT',
            amount:       remaining,
            customerId:   selectedCustomer.id,
            customerName: selectedCustomer.name,
        }]);
        setInputAmount('');
        setError(null);
    };

    const handleExactRemaining = () => {
        setInputAmount(remaining.toString());
    };

    // ── Remove a line ───────────────────────────────────────────────────────
    const removeLine = (index: number) => {
        setPaymentLines(prev => prev.filter((_, i) => i !== index));
    };

    // ── Customer confirmed from lookup ──────────────────────────────────────
    const handleCustomerConfirmed = (cust: any) => {
        setSelectedCustomer(cust);
        setShowCustomerLookup(false);

        if (pendingCreditAmount !== null && pendingCreditAmount > 0) {
            setPaymentLines(prev => [...prev, {
                method:       'CREDIT',
                amount:       pendingCreditAmount,
                customerId:   cust.id,
                customerName: cust.name,
            }]);
            setPendingCreditAmount(null);
            setInputAmount('');
        }
        setError(null);
    };

    // ── Settlement ──────────────────────────────────────────────────────────
    const handleSubmit = async (shouldPrint: boolean = false) => {
        if (isProcessing || !canSettle) return;
        setError(null);
        setIsProcessing(true);
        setWillPrint(shouldPrint);

        try {
            const finalLines = [...paymentLines];
            let actualTendered = committed;

            // Auto-commit un-added input if it helps us settle
            if (parsedInput > 0 && committed < finalTotal) {
                const amountToAdd = Math.min(parsedInput, remaining);
                finalLines.push({
                    method: inputMethod,
                    amount: amountToAdd,
                    customerId: inputMethod === 'CREDIT' ? selectedCustomer?.id : undefined,
                    customerName: inputMethod === 'CREDIT' ? selectedCustomer?.name : undefined
                });
                actualTendered += parsedInput; // Use their raw input including any change overpayment
            }

            const payments  = finalLines.map(l => ({ method: l.method, amount: l.amount }));
            const creditLine = finalLines.find(l => l.method === 'CREDIT');
            const customerId = creditLine?.customerId || selectedCustomer?.id || null;
            const primaryMethod = finalLines.length === 1
                ? finalLines[0].method
                : (finalLines.find(l => l.method !== 'CREDIT')?.method || finalLines[0].method);

            const success = await onProcessPayment(
                finalTotal,
                primaryMethod,
                actualTendered,       // total tendered including change
                discountReason,
                payments,
                customerId
            );
            
            if (success === false) {
                setIsProcessing(false);
                return;
            }
            
            setCompleted(true);
        } catch (err: any) {
            setError(err?.message || 'Payment failed. Please try again.');
            setIsProcessing(false);
        }
    };

    // ── Auto-print on completion ────────────────────────────────────────────
    useEffect(() => {
        if (completed && onPrintReceipt && willPrint) {
            const t = setTimeout(() => {
                onPrintReceipt(true, previewOrder).catch(e => console.error('[AutoPrint]', e));
                
                // 🔥 SPEED FIX: If we are auto-printing, the clerk is likely done with this order.
                // Automatically close the modal after a short delay so they are back at the menu/floor.
                // This prevents the "Success Screen" from being a hurdle.
                setTimeout(() => {
                    if (onPaymentCompleteClose) onPaymentCompleteClose();
                }, 1000);
            }, 600);
            return () => clearTimeout(t);
        }
    }, [completed, willPrint, previewOrder]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Success Screen ──────────────────────────────────────────────────────
    if (completed) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
                <div className="bg-slate-950 border border-slate-800 rounded-[3rem] p-12 flex flex-col items-center text-center shadow-2xl max-w-lg w-full relative overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-green-500/50 to-transparent" />
                    <div className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center mb-6 border border-green-500/20 shadow-[0_0_30px_rgba(34,197,94,0.1)]">
                        <CheckCircle2 size={48} className="text-green-500" />
                    </div>
                    <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter italic">Payment Successful</h2>
                    <p className="text-slate-500 text-lg mb-4">
                        {change > 0
                            ? <><span>Return Change: </span><span className="text-green-400 font-black">Rs. {change.toLocaleString()}</span></>
                            : 'Transaction completed successfully'}
                    </p>

                    {/* Payment summary */}
                    <div className="w-full bg-slate-900/60 rounded-2xl p-4 mb-6 space-y-1.5">
                        {paymentLines.map((l, i) => (
                            <div key={i} className="flex justify-between text-xs font-bold">
                                <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase ${METHOD_COLORS[l.method] || 'text-slate-400 bg-slate-800 border-slate-700'}`}>
                                    {l.method === 'CREDIT' ? `KHATA — ${l.customerName}` : l.method}
                                </span>
                                <span className="text-white font-mono">Rs. {l.amount.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>

                    <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mb-6 animate-pulse">🖨️ Receipt sent to printer...</p>

                    <div className="flex gap-4 w-full">
                        <button
                            onClick={async () => { if (onPrintReceipt) await onPrintReceipt(true, previewOrder); }}
                            className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-black py-5 rounded-2xl uppercase tracking-widest text-sm transition-all border border-slate-800"
                        >
                            Reprint
                        </button>
                        <button
                            onClick={() => { if (onPaymentCompleteClose) onPaymentCompleteClose(); else onClose(); }}
                            className="flex-[2] bg-white hover:bg-slate-200 text-black font-black py-5 rounded-2xl uppercase tracking-widest text-sm transition-all shadow-xl"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const handleOpenShift = async () => {
        setIsOpeningShift(true);
        try {
            const res = await fetchWithAuth('/api/cashier/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    restaurantId: currentUser?.restaurant_id,
                    staffId: currentUser?.id,
                    openingFloat: Number(openingFloat)
                })
            });
            const data = await res.json();
            if (data.success && data.session) {
                setActiveSession(data.session);
                addNotification('success', 'Shift started successfully.');
            } else {
                addNotification('error', data.error || 'Failed to start shift.');
            }
        } catch (e: any) {
            console.error('Open shift error:', e);
            addNotification('error', e.message || 'Cannot reach server to open shift.');
        } finally {
            setIsOpeningShift(false);
        }
    };

    // ── Main Modal ──────────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 animate-in fade-in duration-300 overflow-hidden">
            <div className="w-full max-w-7xl h-full lg:h-[90vh] premium-glass rounded-[2.5rem] flex flex-col overflow-hidden relative">

                {/* ── HEADER ── */}
                <div className="px-8 py-4 border-b border-white/5 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                            order.type === 'DINE_IN'  ? 'bg-indigo-500/20 text-indigo-400' :
                            order.type === 'DELIVERY' ? 'bg-amber-500/20  text-amber-400'  :
                                                        'bg-emerald-500/20 text-emerald-400'
                        }`}>
                            {order.type === 'DINE_IN'  ? <Utensils    size={24} /> :
                             order.type === 'DELIVERY' ? <Bike        size={24} /> :
                                                         <ShoppingBag size={24} />}
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white italic uppercase tracking-tighter leading-none">
                                {order.type === 'DINE_IN'  ? `Table ${order.table?.name || '?'}` :
                                 order.type === 'DELIVERY' ? 'Delivery' : 'Takeaway'}
                            </h2>
                            <div className="text-[10px] text-slate-500 font-bold flex items-center gap-2 mt-1">
                                <span className="flex items-center gap-1"><Hash size={12} /> {order.order_number || order.id.slice(0, 8)}</span>
                                {selectedCustomer && (
                                    <span className="flex items-center gap-1 border-l border-white/5 pl-2 text-emerald-400">
                                        <User size={12} /> {selectedCustomer.name}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Customer attach button */}
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

                {/* ── BODY ── */}
                {isCashierWithoutSession ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center relative z-10 m-auto">
                        <div className="w-20 h-20 bg-indigo-500/20 rounded-full flex items-center justify-center mb-6 border border-indigo-500/30">
                            <Banknote size={40} className="text-indigo-400" />
                        </div>
                        <h3 className="text-2xl font-black text-white mb-2">Shift Not Started</h3>
                        <p className="text-slate-400 mb-8 max-w-sm">You must open a drawer session before accepting payments.</p>
                        
                        <div className="w-full max-w-xs space-y-4">
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">Rs.</span>
                                <input
                                    type="number"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-2xl py-4 pl-12 pr-4 text-xl font-bold text-white focus:outline-none focus:border-indigo-500 transition-all text-center"
                                    value={openingFloat}
                                    onChange={e => setOpeningFloat(e.target.value)}
                                    placeholder="Starting Float"
                                />
                            </div>
                            <button
                                onClick={handleOpenShift}
                                disabled={isOpeningShift}
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-lg shadow-indigo-900/20"
                            >
                                {isOpeningShift ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
                                START SHIFT
                            </button>
                        </div>
                    </div>
                ) : (
                <div className="flex-1 flex overflow-hidden">

                    {/* ── LEFT: INPUT ENGINE ── */}
                    <div className="flex-[1.5] min-w-[480px] flex flex-col p-6 lg:p-8 gap-4 overflow-hidden">

                        {/* Method Grid */}
                        <div className="grid grid-cols-6 gap-2 shrink-0">
                            {METHODS.map(m => (
                                <button
                                    key={m.id}
                                    onClick={() => setInputMethod(m.id)}
                                    className={`method-card h-16 ${inputMethod === m.id ? 'method-card-active' : ''}`}
                                >
                                    {m.icon}
                                    <span className="font-black text-[8px] uppercase">{m.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Amount Display */}
                        <div className={`h-16 lg:h-20 shrink-0 bg-black/40 border-2 rounded-2xl px-6 flex justify-between items-center transition-all ${
                            parsedInput === 0         ? 'border-white/5' :
                            parsedInput > remaining   ? 'border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.1)]' :
                            parsedInput === remaining ? 'border-green-500/50  shadow-[0_0_15px_rgba(34,197,94,0.1)]'  :
                                                        'border-white/10'
                        }`}>
                            <div className="flex flex-col">
                                <span className="text-slate-600 font-black uppercase tracking-widest text-[8px]">{inputMethod} Input</span>
                                <span className={`text-[10px] font-bold ${
                                    remaining === 0       ? 'text-green-500'  :
                                    parsedInput === 0     ? 'text-slate-500'  :
                                    parsedInput > remaining ? 'text-indigo-400' :
                                    parsedInput === remaining ? 'text-green-400' :
                                                            'text-amber-400'
                                }`}>
                                    {remaining === 0         ? 'FULLY COVERED — READY TO SETTLE' :
                                     parsedInput === 0       ? `Enter ${inputMethod === 'CREDIT' ? 'KHATA' : inputMethod} amount` :
                                     parsedInput > remaining ? `Will give change: Rs. ${(parsedInput - remaining).toLocaleString()}` :
                                     parsedInput === remaining ? 'Exact — covers remaining balance' :
                                                                 `Partial: Rs. ${(remaining - parsedInput).toLocaleString()} still remaining`}
                                </span>
                            </div>
                            <input
                                type="text"
                                value={inputAmount}
                                readOnly
                                className="text-3xl lg:text-4xl font-mono text-white font-black bg-transparent border-none outline-none text-right w-full placeholder:text-slate-800"
                                placeholder="0"
                            />
                        </div>

                        {/* Numpad + Sidebar */}
                        <div className="flex-1 flex gap-4 min-h-0">

                            {/* Numpad */}
                            <div className="flex-1 flex flex-col gap-2 min-h-[220px]">
                                <div className="grid grid-cols-3 gap-2 flex-1">
                                    {[1,2,3,4,5,6,7,8,9].map(n => (
                                        <button key={n} onClick={() => handleNumpad(n.toString())} className="numpad-key">{n}</button>
                                    ))}
                                    <button onClick={() => handleNumpad('CLEAR')} className="numpad-key !text-xs !text-rose-500 bg-rose-500/5">CLR</button>
                                    <button onClick={() => handleNumpad('0')} className="numpad-key">0</button>
                                    <button onClick={() => handleNumpad('DEL')} className="numpad-key !text-slate-500">
                                        <ChevronRight className="rotate-180" size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Action Sidebar */}
                            <div className="w-44 flex flex-col gap-2">
                                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Quick Actions</span>

                                {/* Smart suggestions */}
                                {suggestions.slice(0, 2).map(amt => (
                                    <button
                                        key={amt}
                                        onClick={() => setInputAmount(amt.toString())}
                                        className="h-12 method-card"
                                    >
                                        <span className="text-[7px] font-black text-slate-600 uppercase">Set</span>
                                        <span className="font-mono text-xs font-black">Rs.{amt.toLocaleString()}</span>
                                    </button>
                                ))}

                                {/* Exact remaining shortcut */}
                                {remaining > 0 && (
                                    <button
                                        onClick={handleExactRemaining}
                                        disabled={remaining === 0}
                                        className="h-12 bg-slate-900 border border-slate-700 hover:border-white/20 text-slate-300 rounded-2xl flex flex-col items-center justify-center text-[8px] font-black uppercase tracking-widest transition-all disabled:opacity-30"
                                    >
                                        <span className="text-slate-500">Exact</span>
                                        <span className="font-mono text-xs text-white">Rs.{remaining.toLocaleString()}</span>
                                    </button>
                                )}

                                {/* Full Khata shortcut */}
                                {inputMethod === 'CREDIT' && remaining > 0 && (
                                    <button
                                        onClick={handleFullKhata}
                                        className="h-12 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-2xl flex flex-col items-center justify-center text-[8px] font-black uppercase tracking-widest transition-all hover:bg-amber-500/20"
                                    >
                                        <User size={12} />
                                        <span>Full to KHATA</span>
                                    </button>
                                )}

                                {/* Add Line button */}
                                <button
                                    onClick={handleAddLine}
                                    disabled={parsedInput <= 0 || remaining <= 0}
                                    className="mt-auto h-16 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-2xl flex flex-col items-center justify-center gap-1 disabled:opacity-20 hover:bg-indigo-500/20 transition-all"
                                >
                                    <Plus size={18} />
                                    <span className="text-[8px] font-black uppercase">Add Line</span>
                                </button>
                            </div>
                        </div>

                        {/* Error display */}
                        {error && (
                            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-xs font-bold">
                                <AlertTriangle size={14} className="shrink-0" />
                                {error}
                            </div>
                        )}

                        {/* ── PAYMENT LINES LEDGER ── */}
                        {paymentLines.length > 0 && (
                            <div className="shrink-0 bg-black/30 border border-white/5 rounded-2xl overflow-hidden">
                                <div className="px-4 py-2 border-b border-white/5 flex justify-between items-center">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Payment Lines</span>
                                    <span className="text-[9px] font-mono text-slate-400">
                                        {committed.toLocaleString()} / {finalTotal.toLocaleString()}
                                    </span>
                                </div>
                                <div className="divide-y divide-white/5">
                                    {paymentLines.map((line, i) => (
                                        <div key={i} className="flex items-center justify-between px-4 py-2.5 group">
                                            <div className="flex items-center gap-3">
                                                <span className={`px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase ${METHOD_COLORS[line.method] || 'text-slate-400 bg-slate-800 border-slate-700'}`}>
                                                    {line.method === 'CREDIT' ? 'KHATA' : line.method}
                                                </span>
                                                {line.customerName && (
                                                    <span className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                                                        <User size={10} /> {line.customerName}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="font-mono text-sm font-black text-white">
                                                    Rs. {line.amount.toLocaleString()}
                                                </span>
                                                <button
                                                    onClick={() => removeLine(i)}
                                                    className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Balance summary row */}
                                <div className="px-4 py-2 border-t border-white/5 flex justify-between items-center bg-white/2">
                                    {change > 0 ? (
                                        <span className="text-[10px] font-bold text-indigo-400">
                                            Change to return: Rs. {change.toLocaleString()}
                                        </span>
                                    ) : remaining > 0 ? (
                                        <span className="text-[10px] font-bold text-amber-400">
                                            Still remaining: Rs. {remaining.toLocaleString()}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-bold text-green-400 flex items-center gap-1">
                                            <CheckCircle2 size={11} /> Fully covered
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── SETTLE BUTTONS ── */}
                        <div className="flex gap-2 shrink-0 h-20">
                            <button
                                onClick={() => handleSubmit(false)}
                                disabled={isProcessing || !canSettle}
                                className={`flex-1 rounded-[2rem] text-sm lg:text-lg font-black uppercase tracking-[0.1em] flex items-center justify-center gap-2 transition-all relative overflow-hidden group ${
                                    isProcessing || !canSettle
                                        ? 'bg-slate-900 text-slate-700 border border-white/5'
                                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xl shadow-emerald-900/40 active:scale-95'
                                }`}
                            >
                                {isProcessing ? (
                                    <Loader2 className="animate-spin" size={24} />
                                ) : !canSettle && (committed + parsedInput) === 0 ? (
                                    <span className="text-sm">Enter amount to settle</span>
                                ) : !canSettle && (committed + parsedInput) < finalTotal ? (
                                    <span className="text-sm text-slate-600">
                                        Rs. {(finalTotal - (committed + parsedInput)).toLocaleString()} still uncovered
                                    </span>
                                ) : !canSettle && inputMethod === 'CREDIT' && !selectedCustomer ? (
                                    <span className="text-sm text-amber-500 font-bold">Attach customer for KHATA</span>
                                ) : (
                                    <>
                                        <CheckCircle2 size={24} className="group-hover:scale-110 transition-transform" />
                                        <span>Settle Only</span>
                                    </>
                                )}
                            </button>

                            {canSettle && (
                                <button
                                    onClick={() => handleSubmit(true)}
                                    disabled={isProcessing}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] text-sm lg:text-lg font-black uppercase tracking-[0.1em] flex items-center justify-center gap-2 shadow-2xl shadow-indigo-900/40 active:scale-95 transition-all group"
                                >
                                    <Printer size={24} className="group-hover:scale-110 transition-transform" />
                                    <span>Settle & Print</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ── RIGHT: RECEIPT PREVIEW ── */}
                    <div className="flex-1 min-w-[360px] max-w-[480px] bg-black/40 p-8 border-l border-white/5 flex flex-col overflow-y-auto custom-scrollbar items-center">
                        <div className="scale-90 origin-top w-full flex justify-center">
                            <ThermalReceipt order={previewOrder as any} width="100%" />
                        </div>
                    </div>
                </div>
                )}
            </div>

            {/* ── Customer Lookup Overlay ── */}
            {showCustomerLookup && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
                    <div className="w-full max-w-md animate-in zoom-in-95 duration-300">
                        <CustomerComponent
                            mode="charge-to-account"
                            amount={pendingCreditAmount ?? remaining}
                            orderId={order.id}
                            onConfirm={handleCustomerConfirmed}
                            onCancel={() => {
                                setShowCustomerLookup(false);
                                setPendingCreditAmount(null);
                                // Fall back to CASH if they cancel without picking a customer
                                if (inputMethod === 'CREDIT') setInputMethod('CASH');
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
