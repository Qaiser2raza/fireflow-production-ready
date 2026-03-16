// ==========================================
// OPERATIONS PANEL (FINAL CORRECTED VERSION)
// ==========================================
// Location: src/features/settings/config/OperationsPanel.tsx
// Fixed: Import paths + TypeScript types

import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../../../client/contexts/AppContext';
import { Save, Banknote, Percent, Users, Truck, Loader2, WifiOff, Receipt, Printer } from 'lucide-react';

// Import from src/lib/ (NOT src/shared/lib/)
import { cacheSet, cacheGet, isOnline, getOperationsConfigKey, initializeCache } from '../../../lib/offlineCache';
import { createAuditLog } from '../../../lib/auditLog';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';

// API base URL for backend requests
const API_BASE_URL = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

interface OperationsConfig {
  taxEnabled: boolean;
  taxRate: number;
  serviceChargeEnabled: boolean;
  serviceChargeRate: number;
  defaultDeliveryFee: number;
  defaultGuestCount: number;
  defaultRiderFloat: number;
  // Floor Management
  allowOverCapacity: boolean;
  maxOverCapacityGuests: number;
  enableTableMerging: boolean;
  // FBR Integration
  fbrEnabled: boolean;
  fbrPosId: string;
  fbrImsUrl: string;
  fbrNtn: string;
  // Business Identity
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  ntnNumber: string;
  strnNumber: string;
  // Receipt Presentation
  receiptHeaderText: string;
  receiptFooterText: string;
  taxLabel: string;
  showCashierName: boolean;
  autoPrintOnPayment: boolean;
  // Printer Settings
  primary_printer: string;
  print_dialog: boolean;
}

// API response types
interface ConfigResponse {
  success: boolean;
  config?: any;
  error?: string;
}

const DEFAULT_CONFIG: OperationsConfig = {
  taxEnabled: false,
  taxRate: 0,
  serviceChargeEnabled: false,
  serviceChargeRate: 5,
  defaultDeliveryFee: 250,
  defaultGuestCount: 2,
  defaultRiderFloat: 5000,
  allowOverCapacity: true,
  maxOverCapacityGuests: 3,
  enableTableMerging: false,
  fbrEnabled: false,
  fbrPosId: '',
  fbrImsUrl: '',
  fbrNtn: '',
  businessName: '',
  businessAddress: '',
  businessPhone: '',
  ntnNumber: '',
  strnNumber: '',
  receiptHeaderText: '',
  receiptFooterText: 'Thank you for dining with us!',
  taxLabel: 'GST',
  showCashierName: true,
  autoPrintOnPayment: false,
  primary_printer: 'Default',
  print_dialog: false
};

/**
 * Parse API response to safe config with type guards
 */
function parseConfigFromAPI(data: any): OperationsConfig {
  return {
    taxEnabled: Boolean(data.taxEnabled),
    taxRate: Number(data.taxRate) || 0,
    serviceChargeEnabled: Boolean(data.serviceChargeEnabled),
    serviceChargeRate: Number(data.serviceChargeRate) || 0,
    defaultDeliveryFee: Number(data.defaultDeliveryFee) || 250,
    defaultGuestCount: Math.max(1, Math.min(20, Number(data.defaultGuestCount) || 2)),
    defaultRiderFloat: Number(data.defaultRiderFloat) || 5000,
    allowOverCapacity: data.allowOverCapacity !== undefined ? Boolean(data.allowOverCapacity) : true,
    maxOverCapacityGuests: Number(data.maxOverCapacityGuests) || 3,
    enableTableMerging: Boolean(data.enableTableMerging),
    fbrEnabled: Boolean(data.fbrEnabled),
    fbrPosId: data.fbrPosId || '',
    fbrImsUrl: data.fbrImsUrl || '',
    fbrNtn: data.fbrNtn || '',
    businessName: data.businessName || '',
    businessAddress: data.businessAddress || '',
    businessPhone: data.businessPhone || '',
    ntnNumber: data.ntnNumber || '',
    strnNumber: data.strnNumber || '',
    receiptHeaderText: data.receiptHeaderText || '',
    receiptFooterText: data.receiptFooterText || 'Thank you!',
    taxLabel: data.taxLabel || 'GST',
    showCashierName: data.showCashierName !== undefined ? Boolean(data.showCashierName) : true,
    autoPrintOnPayment: Boolean(data.autoPrintOnPayment),
    primary_printer: data.primary_printer || data.primaryPrinter || 'Default',
    print_dialog: data.print_dialog !== undefined ? Boolean(data.print_dialog) : (data.printDialog !== undefined ? Boolean(data.printDialog) : false)
  };
}

