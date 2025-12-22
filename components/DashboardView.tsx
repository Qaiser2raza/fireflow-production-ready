
import React, { useMemo, useState, useEffect } from 'react';
import { useAppContext } from '../App';
import { useRestaurant } from '../RestaurantContext';
import { OrderStatus, TableStatus, DiagnosticResult } from '../types';
import { GoogleGenAI } from "@google/genai";
import { 
  TrendingUp, 
  Users, 
  Clock, 
  AlertTriangle, 
  ChefHat, 
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingBag,
  Activity,
  Database,
  RefreshCw,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Play,
  Shield,
  Sparkles,
  Zap,
  BarChart3
} from 'lucide-react';

import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';

export const DashboardView: React.FC = () => {
  const { transactions, orders, tables, drivers, menuItems, seedDatabase, runDiagnostics, currentUser } = useAppContext();
  const { currentRestaurant } = useRestaurant();
  const [isSeeding, setIsSeeding] = useState(false);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [diagResults, setDiagResults] = useState<DiagnosticResult[]>([]);
  const [auraInsight, setAuraInsight] = useState<string | null>(null);
  const [isInsightLoading, setIsInsightLoading] = useState(false);

  // Metrics
  const totalSales = useMemo(() => transactions.reduce((sum, t) => sum + t.amount, 0), [transactions]);
  const activeOrdersCount = orders.filter(o => o.status !== OrderStatus.PAID && o.status !== OrderStatus.DELIVERED && o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.VOID).length;
  const kitchenOrders = orders.filter(o => o.status === OrderStatus.COOKING || o.status === OrderStatus.NEW);
  const totalSeats = tables.reduce((acc, t) => acc + t.capacity, 0);
  const occupiedSeats = useMemo(() => tables.reduce((acc, table) => table.status === TableStatus.OCCUPIED ? acc + table.capacity : acc, 0), [tables]);
  const occupancyRate = totalSeats > 0 ? Math.round((occupiedSeats / totalSeats) * 100) : 0;

  useEffect(() => {
    if (!isInsightLoading && !auraInsight && orders.length > 0) {
      generateAURAInsight();
    }
  }, [orders.length]);

  const generateAURAInsight = async () => {
    setIsInsightLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Analyze current restaurant performance: ${activeOrdersCount} active orders, ${occupancyRate}% occupancy, ${kitchenOrders.length} in kitchen. Give a 2-sentence ultra-modern elite manager briefing.`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      });
      setAuraInsight(response.text || null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsInsightLoading(false);
    }
  };

  // Fix: Added handleQuickSeed handler
  const handleQuickSeed = async () => {
    setIsSeeding(true);
    try {
      await seedDatabase();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSeeding(false);
    }
  };

  // Fix: Added handleRunDiagnostics handler
  const handleRunDiagnostics = async () => {
    setIsRunningDiagnostics(true);
    try {
      const results = await runDiagnostics();
      setDiagResults(results);
    } catch (error) {
      console.error(error);
    } finally {
      setIsRunningDiagnostics(false);
    }
  };

  const isSystemEmpty = menuItems.length === 0;

  return (
    <div className="h-full w-full bg-slate-950 p-6 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6 pb-12">
        
        <div className="flex justify-between items-end mb-4">
           <div>
             <h2 className="text-gold-500 text-xs font-bold uppercase tracking-[0.2em] mb-1">{currentRestaurant?.name}</h2>
             <h1 className="text-3xl font-serif text-white flex items-center gap-3">
               AURA Intelligence
               <Badge variant="info" className="animate-pulse">Active Shield</Badge>
             </h1>
           </div>
           <div className="flex gap-2">
             <div className="px-3 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center gap-2">
               <Activity size={12} className="text-green-500 animate-pulse" /> Topology: Stable
             </div>
           </div>
        </div>

        {/* AURA INSIGHT PANEL */}
        {!isSystemEmpty && (
          <div className="bg-gradient-to-r from-slate-900 to-slate-950 border border-gold-500/20 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden animate-in zoom-in duration-500">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Sparkles size={100} className="text-gold-500" />
            </div>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-10 h-10 rounded-full bg-gold-500 flex items-center justify-center shadow-lg shadow-gold-500/20">
                <Zap size={20} className="text-slate-950" />
              </div>
              <span className="text-xs font-black text-gold-500 uppercase tracking-[0.3em]">Operational Neural Insight</span>
            </div>
            <div className="relative z-10">
              {isInsightLoading ? (
                <div className="flex items-center gap-3 text-slate-500 py-2">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm italic">Synchronizing neural state...</span>
                </div>
              ) : (
                <p className="text-lg text-slate-200 font-serif leading-relaxed italic">
                  "{auraInsight || "AURA is currently observing system topology. No anomalies detected."}"
                </p>
              )}
            </div>
          </div>
        )}

        {isSystemEmpty && (currentUser?.role === 'MANAGER' || currentUser?.role === 'SUPER_ADMIN') && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl flex flex-col justify-between shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-5"><Database size={120} /></div>
               <div>
                 <div className="bg-gold-500/20 p-4 rounded-2xl text-gold-500 w-fit mb-6"><Database size={32} /></div>
                 <h2 className="text-2xl font-serif text-white mb-2">Instantiate AURA Data</h2>
                 <p className="text-slate-400 text-sm max-w-md leading-relaxed mb-8">
                   Establish base connectivity for <span className="text-white font-bold">{currentRestaurant?.name}</span>.
                 </p>
               </div>
               <button onClick={handleQuickSeed} disabled={isSeeding} className="w-full py-5 bg-gold-500 hover:bg-gold-400 text-slate-950 font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl flex items-center justify-center gap-3">
                 {isSeeding ? <Loader2 className="animate-spin" size={24} /> : <Play size={20} fill="currentColor" />}
                 Provision Infrastructure
               </button>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl flex flex-col">
               <div className="flex justify-between items-center mb-6">
                 <h3 className="text-white font-serif text-xl flex items-center gap-2"><ShieldCheck size={20} className="text-blue-400" /> Diagnostics</h3>
                 <Button variant="ghost" size="sm" onClick={handleRunDiagnostics} loading={isRunningDiagnostics}>Scan Cluster</Button>
               </div>
               <div className="flex-1 space-y-3">
                  {diagResults.map((res, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl">
                       <div className="flex items-center gap-3">
                          {res.status === 'success' ? <CheckCircle2 className="text-green-500" size={16} /> : <XCircle className="text-red-500" size={16} />}
                          <div>
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{res.step}</div>
                            <div className="text-sm text-slate-200">{res.message}</div>
                          </div>
                       </div>
                    </div>
                  ))}
               </div>
            </div>
          </div>
        )}

        {!isSystemEmpty && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard title="Net Throughput" value={`Rs. ${totalSales.toLocaleString()}`} subValue={`Neural Health: Excellent`} icon={<DollarSign size={20} className="text-white" />} bgClass="bg-gradient-to-br from-gold-600 to-gold-700" textClass="text-black" />
              <MetricCard title="Saturation" value={`${occupancyRate}%`} subValue={`${occupiedSeats}/${totalSeats} Seats Active`} icon={<Users size={20} className="text-blue-400" />} />
              <MetricCard title="Fulfillment" value={activeOrdersCount.toString()} subValue={`${kitchenOrders.length} in Production`} icon={<ChefHat size={20} className="text-orange-400" />} />
              <MetricCard title="Unit Average" value={`Rs. ${Math.round(transactions.length > 0 ? totalSales / transactions.length : 0).toLocaleString()}`} subValue="Per Session" icon={<BarChart3 size={20} className="text-purple-400" />} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 lg:col-span-2 relative overflow-hidden">
                 <h3 className="text-white font-serif text-lg mb-6">Kitchen Pulse</h3>
                 <div className="grid grid-cols-3 gap-4">
                    <KitchenStatBox label="Queue" value={kitchenOrders.length} color="text-slate-200" sub="Requests" />
                    <KitchenStatBox label="Latency" value="14m" color="text-blue-400" sub="Optimal" />
                    <KitchenStatBox label="Load" value="Medium" color="text-green-400" sub="Topology Scan" />
                 </div>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex flex-col">
                 <h3 className="text-white font-serif text-lg mb-6">AURA Favorites</h3>
                 <div className="flex-1 space-y-4">
                    {menuItems.slice(0, 4).map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-500 text-xs">{idx+1}</div>
                         <div className="flex-1 text-sm font-medium text-slate-200">{item.name}</div>
                         <div className="text-xs font-mono text-gold-500">Rs. {item.price}</div>
                      </div>
                    ))}
                 </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const MetricCard: React.FC<{title: string, value: string, subValue: string, icon: React.ReactNode, trend?: 'up' | 'down', bgClass?: string, textClass?: string}> = ({ title, value, subValue, icon, bgClass = 'bg-slate-900/50', textClass = 'text-white' }) => (
  <div className={`${bgClass} border border-slate-800 rounded-3xl p-6 shadow-lg flex flex-col justify-between h-36 transition-all hover:scale-[1.02]`}>
     <div className="flex justify-between items-start">
        <span className={`text-[10px] uppercase tracking-[0.2em] font-bold opacity-70 ${textClass === 'text-black' ? 'text-black' : 'text-slate-400'}`}>{title}</span>
        <div className="opacity-80">{icon}</div>
     </div>
     <div>
        <div className={`text-3xl font-serif font-bold ${textClass}`}>{value}</div>
        <div className={`text-[10px] font-bold mt-1 opacity-70 ${textClass === 'text-black' ? 'text-black' : 'text-slate-500'}`}>{subValue}</div>
     </div>
  </div>
);

const KitchenStatBox: React.FC<{label: string, value: string | number, color: string, sub: string}> = ({label, value, color, sub}) => (
  <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 text-center">
    <div className={`text-3xl font-mono font-bold ${color} mb-1`}>{value}</div>
    <div className="text-xs text-slate-300 font-bold uppercase tracking-wider">{label}</div>
    <div className="text-[10px] text-slate-600 uppercase tracking-widest mt-1">{sub}</div>
  </div>
);
