import React, { useState, useEffect } from 'react';
import { 
    TrendingUp, 
    TrendingDown, 
    Scale, 
    Download,
    Calendar,
    ArrowRight
} from 'lucide-react';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';
import { Button } from '../../../shared/ui/Button';
import { Card } from '../../../shared/ui/Card';

export const FinancialReportsView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'pl' | 'bs'>('pl');
    const [loading, setLoading] = useState(false);
    const [plData, setPlData] = useState<any>(null);
    const [bsData, setBsData] = useState<any>(null);

    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        if (activeTab === 'pl') fetchPL();
        else fetchBS();
    }, [activeTab, dateRange]);

    const fetchPL = async () => {
        setLoading(true);
        try {
            const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const res = await fetchWithAuth(`${baseUrl}/reports/profit-loss?start=${dateRange.start}T00:00:00Z&end=${dateRange.end}T23:59:59Z&format=json`);
            if (res.ok) {
                const json = await res.json();
                setPlData(json.data);
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchBS = async () => {
        setLoading(true);
        try {
            const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const res = await fetchWithAuth(`${baseUrl}/reports/balance-sheet?asOf=${dateRange.end}T23:59:59Z&format=json`);
            if (res.ok) {
                const json = await res.json();
                setBsData(json.data);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 text-white pb-20">
            {/* Header / Controls */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button 
                        onClick={() => setActiveTab('pl')}
                        className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'pl' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-white'}`}
                    >
                        Profit & Loss
                    </button>
                    <button 
                        onClick={() => setActiveTab('bs')}
                        className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'bs' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-white'}`}
                    >
                        Balance Sheet
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                        <Calendar className="w-4 h-4 text-slate-500" />
                        <input 
                            type="date" 
                            className="bg-transparent border-none text-xs text-white focus:outline-none" 
                            value={dateRange.start}
                            onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                        />
                        <ArrowRight className="w-3 h-3 text-slate-600" />
                        <input 
                            type="date" 
                            className="bg-transparent border-none text-xs text-white focus:outline-none" 
                            value={dateRange.end}
                            onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                        />
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="h-64 flex items-center justify-center">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : activeTab === 'pl' ? (
                /* --- Profit & Loss Layout --- */
                <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="p-6 bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/20">
                            <TrendingUp className="w-6 h-6 text-emerald-400 mb-4" />
                            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-widest">Total Revenue</h3>
                            <p className="text-3xl font-bold mt-2">Rs. {plData?.revenue?.total?.toLocaleString() || 0}</p>
                        </Card>
                        <Card className="p-6 bg-gradient-to-br from-red-500/10 to-transparent border-red-500/20">
                            <TrendingDown className="w-6 h-6 text-red-400 mb-4" />
                            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-widest">Total Expenses</h3>
                            <p className="text-3xl font-bold mt-2">Rs. {((plData?.operatingExpenses?.total || 0) + (plData?.cogs || 0)).toLocaleString()}</p>
                        </Card>
                        <Card className={`p-6 bg-gradient-to-br border-2 ${plData?.netIncome >= 0 ? 'from-blue-500/10 border-blue-500/30' : 'from-rose-500/10 border-rose-500/30'}`}>
                            <Scale className={`w-6 h-6 mb-4 ${plData?.netIncome >= 0 ? 'text-blue-400' : 'text-rose-400'}`} />
                            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-widest">Net Profit</h3>
                            <p className={`text-3xl font-bold mt-2 ${plData?.netIncome >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>
                                Rs. {plData?.netIncome?.toLocaleString() || 0}
                            </p>
                        </Card>
                    </div>

                    {/* Detailed Breakdown */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Revenue & COGS */}
                        <div className="space-y-6">
                            <Card className="bg-slate-900 border-slate-800 overflow-hidden">
                                <div className="p-4 border-b border-slate-800 bg-slate-950/50">
                                    <h4 className="font-bold">Operating Revenue</h4>
                                </div>
                                <div className="p-4 space-y-3">
                                    {(plData?.revenue?.items || []).map((item: any) => (
                                        <div key={item.name} className="flex justify-between text-sm">
                                            <span className="text-slate-400">{item.name}</span>
                                            <span className="font-mono">Rs. {item.amount.toLocaleString()}</span>
                                        </div>
                                    ))}
                                    <div className="pt-3 border-t border-slate-800 flex justify-between font-bold text-emerald-400">
                                        <span>Total Revenue</span>
                                        <span>Rs. {plData?.revenue?.total?.toLocaleString()}</span>
                                    </div>
                                </div>
                            </Card>

                            <Card className="bg-slate-900 border-slate-800 p-4 flex justify-between items-center text-red-400 font-bold">
                                <span>Cost of Goods Sold (COGS)</span>
                                <span>Rs. -{plData?.cogs?.toLocaleString()}</span>
                            </Card>

                            <Card className="bg-blue-600 p-4 flex justify-between items-center text-white font-bold text-lg shadow-xl shadow-blue-600/20">
                                <span>GROSS PROFIT</span>
                                <span>Rs. {plData?.grossProfit?.toLocaleString()}</span>
                            </Card>
                        </div>

                        {/* Operating Expenses */}
                        <Card className="bg-slate-900 border-slate-800 h-fit overflow-hidden">
                            <div className="p-4 border-b border-slate-800 bg-slate-950/50">
                                <h4 className="font-bold">Operating Expenses</h4>
                            </div>
                            <div className="p-4 space-y-4">
                                {(plData?.operatingExpenses?.categories || []).map((cat: any) => (
                                    <div key={cat.name} className="space-y-1">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-300">{cat.name}</span>
                                            <span className="font-mono text-white">Rs. {cat.amount.toLocaleString()}</span>
                                        </div>
                                        <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                                            <div 
                                                className="bg-red-500 h-full rounded-full" 
                                                style={{ width: `${Math.min(100, (cat.amount / plData.operatingExpenses.total) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                                <div className="pt-3 border-t border-slate-800 flex justify-between font-bold text-red-400">
                                    <span>Total Expenses</span>
                                    <span>Rs. {plData?.operatingExpenses?.total?.toLocaleString()}</span>
                                </div>
                            </div>
                        </Card>
                    </div>
                </div>
            ) : (
                /* --- Balance Sheet Layout --- */
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Assets Column */}
                    <div className="space-y-6">
                        <Card className="bg-slate-900 border-slate-800 overflow-hidden">
                            <div className="p-4 border-b border-slate-800 bg-emerald-500/10 flex justify-between items-center">
                                <h4 className="font-bold text-emerald-400">ASSETS</h4>
                                <span className="font-mono font-bold">Rs. {bsData?.assets?.total?.toLocaleString()}</span>
                            </div>
                            <div className="p-4 space-y-3">
                                {(bsData?.assets?.items || []).map((item: any) => (
                                    <div key={item.name} className="flex justify-between text-sm hover:bg-slate-800/50 p-2 rounded-lg transition-colors">
                                        <span className="text-slate-400">{item.name}</span>
                                        <span className="font-mono text-emerald-400">Rs. {item.amount.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>

                    {/* Liabilities & Equity Column */}
                    <div className="space-y-6">
                        <Card className="bg-slate-900 border-slate-800 overflow-hidden shadow-2xl">
                            <div className="p-4 border-b border-slate-800 bg-red-400/10 flex justify-between items-center">
                                <h4 className="font-bold text-red-400">LIABILITIES</h4>
                                <span className="font-mono font-bold text-red-400">Rs. {bsData?.liabilities?.total?.toLocaleString()}</span>
                            </div>
                            <div className="p-4 space-y-3">
                                {(bsData?.liabilities?.items || []).map((item: any) => (
                                    <div key={item.name} className="flex justify-between text-sm hover:bg-slate-800/50 p-2 rounded-lg transition-colors">
                                        <span className="text-slate-400">{item.name}</span>
                                        <span className="font-mono text-red-400">Rs. {item.amount.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <Card className="bg-slate-900 border-slate-800 overflow-hidden shadow-2xl">
                            <div className="p-4 border-b border-slate-800 bg-blue-400/10 flex justify-between items-center">
                                <h4 className="font-bold text-blue-400">EQUITY</h4>
                                <span className="font-mono font-bold text-blue-400">Rs. {bsData?.equity?.total?.toLocaleString()}</span>
                            </div>
                            <div className="p-4 space-y-3">
                                {(bsData?.equity?.items || []).map((item: any) => (
                                    <div key={item.name} className="flex justify-between text-sm p-2 rounded-lg">
                                        <span className="text-slate-400">{item.name}</span>
                                        <span className="font-mono">Rs. {item.amount.toLocaleString()}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between text-sm bg-blue-600/10 p-2 rounded-lg border border-blue-600/30 italic">
                                    <span className="text-blue-300">Retained Earnings (Net Income)</span>
                                    <span className="font-mono font-bold text-blue-400">Rs. {bsData?.equity?.retainedEarnings?.toLocaleString()}</span>
                                </div>
                            </div>
                        </Card>

                        {/* Balance Check */}
                        <div className={`p-4 rounded-2xl border flex justify-between items-center ${bsData?.balance === 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                            <div className="flex items-center gap-2">
                                <Scale className={`w-5 h-5 ${bsData?.balance === 0 ? 'text-emerald-400' : 'text-red-400'}`} />
                                <span className="text-sm font-semibold uppercase">Accounting Balance Check</span>
                            </div>
                            <span className="text-xs font-mono">{bsData?.balance === 0 ? 'BALANCED' : `DIFFERENCE: Rs. ${bsData.balance}`}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
