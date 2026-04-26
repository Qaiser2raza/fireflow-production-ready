import React, { useState, useEffect } from 'react';
import { X, Banknote, HandCoins, AlertTriangle, CheckCircle2, Calculator, Users, Vault, BookOpen, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import { useAppContext } from '../../../client/contexts/AppContext';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';
import { XReportPrintView } from './XReportPrintView';

type CloseStep = 'reconcile' | 'drawing' | 'svc' | 'confirm';

interface CashSessionModalProps {
    mode: 'OPEN' | 'CLOSE';
    onClose: () => void;
    onSuccess: () => void;
}

export const CashSessionModal: React.FC<CashSessionModalProps> = ({ mode, onClose, onSuccess }) => {
    const { currentUser, activeSession, addNotification } = useAppContext();
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [openingFloat, setOpeningFloat] = useState('');
    const [expectedNextFloat, setExpectedNextFloat] = useState(0);
    const [actualCash, setActualCash] = useState('');
    const [withdrawnAmount, setWithdrawnAmount] = useState('');
    const [notes, setNotes] = useState('');
    const [summary, setSummary] = useState<any>(null);
    // Day-end accounting state
    const [closeStep, setCloseStep] = useState<CloseStep>('reconcile');
    const [drawingAmount, setDrawingAmount] = useState('');
    const [drawingNotes, setDrawingNotes] = useState('');
    const [drawingPosted, setDrawingPosted] = useState(false);
    const [svcAmount, setSvcAmount] = useState('');
    const [svcPosted, setSvcPosted] = useState(false);
    const [journalLog, setJournalLog] = useState<string[]>([]);

    const fmt = (val: any) => `Rs. ${Number(val || 0).toLocaleString('en-PK')}`;

    useEffect(() => {
        if (mode === 'CLOSE' && activeSession) {
            fetchSummary();
        } else if (mode === 'OPEN' && currentUser) {
            fetchExpectedFloat();
        }
    }, [mode, activeSession, currentUser]);

    const fetchExpectedFloat = async () => {
        try {
            const res = await fetchWithAuth(`/api/cashier/current?restaurantId=${currentUser?.restaurant_id}&staffId=${currentUser?.id}`);
            const d = await res.json();
            if (d.success && d.expectedNextFloat !== undefined) {
                setExpectedNextFloat(d.expectedNextFloat);
                if (!openingFloat) setOpeningFloat(d.expectedNextFloat.toString());
            }
        } catch (e) {
            console.error('Failed to fetch expected float');
        }
    };



    const fetchSummary = async () => {
        try {
            const res = await fetchWithAuth(`/api/cashier/${activeSession.id}/summary`);
            const d = await res.json();
            if (d.success) {
                setSummary(d.summary);
                if (d.summary?.calculatedSummary?.serviceChargeCollected) {
                    setSvcAmount(d.summary.calculatedSummary.serviceChargeCollected.toString());
                }
            }
        } catch (e) {
            console.error('Failed to fetch session summary');
        }
    };

    const handleOpen = async () => {
        if (!openingFloat) return addNotification('error', 'Enter opening float');
        if (!currentUser) return addNotification('error', 'Not logged in');
        setLoading(true);
        try {
            const res = await fetchWithAuth('/api/cashier/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    restaurantId: currentUser.restaurant_id,
                    staffId: currentUser.id,
                    openingFloat: Number(openingFloat),
                    expectedFloat: expectedNextFloat
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

    const handlePostDrawing = async () => {
        if (!drawingAmount || Number(drawingAmount) <= 0) return addNotification('error', 'Enter drawing amount');
        setLoading(true);
        try {
            const res = await fetchWithAuth(`/api/cashier/${activeSession.id}/manager-drawing`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: Number(drawingAmount), notes: drawingNotes, restaurantId: currentUser?.restaurant_id })
            });
            const d = await res.json();
            if (d.success) {
                setDrawingPosted(true);
                setJournalLog(p => [...p, `✅ DR 1090 Manager Safe Rs.${drawingAmount} | CR 1000 Cash Rs.${drawingAmount}`]);
                addNotification('success', `Manager drawing of Rs. ${drawingAmount} posted`);
            } else throw new Error(d.error);
        } catch (e: any) { addNotification('error', e.message); }
        finally { setLoading(false); }
    };

    const handleDistributeSVC = async () => {
        if (!svcAmount || Number(svcAmount) <= 0) return addNotification('error', 'Enter a valid amount to disburse');
        setLoading(true);
        try {
            const res = await fetchWithAuth(`/api/cashier/${activeSession.id}/distribute-svc`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ totalAmount: Number(svcAmount), restaurantId: currentUser?.restaurant_id })
            });
            const d = await res.json();
            if (d.success) {
                setSvcPosted(true);
                setJournalLog(p => [...p, `✅ DR 2010 SVC Payable Rs.${svcAmount} | CR 1000 Cash Rs.${svcAmount}`]);
                addNotification('success', `SVC Rs. ${svcAmount} disbursed to pool`);
            } else throw new Error(d.error);
        } catch (e: any) { 
            console.error('[SVC] distribute error:', e);
            addNotification('error', e.message); 
        }
        finally { setLoading(false); }
    };

    const handleClose = async () => {
        if (!actualCash) return addNotification('error', 'Enter actual cash counted');
        if (!currentUser) return addNotification('error', 'Not logged in');
        setLoading(true);
        try {
            const res = await fetchWithAuth('/api/cashier/close', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: activeSession.id, actualCash: Number(actualCash), withdrawnAmount: Number(withdrawnAmount || 0), closedBy: currentUser.id, notes })
            });
            if (res.status === 409) {
                const data = await res.json();
                // Show the error inline
                setErrorMsg(data.error);
                return;
            }
            const d = await res.json();
            if (d.success) {
                setJournalLog(p => [...p,
                    `✅ DR 1090 Manager Safe Rs.${withdrawnAmount||0} | CR 1000 Cash (close withdrawal)`,
                    variance < 0 ? `✅ DR 5030 Shortage Rs.${Math.abs(variance).toFixed(0)} | CR 1000 Cash` : '',
                    variance > 0 ? `✅ DR 1000 Cash Rs.${variance.toFixed(0)} | CR 4030 Overage` : ''
                ].filter(Boolean));
                addNotification('success', 'Session closed and reconciled');
                setCloseStep('drawing'); // proceed to drawing step
            } else throw new Error(d.error);
        } catch (e: any) { addNotification('error', e.message); }
        finally { setLoading(false); }
    };

    // Use pre-computed expectedCash from server (openingFloat + cashSales + customerPayments - payouts)
    const theoretical = summary ? Number(summary.calculatedSummary?.expectedCash || 0) : 0;
    const variance = (Number(actualCash) || 0) - theoretical;

    return (
        <>
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 print:hidden">
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
                    <div className="flex items-center gap-3">
                        {mode === 'CLOSE' && summary && (
                            <button onClick={() => window.print()} className="text-sm font-bold bg-indigo-500/20 text-indigo-400 px-4 py-2 rounded-lg hover:bg-indigo-500/30 transition-colors">
                                Print X-Report
                            </button>
                        )}
                        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-2 hover:bg-[#1e293b] rounded-full">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {errorMsg && (
                        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-start gap-3">
                            <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={18} />
                            <p className="text-sm font-bold text-red-400">{errorMsg}</p>
                        </div>
                    )}
                    {mode === 'OPEN' ? (
                        <div className="space-y-4">
                            <div className="bg-indigo-500/5 border border-indigo-500/20 p-4 rounded-xl flex items-start gap-4">
                                <AlertTriangle className="text-indigo-400 shrink-0 mt-1" size={18} />
                                <div className="space-y-1">
                                    <p className="text-xs text-indigo-300/80 leading-relaxed">
                                        Opening a session records your starting cash float. Ensure the physical cash in your drawer matches the amount entered above.
                                    </p>
                                    <p className="text-xs font-bold text-indigo-400">
                                        Brought forward from previous shift: {fmt(expectedNextFloat)}
                                    </p>
                                </div>
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
                        <div className="space-y-4">
                        {/* Step indicator */}
                        {closeStep !== 'confirm' && (
                            <div className="flex items-center gap-1">
                                {(['reconcile','drawing','svc'] as CloseStep[]).map((s, i) => {
                                    const labels = ['1. Count','2. Drawing','3. SVC'];
                                    const active = closeStep === s;
                                    const done = (['reconcile','drawing','svc'] as CloseStep[]).indexOf(closeStep) > i;
                                    return (
                                        <React.Fragment key={s}>
                                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${active ? 'bg-indigo-600 text-white' : done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#1e293b] text-slate-500'}`}>
                                                {done ? <CheckCircle2 size={12}/> : null}{labels[i]}
                                            </div>
                                            {i < 2 && <div className="flex-1 h-px bg-[#1e293b]"/>}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        )}

                        {/* Multi-day warning */}
                        {summary?.isMultiDay && (
                            <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl flex items-start gap-3">
                                <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={16}/>
                                <div><p className="text-xs font-bold text-amber-400">Multi-Day Session</p>
                                <p className="text-xs text-amber-300/70 mt-0.5">Opened: {summary?.sessionOpenedDate ? new Date(summary.sessionOpenedDate).toLocaleString() : ''} — spans multiple business days.</p></div>
                            </div>
                        )}

                        {/* ── STEP 1: RECONCILE ─────────────────────────── */}
                        {closeStep === 'reconcile' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="bg-[#1e293b] p-3 rounded-xl border border-[#334155] text-center">
                                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Expected Cash</p>
                                        <p className="text-base font-bold text-white">{fmt(theoretical)}</p>
                                        <p className="text-[9px] text-slate-600 mt-0.5">Float + Cash Sales</p>
                                    </div>
                                    <div className="bg-[#1e293b] p-3 rounded-xl border border-[#334155] text-center">
                                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">SVC Pending</p>
                                        <p className="text-base font-bold text-violet-400">{summary ? fmt(summary.calculatedSummary?.serviceChargeCollected) : 'Rs. 0'}</p>
                                        <p className="text-[9px] text-slate-600 mt-0.5">For staff</p>
                                    </div>
                                    <div className={`p-3 rounded-xl border text-center ${variance >= 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Variance</p>
                                        <p className={`text-base font-bold ${variance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{variance >= 0 ? '+' : ''}{fmt(variance)}</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                                        <span>Actual Cash Counted</span>
                                        <span className="text-[10px] text-indigo-400 normal-case">Physical cash in drawer</span>
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">Rs.</span>
                                        <input type="number" className="w-full bg-[#1e293b] border border-[#334155] rounded-xl py-4 pl-12 pr-4 text-2xl font-bold text-white focus:outline-none focus:border-indigo-500 transition-all" placeholder="0.00" value={actualCash} onChange={e => setActualCash(e.target.value)} autoFocus/>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Notes (Optional)</label>
                                    <textarea className="w-full bg-[#1e293b] border border-[#334155] rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-indigo-500 transition-all resize-none" placeholder="Any discrepancies or shift notes..." rows={2} value={notes} onChange={e => setNotes(e.target.value)}/>
                                </div>
                                <div className="bg-[#1e293b]/60 p-3 rounded-lg border border-[#1e293b] border-dashed">
                                    <p className="text-[10px] text-slate-500 uppercase font-bold mb-1.5">Journal to Post on Close</p>
                                    <p className="text-xs font-mono text-slate-400">DR 1090 Manager Safe  |  CR 1000 Cash  (withdrawal)</p>
                                    {variance < 0 && <p className="text-xs font-mono text-red-400">DR 5030 Shortage  |  CR 1000 Cash  (shortage)</p>}
                                    {variance > 0 && <p className="text-xs font-mono text-emerald-400">DR 1000 Cash  |  CR 4030 Overage  (surplus)</p>}
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                                        <span>Handover to Manager</span>
                                        <span className="text-[10px] text-slate-400 normal-case">Withdraw from till</span>
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">Rs.</span>
                                        <input type="number" className="w-full bg-indigo-500/5 border border-indigo-500/20 rounded-xl py-4 pl-12 pr-4 text-xl font-bold text-indigo-300 focus:outline-none focus:border-indigo-500 transition-all" placeholder="Amount to withdraw..." value={withdrawnAmount} onChange={e => setWithdrawnAmount(e.target.value)}/>
                                    </div>
                                </div>
                                <button onClick={handleClose} disabled={loading || !actualCash} className="w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:text-slate-500 text-white transition-all shadow-lg shadow-indigo-500/20">
                                    {loading ? <Loader2 size={20} className="animate-spin"/> : <><Calculator size={20}/> Close & Reconcile</>}
                                </button>
                            </div>
                        )}

                        {/* ── STEP 2: MANAGER DRAWING ───────────────────── */}
                        {closeStep === 'drawing' && (
                            <div className="space-y-4">
                                <div className="bg-violet-500/10 border border-violet-500/20 p-4 rounded-xl flex items-start gap-3">
                                    <Vault className="text-violet-400 shrink-0 mt-0.5" size={18}/>
                                    <div>
                                        <p className="text-sm font-bold text-violet-300">Manager Safe Transfer</p>
                                        <p className="text-xs text-violet-300/70 mt-0.5">Post a formal journal for cash moved from till to safe.<br/>
                                        <span className="font-mono text-violet-400/80">DR 1090 Manager Safe / CR 1000 Cash</span></p>
                                    </div>
                                </div>
                                {drawingPosted ? (
                                    <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-xl flex items-center gap-3">
                                        <CheckCircle2 className="text-emerald-400" size={20}/>
                                        <div>
                                            <p className="text-sm font-bold text-emerald-400">Drawing Posted ✓</p>
                                            <p className="text-xs text-emerald-300/70">Rs. {drawingAmount} transferred to safe — journal recorded.</p>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Amount to Safe</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">Rs.</span>
                                                <input type="number" className="w-full bg-[#1e293b] border border-[#334155] rounded-xl py-4 pl-12 pr-4 text-2xl font-bold text-violet-300 focus:outline-none focus:border-violet-500 transition-all" placeholder="0.00" value={drawingAmount} onChange={e => setDrawingAmount(e.target.value)} autoFocus/>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Note (Optional)</label>
                                            <input type="text" className="w-full bg-[#1e293b] border border-[#334155] rounded-xl px-4 py-3 text-sm text-slate-300 focus:outline-none focus:border-violet-500 transition-all" placeholder="e.g. Evening safe drop" value={drawingNotes} onChange={e => setDrawingNotes(e.target.value)}/>
                                        </div>
                                        <button onClick={handlePostDrawing} disabled={loading} className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-700 text-white transition-all">
                                            {loading ? <Loader2 size={18} className="animate-spin"/> : <><Vault size={18}/> Post Drawing Journal</>}
                                        </button>
                                    </>
                                )}
                                <div className="flex gap-2">
                                    <button onClick={() => setCloseStep('reconcile')} className="flex-1 py-3 rounded-xl text-sm font-bold bg-[#1e293b] text-slate-400 hover:text-white flex items-center justify-center gap-2"><ChevronLeft size={16}/>Back</button>
                                    <button onClick={() => setCloseStep('svc')} className="flex-1 py-3 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2">Next: SVC <ChevronRight size={16}/></button>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 3: SVC DISTRIBUTION ──────────────────── */}
                        {closeStep === 'svc' && (
                            <div className="space-y-4">
                                <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl flex items-start gap-3">
                                    <Users className="text-amber-400 shrink-0 mt-0.5" size={18}/>
                                    <div>
                                        <p className="text-sm font-bold text-amber-300">Service Charge Disbursal</p>
                                        <p className="text-xs text-amber-300/70 mt-0.5">Total collected this session: <span className="font-bold text-amber-400">{summary ? fmt(summary.calculatedSummary?.serviceChargeCollected) : 'Rs. 0'}</span></p>
                                    </div>
                                </div>
                                {svcPosted ? (
                                    <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-xl flex items-center gap-3">
                                        <CheckCircle2 className="text-emerald-400" size={20}/>
                                        <p className="text-sm font-bold text-emerald-400">SVC Disbursed ✓ — Liability cleared from books.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Amount to Disburse</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">Rs.</span>
                                                <input type="number" className="w-full bg-[#1e293b] border border-[#334155] rounded-xl py-4 pl-12 pr-4 text-2xl font-bold text-amber-400 focus:outline-none focus:border-amber-500 transition-all" placeholder="0.00" value={svcAmount} onChange={e => setSvcAmount(e.target.value)} autoFocus/>
                                            </div>
                                        </div>
                                        <button onClick={handleDistributeSVC} disabled={loading} className="w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-700 text-white transition-all shadow-lg shadow-amber-500/10">
                                            {loading ? <Loader2 size={20} className="animate-spin"/> : <><Users size={20}/> Disburse & Continue</>}
                                        </button>
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <button onClick={() => setCloseStep('drawing')} className="flex-1 py-3 rounded-xl text-sm font-bold bg-[#1e293b] text-slate-400 hover:text-white flex items-center justify-center gap-2"><ChevronLeft size={16}/>Back</button>
                                    <button onClick={() => setCloseStep('confirm')} className="flex-1 py-3 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2">Finish <ChevronRight size={16}/></button>
                                </div>
                            </div>
                        )}

                        {/* ── STEP 4: CONFIRM ───────────────────────────── */}
                        {closeStep === 'confirm' && (
                            <div className="space-y-4">
                                <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-xl text-center">
                                    <CheckCircle2 className="text-emerald-400 mx-auto mb-2" size={32}/>
                                    <p className="text-lg font-bold text-emerald-400">Day Closed Successfully</p>
                                    <p className="text-xs text-emerald-300/70 mt-1">All journal entries have been posted to the ledger.</p>
                                </div>
                                <div className="bg-[#0f172a] border border-[#1e293b] rounded-xl p-4 space-y-2">
                                    <div className="flex items-center gap-2 mb-3">
                                        <BookOpen size={14} className="text-indigo-400"/>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Posted Journal Entries</p>
                                    </div>
                                    {journalLog.length === 0 ? (
                                        <p className="text-xs text-slate-600 text-center py-2">No manual entries posted.</p>
                                    ) : journalLog.map((entry, i) => (
                                        <p key={i} className="text-xs font-mono text-slate-400 leading-relaxed border-b border-[#1e293b] pb-1 last:border-0">{entry}</p>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => { window.print(); }} className="flex-1 py-3 rounded-xl text-sm font-bold bg-[#1e293b] text-slate-300 hover:text-white flex items-center justify-center gap-2">Print Z-Report</button>
                                    <button onClick={() => { onSuccess(); onClose(); }} className="flex-1 py-3 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2"><CheckCircle2 size={16}/> Done</button>
                                </div>
                            </div>
                        )}
                        </div>
                    )}

                    {mode === 'OPEN' && (
                        <div className="pt-2">
                            <button onClick={handleOpen} disabled={loading} className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all ${loading ? 'bg-slate-700 cursor-not-allowed text-slate-500' : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'}`}>
                                {loading ? <Loader2 size={24} className="animate-spin"/> : <><CheckCircle2 size={24}/> Start Shift</>}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
        {summary && <XReportPrintView session={summary} restaurantName={currentUser?.restaurant_id || 'Restaurant'}/>}
        </>
    );
};
