import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../client/App'; // Path verified for src/operations/transactions/
import { Search, CreditCard, Banknote, Calendar, Download, Utensils, ShoppingBag, Truck, ClipboardList } from 'lucide-react';
import { OrderType } from '../../shared/types';
import { getCompositeStatus } from '../../shared/lib/orderStatus';

export const TransactionsView: React.FC = () => {
  const { transactions, orders, setActiveView } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMethod, setFilterMethod] = useState<string>('ALL');

  // --- STABLE FILTERING & SORTING ---
  const filteredTransactions = useMemo(() => {
    const safeSearchQuery = (searchQuery || '').toLowerCase();
    return (transactions || [])
      .filter(t => {
        const method = t.payment_method || t.method || 'CASH';
        const orderId = t.order_id || t.orderId || '';

        const matchesMethod = filterMethod === 'ALL' || method === filterMethod;
        const matchesSearch =
          String(orderId).toLowerCase().includes(safeSearchQuery) ||
          String(t.id || '').toLowerCase().includes(safeSearchQuery) ||
          String(t.transaction_ref || '').toLowerCase().includes(safeSearchQuery);
        return matchesMethod && matchesSearch;
      })
      .sort((a, b) => new Date(b.created_at || b.timestamp || Date.now()).getTime() - new Date(a.created_at || a.timestamp || Date.now()).getTime());
  }, [transactions, filterMethod, searchQuery]);

  // Aggregates with correct field mapping
  const totalSales = useMemo(() => (transactions || []).reduce((acc, t) => acc + (Number(t.amount) || 0), 0), [transactions]);
  const cashSales = useMemo(() => (transactions || []).filter(t => (t.payment_method || t.method) === 'CASH').reduce((acc, t) => acc + (Number(t.amount) || 0), 0), [transactions]);
  const cardSales = useMemo(() => (transactions || []).filter(t => (t.payment_method || t.method) === 'CARD').reduce((acc, t) => acc + (Number(t.amount) || 0), 0), [transactions]);
  const raastSales = useMemo(() => (transactions || []).filter(t => ['RAAST', 'JAZZCASH', 'EASYPAISA'].includes(t.payment_method || t.method)).reduce((acc, t) => acc + (Number(t.amount) || 0), 0), [transactions]);


  const getOrderTypeIcon = (type?: OrderType) => {
    switch (type) {
      case 'DINE_IN': return <Utensils size={12} className="text-blue-400" />;
      case 'TAKEAWAY': return <ShoppingBag size={12} className="text-yellow-400" />;
      case 'DELIVERY': return <Truck size={12} className="text-green-400" />;
      default: return null;
    }
  };

  return (
    <div className="flex h-full w-full bg-slate-950 flex-col overflow-hidden font-sans">

      {/* UNIFIED COMPACT HEADER & STATS */}
      <div className="p-4 shrink-0 bg-slate-900/30 border-b border-slate-800">
        
        {/* Top Row: Title, Filters & Actions */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-serif text-white tracking-wide uppercase">Register & Revenue</h1>
            <div className="h-4 w-px bg-slate-800"></div>
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-1.5 focus-within:border-slate-600 transition-colors w-64 text-sm">
              <Search size={14} className="text-slate-500 ml-1" />
              <input
                className="bg-transparent border-none outline-none text-slate-300 placeholder-slate-600 w-full px-1"
                placeholder="Search TXN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              {['ALL', 'CASH', 'CARD', 'RAAST'].map(method => (
                <button
                  key={method}
                  onClick={() => setFilterMethod(method)}
                  className={`px-2 py-1 rounded text-[9px] font-bold tracking-widest transition-all
                    ${filterMethod === method
                      ? 'bg-[#ffd900] text-black'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}
                    `}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveView('Activity')}
              className="px-3 py-1.5 bg-slate-800/50 hover:bg-slate-700 text-[#ffd900] rounded text-[9px] font-black uppercase tracking-widest border border-[#ffd900]/20 flex items-center gap-2 transition-all"
            >
              <ClipboardList size={12} /> Ticket Log
            </button>
            <button className="flex items-center justify-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-700 text-slate-300 rounded text-[9px] font-bold uppercase tracking-wider transition-colors border border-slate-700">
              <Calendar size={12} /> Today
            </button>
            <button className="flex items-center justify-center gap-2 px-3 py-1.5 bg-[#ffd900] hover:bg-[#e6c200] text-slate-900 rounded text-[9px] font-bold uppercase tracking-wider transition-colors shadow-lg shadow-[#ffd900]/20">
              <Download size={12} /> Export
            </button>
          </div>
        </div>

        {/* Bottom Row: Ultra-compact Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard title="Total Sales" value={totalSales} icon={<Banknote size={14} />} color="text-white" border="border-slate-700" />
          <StatCard title="Cash (Drawer)" value={cashSales} icon={<span>💵</span>} color="text-green-400" border="border-green-900/30" />
          <StatCard title="Card Terms" value={cardSales} icon={<CreditCard size={14} />} color="text-blue-400" border="border-blue-900/30" />
          <StatCard title="Raast/Online" value={raastSales} icon={<span className="font-serif italic font-black">R</span>} color="text-purple-400" border="border-purple-900/30" />
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="flex-1 overflow-auto px-4 md:px-8 py-4 custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead>
            <tr className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-white/5">
              <th className="py-5 pl-2">Temporal Stamp</th>
              <th className="py-5">ID / Reference</th>
              <th className="py-5 text-center">Type</th>
              <th className="py-5">Order Origin</th>
              <th className="py-5">Method</th>
              <th className="py-5">Processed By</th>
              <th className="py-5 text-center">Order Status</th>
              <th className="py-5 text-right pr-4">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.02]">
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-32 text-center text-slate-600">
                  <div className="flex flex-col items-center gap-3">
                    <Banknote size={40} className="opacity-20" />
                    <span className="text-xs font-black uppercase tracking-widest italic opacity-50">Zero Revenue Trace Detected</span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredTransactions.map((tx) => {
                const txOrderId = tx.order_id || tx.orderId;
                const order = orders.find(o => o.id === txOrderId);
                // CRITICAL FIX: Safe Date constructor with fallback
                const txDate = new Date(tx?.created_at || tx?.timestamp || Date.now());
                const method = tx.payment_method || tx.method || 'CASH';

                return (
                  <tr key={tx.id} className="group hover:bg-white/[0.02] transition-colors border-b border-white/[0.02]">
                    <td className="py-5 pl-2">
                      <div className="flex flex-col">
                        <span className="text-white font-mono text-sm leading-none mb-1">{txDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">{txDate.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      </div>
                    </td>
                    <td className="py-5">
                      <div className="flex flex-col">
                        <span className="text-slate-300 font-mono text-xs mb-1">#{tx.id.slice(-8).toUpperCase()}</span>
                        {tx.transaction_ref && <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{tx.transaction_ref}</span>}
                      </div>
                    </td>
                    <td className="py-5 text-center">
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        {getOrderTypeIcon(order?.type)}
                        {order?.type || 'SALE'}
                      </div>
                    </td>
                    <td className="py-5">
                      <div className="flex flex-col">
                        <span className="text-white text-xs font-bold leading-none mb-1">{order?.order_number || order?.id.slice(-6).toUpperCase() || 'WALK-IN'}</span>
                        <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{order?.customer_name || order?.customerName || order?.table?.name || 'GENERIC'}</span>
                      </div>
                    </td>
                    <td className="py-5">
                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${method === 'CASH' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        method === 'CARD' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                          'bg-purple-500/10 text-purple-400 border-purple-900/20'
                        }`}>
                        <div className={`w-1 h-1 rounded-full ${method === 'CASH' ? 'bg-emerald-400' : 'bg-blue-400'}`}></div>
                        {method}
                      </div>
                    </td>
                    <td className="py-5">
                      <span className="text-slate-400 text-xs font-medium italic opacity-70">{tx.processedBy || tx.staff?.name || 'System Terminal'}</span>
                    </td>
                    <td className="py-5 text-center">
                      {order ? (
                        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${getCompositeStatus(order.status, order.payment_status).bg} ${getCompositeStatus(order.status, order.payment_status).color} border border-current/20`}>
                          {getCompositeStatus(order.status, order.payment_status).label}
                        </div>
                      ) : (
                        <span className="text-[9px] text-slate-600 font-black uppercase">Legacy</span>
                      )}
                    </td>
                    <td className="py-5 text-right pr-4">
                      <div className="flex flex-col items-end">
                        <span className="text-white font-mono font-black text-sm">Rs. {(Number(tx.amount) || 0).toLocaleString()}</span>
                        <span className="text-[9px] text-green-500/60 font-black uppercase tracking-widest">Verified</span>
                      </div>
                    </td>
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
const StatCard: React.FC<{ title: string, value: number, icon: React.ReactNode, color: string, border: string }> = ({ title, value, icon, color, border }) => (
  <div className={`bg-slate-950 border ${border} p-3 rounded-xl shadow-lg flex items-center justify-between gap-4 transition-all hover:scale-[1.02] cursor-default group`}>
    <div className="flex items-center gap-3">
       <div className={`${color} opacity-60 group-hover:opacity-100 transition-all`}>{icon}</div>
       <span className="text-slate-500 text-[9px] uppercase tracking-widest font-black group-hover:text-slate-300">{title}</span>
    </div>
    <div className={`text-base font-serif font-bold ${color} tracking-tighter`}>
      <span className="text-[10px] opacity-50 mr-1 uppercase font-sans">Rs.</span>
      {(Number(value) || 0).toLocaleString()}
    </div>
  </div>
);