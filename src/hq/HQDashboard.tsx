import React, { useState, useEffect, useCallback } from 'react';
import {
    Building2, CreditCard, Zap, Search, Banknote, Loader2,
    Copy, Shield, ChevronRight, ExternalLink, CheckCircle2, XCircle,
    LogOut, RefreshCw, Bell, TrendingUp, AlertTriangle
} from 'lucide-react';
import {
    hqGetOverview, hqGenerateLicense, hqRevokeLicense, hqVerifyPayment
} from './hqApi';

interface HQDashboardProps {
    session: any;
    onLogout: () => void;
}

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const configs: Record<string, string> = {
        trial: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
        active: 'text-green-500 bg-green-500/10 border-green-500/20',
        expired: 'text-red-500 bg-red-500/10 border-red-500/20',
        revoked: 'text-red-400 bg-red-950/20 border-red-900/40',
        unused: 'text-blue-400 bg-blue-900/20 border-blue-900/40',
        verified: 'text-green-400 bg-green-950/20 border-green-900/40',
        pending: 'text-amber-500 bg-amber-950/20 border-amber-900/40',
        rejected: 'text-red-500 bg-red-950/20 border-red-900/40',
    };
    return (
        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black tracking-widest uppercase border ${configs[status] || 'bg-slate-800 text-slate-400'}`}>
            {status}
        </span>
    );
};

export const HQDashboard: React.FC<HQDashboardProps> = ({ session, onLogout }) => {
    const [tab, setTab] = useState<'overview' | 'restaurants' | 'payments' | 'licenses'>('overview');
    const [data, setData] = useState<any>({
        total: 0, active: 0, trial: 0, expired: 0,
        pendingPayments: 0, unusedLicenses: 0,
        restaurants: [], licenses: [], payments: []
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [selectedPlan, setSelectedPlan] = useState<'BASIC' | 'STANDARD' | 'PREMIUM'>('STANDARD');
    const [generatedKey, setGeneratedKey] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isVerifying, setIsVerifying] = useState<string | null>(null);
    const [viewingImage, setViewingImage] = useState<string | null>(null);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await hqGetOverview();
            setData(result);
        } catch (err: any) {
            setError(err.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleMintKey = async () => {
        setIsGenerating(true);
        try {
            const result = await hqGenerateLicense(selectedPlan);
            setGeneratedKey(result.key);
            fetchAll();
        } catch (err: any) {
            alert('Failed to generate key: ' + err.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleRevoke = async (id: string) => {
        if (!window.confirm('Revoke this license? The restaurant will lose access within 24 hours.')) return;
        try {
            await hqRevokeLicense(id);
            fetchAll();
        } catch (err: any) {
            alert('Failed to revoke: ' + err.message);
        }
    };

    const handleVerify = async (id: string, status: 'verified' | 'rejected') => {
        setIsVerifying(id);
        try {
            await hqVerifyPayment(id, status);
            fetchAll();
        } catch (err: any) {
            alert('Failed to verify: ' + err.message);
        } finally {
            setIsVerifying(null);
        }
    };

    const filteredRestaurants = (data.restaurants || []).filter((r: any) =>
        r.name?.toLowerCase().includes(search.toLowerCase()) ||
        r.city?.toLowerCase().includes(search.toLowerCase())
    );

    const navItems = [
        { id: 'overview', icon: TrendingUp, label: 'Overview' },
        { id: 'restaurants', icon: Building2, label: 'Restaurants' },
        { id: 'payments', icon: Banknote, label: 'Payments' },
        { id: 'licenses', icon: Shield, label: 'Licenses' },
    ];

    return (
        <div className="min-h-screen bg-[#020617] flex">
            {/* Sidebar */}
            <aside className="w-60 bg-[#0B0F19] border-r border-slate-800 flex flex-col shrink-0">
                <div className="p-5 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gold-500/10 border border-gold-500/30 rounded-xl flex items-center justify-center">
                            <Zap className="text-gold-500" size={18} />
                        </div>
                        <div>
                            <div className="text-white font-serif font-bold text-lg leading-none">FireFlow</div>
                            <div className="text-gold-500/60 text-[9px] font-black uppercase tracking-[0.2em]">HQ Command</div>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 px-3 py-4 space-y-1">
                    {navItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => setTab(item.id as any)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tab === item.id
                                    ? 'bg-gold-500 text-slate-950'
                                    : 'text-slate-500 hover:text-white hover:bg-slate-800'
                                }`}
                        >
                            <item.icon size={16} className="shrink-0" />
                            {item.label}
                        </button>
                    ))}
                </nav>

                <div className="p-3 border-t border-slate-800 space-y-2">
                    {data.pendingPayments > 0 && (
                        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                            <Bell size={12} className="text-amber-500 shrink-0" />
                            <span className="text-amber-400 text-[10px] font-black">
                                {data.pendingPayments} pending payment{data.pendingPayments > 1 ? 's' : ''}
                            </span>
                        </div>
                    )}
                    <div className="px-3 py-2 bg-slate-900/50 rounded-xl">
                        <div className="text-white text-[10px] font-black truncate">{session?.user?.email}</div>
                        <div className="text-gold-500/60 text-[9px] font-black uppercase tracking-widest">Super Admin</div>
                    </div>
                    <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 text-red-500 hover:bg-red-500/10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                        <LogOut size={12} />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main */}
            <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <header className="bg-[#0B0F19]/90 border-b border-slate-800 px-8 py-4 flex items-center justify-between sticky top-0 z-50 backdrop-blur">
                    <div>
                        <h1 className="text-white font-serif font-bold text-xl capitalize">{tab}</h1>
                        <p className="text-slate-500 text-xs">
                            {new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                    </div>
                    <button
                        onClick={fetchAll}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 text-xs font-black uppercase tracking-widest transition-all"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </header>

                <div className="flex-1 overflow-auto p-8">
                    {error && (
                        <div className="mb-6 flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-red-400 text-sm">
                            <AlertTriangle size={18} />
                            {error} —{' '}
                            <button onClick={fetchAll} className="underline font-bold">Try again</button>
                        </div>
                    )}

                    {/* ─── OVERVIEW ─── */}
                    {tab === 'overview' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {[
                                    { label: 'Total Restaurants', value: data.total, icon: Building2, color: 'text-blue-400' },
                                    { label: 'Active Subscribers', value: data.active, icon: CheckCircle2, color: 'text-green-400' },
                                    { label: 'On Trial', value: data.trial, icon: CreditCard, color: 'text-yellow-400' },
                                    { label: 'Expired', value: data.expired, icon: XCircle, color: 'text-red-400' },
                                    { label: 'Pending Payments', value: data.pendingPayments, icon: Banknote, color: 'text-amber-400' },
                                    { label: 'Unused Keys', value: data.unusedLicenses, icon: Shield, color: 'text-purple-400' },
                                ].map(card => (
                                    <div key={card.label} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">{card.label}</span>
                                            <card.icon size={16} className={card.color} />
                                        </div>
                                        <div className={`text-4xl font-black font-mono ${card.color}`}>
                                            {loading ? '—' : card.value}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                                    <h2 className="text-white font-black uppercase text-xs tracking-widest">Recent Partners</h2>
                                    <button
                                        onClick={() => setTab('restaurants')}
                                        className="text-gold-500 text-xs font-black flex items-center gap-1 hover:text-gold-400"
                                    >
                                        View All <ChevronRight size={12} />
                                    </button>
                                </div>
                                <div className="divide-y divide-slate-800">
                                    {(data.restaurants || []).slice(0, 5).map((r: any) => (
                                        <div key={r.restaurant_id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                                            <div>
                                                <div className="text-white font-bold text-sm">{r.name}</div>
                                                <div className="text-slate-500 text-xs">{r.city} · {r.subscription_plan}</div>
                                            </div>
                                            <StatusBadge status={r.subscription_status} />
                                        </div>
                                    ))}
                                    {(data.restaurants || []).length === 0 && !loading && (
                                        <div className="px-6 py-8 text-center text-slate-600 text-sm font-bold">No restaurants yet</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── RESTAURANTS ─── */}
                    {tab === 'restaurants' && (
                        <div className="space-y-4">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                <input
                                    type="text"
                                    placeholder="Search restaurants or cities..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl pl-11 pr-4 py-3.5 text-white text-sm outline-none focus:border-gold-500/40 transition-all placeholder:text-slate-600"
                                />
                            </div>
                            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-800 bg-slate-800/50">
                                            {['Restaurant', 'City', 'Plan', 'Status', 'Trial / Expires'].map(h => (
                                                <th key={h} className="px-6 py-4 text-left text-[10px] font-black uppercase text-slate-500 tracking-widest">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {filteredRestaurants.length === 0 ? (
                                            <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-600 text-sm font-bold">No restaurants found</td></tr>
                                        ) : filteredRestaurants.map((r: any) => (
                                            <tr key={r.restaurant_id} className="hover:bg-slate-800/30 transition-colors">
                                                <td className="px-6 py-4 text-white font-bold">{r.name}</td>
                                                <td className="px-6 py-4 text-slate-400">{r.city || '—'}</td>
                                                <td className="px-6 py-4 text-white font-bold">{r.subscription_plan}</td>
                                                <td className="px-6 py-4"><StatusBadge status={r.subscription_status} /></td>
                                                <td className="px-6 py-4 text-slate-400 text-xs font-mono">
                                                    {r.subscription_status === 'trial' && r.trial_ends_at
                                                        ? new Date(r.trial_ends_at).toLocaleDateString()
                                                        : r.subscription_expires_at
                                                            ? new Date(r.subscription_expires_at).toLocaleDateString()
                                                            : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ─── PAYMENTS ─── */}
                    {tab === 'payments' && (
                        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-800 bg-slate-800/50">
                                        {['Restaurant', 'Amount', 'Proof', 'Status', 'Date', 'Actions'].map(h => (
                                            <th key={h} className="px-6 py-4 text-left text-[10px] font-black uppercase text-slate-500 tracking-widest">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {(data.payments || []).length === 0 ? (
                                        <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-600 font-bold">No payment submissions yet</td></tr>
                                    ) : (data.payments || []).map((p: any) => {
                                        const rest = (data.restaurants || []).find((r: any) => r.restaurant_id === p.restaurant_id);
                                        return (
                                            <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="text-white font-bold">{rest?.name || 'Unknown'}</div>
                                                    <div className="text-slate-500 text-xs">{p.payment_method || 'BANK TRANSFER'}</div>
                                                </td>
                                                <td className="px-6 py-4 text-gold-500 font-black">
                                                    Rs. {Number(p.amount || 0).toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {(p.payment_proof_url || p.payment_proof) ? (
                                                        <button
                                                            onClick={() => setViewingImage(p.payment_proof_url || p.payment_proof)}
                                                            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs font-bold"
                                                        >
                                                            <ExternalLink size={12} /> View
                                                        </button>
                                                    ) : <span className="text-slate-700 text-xs">No proof</span>}
                                                </td>
                                                <td className="px-6 py-4"><StatusBadge status={p.status} /></td>
                                                <td className="px-6 py-4 text-slate-500 text-xs font-mono">
                                                    {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {p.status === 'pending' && (
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => handleVerify(p.id, 'verified')}
                                                                disabled={!!isVerifying}
                                                                className="p-2 bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white border border-green-500/20 rounded-lg transition-all disabled:opacity-50"
                                                                title="Approve"
                                                            >
                                                                {isVerifying === p.id
                                                                    ? <Loader2 size={16} className="animate-spin" />
                                                                    : <CheckCircle2 size={16} />}
                                                            </button>
                                                            <button
                                                                onClick={() => handleVerify(p.id, 'rejected')}
                                                                disabled={!!isVerifying}
                                                                className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 rounded-lg transition-all disabled:opacity-50"
                                                                title="Reject"
                                                            >
                                                                {isVerifying === p.id
                                                                    ? <Loader2 size={16} className="animate-spin" />
                                                                    : <XCircle size={16} />}
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ─── LICENSES ─── */}
                    {tab === 'licenses' && (
                        <div className="space-y-6">
                            {/* Mint card */}
                            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-8 relative overflow-hidden">
                                <div className="absolute -top-20 -right-20 w-64 h-64 bg-gold-500/5 rounded-full blur-3xl pointer-events-none" />
                                <div className="relative z-10 flex flex-col md:flex-row gap-6 items-start md:items-end">
                                    <div className="flex-1 space-y-4">
                                        <div>
                                            <h2 className="text-white font-serif font-bold text-2xl">Mint License Keys</h2>
                                            <p className="text-slate-500 text-sm mt-1">
                                                Generate cryptographically secure activation keys for new partners.
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            {(['BASIC', 'STANDARD', 'PREMIUM'] as const).map(plan => (
                                                <button
                                                    key={plan}
                                                    onClick={() => setSelectedPlan(plan)}
                                                    className={`py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${selectedPlan === plan
                                                            ? 'bg-gold-500 border-gold-500 text-slate-950 shadow-[0_0_20px_rgba(234,179,8,0.3)]'
                                                            : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:border-slate-600'
                                                        }`}
                                                >
                                                    {plan}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleMintKey}
                                        disabled={isGenerating}
                                        className="h-14 px-10 bg-white hover:bg-gold-500 text-slate-950 font-black uppercase tracking-widest text-sm rounded-2xl flex items-center gap-3 transition-all disabled:opacity-50"
                                    >
                                        {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
                                        Mint Key
                                    </button>
                                </div>

                                {generatedKey && (
                                    <div className="mt-8 bg-slate-950 border border-gold-500/40 rounded-2xl p-6 text-center animate-in zoom-in duration-300">
                                        <p className="text-gold-500/50 text-[10px] font-black uppercase tracking-[0.3em] mb-3">New License Key</p>
                                        <code className="text-gold-500 text-3xl font-mono font-bold tracking-tighter">{generatedKey}</code>
                                        <div className="mt-4 flex justify-center gap-3">
                                            <button
                                                onClick={() => navigator.clipboard.writeText(generatedKey)}
                                                className="flex items-center gap-2 text-white bg-slate-800 hover:bg-slate-700 px-5 py-2 rounded-lg font-bold text-sm transition-colors"
                                            >
                                                <Copy size={14} /> Copy Key
                                            </button>
                                            <button
                                                onClick={() => setGeneratedKey(null)}
                                                className="text-slate-500 hover:text-slate-300 px-4 py-2 text-sm font-bold transition-colors"
                                            >
                                                Dismiss
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Keys table */}
                            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-800 bg-slate-800/50">
                                            {['Key', 'Plan', 'Status', 'Restaurant', 'Created', 'Actions'].map(h => (
                                                <th key={h} className="px-6 py-4 text-left text-[10px] font-black uppercase text-slate-500 tracking-widest">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {(data.licenses || []).length === 0 ? (
                                            <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-600 font-bold">No licenses generated yet</td></tr>
                                        ) : (data.licenses || []).map((l: any) => (
                                            <tr key={l.id} className="hover:bg-slate-800/30 transition-colors">
                                                <td className="px-6 py-4 font-mono text-gold-500/80 font-bold text-xs">{l.key}</td>
                                                <td className="px-6 py-4 text-white font-bold">{l.plan}</td>
                                                <td className="px-6 py-4"><StatusBadge status={l.status} /></td>
                                                <td className="px-6 py-4 text-slate-400 text-xs">{l.restaurant_name || '—'}</td>
                                                <td className="px-6 py-4 text-slate-500 text-xs font-mono">
                                                    {l.created_at ? new Date(l.created_at).toLocaleDateString() : '—'}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => navigator.clipboard.writeText(l.key)}
                                                            className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded-lg transition-all"
                                                            title="Copy key"
                                                        >
                                                            <Copy size={14} />
                                                        </button>
                                                        {l.status !== 'revoked' && (
                                                            <button
                                                                onClick={() => handleRevoke(l.id)}
                                                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                                                title="Revoke"
                                                            >
                                                                <XCircle size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* Image lightbox */}
            {viewingImage && (
                <div
                    className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-8"
                    onClick={() => setViewingImage(null)}
                >
                    <img src={viewingImage} alt="Payment proof" className="max-w-full max-h-full rounded-2xl shadow-2xl" />
                    <button className="absolute top-6 right-6 text-white bg-slate-800 hover:bg-slate-700 p-3 rounded-xl transition-colors font-black text-xs uppercase tracking-widest">
                        Close
                    </button>
                </div>
            )}
        </div>
    );
};
