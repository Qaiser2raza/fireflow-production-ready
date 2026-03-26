
import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../../../client/contexts/AppContext';
import { Save, Loader2, Printer } from 'lucide-react';
import { cacheSet, cacheGet, isOnline, getOperationsConfigKey, initializeCache } from '../../../lib/offlineCache';
import { createAuditLog } from '../../../lib/auditLog';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';

const API_BASE_URL = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

export const ReceiptSetupPanel: React.FC = () => {
    const { currentUser, addNotification, socket } = useAppContext();
    const [config, setConfig] = useState<any>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const restaurantId = currentUser?.restaurant_id;
    const cacheKey = restaurantId ? getOperationsConfigKey(restaurantId) : '';

    const loadConfig = useCallback(async () => {
        if (!restaurantId) return;
        setIsLoading(true);
        try {
            const cached = await cacheGet<any>('configs', cacheKey);
            if (cached) setConfig(cached);

            if (isOnline()) {
                const response = await fetchWithAuth(`${API_BASE_URL}/operations/config/${restaurantId}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.config) {
                        setConfig(data.config);
                        await cacheSet('configs', cacheKey, data.config);
                    }
                }
            }
        } catch (err) {
            console.error('Load config error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [restaurantId, cacheKey]);

    useEffect(() => {
        loadConfig();
        initializeCache();
        const handleUpdate = (data: any) => {
            if (data.restaurantId === restaurantId) {
                setConfig(data.config);
                cacheSet('configs', cacheKey, data.config);
            }
        };
        socket?.on('config:updated', handleUpdate);
        return () => { socket?.off('config:updated', handleUpdate); };
    }, [loadConfig, restaurantId, cacheKey, socket]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!restaurantId) return;

        setIsSaving(true);
        try {
            const response = await fetchWithAuth(`${API_BASE_URL}/operations/config/${restaurantId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            if (!response.ok) throw new Error('Failed to save configuration');

            const data = await response.json();
            if (data.success) {
                addNotification('success', 'Receipt settings updated');
                await cacheSet('configs', cacheKey, data.config);
                await createAuditLog({
                    restaurant_id: restaurantId,
                    staff_id: currentUser?.id || '',
                    action_type: 'CONFIG_UPDATE',
                    entity_type: 'RESTAURANT',
                    entity_id: restaurantId,
                    details: { updated_fields: ['receipt_setup'] }
                });
            }
        } catch (err: any) {
            addNotification('error', err.message);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className="flex items-center gap-2 text-slate-500 p-8"><Loader2 className="animate-spin" /> Loading setup...</div>;

    const inputClass = "w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-white focus:border-gold-500 outline-none transition-colors";
    const labelClass = "text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1";
    const toggleRowClass = "flex items-center justify-between p-4 bg-slate-900/30 border border-slate-800 rounded-xl hover:bg-slate-900/50 transition-colors";

    return (
        <form onSubmit={handleSave} className="space-y-6 max-w-3xl animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-tighter">Receipt Configuration</h2>
                    <p className="text-slate-500 text-xs">Customize your printed invoice layout and brand presentation</p>
                </div>
                <button
                    type="submit"
                    disabled={isSaving}
                    className="bg-gold-500 hover:bg-gold-400 text-black px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-gold-500/10"
                >
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save Settings
                </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelClass}>Header Line 1 (Business Name)</label>
                    <input
                        value={config.receipt_header_1 || ''}
                        onChange={e => setConfig({...config, receipt_header_1: e.target.value})}
                        className={inputClass}
                        placeholder="e.g. THE CAFE HUB"
                    />
                </div>
                <div>
                    <label className={labelClass}>Header Line 2 (Tagline / Phone)</label>
                    <input
                        value={config.receipt_header_2 || ''}
                        onChange={e => setConfig({...config, receipt_header_2: e.target.value})}
                        className={inputClass}
                        placeholder="e.g. Est. 2024 | 0300-1234567"
                    />
                </div>
            </div>

            <div>
                <label className={labelClass}>Footer Message</label>
                <textarea
                    rows={2}
                    value={config.receipt_footer || ''}
                    onChange={e => setConfig({...config, receipt_footer: e.target.value})}
                    className={inputClass + " resize-none"}
                    placeholder="e.g. Valid for 24h. Thank you for dining with us!"
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelClass}>WiFi Password (Optional)</label>
                    <input
                        value={config.receipt_wifi_password || ''}
                        onChange={e => setConfig({...config, receipt_wifi_password: e.target.value})}
                        className={inputClass}
                        placeholder="fireflow123"
                    />
                </div>
                <div>
                    <label className={labelClass}>Invoice Prefix</label>
                    <input
                        value={config.invoice_prefix || 'INV-'}
                        onChange={e => setConfig({...config, invoice_prefix: e.target.value})}
                        className={inputClass}
                        placeholder="INV-"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelClass}>Tax Label</label>
                    <select
                        value={config.tax_label || 'GST'}
                        onChange={e => setConfig({...config, tax_label: e.target.value})}
                        className={inputClass}
                    >
                        <option value="GST">GST (General Sales Tax)</option>
                        <option value="VAT">VAT (Value Added Tax)</option>
                        <option value="Tax">Sales Tax</option>
                        <option value="Service Tax">Service Tax</option>
                    </select>
                </div>
            </div>

            <div className="pt-4 border-t border-slate-800 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                    <Printer size={16} className="text-gold-500" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-white">Print Behaviour</h3>
                </div>

                <div className={toggleRowClass}>
                    <div>
                        <h4 className="text-sm font-bold text-white">Auto-Print Receipt</h4>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Trigger print immediately on payment success</p>
                    </div>
                    <input
                        type="checkbox"
                        checked={config.auto_print_receipt ?? true}
                        onChange={e => setConfig({...config, auto_print_receipt: e.target.checked})}
                        className="size-5 accent-gold-500 cursor-pointer"
                    />
                </div>

                <div className={toggleRowClass}>
                    <div>
                        <h4 className="text-sm font-bold text-white">Show Print Dialog</h4>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Always ask before printing (overrides auto-print)</p>
                    </div>
                    <input
                        type="checkbox"
                        checked={config.show_print_dialog ?? false}
                        onChange={e => setConfig({...config, show_print_dialog: e.target.checked})}
                        className="size-5 accent-gold-500 cursor-pointer"
                    />
                </div>

                <div className={toggleRowClass}>
                    <div>
                        <h4 className="text-sm font-bold text-white">Show Cashier Name</h4>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Print the name of the logged-in cashier on receipts</p>
                    </div>
                    <input
                        type="checkbox"
                        checked={config.show_cashier_name || config.showCashierName || false}
                        onChange={e => setConfig({...config, show_cashier_name: e.target.checked, showCashierName: e.target.checked})}
                        className="size-5 accent-gold-500 cursor-pointer"
                    />
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
                    <div className="flex items-center gap-2">
                        <Printer size={14} className="text-indigo-400" />
                        <h4 className="text-sm font-bold text-white uppercase tracking-tighter">Local System Printer</h4>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className={labelClass}>Primary Printer Name</label>
                            <input
                                value={config.primary_printer || config.primaryPrinter || 'Default'}
                                onChange={e => setConfig({...config, primary_printer: e.target.value, primaryPrinter: e.target.value})}
                                className={inputClass}
                                placeholder="e.g. POS-80, Thermal Printer"
                            />
                            <p className="text-[9px] text-slate-500 mt-1 uppercase font-bold tracking-tight">Exact name as shown in Windows Control Panel</p>
                        </div>
                        <div className="flex items-center justify-between p-2 pt-0">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none">Diagnostic: Global Print Lock Status</span>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${config.show_print_dialog ? 'text-amber-500' : 'text-emerald-500'}`}>
                                {config.show_print_dialog ? 'Dialog Active' : 'Auto-Pass Through'}
                            </span>
                        </div>
                    </div>
                </div>
                <div className={toggleRowClass}>
                    <div>
                        <h4 className="text-sm font-bold text-white">Auto-Print KOT</h4>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Push ticket to kitchen as soon as order is fired</p>
                    </div>
                    <input
                        type="checkbox"
                        checked={config.auto_print_kot ?? true}
                        onChange={e => setConfig({...config, auto_print_kot: e.target.checked})}
                        className="size-5 accent-gold-500 cursor-pointer"
                    />
                </div>
            </div>
        </form>
    );
};
