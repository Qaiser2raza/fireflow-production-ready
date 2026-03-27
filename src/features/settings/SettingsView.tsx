import React, { useState } from 'react';
import { useAppContext } from '../../client/contexts/AppContext';
import { 
  Building2, Receipt, Calculator, Box, Map, Printer, 
  FileType, Users, Wand2, Database, LayoutGrid, Cpu, QrCode,
  ClipboardList, History, ShieldAlert
} from 'lucide-react';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';
// import { OperationsPanel } from './config/OperationsPanel'; // Removed - consolidated
import { ZonesPanel } from './config/ZonesPanel';
import { TablesPanel } from './config/TablesPanel';
import { SuppliersPanel } from './config/SuppliersPanel';
import { FloorPlanConfigView } from './config/FloorPlanConfigView';
import { PrintersPanel } from './config/PrintersPanel';
import { FeaturesPanel } from './config/FeaturesPanel';
import { SystemUpdatePanel } from './config/SystemUpdatePanel';
import { StaffView } from './StaffView';
import { OrderSettingsPanel } from './config/OrderSettingsPanel';

import { BusinessProfilePanel } from './config/BusinessProfilePanel';
import { ReceiptSetupPanel } from './config/ReceiptSetupPanel';
import { SetupWizard } from './config/SetupWizard';
import { InvoiceTemplatesPanel } from './config/InvoiceTemplatesPanel';
import { DeviceManagementView } from './DeviceManagementView';
import { QRCodePairing } from './QRCodePairing';

import { MenuView } from '../../operations/menu/MenuView';
import { BillingView } from '../restaurant/BillingView';
import { ActivityLog } from '../../operations/activity/ActivityLog';
import { TransactionsView } from '../../operations/transactions/TransactionsView';
import { OrdersView } from '../../operations/orders/OrdersView';

import { InventoryLedgerPanel } from './config/InventoryLedgerPanel';
import { SupplierLedgerPanel } from './config/SupplierLedgerPanel';
import { CustomerLedgerPanel } from './config/CustomerLedgerPanel';
import { ExpenseManagerPanel } from './config/ExpenseManagerPanel';