export const OperationsPanel: React.FC = () => {
  const { currentUser, addNotification, socket, fetchInitialData } = useAppContext();
  const [config, setConfig] = useState<OperationsConfig>(DEFAULT_CONFIG);
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(!isOnline());
  const [systemPrinters, setSystemPrinters] = useState<any[]>([]);

  const restaurantId = currentUser?.restaurant_id;
  const cacheKey = restaurantId ? getOperationsConfigKey(restaurantId) : '';

  // Initialize cache cleanup on mount
  useEffect(() => {
    initializeCache();
  }, []);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      addNotification('success', 'Connection restored');
      if (restaurantId) loadConfig();
    };

    const handleOffline = () => {
      setIsOffline(true);
      addNotification('warning', 'Working offline - changes will sync when connection returns');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [restaurantId]);

  // Load config from API or cache
  const loadConfig = useCallback(async () => {
    if (!restaurantId) return;

    setIsLoading(true);

    try {
      // Check localStorage first (primary source until backend persistence is implemented)
      const storageKey = `fireflow_operations_config_${restaurantId}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setConfig(parseConfigFromAPI(parsed));
          setIsLoading(false);
          return;
        } catch (parseError) {
          console.warn('Failed to parse stored config, falling back to API');
        }
      }

      // Try cache if offline
      if (!isOnline()) {
        const cached = await cacheGet<OperationsConfig>('configs', cacheKey);
        if (cached) {
          setConfig(cached);
          addNotification('info', 'Loaded offline configuration from Fireflow cloud');
          setIsLoading(false);
          return;
        }
      }

      // Fetch from API (will return defaults)
      const response = await fetchWithAuth(
        `${API_BASE_URL}/operations/config/${restaurantId}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to load configuration`);
      }

      const data: ConfigResponse = await response.json();

      if (!data.success || !data.config) {
        throw new Error(data.error || 'Failed to load configuration');
      }

      const safeConfig = parseConfigFromAPI(data.config);
      setConfig(safeConfig);

      // Cache for offline use (7-day TTL)
      await cacheSet('configs', cacheKey, safeConfig, 7);

    } catch (error) {
      console.error('Failed to load operations config:', error);

      // Try cache as fallback
      const cached = await cacheGet<OperationsConfig>('configs', cacheKey);
      if (cached) {
        setConfig(cached);
        addNotification('warning', 'Using cached configuration - connection failed');
      } else {
        addNotification('error', 'Failed to load configuration');
      }
    } finally {
      setIsLoading(false);
    }
  }, [restaurantId, cacheKey, addNotification]);

  // Initial load
  useEffect(() => {
    if (restaurantId) {
      loadConfig();
    }
    
    // Fetch available printers from Electron
    const fetchPrinters = async () => {
      if ((window as any).electron?.ipcRenderer) {
        try {
          const printers = await (window as any).electron.ipcRenderer.invoke('get-printers');
          setSystemPrinters(printers || []);
        } catch (e) {
          console.error('Failed to fetch system printers:', e);
        }
      }
    };
    fetchPrinters();
  }, [restaurantId]);

  // Socket.IO listener using context socket
  useEffect(() => {
    if (!socket || !restaurantId) return;

    const handleConfigUpdate = () => {
      console.log('Config updated by another client - refreshing...');
      loadConfig();
    };

    socket.on('config:updated', handleConfigUpdate);

    return () => {
      socket.off('config:updated', handleConfigUpdate);
    };
  }, [socket, restaurantId, loadConfig]);

  // Update config value
  const updateConfig = useCallback((key: keyof OperationsConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }, []);

  // Save config to API
  const handleSave = async () => {
    if (!restaurantId || !currentUser) return;

    setIsSaving(true);

    try {
      // Save to localStorage immediately (since backend doesn't persist yet)
      const storageKey = `fireflow_operations_config_${restaurantId}`;
      localStorage.setItem(storageKey, JSON.stringify(config));

      // Also save individual keys for legacy compatibility (App.tsx calculateOrderTotal)
      localStorage.setItem('service_charge_enabled', config.serviceChargeEnabled.toString());
      localStorage.setItem('service_charge_rate', (config.serviceChargeRate / 100).toString());
      localStorage.setItem('tax_enabled', config.taxEnabled.toString());
      localStorage.setItem('tax_rate', (config.taxRate / 100).toString());
      localStorage.setItem('default_delivery_fee', config.defaultDeliveryFee.toString());
      localStorage.setItem('default_guest_count', config.defaultGuestCount.toString());

      // Update cache (7-day TTL)
      await cacheSet('configs', cacheKey, config, 7);

      setHasChanges(false);

      // Try to notify backend
      try {
        await fetchWithAuth(`${API_BASE_URL}/operations/config/${restaurantId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...config,
            staffId: currentUser.id
          })
        });
      } catch (apiError) {
        console.warn('Backend notification failed (non-critical):', apiError);
      }

      // Create audit log (best effort)
      createAuditLog({
        restaurant_id: restaurantId,
        staff_id: currentUser.id,
        action_type: 'CONFIG_UPDATE',
        entity_type: 'RESTAURANT',
        entity_id: restaurantId,
        details: config
      }).catch(err => console.warn('Audit log failed (non-critical):', err));

      addNotification('success', 'Configuration saved successfully');
      
      // Also update local storage specifically for the printer settings (redundancy)
      localStorage.setItem(`fireflow_primary_printer_${restaurantId}`, config.primary_printer);
      localStorage.setItem(`fireflow_print_dialog_${restaurantId}`, config.print_dialog.toString());

      // Refresh global app state so POS/other views see the new rates immediately
      await fetchInitialData();

    } catch (error) {
      console.error('Save operations config error:', error);
      addNotification('error', error instanceof Error ? error.message : 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-gold-500" size={32} />
      </div>
    );
  }

  return (
    <div className="text-slate-200 max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold text-white">Daily Operations</h3>
            {isOffline && (
              <div className="flex items-center gap-2 px-3 py-1 bg-orange-900/30 border border-orange-500/50 rounded-lg text-orange-400 text-xs">
                <WifiOff size={14} />
                Offline Mode
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">
            Configure default values for orders & billing
          </p>
        </div>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-gold-500 text-black px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-gold-400 transition-all shadow-lg shadow-gold-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      <div className="space-y-6">
        {/* Tax Settings */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-green-500">
              <Percent size={20} />
            </div>
            <div>
              <h4 className="font-bold text-white">Tax Configuration</h4>
              <p className="text-xs text-slate-500">Apply tax to all orders</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="tax-enabled" className="text-sm text-slate-300">Enable Tax</label>
              <button
                id="tax-enabled"
                onClick={() => updateConfig('taxEnabled', !config.taxEnabled)}
                className={`w-14 h-7 rounded-full transition-colors ${config.taxEnabled ? 'bg-green-600' : 'bg-slate-700'
                  }`}
                aria-label={`Tax is ${config.taxEnabled ? 'enabled' : 'disabled'}`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${config.taxEnabled ? 'translate-x-8' : 'translate-x-1'
                    }`}
                />
              </button>
            </div>

            {config.taxEnabled && (
              <div>
                <label htmlFor="tax-rate" className="text-xs text-slate-500 mb-2 block uppercase font-bold">
                  Tax Rate (%)
                </label>
                <div className="relative">
                  <input
                    id="tax-rate"
                    type="number"
                    className="w-full bg-black border border-slate-700 rounded px-3 py-2 pr-8 text-white outline-none focus:border-gold-500"
                    value={config.taxRate || ''}
                    onFocus={(e) => e.target.select()}
                    onChange={e => updateConfig('taxRate', e.target.value === '' ? 0 : Math.max(0, Math.min(100, Number(e.target.value))))}
                    step="0.1"
                    min="0"
                    max="100"
                    aria-label="Tax rate percentage"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">%</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Example: Rs. 1,000 order → Rs. {(1000 * (config.taxRate / 100)).toFixed(2)} tax
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Service Charge Settings */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-blue-500">
              <Banknote size={20} />
            </div>
            <div>
              <h4 className="font-bold text-white">Service Charge</h4>
              <p className="text-xs text-slate-500">Additional charge for dine-in orders</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="service-charge-enabled" className="text-sm text-slate-300">Enable Service Charge</label>
              <button
                id="service-charge-enabled"
                onClick={() => updateConfig('serviceChargeEnabled', !config.serviceChargeEnabled)}
                className={`w-14 h-7 rounded-full transition-colors ${config.serviceChargeEnabled ? 'bg-blue-600' : 'bg-slate-700'
                  }`}
                aria-label={`Service charge is ${config.serviceChargeEnabled ? 'enabled' : 'disabled'}`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${config.serviceChargeEnabled ? 'translate-x-8' : 'translate-x-1'
                    }`}
                />
              </button>
            </div>

            {config.serviceChargeEnabled && (
              <div>
                <label htmlFor="service-charge-rate" className="text-xs text-slate-500 mb-2 block uppercase font-bold">
                  Service Charge Rate (%)
                </label>
                <div className="relative">
                  <input
                    id="service-charge-rate"
                    type="number"
                    className="w-full bg-black border border-slate-700 rounded px-3 py-2 pr-8 text-white outline-none focus:border-gold-500"
                    value={config.serviceChargeRate || ''}
                    onFocus={(e) => e.target.select()}
                    onChange={e => updateConfig('serviceChargeRate', e.target.value === '' ? 0 : Math.max(0, Math.min(100, Number(e.target.value))))}
                    step="0.1"
                    min="0"
                    max="100"
                    aria-label="Service charge rate percentage"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">%</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Example: Rs. 1,000 order → Rs. {(1000 * (config.serviceChargeRate / 100)).toFixed(2)} service charge
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Delivery Settings */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-purple-500">
              <Truck size={20} />
            </div>
            <div>
              <h4 className="font-bold text-white">Delivery Defaults</h4>
              <p className="text-xs text-slate-500">Default fees and rider float</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="delivery-fee" className="text-xs text-slate-500 mb-2 block uppercase font-bold">
                Default Delivery Fee
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">Rs.</span>
                <input
                  id="delivery-fee"
                  type="number"
                  className="w-full bg-black border border-slate-700 rounded px-3 py-2 pl-10 text-white outline-none focus:border-gold-500"
                  value={config.defaultDeliveryFee || ''}
                  onFocus={(e) => e.target.select()}
                  onChange={e => updateConfig('defaultDeliveryFee', e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
                  min="0"
                  step="50"
                  aria-label="Default delivery fee"
                />
              </div>
            </div>

            <div>
              <label htmlFor="rider-float" className="text-xs text-slate-500 mb-2 block uppercase font-bold">
                Default Rider Float
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">Rs.</span>
                <input
                  id="rider-float"
                  type="number"
                  className="w-full bg-black border border-slate-700 rounded px-3 py-2 pl-10 text-white outline-none focus:border-gold-500"
                  value={config.defaultRiderFloat || ''}
                  onFocus={(e) => e.target.select()}
                  onChange={e => updateConfig('defaultRiderFloat', e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
                  min="0"
                  step="500"
                  aria-label="Default rider float amount"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Cash given to riders at shift start</p>
            </div>
          </div>
        </div>

        {/* Table Settings */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-gold-500">
              <Users size={20} />
            </div>
            <div>
              <h4 className="font-bold text-white">Table Defaults</h4>
              <p className="text-xs text-slate-500">Default guest count for new orders</p>
            </div>
          </div>

          <div>
            <label htmlFor="guest-count" className="text-xs text-slate-500 mb-2 block uppercase font-bold">
              Default Guest Count
            </label>
            <input
              id="guest-count"
              type="number"
              className="w-full bg-black border border-slate-700 rounded px-3 py-2 text-white outline-none focus:border-gold-500"
              value={config.defaultGuestCount || ''}
              onFocus={(e) => e.target.select()}
              onChange={e => updateConfig('defaultGuestCount', e.target.value === '' ? 1 : Math.max(1, Math.min(20, Number(e.target.value))))}
              min="1"
              max="20"
              aria-label="Default guest count"
            />
            <p className="text-xs text-slate-500 mt-1">
              Pre-filled when seating guests at a table
            </p>
          </div>
        </div>

      </div>

      {/* FBR Integration Settings */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-primary">
            <Receipt size={20} />
          </div>
          <div>
            <h4 className="font-bold text-white">Pakistan FBR Integration</h4>
            <p className="text-xs text-slate-500">POS Compliance (SRB/PRA/FBR)</p>
          </div>
        </div>

        <div className="space-y-4 text-xs font-bold uppercase tracking-widest">
          <div className="flex items-center justify-between">
            <label htmlFor="fbr-enabled" className="text-slate-300">Enable FBR Reporting</label>
            <button
              id="fbr-enabled"
              onClick={() => updateConfig('fbrEnabled', !config.fbrEnabled)}
              className={`w-14 h-7 rounded-full transition-colors ${config.fbrEnabled ? 'bg-primary' : 'bg-slate-700'
                }`}
            >
              <div className={`w-5 h-5 rounded-full bg-white transition-transform ${config.fbrEnabled ? 'translate-x-8' : 'translate-x-1'
                }`} />
            </button>
          </div>

          {config.fbrEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-left">
              <div className="space-y-2">
                <label className="text-slate-500">FBR POS ID</label>
                <input
                  type="text"
                  className="w-full bg-black border border-slate-700 rounded px-3 py-2 text-white outline-none focus:border-primary"
                  placeholder="e.g. 123456"
                  value={config.fbrPosId}
                  onChange={e => updateConfig('fbrPosId', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-slate-500">FBR NTN</label>
                <input
                  type="text"
                  className="w-full bg-black border border-slate-700 rounded px-3 py-2 text-white outline-none focus:border-primary"
                  placeholder="e.g. 1234567-8"
                  value={config.fbrNtn}
                  onChange={e => updateConfig('fbrNtn', e.target.value)}
                />
              </div>
              <div className="md:col-span-2 space-y-2 text-left">
                <label className="text-slate-500">IMS API URL</label>
                <input
                  type="text"
                  className="w-full bg-black border border-slate-700 rounded px-3 py-2 text-white outline-none focus:border-primary normal-case"
                  placeholder="https://ims.fbr.gov.pk/api/Live/PostData"
                  value={config.fbrImsUrl}
                  onChange={e => updateConfig('fbrImsUrl', e.target.value)}
                />
                <p className="text-[9px] text-slate-500 lowercase">Leave empty to use default live production environment</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* NEW: Receipt & Business Settings */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-gold-500">
            <Receipt size={20} />
          </div>
          <div>
            <h4 className="font-bold text-white">Receipt & Business Identity</h4>
            <p className="text-xs text-slate-500">Customize how your invoices look</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-500/50">Business Info</h5>
            <div className="space-y-2">
              <label className="text-xs text-slate-500 font-bold uppercase">Display Name</label>
              <input
                type="text"
                className="w-full bg-black border border-slate-800 rounded px-3 py-2 text-sm text-white outline-none focus:border-gold-500"
                value={config.businessName}
                onChange={e => updateConfig('businessName', e.target.value)}
                placeholder="Restaurant Name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-500 font-bold uppercase">Address</label>
              <input
                type="text"
                className="w-full bg-black border border-slate-800 rounded px-3 py-2 text-sm text-white outline-none focus:border-gold-500"
                value={config.businessAddress}
                onChange={e => updateConfig('businessAddress', e.target.value)}
                placeholder="Shop #, Street, Area, City"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-500 font-bold uppercase">Phone</label>
                <input
                  type="text"
                  className="w-full bg-black border border-slate-800 rounded px-3 py-2 text-sm text-white outline-none focus:border-gold-500"
                  value={config.businessPhone}
                  onChange={e => updateConfig('businessPhone', e.target.value)}
                  placeholder="042-xxxxxxx"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-500 font-bold uppercase">Tax Label</label>
                <input
                  type="text"
                  className="w-full bg-black border border-slate-800 rounded px-3 py-2 text-sm text-white outline-none focus:border-gold-500"
                  value={config.taxLabel}
                  onChange={e => updateConfig('taxLabel', e.target.value)}
                  placeholder="GST / VAT / Tax"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-500 font-bold uppercase">NTN Number</label>
                <input
                  type="text"
                  className="w-full bg-black border border-slate-800 rounded px-3 py-2 text-sm text-white outline-none focus:border-gold-500"
                  value={config.ntnNumber}
                  onChange={e => updateConfig('ntnNumber', e.target.value)}
                  placeholder="1234567-8"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-500 font-bold uppercase">STRN Number</label>
                <input
                  type="text"
                  className="w-full bg-black border border-slate-800 rounded px-3 py-2 text-sm text-white outline-none focus:border-gold-500"
                  value={config.strnNumber}
                  onChange={e => updateConfig('strnNumber', e.target.value)}
                  placeholder="12-34-5678-901-23"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 font-bold">
            <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-500/50">Receipt Customization</h5>
            <div className="space-y-2 border-l-2 border-white/5 pl-4">
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-slate-300">Show Cashier Name</span>
                <button
                  onClick={() => updateConfig('showCashierName', !config.showCashierName)}
                  className={`w-10 h-5 rounded-full transition-colors ${config.showCashierName ? 'bg-gold-500' : 'bg-slate-800'}`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${config.showCashierName ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-slate-300">Auto-Print on Payment</span>
                <button
                  onClick={() => updateConfig('autoPrintOnPayment', !config.autoPrintOnPayment)}
                  className={`w-10 h-5 rounded-full transition-colors ${config.autoPrintOnPayment ? 'bg-gold-500' : 'bg-slate-800'}`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${config.autoPrintOnPayment ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            <div className="space-y-2 border-l-2 border-white/5 pl-4">
              <label className="text-xs text-slate-500 font-bold uppercase">Receipt Footer Note</label>
              <textarea
                className="w-full bg-black border border-slate-800 rounded px-3 py-2 text-sm text-white outline-none focus:border-gold-500 h-20 resize-none"
                value={config.receiptFooterText}
                onChange={e => updateConfig('receiptFooterText', e.target.value)}
                placeholder="Thank you for dining with us! Visit again soon."
              />
            </div>
          </div>
        </div>

        {/* Printer & Hardware Settings */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-blue-400">
              <Printer size={20} />
            </div>
            <div>
              <h4 className="font-bold text-white">Printer Configuration</h4>
              <p className="text-xs text-slate-500">Set primary thermal printer for receipts and tokens</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-500 font-bold uppercase">Primary Thermal Printer</label>
                <select
                  className="w-full bg-black border border-slate-800 rounded px-3 py-2 text-sm text-white outline-none focus:border-gold-500"
                  value={config.primary_printer}
                  onChange={e => updateConfig('primary_printer', e.target.value)}
                >
                  <option value="Default">System Default</option>
                  {systemPrinters.map((p, idx) => (
                    <option key={idx} value={p.name}>{p.name} {p.isDefault ? '(Default)' : ''}</option>
                  ))}
                  {!systemPrinters.length && config.primary_printer !== 'Default' && (
                    <option value={config.primary_printer}>{config.primary_printer}</option>
                  )}
                </select>
                <p className="text-[10px] text-slate-600 italic">
                  Available printers detected: {systemPrinters.length || 'None (using system default)'}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div className="flex flex-col">
                  <span className="text-sm text-slate-300 font-bold">Show Print Dialog</span>
                  <span className="text-[10px] text-slate-500">Prompt for printer selection each time</span>
                </div>
                <button
                  onClick={() => updateConfig('print_dialog', !config.print_dialog)}
                  className={`w-10 h-5 rounded-full transition-colors ${config.print_dialog ? 'bg-blue-500' : 'bg-slate-800'}`}
                >
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${config.print_dialog ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DANGER ZONE - Admins & Managers */}
      {(currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER') && (
        <div className="bg-red-900/10 border border-red-900/40 rounded-xl p-6">
          <h4 className="font-bold text-red-500 mb-2">Danger Zone</h4>
          <p className="text-xs text-slate-400 mb-4">Irreversible system actions</p>
          <button
            onClick={async () => {
              if (confirm('Are you ABSOLUTELY SURE? This will WIPE ALL DATA (Orders, Customers, Sales). This cannot be undone.')) {
                try {
                  await fetchWithAuth(`${API_BASE_URL}/system/dev-reset`, { method: 'POST' });
                  window.location.reload();
                } catch (e) {
                  alert('Reset failed');
                }
              }
            }}
            className="bg-red-600 text-white px-4 py-2 rounded text-xs font-bold uppercase hover:bg-red-700 transition-all"
          >
            Factory Reset System
          </button>
        </div>
      )}

      {/* Save Button (sticky bottom) */}
      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-gold-500 text-black px-8 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-gold-400 transition-all shadow-xl shadow-gold-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            {isSaving ? 'Saving...' : 'Save All Changes'}
          </button>
        </div>
      )}
    </div>
  );
};