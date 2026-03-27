import React, { useState } from 'react';
import { useAppContext } from '../../../client/contexts/AppContext';
import { Plus, Save, X, Map, Loader2 } from 'lucide-react';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';

const API_BASE_URL = (typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api');

export const ZonesPanel: React.FC = () => {
    const { sections, addSection, operationsConfig, currentUser, addNotification, fetchInitialData } = useAppContext();
    const [isAdding, setIsAdding] = useState(false);
    const [newSectionName, setNewSectionName] = useState('');
    const [newSectionPrefix, setNewSectionPrefix] = useState('T');

    // Policy Local State
    const [policies, setPolicies] = useState({
        force_table_available: operationsConfig?.force_table_available ?? false,
        allow_over_capacity: operationsConfig?.allow_over_capacity ?? true,
        allow_table_merging: operationsConfig?.allow_table_merging ?? false
    });
    const [isSavingPolicies, setIsSavingPolicies] = useState(false);
    const [hasPolicyChanges, setHasPolicyChanges] = useState(false);

    const updatePolicy = (key: string, value: boolean) => {
        setPolicies(prev => ({ ...prev, [key]: value }));
        setHasPolicyChanges(true);
    };

    const handleSavePolicies = async () => {
        if (!currentUser?.restaurant_id) return;
        setIsSavingPolicies(true);
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/operations/config/${currentUser.restaurant_id}`, {
                method: 'PATCH',
                body: JSON.stringify(policies)
            });

            if (res.ok) {
                addNotification('success', 'Floor management policies updated');
                setHasPolicyChanges(false);
                await fetchInitialData();
            } else {
                throw new Error('Save failed');
            }
        } catch (e) {
            addNotification('error', 'Failed to save policies');
        } finally {
            setIsSavingPolicies(false);
        }
    };

    const handleAdd = async () => {
        if (!newSectionName) return;
        await addSection({ name: newSectionName, prefix: newSectionPrefix, priority: sections.length + 1 });
        setIsAdding(false);
        setNewSectionName('');
        setNewSectionPrefix('T');
    };



    return (
        <div className="text-slate-200">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Zones & Sections</h3>
                <button
                    onClick={() => setIsAdding(true)}
                    className="bg-gold-500 text-black px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-gold-400"
                >
                    <Plus size={18} /> Add Zone
                </button>
            </div>

            {isAdding && (
                <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl mb-6 animate-in slide-in-from-top-2">
                    <h4 className="font-bold mb-4 text-sm uppercase tracking-widest text-gold-500">New Zone Details</h4>
                    <div className="flex gap-4 items-end">
                        <div className="flex-1">
                            <label className="text-xs text-slate-500 mb-1 block">Zone Name</label>
                            <input
                                className="w-full bg-black border border-slate-700 rounded px-3 py-2 text-white outline-none focus:border-gold-500"
                                value={newSectionName}
                                onChange={e => setNewSectionName(e.target.value)}
                                placeholder="e.g. Main Hall, Patio"
                            />
                        </div>
                        <div className="w-24">
                            <label className="text-xs text-slate-500 mb-1 block">Prefix</label>
                            <input
                                className="w-full bg-black border border-slate-700 rounded px-3 py-2 text-white outline-none focus:border-gold-500"
                                value={newSectionPrefix}
                                onChange={e => setNewSectionPrefix(e.target.value)}
                                placeholder="e.g. T, P"
                            />
                        </div>
                        <button onClick={handleAdd} className="bg-green-600 p-2 rounded text-white h-[42px] px-4 font-bold">Save</button>
                        <button onClick={() => setIsAdding(false)} className="bg-slate-800 p-2 rounded text-slate-400 h-[42px]"><X size={20} /></button>
                    </div>
                </div>
            )}

            <div className="mt-12 pt-8 border-t border-slate-800">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500 font-bold border border-orange-500/20">
                            <Map size={20} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white uppercase tracking-tighter">Floor Management Policy</h3>
                            <p className="text-xs text-slate-500">Configure operational rules for table seating</p>
                        </div>
                    </div>
                    {hasPolicyChanges && (
                        <button
                            onClick={handleSavePolicies}
                            disabled={isSavingPolicies}
                            className="bg-orange-500 text-black px-6 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-orange-400 active:scale-95 transition-all shadow-lg shadow-orange-500/20"
                        >
                            {isSavingPolicies ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            {isSavingPolicies ? 'Saving...' : 'Save Policies'}
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl flex items-center justify-between group hover:border-orange-500/30 transition-colors">
                        <div>
                            <h4 className="text-sm font-bold text-white uppercase tracking-tight">Allow Over-Capacity</h4>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed mt-1">
                                Seat more guests than table standard capacity
                            </p>
                        </div>
                        <button
                            onClick={() => updatePolicy('allow_over_capacity', !policies.allow_over_capacity)}
                            className={`w-10 h-5 rounded-full transition-all relative ${policies.allow_over_capacity ? 'bg-orange-600' : 'bg-slate-800'}`}
                        >
                            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${policies.allow_over_capacity ? 'right-1' : 'left-1'}`} />
                        </button>
                    </div>

                    <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl flex items-center justify-between group hover:border-orange-500/30 transition-colors">
                        <div>
                            <h4 className="text-sm font-bold text-white uppercase tracking-tight">Table Merging</h4>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed mt-1">
                                Enable combining multiple tables into one bill
                            </p>
                        </div>
                        <button
                            onClick={() => updatePolicy('allow_table_merging', !policies.allow_table_merging)}
                            className={`w-10 h-5 rounded-full transition-all relative ${policies.allow_table_merging ? 'bg-orange-600' : 'bg-slate-800'}`}
                        >
                            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${policies.allow_table_merging ? 'right-1' : 'left-1'}`} />
                        </button>
                    </div>

                    <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl flex items-center justify-between group hover:border-orange-500/30 transition-colors">
                        <div>
                            <h4 className="text-sm font-bold text-white uppercase tracking-tight">Force Available</h4>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed mt-1">
                                Allow cashier to clear an occupied table
                            </p>
                        </div>
                        <button
                            onClick={() => updatePolicy('force_table_available', !policies.force_table_available)}
                            className={`w-10 h-5 rounded-full transition-all relative ${policies.force_table_available ? 'bg-orange-600' : 'bg-slate-800'}`}
                        >
                            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${policies.force_table_available ? 'right-1' : 'left-1'}`} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
