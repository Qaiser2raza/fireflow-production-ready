import React, { useState, useEffect } from 'react';
import { 
    Shield, 
    CheckCircle2, 
    Filter, 
    ChevronDown, 
    ChevronUp,
    RefreshCw,
    Loader2,
    Calendar,
    Clock
} from 'lucide-react';
import { useAppContext as useApp } from '../../client/contexts/AppContext';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';

const FBRTab: React.FC = () => {
    const { addNotification } = useApp();
    
    // Core State
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [aggregate, setAggregate] = useState<any>(null);
    const [queue, setQueue] = useState<any[]>([]);
    const [taxData, setTaxData] = useState<any>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isTaxPanelOpen, setIsTaxPanelOpen] = useState(false);

    // Filters
    const [filters, setFilters] = useState({
        from: new Date().toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0],
        status: 'PENDING'
    });

    const API_URL = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

    // Fetch Logic
    const fetchData = async () => {
        try {
            setLoading(true);
            const [aggRes, queueRes, taxRes] = await Promise.all([
                fetchWithAuth(`${API_URL}/fbr/aggregate`),
                fetchWithAuth(`${API_URL}/fbr/queue?from=${filters.from}&to=${filters.to}&status=${filters.status}`),
                fetchWithAuth(`${API_URL}/fbr/tax-liability?from=${filters.from}&to=${filters.to}`)
            ]);

            const agg = await aggRes.json();
            const q = await queueRes.json();
            const tx = await taxRes.json();

            setAggregate(agg);
            setQueue(q || []);
            setTaxData(tx);
        } catch (error) {
            console.error('FBR Sync Error:', error);
            addNotification?.('error', 'Failed to synchronize FBR data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [filters]);


    const handleBatchSync = async () => {
        if (selectedIds.size === 0) return;
        try {
            setSyncing(true);
            const res = await fetchWithAuth(`${API_URL}/fbr/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderIds: Array.from(selectedIds) })
            });
            if (!res.ok) throw new Error('Sync failed');
            addNotification?.('success', `Successfully synced ${selectedIds.size} orders`);
            setSelectedIds(new Set());
            fetchData();
        } catch (error) {
            addNotification?.('error', 'Batch sync failed');
        } finally {
            setSyncing(false);
        }
    };

    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const formatPKR = (num: number) => {
        return num ? `Rs. ${num.toLocaleString('en-PK')}` : 'Rs. 0';
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'SYNCED': return 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20';
            case 'VOIDED': return 'bg-slate-500/10 text-slate-500 border border-slate-500/20';
            case 'FAILED': return 'bg-red-500/10 text-red-500 border border-red-500/20';
            default: return 'bg-orange-500/10 text-orange-500 border border-orange-500/20';
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0f1117] relative select-none">
            {/* 1. Aggregate Bar */}
            <div className="sticky top-0 z-20 bg-[#0f1117]/80 backdrop-blur-xl border-b border-white/5 p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: 'Pending', count: aggregate?.pending?.count || 0, amount: aggregate?.pending?.total || 0, icon: Clock, color: 'text-orange-500' },
                    { label: 'Synced Today', count: aggregate?.synced?.count || 0, amount: aggregate?.synced?.total || 0, icon: CheckCircle2, color: 'text-emerald-500' },
                    { label: 'Voided / Failed', count: (aggregate?.voided?.count || 0) + (aggregate?.failed?.count || 0), amount: aggregate?.voided?.total || 0, icon: Shield, color: 'text-slate-400' },
                    { label: 'Tax Liability Today', amount: aggregate?.tax_liability || 0, icon: Shield, color: 'text-[#f97316]', highlight: true },
                ].map((stat, i) => (
                    <div key={i} className={`p-4 rounded-2xl border ${stat.highlight ? 'bg-[#f97316]/10 border-[#f97316]/20' : 'bg-[#1a1d27] border-white/5'}`}>
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</span>
                            <stat.icon size={14} className={stat.color} />
                        </div>
                        <div className="flex flex-col">
                            {stat.count !== undefined && <span className="text-xl font-black text-white">{stat.count}</span>}
                            <span className={`text-[11px] font-['IBM_Plex_Mono'] font-bold ${stat.highlight ? 'text-[#f97316]' : 'text-slate-400'}`}>
                                {formatPKR(stat.amount)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* 2. Filter Bar */}
            <div className="p-4 flex flex-col md:flex-row gap-3 bg-[#11141d]/50">
                <div className="flex items-center gap-2 bg-[#1a1d27] border border-white/5 rounded-xl px-4 py-2 flex-1">
                    <Calendar size={14} className="text-slate-500" />
                    <input 
                        type="date" 
                        value={filters.from} 
                        onChange={e => setFilters({...filters, from: e.target.value})}
                        className="bg-transparent text-xs font-bold text-white outline-none w-full uppercase"
                    />
                    <span className="text-slate-700 mx-2">→</span>
                    <input 
                        type="date" 
                        value={filters.to} 
                        onChange={e => setFilters({...filters, to: e.target.value})}
                        className="bg-transparent text-xs font-bold text-white outline-none w-full uppercase"
                    />
                </div>
                <div className="flex items-center gap-2 bg-[#1a1d27] border border-white/5 rounded-xl px-4 py-2">
                    <Filter size={14} className="text-slate-500" />
                    <select 
                        value={filters.status}
                        onChange={e => setFilters({...filters, status: e.target.value})}
                        className="bg-transparent text-xs font-bold text-white outline-none focus:ring-0 cursor-pointer"
                    >
                        <option value="ALL">All Status</option>
                        <option value="PENDING">Pending</option>
                        <option value="SYNCED">Synced</option>
                        <option value="VOIDED">Voided</option>
                        <option value="FAILED">Failed</option>
                    </select>
                </div>
                <button 
                    onClick={fetchData}
                    className="p-2 bg-[#1a1d27] border border-white/10 rounded-xl hover:bg-white/5 transition-colors"
                >
                    <RefreshCw size={14} className={`text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* 3. Order Queue List */}
            <div className="flex-1 overflow-y-auto px-4 pb-32">
                <div className="bg-[#1a1d27] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] bg-white/[0.02]">
                                <th className="p-4 w-12 text-center">Sel</th>
                                <th className="p-4">Order #</th>
                                <th className="p-4">Time</th>
                                <th className="p-4 text-right">Amount</th>
                                <th className="p-4 text-right">Tax</th>
                                <th className="p-4 text-center">Status</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.02]">
                            {loading && queue.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-20 text-center">
                                        <Loader2 size={32} className="text-[#f97316] animate-spin mx-auto mb-4" />
                                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Querying Fireflow Records...</span>
                                    </td>
                                </tr>
                            ) : queue.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-20 text-center text-slate-700 font-bold uppercase tracking-widest text-[10px]">
                                        Empty Queue / No Results
                                    </td>
                                </tr>
                            ) : (
                                queue.map((order: any) => (
                                    <tr key={order.id} className="hover:bg-white/[0.01] transition-colors group">
                                        <td className="p-4 text-center">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedIds.has(order.id)}
                                                onChange={() => toggleSelection(order.id)}
                                                disabled={order.fbr_sync_status === 'SYNCED' || order.fbr_sync_status === 'VOIDED'}
                                                className="w-4 h-4 rounded border-white/10 bg-slate-900 text-[#f97316] focus:ring-[#f97316]/50 disabled:opacity-30"
                                            />
                                        </td>
                                        <td className="p-4 font-black text-white text-[10px] uppercase">
                                            #{order.order_number || order.id.slice(-6).toUpperCase()}
                                        </td>
                                        <td className="p-4 text-[10px] text-slate-500 font-mono">
                                            {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="p-4 text-right text-[11px] font-['IBM_Plex_Mono'] font-bold text-white">
                                            {formatPKR(order.total)}
                                        </td>
                                        <td className="p-4 text-right text-[11px] font-['IBM_Plex_Mono'] font-bold text-orange-400/80">
                                            {formatPKR(order.tax_amount || 0)}
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${getStatusStyle(order.fbr_sync_status)}`}>
                                                {order.fbr_sync_status}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            {/* Sync only — Void/Cancel is managed from the Control Hub (ORDERS tab) */}
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {order.fbr_sync_status === 'PENDING' && (
                                                    <button 
                                                        onClick={() => { toggleSelection(order.id); handleBatchSync(); }}
                                                        className="p-2 hover:bg-[#f97316]/10 text-[#f97316] rounded-lg transition-colors border border-transparent hover:border-[#f97316]/20"
                                                        title="Sync Now"
                                                    >
                                                        <RefreshCw size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* 5. Tax Liability Panel */}
                <div className="mt-8 mb-4">
                    <button 
                        onClick={() => setIsTaxPanelOpen(!isTaxPanelOpen)}
                        className="w-full flex items-center justify-between p-6 bg-[#1a1d27] border border-white/5 rounded-3xl hover:bg-white/[0.02] transition-all"
                    >
                        <div className="flex items-center gap-3">
                            <Shield className="text-[#f97316]" size={20} />
                            <div className="text-left">
                                <h3 className="text-sm font-black text-white uppercase tracking-tighter">Tax Liability & Gap Analysis</h3>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Regulatory Monitoring Panel</p>
                            </div>
                        </div>
                        {isTaxPanelOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>

                    {isTaxPanelOpen && (
                        <div className="mt-2 p-6 bg-[#1a1d27] border border-white/5 rounded-3xl overflow-x-auto animate-in slide-in-from-top-4 duration-300">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-[9px] font-black text-slate-600 uppercase tracking-widest border-b border-white/5">
                                        <th className="pb-4">Date</th>
                                        <th className="pb-4 text-right">Daily Sales</th>
                                        <th className="pb-4 text-right">Tax Collected</th>
                                        <th className="pb-4 text-right">FBR Reported</th>
                                        <th className="pb-4 text-right text-red-500">Gap (Liability)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.02] text-[10px] font-bold">
                                    {taxData?.daily?.map((day: any, i: number) => (
                                        <tr key={i} className="hover:bg-white/[0.01]">
                                            <td className="py-4 text-slate-300 font-mono">{day.date}</td>
                                            <td className="py-4 text-right text-white">Rs. {day.total_sales.toLocaleString()}</td>
                                            <td className="py-4 text-right text-orange-400">Rs. {day.tax_collected.toLocaleString()}</td>
                                            <td className="py-4 text-right text-emerald-400">Rs. {day.synced_tax.toLocaleString()}</td>
                                            <td className="py-4 text-right text-red-500">
                                                Rs. {(day.tax_collected - day.synced_tax).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="bg-white/[0.02] font-black">
                                        <td className="py-6 px-4 uppercase tracking-widest text-[#f97316]">Compliance Total</td>
                                        <td className="py-6 px-4 text-right text-white">Rs. {taxData?.summary?.total_sales?.toLocaleString()}</td>
                                        <td className="py-6 px-4 text-right text-orange-400">Rs. {taxData?.summary?.total_tax_collected?.toLocaleString()}</td>
                                        <td className="py-6 px-4 text-right text-emerald-400">Rs. {taxData?.summary?.total_fbr_reported?.toLocaleString()}</td>
                                        <td className="py-6 px-4 text-right text-red-500 text-lg">Rs. {taxData?.summary?.gap?.toLocaleString()}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* 4. Batch Sync Button (Sticky Bottom) */}
            <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-md px-6 z-50">
                <button
                    onClick={handleBatchSync}
                    disabled={selectedIds.size === 0 || syncing}
                    className="w-full py-4 bg-[#f97316] text-[#0f1117] rounded-2xl font-black shadow-2xl shadow-[#f97316]/20 transition-all active:scale-95 flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-xs disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed group"
                >
                    {syncing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} className="group-hover:rotate-180 transition-transform duration-500" />}
                    <span>Sync Selected ({selectedIds.size})</span>
                </button>
            </div>
        </div>
    );
};

export default FBRTab;
