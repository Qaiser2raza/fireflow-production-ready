import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, CheckCircle2, AlertCircle, FileEdit, Calculator } from 'lucide-react';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';

interface Account {
    id: string;
    code: string;
    name: string;
    type: string;
    parent_id?: string | null;
    depth?: number;
}

interface JournalLine {
    id: string;
    accountId: string;
    description: string;
    debit: string;
    credit: string;
}

interface ManualJournalEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const ManualJournalEntryModal: React.FC<ManualJournalEntryModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [description, setDescription] = useState('');
    const [referenceId, setReferenceId] = useState('');
    const [lines, setLines] = useState<JournalLine[]>([
        { id: '1', accountId: '', description: '', debit: '', credit: '' },
        { id: '2', accountId: '', description: '', debit: '', credit: '' }
    ]);

    useEffect(() => {
        if (isOpen) {
            fetchAccounts();
            resetForm();
        }
    }, [isOpen]);

    const resetForm = () => {
        setDate(new Date().toISOString().split('T')[0]);
        setDescription('');
        setReferenceId('');
        setLines([
            { id: Date.now().toString() + '1', accountId: '', description: '', debit: '', credit: '' },
            { id: Date.now().toString() + '2', accountId: '', description: '', debit: '', credit: '' }
        ]);
        setError(null);
    };

    const fetchAccounts = async () => {
        try {
            const res = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/accounting/coa`);
            const data = await res.json();
            if (data.success && Array.isArray(data.accounts)) {
                // Calculate depth for visual hierarchy
                const accs = [...data.accounts];
                const enriched = accs.map(acc => {
                    let depth = 0;
                    let current = acc;
                    while (current.parent_id) {
                        depth++;
                        const parent = accs.find(a => a.id === current.parent_id);
                        if (!parent || depth > 10) break; // Safety
                        current = parent;
                    }
                    return { ...acc, depth };
                });
                setAccounts(enriched);
            }
        } catch (e) {
            console.error('Failed to load accounts for journal entry', e);
        }
    };

    const handleAddLine = () => {
        setLines([...lines, { id: Date.now().toString(), accountId: '', description: '', debit: '', credit: '' }]);
    };

    const handleRemoveLine = (id: string) => {
        if (lines.length <= 2) return;
        setLines(lines.filter(l => l.id !== id));
    };

    const handleLineChange = (id: string, field: keyof JournalLine, value: string) => {
        setLines(lines.map(l => {
            if (l.id === id) {
                const updated = { ...l, [field]: value };
                if (field === 'debit' && value) updated.credit = '';
                if (field === 'credit' && value) updated.debit = '';
                return updated;
            }
            return l;
        }));
    };

    const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
    const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
    const isValid = lines.every(l => l.accountId) && totalDebit > 0 && isBalanced;

    const handleSubmit = async () => {
        if (!isValid) return;
        try {
            setSubmitting(true);
            setError(null);
            const payload = {
                date,
                description,
                referenceId,
                lines: lines.map(l => ({
                    accountId: l.accountId,
                    description: l.description,
                    debit: Number(l.debit) || 0,
                    credit: Number(l.credit) || 0
                }))
            };

            const res = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/accounting/manual-journal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.success) {
                onSuccess();
                onClose();
            } else {
                setError(data.error || 'Failed to post journal entry');
            }
        } catch (e: any) {
            setError(e.message || 'Network error');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#0B0F19] border border-slate-800 rounded-[2rem] shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh]">
                
                <div className="px-8 py-6 border-b border-slate-800/50 flex justify-between items-center bg-slate-900/40 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-500">
                            <FileEdit size={24} strokeWidth={3} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white tracking-tighter uppercase leading-none mb-1">Manual Journal Entry</h2>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Double-Entry Ledger Adjustment</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-2">
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Description / Memo *</label>
                            <input
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-indigo-500 transition-colors"
                                placeholder="e.g. Correcting opening balance for Bank Account"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Posting Date *</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-indigo-500 text-center font-mono transition-colors"
                            />
                        </div>
                    </div>

                    <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                                <Calculator size={14} className="text-indigo-400" /> Journal Lines
                            </h3>
                            <button
                                onClick={handleAddLine}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-400 font-bold rounded-lg text-[10px] uppercase tracking-widest flex items-center gap-1 transition-colors"
                            >
                                <Plus size={14} /> Add Line
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div className="grid grid-cols-12 gap-3 px-2 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                <div className="col-span-4">Account</div>
                                <div className="col-span-4">Line Description</div>
                                <div className="col-span-2 text-right">Debit (Rs)</div>
                                <div className="col-span-2 text-right">Credit (Rs)</div>
                            </div>
                            
                            {lines.map((line) => (
                                <div key={line.id} className="flex gap-3 items-start relative group">
                                    <div className="col-span-4">
                                        <select
                                            value={line.accountId}
                                            onChange={(e) => handleLineChange(line.id, 'accountId', e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-slate-200 text-xs font-medium outline-none focus:border-indigo-500 transition-colors"
                                        >
                                            <option value="">Select Account...</option>
                                            {accounts.map(a => (
                                                <option key={a.id} value={a.id}>
                                                    {'\u00A0'.repeat((a.depth || 0) * 4)}
                                                    {a.code} – {a.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="col-span-4">
                                        <input
                                            type="text"
                                            value={line.description}
                                            onChange={(e) => handleLineChange(line.id, 'description', e.target.value)}
                                            placeholder="Optional line memo"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-slate-200 text-xs outline-none focus:border-indigo-500 transition-colors"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <input
                                            type="number"
                                            value={line.debit}
                                            onChange={(e) => handleLineChange(line.id, 'debit', e.target.value)}
                                            placeholder="0.00"
                                            disabled={!!line.credit}
                                            className="w-full bg-slate-950 border border-emerald-900/30 rounded-lg px-3 py-2.5 text-emerald-400 font-mono text-right text-xs outline-none focus:border-emerald-500 disabled:opacity-30 transition-colors"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <input
                                            type="number"
                                            value={line.credit}
                                            onChange={(e) => handleLineChange(line.id, 'credit', e.target.value)}
                                            placeholder="0.00"
                                            disabled={!!line.debit}
                                            className="w-full bg-slate-950 border border-rose-900/30 rounded-lg px-3 py-2.5 text-rose-400 font-mono text-right text-xs outline-none focus:border-rose-500 disabled:opacity-30 transition-colors"
                                        />
                                        
                                        {lines.length > 2 && (
                                            <button
                                                onClick={() => handleRemoveLine(line.id)}
                                                className="absolute -right-8 top-2 text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"
                                                title="Remove Line"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
                            <div className="w-1/2">
                                <div className="grid grid-cols-2 gap-4 text-xs font-mono font-bold">
                                    <div className="text-right text-slate-400">Total Debits:</div>
                                    <div className="text-right text-emerald-400">Rs. {totalDebit.toLocaleString()}</div>
                                    <div className="text-right text-slate-400">Total Credits:</div>
                                    <div className="text-right text-rose-400">Rs. {totalCredit.toLocaleString()}</div>
                                    
                                    <div className="col-span-2 border-t border-slate-700/50 my-1"></div>
                                    
                                    <div className="text-right font-black uppercase tracking-widest text-[10px] self-center text-slate-500">
                                        Variance:
                                    </div>
                                    <div className={`text-right text-sm font-black ${isBalanced && totalDebit > 0 ? 'text-indigo-400' : 'text-red-500'}`}>
                                        Rs. {Math.abs(totalDebit - totalCredit).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3">
                            <AlertCircle className="text-red-500 shrink-0" size={20} />
                            <p className="text-red-400 text-xs font-bold">{error}</p>
                        </div>
                    )}
                </div>

                <div className="px-8 py-6 bg-slate-900/60 border-t border-slate-800 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                        {(!isBalanced && totalDebit > 0) && (
                            <span className="text-red-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 bg-red-500/10 px-3 py-1.5 border border-red-500/20 rounded-lg">
                                <AlertCircle size={14} /> Total Debits must equal Total Credits
                            </span>
                        )}
                        {(isBalanced && totalDebit > 0) && (
                            <span className="text-indigo-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 bg-indigo-500/10 px-3 py-1.5 border border-indigo-500/20 rounded-lg">
                                <CheckCircle2 size={14} /> Journal is balanced
                            </span>
                        )}
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={onClose}
                            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={!isValid || submitting || !description}
                            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                        >
                            {submitting ? 'Posting...' : 'Post Journal Entry'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
