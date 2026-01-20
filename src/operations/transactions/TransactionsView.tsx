import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../client/App'; // Path verified for src/operations/transactions/
import { Search, CreditCard, DollarSign, Calendar, Download, Utensils, ShoppingBag, Truck, ClipboardList } from 'lucide-react';
import { OrderType } from '../../shared/types';

export const TransactionsView: React.FC = () => {
  const { transactions, orders, setActiveView } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMethod, setFilterMethod] = useState<string>('ALL');

  // --- REVENUE AGGREGATES ---
  // Ensuring numbers are parsed correctly and fall back to 0 if data is missing
  const totalSales = (transactions || []).reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const cashSales = (transactions || []).filter(t => t.method === 'CASH').reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const cardSales = (transactions || []).filter(t => t.method === 'CARD').reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const raastSales = (transactions || []).filter(t => t.method === 'RAAST').reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

  const getOrderTypeIcon = (type?: OrderType) => {
    switch (type) {
      case 'DINE_IN': return <Utensils size={12} className="text-blue-400" />;
      case 'TAKEAWAY': return <ShoppingBag size={12} className="text-yellow-400" />;
      case 'DELIVERY': return <Truck size={12} className="text-green-400" />;
      default: return null;
    }
  };

  // --- STABLE FILTERING & SORTING ---
  const filteredTransactions = useMemo(() => {
    const safeSearchQuery = (searchQuery || '').toLowerCase();
    return (transactions || [])
      .filter(t => {
        const matchesMethod = filterMethod === 'ALL' || t.method === filterMethod;
        const matchesSearch =
          String(t.orderId || '').toLowerCase().includes(safeSearchQuery) ||
          String(t.id || '').toLowerCase().includes(safeSearchQuery);
        return matchesMethod && matchesSearch;
      })
      // FIX: Converting string timestamps to Date objects for sorting
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [transactions, filterMethod, searchQuery]);

  return (
    <div className="flex h-full w-full bg-slate-950 flex-col overflow-hidden font-sans">
      
      {/* HEADER & STATS CARDS */}
      <div className="p-4 md:p-8 md:pb-4 shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl md:text-2xl font-serif text-white tracking-wide uppercase">Register & Revenue</h1>
            <button
              onClick={() => setActiveView('orders')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-[#ffd900] rounded-lg text-[10px] font-black uppercase tracking-widest border border-[#ffd900]/20 flex items-center gap-2 transition-all"
            >
              <ClipboardList size={14} /> View Full Ticket Log
            </button>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-bold uppercase tracking-wider transition-colors border border-slate-700">
              <Calendar size={14} /> Today
            </button>
            <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#ffd900] hover:bg-[#e6c200] text-slate-900 rounded text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-[#ffd900]/20">
              <Download size={14} /> Export
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          <StatCard title="Total Sales" value={totalSales} icon={<DollarSign size={20} />} color="text-white" bg="bg-gradient-to-br from-slate-800 to-slate-900" border="border-slate-700" />
          <StatCard title="Cash (In Drawer)" value={cashSales} icon={<span className="text-xl">💵</span>} color="text-green-400" bg="bg-slate-900" border="border-green-900/30" />
          <StatCard title="Card Terminals" value={cardSales} icon={<CreditCard size={20} />} color="text-blue-400" bg="bg-slate-900" border="border-blue-900/30" />
          <StatCard title="Raast / Online" value={raastSales} icon={<span className="text-xl font-serif italic font-black">R</span>} color="text-purple-400" bg="bg-slate-900" border="border-purple-900/30" />
        </div>
      </div>

      {/* FILTERS & SEARCH */}
      <div className="px-4 md:px-8 py-4 bg-slate-900/50 border-y border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-2 w-full md:w-64 focus-within:border-slate-600 transition-colors">
            <Search size={16} className="text-slate-500" />
            <input
              className="bg-transparent border-none outline-none text-slate-300 placeholder-slate-600 text-sm w-full"
              placeholder="Search Transaction ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="hidden md:block h-8 w-px bg-slate-800" />

          <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
            {['ALL', 'CASH', 'CARD', 'RAAST'].map(method => (
              <button
                key={method}
                onClick={() => setFilterMethod(method)}
                className={`px-3 py-1.5 rounded text-[10px] font-bold tracking-wider transition-all whitespace-nowrap
                  ${filterMethod === method
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}
                  `}
              >
                {method}
              </button>
            ))}
          </div>
        </div>
        <div className="text-slate-500 text-xs font-mono self-end md:self-auto uppercase tracking-tighter">
          {filteredTransactions.length} Records found
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="flex-1 overflow-auto px-4 md:px-8 py-4">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">
              <th className="py-3 pl-2">Processed Time</th>
              <th className="py-3">Transaction ID</th>
              <th className="py-3">Type</th>
              <th className="py-3">Order Reference</th>
              <th className="py-3">Method</th>
              <th className="py-3">Handled By</th>
              <th className="py-3 text-right pr-2">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-20 text-center text-slate-600 text-sm uppercase font-black tracking-widest italic opacity-50">
                   NO REVENUE RECORDS DETECTED
                </td>
              </tr>
            ) : (
filteredTransactions.map((tx) => {
  const order = orders.find(o => o.id === tx.orderId);
  // CRITICAL FIX: Safe Date constructor with fallback
  const txDate = new Date(tx?.timestamp || Date.now());

  return (
    <tr key={tx.id} className="...">
      <td className="py-4 pl-2 text-slate-400 font-mono text-xs">
        <div className="flex flex-col">
          {/* SAFE CALL: txDate is guaranteed to be a valid Date object now */}
          <span>{txDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <span className="..."> {txDate.toLocaleDateString()} </span>
        </div>
      </td>
      ...
    </tr>
  );
})
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- SUB-COMPONENT: STAT CARD ---
const StatCard: React.FC<{ title: string, value: number, icon: React.ReactNode, color: string, bg: string, border: string }> = ({ title, value, icon, color, bg, border }) => (
  <div className={`${bg} border ${border} p-5 rounded-2xl shadow-2xl flex flex-col justify-between h-28 md:h-36 transition-all hover:scale-[1.02] cursor-default group`}>
    <div className="flex justify-between items-start">
      <span className="text-slate-500 text-[10px] uppercase tracking-widest font-black group-hover:text-slate-300">{title}</span>
      <div className={`${color} opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all`}>{icon}</div>
    </div>
    <div className={`text-xl md:text-3xl font-serif font-medium ${color} tracking-tighter`}>
      <span className="text-xs md:text-sm opacity-50 mr-1 uppercase font-sans">PKR</span>
      {(Number(value) || 0).toLocaleString()}
    </div>
  </div>
);