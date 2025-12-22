
import React, { useState } from 'react';
import { useAppContext } from '../App';
import { Search, ToggleLeft, ToggleRight, DollarSign, Save, Edit2, AlertCircle, Database, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { menuItems, toggleItemAvailability, updateItemPrice, currentUser, seedDatabase, connectionStatus } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [tempPrice, setTempPrice] = useState<string>('');
  const [isSeeding, setIsSeeding] = useState(false);

  if (currentUser?.role !== 'MANAGER') {
    return (
      <div className="flex h-full w-full items-center justify-center flex-col gap-4 text-slate-500">
        <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center">
           <AlertCircle size={32} />
        </div>
        <div className="text-center">
          <h2 className="text-white text-lg font-serif">Access Denied</h2>
          <p className="text-xs uppercase tracking-widest">Manager privileges required</p>
        </div>
      </div>
    );
  }

  const filteredItems = menuItems.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (item.nameUrdu && item.nameUrdu.includes(searchQuery))
  );

  const startEditing = (id: string, currentPrice: number) => {
    setEditingPriceId(id);
    setTempPrice(currentPrice.toString());
  };

  const savePrice = (id: string) => {
    const newPrice = parseInt(tempPrice);
    if (!isNaN(newPrice) && newPrice > 0) {
      updateItemPrice(id, newPrice);
    }
    setEditingPriceId(null);
  };

  const handleSeed = async () => {
     if(window.confirm("WARNING: This will overwrite or reset your database with default data. Continue?")) {
        setIsSeeding(true);
        await seedDatabase();
        setIsSeeding(false);
     }
  };

  return (
    <div className="flex h-full w-full bg-slate-950 flex-col overflow-hidden">
       {/* Header */}
       <div className="p-8 border-b border-slate-800 bg-slate-900/50">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-gold-500 text-xs font-bold uppercase tracking-[0.2em] mb-1">Back of House</h2>
              <h1 className="text-3xl font-serif text-white">System & Inventory</h1>
            </div>
            
            {/* DB Tools */}
            <div className="flex gap-4">
              <div className={`px-4 py-2 rounded-lg border flex items-center gap-2 text-xs font-bold uppercase tracking-widest
                 ${connectionStatus === 'connected' ? 'bg-green-900/20 border-green-500/50 text-green-400' : 'bg-red-900/20 border-red-500/50 text-red-400'}
              `}>
                 {connectionStatus === 'connected' ? <CheckCircle2 size={16}/> : <XCircle size={16}/>}
                 {connectionStatus === 'connected' ? 'DB Connected' : 'DB Error'}
              </div>
              
              <button 
                onClick={handleSeed}
                disabled={isSeeding}
                className="bg-red-900/20 border border-red-500/50 text-red-500 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-red-900/40 flex items-center gap-2 transition-all"
              >
                {isSeeding ? <RefreshCw className="animate-spin" size={16}/> : <Database size={16}/>}
                Reseed Database
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl max-w-2xl">
             <Search className="text-slate-500" />
             <input 
               type="text" 
               placeholder="Search Menu Items..." 
               className="bg-transparent border-none outline-none text-white w-full font-medium"
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
             />
          </div>
       </div>

       {/* Menu Grid */}
       <div className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
             {filteredItems.map(item => (
               <div key={item.id} className={`bg-slate-900 border rounded-xl p-5 flex flex-col justify-between transition-all ${item.available ? 'border-slate-800' : 'border-red-900/50 opacity-70 bg-red-900/5'}`}>
                  
                  <div className="flex justify-between items-start mb-4">
                     <div>
                       <div className="font-bold text-white text-lg leading-tight mb-1">{item.name}</div>
                       <div className="text-xs text-slate-500 font-serif">{item.nameUrdu}</div>
                     </div>
                     <button 
                       onClick={() => toggleItemAvailability(item.id)}
                       className={`transition-colors ${item.available ? 'text-green-500 hover:text-green-400' : 'text-slate-600 hover:text-slate-400'}`}
                     >
                       {item.available ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                     </button>
                  </div>

                  <div className="flex justify-between items-end">
                     <div>
                       <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Category</div>
                       <div className="text-xs font-bold text-slate-300 uppercase px-2 py-1 bg-slate-800 rounded w-fit">{item.category}</div>
                     </div>

                     <div>
                        <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 text-right">Price</div>
                        {editingPriceId === item.id ? (
                          <div className="flex items-center gap-2">
                             <div className="relative w-24">
                               <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs">Rs.</span>
                               <input 
                                 type="number" 
                                 className="w-full bg-black border border-gold-500 rounded py-1 pl-8 pr-2 text-white font-mono font-bold text-sm outline-none"
                                 value={tempPrice}
                                 onChange={(e) => setTempPrice(e.target.value)}
                                 autoFocus
                               />
                             </div>
                             <button onClick={() => savePrice(item.id)} className="bg-green-600 text-white p-1 rounded hover:bg-green-500"><Save size={16} /></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 justify-end group cursor-pointer" onClick={() => startEditing(item.id, item.price)}>
                             <span className="text-xl font-mono font-bold text-gold-500">Rs. {item.price.toLocaleString()}</span>
                             <Edit2 size={12} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )}
                     </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-800/50 flex justify-between items-center">
                     <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 ${item.available ? 'text-green-500' : 'text-red-500'}`}>
                        <div className={`w-2 h-2 rounded-full ${item.available ? 'bg-green-500' : 'bg-red-500'}`} />
                        {item.available ? 'In Stock' : 'Out of Stock (86)'}
                     </span>
                  </div>

               </div>
             ))}
          </div>
       </div>
    </div>
  );
};
