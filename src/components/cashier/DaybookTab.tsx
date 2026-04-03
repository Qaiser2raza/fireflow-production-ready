import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../client/contexts/AppContext';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';
import { format } from 'date-fns';
import { 
    Clock, 
    ArrowDownLeft, 
    ArrowUpRight, 
    CheckCircle2, 
    Ban, 
    Plus, 
    LogOut,
    Loader2,
    BookOpen
} from 'lucide-react';

type ShiftLog = {
    id: string;
    type: 'INFLOW' | 'OUTFLOW';
    amount: number;
    description: string;
    category?: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    created_at: string;
    processor?: { name: string; role: string };
};

export const DaybookTab: React.FC = () => {
    const { currentUser: user, addNotification } = useAppContext();
    const [logs, setLogs] = useState<ShiftLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [formType, setFormType] = useState<'INFLOW' | 'OUTFLOW'>('OUTFLOW');
    const [formAmount, setFormAmount] = useState('');
    const [formDesc, setFormDesc] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const API = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';

    useEffect(() => {
        if (user) checkSessionAndFetchLogs();
    }, [user]);

    const checkSessionAndFetchLogs = async () => {
        try {
            setLoading(true);
            const res = await fetchWithAuth(`${API}/cashier/current?restaurantId=${user?.restaurant_id}&staffId=${user?.id}`);
            const data = await res.json();
            if (data.success && data.session) {
                setActiveSessionId(data.session.id);
                fetchLogs(data.session.id);
            } else {
                setLoading(false);
            }
        } catch (e) {
            console.error('Failed to get session');
            setLoading(false);
        }
    };

    const fetchLogs = async (sessionId: string) => {
        try {
            const res = await fetchWithAuth(`${API}/cashier/${sessionId}/logs`);
            const data = await res.json();
            if (data.success) {
                setLogs(data.logs);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeSessionId) return;
        if (!formAmount || isNaN(Number(formAmount)) || Number(formAmount) <= 0) return addNotification?.('error', 'Valid amount required');
        if (!formDesc.trim()) return addNotification?.('error', 'Description required');

        setSubmitting(true);
        try {
            const res = await fetchWithAuth(`${API}/cashier/${activeSessionId}/logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    restaurantId: user?.restaurant_id,
                    type: formType,
                    amount: formAmount,
                    description: formDesc
                })
            });
            const data = await res.json();
            if (data.success) {
                addNotification?.('success', 'Entry recorded in Daybook');
                setLogs([data.log, ...logs]);
                setShowForm(false);
                setFormAmount('');
                setFormDesc('');
                setFormType('OUTFLOW'); // Reset to default state
            } else throw new Error(data.error);
        } catch (e) {
            addNotification?.('error', 'Failed to save entry');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-full bg-[#0f1117] items-center justify-center">
                <Loader2 className="animate-spin text-slate-500" size={32} />
            </div>
        );
    }

    if (!activeSessionId) {
        return (
            <div className="flex flex-col h-full bg-[#0f1117] items-center justify-center text-slate-500">
                <LogOut size={48} className="mb-4 opacity-50" />
                <h3 className="text-xl font-bold">No Active Shift</h3>
                <p>Open your drawer to start logging cash movements.</p>
            </div>
        );
    }

    // Totals logic
    const totalInflow = logs.filter(l => l.type === 'INFLOW' && l.status !== 'REJECTED').reduce((acc, l) => acc + Number(l.amount), 0);
    const totalOutflow = logs.filter(l => l.type === 'OUTFLOW' && l.status !== 'REJECTED').reduce((acc, l) => acc + Number(l.amount), 0);

    return (
        <div className="flex flex-col h-full bg-[#0f1117] relative select-none">
            {/* Header & Totals */}
            <div className="sticky top-0 z-20 bg-[#0f1117]/80 backdrop-blur-xl border-b border-white/5 p-4 flex gap-4 shrink-0">
                <div className="flex-1 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest block mb-1">Total Inflow</span>
                        <span className="text-xl font-black text-emerald-400 font-['IBM_Plex_Mono']">Rs. {totalInflow.toLocaleString()}</span>
                    </div>
                    <ArrowDownLeft size={24} className="text-emerald-500" />
                </div>
                <div className="flex-1 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                        <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest block mb-1">Total Outflow</span>
                        <span className="text-xl font-black text-rose-400 font-['IBM_Plex_Mono']">Rs. {totalOutflow.toLocaleString()}</span>
                    </div>
                    <ArrowUpRight size={24} className="text-rose-500" />
                </div>
                <button 
                    onClick={() => {
                        setShowForm(!showForm);
                        if(showForm) setFormType('OUTFLOW');
                    }}
                    className="aspect-square bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl flex flex-col items-center justify-center transition-colors px-6"
                >
                    {showForm ? <LogOut size={24} className="rotate-180" /> : <Plus size={24} />}
                    <span className="text-[10px] font-bold mt-1 uppercase tracking-widest">{showForm ? 'Cancel' : 'Add Entry'}</span>
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {showForm && (
                    <form onSubmit={handleSubmit} className="bg-[#1a1d27] border border-white/5 rounded-3xl p-6 mb-6 shadow-xl animate-in slide-in-from-top-4">
                        <h3 className="text-xl font-bold text-white mb-6 uppercase tracking-tighter italic">New Cash Movement</h3>
                        
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <button
                                type="button"
                                onClick={() => setFormType('INFLOW')}
                                className={`p-4 rounded-xl font-bold transition-all border outline-none ${formType === 'INFLOW' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 ring-2 ring-emerald-500/20' : 'bg-[#0f1117] border-white/5 text-slate-400'}`}
                            >
                                <ArrowDownLeft size={20} className="mx-auto mb-2" />
                                MONEY IN
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormType('OUTFLOW')}
                                className={`p-4 rounded-xl font-bold transition-all border outline-none ${formType === 'OUTFLOW' ? 'bg-rose-500/20 border-rose-500 text-rose-400 ring-2 ring-rose-500/20' : 'bg-[#0f1117] border-white/5 text-slate-400'}`}
                            >
                                <ArrowUpRight size={20} className="mx-auto mb-2" />
                                MONEY OUT
                            </button>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Amount (Rs.)</label>
                                <input
                                    type="number"
                                    required
                                    value={formAmount}
                                    onChange={e => setFormAmount(e.target.value)}
                                    className="w-full bg-[#0f1117] border border-white/5 rounded-xl px-4 py-3 text-white font-['IBM_Plex_Mono'] font-bold text-lg mt-1 focus:outline-none focus:border-indigo-500 transition-colors"
                                    placeholder="0.00"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Description / Why?</label>
                                <input
                                    type="text"
                                    required
                                    value={formDesc}
                                    onChange={e => setFormDesc(e.target.value)}
                                    className="w-full bg-[#0f1117] border border-white/5 rounded-xl px-4 py-3 text-white mt-1 focus:outline-none focus:border-indigo-500 transition-colors"
                                    placeholder="e.g. Paid vegabtable vendor Mr. Ali"
                                />
                            </div>
                        </div>

                        <button 
                            type="submit" 
                            disabled={submitting}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm tracking-widest uppercase py-4 rounded-xl transition-colors flex justify-center items-center gap-2"
                        >
                            {submitting && <Loader2 size={16} className="animate-spin" />}
                            Log Transaction
                        </button>
                    </form>
                )}

                <div className="space-y-3">
                    {logs.map(log => (
                        <div key={log.id} className="bg-[#1a1d27] border border-white/5 rounded-2xl p-4 flex items-center gap-4">
                            <div className={`p-3 rounded-full ${log.type === 'INFLOW' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                {log.type === 'INFLOW' ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                            </div>
                            <div className="flex-1">
                                <h4 className="text-white font-bold">{log.description}</h4>
                                <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                                    <span>{format(new Date(log.created_at), 'hh:mm a')}</span>
                                    <span>•</span>
                                    {log.status === 'PENDING' && <span className="text-orange-400 flex items-center gap-1"><Clock size={10} /> Pending Review</span>}
                                    {log.status === 'APPROVED' && <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 size={10} /> Approved</span>}
                                    {log.status === 'REJECTED' && <span className="text-rose-400 flex items-center gap-1"><Ban size={10} /> Rejected</span>}
                                </div>
                            </div>
                            <div className="text-right">
                                <p className={`font-['IBM_Plex_Mono'] font-bold text-lg ${log.status === 'REJECTED' ? 'text-slate-600 line-through' : (log.type === 'INFLOW' ? 'text-emerald-400' : 'text-rose-400')}`}>
                                    {log.type === 'INFLOW' ? '+' : '-'}Rs. {Number(log.amount).toLocaleString()}
                                </p>
                            </div>
                        </div>
                    ))}

                    {logs.length === 0 && !showForm && (
                        <div className="text-center py-20 opacity-50 flex flex-col items-center justify-center">
                            <BookOpen size={48} className="text-slate-500 mb-4" />
                            <h3 className="text-xl font-bold text-white mb-2">Daybook Empty</h3>
                            <p className="text-slate-400">No cash movements logged manually yet.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DaybookTab;
