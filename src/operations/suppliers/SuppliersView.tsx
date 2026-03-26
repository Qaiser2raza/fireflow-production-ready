import React, { useState, useEffect, useMemo } from 'react';
import {
    Truck,
    Search,
    Printer,
    ChevronRight,
    Plus,
    Trash2,
    History,
    Zap,
    FileText
} from 'lucide-react';
import { useAppContext as useApp } from '../../client/contexts/AppContext';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';

interface Supplier {
    id: string;
    name: string;
    contact_name?: string;
    phone?: string;
    email?: string;
    address?: string;
    balance: number;
    created_at: string;
}

export const SuppliersView: React.FC = () => {
    const { currentUser, addNotification } = useApp();
    const restaurantId = currentUser?.restaurant_id;
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showBillModal, setShowBillModal] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [fullHistory, setFullHistory] = useState<any[]>([]);

    // Bill Modal State
    const [billForm, setBillForm] = useState({
        amount: '',
        description: '',
        referenceId: ''
    });
    const [billLoading, setBillLoading] = useState(false);

    // Supplier Form State
    const [supplierForm, setSupplierForm] = useState({
        name: '',
        contact_name: '',
        phone: '',
        email: '',
        address: ''
    });

    const API_URL = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

    useEffect(() => {
        if (restaurantId) {
            loadSuppliers();
        }
    }, [restaurantId]);

    const loadSuppliers = async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${API_URL}/suppliers`);
            if (!response.ok) throw new Error('Failed to load suppliers');
            const data = await response.json();
            setSuppliers(data);
        } catch (error) {
            console.error(error);
            addNotification?.('error', 'Error loading suppliers');
        } finally {
            setLoading(false);
        }
    };

    const selectedSupplier = useMemo(() =>
        suppliers.find(s => s.id === selectedSupplierId),
        [suppliers, selectedSupplierId]
    );

    const filteredSuppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.phone?.includes(searchQuery) ||
        s.contact_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleAddSupplier = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const response = await fetchWithAuth(`${API_URL}/suppliers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(supplierForm)
            });

            if (!response.ok) throw new Error('Failed to add supplier');

            addNotification?.('success', 'Supplier registered successfully');
            setShowAddModal(false);
            loadSuppliers();
            setSupplierForm({ name: '', contact_name: '', phone: '', email: '', address: '' });
        } catch (error) {
            addNotification?.('error', 'Failed to save supplier');
        }
    };

    const handleRecordBill = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedSupplierId || !billForm.amount) return;
        setBillLoading(true);

        try {
            const response = await fetchWithAuth(`${API_URL}/suppliers/bill`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supplierId: selectedSupplierId,
                    amount: Number(billForm.amount),
                    description: billForm.description,
                    referenceId: billForm.referenceId
                })
            });

            if (!response.ok) throw new Error('Failed to record bill');

            addNotification?.('success', 'Bill recorded and ledger updated');
            setShowBillModal(false);
            setBillForm({ amount: '', description: '', referenceId: '' });
            loadSuppliers(); // Refresh balance
        } catch (error) {
            addNotification?.('error', 'Failed to record bill');
        } finally {
            setBillLoading(false);
        }
    };

    const fetchHistory = async () => {
        if (!selectedSupplierId) return;
        setShowHistory(true);
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${API_URL}/suppliers/${selectedSupplierId}/statement`);
            const data = await response.json();
            setFullHistory(data || []);
        } catch (error) {
            addNotification?.('error', 'Statement lookup failed');
        } finally {
            setLoading(false);
        }
    };

    if (loading && suppliers.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center bg-[#070b14]">
                <div className="flex flex-col items-center gap-4 text-center">
                    <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                    <p className="text-indigo-400 font-black text-xs uppercase tracking-widest mt-4">Loading Supplier Ledger...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex h-screen bg-[#070b14] text-slate-200 overflow-hidden">
            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <header className="px-8 pt-6 pb-4 flex flex-col gap-4 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            <h1 className="text-3xl font-black text-white tracking-tighter uppercase flex items-center gap-3">
                                <Truck className="text-indigo-500" size={28} />
                                Supplier Hub
                            </h1>
                            <div className="hidden lg:flex items-center gap-4 border-l border-slate-800 pl-6">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Suppliers</span>
                                    <span className="text-base font-black text-blue-400">{suppliers.length}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Payable</span>
                                    <span className="text-base font-black text-red-500">
                                        Rs. {suppliers.reduce((sum, s) => sum + (s.balance > 0 ? s.balance : 0), 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowAddModal(true)}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-black py-3 px-6 rounded-xl text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
                        >
                            <Plus size={16} />
                            Register Supplier
                        </button>
                    </div>

                    {/* Search & Filter Bar */}
                    <div className="flex gap-3 items-center">
                        <div className="relative flex-1 group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-500 transition-colors" size={16} />
                            <input
                                type="text"
                                placeholder="SEARCH BY NAME, CONTACT, OR PHONE..."
                                className="w-full bg-slate-900/50 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-xs font-bold focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all uppercase tracking-wider text-white"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </header>

                {/* Main List View */}
                <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar relative">
                    <div className="bg-[#0c111d] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                        <div className="grid grid-cols-12 gap-3 px-6 py-3 bg-slate-900/80 border-b border-slate-800 text-[9px] font-black text-slate-500 uppercase tracking-widest hidden md:grid sticky top-0 z-10 backdrop-blur-md">
                            <div className="col-span-5">Supplier Identity</div>
                            <div className="col-span-3 text-center">Contact Info</div>
                            <div className="col-span-4 text-right">Current Balance (Payable)</div>
                        </div>
                        
                        <div className="flex flex-col divide-y divide-slate-800/50">
                            {filteredSuppliers.map((supplier) => (
                                <div
                                    key={supplier.id}
                                    onClick={() => setSelectedSupplierId(supplier.id)}
                                    className={`group px-6 py-4 flex flex-col md:grid md:grid-cols-12 gap-3 items-center transition-all cursor-pointer relative ${
                                        selectedSupplierId === supplier.id ? 'bg-indigo-600/10' : 'hover:bg-slate-900/50'
                                    }`}
                                >
                                    {selectedSupplierId === supplier.id && (
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />
                                    )}

                                    <div className="col-span-5 flex items-center gap-3 w-full">
                                        <div className="w-10 h-10 rounded-lg bg-indigo-600/10 flex items-center justify-center text-indigo-400 text-lg font-black border border-indigo-500/20 group-hover:bg-indigo-600/20 transition-all shrink-0">
                                            {supplier.name[0].toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-black text-white group-hover:text-indigo-400 transition-colors truncate uppercase tracking-tight">
                                                {supplier.name}
                                            </h3>
                                            <p className="text-[10px] text-slate-500 font-bold truncate">ID: {supplier.id.slice(-8).toUpperCase()}</p>
                                        </div>
                                    </div>

                                    <div className="col-span-3 flex flex-col items-center justify-center">
                                        <div className="text-[10px] font-black text-slate-300 uppercase">{supplier.contact_name || 'No Contact'}</div>
                                        <div className="text-[10px] font-mono font-bold text-slate-500">{supplier.phone || 'N/A'}</div>
                                    </div>

                                    <div className="col-span-4 flex items-center justify-end">
                                        <div className="text-right">
                                            <div className={`text-lg font-black tracking-tight ${supplier.balance > 0 ? 'text-red-400' : supplier.balance < 0 ? 'text-green-400' : 'text-slate-500'}`}>
                                                Rs. {Math.abs(supplier.balance).toLocaleString()}
                                            </div>
                                            <div className="text-[8px] font-black text-slate-500 uppercase">
                                                {supplier.balance > 0 ? 'OUTSTANDING BILLS' : supplier.balance < 0 ? 'ADVANCE PAYMENT' : 'SETTLED'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Side Detail Panel */}
            <div className={`w-[450px] bg-[#0c111d] border-l border-slate-800 flex flex-col transition-all duration-500 ${selectedSupplierId ? 'translate-x-0' : 'translate-x-full absolute right-0'}`}>
                {selectedSupplier ? (
                    <div className="flex-1 flex flex-col p-8 overflow-y-auto">
                        <div className="flex justify-between items-start mb-10">
                            <div className="w-24 h-24 rounded-[2.5rem] bg-indigo-600/20 flex items-center justify-center text-4xl font-black text-indigo-400 border border-indigo-500/20 shadow-2xl shadow-indigo-600/10">
                                {selectedSupplier.name[0].toUpperCase()}
                            </div>
                            <button
                                onClick={() => setSelectedSupplierId(null)}
                                className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center text-slate-500 hover:text-white transition-colors"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>

                        <div className="mb-8">
                            <h2 className="text-3xl font-black text-white tracking-tighter uppercase mb-2">{selectedSupplier.name}</h2>
                            <div className="flex flex-col gap-1">
                                <span className="text-slate-500 text-xs font-mono font-bold tracking-widest">CONTACT: {selectedSupplier.contact_name || 'N/A'}</span>
                                <span className="text-slate-500 text-xs font-mono font-bold tracking-widest">PHONE: {selectedSupplier.phone || 'N/A'}</span>
                            </div>
                        </div>

                        <div className="bg-slate-900/60 rounded-[2rem] border border-slate-700/50 p-8 mb-10">
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center justify-between">
                                <span>Payable Statement / حساب کی تفصیل</span>
                                <Zap size={14} className="text-indigo-500" />
                            </h4>

                            <div className={`text-4xl font-black mb-2 ${selectedSupplier.balance > 0 ? 'text-red-400' : selectedSupplier.balance < 0 ? 'text-green-400' : 'text-slate-400'}`}>
                                Rs. {Math.abs(selectedSupplier.balance).toLocaleString()}
                            </div>
                            <div className="flex flex-col mb-8">
                                <span className="text-sm font-bold text-slate-400">
                                    {selectedSupplier.balance > 0 ? 'Outstanding specialized bills' : selectedSupplier.balance < 0 ? 'Advance payment recorded' : 'Account fully settled'}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                <button
                                    onClick={() => setShowBillModal(true)}
                                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                >
                                    <FileText size={16} />
                                    Post New Bill
                                </button>
                                <button
                                    onClick={fetchHistory}
                                    className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-indigo-400 border border-slate-800 rounded-2xl text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                >
                                    <History size={16} />
                                    View Statement
                                </button>
                            </div>
                        </div>

                        <div className="mt-auto space-y-4">
                            <div className="p-6 bg-slate-950/50 rounded-2xl border border-slate-800">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Supplier Address</p>
                                <p className="text-xs text-slate-300 leading-relaxed">{selectedSupplier.address || 'No address provided'}</p>
                            </div>
                            <div className="flex gap-4">
                                <button className="flex-1 py-4 bg-slate-900 hover:bg-slate-800 text-slate-400 font-black rounded-2xl border border-slate-800 uppercase text-[10px] tracking-widest transition-all">
                                    Edit Supplier
                                </button>
                                <button className="p-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-black rounded-2xl border border-red-500/20 uppercase text-[10px] tracking-widest transition-all">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 opacity-10">
                        <Truck size={80} className="text-slate-500 mb-6" />
                        <p className="text-xs font-black uppercase tracking-[0.4em] text-center">Select Supplier for Details</p>
                    </div>
                )}
            </div>

            {/* ═══ BILL RECORDING MODAL ═══ */}
            {showBillModal && (
                <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
                    <div className="bg-[#080d1a] border border-slate-800 w-full max-w-md rounded-3xl shadow-2xl p-8">
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-6 flex items-center gap-2">
                            <FileText className="text-indigo-500" />
                            Post Supplier Bill
                        </h2>
                        <form onSubmit={handleRecordBill} className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Bill Amount (Rs.)</label>
                                <input
                                    type="number"
                                    required
                                    autoFocus
                                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-indigo-500 transition-all font-mono"
                                    placeholder="Enter amount..."
                                    value={billForm.amount}
                                    onChange={e => setBillForm({ ...billForm, amount: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Description / Notes</label>
                                <textarea
                                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-indigo-500 transition-all text-xs"
                                    rows={3}
                                    placeholder="e.g. Monthly vegetable supply, Meat delivery ref#442..."
                                    value={billForm.description}
                                    onChange={e => setBillForm({ ...billForm, description: e.target.value })}
                                />
                            </div>
                            <div className="flex gap-4 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowBillModal(false)}
                                    className="flex-1 py-4 bg-slate-900 text-slate-400 font-black rounded-xl uppercase text-[10px] tracking-widest transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={billLoading}
                                    className="flex-1 py-4 bg-indigo-600 text-white font-black rounded-xl uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all"
                                >
                                    {billLoading ? 'Processing...' : 'Post Bill'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ═══ SUPPLIER STATEMENT MODAL ═══ */}
            {showHistory && selectedSupplier && (
                <div className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-3 no-print">
                    <div className="bg-[#080d1a] border border-slate-800/80 w-full max-w-5xl rounded-3xl shadow-2xl flex flex-col h-[92vh] overflow-hidden">
                        {/* ─ Header ─ */}
                        <div className="px-7 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/30">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h2 className="text-xl font-black text-white uppercase tracking-tighter">Supplier Statement</h2>
                                    <span className="px-2 py-0.5 bg-indigo-600/20 border border-indigo-500/30 rounded text-[9px] font-black text-indigo-400 uppercase tracking-widest">
                                        {fullHistory.length} ENTRIES
                                    </span>
                                </div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                                    {selectedSupplier.name} · {selectedSupplier.phone || 'NO PHONE'}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => window.print()}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all"
                                >
                                    <Printer size={13} /> Print Statement
                                </button>
                                <button
                                    onClick={() => setShowHistory(false)}
                                    className="w-9 h-9 bg-slate-800 hover:bg-slate-700 rounded-xl flex items-center justify-center transition-all"
                                >
                                    <Plus size={18} className="rotate-45 text-slate-400" />
                                </button>
                            </div>
                        </div>

                        {/* ─ Metric Summary ─ */}
                        <div className="px-7 py-4 border-b border-slate-800 grid grid-cols-4 gap-4 bg-slate-900/10">
                            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                                <p className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em]">Total Billed (Liability)</p>
                                <p className="text-xl font-black text-red-400 mt-1">
                                    Rs. {fullHistory.filter(e => e.entry_type === 'BILL' || e.entry_type === 'ADJUSTMENT').reduce((s, e) => s + Number(e.amount), 0).toLocaleString()}
                                </p>
                            </div>
                            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                                <p className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em]">Total Paid (Payments)</p>
                                <p className="text-xl font-black text-emerald-400 mt-1">
                                    Rs. {fullHistory.filter(e => e.entry_type === 'PAYMENT').reduce((s, e) => s + Number(e.amount), 0).toLocaleString()}
                                </p>
                            </div>
                            <div className={`p-4 rounded-2xl border ${selectedSupplier.balance > 0 ? 'bg-red-950/20 border-red-900/30' : 'bg-emerald-950/20 border-emerald-900/30'}`}>
                                <p className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em]">Live Balance</p>
                                <p className={`text-xl font-black mt-1 ${selectedSupplier.balance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    Rs. {Math.abs(selectedSupplier.balance).toLocaleString()}
                                </p>
                                <p className="text-[8px] font-black text-slate-500 uppercase mt-1">{selectedSupplier.balance > 0 ? 'Owed to Supplier' : 'Advance Paid'}</p>
                            </div>
                            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                                <p className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em]">Net Activity</p>
                                <p className="text-xl font-black text-slate-300 mt-1">{fullHistory.length} Transactions</p>
                            </div>
                        </div>

                        {/* ─ Ledger Table ─ */}
                        <div className="flex-1 overflow-y-auto">
                            <table className="w-full text-xs text-left">
                                <thead className="sticky top-0 z-10 bg-[#080d1a] border-b border-slate-800">
                                    <tr className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                                        <th className="px-7 py-4">Date</th>
                                        <th className="px-4 py-4">Transaction / Description</th>
                                        <th className="px-4 py-4 text-right text-red-500/70">DR (Bill)</th>
                                        <th className="px-4 py-4 text-right text-emerald-500/70">CR (Payment)</th>
                                        <th className="px-7 py-4 text-right">Running Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/40">
                                    {fullHistory.map((entry) => {
                                        const isBill = entry.entry_type === 'BILL' || entry.entry_type === 'ADJUSTMENT';
                                        const balance = Number(entry.balance_after || 0);
                                        return (
                                            <tr key={entry.id} className="hover:bg-slate-900/40 transition-colors">
                                                <td className="px-7 py-4">
                                                    <div className="font-black text-slate-200">{new Date(entry.created_at).toLocaleDateString()}</div>
                                                    <div className="text-[9px] text-slate-600">{new Date(entry.created_at).toLocaleTimeString()}</div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${isBill ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                                                        <div className="font-bold text-slate-300 uppercase truncate max-w-xs">{entry.description || (isBill ? 'Purchase Bill' : 'Payment Made')}</div>
                                                    </div>
                                                    <div className="text-[8px] text-slate-600 mt-0.5 ml-3.5">ENTRY ID: {entry.id.slice(-12).toUpperCase()}</div>
                                                </td>
                                                <td className="px-4 py-4 text-right font-bold text-red-400/80">
                                                    {isBill ? `Rs. ${Number(entry.amount).toLocaleString()}` : '—'}
                                                </td>
                                                <td className="px-4 py-4 text-right font-bold text-emerald-400/80">
                                                    {!isBill ? `Rs. ${Number(entry.amount).toLocaleString()}` : '—'}
                                                </td>
                                                <td className="px-7 py-4 text-right">
                                                    <div className={`font-black tracking-tight ${balance > 0 ? 'text-red-400' : balance < 0 ? 'text-green-400' : 'text-slate-500'}`}>
                                                        Rs. {Math.abs(balance).toLocaleString()}
                                                    </div>
                                                    <div className="text-[7px] text-slate-600 font-black uppercase">{balance > 0 ? 'DR (OWE)' : balance < 0 ? 'CR (ADV)' : 'CLEAR'}</div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ ADD SUPPLIER MODAL ═══ */}
            {showAddModal && (
                <div className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
                    <div className="bg-[#080d1a] border border-slate-800 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden">
                        <div className="px-8 py-6 border-b border-slate-800 bg-slate-900/30">
                            <h2 className="text-xl font-black text-white uppercase tracking-tighter">Register New Supplier</h2>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Onboard a new vendor to Fireflow Ledger</p>
                        </div>
                        <form onSubmit={handleAddSupplier} className="p-8 space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Company Name</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:border-indigo-500 outline-none uppercase text-xs"
                                        value={supplierForm.name}
                                        onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Contact Person</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:border-indigo-500 outline-none text-xs"
                                        value={supplierForm.contact_name}
                                        onChange={e => setSupplierForm({ ...supplierForm, contact_name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Phone Number</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:border-indigo-500 outline-none text-xs"
                                        value={supplierForm.phone}
                                        onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Office Address</label>
                                <textarea
                                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white font-bold focus:border-indigo-500 outline-none text-xs"
                                    rows={3}
                                    value={supplierForm.address}
                                    onChange={e => setSupplierForm({ ...supplierForm, address: e.target.value })}
                                />
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="flex-1 py-4 bg-slate-900 text-slate-400 font-black rounded-xl uppercase text-[10px] tracking-widest transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-4 bg-indigo-600 text-white font-black rounded-xl uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-600/20 transition-all"
                                >
                                    Save Supplier
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
