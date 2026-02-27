import React, { useState, useEffect } from 'react';
import {
  Building2, Users, CreditCard, Zap, Search, Trash2,
  CheckCircle2, XCircle, Banknote, Loader2,
  Copy, Shield, ChevronRight,
  ExternalLink
} from 'lucide-react';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';
import { LicenseKey } from '../../shared/lib/cloudClient';

// ==========================================
// TYPES
// ==========================================

interface RestaurantWithOwner {
  id: string;
  name: string;
  city: string;
  subscription_status: 'trial' | 'active' | 'expired';
  subscription_plan: 'BASIC' | 'STANDARD' | 'PREMIUM';
  ownerName?: string;
  staffCount: number;
  orderCount: number;
  createdAt: string;
}

// ==========================================
// SUPER ADMIN VIEW
// ==========================================

export const SuperAdminView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'restaurants' | 'payments' | 'licenses'>('overview');
  const [restaurants, setRestaurants] = useState<RestaurantWithOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  // License management state
  const [licenses, setLicenses] = useState<LicenseKey[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<'BASIC' | 'STANDARD' | 'PREMIUM'>('BASIC');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isVerifying, setIsVerifying] = useState<string | null>(null);

  const API_BASE = 'http://localhost:3001/api';

  const fetchLicenses = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/super-admin/licenses`);
      const data = await res.json();
      setLicenses(data || []);
    } catch (err) {
      console.error('Failed to fetch licenses:', err);
    }
  };

  const fetchPayments = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/subscription_payments`);
      const data = await res.json();
      setPayments(data || []);
    } catch (err) {
      console.error('Failed to fetch payments:', err);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);

      // 1. Fetch Restaurants via Local API
      const res = await fetchWithAuth(`${API_BASE}/restaurants`);
      const data = await res.json();

      const formatted = await Promise.all(data.map(async (r: any) => {
        const staffRes = await fetchWithAuth(`${API_BASE}/staff?restaurant_id=${r.id}&role=MANAGER`);
        const staff = await staffRes.json();
        const orderRes = await fetchWithAuth(`${API_BASE}/orders?restaurant_id=${r.id}`);
        const orders = await orderRes.json();

        return {
          id: r.id,
          name: r.name,
          city: r.address?.split(',').pop()?.trim() || 'Remote',
          subscription_status: r.subscription_status,
          subscription_plan: r.subscription_plan,
          ownerName: staff[0]?.name || 'N/A',
          staffCount: Array.isArray(staff) ? staff.length : 0,
          orderCount: Array.isArray(orders) ? orders.length : 0,
          createdAt: r.created_at
        };
      }));

      setRestaurants(formatted);
      await fetchLicenses();
      await fetchPayments();
    } catch (error) {
      console.error('Failed to load HQ data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleVerifyPayment = async (id: string, status: 'verified' | 'rejected') => {
    try {
      setIsVerifying(id);
      const response = await fetchWithAuth(`${API_BASE}/super-admin/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: id, status, notes: status === 'rejected' ? 'Payment proof was not clear or transaction invalid' : 'Approved by admin' })
      });

      if (response.ok) {
        alert(`Payment ${status === 'verified' ? 'verified and subscription extended' : 'rejected'}.`);
        fetchData(); // Refresh all
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Verification failed');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsVerifying(null);
    }
  };

  const handleDeleteRestaurant = async (restaurant: RestaurantWithOwner) => {
    if (restaurant.orderCount > 0) {
      alert(`Access Denied: ${restaurant.name} has ${restaurant.orderCount} existing orders. Clear them first.`);
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${restaurant.name}? This cannot be undone.`)) return;

    try {
      setIsDeleting(restaurant.id);
      const res = await fetchWithAuth(`${API_BASE}/restaurants?id=${restaurant.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setRestaurants(prev => prev.filter(r => r.id !== restaurant.id));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(null);
    }
  };

  const filteredRestaurants = restaurants.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const monthlyRevenue = restaurants
    .filter(r => r.subscription_status === 'active')
    .reduce((acc, r) => acc + (r.subscription_plan === 'PREMIUM' ? 15000 : r.subscription_plan === 'STANDARD' ? 8000 : 5000), 0);

  if (loading) return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin text-gold-500" size={40} />
        <p className="text-slate-400 font-bold animate-pulse uppercase tracking-widest text-xs">Accessing Cloud HQ...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col">
      {/* Header */}
      <div className="bg-slate-900/50 border-b border-slate-800 p-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center text-gold-500 shadow-[0_0_20px_rgba(234,179,8,0.1)]">
              <Shield size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-serif font-bold text-white leading-none">FireFlow HQ</h1>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Enterprise Command Center</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-white font-bold text-sm">System Admin</div>
              <div className="text-green-500 text-[10px] font-black uppercase tracking-tighter flex items-center gap-1 justify-end">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Network Stable
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-slate-900/30 border-b border-slate-800 px-6">
        <div className="max-w-7xl mx-auto flex gap-8">
          {['overview', 'restaurants', 'payments', 'licenses'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all relative ${activeTab === tab ? 'border-gold-500 text-gold-500' : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
            >
              {tab}
              {activeTab === tab && <div className="absolute inset-x-0 bottom-0 h-4 bg-gold-500/10 blur-xl"></div>}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 overflow-y-auto">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <KPICard title="Total Partners" value={restaurants.length} icon={<Building2 size={20} />} color="text-blue-500" bgColor="bg-blue-500/10" />
            <KPICard title="Projected ARR" value={`Rs. ${(monthlyRevenue * 12).toLocaleString()}`} icon={<Banknote size={20} />} color="text-gold-500" bgColor="bg-gold-500/10" />
            <KPICard title="Active Licenses" value={licenses.filter(l => l.status === 'active').length} icon={<Zap size={20} />} color="text-purple-500" bgColor="bg-purple-500/10" />
            <StatusDistribution restaurants={restaurants} />
          </div>
        )}

        {activeTab === 'restaurants' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="text"
                  placeholder="Filter establishments by name or city..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-12 pr-4 py-4 text-white outline-none focus:border-gold-500/50 transition-all placeholder:text-slate-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {filteredRestaurants.map(r => (
                <div key={r.id} className="group bg-slate-900/50 border border-slate-800 hover:border-slate-700 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-center gap-6 transition-all">
                  <div className="flex items-center gap-5 flex-1">
                    <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-gold-500 transition-colors">
                      <Building2 size={28} />
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-xl flex items-center gap-2">
                        {r.name}
                        <StatusBadge status={r.subscription_status} />
                      </h3>
                      <div className="flex items-center gap-4 mt-1 text-slate-500 text-sm font-medium">
                        <span className="flex items-center gap-1"><Users size={14} /> {r.staffCount} Staff</span>
                        <span className="flex items-center gap-1"><CreditCard size={14} /> {r.subscription_plan}</span>
                        <span className="text-slate-600">ID: {r.id.substring(0, 8)}...</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDeleteRestaurant(r)}
                      disabled={isDeleting === r.id}
                      className="p-3 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-xl border border-transparent hover:border-red-500/20 transition-all"
                      title="Terminate Account"
                    >
                      {isDeleting === r.id ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />}
                    </button>
                    <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-all">
                      Manage <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-800/50">
                      <th className="px-6 py-4 text-left text-xs font-black uppercase text-slate-500 tracking-widest">Restaurant</th>
                      <th className="px-6 py-4 text-left text-xs font-black uppercase text-slate-500 tracking-widest">Amount</th>
                      <th className="px-6 py-4 text-left text-xs font-black uppercase text-slate-500 tracking-widest">Proof</th>
                      <th className="px-6 py-4 text-left text-xs font-black uppercase text-slate-500 tracking-widest">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-black uppercase text-slate-500 tracking-widest">Transaction</th>
                      <th className="px-6 py-4 text-right text-xs font-black uppercase text-slate-500 tracking-widest">Decision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {payments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-20 text-center">
                          <CreditCard className="mx-auto text-slate-800 mb-4" size={48} />
                          <p className="text-slate-600 font-bold uppercase tracking-widest text-xs">No payment submissions pending review</p>
                        </td>
                      </tr>
                    ) : (
                      payments.map(px => {
                        const restaurant = restaurants.find(r => r.id === px.restaurant_id);
                        return (
                          <tr key={px.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-6 py-5">
                              <div className="text-white font-bold">{restaurant?.name || 'Unknown Partner'}</div>
                              <div className="text-slate-500 text-xs font-medium">{new Date(px.created_at).toLocaleDateString()}</div>
                            </td>
                            <td className="px-6 py-5">
                              <div className="text-gold-500 font-black text-base">Rs. {Number(px.amount).toLocaleString()}</div>
                              <div className="text-slate-500 text-[10px] uppercase font-black">{px.payment_method || 'BANK'}</div>
                            </td>
                            <td className="px-6 py-5">
                              {(px.payment_proof || px.payment_proof_url) ? (
                                <button
                                  onClick={() => setViewingImage(px.payment_proof || px.payment_proof_url)}
                                  className="px-3 py-1 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white border border-blue-500/20 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                                >
                                  <ExternalLink size={12} /> View Proof
                                </button>
                              ) : (
                                <span className="text-slate-700 italic">No proof</span>
                              )}
                            </td>
                            <td className="px-6 py-5">
                              <StatusBadge status={px.status} />
                            </td>
                            <td className="px-6 py-5 font-mono text-slate-500 text-xs">{px.transaction_id}</td>
                            <td className="px-6 py-5 text-right">
                              {px.status === 'pending' && (
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => handleVerifyPayment(px.id, 'verified')}
                                    disabled={!!isVerifying}
                                    className="p-2.5 bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white border border-green-500/20 rounded-xl transition-all"
                                    title="Verify Payment"
                                  >
                                    {isVerifying === px.id ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                                  </button>
                                  <button
                                    onClick={() => handleVerifyPayment(px.id, 'rejected')}
                                    disabled={!!isVerifying}
                                    className="p-2.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 rounded-xl transition-all"
                                    title="Reject Submission"
                                  >
                                    {isVerifying === px.id ? <Loader2 size={18} className="animate-spin" /> : <XCircle size={18} />}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'licenses' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 relative overflow-hidden">
              {/* Background Decor */}
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-gold-500/5 rounded-full blur-3xl"></div>

              <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start md:items-end">
                <div className="flex-1 space-y-4">
                  <div>
                    <h2 className="text-2xl font-serif font-bold text-white leading-none">Mint License Keys</h2>
                    <p className="text-slate-500 text-sm mt-2">Generate cryptographically secure keys for enterprise partners.</p>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {['BASIC', 'STANDARD', 'PREMIUM'].map(plan => (
                      <button
                        key={plan}
                        onClick={() => setSelectedPlan(plan as any)}
                        className={`py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${selectedPlan === plan
                          ? 'bg-gold-500 border-gold-500 text-slate-950 shadow-[0_0_20px_rgba(234,179,8,0.3)]'
                          : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:border-slate-600'
                          }`}
                      >
                        {plan}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={async () => {
                    console.log('[HQ] Minting key via local API...');
                    setIsGenerating(true);
                    try {
                      const response = await fetchWithAuth(`${API_BASE}/super-admin/licenses/generate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ licenseType: selectedPlan })
                      });
                      const result = await response.json();
                      if (result.license_key) {
                        setGeneratedKey(result.license_key);
                        fetchLicenses();
                      } else if (result.error) {
                        alert(result.error);
                      }
                    } catch (err) {
                      console.error('Key generation error:', err);
                    }
                    setIsGenerating(false);
                  }}
                  disabled={isGenerating}
                  className="w-full md:w-auto h-16 px-10 bg-white text-slate-950 hover:bg-gold-500 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all disabled:opacity-50"
                >
                  {isGenerating ? <Loader2 size={20} className="animate-spin" /> : <Zap size={20} />}
                  Mint Key
                </button>
              </div>

              {generatedKey && (
                <div className="mt-8 bg-slate-950 border border-gold-500/50 rounded-2xl p-6 flex flex-col items-center animate-in zoom-in duration-300">
                  <p className="text-gold-500/50 text-[10px] font-black uppercase tracking-[0.3em] mb-3">Live Activation Key</p>
                  <code className="text-gold-500 text-4xl font-mono font-bold tracking-tighter mb-6">{generatedKey}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedKey);
                      alert('Key Copied!');
                    }}
                    className="flex items-center gap-2 text-white bg-slate-800 px-6 py-2 rounded-lg font-bold hover:bg-slate-700 transition-colors"
                  >
                    <Copy size={20} /> Copy to Clipboard
                  </button>
                </div>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-800/50">
                      <th className="px-6 py-5 text-left text-xs font-black uppercase text-slate-500 tracking-widest">Key Fingerprint</th>
                      <th className="px-6 py-5 text-left text-xs font-black uppercase text-slate-500 tracking-widest">Tier</th>
                      <th className="px-6 py-5 text-left text-xs font-black uppercase text-slate-500 tracking-widest">Status</th>
                      <th className="px-6 py-5 text-left text-xs font-black uppercase text-slate-500 tracking-widest">Linked Restaurant</th>
                      <th className="px-6 py-5 text-right text-xs font-black uppercase text-slate-500 tracking-widest">Ops</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {licenses.map(lic => (
                      <tr key={lic.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-5 font-mono text-gold-500/80 font-bold">{lic.key}</td>
                        <td className="px-6 py-5 text-white font-bold">{lic.plan}</td>
                        <td className="px-6 py-5">
                          <StatusBadge status={lic.status} />
                        </td>
                        <td className="px-6 py-5 text-slate-400 font-medium">{lic.restaurant_name || '—'}</td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => navigator.clipboard.writeText(lic.key)}
                              className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                            >
                              <Copy size={16} />
                            </button>
                            {lic.status !== 'revoked' && (
                              <button
                                onClick={async () => {
                                  if (window.confirm('Revoke this license? Cloud access will immediately terminate.')) {
                                    try {
                                      await fetchWithAuth(`${API_BASE}/super-admin/licenses/revoke?id=${lic.id}`, { method: 'DELETE' });
                                      fetchLicenses();
                                    } catch (err) {
                                      console.error('Revocation error:', err);
                                    }
                                  }
                                }}
                                className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                title="Revoke Key"
                              >
                                <XCircle size={18} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Image Modal */}
      {viewingImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setViewingImage(null)}>
          <div className="relative max-w-5xl max-h-[90vh]">
            <img src={viewingImage} className="max-w-full max-h-full object-contain border border-slate-800 rounded-2xl shadow-2xl shadow-black" alt="Proof of Payment" />
            <button className="absolute -top-12 right-0 text-white hover:text-gold-500 flex items-center gap-2 font-bold uppercase tracking-widest text-xs" onClick={() => setViewingImage(null)}>
              Close Preview <XCircle size={24} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// SUB-COMPONENTS
// ==========================================

const KPICard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}> = ({ title, value, icon, color, bgColor }) => (
  <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between h-32 relative overflow-hidden group hover:border-slate-700 transition-all">
    <div className="absolute -right-4 -bottom-4 text-slate-800 opacity-20 group-hover:scale-110 group-hover:opacity-30 transition-all duration-700">
      {React.isValidElement(icon) && React.cloneElement(icon as React.ReactElement<any>, { size: 80 })}
    </div>
    <div className="flex justify-between items-center relative z-10">
      <span className="text-slate-500 text-[10px] uppercase font-black tracking-[0.2em]">{title}</span>
      <div className={`${bgColor} ${color} p-2 rounded-xl`}>{icon}</div>
    </div>
    <div className="text-3xl font-serif font-black text-white relative z-10 leading-none">{value}</div>
  </div>
);

const StatusDistribution: React.FC<{ restaurants: RestaurantWithOwner[] }> = ({ restaurants }) => {
  const activeCount = restaurants.filter(r => r.subscription_status === 'active').length;
  const totalCount = restaurants.length;
  const percentage = totalCount > 0 ? (activeCount / totalCount) * 100 : 0;

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between h-32 hover:border-slate-700 transition-all">
      <div className="flex justify-between items-start">
        <span className="text-slate-500 text-[10px] uppercase font-black tracking-[0.2em]">Partner Health</span>
        <div className="text-green-500 text-xs font-black uppercase">{Math.round(percentage)}% Healthy</div>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-[10px] font-black uppercase text-slate-500 tracking-tighter">
          <span>{activeCount} Active</span>
          <span>{totalCount} Total</span>
        </div>
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all duration-1000" style={{ width: `${percentage}%` }}></div>
        </div>
      </div>
    </div>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const configs: any = {
    trial: { label: 'TRIAL', color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' },
    active: { label: 'ACTIVE', color: 'text-green-500 bg-green-500/10 border-green-500/20' },
    expired: { label: 'EXPIRED', color: 'text-red-500 bg-red-500/10 border-red-500/20' },
    revoked: { label: 'REVOKED', color: 'text-red-400 bg-red-950/20 border-red-900/40' },
    unused: { label: 'UNUSED', color: 'text-blue-400 bg-blue-900/20 border-blue-900/40' },
    verified: { label: 'VERIFIED', color: 'text-green-400 bg-green-950/20 border-green-900/40' },
    pending: { label: 'PENDING', color: 'text-amber-500 bg-amber-950/20 border-amber-900/40' },
    rejected: { label: 'REJECTED', color: 'text-red-500 bg-red-950/20 border-red-900/40' }
  };

  const config = configs[status] || { label: status.toUpperCase(), color: 'bg-slate-800 text-slate-400' };

  return (
    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black tracking-widest uppercase border ${config.color}`}>
      {config.label}
    </span>
  );
};