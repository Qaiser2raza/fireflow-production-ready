import React, { useState, useEffect } from 'react';
import { X, Plus, Edit2, Archive, CheckCircle2 } from 'lucide-react';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';
import { useAppContext } from '../../../client/contexts/AppContext';

interface Account {
    id: string;
    code: string;
    name: string;
    type: string;
    description: string;
    is_active: boolean;
}

interface COAModalProps {
    onClose: () => void;
}

export const ChartOfAccountsModal: React.FC<COAModalProps> = ({ onClose }) => {
    const { addNotification } = useAppContext();
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [loading, setLoading] = useState(true);

    // Form
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        code: '',
        name: '',
        type: 'EXPENSE',
        description: '',
        is_active: true
    });

    const loadCOA = async () => {
        try {
            const res = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/accounting/coa`);
            if (res.ok) {
                setAccounts(await res.json());
            }
        } catch (err: any) {
            addNotification('error', err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCOA();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const isEdit = !!editingId;
            const url = isEdit ? `${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/accounting/coa/${editingId}` : `${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/accounting/coa`;
            const method = isEdit ? 'PATCH' : 'POST';

            const res = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to save account');
            }

            addNotification('success', `Account ${isEdit ? 'updated' : 'created'}`);
            setShowForm(false);
            loadCOA();
        } catch (err: any) {
            addNotification('error', err.message);
        }
    };

    const getAccountTypeColor = (type: string) => {
        switch (type) {
            case 'ASSET': return 'text-emerald-400';
            case 'LIABILITY': return 'text-rose-400';
            case 'EQUITY': return 'text-indigo-400';
            case 'REVENUE': return 'text-gold-400';
            case 'EXPENSE': return 'text-purple-400';
            default: return 'text-slate-400';
        }
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-8 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-950 border border-slate-800 w-full max-w-5xl h-[85vh] rounded-[2.5rem] flex flex-col shadow-2xl shadow-indigo-500/10 overflow-hidden relative">
                <div className="p-8 border-b border-slate-800/50 flex justify-between items-center bg-slate-900/50">
                    <div>
                        <h2 className="text-3xl font-black tracking-tighter text-white uppercase flex items-center gap-4">
                            Chart of Accounts
                            {loading && <span className="animate-pulse text-xs text-indigo-500 ml-4 font-mono tracking-widest">SYNCING...</span>}
                        </h2>
                        <p className="text-slate-500 text-xs uppercase tracking-widest font-bold mt-2">Financial Categorization Schema</p>
                    </div>
                    <button onClick={onClose} className="p-4 bg-slate-900 hover:bg-red-500 hover:text-white rounded-2xl text-slate-400 transition-all">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col bg-[#020617] p-8">

                    <div className="flex justify-end mb-6">
                        {!showForm && (
                            <button
                                onClick={() => {
                                    setEditingId(null);
                                    setFormData({ code: '', name: '', type: 'EXPENSE', description: '', is_active: true });
                                    setShowForm(true);
                                }}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-2"
                            >
                                <Plus size={16} strokeWidth={3} /> Add Ledger Account
                            </button>
                        )}
                    </div>

                    {showForm ? (
                        <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-[2rem] animate-in slide-in-from-top-4">
                            <h3 className="text-white text-xl font-black uppercase tracking-tighter mb-6">{editingId ? 'Modify Ledger Code' : 'New Ledger Node'}</h3>
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid grid-cols-3 gap-6">
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">GL Code</label>
                                        <input
                                            required
                                            type="text"
                                            value={formData.code}
                                            onChange={e => setFormData({ ...formData, code: e.target.value })}
                                            className="w-full bg-slate-950 text-white rounded-xl px-4 py-3 border border-slate-800 outline-none focus:border-indigo-500 font-mono"
                                            placeholder="e.g. 5000"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Account Name</label>
                                        <input
                                            required
                                            type="text"
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full bg-slate-950 text-white rounded-xl px-4 py-3 border border-slate-800 outline-none focus:border-indigo-500"
                                            placeholder="e.g. Rider Payroll"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Nature</label>
                                        <select
                                            required
                                            value={formData.type}
                                            onChange={e => setFormData({ ...formData, type: e.target.value })}
                                            className="w-full bg-slate-950 text-white rounded-xl px-4 py-3 border border-slate-800 outline-none focus:border-indigo-500"
                                        >
                                            <option value="ASSET">ASSET</option>
                                            <option value="LIABILITY">LIABILITY</option>
                                            <option value="EQUITY">EQUITY</option>
                                            <option value="REVENUE">REVENUE</option>
                                            <option value="EXPENSE">EXPENSE</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Status</label>
                                        <div className="flex items-center gap-3 pt-3">
                                            <input
                                                type="checkbox"
                                                checked={formData.is_active}
                                                onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                                                className="size-5 accent-indigo-500 rounded border-slate-700 bg-slate-900"
                                            />
                                            <span className="text-white font-bold tracking-widest text-xs uppercase text-slate-400">Ledger Active</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Description</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                        className="w-full bg-slate-950 text-white rounded-xl px-4 py-3 border border-slate-800 outline-none focus:border-indigo-500 min-h-[100px]"
                                        placeholder="Optional details"
                                    />
                                </div>

                                <div className="flex gap-4 pt-4 border-t border-slate-800">
                                    <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-slate-900 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl hover:bg-slate-800 transition shadow-inner">Cancel</button>
                                    <button type="submit" className="flex-1 bg-indigo-600 text-white font-black uppercase text-xs tracking-widest py-4 rounded-xl hover:bg-indigo-500 transition shadow-lg shadow-indigo-900/30">Commit Node</button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto custom-scrollbar border border-slate-800/50 rounded-3xl bg-slate-900/20">
                            <table className="w-full text-left">
                                <thead className="sticky top-0 bg-[#0B0F19] z-10">
                                    <tr className="text-[10px] font-black uppercase text-slate-500 border-b border-slate-800">
                                        <th className="px-6 py-4">Node Code</th>
                                        <th className="px-6 py-4">Account Designation</th>
                                        <th className="px-6 py-4">Nature</th>
                                        <th className="px-6 py-4 text-center">Status</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="text-xs">
                                    {accounts.map(acc => (
                                        <tr key={acc.id} className="border-b border-slate-800/30 hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-6 py-4 font-mono text-indigo-300 font-bold">{acc.code}</td>
                                            <td className="px-6 py-4">
                                                <div className="text-white font-black tracking-tight">{acc.name}</div>
                                                {acc.description && <div className="text-slate-500 mt-1 max-w-xs truncate">{acc.description}</div>}
                                            </td>
                                            <td className="px-6 py-4 font-black tracking-widest">
                                                <span className={getAccountTypeColor(acc.type)}>{acc.type}</span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {acc.is_active ?
                                                    <span className="inline-flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md"><CheckCircle2 size={12} /> Active</span> :
                                                    <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-800 px-2 py-1 rounded-md"><Archive size={12} /> Inactive</span>}
                                            </td>
                                            <td className="px-6 py-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => {
                                                        setEditingId(acc.id);
                                                        setFormData({ code: acc.code, name: acc.name, type: acc.type, description: acc.description || '', is_active: acc.is_active });
                                                        setShowForm(true);
                                                    }}
                                                    className="p-2 bg-slate-800 text-slate-300 hover:text-indigo-400 hover:bg-slate-700 rounded-lg transition"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
