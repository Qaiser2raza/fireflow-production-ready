
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../App';
import { Search, CreditCard, DollarSign, Calendar, Download, Utensils, ShoppingBag, Truck, ClipboardList } from 'lucide-react';
import { OrderType } from '../types';

export const TransactionsView: React.FC = () => {
  const { transactions, orders, setActiveView } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMethod, setFilterMethod] = useState<string>('ALL');

  // Calculate Aggregates
  const totalSales = (transactions || []).reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const cashSales = (transactions || []).filter(t => t.method === 'CASH').reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const cardSales = (transactions || []).filter(t => t.method === 'CARD').reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const raastSales = (transactions || []).filter(t => t.method === 'RAAST').reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

  const getOrderTypeIcon = (type?: OrderType) => {
    switch (type) {
      case 'dine-in': return <Utensils size={12} className="text-blue-400" />;
      case 'takeaway': return <ShoppingBag size={12} className="text-yellow-400" />;
      case 'delivery': return <Truck size={12} className="text-green-400" />;
      default: return null;
    }
  };

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
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [transactions, filterMethod, searchQuery]);

  return (
    <div className="flex h-full w-full bg-slate-950 flex-col overflow-hidden">
      
      {/* Header & Stats Cards */}
      <div className="p-4 md:p-8 md:pb-4 overflow-y-auto shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl md:text-2xl font-serif text-white tracking-wide">Register & Revenue</h1>
            <button 
              onClick={() => setActiveView('orders')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-gold-500 rounded-lg text-[10px] font-black uppercase tracking-widest border border-gold-500/20 flex items-center gap-2 transition-all"
            >
              <ClipboardList size={14}/> View Full Ticket Log
            </button>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-bold uppercase tracking-wider transition-colors border border-slate-700">
               <cite><Calendar size={14} /></cite> Today
            </button>
            <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-gold-500 hover:bg-gold-400 text-slate-900 rounded text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-gold-500/20">
               <cite><Download size={14} /></cite> Export
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

      {/* Filters Table Header */}
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
        <div className="text-slate-500 text-xs font-mono self-end md:self-auto">
           {filteredTransactions.length} Records
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 overflow-auto px-4 md:px-8 py-4">
         <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
               <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800">
                  <th className="py-3 pl-2">Time</th>
                  <th className="py-3">Transaction ID</th>
                  <th className="py-3">Type</th>
                  <th className="py-3">Order Ref</th>
                  <th className="py-3">Method</th>
                  <th className="py-3">Processed By</th>
                  <th className="py-3 text-right pr-2">Amount</th>
               </tr>
            </thead>
            <tbody>
               {filteredTransactions.length === 0 ? (
                 <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-600 text-sm">No transactions found</td>
                 </tr>
               ) : (
                 filteredTransactions.map((tx, idx) => {
                   const order = orders.find(o => o.id === tx.orderId);
                   return (
                     <tr key={tx.id} className="border-b border-slate-800/50 hover:bg-slate-900/50 transition-colors group">
                        <td className="py-3 pl-2 text-slate-400 font-mono text-xs">
                          {tx.timestamp.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                          <span className="text-slate-600 ml-2 text-[10px] hidden lg:inline">{tx.timestamp.toLocaleDateString()}</span>
                        </td>
                        <td className="py-3 text-slate-300 font-mono text-xs group-hover:text-gold-500 transition-colors">{tx.id}</td>
                        <td className="py-3">
                           <div className="flex items-center gap-2">
                             {getOrderTypeIcon(order?.type)}
                             <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{order?.type || '---'}</span>
                           </div>
                        </td>
                        <td className="py-3 text-slate-500 text-xs">#{ (tx.orderId || '').split('-')[1] || '---' }</td>
                        <td className="py-3">
                           <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase
                             ${tx.method === 'CASH' ? 'text-green-400 border-green-900/30 bg-green-900/10' : ''}
                             ${tx.method === 'CARD' ? 'text-blue-400 border-blue-900/30 bg-blue-900/10' : ''}
                             ${tx.method === 'RAAST' ? 'text-purple-400 border-purple-900/30 bg-purple-900/10' : ''}
                           `}>
                             {tx.method}
                           </span>
                        </td>
                        <td className="py-3 text-slate-400 text-xs capitalize">{tx.processedBy}</td>
                        <td className="py-3 pr-2 text-right font-mono font-medium text-slate-200">
                           Rs. {(Number(tx.amount) || 0).toLocaleString()}
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

const StatCard: React.FC<{title: string, value: number, icon: React.ReactNode, color: string, bg: string, border: string}> = ({title, value, icon, color, bg, border}) => (
  <div className={`${bg} border ${border} p-5 rounded-xl shadow-xl flex flex-col justify-between h-24 md:h-32`}>
     <div className="flex justify-between items-start">
        <span className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">{title}</span>
        <div className={`${color} opacity-80 scale-75 md:scale-100 origin-top-right`}>{icon}</div>
     </div>
     <div className={`text-xl md:text-3xl font-serif font-medium ${color} truncate`}>
        <span className="text-sm md:text-lg opacity-50 mr-1">Rs.</span>
        {(Number(value) || 0).toLocaleString()}
     </div>
  </div>
);
