import React, { useState } from 'react';
import { useAppContext } from '../../client/contexts/AppContext';
import { Settings as SettingsIcon } from 'lucide-react';
import { OperationsPanel } from './config/OperationsPanel';
import { ZonesPanel } from './config/ZonesPanel';
import { TablesPanel } from './config/TablesPanel';
import { VendorsPanel } from './config/VendorsPanel';
import { FloorPlanConfigView } from './config/FloorPlanConfigView';

export const SettingsView: React.FC = () => {
  const { currentUser } = useAppContext();
  const [activeTab, setActiveTab] = useState<'OPERATIONS' | 'ZONES' | 'TABLES' | 'VENDORS' | 'FLOOR'>('OPERATIONS');

  if (currentUser?.role !== 'ADMIN' && currentUser?.role !== 'SUPER_ADMIN' && currentUser?.role !== 'MANAGER') {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="glass-panel p-12 text-center max-w-md">
          <div className="size-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <SettingsIcon size={40} className="text-red-500" />
          </div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Access Restricted</h2>
          <p className="text-slate-500 text-sm">You do not have administrative privileges to access system configuration.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#020617] overflow-hidden">
      {/* Settings Header */}
      <div className="glass-panel border-b border-slate-800/60 bg-slate-900/40 backdrop-blur-3xl px-8 py-8 shrink-0">
        <div className="flex items-center gap-6">
          <div className="size-14 flex items-center justify-center rounded-2xl bg-indigo-600 shadow-xl shadow-indigo-900/40 text-white">
            <SettingsIcon size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter uppercase text-white leading-none">Settings</h1>
            <p className="text-sm uppercase tracking-widest text-indigo-400 font-bold mt-2 opacity-70">Infrastructure & Control</p>
          </div>
        </div>

        {/* Tab Nav */}
        <div className="mt-8 flex gap-4 overflow-x-auto no-scrollbar">
          {[
            { id: 'OPERATIONS', label: 'Operations', icon: SettingsIcon },
            { id: 'ZONES', label: 'Zones', icon: null },
            { id: 'TABLES', label: 'Tables', icon: null },
            { id: 'FLOOR', label: 'Floor Plan', icon: null },
            { id: 'VENDORS', label: 'Vendors', icon: null }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id
                ? 'bg-slate-800 text-white shadow-lg ring-1 ring-white/10'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
        <div className="max-w-7xl mx-auto">
          {activeTab === 'OPERATIONS' && <OperationsPanel />}
          {activeTab === 'ZONES' && <ZonesPanel />}
          {activeTab === 'TABLES' && <TablesPanel />}
          {activeTab === 'FLOOR' && <FloorPlanConfigView />}
          {activeTab === 'VENDORS' && <VendorsPanel />}
        </div>
      </div>
    </div>
  );
};