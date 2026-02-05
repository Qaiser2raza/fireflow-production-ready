import React, { useState } from 'react';
import { useAppContext } from '../../../client/contexts/AppContext';
import { Plus, Trash2, Edit2, Save, X } from 'lucide-react';

export const ZonesPanel: React.FC = () => {
    const { sections, addSection, updateSection, deleteSection } = useAppContext();
    const [isAdding, setIsAdding] = useState(false);
    const [newSectionName, setNewSectionName] = useState('');
    const [newSectionPrefix, setNewSectionPrefix] = useState('T');

    // Editing state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editPrefix, setEditPrefix] = useState('');

    const handleAdd = async () => {
        if (!newSectionName) return;
        await addSection({ name: newSectionName, prefix: newSectionPrefix, priority: sections.length + 1 });
        setIsAdding(false);
        setNewSectionName('');
        setNewSectionPrefix('T');
    };

    const startEdit = (section: any) => {
        setEditingId(section.id);
        setEditName(section.name);
        setEditPrefix(section.prefix || 'T');
    };

    const saveEdit = async () => {
        if (editingId) {
            await updateSection({ id: editingId, name: editName, prefix: editPrefix });
            setEditingId(null);
        }
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

            <div className="grid grid-cols-1 gap-4">
                {sections.map(section => (
                    <div key={section.id} className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                        {editingId === section.id ? (
                            <div className="flex gap-4 flex-1 items-center">
                                <input
                                    className="flex-1 bg-black border border-slate-600 rounded px-2 py-1"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                />
                                <input
                                    className="w-20 bg-black border border-slate-600 rounded px-2 py-1"
                                    value={editPrefix}
                                    onChange={e => setEditPrefix(e.target.value)}
                                />
                                <button onClick={saveEdit} className="text-green-500 hover:text-green-400"><Save size={18} /></button>
                                <button onClick={() => setEditingId(null)} className="text-slate-500 hover:text-white"><X size={18} /></button>
                            </div>
                        ) : (
                            <div className="flex-1">
                                <span className="font-bold text-lg mr-3">{section.name}</span>
                                <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400">Prefix: {section.prefix}</span>
                            </div>
                        )}

                        {!editingId && (
                            <div className="flex gap-2">
                                <button onClick={() => startEdit(section)} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white">
                                    <Edit2 size={18} />
                                </button>
                                <button
                                    onClick={() => {
                                        if (confirm('Delete this zone? Tables in this zone may be orphaned.')) deleteSection(section.id);
                                    }}
                                    className="p-2 hover:bg-red-900/30 rounded text-red-500 hover:text-red-400"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
