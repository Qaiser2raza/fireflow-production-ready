import React, { useState, useEffect } from 'react';
import { X, FileText, Download, Loader2, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';

interface TrialBalanceModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface TrialBalanceRow {
    id: string;
    code: string;
    name: string;
    type: string;
    debit: number | string;
    credit: number | string;
}

export const TrialBalanceModal: React.FC<TrialBalanceModalProps> = ({ isOpen, onClose }) => {
    const [loading, setLoading] = useState(false);
    const [balances, setBalances] = useState<TrialBalanceRow[]>([]);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const fetchBalances = async () => {
        setLoading(true);
        try {
            let url = `${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/accounting/trial-balance?`;
            if (dateFrom) url += `from=${dateFrom}&`;
            if (dateTo) url += `to=${dateTo}&`;

            const res = await fetchWithAuth(url);
            const data = await res.json();
            if (data.success) {
                setBalances(data.trial_balance || []);
            }
        } catch (error) {
            console.error('Error fetching trial balance:', error);
            setBalances([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchBalances();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const totalDebit = balances.reduce((sum, r) => sum + Number(r.debit || 0), 0);
    const totalCredit = balances.reduce((sum, r) => sum + Number(r.credit || 0), 0);
    const difference = Math.abs(totalDebit - totalCredit);
    const isBalanced = difference < 0.01; // Allows for minor floating point diffs

    const handleExportCSV = () => {
        const headers = ["Account Code", "Account Name", "Type", "Debit", "Credit"];
        const rows = balances.map(b => [
            b.code,
            `"${b.name}"`,
            b.type,
            Number(b.debit).toFixed(2),
            Number(b.credit).toFixed(2)
        ]);

        // Add total row
        rows.push(["", '"TOTAL"', "", totalDebit.toFixed(2), totalCredit.toFixed(2)]);

        const csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `trial_balance_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
            <div className="bg-[#0B0F19] border border-slate-800 rounded-[2rem] shadow-2xl w-full max-w-5xl flex flex-col h-[90vh]">
                
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-800/50 flex justify-between items-center bg-slate-900/40 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500">
                            <FileText size={24} strokeWidth={3} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white tracking-tighter uppercase leading-none mb-1">Trial Balance</h2>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Verify Ledger Integrity</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex bg-slate-900 border border-slate-700 rounded-xl overflow-hidden p-1">
                            <input 
                                type="date" 
                                value={dateFrom} 
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="bg-transparent border-none text-white text-[10px] font-bold uppercase px-3 py-1 outline-none"
                            />
                            <span className="text-slate-500 self-center text-xs px-2">to</span>
                            <input 
                                type="date" 
                                value={dateTo} 
                                onChange={(e) => setDateTo(e.target.value)}
                                className="bg-transparent border-none text-white text-[10px] font-bold uppercase px-3 py-1 outline-none"
                            />
                            <button 
                                onClick={fetchBalances}
                                className="bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-black uppercase px-4 py-1 rounded-lg ml-1 transition-colors"
                            >
                                Apply
                            </button>
                        </div>
                        <button onClick={handleExportCSV} className="p-3 bg-slate-800 hover:bg-blue-600 rounded-xl text-white transition-colors" title="Export CSV">
                            <Download size={18} />
                        </button>
                        <button onClick={onClose} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Body - Table */}
                <div className="flex-1 overflow-y-auto p-8 relative">
                    {loading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <Loader2 size={32} className="text-blue-500 animate-spin mb-4" />
                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Calculating Balances...</span>
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead className="sticky top-0 bg-[#0B0F19] z-10 shadow-[0_4px_20px_#0B0F19]">
                                <tr className="text-[10px] font-black uppercase text-slate-500 border-b border-slate-800/50">
                                    <th className="px-4 py-3 pb-4">Account Code</th>
                                    <th className="px-4 py-3 pb-4">Account Name</th>
                                    <th className="px-4 py-3 pb-4 text-center">Type</th>
                                    <th className="px-4 py-3 pb-4 text-right">Debit Balance</th>
                                    <th className="px-4 py-3 pb-4 text-right">Credit Balance</th>
                                </tr>
                            </thead>
                            <tbody className="text-xs font-mono">
                                {balances.map(b => (
                                    <tr key={b.id} className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors">
                                        <td className="px-4 py-3 text-slate-400 font-bold">{b.code}</td>
                                        <td className="px-4 py-3 text-white max-w-[200px] truncate">{b.name}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="inline-block px-2 py-0.5 rounded border border-slate-700 text-[9px] bg-slate-800 text-slate-300 font-black uppercase tracking-widest">
                                                {b.type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-emerald-400 font-bold">
                                            {Number(b.debit) > 0 ? `Rs. ${Number(b.debit).toLocaleString()}` : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-rose-400 font-bold">
                                            {Number(b.credit) > 0 ? `Rs. ${Number(b.credit).toLocaleString()}` : '—'}
                                        </td>
                                    </tr>
                                ))}

                                {/* Totals Row */}
                                <tr className="bg-slate-900 border-t-2 border-slate-700">
                                    <td colSpan={3} className="px-4 py-5 text-right font-black text-white uppercase tracking-widest text-[10px]">
                                        Grand Totals
                                    </td>
                                    <td className="px-4 py-5 font-black text-emerald-400 text-right text-sm">
                                        Rs. {totalDebit.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-5 font-black text-rose-400 text-right text-sm">
                                        Rs. {totalCredit.toLocaleString()}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer Validation Strip */}
                <div className={`shrink-0 p-4 flex items-center justify-between text-xs font-black uppercase tracking-widest transition-colors ${
                    loading ? 'bg-slate-900 text-slate-500' : 
                    isBalanced ? 'bg-emerald-500/10 text-emerald-500 border-t border-emerald-500/20' : 
                    'bg-red-500/10 text-red-500 border-t border-red-500/20'
                }`}>
                    <div className="flex items-center gap-2">
                        {loading ? <Loader2 size={16} className="animate-spin" /> : 
                         isBalanced ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                        <span>
                            {loading ? 'Validating Ledger...' : 
                             isBalanced ? 'Ledger is Balanced ✓' : 'Ledger Out of Balance ⚠'}
                        </span>
                    </div>
                    {!isBalanced && !loading && (
                        <span>Difference: Rs. {difference.toLocaleString()}</span>
                    )}
                </div>
            </div>
        </div>
    );
};
