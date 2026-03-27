import React, { useState, useEffect } from 'react';
import { 
    Users, 
    Search, 
    Clock
} from 'lucide-react';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';
import { useAppContext } from '../../../client/contexts/AppContext';
import { Button } from '../../../shared/ui/Button';
import { Input } from '../../../shared/ui/Input';
// Removed react-hot-toast

export const SupplierLedgerPanel: React.FC = () => {
    const { addNotification } = useAppContext();
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
    const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
    const [showBillModal, setShowBillModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [form, setForm] = useState({ amount: '', description: '', paymentMethod: 'CASH', referenceId: '' });

    useEffect(() => {
        fetchSuppliers();
    }, []);

    const fetchSuppliers = async () => {
        try {
            const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const res = await fetchWithAuth(`${baseUrl}/suppliers`);
            if (res.ok) {
                const data = await res.json();
                setSuppliers(data || []);
            }
        } catch (e) {
            addNotification('error', 'Failed to load suppliers');
        }
    };

    const fetchLedger = async (supplierId: string) => {
        setLoading(true);
        try {
            const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const res = await fetchWithAuth(`${baseUrl}/suppliers/${supplierId}/statement`);
            if (res.ok) {
                const data = await res.json();
                setLedgerEntries(data || []);
            }
        } catch (e) {
            addNotification('error', 'Failed to load ledger');
        } finally {
            setLoading(false);
        }
    };

    const handleSupplierSelect = (supplier: any) => {
        setSelectedSupplier(supplier);
        fetchLedger(supplier.id);
    };

    const handleAction = async (type: 'bill' | 'payment') => {
        if (!selectedSupplier || !form.amount) return;
        setLoading(true);
        try {
            const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const res = await fetchWithAuth(`${baseUrl}/suppliers/${type}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supplierId: selectedSupplier.id,
                    amount: Number(form.amount),
                    description: form.description,
                    paymentMethod: form.paymentMethod,
                    referenceId: form.referenceId
                })
            });

            if (res.ok) {
                addNotification('success', `${type === 'bill' ? 'Bill' : 'Payment'} recorded`);
                setShowBillModal(false);
                setShowPaymentModal(false);
                setForm({ amount: '', description: '', paymentMethod: 'CASH', referenceId: '' });
                fetchSuppliers(); // Refresh balance
                fetchLedger(selectedSupplier.id);
            } else {
                const err = await res.json();
                addNotification('error', err.error || 'Operation failed');
            }
        } catch (e) {
            addNotification('error', 'Connection error');
        } finally {
            setLoading(false);
        }
    };

    const filteredSuppliers = suppliers.filter((s: any) => 
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.contact_person && s.contact_person.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-250px)] animate-in fade-in slide-in-from-right-4 duration-500 text-white relative">
            {/* Sidebar: Supplier List */}
            <div className="w-full md:w-80 space-y-4 flex flex-col">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input 
                        placeholder="Search Suppliers..." 
                        className="pl-10 h-10 bg-slate-900 border-slate-800"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-2 pr-2 no-scrollbar">
                    {filteredSuppliers.map((s: any) => (
                        <button
                            key={s.id}
                            onClick={() => handleSupplierSelect(s)}
                            className={`w-full text-left p-4 rounded-xl border transition-all ${
                                selectedSupplier?.id === s.id 
                                    ? 'bg-blue-600/10 border-blue-600/50 shadow-lg' 
                                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold truncate">{s.name}</h4>
                                {selectedSupplier?.id === s.id && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                            </div>
                            <div className="flex justify-between items-center mt-1">
                                <p className="text-[10px] text-slate-500 uppercase font-black">{s.contact_person || 'No Contact'}</p>
                                <p className="text-xs font-bold text-amber-500">Rs. {Number(s.balance || 0).toLocaleString()}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content: Ledger Audit */}
            <div className="flex-1 flex flex-col min-w-0">
                {!selectedSupplier ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500 bg-slate-900/30 rounded-2xl border border-dashed border-slate-800">
                        <Users className="w-12 h-12 mb-4 opacity-20" />
                        <p className="text-sm italic uppercase font-bold tracking-widest text-[10px]">Select a supplier to view audit trail</p>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
                        {/* Supplier Info Header */}
                        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-900 p-4 rounded-2xl border border-slate-800">
                            <div>
                                <h2 className="text-xl font-bold font-serif">{selectedSupplier.name}</h2>
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-0.5">Current Balance: <span className="text-amber-500">Rs. {Number(selectedSupplier.balance || 0).toLocaleString()}</span></p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button 
                                    variant="secondary" 
                                    size="sm" 
                                    className="h-9 px-4 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30"
                                    onClick={() => setShowBillModal(true)}
                                >
                                    Record Bill
                                </Button>
                                <Button 
                                    variant="secondary" 
                                    size="sm" 
                                    className="h-9 px-4 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
                                    onClick={() => setShowPaymentModal(true)}
                                >
                                    Make Payment
                                </Button>
                                <Button variant="secondary" size="sm" className="h-9 px-3" onClick={() => fetchLedger(selectedSupplier.id)}>
                                    <Clock className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                </Button>
                            </div>
                        </div>

                        {/* Audit Table */}
                        <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex flex-col shadow-2xl">
                            <div className="flex-1 overflow-y-auto no-scrollbar">
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 bg-slate-950/90 backdrop-blur-xl z-10 border-b border-slate-800">
                                        <tr>
                                            <th className="p-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Date</th>
                                            <th className="p-4 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Type</th>
                                            <th className="p-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Description</th>
                                            <th className="p-4 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Amount</th>
                                            <th className="p-4 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/30">
                                        {ledgerEntries.map((entry: any) => (
                                            <tr key={entry.id} className="hover:bg-slate-800/20 transition-colors group">
                                                <td className="p-4 text-[10px] font-bold text-slate-400">
                                                    {new Date(entry.created_at).toLocaleDateString()}
                                                    <div className="text-[8px] text-slate-600 font-mono mt-0.5">{new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}</div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                                        entry.entry_type === 'BILL' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                                    }`}>
                                                        {entry.entry_type}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-xs text-slate-300 font-medium">
                                                    {entry.description}
                                                    {entry.reference_id && <div className="text-[8px] text-slate-600 font-mono mt-0.5">REF: {entry.reference_id}</div>}
                                                </td>
                                                <td className={`p-4 text-xs font-black text-right ${
                                                    entry.entry_type === 'BILL' ? 'text-amber-400' : 'text-emerald-400'
                                                }`}>
                                                    {entry.entry_type === 'BILL' ? '+' : '-'} Rs. {Number(entry.amount).toLocaleString()}
                                                </td>
                                                <td className="p-4 text-xs font-mono font-bold text-slate-400 text-right group-hover:text-blue-400 transition-colors">
                                                    Rs. {Number(entry.balance_after).toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                        {ledgerEntries.length === 0 && !loading && (
                                            <tr>
                                                <td colSpan={5} className="p-12 text-center text-slate-600 italic text-[10px] font-bold uppercase tracking-widest">
                                                    Transaction audit is empty for this supplier
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modals for Bill and Payment */}
            {(showBillModal || showPaymentModal) && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-800 p-8 rounded-[2rem] max-w-md w-full shadow-2xl relative overflow-hidden">
                         <div className={`absolute top-0 left-0 right-0 h-1 ${showBillModal ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                         
                         <h2 className="text-2xl font-serif text-white flex items-center gap-3 mb-6">
                             {showBillModal ? 'Record Supplier Bill' : 'Record Payment'}
                             <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-slate-800 rounded text-slate-400 border border-slate-700">
                                 {selectedSupplier?.name}
                             </span>
                         </h2>

                         <div className="space-y-4">
                             <div>
                                 <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 mb-1.5 block">Amount (Rs.)</label>
                                 <Input 
                                    type="number"
                                    placeholder="Enter amount..."
                                    className="bg-slate-950 border-slate-800 h-12 text-lg font-bold"
                                    value={form.amount}
                                    onChange={(e) => setForm({...form, amount: e.target.value})}
                                 />
                             </div>

                             <div>
                                 <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 mb-1.5 block">Description</label>
                                 <Input 
                                    placeholder="e.g. Weekly inventory Restock"
                                    className="bg-slate-950 border-slate-800"
                                    value={form.description}
                                    onChange={(e) => setForm({...form, description: e.target.value})}
                                 />
                             </div>

                             {showPaymentModal && (
                                 <div>
                                     <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 mb-1.5 block">Payment Method</label>
                                     <select 
                                        className="w-full h-11 bg-slate-950 border border-slate-800 rounded-xl px-4 text-xs font-bold text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={form.paymentMethod}
                                        onChange={(e) => setForm({...form, paymentMethod: e.target.value})}
                                     >
                                         <option value="CASH">Cash</option>
                                         <option value="BANK_TRANSFER">Bank Transfer</option>
                                         <option value="CHEQUE">Cheque</option>
                                     </select>
                                 </div>
                             )}

                             <div>
                                 <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1 mb-1.5 block">Reference ID (Opt.)</label>
                                 <Input 
                                    placeholder="Invoice # or TXN ID"
                                    className="bg-slate-950 border-slate-800"
                                    value={form.referenceId}
                                    onChange={(e) => setForm({...form, referenceId: e.target.value})}
                                 />
                             </div>
                         </div>

                         <div className="flex gap-4 mt-10">
                             <Button 
                                variant="secondary" 
                                className="flex-1 py-4 rounded-2xl border-slate-800 text-slate-500 hover:text-white"
                                onClick={() => {
                                    setShowBillModal(false);
                                    setShowPaymentModal(false);
                                    setForm({ amount: '', description: '', paymentMethod: 'CASH', referenceId: '' });
                                }}
                             >
                                Cancel
                             </Button>
                             <Button 
                                className={`flex-1 py-4 rounded-2xl text-slate-950 font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all
                                    ${showBillModal ? 'bg-amber-500 hover:bg-amber-400' : 'bg-emerald-500 hover:bg-emerald-400'}
                                `}
                                onClick={() => handleAction(showBillModal ? 'bill' : 'payment')}
                                disabled={loading || !form.amount}
                             >
                                {loading ? 'Processing...' : 'Confirm Entry'}
                             </Button>
                         </div>
                    </div>
                </div>
            )}
        </div>
    );
};
