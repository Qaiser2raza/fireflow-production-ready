import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../../client/contexts/AppContext';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';
import { Box, BookOpen, MonitorPlay, Save, Loader2, Link, Zap } from 'lucide-react';

export const FeaturesPanel: React.FC = () => {
    const { currentUser } = useAppContext();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Core feature toggles
    const [features, setFeatures] = useState({
        inventory_enabled: false,
        accounting_enabled: false,
        kds_enabled: true,
        fbr_enabled: false
    });

    useEffect(() => {
        const loadFeatures = async () => {
            try {
                // To avoid making a new endpoint right now, we can fetch the existing config
                // and maybe save it in local component state for demo context if the backend is not built yet.
                // But let's fetch the restaurant details directly!
                const res = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/restaurants/${currentUser?.restaurant_id}`);
                const featureRes = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/operations/features?restaurantId=${currentUser?.restaurant_id}`).catch(() => null);

                let fbr_enabled = false;
                let advanced_features = { inventory_enabled: false, accounting_enabled: false, kds_enabled: true };

                if (res.ok) {
                    const data = await res.json();
                    fbr_enabled = data.fbr_enabled;
                }
                if (featureRes && featureRes.ok) {
                    const featureData = await featureRes.json();
                    if (featureData.features) {
                        advanced_features = { ...advanced_features, ...featureData.features };
                    }
                }

                setFeatures({ ...advanced_features, fbr_enabled });
            } catch (err) {
                console.error("Failed to load features", err);
            } finally {
                setLoading(false);
            }
        };

        if (currentUser?.restaurant_id) loadFeatures();
    }, [currentUser]);

    const handleSave = async () => {
        setSaving(true);
        try {
            // Split saving logic: fbr goes to restaurants, others go to restaurant_features 
            await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/operations/config/${currentUser?.restaurant_id}`, {
                method: 'PATCH',
                body: JSON.stringify({ fbrEnabled: features.fbr_enabled })
            });

            await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/operations/features/${currentUser?.restaurant_id}`, {
                method: 'POST',
                body: JSON.stringify({
                    features: {
                        inventory_enabled: features.inventory_enabled,
                        accounting_enabled: features.accounting_enabled,
                        kds_enabled: features.kds_enabled
                    }
                })
            });

            // Brief success state
            setTimeout(() => setSaving(false), 500);
        } catch (err) {
            console.error(err);
            setSaving(false);
        }
    };

    const toggleFeature = (key: keyof typeof features) => {
        setFeatures(prev => ({ ...prev, [key]: !prev[key] }));
    };

    if (loading) {
        return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-gold-500" /></div>;
    }

    const ModuleCard = ({ id, title, description, icon: Icon, color, isBeta }: any) => {
        const isEnabled = features[id as keyof typeof features];
        return (
            <div className={`p-6 rounded-2xl border-2 transition-all cursor-pointer relative overflow-hidden group ${isEnabled
                    ? `border-${color}-500 bg-${color}-500/10 shadow-[0_0_20px_rgba(0,0,0,0.2)] shadow-${color}-500/20`
                    : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                }`} onClick={() => toggleFeature(id)}>

                {/* Visual accent glow */}
                <div className={`absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 rounded-full bg-${color}-500 opacity-5 blur-3xl transition-opacity group-hover:opacity-20`}></div>

                <div className="flex justify-between items-start mb-4 relative z-10">
                    <div className={`p-3 rounded-xl ${isEnabled ? `bg-${color}-500 text-slate-950` : 'bg-slate-800 text-slate-400'}`}>
                        <Icon size={24} />
                    </div>

                    {/* Toggle Switch UI */}
                    <div className="flex items-center">
                        <div className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out ${isEnabled ? `bg-${color}-500` : 'bg-slate-800'}`}>
                            <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${isEnabled ? 'translate-x-6' : 'translate-x-0'}`}></div>
                        </div>
                    </div>
                </div>

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <h3 className={`text-xl font-black uppercase tracking-widest ${isEnabled ? 'text-white' : 'text-slate-300'}`}>{title}</h3>
                        {isBeta && <span className="text-[9px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full uppercase font-bold tracking-widest">Enterprise</span>}
                    </div>
                    <p className="text-sm text-slate-400 font-medium leading-relaxed">{description}</p>
                </div>

                {isEnabled && (
                    <div className="mt-4 pt-4 border-t border-slate-800/50 flex items-center justify-between relative z-10">
                        <span className={`text-xs font-bold uppercase text-${color}-400 flex items-center gap-1`}>
                            <Zap size={14} /> Module Active
                        </span>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-widest mb-1">Module Store</h2>
                    <p className="text-slate-400 text-sm">Toggle advanced enterprise capabilities for this branch.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-gold-500 hover:bg-gold-400 text-black px-6 py-3 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-gold-500/20 transition-all disabled:opacity-50"
                >
                    {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                    Save Modules
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">

                <ModuleCard
                    id="fbr_enabled"
                    title="FBR POS Integration"
                    description="Real-time fiscal invoice synchronization with the Pakistan Federal Board of Revenue."
                    icon={Link}
                    color="green"
                />

                <ModuleCard
                    id="inventory_enabled"
                    title="Recipe & COGS Engine"
                    description="Track raw materials, generate purchase orders, and monitor food cost % via live recipe depletion."
                    icon={Box}
                    color="indigo"
                    isBeta={true}
                />

                <ModuleCard
                    id="accounting_enabled"
                    title="Double-Entry Ledger"
                    description="Enable a full Chart of Accounts, Journal Entries, and automated shift-closing financial mapping."
                    icon={BookOpen}
                    color="amber"
                    isBeta={true}
                />

                <ModuleCard
                    id="kds_enabled"
                    title="Kitchen Display System"
                    description="Enable real-time digital routing of kitchen prep tickets across multiple cooking stations."
                    icon={MonitorPlay}
                    color="red"
                />

            </div>

            <div className="mt-10 bg-blue-900/10 border border-blue-900/30 rounded-2xl p-6 text-center">
                <p className="text-blue-400/80 text-sm">
                    Disabling active modules will hide their user interfaces but will strictly retain any historical data currently in your database.
                </p>
            </div>
        </div>
    );
};
