
import React, { useEffect, useState } from 'react';
import { useAppContext } from '../../client/contexts/AppContext';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';
import {
  TrendingUp, Users, Activity,
  Banknote, ShoppingBag, AlertCircle, Bike, Zap, Navigation
} from 'lucide-react';
import { Card } from '../../shared/ui/Card';

export const DashboardView: React.FC = () => {
  const { currentUser } = useAppContext();
  const [stats, setStats] = useState<any>({
    totalSales: 0,
    totalTransactions: 0,
    unitAverage: 0,
    activeOrders: 0,
    kitchenQueue: 0,
    logistics: {
      onRoad: 0,
      activeShifts: 0,
      deliveredToday: 0
    }
  });
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    if (!currentUser?.restaurant_id) return;
    try {
      const res = await fetchWithAuth(`http://localhost:3001/api/analytics/summary?restaurant_id=${currentUser.restaurant_id}`);
      if (!res.ok) {
        console.error("Analytics API error:", res.status);
        return;
      }
      const data = await res.json();
      if (data && data.totalSales !== undefined) {
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to load analytics", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 15000); // Faster refresh for command center
    return () => clearInterval(interval);
  }, [currentUser]);

  const StatCard = ({ title, value, icon, subValue, color, trend }: any) => (
    <Card className="p-5 border-slate-800 bg-[#0f172a]/40 backdrop-blur-xl relative overflow-hidden group">
      <div className={`absolute top-0 right-0 w-24 h-24 -mr-10 -mt-10 rounded-full ${color.replace('text-', 'bg-')} opacity-5 blur-2xl group-hover:opacity-10 transition-opacity`}></div>

      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className={`p-2.5 rounded-lg ${color} bg-white bg-opacity-[0.03] border border-white/5 shadow-inner`}>
          {React.cloneElement(icon, { size: 20 })}
        </div>
        {subValue && (
          <span className="text-[10px] font-black tracking-tighter text-white bg-white/10 px-2.5 py-1 rounded-md uppercase">
            {subValue}
          </span>
        )}
      </div>

      <div className="text-slate-500 text-[10px] uppercase font-black tracking-[0.2em] mb-1.5">{title}</div>
      <div className="flex items-baseline gap-2">
        <div className="text-2xl font-serif font-bold text-white tracking-tight">
          {loading ? <span className="animate-pulse opacity-20">---</span> : value}
        </div>
        {trend && <span className="text-[10px] text-green-400 font-bold">{trend}</span>}
      </div>
    </Card>
  );

  return (
    <div className="h-full p-8 overflow-y-auto custom-scrollbar bg-[#020617]">
      {/* HEADER SECTION */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
            <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">System Online</span>
          </div>
          <h1 className="text-4xl font-serif font-black text-white tracking-tighter">AURA <span className="text-slate-500 font-normal">Command</span></h1>
        </div>

        <div className="flex gap-3">
          <div className="bg-slate-900/50 border border-slate-800 px-4 py-2 rounded-xl text-right">
            <div className="text-[10px] text-slate-500 uppercase font-black">Local Server</div>
            <div className="text-xs font-mono text-emerald-400">0.0.0.0:3001</div>
          </div>
        </div>
      </div>

      {/* TOP ROW: FINANCIALS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard
          title="Gross Revenue"
          value={`Rs. ${stats.totalSales.toLocaleString()}`}
          icon={<Banknote className="text-gold-500" />}
          color="text-gold-500"
          subValue="Daily"
        />
        <StatCard
          title="Total Payload"
          value={stats.totalTransactions}
          icon={<ShoppingBag className="text-blue-500" />}
          color="text-blue-500"
          trend="+12%"
        />
        <StatCard
          title="Avg. Ticket"
          value={`Rs. ${stats.unitAverage}`}
          icon={<TrendingUp className="text-emerald-500" />}
          color="text-emerald-500"
        />
        <StatCard
          title="Active Load"
          value={stats.activeOrders}
          icon={<Users className="text-purple-500" />}
          color="text-purple-500"
          subValue="Live"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* LOGISTICS COMMAND - NEW */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <Navigation size={16} className="text-indigo-400" />
            <h3 className="text-white text-xs font-black uppercase tracking-[0.2em]">Fleet Intelligence</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900/30 border border-slate-800/60 p-5 rounded-2xl">
              <div className="text-indigo-400 mb-2"><Bike size={24} /></div>
              <div className="text-2xl font-black text-white">{stats.logistics?.onRoad || 0}</div>
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">On The Road</div>
            </div>
            <div className="bg-slate-900/30 border border-slate-800/60 p-5 rounded-2xl">
              <div className="text-emerald-400 mb-2"><Zap size={24} /></div>
              <div className="text-2xl font-black text-white">{stats.logistics?.activeShifts || 0}</div>
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Active Capcity</div>
            </div>
            <div className="bg-slate-900/30 border border-slate-800/60 p-5 rounded-2xl">
              <div className="text-blue-400 mb-2"><ShoppingBag size={24} /></div>
              <div className="text-2xl font-black text-white">{stats.logistics?.deliveredToday || 0}</div>
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Fulfilled Today</div>
            </div>
          </div>
        </div>

        {/* OPERATIONS CONFIGURE */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <Activity size={16} className="text-red-400" />
            <h3 className="text-white text-xs font-black uppercase tracking-[0.2em]">System Health</h3>
          </div>
          <Card className="p-6 border-slate-800 bg-[#0f172a]/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-slate-400 text-xs font-bold uppercase tracking-widest">Kitchen Pressure</div>
              <div className={`text-xl font-black ${stats.kitchenQueue > 10 ? 'text-red-500' : 'text-white'}`}>{stats.kitchenQueue}</div>
            </div>
            <div className="w-full bg-slate-800/50 h-1.5 rounded-full overflow-hidden mb-6">
              <div
                className={`h-full transition-all duration-1000 ${stats.kitchenQueue > 10 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-gold-500'}`}
                style={{ width: `${Math.min((stats.kitchenQueue / 20) * 100, 100)}%` }}
              ></div>
            </div>

            <div className="space-y-4 pt-2 border-t border-slate-800/50">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Latency</span>
                <span className="text-[10px] text-emerald-400 font-mono">2ms</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Security</span>
                <span className="text-[10px] text-blue-400 font-bold uppercase">Hardened</span>
              </div>
            </div>
          </Card>
        </div>

      </div>

      {/* FOOTER ALERT BAR */}
      {stats.kitchenQueue > 5 && (
        <div className="fixed bottom-8 right-8 left-8 lg:left-auto lg:w-96 animate-in slide-in-from-bottom-10 fade-in duration-700">
          <div className="bg-red-500/10 backdrop-blur-md border border-red-500/20 p-4 rounded-2xl flex items-center gap-4 shadow-2xl">
            <div className="bg-red-500 p-2 rounded-lg text-white animate-pulse">
              <AlertCircle size={20} />
            </div>
            <div>
              <div className="text-white font-black text-xs uppercase tracking-tighter">Kitchen Alert</div>
              <div className="text-red-400 text-xs">Capacity at {(stats.kitchenQueue / 20 * 100).toFixed(0)}% — Consider pausing dispatches.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
