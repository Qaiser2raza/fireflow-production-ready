
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../App';
import { Expense } from '../types';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Calendar, 
  ShoppingBag, 
  Users, 
  Zap, 
  Home, 
  CreditCard, 
  ArrowUpRight, 
  ArrowDownRight, 
  Search,
  Filter,
  X,
  Loader2,
  CheckCircle2
} from 'lucide-react';

export const AccountingView: React.FC = () => {
  const { transactions, expenses, addExpense, currentUser } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Partial<Expense>>({
    category: 'inventory',
    amount: 0,
    description: '',
    date: new Date()
  });

  // Financial Calculations - Defensive Number Casting
  const totalRevenue = useMemo(() => {
    return (transactions || []).reduce((sum, t) => sum + (Number(t?.amount) || 0), 0);
  }, [transactions]);

  const totalExpenses = useMemo(() => {
    return (expenses || []).reduce((sum, e) => sum + (Number(e?.amount) || 0), 0);
  }, [expenses]);

  const netProfit = totalRevenue - totalExpenses;
  const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Ledger Construction (Unified view of revenue and expenses)
  const ledger = useMemo(() => {
    try {
      const safeSearchQuery = (searchQuery || '').toLowerCase();
      
      const incomeEntries = (transactions || []).map(t => {
        if (!t) return null;
        // FIX: Use camelCase orderId from interface
        const orderIdStr = String(t.orderId || '');
        const parts = orderIdStr.split('-');
        // Extracting just the ID part safely
        const displayId = parts.length > 1 ? parts[parts.length - 1] : (orderIdStr.substring(Math.max(0, orderIdStr.length - 8)) || 'UNK');
        
        // FIX: Use timestamp from Transaction interface
        const rawDate = t.timestamp;
        const date = rawDate ? new Date(rawDate) : new Date();
        
        return {
          id: t.id || 'N/A',
          type: 'INCOME' as const,
          category: 'Sales',
          amount: Number(t.amount) || 0,
          description: `Order #${displayId}`,
          date: isNaN(date.getTime()) ? new Date() : date,
          // FIX: Use camelCase processedBy from interface
          user: t.processedBy || 'Staff'
        };
      }).filter((item): item is NonNullable<typeof item> => item !== null);

      const expenseEntries = (expenses || []).map(e => {
        if (!e) return null;
        // FIX: Use date from Expense interface
        const rawDate = e.date;
        const date = rawDate ? new Date(rawDate) : new Date();
        return {
          id: e.id || 'N/A',
          type: 'EXPENSE' as const,
          category: e.category || 'Other',
          amount: Number(e.amount) || 0,
          description: e.description || 'Business Expense',
          date: isNaN(date.getTime()) ? new Date() : date,
          // FIX: Use camelCase processedBy from interface
          user: e.processedBy || 'Manager'
        };
      }).filter((item): item is NonNullable<typeof item> => item !== null);

      const entries = [...incomeEntries, ...expenseEntries];
      
      return entries
        .filter(item => 
          (item.description || '').toLowerCase().includes(safeSearchQuery) ||
          (item.category || '').toLowerCase().includes(safeSearchQuery)
        )
        .sort((a, b) => b.date.getTime() - a.date.getTime());
    } catch (err) {
      console.error("Ledger calculation failed:", err);
      return [];
    }
  }, [transactions, expenses, searchQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || !formData.description) return;
    setIsSaving(true);
    const newExpense: Expense = {
      id: `EXP-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
      category: (formData.category as any) || 'other',
      amount: Number(formData.amount),
      description: formData.description || '',
      date: formData.date || new Date(),
      processedBy: currentUser?.name || 'Manager'
    };
    await addExpense(newExpense);
    setIsSaving(false);
    setIsModalOpen(false);
    setFormData({ category: 'inventory', amount: 0, description: '', date: new Date() });
  };

  return (
    <div className="flex h-full w-full bg-slate-950 flex-col overflow-hidden">
      {/* Header & Stats */}
      <div className="p-8 border-b border-slate-800 bg-slate-900/50">
        <div className="flex justify-between items-center mb-8">
           <div>
             <h2 className="text-gold-500 text-xs font-bold uppercase tracking-[0.2em] mb-1">Financial Integrity</h2>
             <h1 className="text-3xl font-serif text-white">The Vault</h1>
           </div>
           <button 
             onClick={() => setIsModalOpen(true)}
             className="px-6 py-3 bg-gold-500 hover:bg-gold-400 text-black font-bold uppercase tracking-widest rounded shadow-lg flex items-center gap-2"
           >
             <cite><Plus size={18} /></cite> Log Expense
           </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
           <KPICard title="Total Sales" value={totalRevenue} color="text-green-400" icon={<TrendingUp size={20}/>} />
           <KPICard title="Total Expenses" value={totalExpenses} color="text-red-400" icon={<TrendingDown size={20}/>} />
           <KPICard title="Net Profit" value={netProfit} color="text-white" icon={<DollarSign size={20}/>} subText={`${isNaN(margin) ? '0' : margin.toFixed(1)}% Margin`} />
           <KPICard title="Cash Flow" value={totalRevenue - totalExpenses} color="text-gold-500" icon={<CreditCard size={20}/>} />
        </div>
      </div>

      {/* Ledger Table */}
      <div className="flex-1 overflow-hidden flex flex-col p-8">
        <div className="flex justify-between items-center mb-4">
           <h3 className="text-white font-serif text-xl">General Ledger</h3>
           <div className="flex items-center gap-4 bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl w-64">
              <Search size={16} className="text-slate-500" />
              <input 
                placeholder="Filter ledger..." 
                className="bg-transparent border-none outline-none text-sm text-slate-300 w-full"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
           </div>
        </div>

        <div className="flex-1 overflow-y-auto border border-slate-800 rounded-2xl bg-slate-900/30">
           <table className="w-full text-left border-collapse">
              <thead className="bg-slate-950 sticky top-0 z-10">
                 <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-800">
                    <th className="py-4 px-6">Date</th>
                    <th className="py-4 px-6">Entry</th>
                    <th className="py-4 px-6">Category</th>
                    <th className="py-4 px-6">Staff</th>
                    <th className="py-4 px-6 text-right">In</th>
                    <th className="py-4 px-6 text-right">Out</th>
                 </tr>
              </thead>
              <tbody>
                 {ledger.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center text-slate-600 font-bold uppercase tracking-widest text-xs italic">
                        No financial records found
                      </td>
                    </tr>
                 ) : (
                   ledger.map((item, idx) => (
                     <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors group">
                        <td className="py-4 px-6 text-xs text-slate-500 font-mono">
                           {item.date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                           <span className="block text-[10px] opacity-60">{item.date.toLocaleDateString()}</span>
                        </td>
                        <td className="py-4 px-6">
                           <div className="text-white font-medium text-sm">{item.description}</div>
                           <div className="text-[10px] text-slate-600 font-mono">ID: {item.id}</div>
                        </td>
                        <td className="py-4 px-6">
                           <span className="text-[10px] font-black uppercase tracking-widest bg-slate-800 text-slate-400 px-2 py-1 rounded">
                              {item.category}
                           </span>
                        </td>
                        <td className="py-4 px-6 text-xs text-slate-400 capitalize">{item.user}</td>
                        <td className="py-4 px-6 text-right font-mono font-bold text-gold-500">
                           {item.type === 'INCOME' ? `+${(Number(item.amount) || 0).toLocaleString()}` : ''}
                        </td>
                        <td className="py-4 px-6 text-right font-mono font-bold text-red-500">
                           {item.type === 'EXPENSE' ? `-${(Number(item.amount) || 0).toLocaleString()}` : ''}
                        </td>
                     </tr>
                   ))
                 )}
              </tbody>
           </table>
        </div>
      </div>

      {/* Expense Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-300">
              <div className="p-6 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
                 <h2 className="text-white font-serif text-xl">Log Business Expense</h2>
                 <button onClick={() => setIsModalOpen(false)}><X className="text-slate-500" /></button>
              </div>
              
              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                 <div>
                    <label className="text-xs text-slate-500 font-black uppercase tracking-widest block mb-2">Category</label>
                    <div className="grid grid-cols-2 gap-2">
                       {[
                         { id: 'inventory', label: 'Stock', icon: <ShoppingBag size={14}/> },
                         { id: 'salary', label: 'Salaries', icon: <Users size={14}/> },
                         { id: 'utilities', label: 'Utility', icon: <Zap size={14}/> },
                         { id: 'rent', label: 'Rent', icon: <Home size={14}/> },
                         { id: 'marketing', label: 'Marketing', icon: <TrendingUp size={14}/> },
                         { id: 'other', label: 'Other', icon: <Plus size={14}/> }
                       ].map(cat => (
                         <button
                           key={cat.id}
                           type="button"
                           onClick={() => setFormData({...formData, category: cat.id as any})}
                           className={`p-3 rounded-xl border text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 transition-all
                             ${formData.category === cat.id ? 'bg-gold-500 text-black border-gold-500' : 'bg-slate-950 text-slate-500 border-slate-800'}
                           `}
                         >
                           {cat.icon} {cat.label}
                         </button>
                       ))}
                    </div>
                 </div>

                 <div>
                    <label className="text-xs text-slate-500 font-black uppercase tracking-widest block mb-2">Amount (PKR)</label>
                    <input 
                      required
                      type="number"
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 px-6 text-white text-2xl font-mono outline-none focus:border-gold-500"
                      value={formData.amount}
                      onChange={e => setFormData({...formData, amount: Number(e.target.value)})}
                    />
                 </div>

                 <div>
                    <label className="text-xs text-slate-500 font-black uppercase tracking-widest block mb-2">Description</label>
                    <textarea 
                      required
                      placeholder="e.g. Bought 20kg Chicken from mandi"
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 px-6 text-white text-sm outline-none focus:border-gold-500 h-24 resize-none"
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                    />
                 </div>

                 <button 
                   disabled={isSaving}
                   className="w-full py-5 bg-gold-500 hover:bg-gold-400 text-black rounded-2xl font-black uppercase tracking-[0.2em] text-sm shadow-xl flex items-center justify-center gap-3"
                 >
                   {isSaving ? <Loader2 className="animate-spin"/> : <CheckCircle2 size={18}/>}
                   Finalize Entry
                 </button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

const KPICard: React.FC<{title: string, value: number, color: string, icon: React.ReactNode, subText?: string}> = ({title, value, color, icon, subText}) => (
  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between h-32 relative overflow-hidden">
     <div className="absolute top-0 right-0 p-4 opacity-5 scale-150">{icon}</div>
     <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{title}</div>
     <div>
        <div className={`text-2xl font-serif font-bold ${color}`}>
           <span className="text-sm opacity-50 mr-1">Rs.</span>
           {(Number(value) || 0).toLocaleString()}
        </div>
        {subText && <div className="text-[10px] text-slate-600 font-bold uppercase mt-1">{subText}</div>}
     </div>
  </div>
);
