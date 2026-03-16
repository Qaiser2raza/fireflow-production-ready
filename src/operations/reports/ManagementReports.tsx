import React, { useState, useEffect, useMemo } from 'react';
import {
    BarChart3, TrendingUp, TrendingDown, DollarSign, FileText,
    ShieldAlert, AlertTriangle, Wallet,
    Package, CreditCard, Truck, UtensilsCrossed,
    Clock, Users, ArrowUpRight, ArrowDownRight,
    CheckCircle2, XCircle, FileWarning, RefreshCw
} from 'lucide-react';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════

const fmt = (v: number | string | any) => `Rs. ${Math.round(Number(v || 0)).toLocaleString()}`;
const pct = (v: number | null) => v !== null ? `${v >= 0 ? '+' : ''}${v}%` : '—';

type DatePreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'custom';

function getDateRange(preset: DatePreset): { start: Date; end: Date } {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    switch (preset) {
        case 'today': return { start: todayStart, end: todayEnd };
        case 'yesterday': return { start: new Date(todayStart.getTime() - 86400000), end: new Date(todayEnd.getTime() - 86400000) };
        case 'this_week': {
            const dayOfWeek = todayStart.getDay();
            const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            return { start: new Date(todayStart.getTime() - mondayOffset * 86400000), end: todayEnd };
        }
        case 'this_month': return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: todayEnd };
        case 'last_month': return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
        default: return { start: todayStart, end: todayEnd };
    }
}

// ═══════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════

type ReportView = 'daily_sales' | 'tax_liability' | 'loss_prevention' | 'staff_performance' | 'enhanced_product_mix' | 'payout_expense';

