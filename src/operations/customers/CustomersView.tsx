import React, { useState, useEffect, useMemo } from 'react';
import {
    Users,
    Search,
    Printer,
    Clock,
    CreditCard,
    ChevronRight,
    Filter,
    Phone,
    MapPin,
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
    loyalty_score?: number;
    segment?: 'VIP' | 'REGULAR' | 'CHURN_RISK' | 'NEW';
    // KHATA / CREDIT extension
    credit_limit?: number;
    credit_enabled?: boolean;
    account_balance?: string;
    balance_interpretation?: {
        type: 'outstanding' | 'advance' | 'clear';
        label: string;
        labelUrdu: string;
        color: 'red' | 'green' | 'gray';
        displayAmount: string;
    };
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
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('ALL');

    // Payment/Top-up Modal State
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [modalMode, setModalMode] = useState<'PAYMENT' | 'TOP_UP'>('PAYMENT');
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD'>('CASH');
    const [khataOrderId, setKhataOrderId] = useState<string | null>(null);
    const [unpaidOrders, setUnpaidOrders] = useState<any[]>([]);
    const [paymentLoading, setPaymentLoading] = useState(false);

    // Form States
    const [customerForm, setCustomerForm] = useState({
        name: '',
        phone: '',
        address: '',
        notes: '',
        credit_enabled: false,
        credit_limit: 0
    });

    const [addressForm, setAddressForm] = useState({
        label: 'Home',
        full_address: '',
        landmarks: '',
        is_default: false
    });

    const API_URL = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

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

            // Enrich credit-enabled customers with live balance
            const enriched = await Promise.all(
                data.map(async (c: Customer) => {
                    try {
                        const r = await fetchWithAuth(`${API_URL}/customers/${c.id}/balance`);
                        if (!r.ok) return c;
                        const b = await r.json();
                        return {
                            ...c,
                            account_balance: b.balance,
                            balance_interpretation: b.interpretation
                        };
                    } catch {
                        return c;
                    }
                })
            );

            setCustomers(enriched);
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
            setCustomerForm({ name: '', phone: '', address: '', notes: '', credit_enabled: false, credit_limit: 0 });
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

            addNotification?.('success', 'Address added to Fireflow index');
            setShowAddressModal(false);
            loadCustomers();
            setAddressForm({ label: 'Home', full_address: '', landmarks: '', is_default: false });
        } catch (error) {
            addNotification?.('error', 'Failed to save address');
        }
    };

    const handleDeletePatron = async () => {
        if (!selectedCustomerId || !window.confirm('Erase this patron from Fireflow Index? This action is permanent.')) return;
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
            const response = await fetchWithAuth(`${API_URL}/customers/${selectedCustomerId}/statement`);
            const data = await response.json();
            setFullHistory(data.ledger_entries || []); // We'll show ledger in the modal
        } catch (error) {
            addNotification?.('error', 'Statement lookup failed');
        } finally {
            setLoading(false);
        }
    };

    const loadUnpaidOrders = async () => {
        if (!selectedCustomerId) return;
        try {
            const response = await fetchWithAuth(`${API_URL}/customers/${selectedCustomerId}/statement`);
            const data = await response.json();
            // Filter only credit orders that are pending/unpaid
            const pendingOrders = (data.orders || []).filter((o: any) => o.payment_status === 'UNPAID' || o.payment_status === 'PENDING');
            setUnpaidOrders(pendingOrders);
        } catch (error) {
            console.error('Failed to load unpaid orders:', error);
        }
    };

    const handleRecordPayment = async () => {
        if (!selectedCustomerId || !paymentAmount || Number(paymentAmount) <= 0) return;
        setPaymentLoading(true);
        
        const endpoint = modalMode === 'TOP_UP' ? 'topup' : 'payment';
        try {
            const payload: any = {
                amount: Number(paymentAmount),
                paymentMethod,
            };
            
            // Link specific order if selected
            if (modalMode === 'PAYMENT' && khataOrderId) {
                payload.orderId = khataOrderId;
            }

            const res = await fetchWithAuth(
                `${API_URL}/customers/${selectedCustomerId}/${endpoint}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                }
            );
            if (!res.ok) throw new Error('Action failed');
            await res.json();
            addNotification?.('success',
                `${modalMode === 'TOP_UP' ? 'Top-up' : 'Payment'} recorded successfully.`
            );
            setShowPaymentModal(false);
            setPaymentAmount('');
            setKhataOrderId(null);
            loadCustomers(); // refresh balances
        } catch (e: any) {
            addNotification?.('error', e.message);
        } finally {
            setPaymentLoading(false);
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
                {/* Header (Compacted) */}
                <header className="px-8 pt-6 pb-4 flex flex-col gap-4 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            <div>
                                <h1 className="text-3xl font-black text-white tracking-tighter uppercase flex items-center gap-3">
                                    <Users className="text-indigo-500" size={28} />
                                    Patron Hub
                                </h1>
                            </div>
                            
                            {/* Tiny Quick Stats next to title */}
                            <div className="hidden lg:flex items-center gap-4 border-l border-slate-800 pl-6">
                                {[
                                    { label: 'Total Base', value: stats.total, color: 'text-blue-400' },
                                    { label: 'VIPs', value: stats.vips, color: 'text-amber-400' },
                                    { label: 'Avg LTV', value: `Rs. ${stats.avgLtv.toLocaleString()}`, color: 'text-indigo-400' }
                                ].map((stat, i) => (
                                    <div key={i} className="flex flex-col">
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</span>
                                        <span className={`text-base font-black ${stat.color}`}>{stat.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={() => setShowAddModal(true)}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-black py-3 px-6 rounded-xl text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
                        >
                            <Plus size={16} />
                            Register Patron
                        </button>
                    </div>

                    {/* Search & Filter Bar */}
                    <div className="flex gap-3 items-center">
                        <div className="relative flex-1 group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-500 transition-colors" size={16} />
                            <input
                                type="text"
                                placeholder="SEARCH BY NAME, PHONE, OR ADDRESS..."
                                className="w-full bg-slate-900/50 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-xs font-bold focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all uppercase tracking-wider text-white"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <button className="px-6 py-3 bg-slate-900/50 border border-slate-800 rounded-xl flex items-center gap-2 text-slate-400 hover:text-white transition-all uppercase text-[10px] font-black tracking-widest">
                            <Filter size={14} />
                            Filters
                        </button>
                    </div>
                </header>

                {/* Main List View */}
                <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar relative">
                    <div className="bg-[#0c111d] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                        {/* Table Header */}
                        <div className="grid grid-cols-12 gap-3 px-6 py-3 bg-slate-900/80 border-b border-slate-800 text-[9px] font-black text-slate-500 uppercase tracking-widest hidden md:grid sticky top-0 z-10 backdrop-blur-md">
                            <div className="col-span-4">Patron Identity</div>
                            <div className="col-span-3 text-center">Status / Segment</div>
                            <div className="col-span-3 text-right">LTV & Loyalty</div>
                            <div className="col-span-2 text-right">Account Balance</div>
                        </div>
                        
                        {/* Table Body */}
                        <div className="flex flex-col divide-y divide-slate-800/50">
                            {filteredCustomers.map((customer) => (
                                <div
                                    key={customer.id}
                                    onClick={() => setSelectedCustomerId(customer.id)}
                                    className={`group px-6 py-3 flex flex-col md:grid md:grid-cols-12 gap-3 items-center transition-all cursor-pointer relative ${
                                        selectedCustomerId === customer.id
                                            ? 'bg-indigo-600/10'
                                            : 'hover:bg-slate-900/50'
                                    }`}
                                >
                                    {/* Active Indicator Line */}
                                    {selectedCustomerId === customer.id && (
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />
                                    )}

                                    {/* Name & Phone */}
                                    <div className="col-span-4 flex items-center gap-3 w-full">
                                        <div className="w-8 h-8 rounded-lg bg-indigo-600/10 flex items-center justify-center text-indigo-400 text-sm font-black border border-indigo-500/20 group-hover:bg-indigo-600/20 transition-all shrink-0">
                                            {(customer.name?.[0] || 'P').toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-black text-white group-hover:text-indigo-400 transition-colors truncate uppercase tracking-tight">
                                                {customer.name || 'Anonymous'}
                                            </h3>
                                            <div className="flex items-center gap-1.5 text-slate-500">
                                                <Phone size={8} className="text-indigo-500" />
                                                <span className="text-[10px] font-mono font-bold truncate">{customer.phone}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Segment & Last Seen */}
                                    <div className="col-span-3 flex flex-col items-center justify-center w-full md:w-auto">
                                        <div className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${
                                            customer.segment === 'VIP' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                                            customer.segment === 'REGULAR' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                                            'bg-slate-800/50 text-slate-400 border border-slate-700'
                                        }`}>
                                            {customer.segment}
                                        </div>
                                        <div className="flex items-center gap-1 text-slate-600 text-[9px] font-black uppercase tracking-widest mt-1">
                                            <Clock size={8} />
                                            <span>{customer.last_order_at ? new Date(customer.last_order_at).toLocaleDateString() : 'NO HISTORY'}</span>
                                        </div>
                                    </div>

                                    {/* Stats */}
                                    <div className="col-span-3 flex flex-col items-end justify-center w-full md:w-auto">
                                        <div className="text-xs font-black text-white tracking-tight">
                                            Rs. {customer.ltv?.toLocaleString() || 0}
                                        </div>
                                        <div className="flex items-center gap-1 text-[9px] font-black text-indigo-400 uppercase tracking-widest">
                                            <Zap size={8} className="fill-indigo-400" />
                                            <span>Score: {customer.loyalty_score}</span>
                                        </div>
                                    </div>

                                    {/* Account Balance */}
                                    <div className="col-span-2 flex items-center justify-end w-full md:w-auto border-l border-slate-800/50 pl-2">
                                        {customer.credit_enabled ? (
                                            <div className="text-right">
                                                <div className={`text-xs font-black tracking-tight ${
                                                    customer.balance_interpretation?.color === 'red' ? 'text-red-400' :
                                                    customer.balance_interpretation?.color === 'green' ? 'text-green-400' :
                                                    'text-slate-400'
                                                }`}>
                                                    {customer.balance_interpretation?.displayAmount || 'Rs. 0'}
                                                </div>
                                                <div className="text-[8px] font-bold text-slate-500 uppercase max-w-[80px] truncate text-right">
                                                    {customer.balance_interpretation?.label || 'Clear'}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-[8px] font-black text-slate-600 uppercase tracking-widest bg-slate-800/50 px-2 py-0.5 rounded text-center">
                                                CASH ONLY
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {filteredCustomers.length === 0 && (
                                <div className="p-8 text-center">
                                    <Users size={32} className="mx-auto text-slate-700 mb-3 opacity-50" />
                                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest">No patrons found</p>
                                </div>
                            )}
                        </div>
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

                        {/* Customer Account / Khata Section */}
                        {selectedCustomer?.credit_enabled && (
                            <div className="mt-4 p-6 bg-slate-900/60 rounded-[2rem] border border-slate-700/50 mb-10 group/khata hover:border-indigo-500/30 transition-all">
                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center justify-between">
                                    <span>Account Status / اکاؤنٹ کی صورتحال</span>
                                    <Zap size={14} className="text-indigo-500" />
                                </h4>

                                {/* Balance display */}
                                <div className={`text-3xl font-black mb-1 ${selectedCustomer.balance_interpretation?.color === 'red' ? 'text-red-400'
                                    : selectedCustomer.balance_interpretation?.color === 'green' ? 'text-green-400'
                                        : 'text-slate-400'
                                    }`}>
                                    {selectedCustomer.balance_interpretation?.displayAmount || 'Rs. 0'}
                                </div>
                                <div className="flex flex-col mb-6">
                                    <span className="text-xs font-bold text-slate-400">
                                        {selectedCustomer.balance_interpretation?.label || 'Account clear'}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-600">
                                        {selectedCustomer.balance_interpretation?.labelUrdu || 'حساب صاف'}
                                    </span>
                                </div>

                                <div className="bg-slate-950/50 rounded-2xl p-4 mb-6 border border-slate-800">
                                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">Credit Remaining</p>
                                    <p className="text-lg font-black text-white">
                                        Rs. {(Number(selectedCustomer.credit_limit || 0) - Number(selectedCustomer.account_balance || 0)).toLocaleString()}
                                    </p>
                                </div>

                                {/* Action Buttons */}
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => { 
                                            setModalMode('PAYMENT'); 
                                            setKhataOrderId(null);
                                            loadUnpaidOrders();
                                            setShowPaymentModal(true); 
                                        }}
                                        className="px-4 py-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                                    >
                                        Settle Invoice
                                    </button>
                                    <button
                                        onClick={() => { setModalMode('TOP_UP'); setShowPaymentModal(true); }}
                                        className="px-4 py-4 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                                    >
                                        Add Top-up
                                    </button>
                                </div>
                            </div>
                        )}

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
                                            notes: selectedCustomer.notes || '',
                                            credit_enabled: selectedCustomer.credit_enabled || false,
                                            credit_limit: selectedCustomer.credit_limit || 0
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

    {/* ═══ PATRON STATEMENT MODAL ═══ */}
    {showHistory && selectedCustomer && (() => {
        const charges = fullHistory.filter(e => ['CHARGE', 'ADJUSTMENT'].includes(e.entry_type));
        const credits = fullHistory.filter(e => ['PAYMENT', 'TOP_UP', 'REFUND'].includes(e.entry_type));
        const totalDR = charges.reduce((s, e) => s + Number(e.amount || 0), 0);
        const totalCR = credits.reduce((s, e) => s + Number(e.amount || 0), 0);
        const latestBalance = fullHistory.length > 0
            ? Number(fullHistory[0].balance_after ?? 0)
            : Number(selectedCustomer.account_balance ?? 0);
        const filtered = fullHistory
            .filter(e => filterType === 'ALL' || e.entry_type === filterType)
            .filter(e =>
                !searchTerm ||
                (e.description || '').toUpperCase().includes(searchTerm) ||
                (e.id || '').toUpperCase().includes(searchTerm) ||
                (e.order_id || '').toUpperCase().includes(searchTerm)
            );
        return (
            <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-3 no-print">
                <div className="bg-[#080d1a] border border-slate-800/80 w-full max-w-5xl rounded-3xl shadow-2xl flex flex-col h-[92vh] overflow-hidden">

                    {/* ─ Header ─ */}
                    <div className="px-7 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/30">
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-black text-white uppercase tracking-tighter">Patron Statement</h2>
                                <span className="px-2 py-0.5 bg-indigo-600/20 border border-indigo-500/30 rounded text-[9px] font-black text-indigo-400 uppercase tracking-widest">
                                    {fullHistory.length} ENTRIES
                                </span>
                            </div>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                                {selectedCustomer.name} · {selectedCustomer.phone}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => window.print()}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all"
                            >
                                <Printer size={13} /> Print A4
                            </button>
                            <button
                                onClick={() => setShowHistory(false)}
                                className="w-9 h-9 bg-slate-800 hover:bg-slate-700 rounded-xl flex items-center justify-center transition-all"
                            >
                                <Plus size={18} className="rotate-45 text-slate-400" />
                            </button>
                        </div>
                    </div>

                    {/* ─ Metric Cards ─ */}
                    <div className="px-7 py-3 border-b border-slate-800 grid grid-cols-4 gap-3 shrink-0 bg-slate-900/10">
                        <div className="bg-slate-900/60 rounded-2xl border border-slate-800/60 p-3">
                            <p className="text-[7px] font-black text-slate-500 uppercase tracking-[0.25em]">Total Debited (DR)</p>
                            <p className="text-lg font-black text-red-400 mt-0.5">Rs. {totalDR.toLocaleString()}</p>
                            <p className="text-[8px] text-slate-600 mt-0.5">{charges.length} charges</p>
                        </div>
                        <div className="bg-slate-900/60 rounded-2xl border border-slate-800/60 p-3">
                            <p className="text-[7px] font-black text-slate-500 uppercase tracking-[0.25em]">Total Credited (CR)</p>
                            <p className="text-lg font-black text-emerald-400 mt-0.5">Rs. {totalCR.toLocaleString()}</p>
                            <p className="text-[8px] text-slate-600 mt-0.5">{credits.length} payments</p>
                        </div>
                        <div className={`rounded-2xl border p-3 ${latestBalance > 0 ? 'bg-red-950/20 border-red-800/30' : latestBalance < 0 ? 'bg-emerald-950/20 border-emerald-800/30' : 'bg-slate-900/60 border-slate-800/60'}`}>
                            <p className="text-[7px] font-black text-slate-500 uppercase tracking-[0.25em]">Outstanding Balance</p>
                            <p className={`text-lg font-black mt-0.5 ${latestBalance > 0 ? 'text-red-400' : latestBalance < 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                Rs. {Math.abs(latestBalance).toLocaleString()}
                            </p>
                            <p className={`text-[8px] mt-0.5 font-black uppercase ${latestBalance > 0 ? 'text-red-600' : latestBalance < 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                                {latestBalance > 0 ? '● Owes restaurant' : latestBalance < 0 ? '● Advance held' : '● Settled'}
                            </p>
                        </div>
                        <div className="bg-slate-900/60 rounded-2xl border border-slate-800/60 p-3">
                            <p className="text-[7px] font-black text-slate-500 uppercase tracking-[0.25em]">Net Position</p>
                            <p className="text-lg font-black text-slate-300 mt-0.5">Rs. {Math.abs(totalDR - totalCR).toLocaleString()}</p>
                            <p className="text-[8px] text-slate-600 mt-0.5">{totalDR > totalCR ? 'Debit heavy' : 'Credit heavy'}</p>
                        </div>
                    </div>

                    {/* ─ Filter + Search Bar ─ */}
                    <div className="px-7 py-2.5 border-b border-slate-800 flex items-center gap-3 shrink-0 bg-slate-900/5">
                        <div className="flex gap-1 bg-slate-950/80 border border-slate-800 rounded-xl p-1">
                            {['ALL', 'CHARGE', 'PAYMENT', 'TOP_UP', 'ADJUSTMENT'].map(type => (
                                <button
                                    key={type}
                                    onClick={() => setFilterType(type)}
                                    className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all tracking-wider ${filterType === type ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    {type === 'TOP_UP' ? 'TOP-UP' : type}
                                </button>
                            ))}
                        </div>
                        <div className="relative flex-shrink-0 w-56">
                            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                            <input
                                type="text"
                                placeholder="Search description or ref..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value.toUpperCase())}
                                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-2 pl-8 pr-3 text-[9px] font-bold text-white placeholder:text-slate-700 focus:border-indigo-500 outline-none uppercase"
                            />
                        </div>
                        <p className="text-[8px] text-slate-600 font-bold ml-auto">
                            Showing {filtered.length} of {fullHistory.length}
                        </p>
                    </div>

                    {/* ─ 3-Column Ledger Table ─ */}
                    <div id="printable-statement" className="flex-1 overflow-y-auto">
                        {filtered.length === 0 ? (
                            <div className="h-full flex items-center justify-center">
                                <p className="text-slate-700 font-black uppercase tracking-widest text-xs">No transactions found</p>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 z-10 bg-[#080d1a]">
                                    <tr className="border-b border-slate-800 text-[8px] font-black text-slate-500 uppercase tracking-[0.2em]">
                                        <th className="px-5 py-3 w-32">Date / Time</th>
                                        <th className="px-4 py-3">Description</th>
                                        <th className="px-4 py-3 text-right w-32 text-red-500/70">DR (Charge)</th>
                                        <th className="px-4 py-3 text-right w-32 text-emerald-500/70">CR (Payment)</th>
                                        <th className="px-5 py-3 text-right w-36">Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((entry: any, idx: number) => {
                                        const isCharge = ['CHARGE', 'ADJUSTMENT'].includes(entry.entry_type);
                                        const bal = Number(entry.balance_after ?? 0);
                                        const amt = Number(entry.amount ?? 0);
                                        return (
                                            <tr
                                                key={entry.id}
                                                className={`border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-900/10'}`}
                                            >
                                                {/* Date */}
                                                <td className="px-5 py-2.5 align-middle">
                                                    <div className="text-[10px] font-black text-slate-300 tabular-nums">
                                                        {new Date(entry.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                                                    </div>
                                                    <div className="text-[8px] text-slate-600 tabular-nums">
                                                        {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </td>
                                                {/* Description */}
                                                <td className="px-4 py-2.5 align-middle">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isCharge ? 'bg-red-500' : 'bg-emerald-500'}`} />
                                                        <div className="min-w-0">
                                                            <div className="text-[11px] font-black text-slate-200 uppercase leading-tight truncate max-w-xs">
                                                                {entry.description || (entry.order_id ? `Order #${(entry.order_id as string).slice(-6).toUpperCase()}` : 'Entry')}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <span className={`px-1.5 py-px rounded text-[7px] font-black uppercase tracking-widest border ${
                                                                    entry.entry_type === 'CHARGE' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                                    entry.entry_type === 'TOP_UP' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                                                                    entry.entry_type === 'PAYMENT' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                                    entry.entry_type === 'REFUND' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' :
                                                                    'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                                }`}>
                                                                    {entry.entry_type}
                                                                </span>
                                                                <span className="text-[7px] text-slate-700 font-mono">#{(entry.id as string).slice(-8).toUpperCase()}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                {/* DR */}
                                                <td className="px-4 py-2.5 text-right align-middle">
                                                    {isCharge ? (
                                                        <span className="text-xs font-black text-red-400 tabular-nums">
                                                            {amt.toLocaleString()}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-700 text-xs">—</span>
                                                    )}
                                                </td>
                                                {/* CR */}
                                                <td className="px-4 py-2.5 text-right align-middle">
                                                    {!isCharge ? (
                                                        <span className="text-xs font-black text-emerald-400 tabular-nums">
                                                            {amt.toLocaleString()}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-700 text-xs">—</span>
                                                    )}
                                                </td>
                                                {/* Balance */}
                                                <td className="px-5 py-2.5 text-right align-middle">
                                                    <div className={`text-xs font-black tabular-nums ${bal > 0 ? 'text-red-300' : bal < 0 ? 'text-emerald-300' : 'text-slate-500'}`}>
                                                        Rs. {Math.abs(bal).toLocaleString()}
                                                    </div>
                                                    <div className={`text-[7px] font-black uppercase mt-0.5 ${bal > 0 ? 'text-red-700' : bal < 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                                                        {bal > 0 ? 'OWING' : bal < 0 ? 'ADVANCE' : 'CLEAR'}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                {/* Totals row */}
                                <tfoot className="sticky bottom-0 bg-[#080d1a] border-t-2 border-slate-700">
                                    <tr>
                                        <td className="px-5 py-3 text-[8px] font-black text-slate-400 uppercase tracking-widest" colSpan={2}>
                                            TOTALS — {filtered.length} transactions
                                        </td>
                                        <td className="px-4 py-3 text-right text-xs font-black text-red-400 tabular-nums">
                                            {filtered.filter(e => ['CHARGE','ADJUSTMENT'].includes(e.entry_type)).reduce((s, e) => s + Number(e.amount || 0), 0).toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-right text-xs font-black text-emerald-400 tabular-nums">
                                            {filtered.filter(e => ['PAYMENT','TOP_UP','REFUND'].includes(e.entry_type)).reduce((s, e) => s + Number(e.amount || 0), 0).toLocaleString()}
                                        </td>
                                        <td className={`px-5 py-3 text-right text-sm font-black tabular-nums ${latestBalance > 0 ? 'text-red-400' : latestBalance < 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                            Rs. {Math.abs(latestBalance).toLocaleString()}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>

                    {/* Print CSS */}
                    <style dangerouslySetInnerHTML={{ __html: `
                        @media print {
                            body * { visibility: hidden; }
                            #printable-statement, #printable-statement * { visibility: visible; }
                            #printable-statement { position: fixed; top: 0; left: 0; width: 100%; height: auto; background: white !important; padding: 1.5cm !important; overflow: visible !important; }
                            #printable-statement table { width: 100%; border-collapse: collapse; font-size: 10pt; }
                            #printable-statement thead th { background: #f3f4f6 !important; color: #111 !important; border-bottom: 2px solid #000 !important; padding: 6pt 8pt !important; }
                            #printable-statement tbody td { border-bottom: 1px solid #e5e7eb !important; color: #111 !important; padding: 5pt 8pt !important; }
                            #printable-statement tfoot td { border-top: 2px solid #000 !important; color: #111 !important; padding: 6pt 8pt !important; font-weight: 900; }
                            #printable-statement tr:nth-child(even) td { background: #f9fafb !important; }
                            .no-print { display: none !important; }
                        }
                    `}} />

                </div>
            </div>
        );
    })()}
            {/* Edit Modal */}
            {showEditModal && (
                <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6">
                    <div className="bg-[#0c111d] border border-slate-800 w-full max-w-xl rounded-[3rem] shadow-3xl overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="p-10 border-b border-slate-800 bg-slate-900/20">
                            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Edit Identity</h2>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">Modify Patron Identity Index</p>
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

                            <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-3xl space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <label className="text-[10px] font-black text-slate-200 uppercase tracking-widest">Enable Khata / Credit</label>
                                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tight mt-1">Allow this patron to post orders to account</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setCustomerForm({ ...customerForm, credit_enabled: !customerForm.credit_enabled })}
                                        className={`w-14 h-8 rounded-full transition-all relative ${customerForm.credit_enabled ? 'bg-indigo-600' : 'bg-slate-800'}`}
                                    >
                                        <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${customerForm.credit_enabled ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>

                                {customerForm.credit_enabled && (
                                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Credit Limit (Rs.)</label>
                                        <div className="relative">
                                            <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                                            <input
                                                type="number"
                                                className="w-full bg-black border border-slate-800 rounded-2xl pl-12 pr-4 py-4 text-white font-black focus:border-indigo-500 outline-none transition-all tabular-nums"
                                                value={customerForm.credit_limit}
                                                onChange={e => setCustomerForm({ ...customerForm, credit_limit: Number(e.target.value) })}
                                            />
                                        </div>
                                    </div>
                                )}
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
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2">Create new profile in Fireflow database</p>
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

                            <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-3xl space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <label className="text-[10px] font-black text-slate-200 uppercase tracking-widest">Enable Khata / Credit</label>
                                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tight mt-1">Allow this patron to post orders to account</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setCustomerForm({ ...customerForm, credit_enabled: !customerForm.credit_enabled })}
                                        className={`w-14 h-8 rounded-full transition-all relative ${customerForm.credit_enabled ? 'bg-indigo-600' : 'bg-slate-800'}`}
                                    >
                                        <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${customerForm.credit_enabled ? 'right-1' : 'left-1'}`} />
                                    </button>
                                </div>

                                {customerForm.credit_enabled && (
                                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Credit Limit (Rs.)</label>
                                        <div className="relative">
                                            <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                                            <input
                                                type="number"
                                                className="w-full bg-black border border-slate-800 rounded-2xl pl-12 pr-4 py-4 text-white font-black focus:border-indigo-500 outline-none transition-all tabular-nums"
                                                value={customerForm.credit_limit}
                                                onChange={e => setCustomerForm({ ...customerForm, credit_limit: Number(e.target.value) })}
                                            />
                                        </div>
                                    </div>
                                )}
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

            {showPaymentModal && selectedCustomer && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                    <div className="bg-[#0c111d] border border-slate-800 rounded-[2.5rem] p-10 w-full max-w-lg shadow-3xl animate-in zoom-in-95 duration-300">
                        <div className="mb-8">
                            <h3 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">
                                {modalMode === 'TOP_UP' ? 'Add Top-up' : 'Record Payment'}
                            </h3>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                {selectedCustomer.name} · {selectedCustomer.balance_interpretation?.label || 'Account clear'}
                            </p>
                        </div>

                        {/* Optional Invoice Selection for Partial Payments */}
                        {modalMode === 'PAYMENT' && (
                            <div className="mb-4">
                                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1 block">
                                    Select Invoice to Settle (Optional)
                                </label>
                                <select
                                    value={khataOrderId || ''}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setKhataOrderId(val || null);
                                        if (val) {
                                            const order = unpaidOrders.find(o => o.id === val);
                                            if (order) setPaymentAmount(order.total.toString());
                                        } else {
                                            setPaymentAmount('');
                                        }
                                    }}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm font-bold focus:outline-none focus:border-indigo-500 appearance-none custom-select"
                                >
                                    <option value="">General Account Payment</option>
                                    {unpaidOrders.map(o => (
                                        <option key={o.id} value={o.id}>
                                            Order #{o.order_number || o.id.slice(-6)} — Rs. {o.total}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Amount */}
                        <div className="mb-4">
                            <label className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1 block">
                                Amount (Rs.)
                            </label>
                            <input
                                type="number"
                                value={paymentAmount}
                                onChange={e => setPaymentAmount(e.target.value)}
                                placeholder="0"
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-lg font-bold focus:outline-none focus:border-indigo-500"
                                autoFocus
                            />
                            {khataOrderId && unpaidOrders.find(o => o.id === khataOrderId) && (
                                <p className="text-[10px] text-slate-500 mt-2 font-black uppercase">
                                    * You can enter a partial amount to settle this invoice partially.
                                </p>
                            )}
                        </div>

                        {/* Payment method */}
                        <div className="mb-6">
                            <label className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 block">
                                Payment Method
                            </label>
                            <div className="flex gap-2">
                                {(['CASH', 'CARD'] as const).map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setPaymentMethod(m)}
                                        className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase transition-all ${paymentMethod === m
                                                ? 'bg-indigo-500 text-white'
                                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                            }`}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowPaymentModal(false); setPaymentAmount(''); }}
                                className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 text-xs font-bold uppercase"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRecordPayment}
                                disabled={paymentLoading || !paymentAmount}
                                className="flex-1 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold uppercase disabled:opacity-50 transition-all"
                            >
                                {paymentLoading ? 'Recording...' : 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
