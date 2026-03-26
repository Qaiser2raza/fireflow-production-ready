import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Edit2, Archive, CheckCircle2, Lock, ChevronRight, ChevronDown, Trash2 } from 'lucide-react';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';
import { useAppContext } from '../../../client/contexts/AppContext';

interface Account {
    id: string;
    code: string;
    name: string;
    type: string;
    description: string;
    is_active: boolean;
    is_system?: boolean;
    parent_id?: string | null;
    balance?: number;
    total_debit?: number;
    total_credit?: number;
}

interface COAModalProps {
    onClose: () => void;
}

const TYPE_COLOR: Record<string, string> = {
    ASSET: 'text-emerald-400',
    LIABILITY: 'text-rose-400',
    EQUITY: 'text-indigo-400',
    REVENUE: 'text-amber-400',
    EXPENSE: 'text-purple-400',
};

const TYPE_BG: Record<string, string> = {
    ASSET: 'bg-emerald-500/10 border-emerald-500/20',
    LIABILITY: 'bg-rose-500/10 border-rose-500/20',
    EQUITY: 'bg-indigo-500/10 border-indigo-500/20',
    REVENUE: 'bg-amber-500/10 border-amber-500/20',
    EXPENSE: 'bg-purple-500/10 border-purple-500/20',
};

const DEFAULT_FORM = {
    code: '',
    name: '',
    type: 'EXPENSE',
    description: '',
    is_active: true,
    parent_id: '' as string | null,
};