const ManagementReports: React.FC = () => {
    const [activeReport, setActiveReport] = useState<ReportView>('daily_sales');
    const [datePreset, setDatePreset] = useState<DatePreset>('today');
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const dateRange = useMemo(() => getDateRange(datePreset), [datePreset]);

    const fetchReport = async () => {
        setLoading(true);
        setError(null);
        try {
            const endpointMap: Record<ReportView, string> = {
                daily_sales: 'daily-sales',
                tax_liability: 'tax-liability',
                loss_prevention: 'loss-prevention',
                staff_performance: 'staff-performance',
                enhanced_product_mix: 'enhanced-product-mix',
                payout_expense: 'payout-expense',
            };
            const qs = `start=${dateRange.start.toISOString()}&end=${dateRange.end.toISOString()}`;
            const res = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/reports/${endpointMap[activeReport]}?${qs}`);
            const json = await res.json();
            if (json.success) {
                setData(json.data);
            } else {
                setError(json.error || 'Failed to load report');
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchReport(); }, [activeReport, datePreset]);

    const reports = [
        { key: 'daily_sales' as const, label: 'Daily Sales', icon: <TrendingUp size={14} />, color: 'emerald' },
        { key: 'tax_liability' as const, label: 'Tax Liability', icon: <FileText size={14} />, color: 'blue' },
        { key: 'loss_prevention' as const, label: 'Loss Prevention', icon: <ShieldAlert size={14} />, color: 'red' },
        { key: 'staff_performance' as const, label: 'Staff Performance', icon: <Users size={14} />, color: 'purple' },
        { key: 'enhanced_product_mix' as const, label: 'Product Mix', icon: <Package size={14} />, color: 'orange' },
        { key: 'payout_expense' as const, label: 'Payout / Expense', icon: <Wallet size={14} />, color: 'emerald' },
    ];

    const datePresetOptions: { key: DatePreset; label: string }[] = [
        { key: 'today', label: 'Today' },
        { key: 'yesterday', label: 'Yesterday' },
        { key: 'this_week', label: 'This Week' },
        { key: 'this_month', label: 'This Month' },
        { key: 'last_month', label: 'Last Month' },
    ];

    return (
        <div className="flex flex-col h-full bg-slate-950 text-slate-300">
            {/* Header */}
            <div className="shrink-0 px-8 pt-8 pb-4 space-y-4">
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tighter uppercase">Management Reports</h1>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Enterprise Intelligence Dashboard</p>
                    </div>
                    <button
                        onClick={fetchReport}
                        disabled={loading}
                        className="px-4 py-2 bg-slate-800 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:text-white hover:bg-slate-700 transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                </div>

                {/* Report Tabs + Date Filter */}
                <div className="flex justify-between items-center">
                    <div className="flex gap-1">
                        {reports.map(r => (
                            <button
                                key={r.key}
                                onClick={() => setActiveReport(r.key)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeReport === r.key ? 'bg-white text-slate-950 shadow-lg' : 'bg-slate-900 text-slate-500 hover:text-white hover:bg-slate-800'}`}
                            >
                                {r.icon} {r.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-1 bg-slate-900 rounded-xl p-1">
                        {datePresetOptions.map(d => (
                            <button
                                key={d.key}
                                onClick={() => setDatePreset(d.key)}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${datePreset === d.key ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white'}`}
                            >
                                {d.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-8 pb-8">
                {loading && (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-slate-500 animate-pulse font-mono text-xs uppercase tracking-widest">Loading report data...</div>
                    </div>
                )}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-red-400 text-sm font-bold">
                        Error: {error}
                    </div>
                )}
                {!loading && !error && data && (
                    <>
                        {activeReport === 'daily_sales' && <DailySalesView data={data} />}
                        {activeReport === 'tax_liability' && <TaxLiabilityView data={data} />}
                        {activeReport === 'loss_prevention' && <LossPreventionView data={data} />}
                        {activeReport === 'staff_performance' && <StaffPerformanceView data={data} />}
                        {activeReport === 'enhanced_product_mix' && <EnhancedProductMixView data={data} />}
                        {activeReport === 'payout_expense' && <PayoutExpenseView data={data} />}
                    </>
                )}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════
// 1. DAILY SALES REPORT VIEW
// ═══════════════════════════════════════════════════

const DailySalesView: React.FC<{ data: any }> = ({ data }) => {
    const s = data.summary || {};
    const comp = data.comparison || {};

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Big KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    label="Gross Sales"
                    value={fmt(s.gross_sales)}
                    icon={<DollarSign size={18} />}
                    color="emerald"
                    comparison={comp.yesterday?.change_pct}
                    comparisonLabel="vs yesterday"
                    large
                />
                <KPICard
                    label="Net Sales"
                    value={fmt(s.net_sales)}
                    icon={<TrendingUp size={18} />}
                    color="blue"
                    subtitle={`-${fmt(s.total_discounts)} discounts`}
                />
                <KPICard
                    label="Orders"
                    value={String(s.order_count || 0)}
                    icon={<Package size={18} />}
                    color="purple"
                    subtitle={`Avg ${fmt(s.avg_ticket)}`}
                />
                <KPICard
                    label="Vs Last Week"
                    value={pct(comp.last_week?.change_pct)}
                    icon={comp.last_week?.change_pct >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                    color={comp.last_week?.change_pct >= 0 ? 'emerald' : 'red'}
                    subtitle={`${fmt(comp.last_week?.gross_sales)} / ${comp.last_week?.order_count} orders`}
                />
            </div>

            {/* Tax, SC, Delivery Row */}
            <div className="grid grid-cols-3 gap-4">
                <MiniStat label="Tax Collected" value={fmt(s.total_tax)} />
                <MiniStat label="Service Charges" value={fmt(s.total_service_charge)} />
                <MiniStat label="Delivery Fees" value={fmt(s.total_delivery_fees)} />
            </div>

            {/* Payment Methods + Order Types */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Payment Methods */}
                <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                    <SectionTitle icon={<CreditCard size={14} />} title="Payment Methods" />
                    <div className="space-y-3 mt-4">
                        {Object.entries(data.payment_methods || {}).map(([method, val]: [string, any]) => {
                            const total = Number(s.gross_sales);
                            const p = total > 0 ? Math.round((Number(val) / total) * 100) : 0;
                            return (
                                <div key={method}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="font-bold text-slate-300 uppercase">{method}</span>
                                        <div className="flex gap-3">
                                            <span className="text-slate-500">{p}%</span>
                                            <span className="font-mono font-bold text-white">{fmt(val)}</span>
                                        </div>
                                    </div>
                                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${p}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Order Types */}
                <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                    <SectionTitle icon={<UtensilsCrossed size={14} />} title="Order Type Split" />
                    <div className="grid grid-cols-3 gap-3 mt-4">
                        {Object.entries(data.order_types || {}).map(([type, d]: [string, any]) => {
                            const icons: Record<string, React.ReactNode> = {
                                DINE_IN: <UtensilsCrossed size={20} />,
                                TAKEAWAY: <Package size={20} />,
                                DELIVERY: <Truck size={20} />,
                            };
                            return (
                                <div key={type} className="bg-slate-950/60 rounded-2xl p-4 text-center border border-slate-800/40">
                                    <div className="text-slate-400 flex justify-center mb-2">{icons[type] || <Package size={20} />}</div>
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{type.replace('_', ' ')}</p>
                                    <p className="text-lg font-black text-white mt-1">{fmt(d.revenue)}</p>
                                    <p className="text-[10px] text-emerald-500 font-bold">{d.count} orders</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Hourly Bar Chart */}
            <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                <SectionTitle icon={<Clock size={14} />} title="Hourly Sales Distribution" />
                <div className="flex items-end gap-1 h-32 mt-4">
                    {Array.from({ length: 24 }, (_, h) => {
                        const d = data.hourly_data?.[h];
                        const count = d?.count || 0;
                        const rev = Number(d?.revenue || 0);
                        const maxRev = Math.max(...Object.values(data.hourly_data || {}).map((v: any) => Number(v.revenue || 0)), 1);
                        const heightPct = Math.max(3, (rev / maxRev) * 100);
                        return (
                            <div key={h} className="flex-1 group relative flex flex-col items-center justify-end h-full">
                                {count > 0 && (
                                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-slate-800 rounded-lg px-2 py-1 text-center pointer-events-none z-10 whitespace-nowrap transition-opacity">
                                        <p className="text-[8px] font-black text-white">{count} orders</p>
                                        <p className="text-[8px] text-emerald-400 font-mono">{fmt(rev)}</p>
                                    </div>
                                )}
                                <div
                                    className={`w-full rounded-t transition-all ${count > 0 ? 'bg-emerald-500/60 group-hover:bg-emerald-400' : 'bg-slate-800/50'}`}
                                    style={{ height: `${heightPct}%` }}
                                />
                                <p className="text-[7px] text-slate-600 mt-1 font-black">{h}</p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════
// 2. TAX LIABILITY VIEW
// ═══════════════════════════════════════════════════

const TaxLiabilityView: React.FC<{ data: any }> = ({ data }) => {
    const s = data.summary || {};
    const rest = data.restaurant || {};
    const fbr = data.fbr_sync_status || {};

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Restaurant FBR Header */}
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-3xl p-6 flex justify-between items-center">
                <div>
                    <p className="text-xs font-bold text-blue-400 uppercase">{rest.name}</p>
                    <p className="text-[10px] text-slate-500 mt-1">NTN: <span className="text-white font-mono">{rest.ntn || 'Not Set'}</span></p>
                    <p className="text-[10px] text-slate-500">FBR POS ID: <span className="text-white font-mono">{rest.fbr_pos_id || 'Not Configured'}</span></p>
                </div>
                <div className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border ${rest.fbr_enabled ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                    {rest.fbr_enabled ? '● FBR Active' : '○ FBR Inactive'}
                </div>
            </div>

            {/* Big Numbers */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard label="Total Tax Collected" value={fmt(s.total_tax_collected)} icon={<DollarSign size={18} />} color="emerald" large />
                <KPICard label="Taxable Revenue" value={fmt(s.taxable_revenue)} icon={<TrendingUp size={18} />} color="blue" />
                <KPICard label="Effective Rate" value={`${s.effective_tax_rate}%`} icon={<BarChart3 size={18} />} color="purple" subtitle={`Configured: ${rest.configured_tax_rate}%`} />
                <KPICard label="FBR Compliance" value={`${data.fbr_compliance_rate || 0}%`} icon={<CheckCircle2 size={18} />} color={data.fbr_compliance_rate >= 95 ? 'emerald' : 'red'} />
            </div>

            {/* Tax Split */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-900/50 rounded-2xl p-5 border border-slate-800/50 text-center">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Exclusive Tax</p>
                    <p className="text-xl font-black text-emerald-400">{fmt(s.tax_exclusive)}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{s.exclusive_order_count} orders</p>
                </div>
                <div className="bg-slate-900/50 rounded-2xl p-5 border border-slate-800/50 text-center">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Inclusive Tax</p>
                    <p className="text-xl font-black text-blue-400">{fmt(s.tax_inclusive)}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{s.inclusive_order_count} orders</p>
                </div>
                <div className="bg-slate-900/50 rounded-2xl p-5 border border-slate-800/50 text-center">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Tax Exempt</p>
                    <p className="text-xl font-black text-orange-400">{fmt(s.exempt_total)}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{s.exempt_order_count} orders</p>
                </div>
            </div>

            {/* Tax by Order Type + FBR Sync */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                    <SectionTitle icon={<UtensilsCrossed size={14} />} title="Tax by Order Type" />
                    <div className="space-y-3 mt-4">
                        {Object.entries(data.tax_by_order_type || {}).map(([type, val]: [string, any]) => (
                            <div key={type} className="flex justify-between items-center bg-slate-950/50 p-3 rounded-xl">
                                <span className="text-xs font-bold text-slate-300 uppercase">{type.replace('_', ' ')}</span>
                                <span className="text-xs font-mono font-bold text-emerald-400">{fmt(val)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                    <SectionTitle icon={<CheckCircle2 size={14} />} title="FBR Sync Status" />
                    <div className="space-y-3 mt-4">
                        {Object.entries(fbr).map(([status, count]: [string, any]) => {
                            const colors: Record<string, string> = {
                                SYNCED: 'text-emerald-400',
                                PENDING: 'text-yellow-400',
                                FAILED: 'text-red-400',
                                NOT_APPLICABLE: 'text-slate-500',
                            };
                            return (
                                <div key={status} className="flex justify-between items-center bg-slate-950/50 p-3 rounded-xl">
                                    <span className={`text-xs font-bold uppercase ${colors[status] || 'text-slate-400'}`}>{status.replace('_', ' ')}</span>
                                    <span className="text-sm font-black text-white">{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════
// 3. LOSS PREVENTION VIEW
// ═══════════════════════════════════════════════════

const LossPreventionView: React.FC<{ data: any }> = ({ data }) => {
    const s = data.summary || {};
    const alerts = data.alerts || [];

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Alerts Banner */}
            {alerts.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-3xl p-6 space-y-2">
                    <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle size={16} className="text-red-500" />
                        <span className="text-xs font-black text-red-400 uppercase tracking-widest">Security Alerts ({alerts.length})</span>
                    </div>
                    {alerts.map((a: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-red-300 bg-red-500/5 rounded-xl p-3">
                            <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                            {a}
                        </div>
                    ))}
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard label="Exception Rate" value={`${s.exception_rate}%`} icon={<ShieldAlert size={18} />} color={Number(s.exception_rate) > 5 ? 'red' : 'emerald'} subtitle="Threshold: <5%" large />
                <KPICard label="Total Lost Value" value={fmt(s.total_lost_value)} icon={<DollarSign size={18} />} color="red" />
                <KPICard label="Voids" value={String(s.voided_count || 0)} icon={<FileWarning size={18} />} color="orange" subtitle={fmt(s.voided_value)} />
                <KPICard label="Cancellations" value={String(s.cancelled_count || 0)} icon={<XCircle size={18} />} color="red" subtitle={fmt(s.cancelled_value)} />
            </div>

            {/* Staff Analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Voids by Staff */}
                <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                    <SectionTitle icon={<Users size={14} />} title="Voids by Staff" />
                    <div className="space-y-2 mt-4">
                        {(data.voids?.by_staff || []).length === 0 && <EmptyState text="No voids recorded" />}
                        {(data.voids?.by_staff || []).map((s: any, i: number) => (
                            <div key={i} className="flex justify-between items-center bg-slate-950/50 p-3 rounded-xl">
                                <div>
                                    <p className="text-xs font-bold text-white">{s.name}</p>
                                    <p className="text-[9px] text-slate-500 uppercase">{s.role}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-mono font-bold text-orange-400">{s.count} voids</p>
                                    <p className="text-[10px] text-slate-500">{fmt(s.value)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Cancellations by Staff */}
                <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                    <SectionTitle icon={<Users size={14} />} title="Cancellations by Staff" />
                    <div className="space-y-2 mt-4">
                        {(data.cancellations?.by_staff || []).length === 0 && <EmptyState text="No cancellations recorded" />}
                        {(data.cancellations?.by_staff || []).map((s: any, i: number) => (
                            <div key={i} className="flex justify-between items-center bg-slate-950/50 p-3 rounded-xl">
                                <div>
                                    <p className="text-xs font-bold text-white">{s.name}</p>
                                    <p className="text-[9px] text-slate-500 uppercase">{s.role}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-mono font-bold text-red-400">{s.count} cancels</p>
                                    <p className="text-[10px] text-slate-500">{fmt(s.value)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Reason Breakdowns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                    <SectionTitle icon={<FileWarning size={14} />} title="Void Reasons" />
                    <div className="space-y-2 mt-4">
                        {Object.entries(data.voids?.by_reason || {}).map(([reason, count]: [string, any]) => (
                            <div key={reason} className="flex justify-between items-center">
                                <span className="text-xs text-slate-300">{reason}</span>
                                <span className="text-xs font-black text-white bg-slate-800 px-2 py-1 rounded-lg">{count}</span>
                            </div>
                        ))}
                        {Object.keys(data.voids?.by_reason || {}).length === 0 && <EmptyState text="No data" />}
                    </div>
                </div>

                <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                    <SectionTitle icon={<XCircle size={14} />} title="Cancellation Reasons" />
                    <div className="space-y-2 mt-4">
                        {Object.entries(data.cancellations?.by_reason || {}).map(([reason, count]: [string, any]) => (
                            <div key={reason} className="flex justify-between items-center">
                                <span className="text-xs text-slate-300">{reason}</span>
                                <span className="text-xs font-black text-white bg-slate-800 px-2 py-1 rounded-lg">{count}</span>
                            </div>
                        ))}
                        {Object.keys(data.cancellations?.by_reason || {}).length === 0 && <EmptyState text="No data" />}
                    </div>
                </div>
            </div>

            {/* Void Time Pattern */}
            {Object.keys(data.voids?.by_hour || {}).length > 0 && (
                <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                    <SectionTitle icon={<Clock size={14} />} title="Void Time Pattern" />
                    <p className="text-[10px] text-slate-500 mb-3">Late-night void clusters may indicate suspicious activity</p>
                    <div className="flex items-end gap-1 h-24 mt-2">
                        {Array.from({ length: 24 }, (_, h) => {
                            const count = data.voids?.by_hour?.[h] || 0;
                            const maxCount = Math.max(...Object.values(data.voids?.by_hour || {}).map((v: any) => Number(v)), 1);
                            const heightPct = Math.max(3, (count / maxCount) * 100);
                            const isLateNight = h >= 22 || h <= 5;
                            return (
                                <div key={h} className="flex-1 group relative flex flex-col items-center justify-end h-full">
                                    <div
                                        className={`w-full rounded-t transition-all ${count > 0 ? (isLateNight ? 'bg-red-500 group-hover:bg-red-400' : 'bg-orange-500/60 group-hover:bg-orange-400') : 'bg-slate-800/50'}`}
                                        style={{ height: `${heightPct}%` }}
                                    />
                                    <p className={`text-[7px] mt-1 font-black ${isLateNight ? 'text-red-500' : 'text-slate-600'}`}>{h}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Recent Events Table */}
            {(data.recent_voids || []).length > 0 && (
                <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                    <SectionTitle icon={<FileWarning size={14} />} title="Recent Void Log" />
                    <div className="overflow-x-auto mt-4">
                        <table className="w-full text-xs text-left">
                            <thead>
                                <tr className="text-[9px] font-black uppercase text-slate-500 border-b border-slate-800">
                                    <th className="px-3 py-2">Order</th>
                                    <th className="px-3 py-2">Type</th>
                                    <th className="px-3 py-2">Staff</th>
                                    <th className="px-3 py-2">Reason</th>
                                    <th className="px-3 py-2 text-right">Value</th>
                                </tr>
                            </thead>
                            <tbody className="font-mono">
                                {data.recent_voids.map((v: any, i: number) => (
                                    <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                                        <td className="px-3 py-2.5 text-white font-bold">{v.order_number || '—'}</td>
                                        <td className="px-3 py-2.5 text-slate-400 uppercase">{v.type}</td>
                                        <td className="px-3 py-2.5 text-slate-300">{v.staff}</td>
                                        <td className="px-3 py-2.5 text-orange-400">{v.reason || '—'}</td>
                                        <td className="px-3 py-2.5 text-right text-red-400 font-bold">{fmt(v.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ═══════════════════════════════════════════════════

const KPICard: React.FC<{
    label: string; value: string; icon: React.ReactNode;
    color: string; subtitle?: string; comparison?: number | null;
    comparisonLabel?: string; large?: boolean;
}> = ({ label, value, icon, color, subtitle, comparison, comparisonLabel, large }) => {
    const colorMap: Record<string, string> = {
        emerald: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
        red: 'bg-red-500/10 text-red-500 border-red-500/20',
        purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
        orange: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    };
    return (
        <div className={`bg-slate-900/50 rounded-3xl border border-slate-800/50 p-5 ${large ? 'col-span-2 lg:col-span-1' : ''}`}>
            <div className="flex justify-between items-start mb-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${colorMap[color] || colorMap.blue}`}>{icon}</div>
                {comparison !== null && comparison !== undefined && (
                    <div className={`flex items-center gap-1 text-[10px] font-black ${comparison >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {comparison >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                        {pct(comparison)} <span className="text-slate-600">{comparisonLabel}</span>
                    </div>
                )}
            </div>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
            <p className={`${large ? 'text-3xl' : 'text-xl'} font-black text-white tracking-tight`}>{value}</p>
            {subtitle && <p className="text-[10px] text-slate-500 mt-1">{subtitle}</p>}
        </div>
    );
};

const MiniStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="bg-slate-900/40 rounded-2xl p-4 border border-slate-800/50">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-lg font-black text-white">{value}</p>
    </div>
);

const SectionTitle: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
    <div className="flex items-center gap-2">
        <span className="text-slate-400">{icon}</span>
        <h3 className="text-[10px] font-black text-white uppercase tracking-widest">{title}</h3>
    </div>
);

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
    <p className="text-center py-4 text-slate-600 italic text-xs">{text}</p>
);

// ═══════════════════════════════════════════════════
// 4. STAFF PERFORMANCE VIEW
// ═══════════════════════════════════════════════════

const StaffPerformanceView: React.FC<{ data: any }> = ({ data }) => {
    const s = data.summary || {};

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* KPI Cards */}
            <div className="grid grid-cols-3 gap-4">
                <KPICard label="Active Waiters" value={String(s.total_waiters_active || 0)} icon={<Users size={18} />} color="emerald" />
                <KPICard label="Active Cashiers" value={String(s.total_cashiers_active || 0)} icon={<Users size={18} />} color="blue" />
                <KPICard label="Active Riders" value={String(s.total_riders_active || 0)} icon={<Truck size={18} />} color="orange" />
            </div>

            {/* Waiter Leaderboard */}
            {(data.waiters || []).length > 0 && (
                <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                    <SectionTitle icon={<UtensilsCrossed size={14} />} title="Waiter Performance" />
                    <div className="overflow-x-auto mt-4">
                        <table className="w-full text-xs text-left">
                            <thead>
                                <tr className="text-[9px] font-black uppercase text-slate-500 border-b border-slate-800">
                                    <th className="px-3 py-2">Staff Member</th>
                                    <th className="px-3 py-2 text-right">Tables/Orders</th>
                                    <th className="px-3 py-2 text-right">Avg Order</th>
                                    <th className="px-3 py-2 text-right">Revenue Generated</th>
                                </tr>
                            </thead>
                            <tbody className="font-mono">
                                {data.waiters.map((w: any, i: number) => (
                                    <tr key={i} className="border-b border-slate-800/20 hover:bg-slate-800/20">
                                        <td className="px-3 py-2.5 text-white font-bold">{w.name}</td>
                                        <td className="px-3 py-2.5 text-right font-bold text-slate-300">{w.orders}</td>
                                        <td className="px-3 py-2.5 text-right text-slate-400">{fmt(w.avg_order)}</td>
                                        <td className="px-3 py-2.5 text-right text-emerald-400 font-bold">{fmt(w.revenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Rider Leaderboard */}
                {(data.riders || []).length > 0 && (
                    <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                        <SectionTitle icon={<Truck size={14} />} title="Rider Leaderboard" />
                        <div className="space-y-2 mt-4">
                            {data.riders.map((r: any, i: number) => (
                                <div key={i} className="flex justify-between items-center bg-slate-950/50 p-3 rounded-xl border border-slate-800/30">
                                    <div>
                                        <p className="text-xs font-bold text-white">{r.name}</p>
                                        <p className="text-[9px] text-slate-500 font-mono mt-0.5">{r.deliveries} deliveries</p>
                                    </div>
                                    <p className="text-xs font-mono font-bold text-orange-400">{fmt(r.revenue)}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Cashier Leaderboard */}
                {(data.cashiers || []).length > 0 && (
                    <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                        <SectionTitle icon={<CreditCard size={14} />} title="Cashier Operations" />
                        <div className="space-y-2 mt-4">
                            {data.cashiers.map((c: any, i: number) => (
                                <div key={i} className="flex justify-between items-center bg-slate-950/50 p-3 rounded-xl border border-slate-800/30">
                                    <div>
                                        <p className="text-xs font-bold text-white">{c.name}</p>
                                        <p className="text-[9px] text-slate-500 mt-0.5">{c.role} • {c.processed_orders} processed</p>
                                    </div>
                                    <p className="text-xs font-mono font-bold text-blue-400">{fmt(c.revenue_handled)}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════
// 5. ENHANCED PRODUCT MIX VIEW
// ═══════════════════════════════════════════════════

const EnhancedProductMixView: React.FC<{ data: any }> = ({ data }) => {
    const s = data.summary || {};

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="grid grid-cols-3 gap-4">
                <KPICard label="Total Items Sold" value={String(s.total_items_sold || 0)} icon={<Package size={18} />} color="blue" />
                <KPICard label="Unique Items Sold" value={String(s.unique_items_sold || 0)} icon={<BarChart3 size={18} />} color="emerald" />
                <KPICard label="Total Merch Revenue" value={fmt(s.total_revenue || 0)} icon={<DollarSign size={18} />} color="purple" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top 10 Best Sellers */}
                <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                    <SectionTitle icon={<TrendingUp size={14} className="text-emerald-500" />} title="Top 10 Best Sellers" />
                    <div className="space-y-2 mt-4">
                        {(data.top_10 || []).map((item: any, i: number) => (
                            <div key={i} className="flex items-center justify-between p-2 hover:bg-slate-800/30 rounded-lg transition-colors">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-slate-600 w-4">{i + 1}</span>
                                    <div>
                                        <p className="text-xs font-bold text-white">{item.name}</p>
                                        <p className="text-[9px] text-slate-500 uppercase">{item.quantity} sold</p>
                                    </div>
                                </div>
                                <p className="text-xs font-mono font-bold text-emerald-400">{fmt(item.revenue)}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bottom 10 Worst Sellers */}
                <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                    <SectionTitle icon={<TrendingDown size={14} className="text-red-500" />} title="Bottom 10 (Action Required)" />
                    <div className="space-y-2 mt-4">
                        {(data.bottom_10 || []).map((item: any, i: number) => (
                            <div key={i} className="flex items-center justify-between p-2 hover:bg-slate-800/30 rounded-lg transition-colors">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-slate-600 w-4">{i + 1}</span>
                                    <div>
                                        <p className="text-xs font-bold text-white max-w-[120px] truncate" title={item.name}>{item.name}</p>
                                        <p className="text-[9px] text-slate-500 uppercase">{item.quantity} sold</p>
                                    </div>
                                </div>
                                <p className="text-xs font-mono font-bold text-orange-400">{fmt(item.revenue)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Pareto Analysis */}
            <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                <SectionTitle icon={<BarChart3 size={14} />} title="Pareto Analysis (80/20 Rule)" />
                <p className="text-[10px] text-slate-500 mt-1 mb-4">Focus on your 'Pareto Champions' — the top 20% of your menu items that drive the majority of revenue.</p>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                        <thead>
                            <tr className="text-[9px] font-black uppercase text-slate-500 border-b border-slate-800">
                                <th className="px-3 py-2">Item</th>
                                <th className="px-3 py-2 text-right">Qty</th>
                                <th className="px-3 py-2 text-right">Revenue</th>
                                <th className="px-3 py-2 text-right">% of Total</th>
                                <th className="px-3 py-2 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono">
                            {(data.pareto || []).slice(0, 30).map((item: any, i: number) => (
                                <tr key={i} className={`border-b border-slate-800/20 hover:bg-slate-800/20 ${item.is_pareto_champion ? 'bg-emerald-500/5' : ''}`}>
                                    <td className="px-3 py-2.5 text-white font-bold">{item.name}</td>
                                    <td className="px-3 py-2.5 text-right font-bold text-slate-300">{item.quantity}</td>
                                    <td className="px-3 py-2.5 text-right text-emerald-400 font-bold">{fmt(item.revenue)}</td>
                                    <td className="px-3 py-2.5 text-right text-slate-400">{item.pct_of_revenue.toFixed(1)}%</td>
                                    <td className="px-3 py-2.5 text-right">
                                        {item.is_pareto_champion && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-black uppercase">Champion</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {(data.pareto || []).length > 30 && <p className="text-center text-xs text-slate-500 mt-4 italic">+{(data.pareto.length - 30)} more items hidden</p>}
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════
// 6. PAYOUT & EXPENSE VIEW
// ═══════════════════════════════════════════════════

const PayoutExpenseView: React.FC<{ data: any }> = ({ data }) => {
    const s = data.summary || {};

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard label="Total Outflow" value={fmt(s.total_cash_outflow || 0)} icon={<Wallet size={18} />} color="orange" large />
                <KPICard label="Total Payouts" value={fmt(s.total_payouts_volume || 0)} icon={<CreditCard size={18} />} color="blue" subtitle={`${s.payout_count} manual payouts`} />
                <KPICard label="Total Expenses" value={fmt(s.total_expenses_volume || 0)} icon={<FileText size={18} />} color="purple" subtitle={`${s.expense_count} logged expenses`} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Expense by Category */}
                <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                    <SectionTitle icon={<Package size={14} />} title="Outflow by Category" />
                    <div className="space-y-3 mt-4">
                        {(data.expense_by_category || []).map((cat: any, i: number) => {
                            const p = s.total_cash_outflow > 0 ? (cat.amount / s.total_cash_outflow) * 100 : 0;
                            return (
                                <div key={i}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="font-bold text-slate-300 uppercase">{cat.name}</span>
                                        <div className="flex gap-3">
                                            <span className="text-slate-500">{Math.round(p)}%</span>
                                            <span className="font-mono font-bold text-white">{fmt(cat.amount)}</span>
                                        </div>
                                    </div>
                                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${p}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                        {(data.expense_by_category || []).length === 0 && <EmptyState text="No expenses recorded" />}
                    </div>
                </div>

                {/* Expense by Staff */}
                <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                    <SectionTitle icon={<Users size={14} />} title="Processed By" />
                    <div className="space-y-2 mt-4">
                        {(data.expense_by_staff || []).map((staff: any, i: number) => (
                            <div key={i} className="flex justify-between items-center bg-slate-950/50 p-3 rounded-xl border border-slate-800/30">
                                <p className="text-xs font-bold text-white">{staff.name}</p>
                                <p className="text-xs font-mono font-bold text-blue-400">{fmt(staff.amount)}</p>
                            </div>
                        ))}
                        {(data.expense_by_staff || []).length === 0 && <EmptyState text="No staff data" />}
                    </div>
                </div>
            </div>

            {/* Recent Log Table */}
            <div className="bg-slate-900/50 rounded-3xl border border-slate-800/50 p-6">
                <SectionTitle icon={<FileWarning size={14} />} title="Recent Outflow Log" />
                <div className="overflow-x-auto mt-4">
                    <table className="w-full text-xs text-left">
                        <thead>
                            <tr className="text-[9px] font-black uppercase text-slate-500 border-b border-slate-800">
                                <th className="px-3 py-2">Date / Time</th>
                                <th className="px-3 py-2">Type</th>
                                <th className="px-3 py-2">Category</th>
                                <th className="px-3 py-2">Notes</th>
                                <th className="px-3 py-2 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono">
                            {(data.recent_transactions || []).map((t: any, i: number) => (
                                <tr key={i} className="border-b border-slate-800/20 hover:bg-slate-800/20">
                                    <td className="px-3 py-2.5 text-slate-400">{new Date(t.date).toLocaleString()}</td>
                                    <td className="px-3 py-2.5">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-widest ${t.type === 'PAYOUT' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
                                            {t.type}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-slate-300 uppercase font-black">{t.category}</td>
                                    <td className="px-3 py-2.5 text-slate-500">{t.notes || '—'}</td>
                                    <td className="px-3 py-2.5 text-right text-orange-400 font-bold">{fmt(t.amount)}</td>
                                </tr>
                            ))}
                            {(data.recent_transactions || []).length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-3 py-8 text-center text-slate-500">No recent transactions</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ManagementReports;
