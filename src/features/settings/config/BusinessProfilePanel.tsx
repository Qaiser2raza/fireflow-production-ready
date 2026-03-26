
import React, { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../../../client/contexts/AppContext';
import { Save, Loader2, ShieldCheck } from 'lucide-react';
import { cacheSet, cacheGet, isOnline, getOperationsConfigKey, initializeCache } from '../../../lib/offlineCache';
import { createAuditLog } from '../../../lib/auditLog';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';

const API_BASE_URL = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

export const BusinessProfilePanel: React.FC = () => {
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
            // Try cache first
            const cached = await cacheGet<any>('configs', cacheKey);
            if (cached) {
                setConfig(cached);
                setIsLoading(false);
            }

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
                addNotification('success', 'Business profile updated successfully');
                await cacheSet('configs', cacheKey, data.config);
                await createAuditLog({
                    restaurant_id: restaurantId,
                    staff_id: currentUser?.id || '',
                    action_type: 'CONFIG_UPDATE',
                    entity_type: 'RESTAURANT',
                    entity_id: restaurantId,
                    details: { updated_fields: ['business_profile'] }
                });
            }
        } catch (err: any) {
            addNotification('error', err.message);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className="flex items-center gap-2 text-slate-500 p-8"><Loader2 className="animate-spin" /> Loading profile...</div>;

    const inputClass = "w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-white focus:border-gold-500 outline-none transition-colors";
    const labelClass = "text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1";

    return (
        <form onSubmit={handleSave} className="space-y-6 max-w-3xl animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-tighter">Business Profile</h2>
                    <p className="text-slate-500 text-xs">Manage your brand identity and tax registration details</p>
                </div>
                <button
                    type="submit"
                    disabled={isSaving}
                    className="bg-gold-500 hover:bg-gold-400 text-black px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50"
                >
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save Profile
                </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelClass}>Business Name</label>
                    <input
                        required
                        value={config.business_name || ''}
                        onChange={e => setConfig({...config, business_name: e.target.value})}
                        className={inputClass}
                        placeholder="e.g. FireFlow Restaurant"
                    />
                </div>
                <div>
                    <label className={labelClass}>Business Name (Urdu)</label>
                    <input
                        value={config.business_name_urdu || ''}
                        onChange={e => setConfig({...config, business_name_urdu: e.target.value})}
                        className={inputClass + " font-urdu"}
                        placeholder="نام لکھیں"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelClass}>Business Type</label>
                    <select
                        value={config.business_type || 'restaurant'}
                        onChange={e => setConfig({...config, business_type: e.target.value})}
                        className={inputClass}
                    >
                        <option value="restaurant">Restaurant</option>
                        <option value="cafe">Café</option>
                        <option value="hotel">Hotel</option>
                        <option value="takeaway">Takeaway</option>
                        <option value="bakery">Bakery</option>
                    </select>
                </div>
                <div>
                    <label className={labelClass}>Currency</label>
                    <select
                        value={config.currency || 'PKR'}
                        onChange={e => setConfig({...config, currency: e.target.value})}
                        className={inputClass}
                    >
                        <option value="PKR">PKR - Pakistani Rupee</option>
                        <option value="USD">USD - US Dollar</option>
                        <option value="AED">AED - UAE Dirham</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelClass}>Phone Number</label>
                    <input
                        value={config.business_phone || ''}
                        onChange={e => setConfig({...config, business_phone: e.target.value})}
                        className={inputClass}
                        placeholder="0300-1234567"
                    />
                </div>
                <div>
                    <label className={labelClass}>Email Address</label>
                    <input
                        type="email"
                        value={config.business_email || ''}
                        onChange={e => setConfig({...config, business_email: e.target.value})}
                        className={inputClass}
                        placeholder="hello@restaurant.com"
                    />
                </div>
            </div>

            <div>
                <label className={labelClass}>Full Address</label>
                <input
                    value={config.business_address || ''}
                    onChange={e => setConfig({...config, business_address: e.target.value})}
                    className={inputClass}
                    placeholder="Floor, Building, Street..."
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelClass}>City</label>
                    <input
                        value={config.business_city || ''}
                        onChange={e => setConfig({...config, business_city: e.target.value})}
                        className={inputClass}
                        placeholder="Lahore"
                    />
                </div>
                <div>
                    <label className={labelClass}>Area / Locality</label>
                    <input
                        value={config.business_area || ''}
                        onChange={e => setConfig({...config, business_area: e.target.value})}
                        className={inputClass}
                        placeholder="DHA Phase 6"
                    />
                </div>
            </div>

            <div className="pt-4 border-t border-slate-800">
                <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck size={16} className="text-gold-500" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-white">Tax Registration</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className={labelClass}>NTN Number</label>
                        <input
                            value={config.ntn_number || ''}
                            onChange={e => setConfig({...config, ntn_number: e.target.value})}
                            className={inputClass}
                            placeholder="1234567-8"
                        />
                    </div>
                    <div>
                        <label className={labelClass}>STRN Number</label>
                        <input
                            value={config.strn_number || ''}
                            onChange={e => setConfig({...config, strn_number: e.target.value})}
                            className={inputClass}
                            placeholder="12-34-5678-901-23"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                    <input
                        type="checkbox"
                        checked={config.is_fbr_registered || config.fbrEnabled || false}
                        onChange={e => setConfig({...config, is_fbr_registered: e.target.checked, fbrEnabled: e.target.checked})}
                        className="size-5 accent-gold-500"
                        id="is_fbr_registered"
                    />
                    <div>
                        <label htmlFor="is_fbr_registered" className="text-sm font-bold text-white cursor-pointer block">FBR Registered Business</label>
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Enable FBR sync for all invoices</p>
                    </div>
                </div>

                {(config.is_fbr_registered || config.fbrEnabled) && (
                    <div className="mt-4 animate-in slide-in-from-top-2 grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>FBR POS Number</label>
                            <input
                                value={config.fbr_pos_number || config.fbrPosId || ''}
                                onChange={e => setConfig({...config, fbr_pos_number: e.target.value, fbrPosId: e.target.value})}
                                className={inputClass}
                                placeholder="Enter 12-digit POS identifier"
                            />
                        </div>
                        <div>
                            <label className={labelClass}>IMS API URL (Optional)</label>
                            <input
                                value={config.fbr_ims_url || config.fbrImsUrl || ''}
                                onChange={e => setConfig({...config, fbr_ims_url: e.target.value, fbrImsUrl: e.target.value})}
                                className={inputClass}
                                placeholder="https://ims.fbr.gov.pk/..."
                            />
                        </div>
                    </div>
                )}
            </div>
        </form>
    );
};
