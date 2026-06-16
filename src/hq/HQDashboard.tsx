import React, { useState, useEffect, useCallback } from 'react';
import {
    Building2, CreditCard, Zap, Search, Banknote, Loader2,
    Copy, Shield, ChevronRight, ExternalLink, CheckCircle2, XCircle,
    LogOut, RefreshCw, Bell, TrendingUp, AlertTriangle, Plus, Terminal, X
} from 'lucide-react';
import {
    hqGetOverview, hqGenerateLicense, hqRevokeLicense, hqVerifyPayment, hqAddRestaurant
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

    const [mintRestaurantId, setMintRestaurantId] = useState<string>('');
    const [mintFingerprint, setMintFingerprint] = useState<string>('');

    const [isAddWizardOpen, setIsAddWizardOpen] = useState(false);
    const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
    const [addFormData, setAddFormData] = useState({
        name: '', owner_name: '', owner_phone: '', owner_email: '',
        city: '', address: '', subscription_plan: 'STANDARD', duration_months: 1, monthly_fee: 0
    });
    const [createdRestaurantId, setCreatedRestaurantId] = useState<string | null>(null);
    const [wizardFingerprint, setWizardFingerprint] = useState('');
    const [wizardGeneratedKey, setWizardGeneratedKey] = useState<string | null>(null);
    const [isCreatingRestaurant, setIsCreatingRestaurant] = useState(false);
    const [selectedRestaurant, setSelectedRestaurant] = useState<any | null>(null);

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
        if (!mintRestaurantId) { alert('Please select a restaurant first.'); return; }
        setIsGenerating(true);
        try {
            const r = data.restaurants?.find((x: any) => x.restaurant_id === mintRestaurantId);
            const result = await hqGenerateLicense({
                plan: selectedPlan,
                restaurant_id: mintRestaurantId,
                restaurant_name: r?.name,
                hardware_fingerprint: mintFingerprint
            });
            setGeneratedKey(result.key);
            fetchAll();
        } catch (err: any) {
            alert('Failed to generate key: ' + err.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleWizardNext = async () => {
        if (wizardStep === 1) {
            setIsCreatingRestaurant(true);
            try {
                const expiresAt = new Date();
                expiresAt.setMonth(expiresAt.getMonth() + Number(addFormData.duration_months));
                
                const restData = {
                    name: addFormData.name,
                    owner_name: addFormData.owner_name,
                    owner_phone: addFormData.owner_phone,
                    owner_email: addFormData.owner_email,
                    city: addFormData.city,
                    address: addFormData.address,
                    subscription_plan: addFormData.subscription_plan,
                    subscription_status: addFormData.subscription_plan === 'TRIAL' ? 'trial' : 'active',
                    subscription_expires_at: expiresAt.toISOString(),
                    monthly_fee: Number(addFormData.monthly_fee) || 0
                };
                const created = await hqAddRestaurant(restData);
                setCreatedRestaurantId(created.restaurant_id);
                setWizardStep(2);
                fetchAll();
            } catch (err: any) {
                alert('Failed to create restaurant: ' + err.message);
            } finally {
                setIsCreatingRestaurant(false);
            }
        } else if (wizardStep === 2) {
            setIsGenerating(true);
            try {
                const result = await hqGenerateLicense({
                    plan: addFormData.subscription_plan,
                    restaurant_id: createdRestaurantId!,
                    restaurant_name: addFormData.name,
                    hardware_fingerprint: wizardFingerprint
                });
                setWizardGeneratedKey(result.key);
                setWizardStep(3);
                fetchAll();
            } catch (err: any) {
                alert('Failed to generate key: ' + err.message);
            } finally {
                setIsGenerating(false);
            }
        } else {
            setIsAddWizardOpen(false);
            setWizardStep(1);
            setAddFormData({ name: '', owner_name: '', owner_phone: '', owner_email: '', city: '', address: '', subscription_plan: 'STANDARD', duration_months: 1, monthly_fee: 0 });
            setWizardFingerprint('');
            setWizardGeneratedKey(null);
            setCreatedRestaurantId(null);
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
                            <div className="flex items-center gap-4">
                                <div className="relative flex-1">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Search restaurants or cities..."
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl pl-11 pr-4 py-3.5 text-white text-sm outline-none focus:border-gold-500/40 transition-all placeholder:text-slate-600"
                                    />
                                </div>
                                <button
                                    onClick={() => setIsAddWizardOpen(true)}
                                    className="h-[46px] px-6 bg-gold-500 hover:bg-gold-400 text-slate-950 font-black uppercase tracking-widest text-xs rounded-2xl flex items-center gap-2 transition-all"
                                >
                                    <Plus size={16} /> Add Restaurant
                                </button>
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
                                            <tr key={r.restaurant_id} onClick={() => setSelectedRestaurant(r)} className="hover:bg-slate-800/30 transition-colors cursor-pointer">
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
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-black uppercase text-slate-500 tracking-widest mb-2">Target Restaurant *</label>
                                                    <select
                                                        value={mintRestaurantId}
                                                        onChange={e => setMintRestaurantId(e.target.value)}
                                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-gold-500/40"
                                                    >
                                                        <option value="">-- Select Restaurant --</option>
                                                        {(data.restaurants || []).map((r: any) => (
                                                            <option key={r.restaurant_id} value={r.restaurant_id}>{r.name} ({r.city})</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-black uppercase text-slate-500 tracking-widest mb-2">Hardware Fingerprint</label>
                                                    <input
                                                        type="text"
                                                        value={mintFingerprint}
                                                        onChange={e => setMintFingerprint(e.target.value)}
                                                        placeholder="e.g. HF-XXXX..."
                                                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-gold-500/40 font-mono"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-black uppercase text-slate-500 tracking-widest mb-2">Select Plan</label>
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

            {/* Restaurant Detail Panel */}
            {selectedRestaurant && (
                <div className="fixed inset-y-0 right-0 w-96 bg-[#0B0F19] border-l border-slate-800 shadow-2xl z-[100] flex flex-col animate-in slide-in-from-right duration-300">
                    <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                        <div>
                            <h2 className="text-white font-serif font-bold text-xl">{selectedRestaurant.name}</h2>
                            <p className="text-slate-500 text-xs">{selectedRestaurant.city}</p>
                        </div>
                        <button onClick={() => setSelectedRestaurant(null)} className="p-2 text-slate-500 hover:text-white bg-slate-900 rounded-xl">
                            <X size={18} />
                        </button>
                    </div>
                    <div className="p-6 overflow-auto flex-1 space-y-6">
                        <div>
                            <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest mb-3">Subscription</h3>
                            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400 text-sm">Status</span>
                                    <StatusBadge status={selectedRestaurant.subscription_status} />
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400 text-sm">Plan</span>
                                    <span className="text-white font-bold">{selectedRestaurant.subscription_plan}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400 text-sm">Expires</span>
                                    <span className="text-slate-300 font-mono text-sm">{selectedRestaurant.subscription_expires_at ? new Date(selectedRestaurant.subscription_expires_at).toLocaleDateString() : '—'}</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest mb-3">Contact Info</h3>
                            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3 text-sm">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Owner</span>
                                    <span className="text-white">{selectedRestaurant.owner_name || '—'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Phone</span>
                                    <span className="text-white">{selectedRestaurant.phone || selectedRestaurant.owner_phone || '—'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Email</span>
                                    <span className="text-white">{selectedRestaurant.owner_email || '—'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Wizard Modal */}
            {isAddWizardOpen && (
                <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#0B0F19] border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-gold-500/10 border border-gold-500/20 rounded-xl flex items-center justify-center text-gold-500">
                                    {wizardStep === 1 ? <Building2 size={20} /> : wizardStep === 2 ? <Shield size={20} /> : <Terminal size={20} />}
                                </div>
                                <div>
                                    <h2 className="text-white font-serif font-bold text-xl">
                                        {wizardStep === 1 ? 'New Restaurant' : wizardStep === 2 ? 'Generate License' : 'Ready to Deploy'}
                                    </h2>
                                    <p className="text-slate-500 text-xs">Step {wizardStep} of 3</p>
                                </div>
                            </div>
                            <button onClick={() => { setIsAddWizardOpen(false); setWizardStep(1); }} className="text-slate-500 hover:text-white transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        
                        <div className="p-8 overflow-y-auto">
                            {wizardStep === 1 && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-black uppercase text-slate-500 tracking-widest mb-2">Business Name *</label>
                                            <input type="text" required value={addFormData.name} onChange={e => setAddFormData({...addFormData, name: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-gold-500/40" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black uppercase text-slate-500 tracking-widest mb-2">City *</label>
                                            <input type="text" required value={addFormData.city} onChange={e => setAddFormData({...addFormData, city: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-gold-500/40" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-black uppercase text-slate-500 tracking-widest mb-2">Owner Name *</label>
                                            <input type="text" required value={addFormData.owner_name} onChange={e => setAddFormData({...addFormData, owner_name: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-gold-500/40" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black uppercase text-slate-500 tracking-widest mb-2">Owner Email *</label>
                                            <input type="email" required value={addFormData.owner_email} onChange={e => setAddFormData({...addFormData, owner_email: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-gold-500/40" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-black uppercase text-slate-500 tracking-widest mb-2">Owner Phone *</label>
                                            <input type="tel" required value={addFormData.owner_phone} onChange={e => setAddFormData({...addFormData, owner_phone: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-gold-500/40" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black uppercase text-slate-500 tracking-widest mb-2">Address</label>
                                            <input type="text" value={addFormData.address} onChange={e => setAddFormData({...addFormData, address: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-gold-500/40" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4 border-t border-slate-800 pt-6">
                                        <div>
                                            <label className="block text-xs font-black uppercase text-slate-500 tracking-widest mb-2">Plan *</label>
                                            <select value={addFormData.subscription_plan} onChange={e => setAddFormData({...addFormData, subscription_plan: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-gold-500/40">
                                                <option value="TRIAL">TRIAL</option>
                                                <option value="STANDARD">STANDARD</option>
                                                <option value="ENTERPRISE">ENTERPRISE</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black uppercase text-slate-500 tracking-widest mb-2">Duration *</label>
                                            <select value={addFormData.duration_months} onChange={e => setAddFormData({...addFormData, duration_months: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-gold-500/40">
                                                <option value="1">1 Month</option>
                                                <option value="3">3 Months</option>
                                                <option value="6">6 Months</option>
                                                <option value="12">12 Months</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black uppercase text-slate-500 tracking-widest mb-2">Monthly Fee (Rs)</label>
                                            <input type="number" value={addFormData.monthly_fee} onChange={e => setAddFormData({...addFormData, monthly_fee: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-gold-500/40" />
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {wizardStep === 2 && (
                                <div className="space-y-6">
                                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center">
                                        <Building2 size={32} className="mx-auto text-slate-500 mb-3" />
                                        <h3 className="text-white font-bold text-lg">{addFormData.name}</h3>
                                        <p className="text-slate-500 text-sm">{addFormData.city} · {addFormData.subscription_plan}</p>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-xs font-black uppercase text-slate-500 tracking-widest mb-2">Hardware Fingerprint (Optional for now)</label>
                                        <input 
                                            type="text" 
                                            placeholder="Enter hash from technician's screen" 
                                            value={wizardFingerprint} 
                                            onChange={e => setWizardFingerprint(e.target.value)} 
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-gold-500/40 font-mono" 
                                        />
                                        <p className="text-slate-500 text-xs mt-2">The installer script outputs this fingerprint during Step 9.</p>
                                    </div>
                                </div>
                            )}

                            {wizardStep === 3 && wizardGeneratedKey && (
                                <div className="space-y-6">
                                    <div className="bg-slate-950 border border-gold-500/40 rounded-2xl p-6">
                                        <p className="text-gold-500/50 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Generated License Key</p>
                                        <div className="flex gap-2">
                                            <code className="flex-1 text-gold-500 text-sm font-mono break-all">{wizardGeneratedKey}</code>
                                            <button onClick={() => navigator.clipboard.writeText(wizardGeneratedKey)} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg shrink-0 h-fit"><Copy size={14}/></button>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <p className="text-white font-bold mb-3">Technician Handoff</p>
                                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 whitespace-pre-wrap relative pt-12">
{`.\\Install-Restaurant.ps1 \`
  -LicenseToken "${wizardGeneratedKey}" \`
  -SupabaseUrl "https://hq-supabase-url" \`
  -SupabaseAnonKey "hq-anon-key"`}
                                            <button 
                                                onClick={() => navigator.clipboard.writeText(`.\\Install-Restaurant.ps1 \`\n  -LicenseToken "${wizardGeneratedKey}" \`\n  -SupabaseUrl "https://hq-supabase-url" \`\n  -SupabaseAnonKey "hq-anon-key"`)}
                                                className="absolute top-2 right-2 p-2 bg-slate-800 text-slate-400 hover:text-white rounded-lg flex items-center gap-1 font-sans font-bold"
                                            >
                                                <Copy size={12}/> Copy Full Installer Command
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="p-6 border-t border-slate-800 bg-slate-900/30 flex justify-end">
                            <button
                                onClick={handleWizardNext}
                                disabled={isCreatingRestaurant || isGenerating || (wizardStep === 1 && (!addFormData.name || !addFormData.city || !addFormData.owner_name || !addFormData.owner_email || !addFormData.owner_phone))}
                                className="h-12 px-8 bg-gold-500 hover:bg-gold-400 text-slate-950 font-black uppercase tracking-widest text-xs rounded-xl flex items-center gap-2 transition-all disabled:opacity-50"
                            >
                                {(isCreatingRestaurant || isGenerating) && <Loader2 size={16} className="animate-spin" />}
                                {wizardStep === 1 ? 'Create & Continue' : wizardStep === 2 ? 'Mint License' : 'Done'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
