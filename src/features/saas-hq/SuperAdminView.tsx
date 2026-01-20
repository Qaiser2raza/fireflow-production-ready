import React, { useState, useEffect } from 'react';
import {
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  CreditCard,
  AlertCircle,
  Phone,
  MapPin,
  Crown,
  Shield,
  Activity,
  Zap,
  LayoutDashboard,
  Eye,
  X,
  Trash2,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Lock as LockIcon,
  DollarSign
} from 'lucide-react';
import { useAppContext } from '../../client/App';

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  phone: string;
  address: string;
  city: string;
  subscription_plan: string;
  subscription_status: 'trial' | 'active' | 'expired';
  monthly_fee: number;
  currency: string;
  created_at: string;
}

interface RestaurantWithOwner extends Restaurant {
  ownerName?: string;
  ownerPhone?: string;
  orderCount: number;
}

interface SubscriptionPayment {
  id: string;
  restaurant_id: string;
  amount: number;
  payment_method: string;
  payment_proof?: string;
  transaction_id?: string;
  status: 'pending' | 'verified' | 'rejected';
  notes?: string;
  created_at: Date;
}

export const SuperAdminView: React.FC = () => {
  const { logout } = useAppContext();
  const [restaurants, setRestaurants] = useState<RestaurantWithOwner[]>([]);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'restaurants' | 'payments'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'trial' | 'active' | 'expired'>('all');
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const API_BASE = 'http://localhost:3001/api';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Restaurants via Local API
      const res = await fetch(`${API_BASE}/restaurants`);
      const restaurantData = await res.json();
      if (!res.ok) throw new Error(restaurantData.error);

      // 2. Fetch Relational Data (Owners and Order Counts)
      const restaurantsWithOwners: RestaurantWithOwner[] = await Promise.all(
        (restaurantData || []).map(async (r: any) => {
          // Fetch Manager for this restaurant
          const staffRes = await fetch(`${API_BASE}/staff?restaurant_id=${r.id}&role=MANAGER`);
          const staffData = await staffRes.json();
          const owner = Array.isArray(staffData) ? staffData[0] : null;

          // Fetch Order Count for Safety Checks
          const orderRes = await fetch(`${API_BASE}/orders?restaurant_id=${r.id}`);
          const orderData = await orderRes.json();

          return {
            ...r,
            createdAt: new Date(r.created_at),
            ownerName: owner?.name,
            ownerPhone: owner?.phone,
            orderCount: Array.isArray(orderData) ? orderData.length : 0
          };
        })
      );

      setRestaurants(restaurantsWithOwners);

      // 3. Fetch Payments
      const payRes = await fetch(`${API_BASE}/subscription_payments`);
      const paymentData = await payRes.json();
      if (Array.isArray(paymentData)) {
        setPayments(paymentData.map((p: any) => ({
          ...p,
          created_at: new Date(p.created_at)
        })));
      }

    } catch (error) {
      console.error('Failed to fetch admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSystemReset = async () => {
    const confirmReset = window.confirm(
      "CRITICAL DEV ACTION: This will wipe ALL active orders and reset tables to available. Menu and Staff are safe. Proceed?"
    );
    if (!confirmReset) return;

    setIsResetting(true);
    try {
      const response = await fetch(`${API_BASE}/system/dev-reset`, { method: 'POST' });
      if (response.ok) {
        alert("System Cleaned!");
        fetchData();
      } else {
        throw new Error("Server failed to reset.");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteRestaurant = async (restaurant: RestaurantWithOwner) => {
    if (restaurant.orderCount > 0) {
      alert(`Access Denied: ${restaurant.name} has ${restaurant.orderCount} existing orders. Clear them first.`);
      return;
    }

    if (!window.confirm(`DANGER: Permanently wipe all data for ${restaurant.name}?`)) return;

    try {
      setIsDeleting(restaurant.id);
      const res = await fetch(`${API_BASE}/restaurants?id=eq.${restaurant.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');

      alert(`"${restaurant.name}" has been wiped.`);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsDeleting(null);
    }
  };

  const filteredRestaurants = restaurants.filter(r => {
    const term = searchQuery.toLowerCase();
    const matchesSearch = r.name.toLowerCase().includes(term) || r.city?.toLowerCase().includes(term);
    const matchesFilter = filterStatus === 'all' || r.subscription_status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const monthlyRevenue = restaurants
    .filter(r => r.subscription_status === 'active')
    .reduce((sum, r) => sum + (Number(r.monthly_fee) || 0), 0);

  if (loading && restaurants.length === 0) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950">
        <Shield size={48} className="text-gold-500 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col overflow-hidden text-slate-200">

      {/* HEADER */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-950 border-b border-slate-800 p-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gold-500 rounded-xl flex items-center justify-center">
              <Shield size={24} className="text-slate-950" />
            </div>
            <div>
              <h1 className="text-2xl font-serif text-white font-bold">Super Admin Dashboard</h1>
              <p className="text-slate-400 text-sm">Fireflow SaaS Management</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSystemReset}
              disabled={isResetting}
              className="px-4 py-2 bg-orange-600/20 border border-orange-500/50 rounded-lg flex items-center gap-2 hover:bg-orange-600 hover:text-white transition-all text-orange-400 font-bold text-sm"
            >
              {isResetting ? <RefreshCw size={16} className="animate-spin" /> : <AlertTriangle size={16} />}
              <span>Dev Reset</span>
            </button>

            <button onClick={fetchData} className="p-2 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-lg">
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>

            <button onClick={logout} className="p-2 text-slate-400 hover:text-red-400 bg-slate-900 border border-slate-800 rounded-lg">
              <XCircle size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 flex gap-2">
        {['overview', 'restaurants', 'payments'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === tab ? 'border-gold-500 text-gold-500' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KPICard title="Total Restaurants" value={restaurants.length} icon={<Building2 size={24} />} color="text-blue-500" bgColor="bg-blue-500/10" />
            <KPICard title="Active" value={restaurants.filter(r => r.subscription_status === 'active').length} icon={<CheckCircle2 size={24} />} color="text-green-500" bgColor="bg-green-500/10" />
            <KPICard title="Trial" value={restaurants.filter(r => r.subscription_status === 'trial').length} icon={<Clock size={24} />} color="text-yellow-500" bgColor="bg-yellow-500/10" />
            <KPICard title="Revenue" value={`Rs. ${monthlyRevenue.toLocaleString()}`} icon={<DollarSign size={24} />} color="text-gold-500" bgColor="bg-gold-500/10" />
          </div>
        )}

        {activeTab === 'restaurants' && (
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-3 text-white outline-none focus:border-gold-500"
                />
              </div>
            </div>

            <div className="space-y-3">
              {filteredRestaurants.map(r => (
                <div key={r.id} className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex justify-between items-center">
                  <div>
                    <h3 className="text-white font-bold text-lg">{r.name}</h3>
                    <div className="text-slate-500 text-sm">{r.city} • {r.ownerName || 'No Manager'}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={r.subscription_status} />
                    <button
                      onClick={() => handleDeleteRestaurant(r)}
                      disabled={isDeleting === r.id}
                      className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg border border-red-500/20"
                    >
                      {isDeleting === r.id ? <Loader2 className="animate-spin" /> : <Trash2 size={18} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Image Modal */}
      {viewingImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4" onClick={() => setViewingImage(null)}>
          <img src={viewingImage} className="max-w-full max-h-full object-contain" alt="Proof" />
        </div>
      )}
    </div>
  );
};

const KPICard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: string; bgColor: string; }> = ({ title, value, icon, color, bgColor }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
    <div className="flex justify-between items-start mb-4">
      <span className="text-slate-400 text-xs uppercase tracking-wider font-bold">{title}</span>
      <div className={`${bgColor} ${color} p-2 rounded-lg`}>{icon}</div>
    </div>
    <div className="text-3xl font-bold text-white">{value}</div>
  </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const colors: any = { trial: 'bg-yellow-900/20 text-yellow-400 border-yellow-900/50', active: 'bg-green-900/20 text-green-400 border-green-900/50', expired: 'bg-red-900/20 text-red-400 border-red-900/50' };
  return <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${colors[status] || 'bg-slate-800'}`}>{status}</span>;
};