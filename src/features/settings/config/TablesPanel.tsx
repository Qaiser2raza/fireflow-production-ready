import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../../client/App';
import { Plus, Trash2, Edit2, Save, X, LayoutTemplate } from 'lucide-react';

export const TablesPanel: React.FC = () => {
    const { tables, sections, addTable, updateTable, deleteTable } = useAppContext();
    const [isAdding, setIsAdding] = useState(false);

    // Add State
    const [newName, setNewName] = useState('');
    const [newCapacity, setNewCapacity] = useState(4);
    const [newSectionId, setNewSectionId] = useState('');

    // Edit State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editCapacity, setEditCapacity] = useState(4);
    const [editSectionId, setEditSectionId] = useState('');

    const handleAdd = async () => {
        if (!newName || !newSectionId) return;
        await addTable({
            name: newName,
            capacity: Number(newCapacity),
            section_id: newSectionId,
            status: 'AVAILABLE'
        });
        setIsAdding(false);
        setNewName('');
        setNewCapacity(4);
    };

    const startEdit = (table: any) => {
        setEditingId(table.id);
        setEditName(table.name);
        setEditCapacity(table.capacity);
        setEditSectionId(table.section_id);
    };

    const saveEdit = async () => {
        if (editingId) {
            await updateTable({
                id: editingId,
                name: editName,
                capacity: Number(editCapacity),
                section_id: editSectionId
            });
            setEditingId(null);
        }
    };

    // Group tables by section for display, or just sort them
    const sortedTables = useMemo(() => {
        return [...tables].sort((a, b) => {
            const secA = sections.find(s => s.id === a.section_id)?.priority || 0;
            const secB = sections.find(s => s.id === b.section_id)?.priority || 0;
            return secA - secB || a.name.localeCompare(b.name);
        });
    }, [tables, sections]);

    return (
        <div className="text-slate-200">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Tables Layout</h3>
                <button
                    onClick={() => setIsAdding(true)}
                    className="bg-gold-500 text-black px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-gold-400"
                >
                    <Plus size={18} /> Add Table
                </button>
            </div>

            {isAdding && (
                <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl mb-6 animate-in slide-in-from-top-2">
                    <h4 className="font-bold mb-4 text-sm uppercase tracking-widest text-gold-500">New Table Details</h4>
                    <div className="grid grid-cols-4 gap-4 items-end">
                        <div className="col-span-1">
                            <label className="text-xs text-slate-500 mb-1 block">Table Name</label>
                            <input
                                className="w-full bg-black border border-slate-700 rounded px-3 py-2 text-white outline-none focus:border-gold-500"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                placeholder="e.g. T-5"
                            />
                        </div>
                        <div className="col-span-1">
                            <label className="text-xs text-slate-500 mb-1 block">Zone / Section</label>
                            <select
                                className="w-full bg-black border border-slate-700 rounded px-3 py-2 text-white outline-none focus:border-gold-500"
                                value={newSectionId}
                                onChange={e => setNewSectionId(e.target.value)}
                            >
                                <option value="">Select Zone</option>
                                {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="col-span-1">
                            <label className="text-xs text-slate-500 mb-1 block">Capacity</label>
                            <input
                                className="w-full bg-black border border-slate-700 rounded px-3 py-2 text-white outline-none focus:border-gold-500"
                                type="number"
                                value={newCapacity}
                                onChange={e => setNewCapacity(Number(e.target.value))}
                            />
                        </div>
                        <div className="flex gap-2 h-[42px]">
                            <button onClick={handleAdd} className="flex-1 bg-green-600 rounded text-white font-bold">Save</button>
                            <button onClick={() => setIsAdding(false)} className="w-10 bg-slate-800 rounded text-slate-400"><X size={20} /></button>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {sortedTables.map(table => {
                    const sectionName = sections.find(s => s.id === table.section_id)?.name || 'Unassigned';
                    return (
                        <div key={table.id} className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl group relative hover:border-slate-600 transition-colors">
                            {editingId === table.id ? (
                                <div className="space-y-2">
                                    <input
                                        className="w-full bg-black border border-slate-600 rounded px-2 py-1 text-sm"
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                    />
                                    <select
                                        className="w-full bg-black border border-slate-600 rounded px-2 py-1 text-sm"
                                        value={editSectionId}
                                        onChange={e => setEditSectionId(e.target.value)}
                                    >
                                        <option value="">No Zone</option>
                                        {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                    <input
                                        className="w-full bg-black border border-slate-600 rounded px-2 py-1 text-sm"
                                        type="number"
                                        value={editCapacity}
                                        onChange={e => setEditCapacity(Number(e.target.value))}
                                    />
                                    <div className="flex gap-2 mt-2">
                                        <button onClick={saveEdit} className="flex-1 bg-green-600 text-white text-xs py-1 rounded">Save</button>
                                        <button onClick={() => setEditingId(null)} className="flex-1 bg-slate-700 text-white text-xs py-1 rounded">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="bg-slate-800 p-2 rounded-lg text-gold-500">
                                            <LayoutTemplate size={20} />
                                        </div>
                                        <div className="text-right">
                                            <div className="font-bold text-lg text-white">{table.name}</div>
                                            <div className="text-xs text-slate-500 uppercase tracking-wider">{sectionName}</div>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-end mt-4">
                                        <div className="text-xs text-slate-400">
                                            Seats: <span className="text-white font-bold">{table.capacity}</span>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => startEdit(table)} className="p-1 hover:bg-slate-700 rounded text-slate-300"><Edit2 size={14} /></button>
                                            <button onClick={() => deleteTable(table.id)} className="p-1 hover:bg-red-900/50 rounded text-red-500"><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
