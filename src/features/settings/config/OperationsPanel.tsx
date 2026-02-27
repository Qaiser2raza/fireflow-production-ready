// ==========================================
// OPERATIONS PANEL (FINAL CORRECTED VERSION)
// ==========================================
// Location: src/features/settings/config/OperationsPanel.tsx
// Fixed: Import paths + TypeScript types

import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../../../client/contexts/AppContext';
import { Save, Banknote, Percent, Users, Truck, Loader2, WifiOff } from 'lucide-react';

// Import from src/lib/ (NOT src/shared/lib/)
import { cacheSet, cacheGet, isOnline, getOperationsConfigKey, initializeCache } from '../../../lib/offlineCache';
import { createAuditLog } from '../../../lib/auditLog';
import { fetchJSONWithRetry } from '../../../lib/fetchRetry';

// API base URL for backend requests
const API_BASE_URL = `http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:3001/api`;

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
  enableTableMerging: false
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
    enableTableMerging: Boolean(data.enableTableMerging)
  };
}

export const OperationsPanel: React.FC = () => {
  const { currentUser, addNotification, socket } = useAppContext();
  const [config, setConfig] = useState<OperationsConfig>(DEFAULT_CONFIG);
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(!isOnline());

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
          addNotification('info', 'Loaded offline configuration');
          setIsLoading(false);
          return;
        }
      }

      // Fetch from API (will return defaults)
      const data = await fetchJSONWithRetry<ConfigResponse>(
        `${API_BASE_URL}/operations/config/${restaurantId}`,
        undefined,
        {
          retries: 3,
          onRetry: (attempt) => {
            console.log(`Retrying config fetch (attempt ${attempt})...`);
          }
        }
      );

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

      // Try to notify backend (best effort, don't fail if it errors)
      try {
        await fetch(`${API_BASE_URL}/operations/config/${restaurantId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
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
                    value={config.taxRate}
                    onChange={e => updateConfig('taxRate', Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
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
                    value={config.serviceChargeRate}
                    onChange={e => updateConfig('serviceChargeRate', Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
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
                  value={config.defaultDeliveryFee}
                  onChange={e => updateConfig('defaultDeliveryFee', Math.max(0, Number(e.target.value) || 0))}
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
                  value={config.defaultRiderFloat}
                  onChange={e => updateConfig('defaultRiderFloat', Math.max(0, Number(e.target.value) || 0))}
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
              value={config.defaultGuestCount}
              onChange={e => updateConfig('defaultGuestCount', Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              min="1"
              max="20"
              aria-label="Default guest count"
            />
            <p className="text-xs text-slate-500 mt-1">
              Pre-filled when seating guests at a table
            </p>
          </div>
        </div>

        {/* Floor Management Settings */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-orange-500">
              <Users size={20} />
            </div>
            <div>
              <h4 className="font-bold text-white">Floor Management</h4>
              <p className="text-xs text-slate-500">Seating rules and capacity</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Allow Over-Capacity */}
            <div className="flex items-center justify-between">
              <div>
                <label htmlFor="allow-over-capacity" className="text-sm text-slate-300 font-medium">Allow Over-Capacity Seating</label>
                <p className="text-xs text-slate-500">Permit seating more guests than table capacity (logs warning)</p>
              </div>
              <button
                id="allow-over-capacity"
                onClick={() => updateConfig('allowOverCapacity', !config.allowOverCapacity)}
                className={`w-14 h-7 rounded-full transition-colors ${config.allowOverCapacity ? 'bg-orange-600' : 'bg-slate-700'
                  }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${config.allowOverCapacity ? 'translate-x-8' : 'translate-x-1'
                  }`} />
              </button>
            </div>

            {/* Max Over Capacity */}
            {config.allowOverCapacity && (
              <div>
                <label htmlFor="max-over" className="text-xs text-slate-500 mb-2 block uppercase font-bold">
                  Maximum Extra Guests
                </label>
                <div className="relative">
                  <input
                    id="max-over"
                    type="number"
                    className="w-full bg-black border border-slate-700 rounded px-3 py-2 text-white outline-none focus:border-gold-500"
                    value={config.maxOverCapacityGuests}
                    onChange={e => updateConfig('maxOverCapacityGuests', Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                    min="1"
                    max="10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">Guests</span>
                </div>
              </div>
            )}

            {/* Table Merging */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <div>
                <label htmlFor="merge-tables" className="text-sm text-slate-300 font-medium">Enable Table Merging</label>
                <p className="text-xs text-slate-500">Allow combining tables for large parties (Experimental)</p>
              </div>
              <button
                id="merge-tables"
                onClick={() => updateConfig('enableTableMerging', !config.enableTableMerging)}
                className={`w-14 h-7 rounded-full transition-colors ${config.enableTableMerging ? 'bg-blue-600' : 'bg-slate-700'
                  }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${config.enableTableMerging ? 'translate-x-8' : 'translate-x-1'
                  }`} />
              </button>
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
                    await fetch(`${API_BASE_URL}/system/dev-reset`, { method: 'POST' });
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
    </div>
  );
};