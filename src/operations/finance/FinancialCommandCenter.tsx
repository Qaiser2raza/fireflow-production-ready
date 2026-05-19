import React, { useState, useEffect, useRef } from 'react';
import {
    History,
    PlusCircle,
    MinusCircle,
    Info,
    ShieldCheck,
    X,
    FileText,
    Users,
    Eye,
    Printer,
    FileEdit
} from 'lucide-react';
import { useAppContext as useApp } from '../../client/contexts/AppContext';
import { ZReportModal } from '../../shared/components/ZReportModal';
import { ChartOfAccountsModal } from './components/ChartOfAccountsModal';
import { TrialBalanceModal } from './components/TrialBalanceModal';
import { ManualJournalEntryModal } from './components/ManualJournalEntryModal';
import { DaybookReviewModal } from './components/DaybookReviewModal';
import { AccountLedgerModal } from './components/AccountLedgerModal';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';

const FinancialCommandCenter: React.FC = () => {
    const { currentUser, currentRestaurant, activeSession, drivers, suppliers } = useApp();
    const restaurantId = currentUser?.restaurant_id;
    const staffId = currentUser?.id;
    const timezone = currentRestaurant?.timezone || 'Asia/Karachi';

    const formatTime = (date: string | Date) => {
        try {
            return new Intl.DateTimeFormat('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
                timeZone: timezone
            }).format(new Date(date));
        } catch (e) {
            return new Date(date).toLocaleTimeString();
        }
    };

    const [stats, setStats] = useState({
        expectedCash: 0,
        todaySales: 0,
        totalPayouts: 0
    });
    const [_glBalance, setGlBalance] = useState(0);
    const [_glRevenue, setGlRevenue] = useState(0);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [useRange, setUseRange] = useState(false);
    
    const [ledger, setLedger] = useState<any[]>([]);
    const [metrics, setMetrics] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [coaAccounts, setCoaAccounts] = useState<any[]>([]);
    const [ledgerAccountFilter, _setLedgerAccountFilter] = useState<string>('');
    const [ledgerTypeFilter, setLedgerTypeFilter] = useState<string>('');
    const [ledgerRefFilter, setLedgerRefFilter] = useState<string>('');
    const [ledgerSearch, setLedgerSearch] = useState<string>('');
    const [showPayoutModal, setShowPayoutModal] = useState(false);
    const [showOpenModal, setShowOpenModal] = useState(false);
    const [showCloseModal, setShowCloseModal] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [showCOAModal, setShowCOAModal] = useState(false);
    const [activeReport, setActiveReport] = useState<any>(null);
    const [openingAmount, setOpeningAmount] = useState('');
    const [payoutData, setPayoutData] = useState({ amount: '', category: 'EXPENSE', notes: '', supplierId: '' });
    const [actualCount, setActualCount] = useState('');
    const [_productMix, setProductMix] = useState<any[]>([]);
    const [_velocity, setVelocity] = useState<any[]>([]);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [sessionHistory, setSessionHistory] = useState<any[]>([]);
    const [previewReport, setPreviewReport] = useState<{ title: string; endpoint: string; type?: string } | null>(null);
    const [reportData, setReportData] = useState<any>(null);
    const [reportLoading, setReportLoading] = useState(false);
    const [selectedRiderId, setSelectedRiderId] = useState<string>('');
    const [showTrialBalanceModal, setShowTrialBalanceModal] = useState(false);
    const [showManualJournalModal, setShowManualJournalModal] = useState(false);
    const [showDaybookReviewModal, setShowDaybookReviewModal] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');
    const [ledgerAccount, setLedgerAccount] = useState<{id: string, code: string, name: string} | null>(null);

    // Debounce timers for fetch operations
    const fetchAllDataDebounce = useRef<NodeJS.Timeout | null>(null);
    const hasInitiallyFetched = useRef(false);

    const debouncedFetchAll = () => {
        if (fetchAllDataDebounce.current) {
            clearTimeout(fetchAllDataDebounce.current);
        }
        
        fetchAllDataDebounce.current = setTimeout(() => {
            setLoading(true);
            Promise.all([fetchSession(), fetchLedger(), fetchIntelligence(), fetchCOA(), fetchGLStats()])
                .finally(() => setLoading(false));
            fetchAllDataDebounce.current = null;
        }, 300);
    };

    const fetchSession = async () => {
        try {
            const apiBase = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const res = await fetchWithAuth(`${apiBase}/accounting/session?date=${selectedDate}`);
            const data = await res.json();
            
            if (data.success && data.sessions && data.sessions.length > 0) {
                // If there are multiple sessions, aggregate the metrics for the whole day view.
                const aggregatedMetrics = data.sessions.reduce((acc: any, s: any) => {
                    const m = s.metrics || {};
                    return {
                        expectedCash: Number(acc.expectedCash || 0) + Number(m.expectedCash || 0),
                        totalRevenue: Number(acc.totalRevenue || 0) + Number(m.totalRevenue || 0),
                        payouts: Number(acc.payouts || 0) + Number(m.payouts || 0),
                        cashSales: Number(acc.cashSales || 0) + Number(m.cashSales || 0),
                        settlements: Number(acc.settlements || 0) + Number(m.settlements || 0),
                        orderCount: Number(acc.orderCount || 0) + Number(m.orderCount || 0)
                    };
                }, {});

                setMetrics(aggregatedMetrics);
                setStats({
                    expectedCash: aggregatedMetrics.expectedCash,
                    todaySales: aggregatedMetrics.totalRevenue,
                    totalPayouts: aggregatedMetrics.payouts
                });
            } else if (data.success && data.session) {
                setMetrics(data.session.metrics || {});
                setStats({
                    expectedCash: Number(data.session.metrics?.expectedCash || 0),
                    todaySales: Number(data.session.metrics?.totalRevenue || 0),
                    totalPayouts: Number(data.session.metrics?.payouts || 0)
                });
            } else {
                setMetrics({});
                // Fall back to GL data when no session for this date
                // Revenue comes from coaAccounts 4000 + 4010
                // Cash comes from coaAccounts 1000
                const revenueAccount = coaAccounts?.find((a: any) => a.code === '4000');
                const cashAccount = coaAccounts?.find((a: any) => a.code === '1000');
                const deliveryAccount = coaAccounts?.find((a: any) => a.code === '4010');
                
                const glRevenue = revenueAccount 
                  ? Number(revenueAccount.total_credit || 0) - Number(revenueAccount.total_debit || 0)
                  : 0;
                const glCash = cashAccount
                  ? Number(cashAccount.total_debit || 0) - Number(cashAccount.total_credit || 0)
                  : 0;
                const glDelivery = deliveryAccount
                  ? Number(deliveryAccount.total_credit || 0) - Number(deliveryAccount.total_debit || 0)
                  : 0;

                setStats({ 
                  expectedCash: glCash, 
                  todaySales: glRevenue + glDelivery, 
                  totalPayouts: 0 
                });
            }
        } catch (err) {
            console.error('Failed to fetch session', err);
            setMetrics({});
            setStats({ expectedCash: 0, todaySales: 0, totalPayouts: 0 });
        }
    };

    const fetchLedger = async (accountId?: string) => {
        try {
            const apiBase = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const acctParam = accountId || ledgerAccountFilter;
            
            let url = `${apiBase}/accounting/ledger?limit=250`;
            if (useRange) {
                url += `&startDate=${startDate}&endDate=${endDate}`;
            } else {
                url += `&date=${selectedDate}`;
            }
            
            if (acctParam) url += `&accountId=${acctParam}`;
            if (ledgerTypeFilter) url += `&type=${ledgerTypeFilter}`;
            if (ledgerRefFilter) url += `&refType=${ledgerRefFilter}`;
            if (ledgerSearch) url += `&searchQuery=${encodeURIComponent(ledgerSearch)}`;

            const res = await fetchWithAuth(url);
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

    const fetchCOA = async () => {
        try {
            const apiBase = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const res = await fetchWithAuth(`${apiBase}/accounting/coa`);
            if (res.ok) { const d = await res.json(); setCoaAccounts(d.accounts || []); }
        } catch { /* silent */ }
    };

    const fetchIntelligence = async () => {
        try {
            const apiBase = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const start = useRange ? startDate : selectedDate;
            const end = useRange ? endDate : selectedDate;
            
            const startStr = new Date(start).toISOString();
            const endStr = new Date(new Date(end).setHours(23, 59, 59, 999)).toISOString();

            const [velocityRes, productRes] = await Promise.all([
                fetchWithAuth(`${apiBase}/reports/velocity?start=${startStr}&end=${endStr}&format=json`),
                fetchWithAuth(`${apiBase}/reports/product-mix?start=${startStr}&end=${endStr}&format=json`)
            ]);
            
            const velocityData = await velocityRes.json();
            const productData = await productRes.json();
            
            if (velocityData.success) setVelocity(velocityData.data || []);
            if (productData.success) setProductMix(productData.data || []);
        } catch (err) {
            console.error('Failed to fetch intelligence', err);
        }
    };

    const fetchGLStats = async () => {
        try {
            const apiBase = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const query = useRange ? `startDate=${startDate}&endDate=${endDate}` : `date=${selectedDate}`;
            
            const [balanceRes, revenueRes] = await Promise.all([
                fetchWithAuth(`${apiBase}/accounting/gl-balance?${query}`),
                fetchWithAuth(`${apiBase}/accounting/gl-revenue?${query}`)
            ]);
            
            const balanceData = await balanceRes.json();
            const revenueData = await revenueRes.json();
            
            if (balanceData.success) setGlBalance(balanceData.cash_balance);
            if (revenueData.success) setGlRevenue(revenueData.revenue);
        } catch (err) {
            console.error('Failed to fetch GL stats', err);
        }
    };

    const handleFetchReport = async (endpoint: string, title: string, riderIdOverride?: string) => {
        setReportLoading(true);
        try {
            const apiBase = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
            const start = useRange ? startDate : selectedDate;
            const end = useRange ? endDate : selectedDate;

            const startStr = new Date(start).toISOString();
            const endStr = new Date(new Date(end).setHours(23, 59, 59, 999)).toISOString();
            
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
        // Skip until we have a valid restaurantId
        if (!restaurantId) return;
        
        // Skip if we already did initial fetch
        if (hasInitiallyFetched.current) return;
        
        hasInitiallyFetched.current = true;
        debouncedFetchAll();
        
        return () => {
            if (fetchAllDataDebounce.current) {
                clearTimeout(fetchAllDataDebounce.current);
            }
        };
    }, [restaurantId]);

    // Re-fetch when user intentionally changes dates (after initial load)
    useEffect(() => {
        if (!restaurantId || !hasInitiallyFetched.current) return;
        
        debouncedFetchAll();
    }, [selectedDate, startDate, endDate, useRange]);

    // Re-fetch ledger whenever filters changes
    useEffect(() => {
        fetchLedger();
    }, [ledgerAccountFilter, ledgerTypeFilter, ledgerRefFilter, ledgerSearch]);

    // Listen for global real-time DB changes bridged from socket
    useEffect(() => {
        const handler = (e: Event) => {
            const { table } = (e as CustomEvent<{table:string,eventType:string}>).detail || {};
            if (['orders','transactions','rider_shifts','journal_entries'].includes(table)) {
                debouncedFetchAll();
            }
        };
        window.addEventListener('fireflow:db_change', handler);
        return () => window.removeEventListener('fireflow:db_change', handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


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
                    supplierId: payoutData.category === 'SUPPLIER' ? payoutData.supplierId : undefined,
                    sessionId: activeSession?.id // Ensure session ID is passed
                })
            });
            const data = await res.json();
            if (data.success) {
                fetchSession();
                fetchLedger(); // Refresh ledger after payout
                setShowPayoutModal(false);
                setPayoutData({ amount: '', category: 'EXPENSE', notes: '', supplierId: '' });
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

    const handlePrintLedger = () => {
        const dateLabel = useRange ? `${startDate} to ${endDate}` : (selectedDate || new Date().toLocaleDateString());
        const rows = ledger.map((e: any) => `
            <tr>
                <td>${e.created_at ? formatTime(e.created_at) : '—'}</td>
                <td>${e.reference_type || ''}</td>
                <td>${(e.description || e.account_name || 'Cash Drawer').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td>
                <td style="color:${e.transaction_type==='DEBIT'?'#166534':'#991b1b'}">${e.transaction_type}</td>
                <td class="amt">${e.transaction_type==='DEBIT' ? 'Rs. '+Number(e.amount).toLocaleString() : ''}</td>
                <td class="amt">${e.transaction_type==='CREDIT' ? 'Rs. '+Number(e.amount).toLocaleString() : ''}</td>
            </tr>`).join('');

        const html = `<!DOCTYPE html><html><head><title>General Ledger — ${dateLabel}</title>
        <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#000;padding:20px}
        h1{font-size:16px;font-weight:900;margin-bottom:2px}p{font-size:9px;color:#555;margin-bottom:16px}
        table{width:100%;border-collapse:collapse}th{background:#000;color:#fff;font-size:9px;text-transform:uppercase;letter-spacing:.08em;padding:6px 8px;text-align:left}
        td{padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:9px;vertical-align:middle}
        tr:nth-child(even){background:#f9fafb}.amt{text-align:right;font-family:monospace}
        @media print{body{padding:10px}}</style></head>
        <body><h1>General Ledger — ${dateLabel}</h1>
        <p>Printed by Fireflow POS &bull; ${new Date().toLocaleString()}</p>
        <table><thead><tr><th>Time</th><th>Ref</th><th>Description</th><th>Type</th><th class="amt">Debit (Dr)</th><th class="amt">Credit (Cr)</th></tr></thead>
        <tbody>${rows}</tbody></table></body></html>`;

        const w = window.open('', '_blank', 'width=900,height=700');
        if (!w) return;
        w.document.write(html);
        w.document.close();
        w.print();
    };

    if (loading) return <div className="p-8 text-slate-500 animate-pulse font-mono uppercase tracking-widest text-xs">Initializing Ledger...</div>;

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-300 p-6 space-y-5 animate-in fade-in duration-700">
            {/* ── HEADER ─────────────────────────────────────── */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-black text-white uppercase tracking-wider">Daily Financial Summary</h1>
                    <p className="text-slate-500 text-[10px] font-mono mt-0.5 uppercase tracking-widest">{useRange ? `${startDate} → ${endDate}` : selectedDate}</p>
                </div>
                <div className="flex gap-2 items-center">

                    {!useRange ? (
                        <div className="flex flex-col items-end mr-2">
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white text-xs font-black uppercase outline-none focus:border-emerald-500 transition-all"
                            />
                        </div>
                    ) : (
                        <div className="flex gap-2 items-center">
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-1.5 text-white text-[10px] font-black uppercase outline-none focus:border-indigo-500 transition-all"
                            />
                            <span className="text-slate-600 text-[10px] font-black">TO</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-1.5 text-white text-[10px] font-black uppercase outline-none focus:border-indigo-500 transition-all"
                            />
                        </div>
                    )}

                    <div className="h-8 w-px bg-slate-800 mx-2" />
                    <div className="flex gap-2">
                        {[
                            { label: 'Today', onClick: () => { setUseRange(false); setSelectedDate(new Date().toISOString().split('T')[0]); } },
                            { label: '7D', onClick: () => { 
                                setUseRange(true); 
                                const d = new Date();
                                setEndDate(d.toISOString().split('T')[0]);
                                d.setDate(d.getDate() - 7);
                                setStartDate(d.toISOString().split('T')[0]);
                            }},
                            { label: '30D', onClick: () => { 
                                setUseRange(true); 
                                const d = new Date();
                                setEndDate(d.toISOString().split('T')[0]);
                                d.setDate(d.getDate() - 30);
                                setStartDate(d.toISOString().split('T')[0]);
                            }}
                        ].map(q => (
                            <button
                                key={q.label}
                                onClick={q.onClick}
                                className="px-3 py-2 bg-slate-900 border border-slate-800 text-slate-500 rounded-xl font-black text-[9px] uppercase tracking-widest hover:text-white hover:border-slate-600 transition-all"
                            >
                                {q.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            
            {/* ── TABS ─────────────────────────────────────── */}
            <div className="flex items-center gap-2 mb-2">
                {[
                    { id: 'overview', label: 'Overview' },
                    { id: 'accounts', label: 'Cash & Accounts' },
                    { id: 'ledger', label: 'Ledger' },
                    { id: 'reports', label: 'Reports' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-slate-900 border border-slate-800 text-slate-500 hover:text-white hover:border-slate-600'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === 'overview' && (
                <div className="space-y-5 animate-in fade-in duration-300">
                    {/* ── SESSION STATUS BAR ───────────────────────────── */}
            <div className="flex items-center justify-between bg-slate-900/50 border border-slate-800/70 rounded-xl px-5 py-3">
                <div className="flex items-center gap-4">
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${activeSession ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${activeSession ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                        Session: {activeSession ? 'Open' : 'Closed'}
                    </div>
                    <span className="text-slate-500 text-xs font-mono">
                        {activeSession
                            ? `Opened ${formatTime((activeSession as any).opened_at || new Date())}`
                            : sessionHistory[0]?.closed_at
                                ? `Last closed ${formatTime(sessionHistory[0].closed_at)}`
                                : 'No session recorded'}
                    </span>
                </div>
                <div className="flex gap-2">
                    {activeSession && (
                        <button onClick={() => setShowDaybookReviewModal(true)} className="px-3 py-1.5 bg-slate-800 text-orange-400 border border-slate-700 rounded-lg font-black text-[9px] uppercase tracking-widest hover:border-orange-500/40 transition-all flex items-center gap-1.5">
                            <Info size={11} strokeWidth={3} /> Daybook
                        </button>
                    )}
                    {activeSession && (
                        <button onClick={() => setShowPayoutModal(true)} className="px-3 py-1.5 bg-slate-800 text-slate-300 border border-slate-700 rounded-lg font-black text-[9px] uppercase tracking-widest hover:border-red-500/40 hover:text-red-400 transition-all flex items-center gap-1.5">
                            <MinusCircle size={11} strokeWidth={3} className="text-red-500" /> Payout
                        </button>
                    )}
                    <button onClick={handleViewHistory} className="px-3 py-1.5 bg-slate-800 text-slate-400 border border-slate-700 rounded-lg font-black text-[9px] uppercase tracking-widest hover:text-white transition-all flex items-center gap-1.5">
                        <History size={11} strokeWidth={3} /> History
                    </button>
                </div>
            </div>
                    {/* ── 3 KPI CARDS ────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-5">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.25em] mb-3">Cash Drawer</p>
                    <h2 className="text-4xl font-black text-white tracking-tight mb-1"><span className="text-slate-600 text-base font-normal mr-1">Rs.</span>{stats.expectedCash.toLocaleString()}</h2>
                    <p className="text-[10px] text-slate-500 mb-3">Expected in drawer</p>
                    <div className="pt-3 border-t border-slate-800/70 flex gap-3 flex-wrap">
                        <span className="text-[10px] font-bold bg-slate-800 px-2 py-1 rounded-md text-slate-400 uppercase">{metrics?.orderCount || 0} Orders</span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Payouts: Rs. {stats.totalPayouts.toLocaleString()}</span>
                    </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.25em] mb-3">Revenue</p>
                    <h2 className="text-4xl font-black text-white tracking-tight mb-1"><span className="text-slate-600 text-base font-normal mr-1">Rs.</span>{stats.todaySales.toLocaleString()}</h2>
                    <p className="text-[10px] text-slate-500 mb-3">Net sales for period</p>
                    <div className="pt-3 border-t border-slate-800/70 space-y-1.5">
                        {Number(metrics?.cashSales || 0) > 0 && (
                            <div className="flex justify-between text-[10px] font-bold">
                                <span className="text-slate-500 uppercase">Food & Beverage</span>
                                <span className="text-slate-300 font-mono">Rs. {Number(metrics.cashSales).toLocaleString()}</span>
                            </div>
                        )}
                        {Number(metrics?.settlements || 0) > 0 && (
                            <div className="flex justify-between text-[10px] font-bold">
                                <span className="text-slate-500 uppercase">Delivery</span>
                                <span className="text-slate-300 font-mono">Rs. {Number(metrics.settlements).toLocaleString()}</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.25em] mb-3">Outstanding</p>
                    <h2 className="text-4xl font-black text-white tracking-tight mb-1"><span className="text-slate-600 text-base font-normal mr-1">Rs.</span>{(Number(coaAccounts.find((a: any) => a.code === '2010')?.balance ?? 0) + Number(coaAccounts.find((a: any) => a.code === '2000')?.balance ?? 0)).toLocaleString()}</h2>
                    <p className="text-[10px] text-slate-500 mb-3">Total liabilities pending</p>
                    <div className="pt-3 border-t border-slate-800/70 space-y-1.5">
                        <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-slate-500 uppercase">SVC Payable</span>
                            <span className={`font-mono ${Number(coaAccounts.find((a: any) => a.code === '2010')?.balance ?? 0) > 0 ? 'text-amber-400' : 'text-slate-500'}`}>Rs. {Number(coaAccounts.find((a: any) => a.code === '2010')?.balance ?? 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-slate-500 uppercase">Tax (FBR)</span>
                            <span className={`font-mono ${Number(coaAccounts.find((a: any) => a.code === '2000')?.balance ?? 0) > 0 ? 'text-rose-400' : 'text-slate-500'}`}>Rs. {Number(coaAccounts.find((a: any) => a.code === '2000')?.balance ?? 0).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </div>
                    <div className="flex items-center gap-3 pt-4 border-t border-slate-800/70">
                        <button
                            onClick={() => setShowManualJournalModal(true)}
                            className="px-5 py-2.5 bg-indigo-600/10 border border-indigo-500/30 text-indigo-400 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600/20 hover:text-indigo-300 transition-all flex items-center gap-2"
                        >
                            <FileEdit size={14} strokeWidth={3} /> Post Journal
                        </button>
                        <button
                            onClick={() => setShowTrialBalanceModal(true)}
                            className="px-5 py-2.5 bg-slate-900 border border-slate-800 text-blue-400 rounded-xl font-black text-xs uppercase tracking-widest hover:border-blue-500/40 hover:text-blue-300 transition-all flex items-center gap-2"
                        >
                            <FileText size={14} strokeWidth={3} /> Trial Balance
                        </button>
                        <button
                            onClick={handleViewHistory}
                            className="px-5 py-2.5 bg-slate-900 border border-slate-800 text-slate-400 rounded-xl font-black text-xs uppercase tracking-widest hover:border-slate-600 hover:text-white transition-all flex items-center gap-2"
                        >
                            <History size={14} strokeWidth={3} /> Z-Report
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'accounts' && (
                <div className="space-y-5 animate-in fade-in duration-300">
                    <div className="grid grid-cols-3 gap-5">
                        {[
                            { code: '1000', title: 'Cashier Till' },
                            { code: '1090', title: 'Manager Safe' },
                            { code: '1100', title: 'Bank Account' }
                        ].map(accConfig => {
                            const acc = coaAccounts.find((a: any) => a.code === accConfig.code);
                            const balance = Number(acc?.balance || 0);
                            return (
                                <div 
                                    key={accConfig.code}
                                    onClick={() => {
                                        if (acc) setLedgerAccount({ id: acc.id, code: acc.code, name: acc.name });
                                    }}
                                    className="bg-slate-900 border border-slate-800 rounded-2xl p-6 cursor-pointer hover:border-indigo-500/50 hover:bg-slate-800/50 transition-all group"
                                >
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.25em] mb-3">{accConfig.title}</p>
                                    <h2 className="text-4xl font-black text-white tracking-tight mb-1 group-hover:text-indigo-400 transition-colors">
                                        <span className="text-slate-600 text-base font-normal mr-1">Rs.</span>{balance.toLocaleString()}
                                    </h2>
                                    <p className="text-[10px] text-slate-500">Net GL balance (Acc: {accConfig.code})</p>
                                </div>
                            );
                        })}
                    </div>
                    <div className="grid grid-cols-2 gap-5 mt-2">
                        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex justify-between items-center">
                            <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Supplier Payable (2020)</span>
                            <span className="text-rose-400 font-mono font-bold">Rs. {Number(coaAccounts.find((a: any) => a.code === '2020')?.balance || 0).toLocaleString()}</span>
                        </div>
                        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex justify-between items-center">
                            <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Customer AR (1040)</span>
                            <span className="text-emerald-400 font-mono font-bold">Rs. {Number(coaAccounts.find((a: any) => a.code === '1040')?.balance || 0).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'ledger' && (
                <div className="flex-1 overflow-hidden flex flex-col animate-in fade-in duration-300">
                    {/* Detailed Ledger Section */}
            <div className="flex-1 bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] overflow-hidden flex flex-col">
                <div className="px-8 py-6 border-b border-slate-800/50 bg-[#0B0F19]">
                    <div className="flex flex-col gap-6">
                        {/* Title Row */}
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <History className="text-white" size={20} />
                                <h2 className="text-sm font-black text-white uppercase tracking-widest">Real-time General Ledger</h2>
                                <div className="ml-4 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[10px] font-black text-indigo-400 uppercase tracking-tighter">
                                    {ledger.length} Entries Found
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowCOAModal(true)}
                                    className="text-[10px] font-black text-emerald-400 uppercase tracking-widest hover:text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-lg bg-emerald-500/10"
                                >
                                    COA Setup
                                </button>
                                <button
                                    onClick={handlePrintLedger}
                                    className="flex items-center gap-1.5 text-[10px] font-black text-slate-300 uppercase tracking-widest hover:text-white border border-slate-700 px-3 py-1.5 rounded-lg bg-slate-800"
                                >
                                    <Printer size={12} strokeWidth={3} /> Print
                                </button>
                                <button
                                    onClick={() => {
                                        const query = useRange ? `startDate=${startDate}&endDate=${endDate}` : `date=${selectedDate}`;
                                        window.open(window.location.origin + `/api/accounting/ledger/export?token=${localStorage.getItem('accessToken')}&${query}`, '_blank');
                                    }}
                                    className="text-[10px] font-black text-blue-400 uppercase tracking-widest hover:text-blue-300 px-3 py-1.5"
                                >
                                    CSV
                                </button>
                            </div>
                        </div>

                {/* Filter bar */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {/* Search */}
                            <div className="relative">
                                <PlusCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={13} />
                                <input
                                    type="text"
                                    placeholder="Search transactions..."
                                    value={ledgerSearch}
                                    onChange={e => setLedgerSearch(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-[10px] font-bold text-white outline-none focus:border-indigo-500/50 transition-all"
                                />
                            </div>

                            {/* Transaction type */}
                            <select
                                value={ledgerRefFilter}
                                onChange={e => setLedgerRefFilter(e.target.value)}
                                className="bg-slate-950 border border-slate-800 text-white text-[10px] font-bold uppercase rounded-xl px-4 py-2 outline-none focus:border-indigo-500/50 transition-all appearance-none cursor-pointer"
                            >
                                <option value="">All Types</option>
                                <option value="ORDER">Orders</option>
                                <option value="PAYOUT">Payouts / Expenses</option>
                                <option value="SETTLEMENT">Rider Settlements</option>
                                <option value="MANUAL">Manual Journals</option>
                                <option value="OPENING_BALANCE">Opening Balance</option>
                            </select>

                            {/* In / Out toggle */}
                            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                                {[{ val: '', label: 'All' }, { val: 'DEBIT', label: 'In' }, { val: 'CREDIT', label: 'Out' }].map(t => (
                                    <button
                                        key={t.val}
                                        onClick={() => setLedgerTypeFilter(t.val)}
                                        className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${ledgerTypeFilter === t.val ? 'bg-slate-800 text-white' : 'text-slate-600 hover:text-slate-400'}`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-[10px] font-black uppercase text-slate-500 border-b border-slate-800/50">
                                <th className="px-4 py-3">Time</th>
                                <th className="px-4 py-3">Reference</th>
                                <th className="px-4 py-3">Description</th>
                                <th className="px-4 py-3">Nature</th>
                                <th className="px-4 py-3 text-right">Debit (Dr)</th>
                                <th className="px-4 py-3 text-right">Credit (Cr)</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs font-mono">
                            {ledger.map((entry: any) => (
                                <tr key={entry.id} className={`border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors ${entry.transaction_type === 'CREDIT' && entry.reference_type === 'PAYOUT' ? 'bg-red-500/5' : ''}`}>
                                    <td className="px-4 py-3 text-slate-500 text-[10px]">
                                        {entry.created_at ? formatTime(entry.created_at) : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{entry.reference_type}</span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-400 max-w-[220px] truncate">
                                        {entry.description || (entry.account_name ? `${entry.account_name}` : 'Cash Drawer')}
                                    </td>
                                    <td className={`px-4 py-3 font-black uppercase text-[10px] ${entry.transaction_type === 'DEBIT' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {entry.transaction_type}
                                    </td>
                                    <td className="px-4 py-3 text-right text-emerald-400">
                                        {(entry.debit > 0 || entry.transaction_type === 'DEBIT')
                                            ? `Rs. ${Number(entry.debit || entry.amount || 0).toLocaleString()}`
                                            : <span className="text-slate-700">—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-right text-rose-400">
                                        {(entry.credit > 0 || entry.transaction_type === 'CREDIT')
                                            ? `(Rs. ${Number(entry.credit || entry.amount || 0).toLocaleString()})`
                                            : <span className="text-slate-700">—</span>}
                                    </td>
                                </tr>
                            ))}
                            {ledger.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-10 text-slate-600 italic">
                                        {ledgerAccountFilter ? 'No journal entries for this account on the selected date.' : 'No transactions recorded yet.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
                </div>
            )}

            {activeTab === 'reports' && (
                <div className="animate-in fade-in duration-300">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { title: 'Daily Sales', endpoint: '/api/reports/daily-sales', icon: FileText },
                            { title: 'Tax Liability', endpoint: '/api/reports/tax-liability', icon: FileText },
                            { title: 'Staff', endpoint: '/api/reports/staff-performance', icon: Users },
                            { title: 'Payment Methods', endpoint: '/api/reports/payment-methods', icon: FileText },
                            { title: 'Product Mix', endpoint: '/api/reports/product-mix', icon: FileText },
                            { title: 'Loss Prevention', endpoint: '/api/reports/loss-prevention', icon: ShieldCheck },
                            { title: 'Rider Audit', endpoint: '/api/reports/rider-audit', type: 'rider-audit', icon: FileText },
                        ].map((r: any) => (
                            <button
                                key={r.title}
                                onClick={() => { setPreviewReport(r); handleFetchReport(r.endpoint, r.title); }}
                                className="p-6 bg-slate-900 border border-slate-800 text-slate-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:border-purple-500/40 hover:text-purple-400 transition-all flex flex-col items-center justify-center gap-3 aspect-video"
                            >
                                <r.icon size={20} className="mb-1" />
                                {r.title}
                            </button>
                        ))}
                    </div>
                </div>
            )}

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
                            {payoutData.category === 'SUPPLIER' && (
                                <div className="animate-in slide-in-from-top-2 duration-300">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Select Supplier</label>
                                    <select
                                        value={payoutData.supplierId}
                                        onChange={(e) => setPayoutData({ ...payoutData, supplierId: e.target.value })}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-white outline-none focus:border-gold-500 transition-all"
                                    >
                                        <option value="">Choose Supplier...</option>
                                        {suppliers?.map((s: any) => (
                                            <option key={s.id} value={s.id}>{s.name} (Bal: Rs. {Number(s.balance || 0).toLocaleString()})</option>
                                        ))}
                                    </select>
                                </div>
                            )}
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
                                <button onClick={() => {
                                    setShowPayoutModal(false);
                                    setPayoutData({ amount: '', category: 'EXPENSE', notes: '', supplierId: '' });
                                }} className="flex-1 py-4 bg-slate-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-700 transition-all">Cancel</button>
                                <button 
                                    onClick={handlePayout} 
                                    disabled={payoutData.category === 'SUPPLIER' && !payoutData.supplierId}
                                    className={`flex-1 py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-500 transition-all shadow-xl shadow-red-600/20 disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                    Confirm Payout
                                </button>
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

            {/* Trial Balance Modal */}
            {showTrialBalanceModal && <TrialBalanceModal isOpen={showTrialBalanceModal} onClose={() => setShowTrialBalanceModal(false)} />}

            {/* Manual Journal Entry Modal */}
            {showManualJournalModal && (
                <ManualJournalEntryModal 
                    isOpen={showManualJournalModal} 
                    onClose={() => setShowManualJournalModal(false)} 
                    onSuccess={() => {
                        fetchLedger();
                        fetchCOA();
                    }}
                />
            )}

            {/* Daybook Review Modal */}
            <DaybookReviewModal
                isOpen={showDaybookReviewModal}
                sessionId={activeSession?.id || ''}
                onClose={() => setShowDaybookReviewModal(false)}
                onResolved={() => {
                    fetchLedger();
                    fetchGLStats();
                }}
            />

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
                                        const token = localStorage.getItem('accessToken') || '';
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
                                            {renderPreviewContent(reportData)}
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

            {ledgerAccount && (
                <AccountLedgerModal
                    isOpen={!!ledgerAccount}
                    onClose={() => setLedgerAccount(null)}
                    accountId={ledgerAccount.id}
                    accountCode={ledgerAccount.code}
                    accountName={ledgerAccount.name}
                    dateFrom={useRange ? startDate : selectedDate}
                    dateTo={useRange ? endDate : selectedDate}
                />
            )}
        </div>
    );
};

// Helper for Preview Content Rendering
const renderPreviewContent = (data: any) => {
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
