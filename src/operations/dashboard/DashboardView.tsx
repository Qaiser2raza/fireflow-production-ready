
import React, { useEffect, useState } from 'react';
import { useAppContext } from '../../client/contexts/AppContext';
import { useRestaurant } from '../../client/RestaurantContext';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';
import {
  TrendingUp, Users, Activity, HeartPulse,
  Banknote, ShoppingBag, AlertCircle, Bike, Zap, Navigation, Utensils
} from 'lucide-react';
import { Card } from '../../shared/ui/Card';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

export const DashboardView: React.FC = () => {
  const { currentUser } = useAppContext();
  const { currentRestaurant } = useRestaurant();
  const [stats, setStats] = useState<any>({
    totalSales: 0,
    totalTransactions: 0,
    unitAverage: 0,
    activeOrders: 0,
    kitchenQueue: 0,
    totalGuests: 0,
    statusBreakdown: {},
    logistics: {
      onRoad: 0,
      activeShifts: 0,
      deliveredToday: 0
    }
  });
  const [productMix, setProductMix] = useState<any[]>([]);
  const [velocity, setVelocity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    if (!currentUser?.restaurant_id) return;

    // Guard: Only allow Managers/Admins/SuperAdmins to fetch detailed analytics
    const hasAdminRights = ['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(currentUser.role);

    try {
      // Summary analytics might be okay for everyone if we want, but following existing RBAC
      const res = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/analytics/summary?restaurant_id=${currentUser.restaurant_id}`);
      if (!res.ok) {
        console.error("Analytics API error:", res.status);
        return;
      }
      const data = await res.json();
      if (data && data.totalSales !== undefined) {
        setStats(data);
      }

      // Detailed reports definitely need rights
      if (hasAdminRights) {
        const todayStr = new Date().toISOString().split('T')[0];
        const resMix = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/reports/product-mix?format=json&start=${todayStr}T00:00:00Z&end=${todayStr}T23:59:59Z`);
        const resVel = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/reports/velocity?format=json&start=${todayStr}T00:00:00Z&end=${todayStr}T23:59:59Z`);

        if (resMix.ok) {
          const pmixData = await resMix.json();
          setProductMix(pmixData.data?.slice(0, 5) || []);
        }
        if (resVel.ok) {
          const velData = await resVel.json();
          setVelocity(velData.data || []);
        }
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
    <div className="h-full p-4 sm:p-6 lg:p-8 overflow-y-auto custom-scrollbar bg-[#020617] w-full">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
            <span className="text-[9px] sm:text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">{currentUser?.restaurant_id ? 'Live System' : 'Offline Mode'}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif font-black text-white tracking-tighter uppercase transition-all leading-none">
            {currentRestaurant?.name || 'FireFlow'} <span className="text-slate-500 font-normal block sm:inline mt-1 sm:mt-0">Dashboard</span>
          </h1>
          <p className="text-[8px] sm:text-[9px] text-slate-600 font-bold uppercase tracking-[0.2em] mt-2 sm:mt-1">Cravex Solutions Pakistan</p>
        </div>

        <div className="w-full sm:w-auto flex gap-3">
          <div className="w-full sm:w-auto bg-slate-900/50 border border-slate-800 px-4 py-2 sm:py-3 rounded-xl text-left sm:text-right">
            <div className="text-[9px] sm:text-[10px] text-slate-500 uppercase font-black">Fireflow POS</div>
            <div className="text-[10px] sm:text-xs font-mono text-emerald-400 mt-0.5">Ver 3.0.1 - {currentRestaurant?.slug || 'POS-01'}</div>
          </div>
        </div>
      </div>

      {/* TOP ROW: FINANCIALS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
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

      {/* FINANCIAL BREAKDOWN ROW */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        <div className="bg-slate-900/40 border border-emerald-500/20 rounded-2xl p-4 flex flex-col justify-center">
            <span className="text-[9px] text-emerald-400 font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Utensils size={10} /> Dine-In</span>
            <span className="text-lg font-serif text-white font-black lg:truncate tracking-tighter">Rs. {stats.breakdown?.dineIn?.toLocaleString() || 0}</span>
        </div>
        <div className="bg-slate-900/40 border border-yellow-500/20 rounded-2xl p-4 flex flex-col justify-center">
            <span className="text-[9px] text-yellow-400 font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><ShoppingBag size={10} /> Takeaway</span>
            <span className="text-lg font-serif text-white font-black lg:truncate tracking-tighter">Rs. {stats.breakdown?.takeaway?.toLocaleString() || 0}</span>
        </div>
        <div className="bg-slate-900/40 border border-blue-500/20 rounded-2xl p-4 flex flex-col justify-center">
            <span className="text-[9px] text-blue-400 font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Bike size={10} /> Delivery</span>
            <span className="text-lg font-serif text-white font-black lg:truncate tracking-tighter">Rs. {stats.breakdown?.delivery?.toLocaleString() || 0}</span>
        </div>
        <div className="bg-[#0B0F19]/80 border border-red-500/20 rounded-2xl p-4 flex flex-col justify-center">
            <span className="text-[9px] text-red-400 font-black uppercase tracking-widest mb-1.5">Tax Collected</span>
            <span className="text-lg font-serif text-slate-300 lg:truncate tracking-tighter">Rs. {stats.breakdown?.tax?.toLocaleString() || 0}</span>
        </div>
        <div className="bg-[#0B0F19]/80 border border-red-500/20 rounded-2xl p-4 flex flex-col justify-center">
            <span className="text-[9px] text-red-400 font-black uppercase tracking-widest mb-1.5">Svc Charge</span>
            <span className="text-lg font-serif text-slate-300 lg:truncate tracking-tighter">Rs. {stats.breakdown?.serviceCharge?.toLocaleString() || 0}</span>
        </div>
        <div className="bg-[#0B0F19]/80 border border-red-500/20 rounded-2xl p-4 flex flex-col justify-center">
            <span className="text-[9px] text-red-400 font-black uppercase tracking-widest mb-1.5">Discounts Given</span>
            <span className="text-lg font-serif text-slate-300 lg:truncate tracking-tighter">Rs. {stats.breakdown?.discount?.toLocaleString() || 0}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* LOGISTICS COMMAND - NEW */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-4 mt-8 lg:mt-0">
            <Navigation size={16} className="text-indigo-400" />
            <h3 className="text-white text-xs font-black uppercase tracking-[0.2em]">Fleet Intelligence</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 w-full">
            <div className="bg-slate-900/30 border border-slate-800/60 p-4 md:p-5 rounded-2xl flex flex-col justify-between aspect-square md:aspect-auto">
              <div className="text-indigo-400 mb-2"><Bike size={20} className="md:w-6 md:h-6" /></div>
              <div>
                <div className="text-2xl md:text-3xl font-black text-white leading-none">{stats.logistics?.onRoad || 0}</div>
                <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mt-1 md:mt-2 line-clamp-2 leading-tight">On The Road</div>
              </div>
            </div>
            <div className="bg-slate-900/30 border border-slate-800/60 p-4 md:p-5 rounded-2xl flex flex-col justify-between aspect-square md:aspect-auto">
              <div className="text-emerald-400 mb-2"><Zap size={20} className="md:w-6 md:h-6" /></div>
              <div>
                <div className="text-2xl md:text-3xl font-black text-white leading-none">{stats.logistics?.activeShifts || 0}</div>
                <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mt-1 md:mt-2 line-clamp-2 leading-tight">Active Capacity</div>
              </div>
            </div>
            <div className="bg-slate-900/30 border border-slate-800/60 p-4 md:p-5 rounded-2xl flex flex-col justify-between col-span-2 md:col-span-1">
              <div className="text-blue-400 mb-2 hidden md:block"><ShoppingBag size={24} /></div>
              <div className="flex md:flex-col items-center flex-row justify-between w-full h-full">
                <div className="flex items-center gap-3 md:hidden">
                  <ShoppingBag size={18} className="text-blue-400" />
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Fulfilled Today</div>
                </div>
                <div className="text-2xl md:text-3xl font-black text-white leading-none">{stats.logistics?.deliveredToday || 0}</div>
                <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mt-2 hidden md:block">Fulfilled Today</div>
              </div>
            </div>
            
            <div className="bg-slate-900/30 border border-slate-800/60 p-4 md:p-5 rounded-2xl flex flex-col justify-between">
              <div className="text-purple-400 mb-2"><Users size={20} className="md:w-6 md:h-6" /></div>
              <div>
                <div className="text-2xl md:text-3xl font-black text-white leading-none">{stats.totalGuests || 0}</div>
                <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mt-1 md:mt-2">Seated Guests</div>
              </div>
            </div>
          </div>
        </div>

        {/* OPERATIONS CONFIGURE */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <Activity size={16} className="text-red-400" />
            <h3 className="text-white text-xs font-black uppercase tracking-[0.2em]">Operational Flux</h3>
          </div>
          <Card className="p-6 border-slate-800 bg-[#0f172a]/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Kitchen Pressure</div>
              <div className={`text-xl font-black ${stats.kitchenQueue > 10 ? 'text-red-500' : 'text-white'}`}>{stats.kitchenQueue}</div>
            </div>
            <div className="w-full bg-slate-800/50 h-1 rounded-full overflow-hidden mb-6">
              <div
                className={`h-full transition-all duration-1000 ${stats.kitchenQueue > 10 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-gold-500'}`}
                style={{ width: `${Math.min((stats.kitchenQueue / 20) * 100, 100)}%` }}
              ></div>
            </div>

            <div className="space-y-3">
              {Object.entries(stats.statusBreakdown || {}).map(([status, count]: any) => (
                <div key={status} className="flex justify-between items-center bg-slate-950/40 p-2 px-3 rounded-lg border border-slate-800/30">
                  <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{status}</span>
                  <span className="text-[11px] text-white font-mono font-bold bg-white/5 w-6 h-6 flex items-center justify-center rounded">{count}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

      </div>

      {/* CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8 pb-10">

        {/* VELOCITY CHART */}
        <div className="bg-[#0B0F19]/50 border border-slate-800/80 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <HeartPulse size={16} className="text-rose-400" />
            <h3 className="text-white text-xs font-black uppercase tracking-[0.2em]">Sales Velocity (Today)</h3>
          </div>
          <div className="h-64">
            {velocity.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 font-mono text-xs">Awaiting data...</div>
            ) : (
              <ResponsiveContainer key={`vel-${velocity.length}`} width="99%" height="100%" minWidth={1} minHeight={1} debounce={50}>
                <AreaChart data={velocity}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="hour" stroke="#334155" fontSize={10} tickFormatter={(val) => `${val}:00`} />
                  <YAxis stroke="#334155" fontSize={10} tickFormatter={(val) => `Rs.${val / 1000}k`} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                    itemStyle={{ color: '#10b981', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorSales)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* PMIX CHART */}
        <div className="bg-[#0B0F19]/50 border border-slate-800/80 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp size={16} className="text-gold-500" />
            <h3 className="text-white text-xs font-black uppercase tracking-[0.2em]">Product Mix (Top 5)</h3>
          </div>
          <div className="h-64">
            {productMix.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 font-mono text-xs">Awaiting data...</div>
            ) : (
              <ResponsiveContainer key={`pmix-${productMix.length}`} width="99%" height="100%" minWidth={1} minHeight={1} debounce={50}>
                <BarChart data={productMix} layout="vertical" margin={{ left: -20 }}>
                  <XAxis type="number" stroke="#334155" fontSize={10} />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} width={120} tick={{ fill: '#94a3b8' }} />
                  <RechartsTooltip
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                    itemStyle={{ color: '#eab308', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="quantity" fill="#eab308" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
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
