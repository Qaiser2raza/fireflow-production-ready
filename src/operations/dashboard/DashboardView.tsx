import React, { useEffect, useState } from 'react';
import { useAppContext } from '../../client/App';
import {
  TrendingUp, Users, Clock, Activity,
  DollarSign, ShoppingBag, AlertCircle
} from 'lucide-react';
import { Card } from '../../shared/ui/Card';

export const DashboardView: React.FC = () => {
  const { currentUser } = useAppContext();
  const [stats, setStats] = useState({
    totalSales: 0,
    totalTransactions: 0,
    unitAverage: 0,
    activeOrders: 0,
    kitchenQueue: 0
  });
  const [loading, setLoading] = useState(true);

  // FETCH REAL DATA
  useEffect(() => {
    const fetchAnalytics = async () => {
      // Safety check: ensure we have a user
      if (!currentUser?.restaurant_id) return;

      try {
        const res = await fetch(`http://localhost:3001/api/analytics/summary?restaurant_id=${currentUser.restaurant_id}`);
        const data = await res.json();
        setStats(data);
      } catch (err) {
        console.error("Failed to load analytics", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();

    // Auto-Refresh every 30 seconds
    const interval = setInterval(fetchAnalytics, 30000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const StatCard = ({ title, value, icon, subValue, color }: any) => (
    <Card className="p-6 border-slate-800 bg-slate-900/50 backdrop-blur-sm">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${color} bg-opacity-10 text-white`}>
          {icon}
        </div>
        {subValue && (
          <span className="text-xs font-bold text-green-500 bg-green-500/10 px-2 py-1 rounded-full">
            {subValue}
          </span>
        )}
      </div>
      <div className="text-slate-400 text-xs uppercase font-bold tracking-widest mb-1">{title}</div>
      <div className="text-2xl font-serif font-bold text-white">
        {loading ? <span className="animate-pulse">...</span> : value}
      </div>
    </Card>
  );

  return (
    <div className="h-full p-6 overflow-y-auto custom-scrollbar bg-[#020617]">
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-white mb-2">AURA Command</h1>
        <p className="text-slate-400">Real-time Enterprise Overview</p>
      </div>

      {/* TOP ROW: FINANCIALS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Revenue"
          value={`Rs. ${stats.totalSales.toLocaleString()}`}
          icon={<DollarSign size={24} className="text-gold-500" />}
          color="bg-gold-500"
        />
        <StatCard
          title="Total Orders"
          value={stats.totalTransactions}
          icon={<ShoppingBag size={24} className="text-blue-500" />}
          color="bg-blue-500"
        />
        <StatCard
          title="Avg. Ticket"
          value={`Rs. ${stats.unitAverage}`}
          icon={<TrendingUp size={24} className="text-green-500" />}
          color="bg-green-500"
        />
        <StatCard
          title="Active Diners"
          value={stats.activeOrders}
          icon={<Users size={24} className="text-purple-500" />}
          color="bg-purple-500"
          subValue="LIVE"
        />
      </div>

      {/* MIDDLE ROW: OPERATIONAL HEALTH */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Kitchen Status */}
        <Card className="p-6 border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3 mb-6">
            <Activity size={20} className="text-red-500" />
            <h3 className="text-white font-bold uppercase tracking-widest text-sm">Kitchen Load</h3>
          </div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-slate-400 text-sm">Orders Queued</div>
            <div className="text-2xl font-mono font-bold text-white">{stats.kitchenQueue}</div>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            {/* Visual Bar: Max 20 orders before it looks "Full" */}
            <div
              className="h-full bg-red-500 transition-all duration-1000"
              style={{ width: `${Math.min((stats.kitchenQueue / 20) * 100, 100)}%` }}
            ></div>
          </div>
        </Card>

        {/* System Health */}
        <Card className="p-6 border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3 mb-6">
            <Clock size={20} className="text-blue-500" />
            <h3 className="text-white font-bold uppercase tracking-widest text-sm">System Latency</h3>
          </div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-slate-400 text-sm">Network Ping</div>
            <div className="text-green-500 font-bold">~2ms</div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-slate-400 text-sm">Sync Status</div>
            <div className="text-blue-400 font-bold">OPTIMAL</div>
          </div>
        </Card>

        {/* Alerts */}
        <Card className="p-6 border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3 mb-6">
            <AlertCircle size={20} className="text-gold-500" />
            <h3 className="text-white font-bold uppercase tracking-widest text-sm">Notifications</h3>
          </div>
          <div className="space-y-3">
            {stats.kitchenQueue > 5 && (
              <div className="text-xs text-red-400 bg-red-950/30 p-2 rounded border border-red-500/20">
                High Kitchen Traffic Detected
              </div>
            )}
            {stats.kitchenQueue === 0 && stats.activeOrders === 0 && (
              <div className="text-xs text-slate-500 italic">
                System Idle. Ready for service.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};