
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Restaurant, Server } from '../types';
import { 
  Building2, 
  Users, 
  DollarSign, 
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  Download,
  CreditCard,
  AlertCircle,
  Calendar,
  Phone,
  MapPin,
  Crown,
  Shield,
  Activity,
  Zap,
  LayoutDashboard,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  X,
  Trash2,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Lock as LockIcon
} from 'lucide-react';
import { formatCurrency, useRestaurant } from '../RestaurantContext';
import { useAppContext } from '../App';

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
  const [activeTab, setActiveTab] = useState<'overview' | 'restaurants' | 'payments'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'trial' | 'active' | 'expired'>('all');
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: restaurantData, error: restaurantError } = await supabase
        .from('restaurants')
        .select('*')
        .order('created_at', { ascending: false });

      if (restaurantError) throw restaurantError;

      const restaurantsWithOwners: RestaurantWithOwner[] = await Promise.all(
        (restaurantData || []).map(async (r: any) => {
          // Fetch owner details
          const { data: ownerData } = await supabase
            .from('staff')
            .select('name, email')
            .eq('restaurant_id', r.id)
            .eq('role', 'MANAGER')
            .limit(1)
            .maybeSingle();

          // Fetch order count for safety check
          const { count: orderCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('restaurant_id', r.id);

          return {
            id: r.id,
            name: r.name,
            slug: r.slug,
            phone: r.phone,
            address: r.address,
            city: r.city,
            subscriptionPlan: r.subscription_plan,
            subscriptionStatus: r.subscription_status,
            trialEndsAt: new Date(r.trial_ends_at),
            subscriptionExpiresAt: new Date(r.subscription_expires_at),
            monthlyFee: r.monthly_fee,
            currency: r.currency,
            taxRate: r.tax_rate,
            serviceChargeRate: r.service_charge_rate,
            timezone: r.timezone,
            logo: r.logo,
            primaryColor: r.primary_color,
            createdAt: new Date(r.created_at),
            isActive: r.is_active,
            ownerId: r.owner_id,
            ownerName: ownerData?.name,
            ownerPhone: ownerData?.email?.replace('@fireflow.local', ''),
            orderCount: orderCount || 0
          };
        })
      );

      setRestaurants(restaurantsWithOwners);

      const { data: paymentData, error: paymentError } = await supabase
        .from('subscription_payments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!paymentError && paymentData) {
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

  const handleDeleteRestaurant = async (restaurant: RestaurantWithOwner) => {
    const { id, name, orderCount, subscriptionStatus } = restaurant;

    // SAFETY RULE 1: No orders allowed
    if (orderCount > 0) {
      alert(`Access Denied: Business "${name}" has ${orderCount} existing orders. Records must be cleared before deletion.`);
      return;
    }

    // SAFETY RULE 2: No active/trial subscriptions
    if (subscriptionStatus === 'active' || subscriptionStatus === 'trial') {
      alert(`Access Denied: Business "${name}" has an active/trial subscription. Cancel or expire the subscription first.`);
      return;
    }

    // TRIPLE CONFIRMATION
    const confirm1 = window.confirm(`DANGER: You are about to permanently delete "${name}". This action is irreversible.`);
    if (!confirm1) return;

    const confirmPrompt = window.prompt(`To proceed, type the business name exactly as shown below:\n\n${name}`);
    if (confirmPrompt !== name) {
      alert("Name mismatch. Deletion aborted.");
      return;
    }

    const confirm3 = window.confirm(`FINAL WARNING: This will wipe all staff profiles, menu data, and settings for "${name}". Continue?`);
    if (!confirm3) return;

    try {
      setIsDeleting(id);
      
      await supabase.from('restaurants').update({ owner_id: null }).eq('id', id);

      const tablesToClean = [
        'staff', 
        'menu_items', 
        'tables', 
        'sections', 
        'subscription_payments', 
        'transactions'
      ];

      for (const table of tablesToClean) {
        await supabase.from(table).delete().eq('restaurant_id', id);
      }

      const { error } = await supabase
        .from('restaurants')
        .delete()
        .eq('id', id);

      if (error) throw error;

      alert(`"${name}" has been wiped from the system.`);
      setRestaurants(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      alert(`Wipe failed: ${err.message || 'Check database constraints'}`);
    } finally {
      setIsDeleting(null);
    }
  };

  const totalRestaurants = restaurants.length;
  const activeRestaurants = restaurants.filter(r => r.subscriptionStatus === 'active').length;
  const trialRestaurants = restaurants.filter(r => r.subscriptionStatus === 'trial').length;
  const expiredRestaurants = restaurants.filter(r => r.subscriptionStatus === 'expired').length;
  
  const monthlyRevenue = restaurants
    .filter(r => r.subscriptionStatus === 'active')
    .reduce((sum, r) => sum + r.monthlyFee, 0);

  const pendingPaymentsCount = payments.filter(p => p.status === 'pending').length;

  const filteredRestaurants = restaurants.filter(r => {
    const term = (searchQuery || '').toLowerCase();
    const matchesSearch = 
      (r.name || '').toLowerCase().includes(term) ||
      (r.city || '').toLowerCase().includes(term) ||
      (r.ownerName || '').toLowerCase().includes(term) ||
      (r.phone || '').includes(searchQuery);
    
    const matchesFilter = 
      filterStatus === 'all' || 
      r.subscriptionStatus === filterStatus;
    
    return matchesSearch && matchesFilter;
  });

  const handleApprovePayment = async (paymentId: string, restaurantId: string) => {
    try {
      const { data: restaurant, error: fetchErr } = await supabase
        .from('restaurants')
        .select('subscription_expires_at')
        .eq('id', restaurantId)
        .single();

      if (fetchErr || !restaurant) throw new Error('Restaurant not found');

      const currentExpiry = restaurant.subscription_expires_at 
        ? new Date(restaurant.subscription_expires_at)
        : new Date();
      
      const now = new Date();
      const baseDate = currentExpiry > now ? currentExpiry : now;
      
      const newExpiry = new Date(baseDate);
      newExpiry.setDate(newExpiry.getDate() + 30);

      const { error: pError } = await supabase
        .from('subscription_payments')
        .update({ status: 'verified' })
        .eq('id', paymentId);

      if (pError) throw pError;

      const { error: rError } = await supabase
        .from('restaurants')
        .update({
          subscription_status: 'active',
          subscription_expires_at: newExpiry.toISOString()
        })
        .eq('id', restaurantId);

      if (rError) throw rError;

      alert('Payment approved! Subscription extended by 30 days.');
      fetchData();
    } catch (error: any) {
      alert(`Approval Failed: ${error.message || JSON.stringify(error)}`);
    }
  };

  const handleRejectPayment = async (paymentId: string) => {
    const reason = prompt('Reason for rejection:');
    if (!reason) return;

    try {
      const { error } = await supabase
        .from('subscription_payments')
        .update({
          status: 'rejected',
          notes: reason
        })
        .eq('id', paymentId);

      if (error) throw error;

      alert('Payment rejected');
      fetchData();
    } catch (error: any) {
      alert(`Rejection Failed: ${error.message || JSON.stringify(error)}`);
    }
  };

  if (loading && restaurants.length === 0) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <Shield size={48} className="text-gold-500 animate-pulse mx-auto mb-4" />
          <p className="text-slate-400 uppercase tracking-widest text-sm">Loading Admin Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col overflow-hidden text-slate-200">
      
      <div className="bg-gradient-to-r from-slate-900 to-slate-950 border-b border-slate-800 p-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-gold-500 to-gold-600 rounded-xl flex items-center justify-center shadow-lg shadow-gold-500/20">
              <Shield size={24} className="text-slate-950" />
            </div>
            <div>
              <h1 className="text-2xl font-serif text-white font-bold">Super Admin Dashboard</h1>
              <p className="text-slate-400 text-sm">Fireflow SaaS Management</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={fetchData}
              className="p-2 text-slate-400 hover:text-white transition-colors bg-slate-900 border border-slate-800 rounded-lg flex items-center gap-2"
              title="Refresh Data"
            >
              <cite><RefreshCw size={18} className={loading ? 'animate-spin text-gold-500' : ''} /></cite>
            </button>
            <div className="px-4 py-2 bg-green-900/20 border border-green-900/50 rounded-lg flex items-center gap-2">
              <Activity size={16} className="text-green-500 animate-pulse" />
              <span className="text-green-400 text-sm font-bold uppercase tracking-wider">System Online</span>
            </div>
            <button 
              onClick={logout}
              className="p-2 text-slate-400 hover:text-red-400 transition-colors bg-slate-900 border border-slate-800 rounded-lg"
            >
              <cite><XCircle size={20} /></cite>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border-b border-slate-800 px-6 flex gap-2">
        {[
          { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={16} /> },
          { id: 'restaurants', label: 'Restaurants', icon: <Building2 size={16} /> },
          { id: 'payments', label: 'Payments', icon: <CreditCard size={16} />, badge: pendingPaymentsCount }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors relative ${
              activeTab === tab.id
                ? 'border-gold-500 text-gold-500'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.badge && tab.badge > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <KPICard title="Total Restaurants" value={totalRestaurants} icon={<Building2 size={24} />} color="text-blue-500" bgColor="bg-blue-500/10" />
              <KPICard title="Active Subscriptions" value={activeRestaurants} icon={<CheckCircle2 size={24} />} color="text-green-500" bgColor="bg-green-500/10" />
              <KPICard title="Trial Period" value={trialRestaurants} icon={<Clock size={24} />} color="text-yellow-500" bgColor="bg-yellow-500/10" />
              <KPICard title="Monthly Revenue" value={`Rs. ${monthlyRevenue.toLocaleString()}`} icon={<DollarSign size={24} />} color="text-gold-500" bgColor="bg-gold-500/10" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
                  <cite><Zap className="text-gold-500" size={20} /></cite>
                  Recent Registrations
                </h3>
                <div className="space-y-3">
                  {restaurants.slice(0, 5).map(r => (
                    <div key={r.id} className="flex justify-between items-center p-3 bg-slate-950 rounded-lg border border-slate-800">
                      <div>
                        <div className="text-white font-medium">{r.name}</div>
                        <div className="text-slate-500 text-xs">{r.city} • {r.createdAt.toLocaleDateString()}</div>
                      </div>
                      <StatusBadge status={r.subscriptionStatus} />
                    </div>
                  ))}
                  {restaurants.length === 0 && (
                    <div className="text-center py-8 text-slate-600 text-sm">No registrations yet</div>
                  )}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h3 className="text-white font-bold text-lg mb-4 flex items-center gap-2">
                  <cite><AlertCircle className="text-yellow-500" size={20} /></cite>
                  Pending Verifications
                </h3>
                <div className="space-y-3">
                  {payments.filter(p => p.status === 'pending').slice(0, 5).map(p => {
                    const restaurant = restaurants.find(r => r.id === p.restaurant_id);
                    return (
                      <div key={p.id} className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                        <div className="flex justify-between items-start mb-2">
                          <div className="text-white font-medium">{restaurant?.name}</div>
                          <div className="text-gold-500 font-bold text-sm">Rs. {p.amount.toLocaleString()}</div>
                        </div>
                        <div className="text-slate-500 text-xs mb-3">{p.payment_method} • {p.transaction_id || 'No ID'}</div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprovePayment(p.id, p.restaurant_id)}
                            className="flex-1 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectPayment(p.id)}
                            className="flex-1 py-1.5 bg-red-900/20 hover:bg-red-900/50 text-red-400 text-xs font-bold rounded border border-red-900/50"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {payments.filter(p => p.status === 'pending').length === 0 && (
                    <div className="text-center py-8 text-slate-600 text-sm">No pending payments</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'restaurants' && (
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="text"
                  placeholder="Search Name, Phone, or Owner..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-3 text-white placeholder-slate-500 outline-none focus:border-gold-500"
                />
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-white outline-none focus:border-gold-500"
              >
                <option value="all">All Status</option>
                <option value="trial">Trial</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
              </select>
            </div>

            <div className="space-y-3">
              {filteredRestaurants.map(r => (
                <div key={r.id} className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-gold-500/50 transition-colors relative group">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-gold-500 to-gold-600 rounded-lg flex items-center justify-center text-slate-950 font-bold text-xl">
                        {(r.name || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-white font-bold text-lg">{r.name}</h3>
                        <div className="flex items-center gap-3 text-slate-400 text-sm mt-1">
                          <span className="flex items-center gap-1"><cite><MapPin size={12} /></cite> {r.city}</span>
                          <span className="flex items-center gap-1"><cite><Phone size={12} /></cite> {r.phone}</span>
                          <span className="flex items-center gap-1"><cite><Crown size={12} /></cite> {r.subscriptionPlan}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                       <StatusBadge status={r.subscriptionStatus} />
                       
                       {r.orderCount === 0 && (
                         <button 
                           disabled={isDeleting === r.id}
                           onClick={() => handleDeleteRestaurant(r)}
                           className={`p-2 rounded-lg border transition-all ${
                             isDeleting === r.id 
                              ? 'bg-red-900/20 border-red-500 text-red-500' 
                              : 'bg-red-600/10 border-red-600/30 text-red-500 hover:bg-red-600 hover:text-white hover:border-red-600'
                           }`}
                           title="Permanently Wipe Business"
                         >
                           {isDeleting === r.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                         </button>
                       )}
                       
                       {r.orderCount > 0 && (
                         <div className="flex items-center gap-1 text-[10px] font-bold text-slate-600 uppercase tracking-widest bg-slate-950 px-2 py-1.5 rounded border border-slate-800" title="Cannot delete business with active orders">
                            <cite><LockIcon size={12} /></cite> Protected
                         </div>
                       )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-800">
                    <div>
                      <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Owner</div>
                      <div className="text-white text-sm font-medium">{r.ownerName || 'Unknown'}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Registered</div>
                      <div className="text-white text-sm">{(r.createdAt instanceof Date ? r.createdAt : new Date()).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Order Count</div>
                      <div className={`text-sm font-bold ${r.orderCount > 0 ? 'text-blue-400' : 'text-slate-500'}`}>{r.orderCount} Orders</div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Monthly Fee</div>
                      <div className="text-gold-500 font-bold">Rs. {(Number(r.monthlyFee) || 0).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              ))}
              {filteredRestaurants.length === 0 && (
                <div className="text-center py-20 bg-slate-900 border border-slate-800 rounded-xl">
                   <cite><Building2 size={48} className="mx-auto text-slate-800 mb-4" /></cite>
                   <p className="text-slate-500">No restaurants found</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {payments.map(payment => {
                const restaurant = restaurants.find(r => r.id === payment.restaurant_id);
                
                return (
                  <div key={payment.id} className={`bg-slate-900 border rounded-xl p-6 transition-all ${payment.status === 'pending' ? 'border-gold-500/50 shadow-lg shadow-gold-500/5' : 'border-slate-800 opacity-80'}`}>
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-slate-400">
                           <cite><Building2 size={20} /></cite>
                        </div>
                        <div>
                          <div className="text-white font-bold text-lg">{restaurant?.name || 'Deleted'}</div>
                          <div className="text-slate-500 text-xs uppercase tracking-widest font-bold">
                            {payment.payment_method} • {payment.transaction_id || 'NO_TXN_ID'}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-gold-500 font-mono font-bold text-xl">
                          Rs. {(Number(payment.amount) || 0).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">
                          {new Date(payment.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {payment.payment_proof && (
                      <div className="mb-6 group relative">
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-lg cursor-pointer z-10" onClick={() => setViewingImage(payment.payment_proof!)}>
                           <cite><Eye size={32} className="text-white" /></cite>
                        </div>
                        <img 
                          src={payment.payment_proof} 
                          alt="Payment proof" 
                          className="w-full h-48 object-cover bg-slate-950 rounded-lg border border-slate-800"
                        />
                        <div className="text-[10px] text-slate-600 text-center mt-2 uppercase tracking-widest">Click to view proof</div>
                      </div>
                    )}

                    {payment.status === 'pending' ? (
                      <div className="flex gap-3 pt-4 border-t border-slate-800">
                        <button
                          onClick={() => handleApprovePayment(payment.id, payment.restaurant_id)}
                          className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold uppercase tracking-wider text-xs shadow-lg shadow-green-900/20"
                        >
                          Approve Extension
                        </button>
                        <button
                          onClick={() => handleRejectPayment(payment.id)}
                          className="flex-1 py-3 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-lg font-bold uppercase tracking-wider text-xs border border-red-900/50"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${
                          payment.status === 'verified' ? 'bg-green-900/20 text-green-400 border-green-900/50' : 'bg-red-900/20 text-red-400 border-red-900/50'
                        }`}>
                          {payment.status}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {payments.length === 0 && (
               <div className="text-center py-20 text-slate-600 italic">No payment submissions found</div>
            )}
          </div>
        )}
      </div>

      {viewingImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
           <button onClick={() => setViewingImage(null)} className="absolute top-6 right-6 text-white p-2 bg-white/10 rounded-full hover:bg-white/20 z-50">
             <cite><X size={32} /></cite>
           </button>
           <img 
             src={viewingImage} 
             alt="Proof large" 
             className="max-w-full max-h-full object-contain"
           />
        </div>
      )}
    </div>
  );
};

const KPICard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}> = ({ title, value, icon, color, bgColor }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
    <div className="flex justify-between items-start mb-4">
      <span className="text-slate-400 text-xs uppercase tracking-wider font-bold">{title}</span>
      <div className={`${bgColor} ${color} p-2 rounded-lg`}>{icon}</div>
    </div>
    <div className="text-3xl font-serif font-bold text-white">{value}</div>
  </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const colors = {
    trial: 'bg-yellow-900/20 text-yellow-400 border-yellow-900/50',
    active: 'bg-green-900/20 text-green-400 border-green-900/50',
    expired: 'bg-red-900/20 text-red-400 border-red-900/50',
    cancelled: 'bg-slate-700 text-slate-400 border-slate-600'
  };

  return (
    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${colors[status as keyof typeof colors] || colors.cancelled}`}>
      {status}
    </span>
  );
};
