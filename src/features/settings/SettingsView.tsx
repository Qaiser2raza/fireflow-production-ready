
import React, { useState } from 'react';
import { useAppContext } from '../../client/contexts/AppContext';
import { 
  Building2, Receipt, Calculator, Box, Map, Store, Printer, 
  FileType, Users, Wand2, Database, LayoutGrid, Cpu
} from 'lucide-react';
import { OperationsPanel } from './config/OperationsPanel';
import { ZonesPanel } from './config/ZonesPanel';
import { TablesPanel } from './config/TablesPanel';
import { VendorsPanel } from './config/VendorsPanel';
import { FloorPlanConfigView } from './config/FloorPlanConfigView';
import { PrintersPanel } from './config/PrintersPanel';
import { FeaturesPanel } from './config/FeaturesPanel';
import { SystemUpdatePanel } from './config/SystemUpdatePanel';
import { StaffView } from './StaffView';

import { BusinessProfilePanel } from './config/BusinessProfilePanel';
import { ReceiptSetupPanel } from './config/ReceiptSetupPanel';
import { SetupWizard } from './config/SetupWizard';
import { InvoiceTemplatesPanel } from './config/InvoiceTemplatesPanel';
import { DeviceManagementView } from './DeviceManagementView';

import { CustomersView } from '../../operations/customers/CustomersView';
import { MenuView } from '../../operations/menu/MenuView';
import { BillingView } from '../restaurant/BillingView';
import { ActivityLog } from '../../operations/activity/ActivityLog';
import { TransactionsView } from '../../operations/transactions/TransactionsView';
import { OrdersView } from '../../operations/orders/OrdersView';
import { ClipboardList, History } from 'lucide-react';

const DummyPanel: React.FC<{ name: string }> = ({ name }) => (
  <div className="p-8 text-slate-500 italic uppercase font-bold tracking-widest text-[10px]">Component for {name} coming soon...</div>
);

