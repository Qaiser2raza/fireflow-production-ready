import React, { useState, useEffect, useMemo } from 'react';
import {
    Users,
    Search,
    TrendingUp,
    Clock,
    CreditCard,
    ChevronRight,
    Filter,
    Phone,
    MapPin,
    Award,
    Plus,
    Trash2,
    History,
    Zap
} from 'lucide-react';
import { useAppContext as useApp } from '../../client/contexts/AppContext';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';

interface CustomerAddress {
    id: string;
    label: string;
    full_address: string;
    landmarks?: string;
    is_default: boolean;
}

interface Customer {
    id: string;
    name?: string;
    phone: string;
    address?: string;
    notes?: string;
    created_at: string;
    total_orders?: number;
    last_order_at?: string;
    addresses?: CustomerAddress[];
    // Intelligence Metrics (Mocked for now, will be linked to backend)
    ltv?: number;
    aura_score?: number;
    segment?: 'VIP' | 'REGULAR' | 'CHURN_RISK' | 'NEW';
}

export const CustomersView: React.FC = () => {
    const { currentUser, addNotification } = useApp();
    const restaurantId = currentUser?.restaurant_id;
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showAddressModal, setShowAddressModal] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [fullHistory, setFullHistory] = useState<any[]>([]);

    // Form States
    const [customerForm, setCustomerForm] = useState({
        name: '',
        phone: '',
        address: '',
        notes: ''
    });

    const [addressForm, setAddressForm] = useState({
        label: 'Home',
        full_address: '',
        landmarks: '',
        is_default: false
    });

    const API_URL = 'http://localhost:3001/api';

    useEffect(() => {
        if (restaurantId) {
            loadCustomers();
        }
    }, [restaurantId]);

    const loadCustomers = async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${API_URL}/customers?restaurant_id=${restaurantId}`);
            if (!response.ok) throw new Error('Failed to load customers');
            const data = await response.json();

            setCustomers(data);
        } catch (error) {
            console.error(error);
            addNotification?.('error', 'Error loading customers');
        } finally {
            setLoading(false);
        }
    };

    const selectedCustomer = useMemo(() =>
        customers.find(c => c.id === selectedCustomerId),
        [customers, selectedCustomerId]
    );

    const filteredCustomers = customers.filter(c =>
        c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery)
    );

    const stats = {
        total: customers.length,
        vips: customers.filter(c => c.segment === 'VIP').length,
        avgLtv: customers.length ? Math.floor(customers.reduce((sum, c) => sum + (c.ltv || 0), 0) / customers.length) : 0
    };

    const handleAddCustomer = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const response = await fetchWithAuth(`${API_URL}/customers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...customerForm,
                    restaurant_id: restaurantId
                })
            });

            if (!response.ok) throw new Error('Failed to add customer');

            addNotification?.('success', 'Patron profile initialized');
            setShowAddModal(false);
            loadCustomers();
            setCustomerForm({ name: '', phone: '', address: '', notes: '' });
        } catch (error) {
            addNotification?.('error', 'Failed to save patron');
        }
    };

    const handleAddAddress = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCustomerId) return;

        try {
            // Note: Ensuring the endpoint matches the existing backend structure
            const response = await fetchWithAuth(`${API_URL}/customers/${selectedCustomerId}/addresses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(addressForm)
            });

            if (!response.ok) throw new Error('Failed to add address');

            addNotification?.('success', 'Address added to Aura index');
            setShowAddressModal(false);
            loadCustomers();
            setAddressForm({ label: 'Home', full_address: '', landmarks: '', is_default: false });
        } catch (error) {
            addNotification?.('error', 'Failed to save address');
        }
    };

    const handleDeletePatron = async () => {
        if (!selectedCustomerId || !window.confirm('Erase this patron from Aura Index? This action is permanent.')) return;
        try {
            const response = await fetchWithAuth(`${API_URL}/customers/${selectedCustomerId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Delete failed');
            addNotification?.('success', 'Patron erased successfully');
            setSelectedCustomerId(null);
            loadCustomers();
        } catch (error) {
            addNotification?.('error', 'Critical: Could not erase patron');
        }
    };

    const handleUpdatePatron = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const response = await fetchWithAuth(`${API_URL}/customers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...customerForm, id: selectedCustomerId, restaurant_id: restaurantId })
            });
            if (!response.ok) throw new Error('Update failed');
            addNotification?.('success', 'Profile identity updated');
            setShowEditModal(false);
            loadCustomers();
        } catch (error) {
            addNotification?.('error', 'Update synchronization failed');
        }
    };

    const fetchHistory = async () => {
        if (!selectedCustomerId) return;
        setShowHistory(true);
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${API_URL}/customers/${selectedCustomerId}`);
            const data = await response.json();
            setFullHistory(data.orders || []);
        } catch (error) {
            addNotification?.('error', 'History lookup failed');
        } finally {
            setLoading(false);
        }
    };

    if (loading && customers.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center bg-[#070b14]">
                <div className="flex flex-col items-center gap-4 text-center">
                    <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                    <p className="text-indigo-400 font-black text-xs uppercase tracking-widest mt-4">Syncing Patron Intelligence...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex h-screen bg-[#070b14] text-slate-200 overflow-hidden">
            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <header className="p-8 pb-4">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h1 className="text-4xl font-black text-white tracking-tighter uppercase mb-1 flex items-center gap-3">
                                <Users className="text-indigo-500" size={32} />
                                Patron Hub
                            </h1>
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">Advanced CRM & Loyalty Intelligence</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl px-6 py-3 flex flex-col items-end">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Avg. LTV</span>
                                <span className="text-xl font-black text-indigo-400">Rs. {stats.avgLtv.toLocaleString()}</span>
                            </div>
                            <button
                                onClick={() => setShowAddModal(true)}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 px-8 rounded-2xl text-xs uppercase tracking-widest shadow-xl shadow-indigo-600/20 transition-all flex items-center gap-2"
                            >
                                <Plus size={18} />
                                Register Patron
                            </button>
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-4 gap-4 mb-8">
                        {[
                            { label: 'Total Base', value: stats.total, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                            { label: 'VIP Segments', value: stats.vips, icon: Award, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                            { label: 'Retention Rate', value: '84%', icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                            { label: 'Aura Rating', value: '4.8', icon: Zap, color: 'text-indigo-400', bg: 'bg-indigo-500/10' }
                        ].map((stat, i) => (
                            <div key={i} className="bg-slate-900/40 border border-slate-800/50 p-6 rounded-[2rem] flex items-center gap-5 hover:border-indigo-500/30 transition-all group">
                                <div className={`w-14 h-14 rounded-2xl ${stat.bg} flex items-center justify-center ${stat.color} group-hover:scale-110 transition-transform`}>
                                    <stat.icon size={24} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</p>
                                    <p className="text-2xl font-black text-white">{stat.value}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Search & Filter Bar */}
                    <div className="flex gap-4 items-center">
                        <div className="relative flex-1 group">
                            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-500 transition-colors" size={20} />
                            <input
                                type="text"
                                placeholder="SEARCH BY NAME, PHONE, OR ADDRESS..."
                                className="w-full bg-slate-900/50 border border-slate-800 rounded-[1.5rem] pl-16 pr-6 py-5 text-sm font-bold focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all uppercase tracking-wider"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <button className="h-[62px] px-8 bg-slate-900/50 border border-slate-800 rounded-2xl flex items-center gap-3 text-slate-400 hover:text-white transition-all uppercase text-[10px] font-black tracking-widest">
                            <Filter size={18} />
                            Filters
                        </button>
                    </div>
                </header>

                {/* Main Grid */}
                <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {filteredCustomers.map((customer) => (
                            <div
                                key={customer.id}
                                onClick={() => setSelectedCustomerId(customer.id)}
                                className={`group p-6 rounded-[2.5rem] border transition-all cursor-pointer relative overflow-hidden ${selectedCustomerId === customer.id
                                    ? 'bg-indigo-600/10 border-indigo-500 shadow-2xl shadow-indigo-600/10'
                                    : 'bg-slate-900/30 border-slate-800 hover:border-slate-700 hover:bg-slate-900/50'
                                    }`}
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-indigo-500/10 transition-all"></div>

                                <div className="flex items-start justify-between mb-6 relative">
                                    <div className="w-16 h-16 rounded-[1.25rem] bg-indigo-600/20 flex items-center justify-center text-indigo-400 text-2xl font-black border border-indigo-500/20 group-hover:scale-105 transition-transform">
                                        {(customer.name?.[0] || 'P').toUpperCase()}
                                    </div>
                                    <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${customer.segment === 'VIP' ? 'bg-amber-500/20 text-amber-500 border border-amber-500/20' :
                                        customer.segment === 'REGULAR' ? 'bg-indigo-500/20 text-indigo-500 border border-indigo-500/20' :
                                            'bg-slate-800/50 text-slate-500 border border-slate-700'
                                        }`}>
                                        {customer.segment}
                                    </div>
                                </div>

                                <div className="mb-6">
                                    <h3 className="text-xl font-black text-white group-hover:text-indigo-400 transition-colors truncate uppercase tracking-tight">
                                        {customer.name || 'ANONYMOUS PATRON'}
                                    </h3>
                                    <div className="flex items-center gap-2 text-slate-500 mt-1">
                                        <Phone size={12} className="text-indigo-500" />
                                        <span className="text-xs font-mono font-bold">{customer.phone}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-800/50">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Lifetime Value</p>
                                        <p className="text-sm font-black text-white">Rs. {customer.ltv?.toLocaleString()}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Aura Score</p>
                                        <div className="flex items-center justify-end gap-1">
                                            <Zap size={12} className="text-indigo-400 fill-indigo-400" />
                                            <p className="text-sm font-black text-indigo-400">{customer.aura_score}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Clock size={12} className="text-slate-600" />
                                        <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">
                                            Last: {customer.last_order_at ? new Date(customer.last_order_at).toLocaleDateString() : 'NO HISTORY'}
                                        </span>
                                    </div>
                                    <ChevronRight className={`transition-all ${selectedCustomerId === customer.id ? 'translate-x-1 text-indigo-500' : 'text-slate-700 opacity-0 group-hover:opacity-100 group-hover:translate-x-1'}`} size={16} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Side Intelligence Panel */}
            <div className={`w-[450px] bg-[#0c111d] border-l border-slate-800 flex flex-col transition-all duration-500 ${selectedCustomerId ? 'translate-x-0' : 'translate-x-full absolute right-0'}`}>
                {selectedCustomer ? (
                    <div className="flex-1 flex flex-col p-8 overflow-y-auto">
                        <div className="flex justify-between items-start mb-10">
                            <div className="w-24 h-24 rounded-[2.5rem] bg-indigo-600/20 flex items-center justify-center text-4xl font-black text-indigo-400 border border-indigo-500/20 shadow-2xl shadow-indigo-600/10">
                                {(selectedCustomer.name?.[0] || '?').toUpperCase()}
                            </div>
                            <button
                                onClick={() => setSelectedCustomerId(null)}
                                className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center text-slate-500 hover:text-white transition-colors"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>

                        <div className="mb-8">
                            <h2 className="text-3xl font-black text-white tracking-tighter uppercase mb-2">{selectedCustomer.name || 'Anonymous Profile'}</h2>
                            <div className="flex items-center gap-4">
                                <span className={`px-4 py-1 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] border ${selectedCustomer.segment === 'VIP' ? 'bg-amber-500/20 text-amber-500 border-amber-500/20' : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20'
                                    }`}>
                                    {selectedCustomer.segment} LEVEL
                                </span>
                                <span className="text-slate-500 text-xs font-mono font-bold tracking-widest">{selectedCustomer.phone}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-10">
                            <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-[2rem]">
                                <History size={20} className="text-indigo-400 mb-3" />
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Orders</p>
                                <p className="text-2xl font-black text-white">{selectedCustomer.total_orders || 0}</p>
                            </div>
                            <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-[2rem]">
                                <CreditCard size={20} className="text-emerald-400 mb-3" />
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">LTV (Est)</p>
                                <p className="text-2xl font-black text-white">Rs. {selectedCustomer.ltv?.toLocaleString()}</p>
                            </div>
                        </div>

                        {/* Address Book Section */}
                        <div className="mb-10">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
                                    <MapPin size={14} className="text-indigo-500" /> Address Book
                                </h3>
                                <button
                                    onClick={() => setShowAddressModal(true)}
                                    className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
                                >
                                    <Plus size={16} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                {!selectedCustomer.addresses?.length ? (
                                    <div className="text-center py-8 bg-slate-900/20 rounded-3xl border border-dashed border-slate-800 text-slate-600 text-[10px] font-black uppercase tracking-widest">
                                        No addresses recorded
                                    </div>
                                ) : (
                                    selectedCustomer.addresses.map(addr => (
                                        <div key={addr.id} className="p-5 bg-slate-900/40 border border-slate-800 rounded-3xl flex items-center gap-4 group">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${addr.is_default ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-800 text-slate-500'}`}>
                                                <MapPin size={18} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-black text-white uppercase tracking-widest truncate">{addr.label}</p>
                                                <p className="text-xs text-slate-500 truncate">{addr.full_address}</p>
                                            </div>
                                            <button className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-red-500 transition-all">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="mt-auto pt-6 border-t border-slate-800/50">
                            <button className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-[1.5rem] uppercase text-xs tracking-[0.2em] shadow-xl shadow-indigo-600/20 transition-all mb-4 flex items-center justify-center gap-2">
                                <Zap size={16} />
                                Send Loyalty Bonus
                            </button>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => {
                                        setCustomerForm({
                                            name: selectedCustomer.name || '',
                                            phone: selectedCustomer.phone,
                                            address: selectedCustomer.address || '',
                                            notes: selectedCustomer.notes || ''
                                        });
                                        setShowEditModal(true);
                                    }}
                                    className="flex-1 py-4 bg-slate-900 hover:bg-slate-800 text-slate-400 font-black rounded-2xl border border-slate-800 uppercase text-[10px] tracking-widest transition-all"
                                >
                                    Edit Profile
                                </button>
                                <button
                                    onClick={fetchHistory}
                                    className="flex-1 py-4 bg-slate-900 hover:bg-slate-800 text-slate-400 font-black rounded-2xl border border-slate-800 uppercase text-[10px] tracking-widest transition-all"
                                >
                                    History
                                </button>
                                <button
                                    onClick={handleDeletePatron}
                                    className="p-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-black rounded-2xl border border-red-500/20 uppercase text-[10px] tracking-widest transition-all"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 opacity-10">
                        <Users size={80} className="text-slate-500 mb-6" />
                        <p className="text-xs font-black uppercase tracking-[0.4em] text-center">Select Patron for Insights</p>
                    </div>
                )}
            </div>

            {/* History Modal */}
            {showHistory && (
                <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-2xl flex items-center justify-center p-6">
                    <div className="bg-[#0c111d] border border-slate-800 w-full max-w-2xl rounded-[3rem] shadow-3xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-10 border-b border-slate-800 bg-slate-900/20 flex justify-between items-center">
                            <div>
                                <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Mission History</h2>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">{selectedCustomer?.name}'s Aura Logs</p>
                            </div>
                            <button onClick={() => setShowHistory(false)} className="p-4 bg-slate-800 hover:bg-slate-700 rounded-2xl transition-all">
                                <Trash2 size={20} className="rotate-45" />
                            </button>
                        </div>
                        <div className="p-10 overflow-y-auto space-y-6 custom-scrollbar">
                            {!fullHistory.length ? (
                                <div className="py-20 text-center text-slate-700 font-black uppercase tracking-widest opacity-30">No Missions Recorded</div>
                            ) : (
                                fullHistory.map((order: any) => (
                                    <div key={order.id} className="p-6 bg-slate-900/50 border border-slate-800 rounded-3xl flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 flex items-center justify-center text-indigo-400">
                                                <History size={20} />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{new Date(order.created_at).toLocaleDateString()}</p>
                                                <p className="text-sm font-black text-white uppercase">{order.type} #{order.id.split('-').pop()}</p>
                                            </div>
                                        </div>
                                        <p className="text-lg font-black text-indigo-400">Rs. {Number(order.total).toLocaleString()}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {showEditModal && (
                <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6">
                    <div className="bg-[#0c111d] border border-slate-800 w-full max-w-xl rounded-[3rem] shadow-3xl overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-10 border-b border-slate-800 bg-slate-900/20">
                            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Edit Identity</h2>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">Modify Patron Aura Index</p>
                        </div>
                        <form onSubmit={handleUpdatePatron} className="p-10 space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
                                    <input
                                        type="text" required
                                        className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white font-bold focus:border-indigo-500 outline-none"
                                        value={customerForm.name}
                                        onChange={e => setCustomerForm({ ...customerForm, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Phone String</label>
                                    <input
                                        type="tel" required
                                        className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white font-bold focus:border-indigo-500 outline-none"
                                        value={customerForm.phone}
                                        onChange={e => setCustomerForm({ ...customerForm, phone: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-4 pt-6">
                                <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 py-5 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 font-black uppercase text-xs tracking-widest hover:bg-slate-800 transition-all">Cancel</button>
                                <button type="submit" className="flex-1 py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-500 shadow-xl shadow-indigo-600/20 transition-all">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modals Implemented Inline for Design Consistency */}
            {showAddModal && (
                <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6">
                    <div className="bg-[#0c111d] border border-slate-800 w-full max-w-xl rounded-[3rem] shadow-3xl overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-10 border-b border-slate-800 bg-slate-900/20">
                            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Patron Registration</h2>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">Create new profile in Aura database</p>
                        </div>
                        <form onSubmit={handleAddCustomer} className="p-10 space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
                                    <input
                                        type="text" required
                                        className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white font-bold focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                                        value={customerForm.name}
                                        onChange={e => setCustomerForm({ ...customerForm, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Phone String</label>
                                    <input
                                        type="tel" required
                                        className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white font-bold focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                                        value={customerForm.phone}
                                        onChange={e => setCustomerForm({ ...customerForm, phone: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Primary Address</label>
                                <textarea
                                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white font-medium h-24 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                                    value={customerForm.address}
                                    onChange={e => setCustomerForm({ ...customerForm, address: e.target.value })}
                                />
                            </div>
                            <div className="flex gap-4 pt-6">
                                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-5 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 font-black uppercase text-xs tracking-widest hover:bg-slate-800 transition-all">Cancel</button>
                                <button type="submit" className="flex-1 py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-500 shadow-xl shadow-indigo-600/20 transition-all">Initialize Patron</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {showAddressModal && (
                <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6">
                    <div className="bg-[#0c111d] border border-slate-800 w-full max-w-lg rounded-[3rem] shadow-3xl overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-8 border-b border-slate-800 bg-slate-900/20">
                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Add Location</h2>
                        </div>
                        <form onSubmit={handleAddAddress} className="p-8 space-y-6">
                            <div className="grid grid-cols-3 gap-3">
                                {['Home', 'Office', 'Other'].map(l => (
                                    <button
                                        key={l}
                                        type="button"
                                        onClick={() => setAddressForm({ ...addressForm, label: l })}
                                        className={`p-4 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${addressForm.label === l ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:border-slate-700'}`}
                                    >
                                        {l}
                                    </button>
                                ))}
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black tracking-widest text-slate-500 ml-1">FULL ADDRESS</label>
                                <textarea
                                    required
                                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white font-medium h-24 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all"
                                    value={addressForm.full_address}
                                    onChange={e => setAddressForm({ ...addressForm, full_address: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black tracking-widest text-slate-500 ml-1">LANDMARKS (OPTIONAL)</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white font-medium focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all"
                                    value={addressForm.landmarks}
                                    onChange={e => setAddressForm({ ...addressForm, landmarks: e.target.value })}
                                />
                            </div>
                            <div className="flex items-center gap-3 ml-1">
                                <input
                                    type="checkbox"
                                    id="default_check"
                                    checked={addressForm.is_default}
                                    onChange={e => setAddressForm({ ...addressForm, is_default: e.target.checked })}
                                    className="accent-indigo-500"
                                />
                                <label htmlFor="default_check" className="text-[10px] font-black uppercase tracking-widest text-slate-400">Set as default location</label>
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowAddressModal(false)}
                                    className="flex-1 py-4 bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 font-black uppercase tracking-widest text-[10px] hover:bg-slate-800 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-indigo-600/20 transition-all"
                                >
                                    Save Location
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
