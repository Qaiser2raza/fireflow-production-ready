
import React, { useState } from 'react';
import { useAppContext } from '../App';
import { MenuItem } from '../types';
import { Search, Plus, Trash2, Edit2, X, Image as ImageIcon, Save, AlertCircle, Loader2 } from 'lucide-react';

export const MenuView: React.FC = () => {
  const { menuItems, addMenuItem, updateMenuItem, deleteMenuItem, currentUser } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<MenuItem>>({
    name: '',
    nameUrdu: '',
    price: 0,
    category: 'mains',
    station: 'hot',
    image: '',
    pricingStrategy: 'unit',
    available: true
  });

  if (currentUser?.role !== 'MANAGER') {
    return <div className="h-full flex items-center justify-center text-slate-500 uppercase tracking-widest">Access Denied</div>;
  }

  const filteredItems = menuItems.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (item.nameUrdu && item.nameUrdu.includes(searchQuery))
  );

  const handleEdit = (item: MenuItem) => {
    setEditingItem(item);
    setFormData(item);
    setError(null);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      nameUrdu: '',
      price: 0,
      category: 'mains',
      station: 'hot',
      image: '',
      pricingStrategy: 'unit',
      available: true
    });
    setError(null);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      deleteMenuItem(id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.price) return;

    setIsSaving(true);
    setError(null);

    let result;
    if (editingItem) {
      result = await updateMenuItem({ ...editingItem, ...formData } as MenuItem);
    } else {
      // Create a unique, non-null ID that fits common database constraints
      const newItem: MenuItem = {
        id: `M-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        name: formData.name || '',
        nameUrdu: formData.nameUrdu,
        price: formData.price || 0,
        category: formData.category as any,
        station: formData.station as any,
        image: formData.image || '',
        pricingStrategy: formData.pricingStrategy as any,
        available: true
      };
      result = await addMenuItem(newItem);
    }

    if (result.success) {
      setIsModalOpen(false);
      setIsSaving(false);
    } else {
      setError(result.error || 'Check server logs for constraint details');
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-slate-950 flex-col overflow-hidden">
       {/* Header */}
       <div className="p-8 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
          <div>
            <h2 className="text-gold-500 text-xs font-bold uppercase tracking-[0.2em] mb-1">Product Management</h2>
            <h1 className="text-3xl font-serif text-white">Menu</h1>
          </div>
          
          <button 
            onClick={handleCreate}
            className="px-6 py-3 bg-gold-500 hover:bg-gold-400 text-black font-bold uppercase tracking-widest rounded shadow-lg shadow-gold-500/20 flex items-center gap-2"
          >
             <Plus size={18} /> Add Item
          </button>
       </div>

       {/* Toolbar */}
       <div className="p-6 border-b border-slate-800 bg-slate-900/30">
          <div className="flex items-center gap-4 bg-slate-900 border border-slate-800 p-3 rounded-xl max-w-md">
             <Search className="text-slate-500" size={20} />
             <input 
               type="text" 
               placeholder="Search Items..." 
               className="bg-transparent border-none outline-none text-white w-full font-medium"
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
             />
          </div>
       </div>

       {/* Grid */}
       <div className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
             {filteredItems.map(item => (
               <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col group hover:border-gold-500/50 transition-colors">
                  <div className="relative h-40 w-full bg-slate-950 rounded-lg overflow-hidden mb-4 border border-slate-800">
                    {item.image ? (
                      <img src={item.image} className="w-full h-full object-cover opacity-80" alt={item.name} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-700">
                        <ImageIcon size={48} />
                      </div>
                    )}
                    <div className="absolute top-2 right-2 flex gap-1">
                      <div className="bg-black/60 backdrop-blur px-2 py-1 rounded text-[10px] text-white font-bold uppercase tracking-wider">
                        {item.category}
                      </div>
                      <div className="bg-gold-500/90 backdrop-blur px-2 py-1 rounded text-[10px] text-black font-bold uppercase tracking-wider">
                        {item.station}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-white font-bold text-lg">{item.name}</h3>
                      <p className="text-slate-500 font-serif text-xs">{item.nameUrdu}</p>
                    </div>
                    <div className="text-gold-500 font-mono font-bold">Rs.{item.price}</div>
                  </div>

                  <div className="mt-auto pt-4 flex gap-2">
                     <button onClick={() => handleEdit(item)} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 text-xs font-bold uppercase flex items-center justify-center gap-2">
                       <Edit2 size={14} /> Edit
                     </button>
                     <button onClick={() => handleDelete(item.id)} className="w-10 flex items-center justify-center bg-red-900/20 hover:bg-red-900/50 text-red-500 rounded">
                       <Trash2 size={14} />
                     </button>
                  </div>
               </div>
             ))}
             {filteredItems.length === 0 && (
               <div className="col-span-full py-20 text-center text-slate-600 uppercase tracking-widest text-xs italic">
                 No items found in your menu. Click "Add Item" to start.
               </div>
             )}
          </div>
       </div>

       {/* Edit Modal */}
       {isModalOpen && (
         <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col animate-in zoom-in duration-200">
               <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                  <h2 className="text-white font-serif text-xl">{editingItem ? 'Edit Item' : 'New Item'}</h2>
                  <button onClick={() => setIsModalOpen(false)}><X className="text-slate-500 hover:text-white" /></button>
               </div>
               
               <form onSubmit={handleSubmit} className="p-6 space-y-4">
                  {error && (
                    <div className="bg-red-900/20 border border-red-500/30 p-4 rounded-lg flex items-start gap-3 text-red-400 text-xs animate-in slide-in-from-top-2">
                       <AlertCircle size={18} className="shrink-0" />
                       <div>
                         <p className="font-bold mb-1 uppercase tracking-wider">Database Error</p>
                         <p>{error}</p>
                       </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 block">Name (English)</label>
                      <input 
                        className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-white focus:border-gold-500 outline-none" 
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        required
                        disabled={isSaving}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 block">Name (Urdu)</label>
                      <input 
                        className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-white focus:border-gold-500 outline-none font-serif text-lg" 
                        value={formData.nameUrdu}
                        onChange={e => setFormData({...formData, nameUrdu: e.target.value})}
                        disabled={isSaving}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 block">Price</label>
                      <input 
                        type="number"
                        className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-white focus:border-gold-500 outline-none" 
                        value={formData.price}
                        onChange={e => setFormData({...formData, price: parseInt(e.target.value) || 0})}
                        required
                        disabled={isSaving}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 block">Category</label>
                      <select 
                        className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-white focus:border-gold-500 outline-none uppercase text-xs font-bold"
                        value={formData.category}
                        onChange={e => setFormData({...formData, category: e.target.value as any})}
                        disabled={isSaving}
                      >
                        <option value="mains">Mains</option>
                        <option value="starters">Starters</option>
                        <option value="beverages">Beverages</option>
                        <option value="desserts">Desserts</option>
                      </select>
                    </div>
                  </div>

                  <div>
                     <label className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 block">Kitchen Station</label>
                     <select 
                        className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-white focus:border-gold-500 outline-none uppercase text-xs font-bold"
                        value={formData.station}
                        onChange={e => setFormData({...formData, station: e.target.value as any})}
                        disabled={isSaving}
                      >
                        <option value="hot">Hot Kitchen (Curry/Grill)</option>
                        <option value="tandoor">Tandoor (Bread)</option>
                        <option value="cold">Cold Station (Salad/Apps)</option>
                        <option value="bar">Bar (Drinks)</option>
                        <option value="dessert">Pastry</option>
                      </select>
                  </div>

                  <div>
                      <label className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 block">Pricing Strategy</label>
                      <div className="flex bg-slate-950 p-1 rounded border border-slate-700">
                        <button 
                          type="button"
                          disabled={isSaving}
                          onClick={() => setFormData({...formData, pricingStrategy: 'unit'})}
                          className={`flex-1 py-2 rounded text-xs font-bold uppercase transition-all ${formData.pricingStrategy === 'unit' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-400'}`}
                        >
                          Per Unit (Standard)
                        </button>
                        <button 
                          type="button"
                          disabled={isSaving}
                          onClick={() => setFormData({...formData, pricingStrategy: 'fixed_per_head'})}
                          className={`flex-1 py-2 rounded text-xs font-bold uppercase transition-all ${formData.pricingStrategy === 'fixed_per_head' ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-400'}`}
                        >
                          Fixed Per Head
                        </button>
                      </div>
                  </div>

                  <div>
                      <label className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 block">Image URL</label>
                      <input 
                        className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-white focus:border-gold-500 outline-none text-xs text-slate-400 font-mono" 
                        value={formData.image}
                        onChange={e => setFormData({...formData, image: e.target.value})}
                        placeholder="https://..."
                        disabled={isSaving}
                      />
                  </div>

                  <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                     <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 rounded text-slate-400 hover:text-white font-bold uppercase tracking-widest text-xs disabled:opacity-50" disabled={isSaving}>Cancel</button>
                     <button type="submit" disabled={isSaving} className="px-6 py-3 bg-gold-500 hover:bg-gold-400 text-black rounded font-bold uppercase tracking-widest text-xs flex items-center gap-2 shadow-lg shadow-gold-500/20 disabled:opacity-50">
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {isSaving ? 'Saving...' : 'Save Item'}
                     </button>
                  </div>
               </form>
            </div>
         </div>
       )}
    </div>
  );
};