export const SettingsView: React.FC = () => {
  const { currentUser, operationsConfig, addNotification } = useAppContext();
  const [activePanel, setActivePanel] = useState<string>('tax-billing');
  const [showWizard, setShowWizard] = useState(false);

  if (currentUser?.role !== 'ADMIN' && currentUser?.role !== 'SUPER_ADMIN' && currentUser?.role !== 'MANAGER') {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-[#020617]">
        <div className="glass-panel p-12 text-center max-w-md">
          <div className="size-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Calculator size={40} className="text-red-500" />
          </div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Access Restricted</h2>
          <p className="text-slate-500 text-sm">You do not have administrative privileges to access system configuration.</p>
        </div>
      </div>
    );
  }

  const handleSeed = () => {
    addNotification('info', 'Starting data synchronization...');
    // Seed logic here
  };

  const navGroups = [
    {
      label: 'Company',
      items: [
        { id: 'business-profile', label: 'Business profile', icon: Building2 },
        { id: 'receipt-setup', label: 'Receipt setup', icon: Receipt },
        { id: 'tax-billing', label: 'Tax & billing', icon: Calculator },
      ]
    },
    {
      label: 'Operations',
      items: [
        { id: 'menu-lab', label: 'Menu Lab', icon: Box },
        { id: 'inventory', label: 'Inventory', icon: Box },
        { id: 'zones-tables', label: 'Zones & tables', icon: Map },
        { id: 'vendors', label: 'Vendors', icon: Store },
        { id: 'active-orders', label: 'Command Hub', icon: ClipboardList },
      ]
    },
    {
      label: 'Print & Devices',
      items: [
        { id: 'printers', label: 'Printers', icon: Printer },
        { id: 'invoice-templates', label: 'Invoice templates', icon: FileType },
        { id: 'devices', label: 'Device Management', icon: Cpu },
      ]
    },
    {
      label: 'Staff & Patrons',
      items: [
        { id: 'staff-roles', label: 'Staff & roles', icon: Users },
        { id: 'patrons', label: 'Patrons', icon: Users },
        { id: 'setup-wizard', label: 'Setup wizard', icon: Wand2, action: () => setShowWizard(true) },
      ]
    },
    {
      label: 'System',
      items: [
        { id: 'billing', label: 'Billing', icon: Receipt },
        { id: 'transactions', label: 'Ledger History', icon: History },
        { id: 'audit-log', label: 'Staff Audit', icon: FileType },
        { id: 'modules', label: 'Modules', icon: LayoutGrid },
        { id: 'system-update', label: 'System Update', icon: Cpu },
      ]
    }
  ];

  return (
    <div className="h-full flex flex-col bg-[#020617] text-white overflow-hidden font-sans">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 h-9 border-b border-slate-800 flex-shrink-0 bg-slate-900/50">
        <span className="text-sm font-bold text-white uppercase tracking-tight">Settings</span>
        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
          {operationsConfig?.business_name || currentUser?.name || 'Restaurant'} · {currentUser?.role}
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-[200px] flex-shrink-0 border-r border-slate-800 flex flex-col bg-slate-900/20">
          <div className="flex-1 overflow-y-auto no-scrollbar py-2">
            {navGroups.map((group, gIdx) => (
              <div key={gIdx} className="mb-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 pt-4 pb-1">
                  {group.label}
                </div>
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => item.action ? item.action() : setActivePanel(item.id)}
                    className={`flex items-center gap-2 px-3 py-2 text-xs transition-all mx-1 rounded-lg cursor-pointer ${
                      activePanel === item.id 
                        ? 'text-white bg-slate-800 font-bold' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <div className={`w-1 h-1 rounded-full ${activePanel === item.id ? 'bg-gold-500' : 'bg-slate-700'}`} />
                    <item.icon size={14} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* DB Status Footer */}
          <div className="px-3 pb-3 mt-auto border-t border-slate-800 pt-3">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">System Health: ONLINE</div>
            <button 
              onClick={handleSeed}
              className="text-[10px] text-slate-500 hover:text-indigo-400 flex items-center gap-1.5 transition-colors group"
            >
              <Database size={12} className="group-hover:animate-pulse" />
              <span>Sync Cloud Data</span>
            </button>
          </div>
        </div>

        {/* Content Panel */}
        <div className="flex-1 overflow-y-auto bg-slate-950/50 custom-scrollbar p-6">
          <div className={`${['menu-lab', 'audit-log', 'patrons', 'billing', 'transactions', 'active-orders'].includes(activePanel) ? 'w-full h-full' : 'max-w-5xl'}`}>
            {activePanel === 'business-profile' && <BusinessProfilePanel />}
            {activePanel === 'receipt-setup' && <ReceiptSetupPanel />}
            {activePanel === 'tax-billing' && <OperationsPanel />}
            {activePanel === 'menu-lab' && <div className="h-[80vh] border border-slate-800 rounded-2xl overflow-hidden"><MenuView /></div>}
            {activePanel === 'inventory' && <DummyPanel name="Inventory" />}
            {activePanel === 'zones-tables' && (
              <div className="space-y-8">
                <ZonesPanel />
                <TablesPanel />
                <div className="pt-8 border-t border-slate-800">
                  <FloorPlanConfigView />
                </div>
              </div>
            )}
            {activePanel === 'vendors' && <VendorsPanel />}
            {activePanel === 'printers' && <PrintersPanel />}
            {activePanel === 'invoice-templates' && <InvoiceTemplatesPanel />}
            {activePanel === 'staff-roles' && <StaffView />}
            {activePanel === 'patrons' && <div className="h-[80vh] border border-slate-800 rounded-2xl overflow-hidden"><CustomersView /></div>}
            {activePanel === 'billing' && <div className="h-[80vh] border border-slate-800 rounded-2xl overflow-hidden"><BillingView /></div>}
            {activePanel === 'active-orders' && <div className="h-[80vh] border border-slate-800 rounded-2xl overflow-hidden"><OrdersView /></div>}
            {activePanel === 'transactions' && <div className="h-[80vh] border border-slate-800 rounded-2xl overflow-hidden"><TransactionsView /></div>}
            { activePanel === 'audit-log' && <div className="h-[80vh] border border-slate-800 rounded-2xl overflow-hidden"><ActivityLog /></div> }
            { activePanel === 'modules' && <FeaturesPanel /> }
            { activePanel === 'system-update' && <SystemUpdatePanel /> }
            { activePanel === 'devices' && <div className="h-[80vh] bg-slate-950/20 border border-slate-800 rounded-2xl overflow-hidden"><DeviceManagementView /></div> }
          </div>
        </div>
      </div>

      {showWizard && (
        <SetupWizard 
           onComplete={() => { setShowWizard(false); window.location.reload(); }} 
           onClose={() => setShowWizard(false)} 
        />
      )}
    </div>
  );
};