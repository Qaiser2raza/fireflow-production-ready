
import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../../../client/contexts/AppContext';
import { Save, Loader2, CheckCircle2, Eye } from 'lucide-react';
import { cacheSet, cacheGet, isOnline, getOperationsConfigKey, initializeCache } from '../../../lib/offlineCache';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';

import { generateInvoiceHtml } from '../../../shared/lib/invoiceTemplates';

const API_BASE_URL = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

// Mock Data for Preview
const MOCK_DATA = {
    order: {
        order_number: 'INV-2026-001',
        type: 'DINE_IN',
        created_at: new Date('2026-03-14T09:24:00'),
        table: { name: 'Table 12' }
    },
    items: [
        { quantity: 2, item_name: 'Chicken Burger', unit_price: 600, total_price: 1200 },
        { quantity: 1, item_name: 'Club Sandwich', unit_price: 550, total_price: 550 },
        { quantity: 3, item_name: 'Fresh Lime', unit_price: 120, total_price: 360 }
    ],
    breakdown: {
        subtotal: 2110,
        tax: 337.6,
        total: 2447.6,
        discount: 0,
        serviceCharge: 0,
        deliveryFee: 0
    },
    isPaid: true,
    paymentMethod: 'CASH'
};

const TEMPLATES = [
// ... existing templates ...
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

    const previewHtml = generateInvoiceHtml(selectedId, {
        config: { ...config, ...operationsConfig },
        ...MOCK_DATA
    });

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
                    
                    {/* Receipt Mock Rendered via Utility */}
                    <div className="w-[340px] h-[500px] bg-white rounded-lg overflow-hidden shadow-2xl">
                        <iframe 
                            title="Receipt Preview"
                            srcDoc={previewHtml}
                            className="w-full h-full border-none"
                        />
                    </div>
                    
                    <p className="mt-8 text-slate-500 text-[10px] font-bold uppercase tracking-widest text-center max-w-xs">
                        This preview adjusts based on your Company and Receipt settings.
                    </p>
                </div>
            </div>
        </div>
    );
};

