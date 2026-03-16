import React, { useState, useEffect } from 'react';
import {
    Wallet,
    ArrowUpRight,
    ArrowDownLeft,
    History,
    PlusCircle,
    MinusCircle,
    Info,
    ShieldCheck,
    Package,
    TrendingUp,
    X,
    FileText,
    FileWarning,
    Users,
    ShieldAlert,
    Banknote,
    Calendar
} from 'lucide-react';
import { useAppContext as useApp } from '../../client/contexts/AppContext';
import { ZReportModal } from '../../shared/components/ZReportModal';
import { ChartOfAccountsModal } from './components/ChartOfAccountsModal';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';

const FinancialCommandCenter: React.FC = () => {
    const { currentUser, activeSession, setActiveSession } = useApp();
    const restaurantId = currentUser?.restaurant_id;
    const staffId = currentUser?.id;
    // Removed local activeSession state as it's now in AppContext
    const [stats, setStats] = useState({
        expectedCash: 0,
        todaySales: 0,
        totalPayouts: 0
    });
    const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showPayoutModal, setShowPayoutModal] = useState(false);
    const [showOpenModal, setShowOpenModal] = useState(false);
    const [showCloseModal, setShowCloseModal] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [showCOAModal, setShowCOAModal] = useState(false);
    const [activeReport, setActiveReport] = useState<any>(null);

    // Form states
    const [openingAmount, setOpeningAmount] = useState('');
    const [payoutData, setPayoutData] = useState({ amount: '', category: 'EXPENSE', notes: '' });
    const [actualCount, setActualCount] = useState('');
    const [productMix, setProductMix] = useState<any[]>([]);
    const [velocity, setVelocity] = useState<any[]>([]);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [sessionHistory, setSessionHistory] = useState<any[]>([]);

    useEffect(() => {
        fetchSession();
    }, [restaurantId]);

    const fetchSession = async () => {
        try {
            const [sessionRes, ledgerRes] = await Promise.all([
                fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/accounting/session`),
                fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/accounting/ledger?limit=50`)
            ]);

            const sessionData = await sessionRes.json();
            const ledgerData = await ledgerRes.json();

            if (sessionData.success && sessionData.session) {
                setActiveSession(sessionData.session);
                const m = sessionData.session.metrics;
                setStats({
                    expectedCash: Number(m.expectedCash),
                    todaySales: Number(m.totalRevenue),
                    totalPayouts: Number(m.payouts)
                });
            } else {
                setActiveSession(null);
                setStats({ expectedCash: 0, todaySales: 0, totalPayouts: 0 });
            }

            if (ledgerData.success) {
                setLedgerEntries(ledgerData.entries);
            }

            // Fetch Management Intelligence
            const now = new Date();
            const startOfDay = new Date(now.setHours(0, 0, 0, 0)).toISOString();
            const endOfDay = new Date().toISOString();

            const [mixRes, velRes] = await Promise.all([
                fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/reports/product-mix?restaurantId=${restaurantId}&start=${startOfDay}&end=${endOfDay}`),
                fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/reports/velocity?restaurantId=${restaurantId}&start=${startOfDay}&end=${endOfDay}`)
            ]);

            const mixData = await mixRes.json();
            const velData = await velRes.json();

            if (mixData.success) setProductMix(mixData.data.slice(0, 5));
            if (velData.success) setVelocity(velData.data);

            setLoading(false);
        } catch (error) {
            console.error('Fetch session error:', error);
            setLoading(false);
        }
    };

    const handleOpenSession = async () => {
        try {
            const res = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/accounting/session/open`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    restaurantId,
                    staffId,
                    openingBalance: Number(openingAmount)
                })
            });
            const data = await res.json();
            if (data.success) {
                fetchSession();
                setShowOpenModal(false);
            }
        } catch (error) {
            console.error('Open session error:', error);
        }
    };

    const handlePayout = async () => {
        try {
            const res = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/accounting/payout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    restaurantId,
                    staffId,
                    amount: Number(payoutData.amount),
                    category: payoutData.category,
                    notes: payoutData.notes
                })
            });
            const data = await res.json();
            if (data.success) {
                fetchSession();
                setShowPayoutModal(false);
                setPayoutData({ amount: '', category: 'EXPENSE', notes: '' });
            }
        } catch (error) {
            console.error('Payout error:', error);
        }
    };

    const handleCloseSession = async () => {
        try {
            const res = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/accounting/session/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: activeSession?.id,
                    staffId,
                    actualBalance: Number(actualCount),
                    notes: 'Z-Report Close'
                })
            });
            const data = await res.json();
            if (data.success) {
                // Fetch report for display
                const reportRes = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/accounting/z-report/${activeSession?.id}`);
                const reportData = await reportRes.json();

                if (reportData.success) {
                    setActiveReport(reportData.report);
                    setShowReportModal(true);
                }

                fetchSession();
                setShowCloseModal(false);
            }
        } catch (error) {
            console.error('Close session error:', error);
        }
    };

    const handleViewHistory = async () => {
        try {
            const res = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/accounting/z-reports`);
            const data = await res.json();
            if (data.success) {
                setSessionHistory(data.sessions);
                setShowHistoryModal(true);
            }
        } catch (e) {
            console.error('History fetch error', e);
        }
    };

    const handleLoadHistoricalReport = async (sessionId: string) => {
        try {
            const reportRes = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/accounting/z-report/${sessionId}`);
            const reportData = await reportRes.json();
            if (reportData.success) {
                setActiveReport(reportData.report);
                setShowReportModal(true);
                setShowHistoryModal(false);
            }
        } catch (e) {
            console.error('Report load error', e);
        }
    };

    if (loading) return <div className="p-8 text-slate-500 animate-pulse font-mono uppercase tracking-widest text-xs">Initializing Ledger...</div>;

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-300 p-8 space-y-8 animate-in fade-in duration-700">
            {/* Header Section */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-4xl font-black text-white tracking-tighter mb-2">FINANCIAL HUD</h1>
                    <div className="flex items-center gap-3">
                        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${activeSession ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                            {activeSession ? '● Drawer Active' : '○ Drawer Closed'}
                        </div>
                        <span className="text-slate-500 text-xs font-mono uppercase">
                            Session ID: {activeSession?.id.slice(-8).toUpperCase() || 'NO_ACTIVE_SESSION'}
                        </span>
                    </div>
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={handleViewHistory}
                        className="px-5 py-3 bg-slate-900 border border-slate-800 text-slate-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:border-slate-600 hover:text-white transition-all flex items-center gap-2"
                    >
                        <History size={16} strokeWidth={3} /> Z-Report History
                    </button>
                    {!activeSession ? (
                        <button
                            onClick={() => setShowOpenModal(true)}
                            className="px-6 py-3 bg-white text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gold-500 transition-all flex items-center gap-2 shadow-xl shadow-white/5"
                        >
                            <PlusCircle size={16} strokeWidth={3} /> Open Business Day
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={() => setShowPayoutModal(true)}
                                className="px-6 py-3 bg-slate-900 border border-slate-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:border-red-500/50 transition-all flex items-center gap-2"
                            >
                                <MinusCircle size={16} strokeWidth={3} className="text-red-500" /> New Payout
                            </button>
                            <button
                                onClick={() => setShowCloseModal(true)}
                                className="px-6 py-3 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-500 transition-all flex items-center gap-2 shadow-xl shadow-red-600/20"
                            >
                                <ShieldCheck size={16} strokeWidth={3} /> Run Z-Report
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Expected Cash Card */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border-2 border-slate-800/50 rounded-[2.5rem] p-8 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 text-white/5 group-hover:text-white/10 transition-colors">
                        <Wallet size={120} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">Calculated Cash</p>
                        <h2 className="text-5xl font-black text-white tracking-tighter mb-2">
                            <span className="text-slate-600 text-2xl mr-2 font-light tracking-normal">Rs.</span>
                            {stats.expectedCash.toLocaleString()}
                        </h2>
                        <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold mt-4">
                            <ArrowUpRight size={14} strokeWidth={3} />
                            <span>System Verified Balance</span>
                        </div>
                    </div>
                </div>

                {/* Sales Snapshot */}
                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-8 group hover:border-slate-700 transition-all">
                    <div className="flex justify-between items-start mb-6">
                        <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                            <ArrowUpRight size={24} strokeWidth={3} />
                        </div>
                    </div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Today's Net Sales</p>
                    <h3 className="text-3xl font-black text-white tracking-tight">
                        Rs. {stats.todaySales.toLocaleString()}
                    </h3>
                    <div className="mt-4 flex gap-4">
                        <div className="text-[10px] font-bold py-1 px-2 bg-slate-800 rounded-lg text-slate-400 uppercase tracking-widest leading-none">
                            142 Orders
                        </div>
                    </div>
                </div>

                {/* Payouts Snapshot */}
                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-8 group hover:border-slate-700 transition-all">
                    <div className="flex justify-between items-start mb-6">
                        <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                            <ArrowDownLeft size={24} strokeWidth={3} />
                        </div>
                    </div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Drawer Payouts</p>
                    <h3 className="text-3xl font-black text-white tracking-tight">
                        Rs. {stats.totalPayouts.toLocaleString()}
                    </h3>
                    <div className="mt-4 flex gap-4 text-xs font-bold text-slate-500">
                        <span>Suppliers, Expenses, SCA</span>
                    </div>
                </div>
            </div>

            {/* Detailed Ledger Section */}
            <div className="flex-1 bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] overflow-hidden flex flex-col">
                <div className="p-8 border-b border-slate-800/50 flex justify-between items-center bg-[#0B0F19]">
                    <div className="flex items-center gap-3">
                        <History className="text-white" size={20} />
                        <h2 className="text-sm font-black text-white uppercase tracking-widest">Real-time General Ledger</h2>
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={() => setShowCOAModal(true)}
                            className="text-[10px] font-black text-emerald-400 uppercase tracking-widest hover:text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-lg bg-emerald-500/10"
                        >
                            Configure COA
                        </button>
                        <button className="text-[10px] font-black text-blue-400 uppercase tracking-widest hover:text-blue-300 px-3 py-1.5">
                            Export Journal (PDF)
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-[10px] font-black uppercase text-slate-500 border-b border-slate-800/50">
                                <th className="px-4 py-3">Timestamp</th>
                                <th className="px-4 py-3">Reference</th>
                                <th className="px-4 py-3">Account / Entity</th>
                                <th className="px-4 py-3">Nature</th>
                                <th className="px-4 py-3 text-right">Debit</th>
                                <th className="px-4 py-3 text-right">Credit</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs font-mono">
                            {ledgerEntries.map((entry: any) => (
                                <tr key={entry.id} className={`border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors ${entry.transaction_type === 'CREDIT' && entry.reference_type === 'PAYOUT' ? 'bg-red-500/5' : ''}`}>
                                    <td className="px-4 py-4 text-slate-500">
                                        {new Date(entry.created_at).toLocaleTimeString()}
                                    </td>
                                    <td className="px-4 py-4 font-bold text-white">
                                        {entry.reference_type}
                                    </td>
                                    <td className="px-4 py-4 text-slate-400">
                                        {entry.account_id ? 'Wait Staff / Rider' : 'Cash Drawer'}
                                    </td>
                                    <td className={`px-4 py-4 font-black uppercase ${entry.transaction_type === 'DEBIT' ? 'text-emerald-500' : 'text-red-500'}`}>
                                        {entry.transaction_type}
                                    </td>
                                    <td className="px-4 py-4 text-right text-emerald-400">
                                        {entry.transaction_type === 'DEBIT' ? `Rs. ${Number(entry.amount).toLocaleString()}` : '--'}
                                    </td>
                                    <td className="px-4 py-4 text-right text-red-400">
                                        {entry.transaction_type === 'CREDIT' ? `(Rs. ${Number(entry.amount).toLocaleString()})` : '--'}
                                    </td>
                                </tr>
                            ))}
                            {ledgerEntries.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-8 text-slate-600 italic">No transactions recorded yet.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Management Intelligence Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
                {/* Product Mix Card */}
                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-8">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <Package className="text-gold-500" size={20} />
                            <h2 className="text-sm font-black text-white uppercase tracking-widest">Top Performance (Mix)</h2>
                        </div>
                    </div>
                    <div className="space-y-4">
                        {productMix.length > 0 ? productMix.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center group">
                                <div className="flex items-center gap-4">
                                    <span className="text-[10px] font-black text-slate-600">0{idx + 1}</span>
                                    <div>
                                        <p className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors uppercase">{item.name}</p>
                                        <p className="text-[9px] text-slate-500 uppercase font-bold">{item.category}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-mono font-bold text-white">Rs. {Math.round(item.revenue).toLocaleString()}</p>
                                    <p className="text-[9px] text-emerald-500 font-black">{item.quantity} SOLD</p>
                                </div>
                            </div>
                        )) : (
                            <p className="text-center py-8 text-slate-600 italic text-xs">No sales data found for today.</p>
                        )}
                    </div>
                </div>

                {/* Sales Velocity Card */}
                <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-8">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <TrendingUp className="text-blue-500" size={20} />
                            <h2 className="text-sm font-black text-white uppercase tracking-widest">Hourly Peak Velocity</h2>
                        </div>
                    </div>
                    <div className="flex items-end gap-2 h-32">
                        {velocity.length > 0 ? velocity.slice(-12).map((v: any, idx: number) => (
                            <div key={idx} className="flex-1 group relative">
                                <div
                                    className="bg-blue-600/20 group-hover:bg-blue-500/40 border-t-2 border-blue-500 transition-all rounded-t-lg"
                                    style={{ height: `${Math.max(5, (v.revenue / (Math.max(...velocity.map((x: any) => x.revenue)) || 1)) * 100)}%` }}
                                ></div>
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-[8px] font-black px-1 rounded z-10">
                                    {v.count} ord
                                </div>
                                <p className="text-[8px] font-black text-slate-600 mt-2 text-center">{v.hour.split(':')[0]}</p>
                            </div>
                        )) : (
                            <p className="w-full text-center text-slate-600 italic text-xs">Awaiting data...</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Enterprise Reports Grid */}
            <div className="bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-8 pb-8 mb-8">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <FileText className="text-purple-500" size={20} />
                        <h2 className="text-sm font-black text-white uppercase tracking-widest">Enterprise Reports Extractor</h2>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {[
                        { title: 'Daily Sales', desc: 'Net revenue, taxes & discounts', endpoint: '/api/reports/daily-sales', icon: <Banknote size={16}/> },
                        { title: 'Tax Liability', desc: 'FBR/SRB compliance data', endpoint: '/api/reports/tax-liability', icon: <FileWarning size={16}/> },
                        { title: 'Staff Performance', desc: 'Waiters, Riders, Cashiers', endpoint: '/api/reports/staff-performance', icon: <Users size={16}/> },
                        { title: 'Product Mix', desc: 'Top & bottom movers', endpoint: '/api/reports/enhanced-product-mix', icon: <Package size={16}/> },
                        { title: 'Loss Prevention', desc: 'Voids & cancel audit', endpoint: '/api/reports/loss-prevention', icon: <ShieldAlert size={16}/> },
                        { title: 'Payouts & Expenses', desc: 'Cash outflow timeline', endpoint: '/api/reports/payout-expense', icon: <MinusCircle size={16}/> },
                    ].map(r => (
                        <button 
                            key={r.title}
                            onClick={() => {
                                const endStr = new Date().toISOString();
                                const startStr = new Date(new Date().setHours(0,0,0,0)).toISOString();
                                // Note: we assume the user has a valid cookie/token that works with these endpoints, mapping them via URL download
                                // But since it's an API, usually they'd use fetchWithAuth and then trigger download.
                                // Instead of a new tab with auth fail, let's use a simpler prompt that just opens API endpoints in new tab, assuming cookie auth works or we pass token.
                                const token = sessionStorage.getItem('accessToken') || '';
                                window.open(window.location.origin + r.endpoint + `?start=${startStr}&end=${endStr}&token=${token}`, '_blank');
                            }}
                            className="bg-slate-950/50 border border-slate-800/50 hover:border-purple-500/50 hover:bg-purple-500/10 p-4 rounded-3xl transition-all text-left flex flex-col justify-between h-32 group"
                        >
                            <div className="text-slate-500 group-hover:text-purple-400 mb-2 transition-colors">{r.icon}</div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-white group-hover:text-purple-200 transition-colors">{r.title}</p>
                                <p className="text-[9px] text-slate-500 font-bold mt-1 line-clamp-2 leading-tight">{r.desc}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
            {showOpenModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-[2.5rem] p-8 animate-in zoom-in duration-300">
                        <div className="flex items-center gap-3 mb-8">
                            <PlusCircle className="text-white" size={32} />
                            <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Initialize Drawer</h2>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Opening Cash Balance (PKR)</label>
                                <input
                                    type="number"
                                    value={openingAmount}
                                    onChange={(e) => setOpeningAmount(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white text-xl font-bold focus:border-white outline-none transition-all"
                                    placeholder="0.00"
                                    autoFocus
                                />
                            </div>
                            <div className="bg-blue-500/5 p-4 rounded-2xl flex gap-4">
                                <Info className="text-blue-500 shrink-0" size={18} />
                                <p className="text-xs text-slate-400 leading-relaxed italic">
                                    "Your opening balance typically represents the cash float left in the physical register from the previous day's handover."
                                </p>
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button onClick={() => setShowOpenModal(false)} className="flex-1 py-4 bg-slate-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-700 transition-all">Cancel</button>
                                <button onClick={handleOpenSession} className="flex-1 py-4 bg-white text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gold-500 transition-all shadow-xl shadow-white/5">Unlock Drawer</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showPayoutModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-[2.5rem] p-8 animate-in zoom-in duration-300">
                        <div className="flex items-center gap-3 mb-8">
                            <MinusCircle className="text-red-500" size={32} />
                            <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Record Payout</h2>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Category</label>
                                <select
                                    value={payoutData.category}
                                    onChange={(e) => setPayoutData({ ...payoutData, category: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none"
                                >
                                    <option value="EXPENSE">General Expense</option>
                                    <option value="SUPPLIER">Supplier Payment</option>
                                    <option value="SALARY">Staff Advance</option>
                                    <option value="WITHDRAWAL">Owner Withdrawal</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Amount (PKR)</label>
                                <input
                                    type="number"
                                    value={payoutData.amount}
                                    onChange={(e) => setPayoutData({ ...payoutData, amount: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white text-xl font-bold focus:border-red-500 outline-none transition-all"
                                    placeholder="0.00"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Notes / Reference</label>
                                <input
                                    type="text"
                                    value={payoutData.notes}
                                    onChange={(e) => setPayoutData({ ...payoutData, notes: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none"
                                    placeholder="e.g. Electricity Bill, Vendor Name"
                                />
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button onClick={() => setShowPayoutModal(false)} className="flex-1 py-4 bg-slate-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-700 transition-all">Cancel</button>
                                <button onClick={handlePayout} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-500 transition-all shadow-xl shadow-red-600/20">Confirm Payout</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showCloseModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-[2.5rem] p-8 animate-in zoom-in duration-300">
                        <div className="flex items-center gap-3 mb-8">
                            <ShieldCheck className="text-emerald-500" size={32} />
                            <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Close Session (Z-Report)</h2>
                        </div>
                        <div className="space-y-6">
                            <div className="bg-slate-800/50 p-6 rounded-2xl text-center">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">System Expected Cash</p>
                                <h3 className="text-3xl font-black text-white">Rs. {stats.expectedCash.toLocaleString()}</h3>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Actual Cash Count (PKR)</label>
                                <input
                                    type="number"
                                    value={actualCount}
                                    onChange={(e) => setActualCount(e.target.value)}
                                    className={`w-full bg-slate-950 border rounded-2xl px-6 py-4 text-white text-xl font-bold outline-none transition-all ${Math.abs(Number(actualCount) - stats.expectedCash) > 0 ? 'border-yellow-500/50 focus:border-yellow-500' : 'border-emerald-500/50 focus:border-emerald-500'}`}
                                    placeholder="0.00"
                                    autoFocus
                                />
                            </div>
                            {actualCount && (
                                <div className={`text-center text-xs font-bold uppercase tracking-widest ${Number(actualCount) - stats.expectedCash === 0 ? 'text-emerald-500' : 'text-yellow-500'}`}>
                                    Variance: Rs. {(Number(actualCount) - stats.expectedCash).toLocaleString()}
                                </div>
                            )}
                            <div className="flex gap-4 pt-4">
                                <button onClick={() => setShowCloseModal(false)} className="flex-1 py-4 bg-slate-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-700 transition-all">Cancel</button>
                                <button onClick={handleCloseSession} className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-600/20">Finalize Day</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Z-Report Summary */}
            <ZReportModal
                isOpen={showReportModal}
                onClose={() => setShowReportModal(false)}
                report={activeReport}
            />

            {/* COA MODAL */}
            {showCOAModal && <ChartOfAccountsModal onClose={() => setShowCOAModal(false)} />}

            {/* Z-Report History Modal */}
            {showHistoryModal && (
                <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-[2.5rem] overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in duration-200">
                        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <History className="text-blue-500" size={20} />
                                <h2 className="text-lg font-black text-white tracking-tighter uppercase">Session History</h2>
                            </div>
                            <button onClick={() => setShowHistoryModal(false)} className="p-2 hover:bg-slate-800 rounded-xl text-slate-500">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                            {sessionHistory.length === 0 && (
                                <p className="text-center py-8 text-slate-600 italic text-sm">No past sessions found.</p>
                            )}
                            {sessionHistory.map((s: any) => (
                                <button
                                    key={s.id}
                                    onClick={() => handleLoadHistoricalReport(s.id)}
                                    className="w-full p-4 bg-slate-950 border border-slate-800 rounded-2xl hover:border-blue-500/40 transition-all text-left group"
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-xs font-mono font-bold text-white group-hover:text-blue-400 transition-colors">
                                                {s.id.slice(-8).toUpperCase()}
                                            </p>
                                            <p className="text-[10px] text-slate-500 mt-1">
                                                {new Date(s.opened_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-widest ${s.status === 'CLOSED' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                                                {s.status}
                                            </span>
                                            {s.variance !== null && s.variance !== undefined && (
                                                <p className={`text-[10px] mt-1 font-bold font-mono ${Number(s.variance) === 0 ? 'text-slate-600' : Number(s.variance) > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                                                    Var: {Number(s.variance) >= 0 ? '+' : ''}Rs. {Math.round(Number(s.variance)).toLocaleString()}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex justify-between text-[10px] text-slate-600 mt-2">
                                        <span>{new Date(s.opened_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                                        <span>{s.closed_at ? new Date(s.closed_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'Still Open'}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinancialCommandCenter;
