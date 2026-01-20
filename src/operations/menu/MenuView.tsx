import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../client/App';
import { MenuItem, MenuCategory } from '../../shared/types';
import {
  Utensils, Plus, Edit2, Trash2, Search,
  Image as ImageIcon, Layers, Flame, TicketX,
  TrendingUp, BarChart2, Package, LayoutGrid,
  ChevronRight, Save, X, ToggleLeft, ToggleRight,
  Calculator, Receipt, Info
} from 'lucide-react';
import { Card } from '../../shared/ui/Card';
import { Button } from '../../shared/ui/Button';
import { Badge } from '../../shared/ui/Badge';
import { Modal } from '../../shared/ui/Modal';
import { Input } from '../../shared/ui/Input';

type HubView = 'CATALOG' | 'CATEGORIES' | 'STOCK' | 'MARGINS';

export const MenuView: React.FC = () => {
  const {
    menuItems,
    menuCategories,
    currentUser,
    fetchInitialData,
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,
    toggleItemAvailability,
    addMenuCategory,
    updateMenuCategory,
    deleteMenuCategory
  } = useAppContext();

  // Hub State
  const [activeHubView, setActiveHubView] = useState<HubView>('CATALOG');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('ALL');

  const [formData, setFormData] = useState({
    name: '',
    name_urdu: '',
    description: '',
    price: '',
    cost_price: '',
    category_id: '',
    image_url: '',
    is_available: true,
    station: 'KITCHEN',
    track_stock: false,
    daily_stock: '0',
  });

  const [catFormData, setCatFormData] = useState({
    name: '',
    name_urdu: '',
    priority: '0'
  });

  // Derived State
  const filteredItems = useMemo(() => {
    let items = menuItems;
    if (activeCategoryFilter !== 'ALL') {
      items = items.filter(i => i.category_id === activeCategoryFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.name_urdu?.includes(q)
      );
    }
    return items;
  }, [menuItems, activeCategoryFilter, searchQuery]);

  // Actions
  const handleOpenItemModal = (item?: MenuItem) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        name_urdu: item.name_urdu || '',
        description: item.description || '',
        price: item.price.toString(),
        cost_price: (item.cost_price || 0).toString(),
        category_id: item.category_id || '',
        image_url: item.image_url || '',
        is_available: item.is_available ?? true,
        station: item.station || 'KITCHEN',
        track_stock: item.track_stock || false,
        daily_stock: (item.daily_stock || 0).toString()
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        name_urdu: '',
        description: '',
        price: '',
        cost_price: '0',
        category_id: menuCategories[0]?.id || '',
        image_url: '',
        is_available: true,
        station: 'KITCHEN',
        track_stock: false,
        daily_stock: '0'
      });
    }
    setIsModalOpen(true);
  };

  const handleOpenCatModal = (cat?: MenuCategory) => {
    if (cat) {
      setEditingCategory(cat);
      setCatFormData({
        name: cat.name,
        name_urdu: cat.name_urdu || '',
        priority: cat.priority.toString()
      });
    } else {
      setEditingCategory(null);
      setCatFormData({
        name: '',
        name_urdu: '',
        priority: '0'
      });
    }
    setIsCatModalOpen(true);
  };

  const onItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      price: parseFloat(formData.price),
      cost_price: parseFloat(formData.cost_price),
      daily_stock: parseInt(formData.daily_stock) || 0,
      id: editingItem?.id
    };

    if (editingItem) {
      await updateMenuItem(payload);
    } else {
      await addMenuItem(payload);
    }
    setIsModalOpen(false);
  };

  const onCatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...catFormData,
      priority: parseInt(catFormData.priority) || 0,
      id: editingCategory?.id
    };

    if (editingCategory) {
      await updateMenuCategory(payload);
    } else {
      await addMenuCategory(payload);
    }
    setIsCatModalOpen(false);
  };

  return (
    <div className="h-full flex flex-col bg-[#020617] overflow-hidden">

      {/* HUB NAVIGATION */}
      <div className="glass-panel p-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 pr-6 border-r border-slate-800">
            <div className="size-10 flex items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <LayoutGrid size={24} />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter uppercase text-white leading-none">Menu Hub</h1>
              <p className="text-[10px] uppercase tracking-widest text-blue-500 font-bold mt-1">Mission Control</p>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            {[
              { id: 'CATALOG', label: 'Catalog', icon: Package },
              { id: 'CATEGORIES', label: 'Categories', icon: Layers },
              { id: 'STOCK', label: 'Stock', icon: TrendingUp },
              { id: 'MARGINS', label: 'Margins', icon: BarChart2 }
            ].map(view => (
              <button
                key={view.id}
                onClick={() => setActiveHubView(view.id as HubView)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${activeHubView === view.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 neon-glow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
              >
                <view.icon size={14} />
                {view.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {activeHubView === 'CATEGORIES' ? (
            <Button onClick={() => handleOpenCatModal()} icon={<Plus size={18} />} className="neon-glow bg-blue-600 border-0">New Category</Button>
          ) : (
            <Button onClick={() => handleOpenItemModal()} icon={<Plus size={18} />} className="neon-glow bg-blue-600 border-0 text-xs py-2.5">Add Item</Button>
          )}
        </div>
      </div>

      {/* SEARCH / FILTER BAR */}
      {activeHubView !== 'CATEGORIES' && (
        <div className="px-6 py-4 bg-slate-900/30 flex items-center justify-between border-b border-slate-800/50">
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar no-scrollbar">
            <button
              onClick={() => setActiveCategoryFilter('ALL')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap ${activeCategoryFilter === 'ALL'
                ? 'bg-blue-500 border-blue-500 text-white'
                : 'border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
            >
              ALL UNITS
            </button>
            {menuCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryFilter(cat.id)}
                className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all whitespace-nowrap ${activeCategoryFilter === cat.id
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'border-slate-800 text-slate-500 hover:text-slate-300'
                  }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={14} />
            <input
              type="text"
              placeholder="INTERCEPT SEARCH..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950/50 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-[10px] font-black tracking-widest text-white focus:border-blue-500 outline-none transition-all placeholder:text-slate-700"
            />
          </div>
        </div>
      )}

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {activeHubView === 'CATALOG' && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {filteredItems.map(item => (
              <MenuCard key={item.id} item={item} onEdit={handleOpenItemModal} onToggle={toggleItemAvailability} />
            ))}
          </div>
        )}

        {activeHubView === 'CATEGORIES' && (
          <div className="max-w-4xl mx-auto space-y-3">
            {menuCategories.length === 0 && (
              <div className="text-center py-20 opacity-20">
                <Layers size={64} className="mx-auto mb-4" />
                <p className="text-xl font-black uppercase tracking-widest">No Categories Defined</p>
              </div>
            )}
            {menuCategories.map(cat => (
              <div key={cat.id} className="glass-panel p-4 rounded-xl flex items-center justify-between group">
                <div className="flex items-center gap-4">
                  <div className="size-10 flex items-center justify-center bg-slate-950 border border-slate-800 rounded font-black text-blue-500 text-xs">
                    {cat.priority}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">{cat.name}</h3>
                    <span className="font-urdu text-lg font-bold text-slate-500 block leading-tight">{cat.name_urdu}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleOpenCatModal(cat)} className="p-2 hover:bg-blue-600/10 text-blue-400 rounded-lg"><Edit2 size={16} /></button>
                  <button onClick={() => deleteMenuCategory(cat.id)} className="p-2 hover:bg-red-600/10 text-red-400 rounded-lg"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeHubView === 'STOCK' && (
          <div className="max-w-4xl mx-auto glass-panel rounded-2xl overflow-hidden border border-slate-800">
            <table className="w-full text-left">
              <thead className="bg-slate-950/50">
                <tr className="border-b border-slate-800">
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Item Name</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Tracked</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Daily Limit</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {menuItems.map(item => (
                  <tr key={item.id} className="hover:bg-slate-800/20 transition-all">
                    <td className="px-6 py-4">
                      <div className="text-xs font-bold text-white">{item.name}</div>
                      <div className="text-[10px] text-slate-500 uppercase">{item.category_rel?.name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={item.track_stock ? 'success' : 'info'} className="text-[9px]">
                        {item.track_stock ? 'INTEGRATED' : 'DISABLED'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-blue-400">
                      {item.track_stock ? item.daily_stock : '∞'}
                    </td>
                    <td className="px-6 py-4">
                      <button onClick={() => handleOpenItemModal(item)} className="text-blue-500 hover:text-blue-400 font-bold text-[10px] uppercase tracking-widest">Adjust</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeHubView === 'MARGINS' && (
          <div className="max-w-4xl mx-auto glass-panel rounded-2xl overflow-hidden border border-slate-800">
            <table className="w-full text-left">
              <thead className="bg-slate-950/50">
                <tr className="border-b border-slate-800">
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Product</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Cost</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Price</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {menuItems.map(item => {
                  const cost = item.costPrice || item.cost_price || 0;
                  const price = item.price;
                  const margin = price - cost;
                  const marginPercent = price > 0 ? (margin / price) * 100 : 0;
                  return (
                    <tr key={item.id} className="hover:bg-slate-800/20 transition-all">
                      <td className="px-6 py-4">
                        <div className="text-xs font-bold text-white">{item.name}</div>
                        <div className="text-[10px] text-slate-500 uppercase">{item.category_rel?.name}</div>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-xs text-slate-400">Rs. {cost}</td>
                      <td className="px-6 py-4 text-right font-mono text-xs text-white">Rs. {price}</td>
                      <td className="px-6 py-4 text-right">
                        <div className={`text-xs font-black ${margin > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          Rs. {margin.toFixed(0)}
                        </div>
                        <div className="text-[9px] text-slate-500">{marginPercent.toFixed(1)}% Profit</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ITEM MODAL */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? "RECONFIGURE UNIT" : "INITIATE NEW UNIT"}>
        <form onSubmit={onItemSubmit} className="space-y-4 p-2">
          <div className="grid grid-cols-2 gap-4">
            <Input label="UNIT NAME (EN)" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="bg-slate-950/50 border-slate-800 font-bold" />
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block text-right">یونٹ کا نام (URDU)</label>
              <Input value={formData.name_urdu} onChange={e => setFormData({ ...formData, name_urdu: e.target.value })} className="bg-slate-950/50 border-slate-800 font-urdu text-right text-lg font-bold" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Deployment Category</label>
              <select
                className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-xs font-bold uppercase tracking-widest text-white outline-none focus:border-blue-500"
                value={formData.category_id}
                onChange={e => setFormData({ ...formData, category_id: e.target.value })}
              >
                {menuCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Operational Station</label>
              <select
                className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-xs font-bold uppercase tracking-widest text-white outline-none focus:border-blue-500"
                value={formData.station}
                onChange={e => setFormData({ ...formData, station: e.target.value })}
              >
                <option value="KITCHEN">🔥 Kitchen</option>
                <option value="BBQ">🍖 BBQ / Tandoor</option>
                <option value="BAR">🍹 Bar / Beverages</option>
                <option value="NO_PRINT">📦 Pre-Made</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 p-4 glass-panel rounded-xl">
            <Input type="number" label="BASE COST (PKR)" value={formData.cost_price} onChange={e => setFormData({ ...formData, cost_price: e.target.value })} className="bg-slate-950/50 border-slate-800 font-mono" />
            <Input type="number" label="TARGET PRICE (PKR)" value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} className="bg-slate-950/50 border-slate-800 font-mono text-blue-400" />
          </div>

          <div className="p-4 bg-blue-500/5 rounded-xl border border-blue-500/10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package size={16} className="text-blue-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white">Inventory Tracking</span>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, track_stock: !formData.track_stock })}
                className={`p-1 rounded-full transition-colors ${formData.track_stock ? 'text-blue-500' : 'text-slate-600'}`}
              >
                {formData.track_stock ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>
            {formData.track_stock && (
              <div className="grid grid-cols-1 gap-2">
                <Input
                  type="number"
                  label="DAILY UNIT DISPATCH LIMIT"
                  value={formData.daily_stock}
                  onChange={e => setFormData({ ...formData, daily_stock: e.target.value })}
                  className="bg-slate-950 border-slate-800"
                />
                <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Auto-resets at midnight server time.</p>
              </div>
            )}
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Abort</Button>
            <Button type="submit" className="bg-blue-600 border-0 neon-glow h-12 flex-1">DEPLOY UNIT</Button>
          </div>
        </form>
      </Modal>

      {/* CATEGORY MODAL */}
      <Modal isOpen={isCatModalOpen} onClose={() => setIsCatModalOpen(false)} title={editingCategory ? "REMAP CATEGORY" : "DEFINE CATEGORY"}>
        <form onSubmit={onCatSubmit} className="space-y-4 p-2">
          <Input label="CATEGORY NAME (EN)" value={catFormData.name} onChange={e => setCatFormData({ ...catFormData, name: e.target.value })} className="bg-slate-950 border-slate-800 font-bold" />
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block text-right">رپورٹنگ نام (URDU)</label>
            <Input value={catFormData.name_urdu} onChange={e => setCatFormData({ ...catFormData, name_urdu: e.target.value })} className="bg-slate-950 border-slate-800 font-urdu text-right text-lg font-bold" />
          </div>
          <Input type="number" label="HIERARCHY PRIORITY" value={catFormData.priority} onChange={e => setCatFormData({ ...catFormData, priority: e.target.value })} className="bg-slate-950 border-slate-800" />

          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setIsCatModalOpen(false)}>Abort</Button>
            <Button type="submit" className="bg-blue-600 border-0 shadow-lg h-12 flex-1 font-black tracking-widest">SAVE CONFIG</Button>
          </div>
        </form>
      </Modal>

    </div>
  );
};

// Sub-component for Card
const MenuCard = ({ item, onEdit, onToggle }: any) => {
  const isAvailable = item.is_available ?? item.available ?? true;

  return (
    <div className={`relative glass-panel rounded-2xl overflow-hidden group transition-all duration-300 hover:scale-[1.02] hover:border-blue-500/50 ${!isAvailable ? 'opacity-50 grayscale' : ''}`}>
      <div className="h-32 w-full bg-slate-950 relative">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-800">
            <Utensils size={40} />
          </div>
        )}
        <div className="absolute top-2 right-2 bg-slate-950/80 backdrop-blur-md px-2 py-1 rounded-lg border border-slate-800">
          <span className="text-white font-black font-mono text-xs">Rs. {item.price}</span>
        </div>

        <div className="absolute top-2 left-2 flex flex-col gap-1">
          <span className="neon-tag">{item.category_rel?.name || 'GENERIC'}</span>
          {item.station !== 'KITCHEN' && <span className="neon-tag border-amber-500/40 text-amber-500 bg-amber-500/5">{item.station}</span>}
        </div>

        {item.track_stock && (
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-red-600/20 border border-red-500/30 text-[9px] font-black text-red-500 uppercase tracking-widest">
            {item.daily_stock} LEFT
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h3 className="text-white font-black text-[11px] leading-tight uppercase tracking-tight mb-0.5">{item.name}</h3>
            {item.name_urdu && <span className="font-urdu text-sm text-blue-400 block" dir="rtl">{item.name_urdu}</span>}
          </div>
          <button
            onClick={() => onToggle(item.id)}
            className={`p-1 rounded-lg transition-all ${isAvailable ? 'text-blue-500 hover:bg-blue-500/10' : 'text-slate-600 hover:bg-slate-600/10'}`}
          >
            {isAvailable ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
          </button>
        </div>
      </div>

      <div className="absolute inset-x-3 bottom-14 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
        <button
          onClick={() => onEdit(item)}
          className="w-full bg-slate-800/90 backdrop-blur-md border border-slate-700 hover:bg-slate-700 text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
        >
          <Edit2 size={12} /> Unit Analysis
        </button>
      </div>
    </div>
  );
};