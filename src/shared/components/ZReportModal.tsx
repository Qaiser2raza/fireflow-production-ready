import React, { useRef, useState } from 'react';
import {
    X, Printer, TrendingUp, Wallet, Package, CreditCard,
    Clock, ShieldAlert, ArrowUpRight, ArrowDownLeft,
    AlertTriangle, CheckCircle2, Users, Truck, UtensilsCrossed,
    History, BarChart3, Banknote, FileWarning
} from 'lucide-react';

interface ZReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    report: any;
}

const formatCurrency = (val: number | string | any) =>
    `Rs. ${Math.round(Number(val)).toLocaleString()}`;

const formatTime = (d: string | Date) =>
    new Date(d).toLocaleString('en-PK', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
    });

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string }> = ({ icon, title, subtitle }) => (
    <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400">
            {icon}
        </div>
        <div>
            <h3 className="text-[11px] font-black text-white uppercase tracking-widest">{title}</h3>
            {subtitle && <p className="text-[9px] text-slate-600 uppercase tracking-widest">{subtitle}</p>}
        </div>
    </div>
);

export const ZReportModal: React.FC<ZReportModalProps> = ({ isOpen, onClose, report }) => {
    const printRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'breakdown' | 'security' | 'velocity'>('overview');

    if (!isOpen || !report) return null;

    const meta = report.metadata || {};
    const summary = report.summary || {};
    const cashFlow = report.cash_flow || {};
    const voidSummary = report.void_summary || { count: 0, total_value: 0 };
    const cancelSummary = report.cancel_summary || { count: 0, total_value: 0 };
    const payoutsBreakdown = report.payouts_breakdown || {};
    const orderTypes = report.order_types || {};
    const hourlyVelocity = report.hourly_velocity || {};

    const variance = Number(meta.variance || 0);
    const varianceIsPositive = variance >= 0;
    const hasVariance = Math.abs(variance) > 0;

    const peakHour = Object.entries(hourlyVelocity).sort(([, a]: any, [, b]: any) => Number(b.count) - Number(a.count))[0];

    const handlePrint = () => {
        const content = printRef.current?.innerHTML;
        if (!content) return;
        const w = window.open('', '_blank', 'width=480,height=900');
        if (!w) return;
        w.document.write(`<!DOCTYPE html><html><head>
            <title>Z-Report — ${meta.id?.slice(-8).toUpperCase()}</title>
            <style>
                * { margin:0; padding:0; box-sizing:border-box; }
                body { font-family:'Courier New',monospace; font-size:11px; color:#000; background:#fff; padding:16px; }
                .z-print { max-width: 380px; margin: 0 auto; }
                h1 { font-size:16px; font-weight:900; text-transform:uppercase; text-align:center; letter-spacing:-0.5px; margin-bottom:4px; }
                .center { text-align:center; }
                .row { display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px dashed #ccc; }
                .row.bold { font-weight:900; }
                .row.total { border-top:2px solid #000; border-bottom:3px double #000; font-size:14px; font-weight:900; margin-top:4px; padding:6px 0; }
                .section { margin: 12px 0; }
                .section-title { font-size:9px; font-weight:900; text-transform:uppercase; letter-spacing:0.15em; border-bottom:2px solid #000; padding-bottom:3px; margin-bottom:6px; }
                .tag { border:1px solid #000; padding:2px 6px; font-weight:900; text-transform:uppercase; font-size:9px; }
                .alert { border:2px solid #000; padding:6px; text-align:center; font-weight:900; text-transform:uppercase; font-size:10px; margin:8px 0; }
                .divider { border-top:1px dashed #000; margin:8px 0; }
            </style>
        </head><body><div class="z-print">${content}</div></body></html>`);
        w.document.close();
        w.print();
    };

    return (
        <div className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-[#0B0F19] rounded-[2rem] border border-slate-800 shadow-2xl overflow-hidden w-full max-w-4xl flex flex-col max-h-[95vh]">

                {/* Header */}
                <div className="bg-slate-900/80 px-8 py-5 border-b border-slate-800/70 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                            <BarChart3 className="text-emerald-500" size={18} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white tracking-tighter uppercase">Z-Report</h2>
                            <p className="text-[10px] text-slate-500 font-mono uppercase">
                                Session {meta.id?.slice(-8).toUpperCase()} &bull; {meta.status}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handlePrint}
                            className="px-4 py-2 bg-slate-800 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all flex items-center gap-2"
                        >
                            <Printer size={14} strokeWidth={3} /> Print
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl text-slate-500 transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Tab Bar */}
                <div className="flex gap-1 px-8 pt-4 shrink-0">
                    {([
                        { key: 'overview', label: 'Overview', icon: <TrendingUp size={12} /> },
                        { key: 'breakdown', label: 'Breakdown', icon: <Package size={12} /> },
                        { key: 'velocity', label: 'Velocity', icon: <BarChart3 size={12} /> },
                        { key: 'security', label: 'Security', icon: <ShieldAlert size={12} /> },
                    ] as const).map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === tab.key ? 'bg-white text-slate-950' : 'bg-slate-800/50 text-slate-500 hover:text-white hover:bg-slate-800'}`}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar" ref={printRef}>

                    {/* Session Info Strip — always visible */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                            { label: 'Opened By', value: meta.opened_by || '—', icon: <Users size={12} /> },
                            { label: 'Closed By', value: meta.closed_by || '—', icon: <Users size={12} /> },
                            { label: 'Duration', value: meta.duration_minutes ? `${meta.duration_minutes} min` : '—', icon: <Clock size={12} /> },
                            { label: 'Session ID', value: meta.id?.slice(-8).toUpperCase() || '—', icon: <History size={12} /> },
                        ].map((s) => (
                            <div key={s.label} className="bg-slate-900/60 rounded-2xl p-4 border border-slate-800/50">
                                <div className="flex items-center gap-2 text-slate-500 mb-1">
                                    {s.icon}
                                    <span className="text-[9px] font-black uppercase tracking-widest">{s.label}</span>
                                </div>
                                <p className="text-sm font-black text-white font-mono truncate">{s.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Time Strip */}
                    <div className="flex gap-4 text-[10px] text-slate-500 font-mono">
                        <span>▶ Opened: <span className="text-white">{meta.opened_at ? formatTime(meta.opened_at) : '—'}</span></span>
                        {meta.closed_at && <span>⏹ Closed: <span className="text-white">{formatTime(meta.closed_at)}</span></span>}
                    </div>

                    {/* === OVERVIEW TAB === */}
                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            {/* Big Sales Numbers */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="col-span-2 bg-gradient-to-br from-emerald-900/30 to-slate-900 border border-emerald-500/20 rounded-3xl p-6">
                                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">Gross Sales</p>
                                    <h3 className="text-4xl font-black text-white tracking-tighter">
                                        {formatCurrency(summary.gross_sales)}
                                    </h3>
                                    <p className="text-[10px] text-slate-500 mt-2 font-bold">
                                        {summary.order_count} orders &bull; Avg {formatCurrency(summary.avg_order_value)}
                                    </p>
                                </div>

                                <div className={`rounded-3xl p-6 border ${varianceIsPositive || !hasVariance ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/10 border-red-500/30'}`}>
                                    <p className="text-[10px] font-black uppercase tracking-widest mb-2 text-slate-400">Cash Variance</p>
                                    <h3 className={`text-2xl font-black ${hasVariance ? (varianceIsPositive ? 'text-emerald-400' : 'text-red-400') : 'text-white'}`}>
                                        {varianceIsPositive ? '+' : ''}{formatCurrency(variance)}
                                    </h3>
                                    <p className="text-[10px] mt-2 font-bold text-slate-500">
                                        {!hasVariance ? '✓ Perfect Balance' : varianceIsPositive ? '▲ Overage' : '▼ Shortage'}
                                    </p>
                                </div>

                                <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Net Sales</p>
                                    <h3 className="text-2xl font-black text-white">{formatCurrency(summary.net_sales)}</h3>
                                    <p className="text-[10px] mt-2 font-bold text-red-400">-{formatCurrency(summary.total_discounts)} discounts</p>
                                </div>
                            </div>

                            {/* Tax & Fees Summary */}
                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { label: 'Tax Collected', value: summary.total_tax, color: 'text-gold-400' },
                                    { label: 'Service Charge', value: summary.total_sc, color: 'text-purple-400' },
                                    { label: 'Delivery Fees', value: summary.total_delivery_fees, color: 'text-blue-400' },
                                ].map(s => (
                                    <div key={s.label} className="bg-slate-900/40 rounded-2xl p-4 border border-slate-800/50">
                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{s.label}</p>
                                        <p className={`text-lg font-black ${s.color}`}>{formatCurrency(s.value)}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Payment Methods */}
                            <div className="bg-slate-900/40 rounded-3xl border border-slate-800/50 p-6">
                                <SectionHeader icon={<CreditCard size={14} />} title="Payment Channels" subtitle="Total collected by method" />
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {Object.entries(report.payment_methods || {}).map(([method, val]: [string, any]) => {
                                        const methodIcons: Record<string, React.ReactNode> = {
                                            CASH: <Banknote size={16} />,
                                            CARD: <CreditCard size={16} />,
                                            RAAST: <Wallet size={16} />,
                                        };
                                        return (
                                            <div key={method} className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/40 text-center">
                                                <div className="text-emerald-500 flex justify-center mb-2">{methodIcons[method] || <Wallet size={16} />}</div>
                                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{method}</p>
                                                <p className="text-sm font-black text-emerald-400 font-mono">{formatCurrency(val)}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Cash Flow Lifecycle */}
                            <div className="bg-blue-600/5 border border-blue-500/20 rounded-3xl p-6">
                                <SectionHeader icon={<ArrowUpRight size={14} className="text-blue-400" />} title="Cash Drawer Lifecycle" subtitle="Full cash position flow" />
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                                    {[
                                        { label: 'Opening Float', value: cashFlow.opening_float, color: 'text-white' },
                                        { label: 'Cash Sales', value: Number(cashFlow.expected_cash) - Number(cashFlow.opening_float) + Number(cashFlow.payouts) - Number(cashFlow.rider_settlements), color: 'text-emerald-400' },
                                        { label: 'Rider Settlements', value: cashFlow.rider_settlements, color: 'text-blue-400' },
                                        { label: 'Payouts', value: cashFlow.payouts, color: 'text-red-400' },
                                        { label: 'Expected Closing', value: cashFlow.expected_cash, color: 'text-white' },
                                    ].map(s => (
                                        <div key={s.label}>
                                            <p className={`text-base font-black ${s.color}`}>{formatCurrency(s.value)}</p>
                                            <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mt-1">{s.label}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Order Type Split */}
                            <div className="bg-slate-900/40 rounded-3xl border border-slate-800/50 p-6">
                                <SectionHeader icon={<UtensilsCrossed size={14} />} title="Order Type Revenue" subtitle="Split by service mode" />
                                <div className="grid grid-cols-3 gap-4">
                                    {Object.entries(orderTypes).map(([type, data]: [string, any]) => {
                                        const typeIcon: Record<string, React.ReactNode> = {
                                            DINE_IN: <UtensilsCrossed size={16} />,
                                            TAKEAWAY: <Package size={16} />,
                                            DELIVERY: <Truck size={16} />,
                                        };
                                        return (
                                            <div key={type} className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/40 text-center">
                                                <div className="text-slate-400 flex justify-center mb-2">{typeIcon[type] || <Package size={16} />}</div>
                                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{type.replace('_', ' ')}</p>
                                                <p className="text-lg font-black text-white mt-1">{formatCurrency(data.revenue)}</p>
                                                <p className="text-[10px] text-emerald-500 font-bold">{data.count} orders</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* === BREAKDOWN TAB === */}
                    {activeTab === 'breakdown' && (
                        <div className="space-y-6">
                            {/* Category Breakdown */}
                            <div className="bg-slate-900/40 rounded-3xl border border-slate-800/50 p-6">
                                <SectionHeader icon={<Package size={14} />} title="Category Performance" subtitle="Revenue split by menu category" />
                                <div className="space-y-3">
                                    {Object.entries(report.category_breakdown || {})
                                        .sort(([, a]: any, [, b]: any) => Number(b) - Number(a))
                                        .map(([cat, val]: [string, any]) => {
                                            const total = Number(summary.gross_sales);
                                            const pct = total > 0 ? Math.round((Number(val) / total) * 100) : 0;
                                            return (
                                                <div key={cat}>
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-xs font-bold text-slate-300 uppercase">{cat}</span>
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-[10px] text-slate-500">{pct}%</span>
                                                            <span className="text-xs font-mono font-bold text-white">{formatCurrency(val)}</span>
                                                        </div>
                                                    </div>
                                                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>

                            {/* Payout Breakdown */}
                            {Object.keys(payoutsBreakdown).length > 0 && (
                                <div className="bg-red-500/5 border border-red-500/20 rounded-3xl p-6">
                                    <SectionHeader icon={<ArrowDownLeft size={14} className="text-red-400" />} title="Payout Breakdown" subtitle="Cash that left the drawer" />
                                    <div className="space-y-3">
                                        {Object.entries(payoutsBreakdown).map(([cat, val]: [string, any]) => (
                                            <div key={cat} className="flex justify-between items-center bg-slate-950/50 p-3 rounded-xl">
                                                <span className="text-xs font-bold text-slate-300 uppercase">{cat}</span>
                                                <span className="text-xs font-mono font-bold text-red-400">-{formatCurrency(val)}</span>
                                            </div>
                                        ))}
                                        <div className="flex justify-between items-center pt-2 border-t border-red-500/20">
                                            <span className="text-xs font-black text-red-400 uppercase">Total Payouts</span>
                                            <span className="text-sm font-black text-red-400">-{formatCurrency(cashFlow.payouts)}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* === VELOCITY TAB === */}
                    {activeTab === 'velocity' && (
                        <div className="space-y-6">
                            <div className="bg-slate-900/40 rounded-3xl border border-slate-800/50 p-6">
                                <SectionHeader icon={<BarChart3 size={14} />} title="Hourly Sales Velocity" subtitle="Revenue and order count by hour" />
                                {peakHour && (
                                    <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-center">
                                        <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest">Peak Hour</p>
                                        <p className="text-xl font-black text-white">{peakHour[0]}:00 — {Number((peakHour[1] as any).count)} orders</p>
                                    </div>
                                )}
                                <div className="flex items-end gap-1.5 h-36 mt-4">
                                    {Array.from({ length: 24 }, (_, h) => {
                                        const d = hourlyVelocity[h];
                                        const count = d?.count || 0;
                                        const rev = Number(d?.revenue || 0);
                                        const maxCount = Math.max(...Object.values(hourlyVelocity).map((v: any) => v.count), 1);
                                        const heightPct = Math.max(3, (count / maxCount) * 100);
                                        return (
                                            <div key={h} className="flex-1 group relative flex flex-col items-center justify-end h-full">
                                                {count > 0 && (
                                                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-slate-800 rounded-lg px-2 py-1 text-center pointer-events-none z-10 whitespace-nowrap transition-opacity">
                                                        <p className="text-[8px] font-black text-white">{count} orders</p>
                                                        <p className="text-[8px] text-emerald-400 font-mono">{formatCurrency(rev)}</p>
                                                    </div>
                                                )}
                                                <div
                                                    className={`w-full rounded-t transition-all ${count > 0 ? 'bg-blue-500 group-hover:bg-emerald-500' : 'bg-slate-800'}`}
                                                    style={{ height: `${heightPct}%` }}
                                                />
                                                <p className="text-[7px] text-slate-600 mt-1 font-black">{h}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* === SECURITY TAB === */}
                    {activeTab === 'security' && (
                        <div className="space-y-6">
                            {/* Variance Alert */}
                            {hasVariance && (
                                <div className={`rounded-3xl p-6 border ${varianceIsPositive ? 'bg-yellow-500/5 border-yellow-500/30' : 'bg-red-500/10 border-red-500/40'}`}>
                                    <div className="flex items-center gap-3">
                                        <AlertTriangle size={20} className={varianceIsPositive ? 'text-yellow-500' : 'text-red-500'} />
                                        <div>
                                            <p className="font-black text-white uppercase tracking-widest text-sm">
                                                {varianceIsPositive ? 'Cash Overage Detected' : 'Cash Shortage Detected'}
                                            </p>
                                            <p className="text-[10px] text-slate-400 mt-1">
                                                System expected <strong>{formatCurrency(cashFlow.expected_cash)}</strong> but counted <strong>{formatCurrency(cashFlow.actual_cash)}</strong>
                                            </p>
                                        </div>
                                        <div className={`ml-auto text-2xl font-black ${varianceIsPositive ? 'text-yellow-400' : 'text-red-400'}`}>
                                            {varianceIsPositive ? '+' : ''}{formatCurrency(variance)}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {!hasVariance && (
                                <div className="rounded-3xl p-6 border bg-emerald-500/5 border-emerald-500/20 flex items-center gap-3">
                                    <CheckCircle2 size={20} className="text-emerald-500" />
                                    <p className="font-black text-emerald-400 uppercase tracking-widest text-sm">Cash Balance Verified — Zero Variance</p>
                                </div>
                            )}

                            {/* Void Summary */}
                            <div className="bg-slate-900/40 rounded-3xl border border-slate-800/50 p-6">
                                <SectionHeader icon={<FileWarning size={14} className="text-orange-400" />} title="Void Summary" subtitle="Orders reversed this session" />
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-4 text-center">
                                        <p className="text-3xl font-black text-orange-400">{voidSummary.count}</p>
                                        <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-1">Voided Orders</p>
                                    </div>
                                    <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-4 text-center">
                                        <p className="text-xl font-black text-orange-400">{formatCurrency(voidSummary.total_value)}</p>
                                        <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-1">Total Voided Value</p>
                                    </div>
                                </div>
                            </div>

                            {/* Cancel Summary */}
                            <div className="bg-slate-900/40 rounded-3xl border border-slate-800/50 p-6">
                                <SectionHeader icon={<ShieldAlert size={14} className="text-red-400" />} title="Cancellation Summary" subtitle="Orders cancelled before payment" />
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 text-center">
                                        <p className="text-3xl font-black text-red-400">{cancelSummary.count}</p>
                                        <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-1">Cancelled Orders</p>
                                    </div>
                                    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 text-center">
                                        <p className="text-xl font-black text-red-400">{formatCurrency(cancelSummary.total_value)}</p>
                                        <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-1">Cancelled Value</p>
                                    </div>
                                </div>
                            </div>

                            {/* Combined exception rate */}
                            <div className="bg-slate-900/40 rounded-3xl border border-slate-800/50 p-6">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Exception Rate</p>
                                <div className="flex items-end gap-2">
                                    <span className="text-3xl font-black text-white">
                                        {summary.order_count > 0
                                            ? `${(((voidSummary.count + cancelSummary.count) / (summary.order_count + voidSummary.count + cancelSummary.count)) * 100).toFixed(1)}%`
                                            : '0%'}
                                    </span>
                                    <span className="text-slate-500 text-sm mb-1">of all orders voided/cancelled</span>
                                </div>
                                <p className="text-[10px] text-slate-600 mt-2">Industry acceptable threshold: {'<5%'}</p>
                            </div>
                        </div>
                    )}

                    {/* Hidden printable thermal layout */}
                    <div style={{ display: 'none' }}>
                        <div id="z-thermal-print">
                            <h1>Z-REPORT</h1>
                            <div className="center">Session {meta.id?.slice(-8).toUpperCase()} | {meta.status}</div>
                            <div className="divider" />
                            <div className="row bold"><span>Opened</span><span>{meta.opened_at ? formatTime(meta.opened_at) : '—'}</span></div>
                            <div className="row bold"><span>Closed</span><span>{meta.closed_at ? formatTime(meta.closed_at) : '—'}</span></div>
                            <div className="row"><span>Opened By</span><span>{meta.opened_by}</span></div>
                            <div className="row"><span>Closed By</span><span>{meta.closed_by}</span></div>
                            <div className="divider" />
                            <div className="section-title">Sales Summary</div>
                            <div className="row"><span>Gross Sales</span><span>{formatCurrency(summary.gross_sales)}</span></div>
                            <div className="row"><span>Discounts</span><span>-{formatCurrency(summary.total_discounts)}</span></div>
                            <div className="row bold"><span>Net Sales</span><span>{formatCurrency(summary.net_sales)}</span></div>
                            <div className="row"><span>Tax</span><span>{formatCurrency(summary.total_tax)}</span></div>
                            <div className="row"><span>Service Charge</span><span>{formatCurrency(summary.total_sc)}</span></div>
                            <div className="row"><span>Delivery Fees</span><span>{formatCurrency(summary.total_delivery_fees)}</span></div>
                            <div className="row"><span>Total Orders</span><span>{summary.order_count}</span></div>
                            <div className="divider" />
                            <div className="section-title">Cash Position</div>
                            <div className="row"><span>Opening Float</span><span>{formatCurrency(cashFlow.opening_float)}</span></div>
                            <div className="row"><span>Rider Settlements</span><span>{formatCurrency(cashFlow.rider_settlements)}</span></div>
                            <div className="row"><span>Payouts</span><span>-{formatCurrency(cashFlow.payouts)}</span></div>
                            <div className="row bold"><span>Expected Cash</span><span>{formatCurrency(cashFlow.expected_cash)}</span></div>
                            <div className="row bold"><span>Actual Cash</span><span>{formatCurrency(cashFlow.actual_cash)}</span></div>
                            <div className={`row bold ${!hasVariance ? '' : varianceIsPositive ? '' : 'alert'}`}><span>VARIANCE</span><span>{varianceIsPositive ? '+' : ''}{formatCurrency(variance)}</span></div>
                            <div className="divider" />
                            <div className="section-title">Security</div>
                            <div className="row"><span>Voids</span><span>{voidSummary.count} ({formatCurrency(voidSummary.total_value)})</span></div>
                            <div className="row"><span>Cancellations</span><span>{cancelSummary.count} ({formatCurrency(cancelSummary.total_value)})</span></div>
                            <div className="divider" />
                            <div className="center tag">END OF REPORT — FIREFLOW POS</div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 bg-slate-900/80 border-t border-slate-800 flex justify-between items-center gap-4 shrink-0">
                    <p className="text-[9px] text-slate-600 font-mono">
                        Generated: {new Date().toLocaleString()} &bull; Session: {meta.id?.slice(-8).toUpperCase()}
                    </p>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-6 py-2.5 bg-slate-800 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all">
                            Dismiss
                        </button>
                        <button onClick={handlePrint} className="px-6 py-2.5 bg-white text-slate-950 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 transition-all flex items-center gap-2">
                            <Printer size={14} strokeWidth={3} /> Print Physical Copy
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
