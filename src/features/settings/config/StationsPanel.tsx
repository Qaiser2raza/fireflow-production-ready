import React, { useState } from 'react';
import { useAppContext } from '../../../client/contexts/AppContext';
import { Plus, Trash2, Edit2, Save, X, Activity } from 'lucide-react';

export const StationsPanel: React.FC = () => {
    const { stations, addStation, updateStation, deleteStation } = useAppContext();
    const [isAdding, setIsAdding] = useState(false);
    const [newStationName, setNewStationName] = useState('');

    // Editing state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const handleAdd = async () => {
        if (!newStationName) return;
        await addStation({
            name: newStationName,
            is_active: true
        });
        setIsAdding(false);
        setNewStationName('');
    };

    const startEdit = (station: any) => {
        setEditingId(station.id);
        setEditName(station.name);
    };

    const saveEdit = async () => {
        if (editingId) {
            await updateStation({ id: editingId, name: editName });
            setEditingId(null);
        }
    };

    const toggleActive = async (station: any) => {
        await updateStation({ id: station.id, is_active: !station.is_active });
    };

    return (
        <div className="text-slate-200">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-xl font-bold text-white">Kitchen & Prep Stations</h3>
                    <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Route menu items to specific display areas</p>
                </div>
                <button
                    onClick={() => setIsAdding(true)}
                    className="bg-gold-500 text-black px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-gold-400 transition-colors"
                >
                    <Plus size={18} /> Add Station
                </button>
            </div>

            {isAdding && (
                <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl mb-6 shadow-2xl animate-in slide-in-from-top-4">
                    <h4 className="font-bold mb-4 text-sm uppercase tracking-widest text-gold-500 flex items-center gap-2">
                        <Activity size={16} /> New Station Details
                    </h4>
                    <div className="flex gap-4 items-end">
                        <div className="flex-1">
                            <label className="text-xs text-slate-500 mb-1 block">Station Name</label>
                            <input
                                className="w-full bg-black border border-slate-700 rounded px-4 py-2 text-white outline-none focus:border-gold-500 transition-all font-medium"
                                value={newStationName}
                                onChange={e => setNewStationName(e.target.value)}
                                placeholder="e.g. Grill, Bar, Cold Kitchen"
                                autoFocus
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleAdd}
                                className="bg-green-600 hover:bg-green-500 p-2 rounded text-white h-[42px] px-6 font-bold transition-all shadow-lg shadow-green-900/20"
                            >
                                Create
                            </button>
                            <button
                                onClick={() => setIsAdding(false)}
                                className="bg-slate-800 hover:bg-slate-700 p-2 rounded text-slate-400 h-[42px] px-4 transition-all"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stations.map(station => (
                    <div
                        key={station.id}
                        className={`bg-slate-900/50 border transition-all duration-300 p-5 rounded-2xl flex flex-col justify-between group ${station.is_active ? 'border-slate-800 hover:border-slate-600' : 'border-red-900/30 opacity-60 grayscale-[0.5]'
                            }`}
                    >
                        <div className="flex justify-between items-start mb-6">
                            {editingId === station.id ? (
                                <div className="flex flex-col gap-2 w-full">
                                    <input
                                        className="w-full bg-black border border-slate-600 rounded px-3 py-2 text-white outline-none focus:border-gold-500"
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        autoFocus
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={saveEdit} className="text-green-500 hover:text-green-400 flex items-center gap-1 text-xs font-bold uppercase tracking-widest border border-green-500/20 px-2 py-1 rounded">
                                            <Save size={14} /> Save
                                        </button>
                                        <button onClick={() => setEditingId(null)} className="text-slate-500 hover:text-white flex items-center gap-1 text-xs font-bold uppercase tracking-widest border border-slate-800 px-2 py-1 rounded">
                                            <X size={14} /> Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col">
                                    <span className="font-serif text-xl text-white group-hover:text-gold-500 transition-colors uppercase tracking-tight">{station.name}</span>
                                    <span className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${station.is_active ? 'text-green-500' : 'text-red-500'}`}>
                                        {station.is_active ? '● Online' : '○ Offline'}
                                    </span>
                                </div>
                            )}

                            {!editingId && (
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => startEdit(station)}
                                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all shadow-xl"
                                        title="Edit Station"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={() => toggleActive(station)}
                                        className={`p-2 rounded-lg transition-all ${station.is_active ? 'text-slate-400 hover:bg-red-900/20 hover:text-red-400' : 'text-green-500 hover:bg-green-900/20'}`}
                                        title={station.is_active ? "Disable Station" : "Enable Station"}
                                    >
                                        <Activity size={16} />
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t border-slate-800/50">
                            <div className="flex flex-col">
                                <span className="text-[10px] uppercase tracking-tighter text-slate-500">Last Pulse</span>
                                <span className="text-xs font-mono text-slate-300">Active</span>
                            </div>

                            {!editingId && (
                                <button
                                    onClick={() => {
                                        if (confirm(`Decommission ${station.name}? This will stop orders from being routed here.`)) deleteStation(station.id);
                                    }}
                                    className="text-red-500/30 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-900/10"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {stations.length === 0 && (
                <div className="flex flex-col items-center justify-center p-20 border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/10">
                    <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center text-slate-700 mb-4 opacity-50">
                        <Activity size={32} />
                    </div>
                    <p className="text-slate-500 font-serif text-lg italic uppercase tracking-widest">No preparation stations detected</p>
                    <button
                        onClick={() => setIsAdding(true)}
                        className="mt-4 text-gold-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-all"
                    >
                        + Initialize First Station
                    </button>
                </div>
            )}
        </div>
    );
};
