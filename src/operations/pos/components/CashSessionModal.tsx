import React, { useState, useEffect } from 'react';
import { X, Banknote, HandCoins, AlertTriangle, CheckCircle2, Calculator } from 'lucide-react';
import { useAppContext } from '../../../client/contexts/AppContext';

interface CashSessionModalProps {
    mode: 'OPEN' | 'CLOSE';
    onClose: () => void;
    onSuccess: () => void;
}

export const CashSessionModal: React.FC<CashSessionModalProps> = ({ mode, onClose, onSuccess }) => {
    const { currentUser, activeSession, addNotification } = useAppContext();
    const [loading, setLoading] = useState(false);
    const [openingFloat, setOpeningFloat] = useState('');
    const [actualCash, setActualCash] = useState('');
    const [withdrawnAmount, setWithdrawnAmount] = useState('');
    const [notes, setNotes] = useState('');
    const [summary, setSummary] = useState<any>(null);

    const fmt = (val: any) => `Rs. ${Number(val || 0).toLocaleString('en-PK')}`;

    useEffect(() => {
        if (mode === 'CLOSE' && activeSession) {
            fetchSummary();
        }
    }, [mode, activeSession]);

    const fetchSummary = async () => {
        try {
            const res = await fetch(`/api/cashier/${activeSession.id}/summary`);
            const d = await res.json();
            if (d.success) setSummary(d.summary);
        } catch (e) {
            console.error('Failed to fetch session summary');
        }
    };

    const handleOpen = async () => {
        if (!openingFloat) return addNotification('error', 'Enter opening float');
        if (!currentUser) return addNotification('error', 'Not logged in');
        setLoading(true);
        try {
            const res = await fetch('/api/cashier/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    restaurantId: currentUser.restaurant_id,
                    staffId: currentUser.id,
                    openingFloat: Number(openingFloat)
                })
            });
            const d = await res.json();
            if (d.success) {
                addNotification('success', 'Session opened successfully');
                onSuccess();
                onClose();
            } else throw new Error(d.error);
        } catch (e: any) {
            addNotification('error', e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = async () => {
        if (!actualCash) return addNotification('error', 'Enter actual cash counted');
        if (!currentUser) return addNotification('error', 'Not logged in');
        setLoading(true);
        try {
            const res = await fetch('/api/cashier/close', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: activeSession.id,
                    actualCash: Number(actualCash),
                    withdrawnAmount: Number(withdrawnAmount || 0),
                    closedBy: currentUser.id,
                    notes
                })
            });
            const d = await res.json();
            if (d.success) {
                addNotification('success', 'Session closed and reconciled');
                onSuccess();
                onClose();
            } else throw new Error(d.error);
        } catch (e: any) {
            addNotification('error', e.message);
        } finally {
            setLoading(false);
        }
    };

    const theoretical = summary ? (Number(summary.openingFloat) + Number(summary.calculatedSummary.cashSales)) : 0;
    const variance = (Number(actualCash) || 0) - theoretical;
    const leftover = (Number(actualCash) || 0) - (Number(withdrawnAmount) || 0);

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0f172a] border border-[#1e293b] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="p-6 border-b border-[#1e293b] flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-transparent">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${mode === 'OPEN' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {mode === 'OPEN' ? <Banknote size={24} /> : <HandCoins size={24} />}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white leading-tight">
                                {mode === 'OPEN' ? 'Open Cashier Session' : 'Reconcile & Close Session'}
                            </h2>
                            <p className="text-slate-400 text-sm">Shift {new Date().toLocaleDateString()}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-2 hover:bg-[#1e293b] rounded-full">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {mode === 'OPEN' ? (
                        <div className="space-y-4">
                            <div className="bg-indigo-500/5 border border-indigo-500/20 p-4 rounded-xl flex items-start gap-4">
                                <AlertTriangle className="text-indigo-400 shrink-0 mt-1" size={18} />
                                <p className="text-xs text-indigo-300/80 leading-relaxed">
                                    Opening a session records your starting cash float. Ensure the physical cash in your drawer matches the amount entered above.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Starting Cash Float</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">Rs.</span>
                                    <input
                                        type="number"
                                        className="w-full bg-[#1e293b] border border-[#334155] rounded-xl py-4 pl-12 pr-4 text-2xl font-bold text-emerald-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                                        placeholder="0.00"
                                        value={openingFloat}
                                        onChange={e => setOpeningFloat(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Summary Stats */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-[#1e293b] p-4 rounded-xl border border-[#334155]">
                                    <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Theoretical Cash</p>
                                    <p className="text-lg font-bold text-white">{fmt(theoretical)}</p>
                                </div>
                                <div className={`p-4 rounded-xl border ${variance >= 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Variance</p>
                                    <p className={`text-lg font-bold ${variance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {variance >= 0 ? '+' : ''}{fmt(variance)}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                                        <span>Actual Cash Counted</span>
                                        <span className="text-[10px] text-indigo-400 normal-case">Physical cash in drawer</span>
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">Rs.</span>
                                        <input
                                            type="number"
                                            className="w-full bg-[#1e293b] border border-[#334155] rounded-xl py-4 pl-12 pr-4 text-2xl font-bold text-white focus:outline-none focus:border-indigo-500 transition-all"
                                            placeholder="0.00"
                                            value={actualCash}
                                            onChange={e => setActualCash(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                                        <span>Handover to Manager</span>
                                        <span className="text-[10px] text-slate-400 normal-case">Withdraw from till</span>
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">Rs.</span>
                                        <input
                                            type="number"
                                            className="w-full bg-indigo-500/5 border border-indigo-500/20 rounded-xl py-4 pl-12 pr-4 text-xl font-bold text-indigo-300 focus:outline-none focus:border-indigo-500 transition-all placeholder:text-indigo-900"
                                            placeholder="Amount to withdraw..."
                                            value={withdrawnAmount}
                                            onChange={e => setWithdrawnAmount(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="bg-[#1e293b]/50 p-3 rounded-lg flex items-center justify-between border border-[#334155] border-dashed">
                                    <span className="text-sm text-slate-400">Remaining Float for next shift:</span>
                                    <span className="text-lg font-bold text-emerald-400">{fmt(leftover)}</span>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Notes (Optional)</label>
                                    <textarea
                                        className="w-full bg-[#1e293b] border border-[#334155] rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-indigo-500 transition-all resize-none"
                                        placeholder="Any discrepancies or shift notes..."
                                        rows={2}
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="pt-2">
                        <button
                            onClick={mode === 'OPEN' ? handleOpen : handleClose}
                            disabled={loading}
                            className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all ${
                                loading ? 'bg-slate-700 cursor-not-allowed text-slate-500' :
                                mode === 'OPEN' ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' :
                                'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20'
                            }`}
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    {mode === 'OPEN' ? <CheckCircle2 size={24} /> : <Calculator size={24} />}
                                    {mode === 'OPEN' ? 'Start Shift' : 'Complete Reconciliation'}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
