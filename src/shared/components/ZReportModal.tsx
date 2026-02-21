
import React from 'react';
import { X, Printer, TrendingUp, Wallet, Package, CreditCard, ChevronRight } from 'lucide-react';

interface ZReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    report: any;
}

export const ZReportModal: React.FC<ZReportModalProps> = ({ isOpen, onClose, report }) => {
    if (!isOpen || !report) return null;

    const formatCurrency = (amount: number | string) => `Rs. ${Math.round(Number(amount)).toLocaleString()}`;

    return (
        <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-slate-900 rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden max-w-2xl w-full flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="bg-slate-800/50 p-6 border-b border-slate-700/50 flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Z-REPORT SUMMARY</h2>
                        <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Business Intelligence Snapshot</p>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-slate-700 rounded-2xl text-slate-400 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">

                    {/* Top Stats */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800">
                            <div className="flex justify-between items-start mb-4">
                                <TrendingUp className="text-emerald-500" size={20} />
                                <span className="text-[9px] font-black bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded-full uppercase">Net Sales</span>
                            </div>
                            <h3 className="text-3xl font-black text-white">{formatCurrency(report.summary.gross_sales)}</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase mt-2">{report.summary.order_count} Total Orders</p>
                        </div>
                        <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800">
                            <div className="flex justify-between items-start mb-4">
                                <Wallet className={`text-emerald-500`} size={20} />
                                <span className={`text-[9px] font-black bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded-full uppercase`}>Variance</span>
                            </div>
                            <h3 className={`text-3xl font-black text-white`}>{formatCurrency(report.metadata.variance)}</h3>
                            <p className="text-[10px] text-slate-500 font-bold uppercase mt-2">Comparison to Managed Cash</p>
                        </div>
                    </div>

                    {/* Breakdown Sections */}
                    <div className="grid grid-cols-2 gap-8">
                        {/* Categories */}
                        <div className="space-y-4">
                            <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2">
                                <Package size={14} /> Category Breakdown
                            </h4>
                            <div className="space-y-3">
                                {Object.entries(report.category_breakdown).map(([cat, val]: [string, any]) => (
                                    <div key={cat} className="flex justify-between items-center group">
                                        <span className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">{cat}</span>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-mono text-slate-400">{formatCurrency(val)}</span>
                                            <ChevronRight size={12} className="text-slate-600 group-hover:text-blue-500" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Payments */}
                        <div className="space-y-4">
                            <h4 className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2">
                                <CreditCard size={14} /> Payment Channels
                            </h4>
                            <div className="space-y-3">
                                {Object.entries(report.payment_methods).map(([method, val]: [string, any]) => (
                                    <div key={method} className="flex justify-between items-center bg-slate-950/50 p-3 rounded-2xl border border-slate-800/50">
                                        <span className="text-xs font-black text-white uppercase tracking-tighter">{method}</span>
                                        <span className="text-xs font-mono font-bold text-emerald-500">{formatCurrency(val)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Cash Flow Summary */}
                    <div className="bg-blue-600/5 border border-blue-500/20 rounded-3xl p-6">
                        <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4">Cash Position Lifecycle</h4>
                        <div className="grid grid-cols-4 gap-4">
                            <div>
                                <span className="text-[9px] text-slate-500 font-bold uppercase">Opening</span>
                                <p className="text-sm font-black text-white">{formatCurrency(report.cash_flow.opening_float)}</p>
                            </div>
                            <div>
                                <span className="text-[9px] text-slate-500 font-bold uppercase">Settlements</span>
                                <p className="text-sm font-black text-white text-emerald-500">+{formatCurrency(report.cash_flow.rider_settlements)}</p>
                            </div>
                            <div>
                                <span className="text-[9px] text-slate-500 font-bold uppercase">Payouts</span>
                                <p className="text-sm font-black text-white text-red-500">-{formatCurrency(report.cash_flow.payouts)}</p>
                            </div>
                            <div>
                                <span className="text-[9px] text-slate-500 font-bold uppercase">Expected</span>
                                <p className="text-lg font-black text-blue-400">{formatCurrency(report.cash_flow.expected_cash)}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Toolbar */}
                <div className="p-6 bg-slate-900 border-t border-slate-800 flex justify-between items-center gap-4">
                    <p className="text-[9px] text-slate-600 font-mono">Report Generated: {new Date(report.metadata.closed_at).toLocaleString()}</p>
                    <div className="flex gap-4">
                        <button onClick={onClose} className="px-8 py-3 bg-slate-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-700 transition-all">
                            Dismiss
                        </button>
                        <button className="px-8 py-3 bg-white text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-500 transition-all flex items-center gap-2">
                            <Printer size={16} strokeWidth={3} /> Print Physical Copy
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
