import React, { useState, useEffect, useMemo } from 'react';
import {
    Package,
    Search,
    ChevronRight,
    RefreshCw,
    Boxes,
    Plus,
    Check,
    Lock,
} from 'lucide-react';
import { inventoryService, StockCount } from '../../../shared/lib/inventoryService';
import { useAppContext } from '../../contexts/AppContext';

interface StockCountListViewProps {
    onViewDetail: (count: StockCount) => void;
}

export const StockCountListView: React.FC<StockCountListViewProps> = ({ onViewDetail }) => {
    const { currentUser } = useAppContext();
    const canManageInventory = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(currentUser?.role ?? '');
    const [counts, setCounts] = useState<StockCount[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
    const [submittingCreate, setSubmittingCreate] = useState(false);
    const [successCount, setSuccessCount] = useState<StockCount | null>(null);

    useEffect(() => {
        loadCounts();
    }, []);

    const loadCounts = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await inventoryService.getStockCounts(filterStatus === 'ALL' ? undefined : filterStatus);
            setCounts(data.stockCounts || []);
        } catch (e: any) {
            setError(e.message || 'Failed to load stock counts');
        } finally {
            setLoading(false);
        }
    };

    const filteredCounts = useMemo(() => {
        if (!searchQuery) return counts;
        return counts.filter(c =>
            c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.operationKey.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [counts, searchQuery]);

    const handleCreate = async () => {
        setSubmittingCreate(true);
        setError(null);
        try {
            const result = await inventoryService.createStockCount();
            setSuccessCount(result.stockCount);
            await loadCounts();
        } catch (e: any) {
            const msg = e.message;
            if (msg.includes('duplicate') || msg.includes('already exists')) {
                setError('A stock count with this key already exists');
            } else {
                setError(msg || 'Failed to create stock count');
            }
        } finally {
            setSubmittingCreate(false);
        }
    };

    const handleDismissSuccess = () => {
        setSuccessCount(null);
    };

    const getStatusBadge = (status: string) => {
        if (status === 'OPEN') {
            return <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded text-[8px] font-black text-emerald-400 uppercase tracking-widest">Open</span>;
        }
        return <span className="px-2 py-0.5 bg-slate-500/20 border border-slate-500/30 rounded text-[8px] font-black text-slate-400 uppercase tracking-widest">Closed</span>;
    };

    const formatDate = (date: Date | string) => {
        return new Date(date).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-[#070b14]">
                <div className="flex flex-col items-center gap-4 text-center">
                    <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                    <p className="text-emerald-400 font-black text-xs uppercase tracking-widest mt-4">Loading Stock Counts...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex h-full bg-[#070b14] text-slate-200 overflow-hidden">
            <div className="flex-1 flex flex-col min-w-0">
                <header className="px-6 pt-6 pb-4 flex flex-col gap-4 shrink-0 border-b border-slate-800/50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            <h1 className="text-2xl font-black text-white tracking-tighter uppercase flex items-center gap-3">
                                <Boxes className="text-emerald-500" size={24} />
                                Stock Counts
                            </h1>
                            <div className="hidden lg:flex items-center gap-4 border-l border-slate-800 pl-6">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Counts</span>
                                    <span className="text-base font-black text-white">{counts.length}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Open</span>
                                    <span className="text-base font-black text-emerald-400">{counts.filter(c => c.status === 'OPEN').length}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            {canManageInventory && (
                                <button
                                    onClick={handleCreate}
                                    disabled={submittingCreate}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                                >
                                    {submittingCreate ? (
                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                    ) : <Plus size={14} />}
                                    New Count
                                </button>
                            )}
                            <button
                                onClick={loadCounts}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-700"
                            >
                                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                                Refresh
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-3 items-center">
                        <div className="relative flex-1 group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-500 transition-colors" size={16} />
                            <input
                                type="text"
                                placeholder="SEARCH BY ID OR OPERATION KEY..."
                                className="w-full bg-slate-900/50 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-xs font-bold focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all uppercase tracking-wider text-white placeholder:text-slate-600"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => setFilterStatus(filterStatus === 'ALL' ? 'OPEN' : 'ALL')}
                            className={`px-4 py-3 rounded-xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all border ${
                                filterStatus === 'OPEN'
                                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30'
                                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-800'
                            }`}
                        >
                            {filterStatus === 'OPEN' ? <Check size={14} /> : <Lock size={14} />}
                            {filterStatus === 'OPEN' ? 'Open Only' : 'All Statuses'}
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
                    {error && (
                        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                            <p className="text-red-400 text-xs font-bold">{error}</p>
                            <button onClick={loadCounts} className="text-red-300 text-[10px] underline mt-2">Retry</button>
                        </div>
                    )}

                    {successCount && (
                        <div className="mb-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Check className="text-emerald-400" size={18} />
                                <div>
                                    <p className="text-emerald-400 text-xs font-black uppercase tracking-widest">Count Created</p>
                                    <p className="text-slate-400 text-[10px] font-mono">{successCount.id}</p>
                                </div>
                            </div>
                            <button onClick={handleDismissSuccess} className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-slate-400 rounded-xl text-[10px] font-black uppercase">Dismiss</button>
                        </div>
                    )}

                    {filteredCounts.length === 0 && !error && (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <Boxes size={48} className="text-slate-700 mb-4" />
                            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">
                                {searchQuery ? 'No counts match your search' : 'No stock counts found'}
                            </p>
                            <p className="text-slate-600 text-xs mt-2">
                                {searchQuery ? 'Try a different search' : 'Create a new stock count to begin'}
                            </p>
                        </div>
                    )}

                    {filteredCounts.length > 0 && (
                        <div className="space-y-3">
                            {filteredCounts.map((count) => (
                                <button
                                    key={count.id}
                                    onClick={() => onViewDetail(count)}
                                    className="w-full p-4 bg-[#0c111d] border border-slate-800 rounded-2xl text-left transition-all hover:scale-[1.01] hover:shadow-lg hover:border-slate-700"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                                count.status === 'OPEN' ? 'bg-emerald-500/10' : 'bg-slate-500/10'
                                            }`}>
                                                <Package size={18} className={count.status === 'OPEN' ? 'text-emerald-400' : 'text-slate-400'} />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-black text-white uppercase tracking-tight">
                                                    Count {count.id.slice(-8).toUpperCase()}
                                                </h3>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase">
                                                    {formatDate(count.createdAt)}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {getStatusBadge(count.status)}
                                            <ChevronRight size={18} className="text-slate-600" />
                                        </div>
                                    </div>
                                    <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                                        <span>Lines: {count.lines?.length || 0}</span>
                                        <span>By: {count.countedBy || '—'}</span>
                                        {count.finalizedAt && <span>Finalized: {formatDate(count.finalizedAt)}</span>}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