export const ChartOfAccountsModal: React.FC<COAModalProps> = ({ onClose }) => {
    const { addNotification } = useAppContext();
    const apiBase = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';

    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({ ...DEFAULT_FORM });
    const [submitting, setSubmitting] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const loadCOA = async () => {
        try {
            setLoading(true);
            const res = await fetchWithAuth(`${apiBase}/accounting/coa`);
            if (res.ok) {
                setAccounts(await res.json());
                // Default: expand all parents
                setExpandedParents(new Set());
            }
        } catch (err: any) {
            addNotification('error', err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadCOA(); }, []);

    // Build tree: parent accounts and their children
    const { roots, childrenMap } = useMemo(() => {
        const childrenMap: Record<string, Account[]> = {};
        const roots: Account[] = [];
        for (const acc of accounts) {
            if (acc.parent_id) {
                if (!childrenMap[acc.parent_id]) childrenMap[acc.parent_id] = [];
                childrenMap[acc.parent_id].push(acc);
            } else {
                roots.push(acc);
            }
        }
        return { roots, childrenMap };
    }, [accounts]);

    const parentAccounts = useMemo(() => accounts.filter(a => !a.parent_id), [accounts]);

    const toggleExpand = (id: string) => {
        setExpandedParents(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const isEdit = !!editingId;
            const url = isEdit ? `${apiBase}/accounting/coa/${editingId}` : `${apiBase}/accounting/coa`;
            const method = isEdit ? 'PATCH' : 'POST';
            const body = {
                ...formData,
                parent_id: formData.parent_id || null,
            };

            const res = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to save account');
            }

            addNotification('success', `Account ${isEdit ? 'updated' : 'created'}`);
            setShowForm(false);
            setEditingId(null);
            setFormData({ ...DEFAULT_FORM });
            loadCOA();
        } catch (err: any) {
            addNotification('error', err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this account?')) return;
        setDeletingId(id);
        try {
            const res = await fetchWithAuth(`${apiBase}/accounting/coa/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Delete failed');
            }
            addNotification('success', 'Account deleted');
            loadCOA();
        } catch (err: any) {
            addNotification('error', err.message);
        } finally {
            setDeletingId(null);
        }
    };

    const startEdit = (acc: Account) => {
        setEditingId(acc.id);
        setFormData({
            code: acc.code,
            name: acc.name,
            type: acc.type,
            description: acc.description || '',
            is_active: acc.is_active,
            parent_id: acc.parent_id || '',
        });
        setShowForm(true);
    };

    // Summary totals
    const totals = useMemo(() => {
        const t: Record<string, number> = { ASSET: 0, LIABILITY: 0, EQUITY: 0, REVENUE: 0, EXPENSE: 0 };
        for (const acc of accounts) t[acc.type] = (t[acc.type] || 0) + (acc.balance || 0);
        return t;
    }, [accounts]);

    // Render one account row
    const renderRow = (acc: Account, depth = 0) => {
        const children = childrenMap[acc.id] || [];
        const hasChildren = children.length > 0;
        const isExpanded = expandedParents.has(acc.id);
        const isLocked = !!acc.is_system;

        return (
            <React.Fragment key={acc.id}>
                <tr className={`border-b border-slate-800/30 hover:bg-white/[0.02] transition-colors group ${depth > 0 ? 'bg-slate-950/30' : ''}`}>
                    {/* Code */}
                    <td className="px-4 py-3">
                        <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 20}px` }}>
                            {hasChildren ? (
                                <button onClick={() => toggleExpand(acc.id)} className="text-slate-600 hover:text-white transition-colors">
                                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                </button>
                            ) : (
                                <span className="w-3 inline-block" />
                            )}
                            <span className="font-mono text-indigo-300 font-bold text-xs">{acc.code}</span>
                            {isLocked && <Lock size={10} className="text-slate-600" />}
                        </div>
                    </td>
                    {/* Name */}
                    <td className="px-4 py-3">
                        <div className="text-white font-bold text-xs tracking-tight">{acc.name}</div>
                        {acc.description && <div className="text-slate-500 text-[10px] mt-0.5 max-w-xs truncate">{acc.description}</div>}
                    </td>
                    {/* Type */}
                    <td className="px-4 py-3">
                        <span className={`text-[10px] font-black tracking-widest px-2 py-0.5 rounded-md border ${TYPE_BG[acc.type]} ${TYPE_COLOR[acc.type]}`}>
                            {acc.type}
                        </span>
                    </td>
                    {/* Balance */}
                    <td className="px-4 py-3 text-right font-mono text-xs">
                        {acc.balance !== undefined ? (
                            <span className={acc.balance >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                Rs.&nbsp;{Math.abs(acc.balance).toLocaleString()}
                                {acc.balance < 0 && <span className="text-slate-500 ml-0.5">(Cr)</span>}
                            </span>
                        ) : (
                            <span className="text-slate-700">—</span>
                        )}
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3 text-center">
                        {acc.is_active
                            ? <span className="inline-flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md text-[10px] font-bold"><CheckCircle2 size={10} /> Active</span>
                            : <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-800 px-2 py-0.5 rounded-md text-[10px] font-bold"><Archive size={10} /> Inactive</span>}
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                        {isLocked ? (
                            <span className="text-[9px] text-slate-600 uppercase tracking-widest font-bold">System</span>
                        ) : (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 justify-end">
                                <button
                                    onClick={() => startEdit(acc)}
                                    className="p-1.5 bg-slate-800 text-slate-300 hover:text-indigo-400 hover:bg-slate-700 rounded-lg transition"
                                ><Edit2 size={12} /></button>
                                <button
                                    onClick={() => handleDelete(acc.id)}
                                    disabled={deletingId === acc.id}
                                    className="p-1.5 bg-slate-800 text-slate-300 hover:text-red-400 hover:bg-slate-700 rounded-lg transition disabled:opacity-50"
                                ><Trash2 size={12} /></button>
                            </div>
                        )}
                    </td>
                </tr>
                {hasChildren && isExpanded && children.map(child => renderRow(child, depth + 1))}
            </React.Fragment>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-950 border border-slate-800 w-full max-w-6xl h-[92vh] rounded-[2.5rem] flex flex-col shadow-2xl shadow-indigo-500/10 overflow-hidden">

                {/* Header */}
                <div className="p-8 border-b border-slate-800/50 flex justify-between items-center bg-slate-900/50 shrink-0">
                    <div>
                        <h2 className="text-3xl font-black tracking-tighter text-white uppercase flex items-center gap-4">
                            Chart of Accounts
                            {loading && <span className="animate-pulse text-xs text-indigo-500 ml-2 font-mono tracking-widest">SYNCING...</span>}
                        </h2>
                        <p className="text-slate-500 text-xs uppercase tracking-widest font-bold mt-1">Double-Entry Ledger Schema — {accounts.length} Accounts</p>
                    </div>
                    <button onClick={onClose} className="p-4 bg-slate-900 hover:bg-red-500 hover:text-white rounded-2xl text-slate-400 transition-all"><X size={22} /></button>
                </div>

                {/* Summary Strip */}
                <div className="px-8 py-3 border-b border-slate-800/30 flex gap-6 shrink-0 bg-slate-900/20">
                    {Object.entries(totals).map(([type, val]) => (
                        <div key={type} className="flex items-center gap-2">
                            <span className={`text-[10px] font-black uppercase tracking-widest ${TYPE_COLOR[type]}`}>{type}</span>
                            <span className="font-mono text-xs text-white font-bold">Rs. {val.toLocaleString()}</span>
                        </div>
                    ))}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-hidden flex flex-col bg-[#020617] p-6">

                    <div className="flex justify-end mb-4 shrink-0">
                        {!showForm && (
                            <button
                                onClick={() => { setEditingId(null); setFormData({ ...DEFAULT_FORM }); setShowForm(true); }}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2"
                            >
                                <Plus size={14} strokeWidth={3} /> Add Ledger Account
                            </button>
                        )}
                    </div>

                    {/* Form */}
                    {showForm && (
                        <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-[2rem] mb-4 animate-in slide-in-from-top-4 shrink-0">
                            <h3 className="text-white text-lg font-black uppercase tracking-tighter mb-5">{editingId ? 'Modify Ledger Account' : 'New Ledger Account'}</h3>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid grid-cols-4 gap-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">GL Code</label>
                                        <input required type="text" value={formData.code}
                                            onChange={e => setFormData({ ...formData, code: e.target.value })}
                                            className="w-full bg-slate-950 text-white rounded-xl px-4 py-2.5 border border-slate-800 outline-none focus:border-indigo-500 font-mono text-sm"
                                            placeholder="e.g. 5000" />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Account Name</label>
                                        <input required type="text" value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full bg-slate-950 text-white rounded-xl px-4 py-2.5 border border-slate-800 outline-none focus:border-indigo-500 text-sm"
                                            placeholder="e.g. Rider Payroll" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Nature</label>
                                        <select required value={formData.type}
                                            onChange={e => setFormData({ ...formData, type: e.target.value })}
                                            className="w-full bg-slate-950 text-white rounded-xl px-4 py-2.5 border border-slate-800 outline-none focus:border-indigo-500 text-sm">
                                            <option value="ASSET">ASSET</option>
                                            <option value="LIABILITY">LIABILITY</option>
                                            <option value="EQUITY">EQUITY</option>
                                            <option value="REVENUE">REVENUE</option>
                                            <option value="EXPENSE">EXPENSE</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div className="col-span-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Parent Account (optional)</label>
                                        <select value={formData.parent_id || ''}
                                            onChange={e => setFormData({ ...formData, parent_id: e.target.value || null })}
                                            className="w-full bg-slate-950 text-white rounded-xl px-4 py-2.5 border border-slate-800 outline-none focus:border-indigo-500 text-sm">
                                            <option value="">— No Parent (Top-Level Account) —</option>
                                            {parentAccounts
                                                .filter(a => a.id !== editingId)
                                                .map(a => (
                                                    <option key={a.id} value={a.id}>{a.code} – {a.name}</option>
                                                ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Status</label>
                                        <div className="flex items-center gap-3 pt-2.5">
                                            <input type="checkbox" checked={formData.is_active}
                                                onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                                                className="size-4 accent-indigo-500 rounded border-slate-700 bg-slate-900" />
                                            <span className="text-white font-bold text-xs uppercase tracking-widest text-slate-400">Ledger Active</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Description</label>
                                    <input type="text" value={formData.description}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                        className="w-full bg-slate-950 text-white rounded-xl px-4 py-2.5 border border-slate-800 outline-none focus:border-indigo-500 text-sm"
                                        placeholder="Optional description..." />
                                </div>

                                <div className="flex gap-3 pt-2 border-t border-slate-800">
                                    <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }}
                                        className="flex-1 bg-slate-900 text-white font-black uppercase text-xs tracking-widest py-3 rounded-xl hover:bg-slate-800 transition">Cancel</button>
                                    <button type="submit" disabled={submitting}
                                        className="flex-1 bg-indigo-600 text-white font-black uppercase text-xs tracking-widest py-3 rounded-xl hover:bg-indigo-500 transition disabled:opacity-50">
                                        {submitting ? 'Saving...' : 'Commit Account'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Accounts Table */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar border border-slate-800/50 rounded-3xl bg-slate-900/20">
                        <table className="w-full text-left">
                            <thead className="sticky top-0 bg-[#0B0F19] z-10">
                                <tr className="text-[10px] font-black uppercase text-slate-500 border-b border-slate-800">
                                    <th className="px-4 py-3">GL Code</th>
                                    <th className="px-4 py-3">Account Name</th>
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3 text-right">Balance</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-xs">
                                {loading ? (
                                    <tr><td colSpan={6} className="text-center py-12 text-slate-600 animate-pulse">Loading accounts...</td></tr>
                                ) : roots.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center py-12 text-slate-600 italic">No accounts yet. Click "Add Ledger Account" to get started.</td></tr>
                                ) : (
                                    roots.map(acc => renderRow(acc, 0))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
