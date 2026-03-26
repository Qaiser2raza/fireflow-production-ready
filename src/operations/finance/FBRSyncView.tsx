import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../client/contexts/AppContext';
import {
    Receipt,
    Search,
    Download,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    Clock,
    ChevronLeft,
    ChevronRight,
    Ban,
    Loader2,
    TrendingUp,
    History
} from 'lucide-react';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';

interface FBRInvoice {
    id: string;
    order_number: string;
    created_at: string;
    total: number;
    fbr_sync_status: 'PENDING' | 'SYNCED' | 'FAILED' | 'VOIDED';
    fbr_invoice_number?: string;
    payment_status: string;
}

const FBRSyncView: React.FC = () => {
    const { addNotification } = useAppContext();
    const [invoices, setInvoices] = useState<FBRInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncingAll, setSyncingAll] = useState(false);
    const [stats, setStats] = useState({
        totalInvoices: 0,
        pendingFBR: 0,
        syncedToday: 0
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalServerCount, setTotalServerCount] = useState(0);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [statsResRaw, invoicesResRaw] = await Promise.all([
                fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/fbr/stats`),
                fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/fbr/invoices?status=${filterStatus}&search=${searchTerm}&page=${page}`)
            ]);

            const statsRes = await statsResRaw.json() as any;
            const invoicesRes = await invoicesResRaw.json() as any;

            if (statsRes.success) setStats(statsRes.stats);
            if (invoicesRes.success) {
                setInvoices(invoicesRes.invoices);
                setTotalPages(invoicesRes.totalPages || 1);
                setTotalServerCount(invoicesRes.totalCount || invoicesRes.invoices.length);
            }
        } catch (err) {
            console.error('Error fetching FBR data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [filterStatus, page]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1); // Reset to first page on search
        fetchData();
    };

    const handleSyncSingle = async (orderId: string) => {
        try {
            const raw = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/fbr/sync/${orderId}`, { method: 'POST' });
            const res = await raw.json() as any;
            if (res.success) {
                addNotification('success', `Synced with FBR: ${res.invoiceNumber}`);
                fetchData();
            } else {
                addNotification('error', `Sync Failed: ${res.error}`);
            }
        } catch (err) {
            addNotification('error', 'Network error during sync');
        }
    };

    const handleSyncAll = async () => {
        if (stats.pendingFBR === 0) return;

        try {
            setSyncingAll(true);
            const raw = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/fbr/sync-all`, { method: 'POST' });
            const res = await raw.json() as any;
            if (res.success) {
                addNotification('success', `Batch Sync Complete: ${res.syncedCount} synced, ${res.failedCount} failed`);
                fetchData();
            }
        } catch (err) {
            addNotification('error', 'Error during batch sync');
        } finally {
            setSyncingAll(false);
        }
    };

    const handleVoid = async (orderId: string) => {
        if (!window.confirm("Are you sure you want to void this invoice? It will no longer be considered for FBR sync.")) return;
        try {
            const raw = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/fbr/void/${orderId}`, { method: 'POST' });
            const res = await raw.json() as any;
            if (res.success) {
                addNotification('success', 'Invoice Voided');
                fetchData();
            } else {
                addNotification('error', `Failed to void: ${res.error}`);
            }
        } catch (err) {
            addNotification('error', 'Network error');
        }
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'SYNCED':
                return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
            case 'PENDING':
                return 'bg-[#ffcc00]/20 text-[#ffcc00]';
            case 'FAILED':
                return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300';
            case 'VOIDED':
                return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0a0e1a] text-slate-100 overflow-hidden">
            {/* Header Section */}
            <header className="flex items-center bg-[#111827] border-b border-slate-800 p-4 sticky top-0 z-10 shrink-0">
                <div className="flex items-center gap-3 flex-1">
                    <div className="bg-primary/10 p-2 rounded-lg text-primary">
                        <Receipt size={24} />
                    </div>
                    <h1 className="text-xl font-bold tracking-tight text-white">FBR Sync Manager</h1>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-900/20 border border-green-800 rounded-full">
                    <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                    <p className="text-green-400 text-sm font-semibold uppercase tracking-widest text-[10px]">IMS Online</p>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
                <div className="max-w-7xl mx-auto w-full space-y-6">
                    {/* Summary Statistics Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
                        <div className="flex flex-col gap-2 rounded-xl p-6 bg-[#111827] border border-slate-800 shadow-sm relative overflow-hidden group">
                            <div className="flex justify-between items-start z-10">
                                <p className="text-slate-400 text-sm font-medium">Total Invoices</p>
                                <Receipt className="text-slate-500" size={20} />
                            </div>
                            <p className="tracking-tight text-3xl font-bold text-white z-10">{stats.totalInvoices.toLocaleString()}</p>
                            <div className="flex items-center gap-1 text-green-400 text-xs font-medium z-10">
                                <TrendingUp size={14} />
                                <span>Lifetime Compliance</span>
                            </div>
                            <div className="absolute top-0 right-0 -mr-6 -mt-6 opacity-[0.03] rotate-12 transition-transform group-hover:scale-110">
                                <Receipt size={120} />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 rounded-xl p-6 bg-[#111827] border border-slate-800 shadow-sm relative overflow-hidden group">
                            <div className="flex justify-between items-start z-10">
                                <p className="text-slate-400 text-sm font-medium">Pending FBR</p>
                                <AlertCircle className="text-amber-500/50" size={20} />
                            </div>
                            <p className="tracking-tight text-3xl font-bold text-white z-10">{stats.pendingFBR}</p>
                            <div className="flex items-center gap-1 text-amber-400 text-xs font-medium z-10">
                                <Clock size={14} />
                                <span>Needs synchronization</span>
                            </div>
                            <div className="absolute top-0 right-0 -mr-6 -mt-6 opacity-[0.03] rotate-12 transition-transform group-hover:scale-110">
                                <AlertCircle size={120} />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 rounded-xl p-6 bg-[#111827] border border-slate-800 shadow-sm relative overflow-hidden group">
                            <div className="flex justify-between items-start z-10">
                                <p className="text-slate-400 text-sm font-medium">Synced Today</p>
                                <CheckCircle2 className="text-green-400/50" size={20} />
                            </div>
                            <p className="tracking-tight text-3xl font-bold text-white z-10">{stats.syncedToday}</p>
                            <div className="flex items-center gap-1 text-xs font-medium text-primary z-10">
                                <History size={14} />
                                <span>Last sync 5m ago</span>
                            </div>
                            <div className="absolute top-0 right-0 -mr-6 -mt-6 opacity-[0.03] rotate-12 transition-transform group-hover:scale-110">
                                <CheckCircle2 size={120} />
                            </div>
                        </div>
                    </div>

                    {/* Search and Filter Bar */}
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                            <form onSubmit={handleSearch} className="flex flex-col w-full h-12">
                                <div className="flex w-full flex-1 items-stretch rounded-lg h-full bg-[#111827] border border-slate-800 overflow-hidden focus-within:ring-2 focus-within:ring-primary/50 transition-all">
                                    <div className="text-slate-400 flex items-center justify-center pl-4">
                                        <Search size={18} />
                                    </div>
                                    <input
                                        className="w-full flex-1 border-none bg-transparent focus:outline-none focus:ring-0 text-white placeholder:text-slate-500 px-3 text-sm font-normal"
                                        placeholder="Search by Invoice ID, Amount, or Date"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                    <button type="submit" className="hidden"></button>
                                </div>
                            </form>
                        </div>
                        <div className="flex gap-2">
                            <select
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="flex h-12 items-center justify-center gap-2 rounded-lg bg-[#111827] border border-slate-800 px-4 text-slate-200 hover:bg-slate-800 transition-colors focus:ring-primary/50 text-sm font-medium"
                            >
                                <option value="">All Statuses</option>
                                <option value="PENDING">Pending</option>
                                <option value="SYNCED">Synced</option>
                                <option value="FAILED">Failed</option>
                                <option value="VOIDED">Voided</option>
                            </select>
                            <button className="flex h-12 items-center justify-center gap-2 rounded-lg bg-[#111827] border border-slate-800 px-4 text-slate-200 hover:bg-slate-800 transition-colors">
                                <Download size={18} />
                                <span className="text-sm font-medium">Export</span>
                            </button>
                        </div>
                    </div>

                    {/* Invoice List Table */}
                    <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-800/50 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">
                                        <th className="px-6 py-4 border-b border-slate-800">Invoice ID</th>
                                        <th className="px-6 py-4 border-b border-slate-800">Timestamp</th>
                                        <th className="px-6 py-4 border-b border-slate-800">Amount</th>
                                        <th className="px-6 py-4 border-b border-slate-800">FBR Status</th>
                                        <th className="px-6 py-4 border-b border-slate-800 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800 text-xs">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-20 text-center">
                                                <div className="flex flex-col items-center gap-3">
                                                    <Loader2 size={32} className="text-secondary animate-spin" />
                                                    <span className="text-slate-500 font-bold uppercase tracking-widest">Loading Invoices...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : invoices.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-20 text-center text-slate-500 font-bold uppercase tracking-widest">
                                                No Invoices Found
                                            </td>
                                        </tr>
                                    ) : (
                                        invoices.map((inv) => (
                                            <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors group">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-white text-[10px] uppercase tracking-wider">{inv.order_number || `#${inv.id.substring(0, 8)}`}</span>
                                                        {inv.fbr_invoice_number && (
                                                            <span className="text-[9px] text-primary font-bold mt-1 uppercase tracking-tighter">FBR: {inv.fbr_invoice_number}</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-slate-400">
                                                    {new Date(inv.created_at).toLocaleDateString('en-PK', { month: 'short', day: 'numeric', year: 'numeric' })} · {new Date(inv.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap font-black text-white">
                                                    Rs. {Number(inv.total).toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${getStatusStyle(inv.fbr_sync_status)}`}>
                                                        {inv.fbr_sync_status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {inv.fbr_sync_status !== 'SYNCED' && (
                                                            <button
                                                                onClick={() => handleSyncSingle(inv.id)}
                                                                className="p-1.5 hover:bg-primary/10 text-primary rounded-lg transition-colors"
                                                                title="Retry Sync"
                                                            >
                                                                <RefreshCw size={16} />
                                                            </button>
                                                        )}
                                                        {inv.fbr_sync_status !== 'SYNCED' && inv.fbr_sync_status !== 'VOIDED' && (
                                                            <button onClick={() => handleVoid(inv.id)} className="p-1.5 hover:bg-amber-900/30 text-amber-500 rounded-lg transition-colors" title="Void"><Ban size={16} /></button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-6 py-4 bg-slate-800/30 border-t border-slate-800 flex items-center justify-between shrink-0">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Showing {invoices.length} of {totalServerCount} results (Page {page} of {totalPages})</p>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="p-2 bg-[#111827] border border-slate-800 rounded hover:bg-slate-800 disabled:opacity-50 text-slate-300 transition-colors"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <button 
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="p-2 bg-[#111827] border border-slate-800 rounded hover:bg-slate-800 disabled:opacity-50 text-slate-300 transition-colors"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Global Action Bar */}
            <footer className="shrink-0 bg-[#0a0e1a]/80 backdrop-blur-md border-t border-slate-800 p-4 sticky bottom-0 z-20">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <span className={`flex h-3 w-3 rounded-full ${stats.pendingFBR > 0 ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)] animate-pulse' : 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]'}`}></span>
                        <p className="text-slate-200 text-xs font-bold uppercase tracking-widest">
                            {stats.pendingFBR} Invoices waiting to be synced with FBR
                        </p>
                    </div>
                    <button
                        onClick={handleSyncAll}
                        disabled={stats.pendingFBR === 0 || syncingAll}
                        className="w-full md:w-auto px-8 py-3 bg-primary text-[#0a0e1a] rounded-lg font-black shadow-lg shadow-primary/10 hover:bg-primary/90 transition-all active:scale-95 flex items-center justify-center gap-2 uppercase tracking-[0.15em] text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {syncingAll ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                        Sync All Pending
                    </button>
                </div>
            </footer>
        </div>
    );
};

export default FBRSyncView;
