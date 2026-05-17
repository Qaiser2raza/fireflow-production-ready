import React, { useState, useEffect } from 'react';
import { X, Download, Loader2, DollarSign } from 'lucide-react';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';

interface AccountLedgerModalProps {
    isOpen: boolean;
    onClose: () => void;
    accountId: string;
    accountCode: string;
    accountName: string;
    dateFrom: string;
    dateTo: string;
}

interface LedgerEntry {
    id: string;
    created_at: string;
    reference_type: string;
    description: string;
    transaction_type: 'DEBIT' | 'CREDIT';
    debit: number;
    credit: number;
    amount: number;
}

export const AccountLedgerModal: React.FC<AccountLedgerModalProps> = ({ 
    isOpen, onClose, accountId, accountCode, accountName, dateFrom, dateTo 
}) => {
    const [loading, setLoading] = useState(false);
    const [entries, setEntries] = useState<LedgerEntry[]>([]);
    const [openingBalance, setOpeningBalance] = useState(0);
    const [accountType, setAccountType] = useState('');

    const fetchLedger = async () => {
        if (!accountId) return;
        setLoading(true);
        try {
            let url = `${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/accounting/ledger?accountId=${accountId}&limit=1000`;
            if (dateFrom) url += `&startDate=${dateFrom}`;
            if (dateTo) url += `&endDate=${dateTo}`;

            const res = await fetchWithAuth(url);
            const data = await res.json();
            if (data.success) {
                setEntries(data.entries || []);
                setOpeningBalance(Number(data.opening_balance) || 0);
                setAccountType(data.account_type || '');
            }
        } catch (error) {
            console.error('Error fetching account ledger:', error);
            setEntries([]);
            setOpeningBalance(0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchLedger();
        }
    }, [isOpen, accountId, dateFrom, dateTo]);

    if (!isOpen) return null;

    // Calculate running balances
    const isDebitNormal = accountType === 'ASSET' || accountType === 'EXPENSE';
    
    let currentBalance = openingBalance;
    const entriesWithBalance = entries.map(entry => {
        const debit = Number(entry.debit) || 0;
        const credit = Number(entry.credit) || 0;
        
        if (isDebitNormal) {
            currentBalance += (debit - credit);
        } else {
            currentBalance += (credit - debit);
        }

        return { ...entry, running_balance: currentBalance };
    });

    const closingBalance = currentBalance;
    const totalDebits = entries.reduce((sum, e) => sum + Number(e.debit || 0), 0);
    const totalCredits = entries.reduce((sum, e) => sum + Number(e.credit || 0), 0);

    const handleExportCSV = () => {
        const headers = ["Date", "Description", "Ref Type", "Debit", "Credit", "Running Balance"];
        const rows = [
            ["", "Opening Balance", "", "", "", openingBalance.toFixed(2)],
            ...entriesWithBalance.map(e => [
                new Date(e.created_at).toLocaleString(),
                `"${e.description || '-'}"`,
                e.reference_type || '-',
                Number(e.debit).toFixed(2),
                Number(e.credit).toFixed(2),
                Number(e.running_balance).toFixed(2)
            ]),
            ["", "Closing Balance", "", totalDebits.toFixed(2), totalCredits.toFixed(2), closingBalance.toFixed(2)]
        ];

        const csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `ledger_${accountCode}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="fixed inset-0 z-[60] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
            <div className="bg-[#0B0F19] border border-slate-700 rounded-[2rem] shadow-2xl w-full max-w-6xl flex flex-col h-[90vh] overflow-hidden">
                
                {/* Header */}
                <div className="px-8 py-6 border-b border-slate-800/80 flex justify-between items-center bg-slate-900/60 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                            <DollarSign size={28} strokeWidth={3} />
                        </div>
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h2 className="text-3xl font-black text-white tracking-tighter leading-none">{accountName}</h2>
                                <span className="px-2.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs font-mono">{accountCode}</span>
                                {accountType && (
                                    <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold text-[10px] uppercase tracking-wider">{accountType}</span>
                                )}
                            </div>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                                Account Ledger Drill-Down
                                {(dateFrom || dateTo) && (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                                        <span className="text-indigo-400/70">
                                            {dateFrom || 'Start'} to {dateTo || 'End'}
                                        </span>
                                    </>
                                )}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={handleExportCSV} className="p-3 bg-slate-800 hover:bg-indigo-600 rounded-xl text-white transition-colors" title="Export CSV">
                            <Download size={18} />
                        </button>
                        <button onClick={onClose} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Body - Table */}
                <div className="flex-1 overflow-y-auto p-0 relative bg-[#06080D]">
                    {loading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <Loader2 size={32} className="text-indigo-500 animate-spin mb-4" />
                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Loading Ledger Entries...</span>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-[#0B0F19] z-10 shadow-md">
                                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-800">
                                    <th className="px-6 py-4">Date</th>
                                    <th className="px-6 py-4">Description</th>
                                    <th className="px-6 py-4">Ref Type</th>
                                    <th className="px-6 py-4 text-right">Debit</th>
                                    <th className="px-6 py-4 text-right">Credit</th>
                                    <th className="px-6 py-4 text-right">Balance</th>
                                </tr>
                            </thead>
                            <tbody className="text-xs font-mono">
                                {/* Opening Balance Row */}
                                <tr className="border-b border-slate-800/50 bg-slate-900/30">
                                    <td colSpan={3} className="px-6 py-4 text-slate-400 font-bold uppercase tracking-widest text-[10px] text-right">
                                        Opening Balance
                                    </td>
                                    <td className="px-6 py-4 text-right">—</td>
                                    <td className="px-6 py-4 text-right">—</td>
                                    <td className="px-6 py-4 text-right text-indigo-400 font-black text-sm">
                                        Rs. {openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                </tr>

                                {/* Entries */}
                                {entriesWithBalance.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-bold">
                                            No entries found for this period.
                                        </td>
                                    </tr>
                                ) : (
                                    entriesWithBalance.map((e, idx) => (
                                        <tr key={e.id || idx} className="border-b border-slate-800/30 hover:bg-slate-800/40 transition-colors">
                                            <td className="px-6 py-3 text-slate-400 whitespace-nowrap">
                                                {new Date(e.created_at).toLocaleString(undefined, { 
                                                    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' 
                                                })}
                                            </td>
                                            <td className="px-6 py-3 text-white max-w-[300px] truncate" title={e.description}>
                                                {e.description || '-'}
                                            </td>
                                            <td className="px-6 py-3">
                                                <span className="inline-block px-2 py-0.5 rounded border border-slate-700 text-[9px] bg-slate-800 text-slate-400 font-black uppercase tracking-widest">
                                                    {e.reference_type?.replace(/_/g, ' ') || 'MANUAL'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-right text-emerald-400/90 font-bold">
                                                {Number(e.debit) > 0 ? Number(e.debit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}
                                            </td>
                                            <td className="px-6 py-3 text-right text-rose-400/90 font-bold">
                                                {Number(e.credit) > 0 ? Number(e.credit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}
                                            </td>
                                            <td className="px-6 py-3 text-right text-indigo-300 font-bold">
                                                {Number(e.running_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    ))
                                )}

                                {/* Closing Balance Row */}
                                <tr className="border-t border-slate-700 bg-slate-900/50">
                                    <td colSpan={3} className="px-6 py-5 text-slate-300 font-black uppercase tracking-widest text-[10px] text-right">
                                        Closing Balance & Period Totals
                                    </td>
                                    <td className="px-6 py-5 text-right font-black text-emerald-500/80 text-sm">
                                        {totalDebits > 0 ? totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                                    </td>
                                    <td className="px-6 py-5 text-right font-black text-rose-500/80 text-sm">
                                        {totalCredits > 0 ? totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                                    </td>
                                    <td className="px-6 py-5 text-right text-indigo-400 font-black text-base border-l border-slate-700/50">
                                        Rs. {closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};
