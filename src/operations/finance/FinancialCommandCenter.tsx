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
    TrendingUp
} from 'lucide-react';
import { useAppContext as useApp } from '../../client/contexts/AppContext';
import { ZReportModal } from '../../shared/components/ZReportModal';

const FinancialCommandCenter: React.FC = () => {
    const { currentUser } = useApp();
    const restaurantId = currentUser?.restaurant_id;
    const staffId = currentUser?.id;
    const [activeSession, setActiveSession] = useState<any>(null);
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
    const [activeReport, setActiveReport] = useState<any>(null);

    // Form states
    const [openingAmount, setOpeningAmount] = useState('');
    const [payoutData, setPayoutData] = useState({ amount: '', category: 'EXPENSE', notes: '' });
    const [actualCount, setActualCount] = useState('');
    const [productMix, setProductMix] = useState<any[]>([]);
    const [velocity, setVelocity] = useState<any[]>([]);

    useEffect(() => {
        fetchSession();
    }, [restaurantId]);

    const fetchSession = async () => {
        try {
            const [sessionRes, ledgerRes] = await Promise.all([
                fetch(`http://localhost:3001/api/accounting/session/${restaurantId}`),
                fetch(`http://localhost:3001/api/accounting/ledger/${restaurantId}?limit=50`)
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
                fetch(`http://localhost:3001/api/reports/product-mix?restaurantId=${restaurantId}&start=${startOfDay}&end=${endOfDay}`),
                fetch(`http://localhost:3001/api/reports/velocity?restaurantId=${restaurantId}&start=${startOfDay}&end=${endOfDay}`)
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
            const res = await fetch('http://localhost:3001/api/accounting/session/open', {
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
            const res = await fetch('http://localhost:3001/api/accounting/payout', {
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
            const res = await fetch('http://localhost:3001/api/accounting/session/close', {
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
                const reportRes = await fetch(`http://localhost:3001/api/accounting/z-report/${activeSession?.id}`);
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
                <div className="p-8 border-b border-slate-800/50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <History className="text-white" size={20} />
                        <h2 className="text-sm font-black text-white uppercase tracking-widest">Real-time General Ledger</h2>
                    </div>
                    <button className="text-[10px] font-black text-blue-400 uppercase tracking-widest hover:text-blue-300">
                        Export Journal (PDF)
                    </button>
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
        </div>
    );
};

export default FinancialCommandCenter;
