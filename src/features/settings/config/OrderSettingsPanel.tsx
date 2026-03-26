import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../../../client/contexts/AppContext';
import { Save, Percent, Banknote, Truck, Loader2, Utensils, ShoppingBag, Bike, ShieldCheck, Users } from 'lucide-react';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';

const API_BASE_URL = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

interface OrderTypeSettings {
  tax_enabled: boolean;
  default_tax_rate: number;
  tax_inclusive: boolean;
  service_charge_enabled: boolean;
  default_service_charge_rate: number;
  discount_enabled: boolean;
  default_discount_value: number;
  discount_type: 'flat' | 'percent';
  delivery_fee_enabled?: boolean;
  default_delivery_fee?: number;
}

interface OrderDefaults {
  DINE_IN: OrderTypeSettings;
  TAKEAWAY: OrderTypeSettings;
  DELIVERY: OrderTypeSettings;
}

const DEFAULT_SETTINGS: OrderDefaults = {
  DINE_IN: {
    tax_enabled: true,
    default_tax_rate: 16,
    tax_inclusive: false,
    service_charge_enabled: true,
    default_service_charge_rate: 5,
    discount_enabled: true,
    default_discount_value: 0,
    discount_type: 'flat'
  },
  TAKEAWAY: {
    tax_enabled: true,
    default_tax_rate: 16,
    tax_inclusive: false,
    service_charge_enabled: false,
    default_service_charge_rate: 0,
    discount_enabled: true,
    default_discount_value: 0,
    discount_type: 'flat'
  },
  DELIVERY: {
    tax_enabled: true,
    default_tax_rate: 16,
    tax_inclusive: false,
    service_charge_enabled: false,
    default_service_charge_rate: 0,
    discount_enabled: true,
    default_discount_value: 0,
    discount_type: 'flat',
    delivery_fee_enabled: true,
    default_delivery_fee: 250
  }
};

