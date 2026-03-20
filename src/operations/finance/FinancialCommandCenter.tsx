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
    PieChart,
    CreditCard,
    X,
    FileText,
    FileWarning,
    Users,
    ShieldAlert,
    Banknote,
    Eye,
    Printer,
    Bike
} from 'lucide-react';
import { useAppContext as useApp } from '../../client/contexts/AppContext';
import { ZReportModal } from '../../shared/components/ZReportModal';
import { ChartOfAccountsModal } from './components/ChartOfAccountsModal';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';

const FinancialCommandCenter: React.FC = () => {
    const { currentUser, activeSession, setActiveSession, drivers } = useApp();
    const restaurantId = currentUser?.restaurant_id;
    const staffId = currentUser?.id;

    const [stats, setStats] = useState({
        expectedCash: 0,
        todaySales: 0,
        totalPayouts: 0
    });
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [ledger, setLedger] = useState<any[]>([]);
    const [metrics, setMetrics] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [showPayoutModal, setShowPayoutModal] = useState(false);
    const [showOpenModal, setShowOpenModal] = useState(false);
    const [showCloseModal, setShowCloseModal] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [showCOAModal, setShowCOAModal] = useState(false);
    const [activeReport, setActiveReport] = useState<any>(null);
    const [openingAmount, setOpeningAmount] = useState('');
    const [payoutData, setPayoutData] = useState({ amount: '', category: 'EXPENSE', notes: '' });
    const [actualCount, setActualCount] = useState('');
    const [productMix, setProductMix] = useState<any[]>([]);
    const [velocity, setVelocity] = useState<any[]>([]);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [sessionHistory, setSessionHistory] = useState<any[]>([]);
    const [previewReport, setPreviewReport] = useState<{ title: string; endpoint: string; type?: string } | null>(null);
    const [reportData, setReportData] = useState<any>(null);
    const [reportLoading, setReportLoading] = useState(false);
    const [selectedRiderId, setSelectedRiderId] = useState<string>('');

    const fetchSession = async () => {
        try {
            const apiBase = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const res = await fetchWithAuth(`${apiBase}/accounting/session?date=${selectedDate}`);
            const data = await res.json();
            
            if (data.success && data.session) {
                setActiveSession(data.session);
                setMetrics(data.session.metrics || {});
                setStats({
                    expectedCash: Number(data.session.metrics?.expectedCash || 0),
                    todaySales: Number(data.session.metrics?.totalRevenue || 0),
                    totalPayouts: Number(data.session.metrics?.payouts || 0)
                });
            } else {
                setActiveSession(null);
                setMetrics({});
                setStats({ expectedCash: 0, todaySales: 0, totalPayouts: 0 });
            }
        } catch (err) {
            console.error('Failed to fetch session', err);
            setActiveSession(null);
            setMetrics({});
            setStats({ expectedCash: 0, todaySales: 0, totalPayouts: 0 });
        }
    };

    const fetchLedger = async () => {
        try {
            const apiBase = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const res = await fetchWithAuth(`${apiBase}/accounting/ledger?limit=50&date=${selectedDate}`);
            const data = await res.json();
            if (data.success) {
                setLedger(data.entries);
            } else {
                setLedger([]);
            }
        } catch (err) {
            console.error('Failed to fetch ledger', err);
            setLedger([]);
        }
    };

    const fetchIntelligence = async () => {
        try {
            const apiBase = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const [velocityRes, productRes] = await Promise.all([
                fetchWithAuth(`${apiBase}/reports/velocity?start=${new Date(selectedDate).toISOString()}&end=${new Date(new Date(selectedDate).setHours(23, 59, 59, 999)).toISOString()}`),
                fetchWithAuth(`${apiBase}/reports/product-mix?start=${new Date(selectedDate).toISOString()}&end=${new Date(new Date(selectedDate).setHours(23, 59, 59, 999)).toISOString()}`)
            ]);
            
            const velocityData = await velocityRes.json();
            const productData = await productRes.json();
            
            if (velocityData.success) setVelocity(velocityData.data || []);
            if (productData.success) setProductMix(productData.data || []);
        } catch (err) {
            console.error('Failed to fetch intelligence', err);
        }
    };

    const handleFetchReport = async (endpoint: string, title: string, riderIdOverride?: string) => {
        setReportLoading(true);
        try {
            const apiBase = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
            const endStr = new Date(new Date(selectedDate).setHours(23, 59, 59, 999)).toISOString();
            const startStr = new Date(selectedDate).toISOString();
            
            const riderParam = riderIdOverride || selectedRiderId;
            const res = await fetchWithAuth(`${apiBase}${endpoint}?start=${startStr}&end=${endStr}&format=json${riderParam ? `&riderId=${riderParam}` : ''}`);
            const data = await res.json();
            
            if (data.success) {
                setReportData(data.data);
            } else {
                console.error(`Failed to fetch ${title}:`, data.error);
                setReportData(null);
            }
        } catch (err) {
            console.error(`Error fetching ${title}:`, err);
            setReportData(null);
        } finally {
            setReportLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        Promise.all([fetchSession(), fetchLedger(), fetchIntelligence()])
            .finally(() => setLoading(false));
    }, [selectedDate, restaurantId]);


    const handleOpenSession = async () => {
        try {
            const res = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/accounting/session/open`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    restaurantId,
                    staffId,
                    openingBalance: Number(openingAmount),
                    date: selectedDate // Pass selected date
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
                    notes: payoutData.notes,
                    sessionId: activeSession?.id // Ensure session ID is passed
                })
            });
            const data = await res.json();
            if (data.success) {
                fetchSession();
                fetchLedger(); // Refresh ledger after payout
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
            {/* Header Metrics */}
            <div className="flex justify-between items-center mb-10">
                <div>
                    <h1 className="text-4xl font-black text-white tracking-tighter uppercase mb-1">Financial Command</h1>
                    <p className="text-slate-500 font-mono text-xs uppercase tracking-[0.2em]">Real-time GL & Performance Intelligence</p>
                </div>
                <div className="flex gap-4 items-center">
                    <div className="flex flex-col items-end mr-4">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Business Date</span>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white text-xs font-black uppercase outline-none focus:border-emerald-500 transition-all"
                        />
                    </div>
                    <div className="h-10 w-px bg-slate-800 mx-2" />
                    <button
                        onClick={() => setShowOpenModal(true)}
                        className="px-8 py-3.5 bg-white text-slate-950 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-500/10"
                    >
                        Open Day
                    </button>
                    <button
                        onClick={() => setShowCloseModal(true)}
                        className="px-8 py-3.5 bg-slate-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-red-600 transition-all"
                    >
                        Close Day
                    </button>
                </div>
            </div>

            {/* Session Status and Actions */}
            <div className="flex justify-between items-end">
                <div>
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
                    {activeSession && (
                        <button
                            onClick={() => setShowPayoutModal(true)}
                            className="px-6 py-3 bg-slate-900 border border-slate-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:border-red-500/50 transition-all flex items-center gap-2"
                        >
                            <MinusCircle size={16} strokeWidth={3} className="text-red-500" /> New Payout
                        </button>
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
                            {metrics?.orderCount || 0} Orders
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
                        <button
                            onClick={() => window.open(window.location.origin + `/api/accounting/ledger/export?token=${sessionStorage.getItem('accessToken')}&date=${selectedDate}`, '_blank')}
                            className="text-[10px] font-black text-blue-400 uppercase tracking-widest hover:text-blue-300 px-3 py-1.5"
                        >
                            Export Journal (CSV)
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
                            {ledger.map((entry: any) => (
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
                            {ledger.length === 0 && (
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
                        { title: 'Category Sales', desc: 'Revenue breakdown by group', endpoint: '/api/reports/category-sales', icon: <PieChart size={16}/> },
                        { title: 'Payment Methods', desc: 'Cash vs Digital split', endpoint: '/api/reports/payment-methods', icon: <CreditCard size={16}/> },
                        { title: 'Product Mix', desc: 'Top & bottom movers', endpoint: '/api/reports/product-mix', icon: <Package size={16}/> },
                        { title: 'Rider Audit', desc: 'Detailed log for delivery staff', endpoint: '/api/reports/rider-audit', type: 'rider-audit', icon: <Bike size={16}/> },
                        { title: 'Loss Prevention', desc: 'Voids & cancel audit', endpoint: '/api/reports/loss-prevention', icon: <ShieldAlert size={16}/> },
                        { title: 'Security Logs', desc: 'Operational audit trail', endpoint: '/api/reports/security', icon: <ShieldCheck size={16}/> },
                    ].map(r => (
                        <button
                            key={r.title}
                            onClick={() => {
                                setPreviewReport(r);
                                handleFetchReport(r.endpoint, r.title);
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

            {/* Report History Modal */}
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

            {/* NEW: Report Preview Modal */}
            {previewReport && (
                <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[150] flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-[2.5rem] overflow-hidden flex flex-col max-h-[90vh] shadow-2xl animate-in zoom-in duration-300">
                        <div className="p-8 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-purple-500/10 rounded-2xl">
                                    <Eye className="text-purple-500" size={24} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-white tracking-tighter uppercase">{previewReport.title}</h2>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Report Preview & Reconciliation</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => {
                                        const endStr = new Date(new Date(selectedDate).setHours(23, 59, 59, 999)).toISOString();
                                        const startStr = new Date(selectedDate).toISOString();
                                        const token = sessionStorage.getItem('accessToken') || '';
                                        const riderParam = selectedRiderId ? `&riderId=${selectedRiderId}` : '';
                                        window.open(window.location.origin + previewReport.endpoint + `?start=${startStr}&end=${endStr}&token=${token}${riderParam}`, '_blank');
                                    }}
                                    className="flex items-center gap-2 px-6 py-3 bg-white text-slate-950 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-purple-400 transition-all shadow-lg"
                                >
                                    <Printer size={14} />
                                    Print Document
                                </button>
                                <button onClick={() => { setPreviewReport(null); setReportData(null); }} className="p-3 hover:bg-slate-800 rounded-2xl text-slate-500 bg-slate-800/50">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-slate-900">
                            {previewReport?.type === 'rider-audit' && (
                                <div className="mb-8 flex items-center gap-4 bg-slate-950/30 p-4 border border-slate-800/50 rounded-2xl">
                                    <div className="shrink-0 bg-slate-900 border border-slate-800 p-2 rounded-xl text-slate-400">
                                        <Users size={18} />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Select Rider for Audit</p>
                                        <select 
                                            className="w-full bg-transparent text-white font-bold text-sm outline-none cursor-pointer"
                                            value={selectedRiderId}
                                            onChange={(e) => {
                                                const rid = e.target.value;
                                                setSelectedRiderId(rid);
                                                handleFetchReport(previewReport.endpoint, previewReport.title, rid);
                                            }}
                                        >
                                            <option value="">All Riders (Overview)</option>
                                            {(drivers || []).map((d: any) => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {reportLoading ? (
                                <div className="h-64 flex flex-col items-center justify-center gap-4">
                                    <div className="w-12 h-12 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
                                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest animate-pulse">Calculating Metrics...</p>
                                </div>
                            ) : reportData ? (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    {/* Summary Stats */}
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                                        {Object.entries(reportData.summary || {}).slice(0, 4).map(([key, val]: [string, any]) => (
                                            <div key={key} className="bg-slate-950/50 border border-slate-800 p-6 rounded-3xl">
                                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">{key.replace(/_/g, ' ')}</p>
                                                <p className="text-lg font-black text-white">
                                                    {typeof val === 'number' ? 
                                                        (key.includes('revenue') || key.includes('value') || key.includes('tax') ? `Rs. ${Math.round(val).toLocaleString()}` : val.toLocaleString()) 
                                                        : val?.toString() || '0'}
                                                </p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Data Visualization / Details section based on type */}
                                    <div className="bg-slate-950/30 border border-slate-800/50 rounded-[2rem] p-8">
                                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                                            <div className="w-1 h-1 bg-purple-500 rounded-full"></div>
                                            Detailed Breakdown
                                        </h3>
                                        <div className="space-y-4">
                                            {/* Placeholder for complex rendering - For now, show key-value pairs or simple lists */}
                                            {renderPreviewContent(previewReport.title, reportData)}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-20">
                                    <PlusCircle className="mx-auto text-slate-800 mb-4" size={48} />
                                    <p className="text-slate-500 font-bold">Failed to load report data. Please try again.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Helper for Preview Content Rendering
const renderPreviewContent = (title: string, data: any) => {
    // Simplified rendering for preview - mostly lists of important metrics
    const items = data.orders || data.breakdown || data.categories || data.waiters || data.tax_breakdown || [];
    
    if (Array.isArray(items)) {
        return (
            <div className="grid gap-3">
                {items.slice(0, 15).map((item: any, i: number) => (
                    <div key={i} className="flex justify-between items-center p-4 bg-slate-900/50 border border-slate-800 rounded-2xl hover:border-slate-700 transition-all">
                        <span className="text-xs font-black text-slate-300 uppercase tracking-wider">{item.name || item.staff || item.type || `Entry #${i+1}`}</span>
                        <div className="text-right">
                            <p className="text-xs font-black text-white">
                                {item.revenue ? `Rs. ${Math.round(item.revenue).toLocaleString()}` : 
                                 item.total ? `Rs. ${Math.round(item.total).toLocaleString()}` : 
                                 item.count || item.quantity || ''}
                            </p>
                            {item.percentage && <p className="text-[9px] font-bold text-slate-500">{item.percentage}% Share</p>}
                        </div>
                    </div>
                ))}
                {items.length > 15 && <p className="text-center text-[10px] text-slate-600 italic font-bold mt-4">+ {items.length - 15} more records available in print version</p>}
            </div>
        );
    }
    
    return <pre className="text-[10px] text-slate-400 font-mono bg-slate-950 p-6 rounded-2xl border border-slate-800 overflow-auto max-h-64">
        {JSON.stringify(data.summary || data, null, 2)}
    </pre>;
};

export default FinancialCommandCenter;
