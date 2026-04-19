import React, { useState, useEffect, useMemo } from 'react';
import { X, CreditCard, Banknote, QrCode, Smartphone, ArrowRight, Loader2, CheckCircle2, LogIn } from 'lucide-react';
import { Order, PaymentBreakdown } from '../../../shared/types';

interface SettlementModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: Order;
    breakdown: PaymentBreakdown;
    onConfirm: (payload: { method: string, amount: number, reference?: string, tax_exempt?: boolean, tax_type?: string }) => Promise<boolean>;
}

import { useAppContext } from '../../../client/contexts/AppContext';
import { calculateBill, getDefaultBillConfig } from '../../../lib/billEngine';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';

export const SettlementModal: React.FC<SettlementModalProps> = ({
    isOpen, onClose, order, breakdown: initialBreakdown, onConfirm
}) => {
    const { currentUser, operationsConfig, activeSession, setActiveSession, addNotification } = useAppContext();
    const [tax_exempt, setTaxExempt] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'RAAST' | 'JAZZCASH' | 'EASYPAISA'>('CASH');
    const [tenderedAmount, setTenderedAmount] = useState<string>(Math.round(initialBreakdown.total).toString());
    const [reference, setReference] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    // Shift inline state
    const [openingFloat, setOpeningFloat] = useState<string>('0');
    const [isOpeningShift, setIsOpeningShift] = useState(false);

    useEffect(() => {
        setTenderedAmount(Math.round(initialBreakdown.total).toString());
    }, [initialBreakdown.total]);

    if (!isOpen) return null;

    const liveBreakdown = useMemo(() => {
        if (!tax_exempt) return initialBreakdown;
        const config = getDefaultBillConfig(order.type as any, operationsConfig);
        return calculateBill(order.order_items as any || [], {
            ...config,
            tax_exempt: true
        });
    }, [tax_exempt, initialBreakdown, order.type, order.order_items, operationsConfig]);

    const total = Math.round(liveBreakdown.total);
    const tendered = parseFloat(tenderedAmount) || 0;
    const change = Math.max(0, tendered - total);

    const isManager = currentUser?.role === 'MANAGER' || currentUser?.role === 'ADMIN';
    const isCashierWithoutSession = currentUser?.role === 'CASHIER' && !activeSession;

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

    const handleConfirm = async () => {
        if (tendered < total && paymentMethod === 'CASH') {
            alert('Tendered amount must be greater than or equal to total');
            return;
        }

        setIsProcessing(true);
        const success = await onConfirm({
            method: paymentMethod,
            amount: total,
            reference,
            tax_exempt,
            tax_type: (operationsConfig?.order_type_defaults?.[order.type]?.tax_type || 'INCLUSIVE')
        });
        setIsProcessing(false);

        if (success) {
            setIsSuccess(true);
            setTimeout(() => {
                onClose();
                setIsSuccess(false);
            }, 2000);
        }
    };

    return (
        <div className="fixed inset-0 z-[110] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-[#0f172a] p-8 rounded-[40px] w-full max-w-2xl border border-slate-800 shadow-2xl relative overflow-hidden">
                {isSuccess && (
                    <div className="absolute inset-0 bg-[#0f172a] z-50 flex flex-col items-center justify-center animate-in fade-in duration-500">
                        <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
                            <CheckCircle2 size={64} className="text-green-500" />
                        </div>
                        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Paid Successfully</h2>
                        <p className="text-slate-500 font-bold mt-2">Order #{order.id.slice(-4)} Settled</p>
                    </div>
                )}

                <div className="flex justify-between items-center mb-8 relative z-10">
                    <div>
                        <h2 className="text-white font-black text-3xl uppercase tracking-tighter">Settle Bill</h2>
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-1">Order #{order.id.slice(-4)} • {order.type}</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-slate-900 rounded-2xl text-slate-500 hover:text-white transition-all border border-slate-800">
                        <X size={20} />
                    </button>
                </div>

                {isCashierWithoutSession ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center relative z-10">
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
                                {isOpeningShift ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
                                START SHIFT
                            </button>
                        </div>
                    </div>
                ) : (
                <div className="grid grid-cols-2 gap-8 relative z-10">
                    {/* Left: Summary */}
                    <div className="space-y-6">
                        <div className="bg-black/30 p-6 rounded-3xl border border-slate-800">
                            <div className="space-y-3">
                                <div className="flex justify-between text-xs text-slate-400 font-bold uppercase">
                                    <span>Subtotal</span>
                                    <span>Rs. {liveBreakdown.subtotal.toLocaleString()}</span>
                                </div>
                                {liveBreakdown.tax > 0 && (
                                    <div className="flex justify-between text-xs text-slate-500 font-bold uppercase">
                                        <span>Tax</span>
                                        <span>Rs. {Math.round(liveBreakdown.tax).toLocaleString()}</span>
                                    </div>
                                )}
                                {liveBreakdown.serviceCharge > 0 && (
                                    <div className="flex justify-between text-xs text-slate-500 font-bold uppercase">
                                        <span>Service</span>
                                        <span>Rs. {Math.round(liveBreakdown.serviceCharge).toLocaleString()}</span>
                                    </div>
                                )}
                                
                                {isManager && (
                                    <div className="flex justify-between items-center py-2 border-t border-white/5 mt-2">
                                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Tax Exempt</span>
                                        <button 
                                            onClick={() => setTaxExempt(!tax_exempt)}
                                            className={`w-8 h-4 rounded-full relative transition-all ${tax_exempt ? 'bg-amber-500' : 'bg-slate-800'}`}
                                        >
                                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${tax_exempt ? 'right-0.5' : 'left-0.5'}`} />
                                        </button>
                                    </div>
                                )}
                                <div className="h-[1px] bg-slate-800 my-4" />
                                <div className="flex justify-between text-white text-3xl font-black tracking-tighter">
                                    <span>Total</span>
                                    <span className="text-gold-500">Rs. {total.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        {paymentMethod === 'CASH' && (
                            <div className="bg-gold-500/10 p-6 rounded-3xl border border-gold-500/20">
                                <div className="flex justify-between items-center text-gold-500">
                                    <span className="text-xs font-black uppercase tracking-widest">Change Due</span>
                                    <span className="text-2xl font-black">Rs. {change.toLocaleString()}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right: Payment Method */}
                    <div className="space-y-6">
                        <div>
                            <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest ml-1">Payment Method</label>
                            <div className="grid grid-cols-3 gap-2 mt-2">
                                {(['CASH', 'CARD', 'RAAST', 'JAZZCASH', 'EASYPAISA'] as const).map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setPaymentMethod(m)}
                                        className={`py-6 rounded-2xl border flex flex-col items-center gap-2 transition-all ${m === 'JAZZCASH' || m === 'EASYPAISA' ? 'col-span-3 sm:col-span-1' : ''} ${paymentMethod === m ? 'bg-gold-500 border-gold-500 text-black' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'}`}
                                    >
                                        {m === 'CASH' && <Banknote size={20} />}
                                        {m === 'CARD' && <CreditCard size={20} />}
                                        {m === 'RAAST' && <QrCode size={20} />}
                                        {(m === 'JAZZCASH' || m === 'EASYPAISA') && <Smartphone size={20} />}
                                        <span className="text-[9px] font-black uppercase">{m === 'JAZZCASH' ? 'JazzCash' : m === 'EASYPAISA' ? 'EasyPaisa' : m}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {paymentMethod === 'CASH' ? (
                            <div>
                                <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest ml-1">Tendered Amount</label>
                                <div className="relative mt-2">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 font-black">Rs.</span>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 pl-12 text-white text-xl font-black focus:border-gold-500 outline-none"
                                        value={tenderedAmount}
                                        onChange={e => setTenderedAmount(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                <div className="grid grid-cols-3 gap-2 mt-3">
                                    {(() => {
                                        // Intelligent suggested amounts based on total
                                        if (total < 10000) {
                                            // For smaller bills (< Rs. 10,000)
                                            const suggestions = [500, 1000, 5000].filter(amt => amt >= total);

                                            // If none are big enough, round up to nearest 1000
                                            if (suggestions.length === 0) {
                                                const roundUp = Math.ceil(total / 1000) * 1000;
                                                return [roundUp, roundUp + 1000, roundUp + 5000];
                                            }

                                            // Pad with larger denominations if needed
                                            while (suggestions.length < 3) {
                                                const last = suggestions[suggestions.length - 1];
                                                suggestions.push(last + (last >= 1000 ? 5000 : 500));
                                            }
                                            return suggestions;
                                        } else {
                                            // For larger bills (>= Rs. 10,000)
                                            // Base: round up to nearest 1,000
                                            const base = Math.ceil(total / 1000) * 1000;
                                            return [
                                                base,              // e.g., 10,000 for 9,927
                                                base + 5000,       // e.g., 15,000
                                                base + 10000       // e.g., 20,000
                                            ];
                                        }
                                    })().map(amt => (
                                        <button
                                            key={amt}
                                            onClick={() => setTenderedAmount(amt.toString())}
                                            className="py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-black"
                                        >
                                            {amt.toLocaleString()}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div>
                                <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest ml-1">Reference Number</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white font-mono mt-2 focus:border-gold-500 outline-none"
                                    placeholder="Last 4 digits or TXN ID"
                                    value={reference}
                                    onChange={e => setReference(e.target.value)}
                                />
                            </div>
                        )}

                        <button
                            disabled={isProcessing}
                            onClick={handleConfirm}
                            className="w-full py-5 bg-gold-500 text-black rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-gold-400 transition-all flex items-center justify-center gap-3 shadow-2xl shadow-gold-500/20"
                        >
                            {isProcessing ? <Loader2 size={18} className="animate-spin" /> : (
                                <>
                                    Confirm Settlement <ArrowRight size={18} />
                                </>
                            )}
                        </button>
                    </div>
                </div>
                )}
            </div>
        </div>
    );
};

