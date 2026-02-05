import React, { useState } from 'react';
import { useAppContext } from '../../client/contexts/AppContext';
import { Search, ToggleLeft, ToggleRight, Save, Edit2, AlertCircle, Database, RefreshCw, CheckCircle2, XCircle, Trash2, Settings as SettingsIcon } from 'lucide-react';
import { OperationsPanel } from './config/OperationsPanel';

import { ZonesPanel } from './config/ZonesPanel';
import { TablesPanel } from './config/TablesPanel';
import { VendorsPanel } from './config/VendorsPanel';
import { FloorPlanConfigView } from './config/FloorPlanConfigView';
import { StationsPanel } from './config/StationsPanel';

const InventoryPanel: React.FC = () => {
  const { menuItems, toggleItemAvailability, updateItemPrice } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [tempPrice, setTempPrice] = useState<string>('');

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl max-w-2xl mb-8">
        <Search className="text-slate-500" />
        <input
          type="text"
          placeholder="Search Menu Items..."
          className="bg-transparent border-none outline-none text-white w-full font-medium"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
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
}

export const SettingsView: React.FC = () => {
  const { currentUser, connectionStatus } = useAppContext();
  const [activeTab, setActiveTab] = useState<'OPERATIONS' | 'INVENTORY' | 'ZONES' | 'STATIONS' | 'TABLES' | 'VENDORS' | 'FLOOR'>('OPERATIONS');
  const [isSeeding, setIsSeeding] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [seedMessage, setSeedMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);

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

  const handleSeed = async () => {
    if (!window.confirm("Add sample data if missing.\nAlready existing data will NOT be duplicated.\nContinue?")) return;

    setIsSeeding(true);
    setSeedMessage(null);

    try {
      const response = await fetch('/api/system/seed-restaurant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId: currentUser?.restaurant_id })
      });

      const data = await response.json();

      if (data.success) {
        setSeedMessage({
          type: 'success',
          text: data.alreadySeeded
            ? '✅ Already seeded - skipped duplicate (safe & idempotent)'
            : '✅ Sample data added successfully (safe & idempotent)'
        });

        // Optional: Refresh data if needed
        // setTimeout(() => window.location.reload(), 2000);
      } else {
        setSeedMessage({
          type: 'error',
          text: `❌ Seeding failed: ${data.error || 'Unknown error'}`
        });
      }
    } catch (err: any) {
      setSeedMessage({
        type: 'error',
        text: `❌ Network error: ${err.message}`
      });
    } finally {
      setIsSeeding(false);
      // Auto-clear message after 5 seconds
      setTimeout(() => setSeedMessage(null), 5000);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("FATAL ACTION: This will delete ALL orders, transactions, and expenses.\nThis cannot be undone. \n\nContinue?")) return;

    if (!window.confirm("ARE YOU ABSOLUTELY SURE?\nTesting environment will be wiped clean.")) return;

    setIsResetting(true);
    setSeedMessage(null);

    try {
      const response = await fetch('/api/system/reset-environment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId: currentUser?.restaurant_id })
      });

      const data = await response.json();

      if (data.success) {
        setSeedMessage({
          type: 'success',
          text: '✅ Environment Wiped Clean'
        });
      } else {
        setSeedMessage({
          type: 'error',
          text: `❌ Reset failed: ${data.error || 'Unknown error'}`
        });
      }
    } catch (err: any) {
      setSeedMessage({
        type: 'error',
        text: `❌ Network error: ${err.message}`
      });
    } finally {
      setIsResetting(false);
      setTimeout(() => setSeedMessage(null), 5000);
    }
  };

  return (
    <div className="flex h-full w-full bg-slate-950 flex-col overflow-hidden">
      {/* Header */}
      <div className="p-8 border-b border-slate-800 bg-slate-900/50">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-gold-500 text-xs font-bold uppercase tracking-[0.2em] mb-1">Back of House</h2>
            <h1 className="text-3xl font-serif text-white">System Configuration</h1>
          </div>

          {/* DB Tools */}
          <div className="flex gap-4">
            <div className={`px-4 py-2 rounded-lg border flex items-center gap-2 text-xs font-bold uppercase tracking-widest
                 ${connectionStatus === 'connected' ? 'bg-green-900/20 border-green-500/50 text-green-400' : 'bg-red-900/20 border-red-500/50 text-red-400'}
              `}>
              {connectionStatus === 'connected' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              {connectionStatus === 'connected' ? 'DB Connected' : 'DB Error'}
            </div>

            <button
              onClick={handleSeed}
              disabled={isSeeding || isResetting}
              className="bg-blue-900/20 border border-blue-500/50 text-blue-400 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
            >
              {isSeeding ? <RefreshCw className="animate-spin" size={16} /> : <Database size={16} />}
              {isSeeding ? 'Seeding...' : 'Seed Sample Data'}
            </button>

            <button
              onClick={handleReset}
              disabled={isResetting || isSeeding}
              className="bg-red-900/20 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-red-900/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
            >
              {isResetting ? <RefreshCw className="animate-spin" size={16} /> : <Trash2 size={16} />}
              {isResetting ? 'Resetting...' : 'Factory Reset'}
            </button>
          </div>
        </div>

        {/* Tab Nav - FIXED: Added OPERATIONS */}
        <div className="mt-8 flex gap-6">
          {[
            { id: 'OPERATIONS', label: 'Operations', icon: SettingsIcon },
            { id: 'INVENTORY', label: 'Inventory' },
            { id: 'ZONES', label: 'Zones' },
            { id: 'STATIONS', label: 'Stations' },
            { id: 'TABLES', label: 'Tables' },
            { id: 'FLOOR', label: 'Floor Plan' },
            { id: 'VENDORS', label: 'Vendors' }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`pb-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors flex items-center gap-2 ${activeTab === tab.id
                  ? 'border-gold-500 text-white'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
              >
                {Icon && <Icon size={14} />}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Seed Status Message */}
        {seedMessage && (
          <div className={`mt-4 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 ${seedMessage.type === 'success'
            ? 'bg-green-900/30 border border-green-500/50 text-green-400'
            : 'bg-red-900/30 border border-red-500/50 text-red-400'
            }`}>
            {seedMessage.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            {seedMessage.text}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {activeTab === 'OPERATIONS' && <OperationsPanel />}
        {activeTab === 'INVENTORY' && <InventoryPanel />}
        {activeTab === 'ZONES' && <ZonesPanel />}
        {activeTab === 'STATIONS' && <StationsPanel />}
        {activeTab === 'TABLES' && <TablesPanel />}
        {activeTab === 'FLOOR' && <FloorPlanConfigView />}
        {activeTab === 'VENDORS' && <VendorsPanel />}
      </div>
    </div>
  );
};