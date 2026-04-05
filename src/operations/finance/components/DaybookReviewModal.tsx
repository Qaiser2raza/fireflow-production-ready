import React, { useState, useEffect } from 'react';
import { X, Clock, CheckCircle2, Ban, ArrowDownLeft, ArrowUpRight, Loader2, Search, User, Truck } from 'lucide-react';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';

interface ShiftLog {
    id: string;
    type: 'INFLOW' | 'OUTFLOW';
    amount: number;
    description: string;
    category?: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    created_at: string;
}

interface Entity {
    id: string;
    name: string;
    phone?: string;
}

interface Props {
    sessionId: string;
    isOpen: boolean;
    onClose: () => void;
    onResolved: () => void;
}

export const DaybookReviewModal: React.FC<Props> = ({ sessionId, isOpen, onClose, onResolved }) => {
    const [logs, setLogs] = useState<ShiftLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [resolvingId, setResolvingId] = useState<string | null>(null);
    const [customers, setCustomers] = useState<Entity[]>([]);
    const [suppliers, setSuppliers] = useState<Entity[]>([]);

    const API = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';

    useEffect(() => {
        if (isOpen && sessionId) {
            fetchLogs();
            fetchEntities();
        }
    }, [isOpen, sessionId]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await fetchWithAuth(`${API}/cashier/${sessionId}/logs`);
            const data = await res.json();
            if (data.success) {
                setLogs(data.logs.filter((l: any) => l.status === 'PENDING'));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchEntities = async () => {
        try {
            const [custRes, suppRes] = await Promise.all([
                fetchWithAuth(`${API}/customers?query=`),
                fetchWithAuth(`${API}/suppliers`)
            ]);
            const custData = await custRes.json();
            const suppData = await suppRes.json();
            // customers endpoint returns array directly
            if (Array.isArray(custData)) setCustomers(custData);
            if (Array.isArray(suppData)) setSuppliers(suppData);
        } catch (e) {
            console.error('Failed to fetch entities:', e);
        }
    };

    const handleResolve = async (logId: string, status: 'APPROVED' | 'REJECTED', category: string, entityId?: string) => {
        setResolvingId(logId);
        try {
            const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
            const res = await fetchWithAuth(`${API}/cashier/logs/${logId}/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status,
                    managerId: currentUser.id,
                    correctedCategory: category,
                    entityId
                })
            });
            const data = await res.json();
            if (data.success) {
                setLogs(prev => prev.filter(l => l.id !== logId));
                onResolved();
            } else {
                alert('Failed to resolve: ' + data.error);
            }
        } catch (e) {
            console.error('Failed to resolve log', e);
        } finally {
            setResolvingId(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[85vh]">
                <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-[#0B0F19] rounded-t-3xl">
                    <div className="flex items-center gap-3">
                        <Clock className="text-[#ffd900]" size={24} />
                        <div>
                            <h2 className="text-xl font-black text-white uppercase tracking-wider">Daybook Review</h2>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Pending Cashier Transactions</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors text-white">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="py-20 flex justify-center">
                            <Loader2 className="animate-spin text-slate-500" size={32} />
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="py-20 text-center text-emerald-500 flex flex-col items-center">
                            <CheckCircle2 size={48} className="mb-4 opacity-50" />
                            <h3 className="text-xl font-bold uppercase">All Caught Up</h3>
                            <p className="text-sm opacity-80 mt-2">No pending Daybook entries for this session.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {logs.map(log => (
                                <ReviewItem 
                                    key={log.id} 
                                    log={log} 
                                    resolving={resolvingId === log.id}
                                    customers={customers}
                                    suppliers={suppliers}
                                    onResolve={(status, cat, entityId) => handleResolve(log.id, status, cat, entityId)} 
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const ReviewItem: React.FC<{
    log: ShiftLog;
    resolving: boolean;
    customers: Entity[];
    suppliers: Entity[];
    onResolve: (status: 'APPROVED' | 'REJECTED', category: string, entityId?: string) => void;
}> = ({ log, resolving, customers, suppliers, onResolve }) => {
    const [selectedCategory, setSelectedCategory] = useState(log.type === 'INFLOW' ? 'MISC_REVENUE' : 'GENERAL_EXPENSE');
    const [entityId, setEntityId] = useState('');
    const [entitySearch, setEntitySearch] = useState('');

    // Determine if the current category requires an entity selection
    const needsEntity = selectedCategory === 'CUSTOMER_PAYMENT' || selectedCategory === 'SUPPLIER';

    // Filter entities based on search
    const entityList = selectedCategory === 'CUSTOMER_PAYMENT' ? customers : suppliers;
    const filteredEntities = entitySearch.trim()
        ? entityList.filter(e => 
            e.name?.toLowerCase().includes(entitySearch.toLowerCase()) ||
            e.phone?.includes(entitySearch)
          )
        : entityList;

    // Block approval if entity is needed but not selected
    const canApprove = !needsEntity || !!entityId;

    // Reset entity when category changes
    const handleCategoryChange = (cat: string) => {
        setSelectedCategory(cat);
        setEntityId('');
        setEntitySearch('');
    };

    return (
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 flex flex-col gap-4">
            {/* Header Row */}
            <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-full mt-1 ${log.type === 'INFLOW' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                        {log.type === 'INFLOW' ? <ArrowDownLeft size={24} /> : <ArrowUpRight size={24} />}
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded ${log.type === 'INFLOW' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                {log.type}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">{new Date(log.created_at).toLocaleTimeString()}</span>
                        </div>
                        <h4 className="text-lg font-bold text-white leading-tight">{log.description}</h4>
                    </div>
                </div>
                <div className="text-right">
                    <p className={`font-['IBM_Plex_Mono'] font-black text-2xl ${log.type === 'INFLOW' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {log.type === 'INFLOW' ? '+' : '-'}Rs. {Number(log.amount).toLocaleString()}
                    </p>
                </div>
            </div>

            <div className="h-px bg-slate-700 w-full" />

            {/* Category Selector */}
            <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 uppercase whitespace-nowrap">Shift To:</span>
                <select 
                    value={selectedCategory}
                    onChange={e => handleCategoryChange(e.target.value)}
                    className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-white uppercase font-bold outline-none focus:border-indigo-500 flex-1"
                >
                    {log.type === 'OUTFLOW' ? (
                        <>
                            <option value="GENERAL_EXPENSE">General Expense (5010)</option>
                            <option value="SUPPLIER">Supplier Payment (2020)</option>
                            <option value="RIDER">Rider Expense (5000)</option>
                        </>
                    ) : (
                        <>
                            <option value="MISC_REVENUE">Misc Revenue (4000+)</option>
                            <option value="CUSTOMER_PAYMENT">Customer Receipt / Khata (1040)</option>
                        </>
                    )}
                </select>
            </div>

            {/* Entity Picker — only shown when category requires it */}
            {needsEntity && (
                <div className="bg-slate-900/80 border border-slate-700 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase">
                        {selectedCategory === 'CUSTOMER_PAYMENT' ? (
                            <><User size={14} className="text-indigo-400" /> Select Customer</>
                        ) : (
                            <><Truck size={14} className="text-orange-400" /> Select Supplier</>
                        )}
                    </div>

                    {/* Search Input */}
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            value={entitySearch}
                            onChange={e => setEntitySearch(e.target.value)}
                            placeholder={selectedCategory === 'CUSTOMER_PAYMENT' ? 'Search by name or phone...' : 'Search supplier...'}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition-colors"
                        />
                    </div>

                    {/* Entity List */}
                    <div className="max-h-36 overflow-y-auto space-y-1 custom-scrollbar">
                        {filteredEntities.length === 0 ? (
                            <p className="text-xs text-slate-500 text-center py-3">
                                {entitySearch ? 'No matches found' : 'No entities available'}
                            </p>
                        ) : (
                            filteredEntities.map(entity => (
                                <button
                                    key={entity.id}
                                    onClick={() => setEntityId(entity.id)}
                                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-between ${
                                        entityId === entity.id 
                                            ? 'bg-indigo-600/20 border border-indigo-500 text-indigo-300' 
                                            : 'bg-slate-800/50 border border-transparent text-slate-300 hover:bg-slate-700/50'
                                    }`}
                                >
                                    <span className="flex items-center gap-2">
                                        {selectedCategory === 'CUSTOMER_PAYMENT' 
                                            ? <User size={14} className="opacity-50" /> 
                                            : <Truck size={14} className="opacity-50" />
                                        }
                                        <span className="font-bold">{entity.name || 'Unnamed'}</span>
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-mono">{entity.phone || ''}</span>
                                </button>
                            ))
                        )}
                    </div>

                    {!entityId && (
                        <p className="text-[10px] text-orange-400 font-bold uppercase tracking-wider flex items-center gap-1">
                            ⚠ Select an entity before approving
                        </p>
                    )}
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-1">
                <button 
                    onClick={() => onResolve('REJECTED', selectedCategory, undefined)}
                    disabled={resolving}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-1"
                >
                    <Ban size={14} /> Reject
                </button>
                <button 
                    onClick={() => onResolve('APPROVED', selectedCategory, entityId || undefined)}
                    disabled={resolving || !canApprove}
                    className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg transition-all flex items-center gap-2 ${
                        canApprove 
                            ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/20' 
                            : 'bg-slate-700 text-slate-500 cursor-not-allowed shadow-none'
                    }`}
                >
                    {resolving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Approve & Post
                </button>
            </div>
        </div>
    );
};