export const OrderSettingsPanel: React.FC = () => {
  const { currentUser, operationsConfig, addNotification, fetchInitialData } = useAppContext();
  const [settings, setSettings] = useState<OrderDefaults>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Operational Defaults
  const [guestCount, setGuestCount] = useState<number>(2);
  const [riderFloat, setRiderFloat] = useState<number>(5000);

  const restaurantId = currentUser?.restaurant_id;

  const loadSettings = useCallback(async () => {
    if (!restaurantId) return;
    setIsLoading(true);
    try {
      // Use the new order_type_defaults field from operationsConfig if available
      if (operationsConfig?.order_type_defaults) {
        setSettings({
            ...DEFAULT_SETTINGS,
            ...operationsConfig.order_type_defaults
        });
        setGuestCount(operationsConfig.default_guest_count || operationsConfig.defaultGuestCount || 2);
        setRiderFloat(operationsConfig.default_rider_float || operationsConfig.defaultRiderFloat || 5000);
      } else {
        // Fallback: Fetch directly from features API
        const response = await fetchWithAuth(`${API_BASE_URL}/operations/features/${restaurantId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.features?.order_type_defaults) {
            setSettings({
                ...DEFAULT_SETTINGS,
                ...data.features.order_type_defaults
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to load order settings:', error);
      addNotification('error', 'Failed to load order defaults');
    } finally {
      setIsLoading(false);
    }
  }, [restaurantId, operationsConfig, addNotification]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSection = (type: keyof OrderDefaults, key: keyof OrderTypeSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [key]: value
      }
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!restaurantId) return;
    setIsSaving(true);
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/operations/order-settings`, {
        method: 'PATCH',
        body: JSON.stringify({ 
            settings,
            default_guest_count: guestCount,
            default_rider_float: riderFloat
        })
      });

      if (response.ok) {
        addNotification('success', 'Order defaults saved successfully');
        setHasChanges(false);
        // Refresh global config so POS picks it up
        await fetchInitialData();
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Save error:', error);
      addNotification('error', 'Failed to save order defaults');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-gold-500" size={40} />
      </div>
    );
  }

  const sections = [
    { id: 'DINE_IN' as const, label: 'Dine In', icon: Utensils, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { id: 'TAKEAWAY' as const, label: 'Takeaway', icon: ShoppingBag, color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { id: 'DELIVERY' as const, label: 'Delivery', icon: Bike, color: 'text-purple-500', bg: 'bg-purple-500/10' }
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-xl font-black text-white uppercase tracking-tighter">Order Type Defaults</h3>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
            Presets for financial logic per order mode
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${
            hasChanges 
              ? 'bg-gold-500 text-black hover:bg-gold-400 shadow-lg shadow-gold-500/20' 
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {sections.map((section) => (
          <div key={section.id} className="glass-panel border-slate-800/50 overflow-hidden flex flex-col">
            {/* Header */}
            <div className={`p-4 border-b border-slate-800/50 flex items-center gap-3 ${section.bg}`}>
              <div className={`p-2 rounded-lg bg-slate-900/50 ${section.color}`}>
                <section.icon size={20} />
              </div>
              <h4 className="font-black text-white uppercase tracking-tighter">{section.label} Mode</h4>
            </div>

            {/* Content */}
            <div className="p-5 space-y-6 flex-1">
              {/* Tax Toggle */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                    <Percent size={14} className="text-green-500" />
                    <span>Auto-apply Tax</span>
                  </div>
                  <button
                    onClick={() => updateSection(section.id, 'tax_enabled', !settings[section.id].tax_enabled)}
                    className={`w-10 h-5 rounded-full transition-all relative ${settings[section.id].tax_enabled ? 'bg-green-600' : 'bg-slate-800'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${settings[section.id].tax_enabled ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>
                {settings[section.id].tax_enabled && (
                  <div className="bg-black/40 p-3 rounded-xl border border-slate-800/50 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-[10px] text-slate-500 uppercase font-black">Default Rate</span>
                        <div className="relative w-24">
                            <input
                                type="number"
                                value={settings[section.id].default_tax_rate}
                                onChange={(e) => updateSection(section.id, 'default_tax_rate', Number(e.target.value))}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white text-right outline-none focus:border-green-500"
                            />
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">%</span>
                        </div>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500 uppercase font-black text-left">Inclusive Tax</span>
                        <button
                            onClick={() => updateSection(section.id, 'tax_inclusive', !settings[section.id].tax_inclusive)}
                            className={`px-3 py-1 rounded-md text-[9px] font-black uppercase transition-all ${
                                settings[section.id].tax_inclusive ? 'bg-green-500/20 text-green-500 border border-green-500/30' : 'bg-slate-800 text-slate-500 border border-transparent'
                            }`}
                        >
                            {settings[section.id].tax_inclusive ? 'Inclusive' : 'Exclusive'}
                        </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Service Charge Toggle */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                    <Banknote size={14} className="text-blue-500" />
                    <span>Service Charge</span>
                  </div>
                  <button
                    onClick={() => updateSection(section.id, 'service_charge_enabled', !settings[section.id].service_charge_enabled)}
                    className={`w-10 h-5 rounded-full transition-all relative ${settings[section.id].service_charge_enabled ? 'bg-blue-600' : 'bg-slate-800'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${settings[section.id].service_charge_enabled ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>
                {settings[section.id].service_charge_enabled && (
                  <div className="bg-black/40 p-3 rounded-xl border border-slate-800/50">
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-[10px] text-slate-500 uppercase font-black">S.C. Rate (%)</span>
                        <div className="relative w-24">
                            <input
                                type="number"
                                value={settings[section.id].default_service_charge_rate}
                                onChange={(e) => updateSection(section.id, 'default_service_charge_rate', Number(e.target.value))}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white text-right outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Discount Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                  <ShieldCheck size={14} className="text-gold-500" />
                  <span>Default Discount</span>
                </div>
                <div className="bg-black/40 p-3 rounded-xl border border-slate-800/50 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                      <select 
                        value={settings[section.id].discount_type}
                        onChange={(e) => updateSection(section.id, 'discount_type', e.target.value)}
                        className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[10px] text-white outline-none font-bold uppercase"
                      >
                        <option value="flat">Flat Amount</option>
                        <option value="percent">Percentage</option>
                      </select>
                      <input
                          type="number"
                          value={settings[section.id].default_discount_value}
                          onChange={(e) => updateSection(section.id, 'default_discount_value', Number(e.target.value))}
                          className="w-20 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white text-right outline-none focus:border-gold-500"
                          placeholder="0"
                      />
                  </div>
                </div>
              </div>

              {/* Delivery Fee (Delivery Only) */}
              {section.id === 'DELIVERY' && (
                <div className="space-y-3 pt-4 border-t border-slate-800/50">
                   <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                        <Truck size={14} className="text-purple-500" />
                        <span>Delivery Fee</span>
                    </div>
                    <button
                        onClick={() => updateSection('DELIVERY', 'delivery_fee_enabled', !settings.DELIVERY.delivery_fee_enabled)}
                        className={`w-10 h-5 rounded-full transition-all relative ${settings.DELIVERY.delivery_fee_enabled ? 'bg-purple-600' : 'bg-slate-800'}`}
                    >
                        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${settings.DELIVERY.delivery_fee_enabled ? 'right-1' : 'left-1'}`} />
                    </button>
                    </div>
                    {settings.DELIVERY.delivery_fee_enabled && (
                    <div className="bg-black/40 p-3 rounded-xl border border-slate-800/50">
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-[10px] text-slate-500 uppercase font-black text-left">Fee Amount (Rs)</span>
                            <input
                                type="number"
                                value={settings.DELIVERY.default_delivery_fee}
                                onChange={(e) => updateSection('DELIVERY', 'default_delivery_fee', Number(e.target.value))}
                                className="w-24 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white text-right outline-none focus:border-purple-500"
                            />
                        </div>
                    </div>
                    )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
              <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gold-500/10 flex items-center justify-center text-gold-500">
                      <ShieldCheck size={16} />
                  </div>
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-white">Enterprise Policy</h5>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                  These settings define the initial state of the bill when an order type is selected. Cashiers can still manually override these values in the POS if permitted by their role permissions. Taxes and Service charges are applied to the net subtotal after discounts.
              </p>
          </div>

          <div className="space-y-4 pt-4 md:pt-0 md:border-l md:border-slate-800 md:pl-8">
              <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                      <Users size={16} />
                  </div>
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-white">Operational Defaults</h5>
              </div>
                  <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-1">Default Guest Count</label>
                      <input 
                        type="number"
                        value={guestCount}
                        onChange={(e) => {
                            setGuestCount(Number(e.target.value));
                            setHasChanges(true);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-blue-500"
                      />
                  </div>
                  <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-1">Rider Float (Rs)</label>
                      <input 
                        type="number"
                        value={riderFloat}
                        onChange={(e) => {
                            setRiderFloat(Number(e.target.value));
                            setHasChanges(true);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-purple-500"
                      />
                  </div>
          </div>
      </div>
    </div>
  );
};
