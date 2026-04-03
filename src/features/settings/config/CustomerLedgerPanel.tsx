import React, { useState, useEffect } from 'react';
import { 
    Users, 
    Search, 
    Clock,
    CreditCard,
    CheckCircle
} from 'lucide-react';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';
import { useRestaurant } from '../../../client/RestaurantContext';
import { useAppContext } from '../../../client/contexts/AppContext';
import { Button } from '../../../shared/ui/Button';
import { Input } from '../../../shared/ui/Input';
// Removed react-hot-toast dependency

export const CustomerLedgerPanel: React.FC = () => {
    const { currentRestaurant } = useRestaurant();
    const { addNotification, currentUser } = useAppContext();
    const [customers, setCustomers] = useState<any[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
    const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');

    const handleApprove = async (entryId: string) => {
        if (!confirm('Approve this receipt and post to General Ledger?')) return;
        try {
            const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const res = await fetchWithAuth(`${baseUrl}/accounting/ledger/${entryId}/approve`, {
                method: 'PATCH',
                body: JSON.stringify({ type: 'CUSTOMER' })
            });
            if (res.ok) {
                if (selectedCustomer) fetchLedger(selectedCustomer.id);
            }
        } catch (err: any) {
            console.error('Approval failed:', err);
            addNotification('error', 'Approval failed: ' + err.message);
        }
    };

    useEffect(() => {
        fetchCustomers();
    }, []);

    const fetchCustomers = async () => {
        try {
            const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const res = await fetchWithAuth(`${baseUrl}/customers`);
            if (res.ok) {
                const data = await res.json();
                setCustomers(data || []);
            }
        } catch (e) {
            addNotification('error', 'Failed to load customers');
        }
    };

    const fetchLedger = async (customerId: string) => {
        setLoading(true);
        try {
            const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api';
            const res = await fetchWithAuth(`${baseUrl}/finance/customers/${customerId}/ledger?restaurant_id=${currentRestaurant?.id}`);
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

    const handleCustomerSelect = (customer: any) => {
        setSelectedCustomer(customer);
        fetchLedger(customer.id);
    };

    const filteredCustomers = customers.filter((c: any) => 
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.phone && c.phone.includes(search))
    );

    return (
        <div className="flex flex-col md:flex-row gap-6 h-[calc(100vh-250px)] animate-in fade-in slide-in-from-right-4 duration-500 text-white">
            {/* Sidebar: Customer List */}
            <div className="w-full md:w-80 space-y-4 flex flex-col">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input 
                        placeholder="Search Customers..." 
                        className="pl-10 h-10 bg-slate-900 border-slate-800"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-2 pr-2 no-scrollbar">
                    {filteredCustomers.map((c: any) => (
                        <button
                            key={c.id}
                            onClick={() => handleCustomerSelect(c)}
                            className={`w-full text-left p-4 rounded-xl border transition-all ${
                                selectedCustomer?.id === c.id 
                                    ? 'bg-emerald-600/10 border-emerald-600/50 shadow-lg' 
                                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold truncate">{c.name}</h4>
                                {selectedCustomer?.id === c.id && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                            </div>
                            <p className="text-xs text-slate-500 mt-1">{c.phone || 'No Phone'}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content: Ledger Audit */}
            <div className="flex-1 flex flex-col min-w-0">
                {!selectedCustomer ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500 bg-slate-900/30 rounded-2xl border border-dashed border-slate-800">
                        <Users className="w-12 h-12 mb-4 opacity-20" />
                        <p className="text-sm">Select a customer to view credit audit trail</p>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
                        {/* Customer Info Header */}
                        <div className="flex items-center justify-between bg-slate-900 p-4 rounded-2xl border border-slate-800">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-emerald-500/20 rounded-xl">
                                    <CreditCard className="w-6 h-6 text-emerald-500" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold">{selectedCustomer.name}</h2>
                                    <p className="text-xs text-slate-400">Customer Credit Ledger</p>
                                </div>
                            </div>
                            <Button variant="secondary" size="sm" onClick={() => fetchLedger(selectedCustomer.id)}>
                                <Clock className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                                Refresh
                            </Button>
                        </div>

                        {/* Audit Table */}
                        <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex flex-col">
                            <div className="flex-1 overflow-y-auto no-scrollbar">
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 bg-slate-950/80 backdrop-blur z-10 border-b border-slate-800">
                                        <tr>
                                            <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Date</th>
                                            <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Type</th>
                                            <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Description</th>
                                            <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Debit / Credit</th>
                                            <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Status</th>
                                            <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Balance</th>
                                            <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {ledgerEntries.map((entry: any) => (
                                            <tr key={entry.id} className="hover:bg-slate-800/20 transition-colors">
                                                <td className="p-4 text-xs text-slate-400">
                                                    {new Date(entry.created_at).toLocaleDateString()}
                                                </td>
                                                <td className="p-4">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tighter ${
                                                        entry.entry_type === 'SALE' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'
                                                    }`}>
                                                        {entry.entry_type}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-xs text-slate-200">
                                                    {entry.description}
                                                </td>
                                                <td className={`p-4 text-xs font-bold text-right ${
                                                    entry.entry_type === 'SALE' ? 'text-amber-400' : 'text-emerald-400'
                                                }`}>
                                                    {entry.entry_type === 'SALE' ? '+' : '-'} Rs. {Number(entry.amount).toLocaleString()}
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                                                        entry.entry_status === 'approved' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
                                                    }`}>
                                                        {entry.entry_status || 'approved'}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-xs font-mono text-slate-400 text-right">
                                                    Rs. {Number(entry.balance_after).toLocaleString()}
                                                </td>
                                                <td className="p-4 text-center">
                                                    {entry.entry_status === 'provisional' && ['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(currentUser?.role || '') && (
                                                        <button
                                                            onClick={() => handleApprove(entry.id)}
                                                            className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-500 text-white rounded text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20"
                                                        >
                                                            <CheckCircle size={10} />
                                                            Approve
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {ledgerEntries.length === 0 && !loading && (
                                            <tr>
                                                <td colSpan={5} className="p-12 text-center text-slate-600 italic text-sm">
                                                    No credit history found for this customer.
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
        </div>
    );
};
