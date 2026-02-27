import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../client/App';
import { MenuItem, MenuCategory } from '../../shared/types';
import {
  Plus, Edit2, Trash2, Search,
  Layers,
  TrendingUp, BarChart2, Package, LayoutGrid,
  ToggleLeft, ToggleRight,
  ChefHat, Activity, Save, X, Network,
  AlertCircle, RefreshCw
} from 'lucide-react';

import { Button } from '../../shared/ui/Button';
import { Input } from '../../shared/ui/Input';
import { Modal } from '../../shared/ui/Modal';
import { Badge } from '../../shared/ui/Badge';

type HubView = 'CATALOG' | 'CATEGORIES' | 'STATIONS' | 'STOCK' | 'MARGINS';

export const MenuView: React.FC = () => {
  const {
    menuItems,
    menuCategories,
    stations,
    addMenuItem,
    updateMenuItem,
    toggleItemAvailability,
    addMenuCategory,
    updateMenuCategory,
    deleteMenuCategory,
    addStation,
    updateStation,
    deleteStation,
    fetchInitialData
  } = useAppContext();

  // Hub State
  const [activeHubView, setActiveHubView] = useState<HubView>('CATALOG');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('ALL');

  // Station Management State
  const [isStationAdding, setIsStationAdding] = useState(false);
  const [newStationName, setNewStationName] = useState('');
  const [editingStationId, setEditingStationId] = useState<string | null>(null);
  const [editingStationName, setEditingStationName] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    name_urdu: '',
    description: '',
    price: '',
    cost_price: '',
    category_id: '',
    image_url: '',
    is_available: true,
    station: '',
    station_id: '',
    requires_prep: true,
    track_stock: false,
    daily_stock: '0',
  });

  const [catFormData, setCatFormData] = useState({
    name: '',
    name_urdu: '',
    priority: '0'
  });

  // Derived State - ROBUST FILTERING
  const filteredItems = useMemo(() => {
    let items = Array.isArray(menuItems) ? menuItems : [];

    // 1. Category Filter
    if (activeCategoryFilter !== 'ALL') {
      items = items.filter(i =>
        i.category_id === activeCategoryFilter ||
        i.category === activeCategoryFilter // Fallback for seeds
      );
    }

    // 2. Search Query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i =>
        (i.name || '').toLowerCase().includes(q) ||
        (i.name_urdu || '').includes(q)
      );
    }

    return items;
  }, [menuItems, activeCategoryFilter, searchQuery]);

  // --- ACTIONS ---

  // Item Actions
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
        station: item.station || '',
        station_id: item.station_id || '',
        requires_prep: item.requires_prep ?? true,
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
        station: '',
        station_id: stations[0]?.id || '',
        requires_prep: true,
        track_stock: false,
        daily_stock: '0'
      });
    }
    setIsModalOpen(true);
  };

  const onItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      price: parseFloat(formData.price),
      cost_price: parseFloat(formData.cost_price),
      daily_stock: parseInt(formData.daily_stock) || 0,
      station: stations.find(s => s.id === formData.station_id)?.name || formData.station || 'KITCHEN',
      id: editingItem?.id
    };

    if (editingItem) {
      await updateMenuItem(payload);
    } else {
      await addMenuItem(payload);
    }
    setIsModalOpen(false);
  };

  // Category Actions
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

  // Station Actions
  const handleAddStation = async () => {
    if (!newStationName) return;
    await addStation({
      name: newStationName.toUpperCase(),
      is_active: true
    });
    setIsStationAdding(false);
    setNewStationName('');
  };

  const handleUpdateStation = async () => {
    if (editingStationId && editingStationName) {
      await updateStation({
        id: editingStationId,
        name: editingStationName.toUpperCase()
      });
      setEditingStationId(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#020617] overflow-hidden">

      {/* STUNNING CONSOLIDATED HEADER */}
      <div className="glass-panel border-b border-slate-800/60 bg-slate-900/40 backdrop-blur-3xl shrink-0 z-30 shadow-2xl">
        {/* Row 1: Brand & View Selectors */}
        <div className="px-6 py-4 flex items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 group">
              <div className="size-11 flex items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-xl shadow-blue-900/40 text-white ring-1 ring-white/20 group-hover:scale-105 transition-transform">
                <LayoutGrid size={22} className="group-hover:rotate-12 transition-transform" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-black tracking-tighter uppercase text-white leading-none">Menu Hub</h1>
                <p className="text-[10px] uppercase tracking-[0.2em] text-blue-400 font-bold mt-1 opacity-70">Mission Control</p>
              </div>
            </div>

            <nav className="flex items-center p-1 bg-black/40 rounded-xl border border-white/5 space-x-0.5">
              {[
                { id: 'CATALOG', label: 'Catalog', icon: Package },
                { id: 'CATEGORIES', label: 'Groups', icon: Layers },
                { id: 'STATIONS', label: 'Stations', icon: Network },
                { id: 'STOCK', label: 'Stock', icon: TrendingUp },
                { id: 'MARGINS', label: 'Margins', icon: BarChart2 }
              ].map(view => (
                <button
                  key={view.id}
                  onClick={() => setActiveHubView(view.id as HubView)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeHubView === view.id
                    ? 'bg-slate-800 text-white shadow-lg ring-1 ring-white/10 translate-y-[-1px]'
                    : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
                    }`}
                >
                  <view.icon size={14} className={activeHubView === view.id ? 'text-blue-400' : ''} />
                  <span className="hidden lg:block">{view.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchInitialData()}
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-blue-400 hover:border-blue-500/30 transition-all active:rotate-180 duration-500"
            >
              <RefreshCw size={16} />
            </button>

            {activeHubView === 'CATEGORIES' ? (
              <Button onClick={() => handleOpenCatModal()} icon={<Plus size={16} />} className="bg-blue-600 hover:bg-blue-500 text-[10px] h-10 px-6 font-black tracking-widest uppercase">New Group</Button>
            ) : activeHubView === 'STATIONS' ? (
              <Button onClick={() => setIsStationAdding(true)} icon={<Plus size={16} />} className="bg-blue-600 hover:bg-blue-500 text-[10px] h-10 px-6 font-black tracking-widest uppercase">Add Node</Button>
            ) : (
              <Button onClick={() => handleOpenItemModal()} icon={<Plus size={16} />} className="bg-blue-600 hover:bg-blue-500 text-[10px] h-10 px-6 font-black tracking-widest uppercase">Initialize Unit</Button>
            )}
          </div>
        </div>

        {/* Row 2: Filtering & Searching (Primary aesthetic area) */}
        {activeHubView === 'CATALOG' && (
          <div className="px-6 py-3 bg-slate-950/40 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar no-scrollbar py-1 w-full md:w-auto">
              <button
                onClick={() => setActiveCategoryFilter('ALL')}
                className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all duration-300 whitespace-nowrap ${activeCategoryFilter === 'ALL'
                  ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.2)]'
                  : 'bg-black/20 border-slate-800 text-slate-500 hover:border-slate-600'
                  }`}
              >
                All Entities
              </button>
              <div className="w-[1px] h-4 bg-slate-800 mx-2 hidden sm:block" />
              {menuCategories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategoryFilter(cat.id)}
                  className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all duration-300 whitespace-nowrap ${activeCategoryFilter === cat.id
                    ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.2)]'
                    : 'bg-black/20 border-slate-800 text-slate-500 hover:border-slate-600'
                    }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-80 group shrink-0">
              <div className="absolute inset-0 bg-blue-500/10 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-blue-500 transition-colors" size={14} />
              <input
                type="text"
                placeholder="SEARCH DATABASE..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="relative w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-[10px] font-bold tracking-widest text-white focus:border-blue-500/50 outline-none transition-all placeholder:text-slate-800"
              />
            </div>
          </div>
        )}
      </div>

      {/* VIEW CONTENT AREA */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-[radial-gradient(circle_at_top_right,rgba(30,58,138,0.1),transparent)]">

        {/* CATALOG VIEW - GRID OF CARDS */}
        {activeHubView === 'CATALOG' && (
          <>
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in zoom-in duration-700">
                <div className="size-20 bg-slate-900 rounded-3xl flex items-center justify-center border border-slate-800 mb-6 shadow-2xl">
                  <Package size={40} className="text-slate-700" />
                </div>
                <h2 className="text-xl font-black text-white uppercase tracking-tighter mb-2">No Matching Units</h2>
                <p className="text-slate-500 text-xs font-medium max-w-xs">We couldn't find any products matching your search or group filter.</p>
                <button onClick={() => { setActiveCategoryFilter('ALL'); setSearchQuery(''); }} className="mt-6 text-blue-400 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors">Clear All Filters</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 gap-5">
                {filteredItems.map(item => (
                  <MenuCard key={item.id} item={item} onEdit={handleOpenItemModal} onToggle={toggleItemAvailability} />
                ))}
              </div>
            )}
          </>
        )}

        {/* CATEGORIES VIEW - LIST OF GROUPS */}
        {activeHubView === 'CATEGORIES' && (
          <div className="max-w-4xl mx-auto space-y-4">
            {menuCategories.length === 0 && (
              <div className="text-center py-32 opacity-20">
                <Layers size={80} className="mx-auto mb-6" />
                <p className="text-2xl font-black uppercase tracking-[0.2em]">Zero Groups Defined</p>
              </div>
            )}
            {menuCategories.map(cat => (
              <div key={cat.id} className="glass-panel p-5 rounded-2xl flex items-center justify-between group hover:border-blue-500/40 hover:bg-slate-900/40 transition-all duration-300">
                <div className="flex items-center gap-5">
                  <div className="size-12 flex items-center justify-center bg-slate-950 border border-slate-800 rounded-xl font-black text-blue-500 text-xs shadow-inner">
                    {cat.priority}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">{cat.name}</h3>
                    <span className="font-urdu text-xl font-bold text-slate-500 block leading-tight mt-1">{cat.name_urdu || 'نام دستیاب نہیں'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                  <button onClick={() => handleOpenCatModal(cat)} className="p-2.5 bg-slate-800 hover:bg-blue-600/20 text-blue-400 rounded-xl transition-all"><Edit2 size={16} /></button>
                  <button onClick={() => { if (confirm('Delete Group?')) deleteMenuCategory(cat.id); }} className="p-2.5 bg-slate-800 hover:bg-red-600/20 text-red-500 rounded-xl transition-all"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* STATIONS VIEW - GRID OF ROUTING NODES */}
        {activeHubView === 'STATIONS' && (
          <div className="max-w-6xl mx-auto">
            {isStationAdding && (
              <div className="bg-slate-900/60 border border-blue-500/30 p-8 rounded-3xl mb-8 shadow-2xl animate-in slide-in-from-top-6 duration-500">
                <div className="flex items-center gap-3 mb-6">
                  <div className="size-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                    <Network size={16} />
                  </div>
                  <h4 className="font-black text-xs uppercase tracking-widest text-white">Initialize Communication Node</h4>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 items-end">
                  <div className="flex-1 w-full">
                    <label className="text-[10px] uppercase font-black text-slate-500 mb-2 block tracking-widest">Node Identifier (Label)</label>
                    <input
                      className="w-full bg-black border border-slate-700 rounded-xl px-5 py-3 text-white outline-none focus:border-blue-500 ring-0 focus:ring-4 ring-blue-500/10 transition-all font-bold text-sm"
                      value={newStationName}
                      onChange={e => setNewStationName(e.target.value)}
                      placeholder="e.g. GRILL, BAR, PRE-MADE"
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button onClick={handleAddStation} className="bg-blue-600 hover:bg-blue-500 h-[52px] px-8 font-black uppercase tracking-widest text-[10px]">DEPLOY NODE</Button>
                    <Button onClick={() => setIsStationAdding(false)} className="bg-slate-800 hover:bg-slate-700 h-[52px] px-4 text-slate-400"><X size={20} /></Button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {stations.map(station => (
                <div key={station.id} className={`glass-panel p-6 rounded-3xl border transition-all group relative overflow-hidden ${station.is_active ? 'border-slate-800 hover:border-slate-600' : 'border-red-900/30 opacity-60 grayscale'}`}>
                  <div className="absolute top-0 right-0 p-1">
                    <div className={`size-1.5 rounded-full ${station.is_active ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`} />
                  </div>

                  <div className="flex justify-between items-start mb-8">
                    {editingStationId === station.id ? (
                      <div className="flex flex-col gap-3 w-full">
                        <input
                          className="w-full bg-black/60 border border-blue-500/50 rounded-xl px-4 py-2.5 text-white outline-none focus:border-blue-500 text-sm font-black tracking-tight"
                          value={editingStationName}
                          onChange={e => setEditingStationName(e.target.value)}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button onClick={handleUpdateStation} className="bg-green-600 hover:bg-green-500 text-white text-[9px] font-black uppercase tracking-[0.2em] px-4 py-2 rounded-lg flex items-center gap-2"><Save size={12} /> Commit</button>
                          <button onClick={() => setEditingStationId(null)} className="bg-slate-800 hover:bg-slate-700 text-slate-400 text-[9px] font-black uppercase tracking-[0.2em] px-4 py-2 rounded-lg flex items-center gap-2"><X size={12} /> Abort</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        <span className="font-black text-xl text-white group-hover:text-blue-400 transition-colors uppercase tracking-tighter leading-none">{station.name}</span>
                        <span className={`text-[9px] font-black uppercase tracking-[0.3em] mt-2 ${station.is_active ? 'text-green-500' : 'text-red-500'}`}>
                          {station.is_active ? '● OPERATIONAL' : '○ DEACTIVATED'}
                        </span>
                      </div>
                    )}

                    {!editingStationId && (
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all translate-y-[-10px] group-hover:translate-y-0">
                        <button
                          onClick={() => { setEditingStationId(station.id); setEditingStationName(station.name); }}
                          className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-all shadow-lg"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => updateStation({ ...station, is_active: !station.is_active })}
                          className={`p-2.5 border rounded-xl transition-all shadow-lg ${station.is_active ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-red-500 hover:border-red-500/30' : 'bg-green-600 border-green-500 text-white'}`}
                        >
                          <Activity size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center pt-5 border-t border-slate-800/50">
                    <div className="flex items-center gap-2">
                      <Network size={12} className="text-slate-600" />
                      <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">Routing Infrastructure</span>
                    </div>
                    {!editingStationId && (
                      <button onClick={() => { if (confirm('Permanently Delete Station Node?')) deleteStation(station.id); }} className="text-slate-700 hover:text-red-500 p-2 transition-colors"><Trash2 size={15} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {stations.length === 0 && (
              <div className="flex flex-col items-center justify-center p-24 border-2 border-dashed border-slate-800/50 rounded-[40px] bg-slate-900/10">
                <div className="size-20 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800 mb-6">
                  <Activity size={32} className="text-slate-700" />
                </div>
                <p className="text-slate-400 font-black uppercase tracking-[0.2em] mb-2">No Active Routing Nodes</p>
                <p className="text-slate-600 text-xs font-medium mb-8 max-w-sm text-center">Stations are required to route orders to specific KDS terminals or printers.</p>
                <button onClick={() => setIsStationAdding(true)} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-xl shadow-blue-900/20 transition-all active:scale-95">Initialize Node #1</button>
              </div>
            )}
          </div>
        )}

        {/* STOCK MONITORING VIEW */}
        {activeHubView === 'STOCK' && (
          <div className="max-w-6xl mx-auto glass-panel rounded-[2.5rem] overflow-hidden border border-slate-800/50 shadow-2xl">
            <div className="bg-slate-950/80 px-8 py-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="size-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tighter">Inventory Pulse</h3>
                  <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Real-time depletion monitoring</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="px-5 py-2 rounded-xl bg-black/40 border border-slate-800 text-center">
                  <div className="text-[9px] uppercase font-black text-slate-600">Monitored</div>
                  <div className="text-lg font-black text-white leading-none">{menuItems.filter(i => i.track_stock).length}</div>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-black/20">
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Unit Identification</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Tracking Protocol</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Dispatch Limit</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {menuItems.map(item => (
                    <tr key={item.id} className="hover:bg-blue-600/[0.03] transition-colors group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="size-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 text-xs font-black overflow-hidden relative">
                            {item.image_url ? (
                              <img src={item.image_url} className="w-full h-full object-cover" />
                            ) : (
                              <Package size={20} />
                            )}
                          </div>
                          <div>
                            <div className="text-sm font-black text-white tracking-tight">{item.name}</div>
                            <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">{item.category}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <Badge variant={item.track_stock ? 'success' : 'info'} className="text-[9px] font-black tracking-widest py-1 px-3">
                          {item.track_stock ? 'ENABLED' : 'PASSIVE'}
                        </Badge>
                      </td>
                      <td className="px-8 py-5">
                        <div className={`font-mono text-sm ${item.track_stock ? 'text-blue-400' : 'text-slate-700'}`}>
                          {item.track_stock ? item.daily_stock?.toString().padStart(3, '0') : '∞ UNLIMITED'}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <button onClick={() => handleOpenItemModal(item)} className="px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-blue-500 hover:text-white hover:bg-blue-600 transition-all text-[9px] font-black uppercase tracking-widest">Adjust</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* FINANCIAL PERFORMANCE VIEW */}
        {activeHubView === 'MARGINS' && (
          <div className="max-w-6xl mx-auto glass-panel rounded-[2.5rem] overflow-hidden border border-slate-800/50 shadow-2xl">
            <div className="bg-slate-950/80 px-8 py-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="size-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white">
                  <BarChart2 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tighter">Unit Economics</h3>
                  <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Profit margin distribution per unit</p>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-black/20">
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Unit Name</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Base Cost</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Market Price</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Yield (Net)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {menuItems.map(item => {
                    const cost = Number(item.cost_price || 0);
                    const price = Number(item.price || 0);
                    const margin = price - cost;
                    const marginPercent = price > 0 ? (margin / price) * 100 : 0;
                    return (
                      <tr key={item.id} className="hover:bg-emerald-500/[0.03] transition-colors">
                        <td className="px-8 py-5">
                          <div className="text-sm font-black text-white tracking-tight">{item.name}</div>
                          <div className="text-[10px] text-slate-500 uppercase font-bold">{item.category}</div>
                        </td>
                        <td className="px-8 py-5 text-right font-mono text-xs text-slate-500">Rs. {cost.toLocaleString()}</td>
                        <td className="px-8 py-5 text-right font-mono text-xs text-blue-400 font-bold">Rs. {price.toLocaleString()}</td>
                        <td className="px-8 py-5 text-right">
                          <div className={`text-sm font-black ${margin > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            Rs. {margin.toFixed(0).toLocaleString()}
                          </div>
                          <div className="text-[9px] text-slate-500 font-black uppercase mt-0.5">{marginPercent.toFixed(1)}% PROFIT</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* UNIT CONFIGURATION MODAL */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? "RECONFIGURE UNIT PROPERTIES" : "INITIALIZE NEW UNIT NODE"}>
        <form onSubmit={onItemSubmit} className="space-y-5 p-2">
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block pl-1">Primary Unit Identification (EN)</label>
              <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="bg-slate-950/80 border-slate-800 font-black h-12" placeholder="e.g. GRILLED SALMON" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block pr-1 text-right">یونٹ کا مقامی نام (URDU)</label>
              <Input value={formData.name_urdu} onChange={e => setFormData({ ...formData, name_urdu: e.target.value })} className="bg-slate-950/80 border-slate-800 font-urdu text-right text-xl font-bold h-12" placeholder="چکن کڑاہی" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block pl-1">Target Cluster (Category)</label>
              <select
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest text-white outline-none focus:border-blue-500 transition-all h-12"
                value={formData.category_id}
                onChange={e => setFormData({ ...formData, category_id: e.target.value })}
              >
                {menuCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block pl-1">Route Destination (Station)</label>
              <select
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest text-white outline-none focus:border-blue-500 transition-all h-12 font-mono"
                value={formData.station_id}
                onChange={e => {
                  const s = stations.find(s => s.id === e.target.value);
                  setFormData({ ...formData, station_id: e.target.value, station: s?.name || '' });
                }}
              >
                <option value="">SELECT ROUTING NODE</option>
                {stations.map(s => <option key={s.id} value={s.id}>{s.name} {s.is_active ? '●' : '○'}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 flex flex-col justify-end">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block pl-1">Asset Reference Link (Image URL)</label>
              <div className="flex gap-2">
                <Input value={formData.image_url} onChange={e => setFormData({ ...formData, image_url: e.target.value })} className="bg-slate-950 border-slate-800 font-mono text-[10px] h-12 flex-1" placeholder="https://..." />
                <div className="size-12 rounded-lg bg-slate-900 border border-slate-800 shrink-0 overflow-hidden">
                  {formData.image_url && <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" />}
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 bg-blue-900/10 rounded-2xl border border-blue-500/20 flex items-center justify-between group">
            <div className="flex items-center gap-4">
              <div className="size-10 rounded-xl bg-blue-900/30 flex items-center justify-center text-blue-400">
                <ChefHat size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-white">Active Preparation Protocol</span>
                <span className="text-[9px] text-slate-500 font-bold mt-0.5">If disabled, unit triggers immediate status "READY" upon fire.</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, requires_prep: !formData.requires_prep })}
              className={`p-1 rounded-full transition-all ${formData.requires_prep ? 'text-blue-500' : 'text-slate-700'}`}
            >
              {formData.requires_prep ? <ToggleRight size={38} strokeWidth={1} /> : <ToggleLeft size={38} strokeWidth={1} />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-5 p-5 bg-black/40 rounded-2xl border border-slate-800">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] block">Base Cost Unit (Rs.)</label>
              <Input type="number" value={formData.cost_price} onChange={e => setFormData({ ...formData, cost_price: e.target.value })} className="bg-slate-950 border-slate-800 font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] block">Market Retail Value (Rs.)</label>
              <Input type="number" value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} className="bg-slate-950 border-slate-800 font-mono text-sm text-blue-400 font-bold" />
            </div>
          </div>

          <div className="p-5 bg-indigo-900/10 rounded-2xl border border-indigo-500/20 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="size-10 rounded-xl bg-indigo-900/30 flex items-center justify-center text-indigo-400">
                  <Package size={20} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white">Inventory Depletion Tracking</span>
                  <span className="text-[9px] text-slate-500 font-bold mt-0.5">Enable for items with limited daily availability.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, track_stock: !formData.track_stock })}
                className={`p-1 rounded-full transition-all ${formData.track_stock ? 'text-indigo-500' : 'text-slate-700'}`}
              >
                {formData.track_stock ? <ToggleRight size={38} strokeWidth={1} /> : <ToggleLeft size={38} strokeWidth={1} />}
              </button>
            </div>
            {formData.track_stock && (
              <div className="grid grid-cols-1 gap-3 pt-3 border-t border-white/5 animate-in slide-in-from-top-2">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Daily Quota limit</label>
                    <Input
                      type="number"
                      value={formData.daily_stock}
                      onChange={e => setFormData({ ...formData, daily_stock: e.target.value })}
                      className="bg-slate-950 border-slate-800 h-10"
                    />
                  </div>
                  <div className="flex-1 pt-6">
                    <p className="text-[9px] text-blue-500/60 uppercase tracking-widest font-black leading-tight flex items-center gap-2">
                      <AlertCircle size={12} /> Auto-Reset configured for 00:00:00
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} className="h-12 px-8 uppercase tracking-widest text-[10px] font-black">Abort</Button>
            <Button type="submit" className="bg-blue-600 border-0 shadow-2xl shadow-blue-900/50 h-12 flex-1 font-black tracking-[0.2em] text-[10px] uppercase">Commit Unit Change</Button>
          </div>
        </form>
      </Modal>

      {/* CLUSTER DEFINITION MODAL */}
      <Modal isOpen={isCatModalOpen} onClose={() => setIsCatModalOpen(false)} title={editingCategory ? "RECONFIGURE CLUSTER PARAMS" : "DEFINE NEW TARGET CLUSTER"}>
        <form onSubmit={onCatSubmit} className="space-y-6 p-2">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] block pl-1">Cluster Identifier (EN)</label>
            <Input value={catFormData.name} onChange={e => setCatFormData({ ...catFormData, name: e.target.value })} className="bg-slate-950 border-slate-800 font-black h-12" placeholder="e.g. STARTERS" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] block pr-1 text-right">کلستر کا مقامی نام (URDU)</label>
            <Input value={catFormData.name_urdu} onChange={e => setCatFormData({ ...catFormData, name_urdu: e.target.value })} className="bg-slate-950 border-slate-800 font-urdu text-right text-xl font-bold h-12" placeholder="اسٹارٹرز" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] block pl-1">Display Priority (Hierarchy)</label>
            <Input type="number" value={catFormData.priority} onChange={e => setCatFormData({ ...catFormData, priority: e.target.value })} className="bg-slate-950 border-slate-800 h-12" />
          </div>

          <div className="pt-4 flex justify-end gap-4">
            <Button type="button" variant="ghost" onClick={() => setIsCatModalOpen(false)} className="h-12 px-8 uppercase font-black tracking-widest text-[10px]">Abort</Button>
            <Button type="submit" className="bg-blue-600 border-0 shadow-xl h-12 flex-1 font-black tracking-[0.3em] uppercase text-[10px]">Save Configuration</Button>
          </div>
        </form>
      </Modal>

    </div>
  );
};

// --- SUB-COMPONENTS ---

interface MenuCardProps {
  item: MenuItem;
  onEdit: (item: MenuItem) => void;
  onToggle: (id: string) => void;
}

const MenuCard: React.FC<MenuCardProps> = ({ item, onEdit, onToggle }) => {
  const isAvailable = item.is_available ?? true;

  // Robust Image Fallback Logic
  const imageSource = item.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80';

  return (
    <div className={`
      relative glass-panel rounded-3xl overflow-hidden group 
      transition-all duration-500 hover:scale-[1.03] hover:shadow-2xl hover:shadow-blue-900/40 
      border border-white/5 hover:border-blue-500/50
      ${!isAvailable ? 'opacity-60 grayscale' : ''}
    `}>
      {/* Header Image Area */}
      <div className="h-44 w-full bg-slate-950 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-black/30 z-10" />
        <img
          src={imageSource}
          alt={item.name}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80';
          }}
        />

        {/* Floating Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-20">
          <span className="px-2 py-0.5 bg-blue-600/20 backdrop-blur-md border border-blue-500/40 text-[8px] font-black text-blue-400 uppercase tracking-widest rounded-md shadow-lg">
            {item.category_rel?.name || item.category || 'GENERAL'}
          </span>
          {item.station && (
            <span className="px-2 py-0.5 bg-amber-600/20 backdrop-blur-md border border-amber-500/40 text-[8px] font-black text-amber-400 uppercase tracking-widest rounded-md shadow-lg">
              {item.station}
            </span>
          )}
        </div>

        <div className="absolute top-3 right-3 z-20">
          <div className="bg-[#020617]/80 backdrop-blur-xl px-3 py-1.5 rounded-xl border border-white/10 shadow-lg">
            <span className="text-white font-black font-mono text-[11px] tracking-tight">Rs. {Number(item.price).toLocaleString()}</span>
          </div>
        </div>

        <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 to-transparent z-20">
          <div className="flex justify-between items-end">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-black text-white uppercase tracking-tighter leading-none mb-1 truncate">{item.name}</h3>
              <p className="font-urdu text-lg text-slate-300 leading-none truncate">{item.name_urdu || 'بغیر نام'}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(item); }}
              className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-transform hover:scale-110 shadow-lg shrink-0 ml-2"
            >
              <Edit2 size={14} />
            </button>
          </div>
        </div>

        {item.track_stock && (
          <div className="absolute bottom-16 left-3 z-20 flex items-center gap-2">
            <div className={`px-2 py-1 rounded-lg border flex items-center gap-1.5 backdrop-blur-xl ${Number(item.daily_stock) < 5 ? 'bg-red-500/20 border-red-500/40 text-red-500' : 'bg-green-500/20 border-green-500/40 text-green-500'}`}>
              <div className="size-1 rounded-full bg-current animate-pulse" />
              <span className="text-[8px] font-black uppercase tracking-widest">{item.daily_stock} REMAINING</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-slate-900/40 backdrop-blur-xl border-t border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            <button
              onClick={() => onToggle(item.id)}
              className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${isAvailable ? 'bg-green-600/20 text-green-500 border border-green-500/30' : 'bg-red-600/20 text-red-500 border border-red-500/30'}`}
            >
              {isAvailable ? 'Available' : 'Sold Out'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              {item.requires_prep ? 'Prep Req' : 'Direct'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};