export const SettingsView: React.FC = () => {
  const { currentUser, operationsConfig, addNotification } = useAppContext();
  const [activePanel, setActivePanel] = useState<string>('business-profile');
  const [showWizard, setShowWizard] = useState(false);
  const [activeInventoryTab, setActiveInventoryTab] = useState<'inventory-ledger' | 'supplier-ledger' | 'customer-ledger' | 'expense-manager'>('inventory-ledger');

  if (currentUser?.role !== 'ADMIN' && currentUser?.role !== 'SUPER_ADMIN' && currentUser?.role !== 'MANAGER' && currentUser?.role !== 'CASHIER') {
    return (
      <div className="h-full flex items-center justify-center p-8 bg-[#020617]">
        <div className="glass-panel p-12 text-center max-w-md">
          <div className="size-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Calculator size={40} className="text-red-500" />
          </div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Access Restricted</h2>
          <p className="text-slate-500 text-sm">You do not have privileges to access system configuration.</p>
        </div>
      </div>
    );
  }

  const handleSeed = () => {
    addNotification('info', 'Starting data synchronization...');
    // Seed logic here
  };

  const handleFactoryReset = async () => {
    if (!confirm('DANGER: This will PERMANENTLY delete all transactional data (Orders, Transactions, Ledgers). There is no undo. Proceed?')) return;
    
    try {
        const res = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/system/factory-reset`, {
            method: 'POST'
        });
        if (res.ok) {
            alert('System reset successfully. Application will reload.');
            window.location.reload();
        } else {
            const err = await res.json();
            alert('Reset failed: ' + (err.error || 'Check server logs'));
        }
    } catch (err: any) {
        alert('Exception: ' + err.message);
    }
  };

  const isManagerOrAdmin = currentUser?.role === 'MANAGER' || currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN';
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN';

  const navGroups = [
    {
      label: 'Company',
      items: [
        { id: 'business-profile', label: 'Business Profile', icon: Building2 },
        { id: 'setup-wizard', label: 'Setup Wizard', icon: Wand2, action: () => setShowWizard(true), hidden: !isManagerOrAdmin },
        { id: 'order-defaults', label: 'Order Defaults', icon: Calculator, hidden: !isManagerOrAdmin },
        { id: 'receipt-setup', label: 'Receipt Setup', icon: Receipt },
      ]
    },
    {
      label: 'Operations',
      items: [
        { id: 'menu-lab', label: 'Menu Lab', icon: Box },
        { id: 'inventory-management', label: 'Inventory & Ledger', icon: Box, hidden: !isManagerOrAdmin && currentUser?.role !== 'CASHIER' },
        { id: 'zones-tables', label: 'Zones & Tables', icon: Map, hidden: !isManagerOrAdmin },
        { id: 'active-orders', label: 'Command Hub', icon: ClipboardList, hidden: !isManagerOrAdmin },
      ]
    },
    {
      label: 'Print & Devices',
      items: [
        { id: 'printers', label: 'Printers', icon: Printer },
        { id: 'customers', label: 'Customers', icon: Users },
        { id: 'reports', label: 'Financial Reports', icon: Calculator, hidden: !isManagerOrAdmin },
        { id: 'invoice-templates', label: 'Invoice Templates', icon: FileType, hidden: !isManagerOrAdmin },
        { id: 'pairing', label: 'Device Pairing', icon: QrCode },
        { id: 'devices', label: 'Device Management', icon: Cpu, hidden: !isManagerOrAdmin },
      ]
    },
    {
      label: 'Staff Settings',
      items: [
        { id: 'staff-roles', label: 'Staff & Roles', icon: Users, hidden: !isAdmin },
      ]
    },
    {
      label: 'System',
      items: [
        { id: 'billing', label: 'Billing', icon: Receipt, hidden: !isManagerOrAdmin },
        { id: 'transactions', label: 'Ledger History', icon: History, hidden: !isManagerOrAdmin },
        { id: 'audit-log', label: 'Staff Audit', icon: FileType, hidden: !isManagerOrAdmin },
        { id: 'modules', label: 'Modules', icon: LayoutGrid, hidden: !isAdmin },
        { id: 'system-update', label: 'System Update', icon: Cpu, hidden: !isAdmin },
      ]
    }
  ];

  // Filter hidden items
  const filteredNavGroups = navGroups.map(group => ({
    ...group,
    items: group.items.filter(item => !(item as any).hidden)
  })).filter(group => group.items.length > 0);

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
            {filteredNavGroups.map((group, gIdx) => (
              <div key={gIdx} className="mb-4">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3 pt-4 pb-1">
                  {group.label}
                </div>
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (item.action) {
                        item.action();
                      } else {
                        setActivePanel(item.id);
                        // Reset inventory tab if navigating away from inventory management
                        if (item.id !== 'inventory-management') {
                          setActiveInventoryTab(currentUser?.role === 'CASHIER' ? 'supplier-ledger' : 'inventory-ledger');
                        } else if (currentUser?.role === 'CASHIER') {
                          setActiveInventoryTab('supplier-ledger');
                        }
                      }
                    }}
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

            {(currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN') && (
              <button
                onClick={handleFactoryReset}
                className="text-[10px] text-red-500/40 hover:text-red-500 flex items-center gap-1.5 transition-colors group mt-2 pt-2 border-t border-red-500/10"
              >
                <ShieldAlert size={12} />
                <span>Factory Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Panel */}
        <div className="flex-1 overflow-y-auto bg-slate-950/50 custom-scrollbar p-6">
          <div className={`${['menu-lab', 'audit-log', 'patrons', 'billing', 'transactions', 'active-orders', 'inventory-management'].includes(activePanel) ? 'w-full h-full' : 'max-w-5xl'}`}>
            {activePanel === 'business-profile' && <BusinessProfilePanel />}
            {activePanel === 'receipt-setup' && <ReceiptSetupPanel />}
            {activePanel === 'menu-lab' && <div className="h-[80vh] border border-slate-800 rounded-2xl overflow-hidden"><MenuView /></div>}
            {activePanel === 'inventory-management' && (
              <div className="h-full flex flex-col">
                <div className="flex border-b border-slate-800 mb-4">
                  {isManagerOrAdmin && (
                    <button
                      className={`px-4 py-2 text-sm font-medium ${activeInventoryTab === 'inventory-ledger' ? 'text-white border-b-2 border-gold-500' : 'text-slate-400 hover:text-white'}`}
                      onClick={() => setActiveInventoryTab('inventory-ledger')}
                    >
                      Inventory Ledger
                    </button>
                  )}
                  <button
                    className={`px-4 py-2 text-sm font-medium ${activeInventoryTab === 'supplier-ledger' ? 'text-white border-b-2 border-gold-500' : 'text-slate-400 hover:text-white'}`}
                    onClick={() => setActiveInventoryTab('supplier-ledger')}
                  >
                    Supplier Ledger
                  </button>
                  {isManagerOrAdmin && (
                    <>
                      <button
                        className={`px-4 py-2 text-sm font-medium ${activeInventoryTab === 'customer-ledger' ? 'text-white border-b-2 border-gold-500' : 'text-slate-400 hover:text-white'}`}
                        onClick={() => setActiveInventoryTab('customer-ledger')}
                      >
                        Customer Ledger
                      </button>
                      <button
                        className={`px-4 py-2 text-sm font-medium ${activeInventoryTab === 'expense-manager' ? 'text-white border-b-2 border-gold-500' : 'text-slate-400 hover:text-white'}`}
                        onClick={() => setActiveInventoryTab('expense-manager')}
                      >
                        Expense Manager
                      </button>
                    </>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {activeInventoryTab === 'inventory-ledger' && <InventoryLedgerPanel />}
                  {activeInventoryTab === 'supplier-ledger' && <SupplierLedgerPanel />}
                  {activeInventoryTab === 'customer-ledger' && <CustomerLedgerPanel />}
                  {activeInventoryTab === 'expense-manager' && <ExpenseManagerPanel />}
                </div>
              </div>
            )}
            {activePanel === 'zones-tables' && (
              <div className="space-y-8">
                <ZonesPanel />
                <TablesPanel />
                <div className="pt-8 border-t border-slate-800">
                  <FloorPlanConfigView />
                </div>
              </div>
            )}
            { activePanel === 'suppliers' && <SuppliersPanel /> /* Legacy, can keep or remove */ }
            {activePanel === 'order-defaults' && <OrderSettingsPanel />}
            {activePanel === 'printers' && <PrintersPanel />}
            {activePanel === 'invoice-templates' && <InvoiceTemplatesPanel />}
            {activePanel === 'staff-roles' && <StaffView />}
            {activePanel === 'billing' && <div className="h-[80vh] border border-slate-800 rounded-2xl overflow-hidden"><BillingView /></div>}
            {activePanel === 'active-orders' && <div className="h-[80vh] border border-slate-800 rounded-2xl overflow-hidden"><OrdersView /></div>}
            {activePanel === 'transactions' && <div className="h-[80vh] border border-slate-800 rounded-2xl overflow-hidden"><TransactionsView /></div>}
            { activePanel === 'audit-log' && <div className="h-[80vh] border border-slate-800 rounded-2xl overflow-hidden"><ActivityLog /></div> }
            { activePanel === 'modules' && <FeaturesPanel /> }
            { activePanel === 'system-update' && <SystemUpdatePanel /> }
            { activePanel === 'devices' && <div className="h-[80vh] bg-slate-950/20 border border-slate-800 rounded-2xl overflow-hidden"><DeviceManagementView /></div> }
            { activePanel === 'pairing' && <div className="h-[80vh] bg-slate-950/20 border border-slate-800 rounded-2xl overflow-hidden"><QRCodePairing /></div> }

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