import React, { useState, useEffect } from 'react';
import { Search, UserPlus, CreditCard, ChevronRight, Phone, User, Loader2, AlertCircle } from 'lucide-react';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';

const API_URL = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

interface Customer {
    id: string;
    name: string;
    phone: string;
    credit_limit: number;
    credit_enabled: boolean;
    balance?: number;
}

interface CustomerComponentProps {
    mode: 'search-only' | 'charge-to-account';
    orderId?: string;
    amount?: number;
    initialShowAddForm?: boolean;
    onConfirm: (customer: Customer) => void;
    onCancel: () => void;
}

export const CustomerComponent: React.FC<CustomerComponentProps> = ({
    mode,
    amount = 0,
    initialShowAddForm = false,
    onConfirm,
    onCancel
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [matchingCustomers, setMatchingCustomers] = useState<Customer[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isPosting] = useState(false);
    const [showAddForm, setShowAddForm] = useState(initialShowAddForm);
    const [error, setError] = useState<string | null>(null);

    // New customer form state
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (searchQuery.length >= 3) {
                performSearch();
            } else {
                setMatchingCustomers([]);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);

    const performSearch = async () => {
        setIsSearching(true);
        setError(null);
        try {
            const response = await fetchWithAuth(`${API_URL}/customers?query=${searchQuery}`);
            if (!response.ok) throw new Error('Search failed');
            const data = await response.json();
            setMatchingCustomers(data);
        } catch (err) {
            console.error('Search failed:', err);
            setError('Failed to search customers');
        } finally {
            setIsSearching(false);
        }
    };

    const handleSelectCustomer = async (customer: Customer) => {
        setIsSearching(true);
        try {
            // Fetch latest balance and credit info
            const response = await fetchWithAuth(`${API_URL}/customers/${customer.id}/balance`);
            if (!response.ok) throw new Error('Failed to fetch balance');
            const data = await response.json();
            
            setSelectedCustomer({
                ...customer,
                balance: parseFloat(data.balance),
                credit_limit: parseFloat(data.credit_limit),
                credit_enabled: data.credit_enabled
            });
            setShowAddForm(false);
        } catch (err) {
            console.error('Failed to fetch balance:', err);
            setError('Could not retrieve customer balance');
        } finally {
            setIsSearching(false);
        }
    };

    const handleCreateCustomer = async () => {
        if (!newPhone || !newName) {
            setError('Name and Phone are required');
            return;
        }

        setIsSearching(true);
        setError(null);
        try {
            const response = await fetchWithAuth(`${API_URL}/customers`, {
                method: 'POST',
                body: JSON.stringify({
                    name: newName,
                    phone: newPhone
                })
            });
            if (!response.ok) throw new Error('Create failed');
            const data = await response.json();
            // Auto-select the new customer
            handleSelectCustomer(data);
            setNewName('');
            setNewPhone('');
        } catch (err) {
            console.error('Create failed:', err);
            setError('Failed to create customer');
        } finally {
            setIsSearching(false);
        }
    };

    const handleConfirmCharge = async () => {
        if (!selectedCustomer) return;

        if (mode === 'charge-to-account') {
            if (!selectedCustomer.credit_enabled) {
                setError('Credit is not enabled for this customer');
                return;
            }

            const currentBalance = selectedCustomer.balance || 0;
            if (currentBalance + amount > selectedCustomer.credit_limit) {
                setError(`Transaction exceeds credit limit of ${selectedCustomer.credit_limit}`);
                return;
            }

            // No longer posting charge here to avoid double-transactions.
            // Settlement flow in POSView/server.ts now handles atomic CREDIT transaction.
            onConfirm(selectedCustomer);
        } else {
            onConfirm(selectedCustomer);
        }
    };

    return (
        <div className="flex flex-col h-full max-h-[600px] w-full bg-slate-950 rounded-3xl border border-slate-800 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-800 bg-slate-900/50">
                <h2 className="text-xl font-black text-white flex items-center gap-3 italic tracking-tight">
                    <CreditCard className="text-blue-500" />
                    {mode === 'charge-to-account' ? 'CHARGE TO KHATA' : 'SELECT CUSTOMER'}
                </h2>
                {amount > 0 && (
                    <p className="text-slate-400 mt-1 text-sm font-bold">
                        Amount to charge: <span className="text-blue-400">Rs. {amount.toLocaleString()}</span>
                    </p>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Error Display */}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3 animate-in fade-in zoom-in duration-300">
                        <AlertCircle className="text-red-500 shrink-0" size={18} />
                        <p className="text-red-400 text-xs font-bold leading-relaxed">{error}</p>
                    </div>
                )}

                {/* Search / Selection Area */}
                {!selectedCustomer && !showAddForm && (
                    <div className="space-y-4">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input
                                autoFocus
                                type="text"
                                placeholder="Search by name or phone..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-14 bg-slate-900 border border-slate-700/50 rounded-2xl pl-12 pr-4 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-all"
                            />
                        </div>

                        {isSearching ? (
                            <div className="flex justify-center p-8">
                                <Loader2 className="animate-spin text-blue-500" />
                            </div>
                        ) : matchingCustomers.length > 0 ? (
                            <div className="space-y-2">
                                {matchingCustomers.map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => handleSelectCustomer(c)}
                                        className="w-full p-4 bg-slate-900/50 hover:bg-slate-800 border border-slate-800/50 rounded-2xl flex items-center justify-between group transition-all"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 font-black">
                                                {c.name ? c.name[0].toUpperCase() : '?'}
                                            </div>
                                            <div className="text-left">
                                                <div className="text-sm font-black text-white group-hover:text-blue-400 transition-colors">
                                                    {c.name || 'Anonymous'}
                                                </div>
                                                <div className="text-xs text-slate-500 font-bold">{c.phone}</div>
                                            </div>
                                        </div>
                                        <ChevronRight size={18} className="text-slate-700 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                                    </button>
                                ))}
                            </div>
                        ) : searchQuery.length >= 3 ? (
                            <button
                                onClick={() => {
                                    setNewPhone(searchQuery.match(/^\d+$/) ? searchQuery : '');
                                    setShowAddForm(true);
                                }}
                                className="w-full p-6 border-2 border-dashed border-slate-800 rounded-3xl flex flex-col items-center gap-3 text-slate-500 hover:border-blue-500/50 hover:text-blue-500 transition-all group"
                            >
                                <UserPlus size={32} className="group-hover:scale-110 transition-transform" />
                                <div className="text-sm font-black uppercase tracking-widest">Create New Profile</div>
                            </button>
                        ) : null}
                    </div>
                )}

                {/* New Customer Form */}
                {showAddForm && (
                    <div className="space-y-4 animate-in slide-in-from-bottom duration-300">
                        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">New Customer Details</h3>
                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Full Name</label>
                                <div className="relative">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                                    <input
                                        type="text"
                                        placeholder="John Doe"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl pl-12 pr-4 text-white font-bold focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Phone Number</label>
                                <div className="relative">
                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                                    <input
                                        type="tel"
                                        placeholder="03001234567"
                                        value={newPhone}
                                        onChange={(e) => setNewPhone(e.target.value)}
                                        className="w-full h-12 bg-slate-900 border border-slate-700 rounded-xl pl-12 pr-4 text-white font-bold focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3 pt-4">
                            <button
                                onClick={() => setShowAddForm(false)}
                                className="flex-1 h-12 bg-slate-800 text-slate-400 font-black rounded-xl hover:bg-slate-700 transition-colors"
                            >
                                CANCEL
                            </button>
                            <button
                                onClick={handleCreateCustomer}
                                className="flex-[2] h-12 bg-blue-600 text-white font-black rounded-xl hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20"
                            >
                                SAVE & PROCEED
                            </button>
                        </div>
                    </div>
                )}

                {/* Selected Customer Credit Details */}
                {selectedCustomer && (
                    <div className="space-y-6 animate-in zoom-in duration-300">
                        <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl relative overflow-hidden group">
                            {/* Glow effect */}
                            <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/10 blur-[60px] rounded-full group-hover:bg-blue-500/20 transition-all duration-700"></div>
                            
                            <div className="relative flex justify-between items-start">
                                <div>
                                    <h3 className="text-xl font-black text-white group-hover:text-blue-400 transition-colors">{selectedCustomer.name}</h3>
                                    <p className="text-slate-500 font-bold text-sm">{selectedCustomer.phone}</p>
                                </div>
                                <button
                                    onClick={() => setSelectedCustomer(null)}
                                    className="text-[10px] font-black text-slate-500 hover:text-white transition-colors uppercase tracking-widest bg-slate-800 px-3 py-1 rounded-full"
                                >
                                    Change
                                </button>
                            </div>

                            <div className="mt-8 grid grid-cols-2 gap-4">
                                <div className="p-4 bg-slate-950/50 rounded-2xl border border-slate-800">
                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Current Balance</div>
                                    <div className={`text-lg font-black ${selectedCustomer.balance && selectedCustomer.balance > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                                        Rs. {selectedCustomer.balance?.toLocaleString()}
                                    </div>
                                </div>
                                <div className="p-4 bg-slate-950/50 rounded-2xl border border-slate-800">
                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Credit Limit</div>
                                    <div className="text-lg font-black text-white">
                                        Rs. {selectedCustomer.credit_limit?.toLocaleString()}
                                    </div>
                                </div>
                            </div>

                            {!selectedCustomer.credit_enabled && (
                                <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3">
                                    <AlertCircle className="text-red-500" size={16} />
                                    <span className="text-xs font-bold text-red-400">Khata/Credit is not enabled for this profile.</span>
                                </div>
                            )}

                            {selectedCustomer.credit_enabled && (
                                <div className="mt-6 flex flex-col gap-2">
                                    <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        <span>Credit Utilization</span>
                                        <span>{Math.round(((selectedCustomer.balance || 0) / (selectedCustomer.credit_limit || 1)) * 100)}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full transition-all duration-1000 ${((selectedCustomer.balance || 0) + amount) > selectedCustomer.credit_limit ? 'bg-red-500' : 'bg-blue-500'}`}
                                            style={{ width: `${Math.min(((selectedCustomer.balance || 0) / (selectedCustomer.credit_limit || 1)) * 100, 100)}%` }}
                                        ></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            <div className="p-6 border-t border-slate-800 flex gap-4 bg-slate-900/30">
                <button
                    onClick={onCancel}
                    className="flex-1 h-16 bg-slate-800 text-slate-300 font-black rounded-2xl hover:bg-slate-700 transition-all uppercase tracking-widest text-xs"
                >
                    BACK
                </button>
                <button
                    disabled={!selectedCustomer || isPosting || (mode === 'charge-to-account' && !selectedCustomer.credit_enabled)}
                    onClick={handleConfirmCharge}
                    className={`flex-[2] h-16 ${!selectedCustomer || isPosting || (mode === 'charge-to-account' && !selectedCustomer.credit_enabled) ? 'bg-slate-800 text-slate-600 grayscale' : 'bg-blue-600 text-white hover:bg-blue-500 shadow-xl shadow-blue-600/20'} font-black rounded-2xl transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-3`}
                >
                    {isPosting ? (
                        <Loader2 className="animate-spin" />
                    ) : mode === 'charge-to-account' ? (
                        <>
                            <CreditCard size={18} />
                            CONFIRM CHARGE
                        </>
                    ) : (
                        'SELECT CUSTOMER'
                    )}
                </button>
            </div>
        </div>
    );
};
