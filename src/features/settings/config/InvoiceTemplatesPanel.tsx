
import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../../../client/contexts/AppContext';
import { Save, Loader2, CheckCircle2, Eye } from 'lucide-react';
import { cacheSet, cacheGet, isOnline, getOperationsConfigKey, initializeCache } from '../../../lib/offlineCache';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';

const API_BASE_URL = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

const TEMPLATES = [
    { id: 'minimal', name: 'Minimalist', description: 'Clean, no borders, focus on text' },
    { id: 'modern', name: 'Modern Sans', description: 'Bold headers, Inter font, compact' },
    { id: 'classic', name: 'Classic Dot Matrix', description: 'Standard receipt look with dashed dividers' },
    { id: 'urdu-optimized', name: 'Urdu Optimized', description: 'Better alignment for Nasta\'liq script' },
];

export const InvoiceTemplatesPanel: React.FC = () => {
    const { currentUser, addNotification, operationsConfig } = useAppContext();
    const [config, setConfig] = useState<any>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedId, setSelectedId] = useState('classic');

    const restaurantId = currentUser?.restaurant_id;
    const cacheKey = restaurantId ? getOperationsConfigKey(restaurantId) : '';

    const loadConfig = useCallback(async () => {
        if (!restaurantId) return;
        setIsLoading(true);
        try {
            const cached = await cacheGet<any>('configs', cacheKey);
            if (cached) {
                setConfig(cached);
                setSelectedId(cached.invoice_templates || 'classic');
            }

            if (isOnline()) {
                const response = await fetchWithAuth(`${API_BASE_URL}/operations/config/${restaurantId}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.config) {
                        setConfig(data.config);
                        setSelectedId(data.config.invoice_templates || 'classic');
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
    }, [loadConfig]);

    const handleSave = async () => {
        if (!restaurantId) return;
        setIsSaving(true);
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/operations/config/${restaurantId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...config, invoice_templates: selectedId })
            });

            if (!res.ok) throw new Error('Failed to save template selection');
            
            addNotification('success', `Template '${selectedId}' activated`);
            await cacheSet('configs', cacheKey, { ...config, invoice_templates: selectedId });
        } catch (err: any) {
            addNotification('error', err.message);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className="p-8 text-slate-500 flex items-center gap-2"><Loader2 className="animate-spin" /> Loading templates...</div>;

    return (
        <div className="space-y-6 max-w-5xl animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-tighter">Invoice Templates</h2>
                    <p className="text-slate-500 text-xs">Choose the visual style for your printed thermal receipts</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-gold-500 hover:bg-gold-400 text-black px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50"
                >
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Activate Template
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Selection Grid */}
                <div className="lg:col-span-1 space-y-4">
                    {TEMPLATES.map(t => (
                        <div 
                            key={t.id}
                            onClick={() => setSelectedId(t.id)}
                            className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                                selectedId === t.id 
                                    ? 'bg-slate-900 border-gold-500 shadow-xl shadow-gold-500/5' 
                                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${selectedId === t.id ? 'text-gold-500' : 'text-slate-500'}`}>
                                    {t.id}
                                </span>
                                {selectedId === t.id && <CheckCircle2 size={14} className="text-gold-500" />}
                            </div>
                            <h3 className="text-white font-bold text-sm mb-1">{t.name}</h3>
                            <p className="text-slate-500 text-[10px] leading-relaxed uppercase font-bold tracking-tight">{t.description}</p>
                        </div>
                    ))}
                </div>

                {/* Preview Panel */}
                <div className="lg:col-span-2 bg-slate-900/40 rounded-3xl border border-slate-800 p-8 flex flex-col items-center">
                    <div className="flex items-center gap-2 mb-6 text-slate-500 uppercase font-black text-[10px] tracking-widest">
                        <Eye size={14} /> LIVE PREVIEW (80mm Thermal)
                    </div>
                    
                    {/* Receipt Mock */}
                    <div className="w-[300px] bg-white text-black p-6 shadow-2xl font-mono text-[11px] leading-tight">
                        <div className="text-center mb-4">
                            <h4 className="font-bold text-sm uppercase">{config.receipt_header_1 || config.business_name || operationsConfig?.business_name || 'FIREFLOW POS'}</h4>
                            <p className="text-[9px]">{config.receipt_header_2 || '123 Street Name, City'}</p>
                            <div className="my-2 border-b border-black border-dashed" />
                        </div>
                        
                        <div className="flex justify-between mb-1">
                            <span>INV-2026-001</span>
                            <span>14/03/2026 09:24</span>
                        </div>
                        <div className="flex justify-between mb-4">
                            <span>Table: 12</span>
                            <span>Server: Admin</span>
                        </div>
                        
                        <div className="border-b border-black border-dashed mb-2" />
                        
                        <div className="space-y-1 mb-4">
                            <div className="flex justify-between">
                                <span>2x Chicken Burger</span>
                                <span>1,200.00</span>
                            </div>
                            <div className="flex justify-between">
                                <span>1x Club Sandwich</span>
                                <span>550.00</span>
                            </div>
                            <div className="flex justify-between">
                                <span>3x Fresh Lime</span>
                                <span>360.00</span>
                            </div>
                        </div>
                        
                        <div className="border-b border-black border-dashed mb-2" />
                        
                        <div className="space-y-1">
                            <div className="flex justify-between font-bold">
                                <span className="uppercase">Subtotal</span>
                                <span>2,110.00</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="uppercase">{config.tax_label || 'GST'} (16%)</span>
                                <span>337.60</span>
                            </div>
                            <div className="flex justify-between text-base font-black mt-2 pt-2 border-t border-black">
                                <span className="uppercase">Total Amount</span>
                                <span>2,447.60</span>
                            </div>
                        </div>
                        
                        <div className="text-center mt-8 space-y-2">
                            <div className="border-b border-black border-dashed" />
                            <p className="text-[9px] uppercase font-bold">*** CUSTOMER COPY ***</p>
                            <p className="text-[10px] italic">{config.receipt_footer || 'Thank you!'}</p>
                            {config.receipt_wifi_password && (
                                <p className="text-[9px]">WiFi: {config.receipt_wifi_password}</p>
                            )}
                        </div>
                    </div>
                    
                    <p className="mt-8 text-slate-500 text-[10px] font-bold uppercase tracking-widest text-center max-w-xs">
                        This preview adjusts based on your Company and Receipt settings.
                    </p>
                </div>
            </div>
        </div>
    );
};
