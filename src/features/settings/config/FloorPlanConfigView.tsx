
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../../client/contexts/AppContext';
import {
    Plus, Save, Trash2, RotateCw,
    Move, Info, AlertCircle,
    Grid, Edit2 as EditIcon
} from 'lucide-react';
import { Table, TableStatus } from '../../../shared/types';

interface DragState {
    tableId: string;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
}

export const FloorPlanConfigView: React.FC = () => {
    const { tables, sections, updateTable, addTable, deleteTable, addNotification } = useAppContext();
    const [activeSectionId, setActiveSectionId] = useState<string | 'ALL'>('ALL');
    const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    const [localTables, setLocalTables] = useState<Table[]>(tables);

    useEffect(() => {
        setLocalTables(tables);
    }, [tables]);

    const activeTables = useMemo(() => {
        if (activeSectionId === 'ALL') return localTables;
        return localTables.filter(t => t.section_id === activeSectionId);
    }, [localTables, activeSectionId]);

    const selectedTable = useMemo(() =>
        localTables.find(t => t.id === selectedTableId),
        [localTables, selectedTableId]);

    const handleMouseDown = (e: React.MouseEvent, table: Table) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        setSelectedTableId(table.id);
        setDragState({
            tableId: table.id,
            startX: e.clientX,
            startY: e.clientY,
            initialX: table.x_position || 0,
            initialY: table.y_position || 0,
        });
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!dragState) return;
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        setLocalTables(prev => prev.map(t => {
            if (t.id === dragState.tableId) {
                return {
                    ...t,
                    x_position: Math.max(0, Math.round((dragState.initialX + dx) / 10) * 10),
                    y_position: Math.max(0, Math.round((dragState.initialY + dy) / 10) * 10),
                };
            }
            return t;
        }));
        setHasUnsavedChanges(true);
    };

    const handleMouseUp = () => setDragState(null);

    useEffect(() => {
        if (dragState) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragState]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const changed = localTables.filter(lt => {
                const original = tables.find(t => t.id === lt.id);
                return original && (
                    original.x_position !== lt.x_position ||
                    original.y_position !== lt.y_position ||
                    original.width !== lt.width ||
                    original.height !== lt.height ||
                    original.rotation !== lt.rotation ||
                    original.shape !== lt.shape ||
                    original.capacity !== lt.capacity ||
                    original.name !== lt.name ||
                    original.section_id !== lt.section_id
                );
            });
            for (const table of changed) {
                await updateTable(table);
            }
            setHasUnsavedChanges(false);
            addNotification('success', `Saved ${changed.length} table changes`);
        } catch (error) {
            addNotification('error', 'Failed to save changes');
        } finally {
            setIsSaving(false);
        }
    };

    const updateTableProperty = (id: string, updates: Partial<Table>) => {
        setLocalTables(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
        setHasUnsavedChanges(true);
    };

    const createTable = async () => {
        const section = activeSectionId !== 'ALL' ? activeSectionId : (sections[0]?.id || null);
        const newTable = {
            name: `T-${localTables.length + 1}`,
            section_id: section,
            capacity: 4,
            status: TableStatus.AVAILABLE,
            x_position: 100,
            y_position: 100,
            width: 100,
            height: 100,
            shape: 'SQUARE' as const,
        };
        await addTable(newTable);
        addNotification('success', 'New table created');
    };

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-lg">
                <div className="flex items-center gap-4">
                    <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                        <button
                            onClick={() => setActiveSectionId('ALL')}
                            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-all ${activeSectionId === 'ALL' ? 'bg-gold-500 text-black' : 'text-slate-400 hover:text-white'}`}
                        >
                            Full Floor
                        </button>
                        {sections.map(s => (
                            <button
                                key={s.id}
                                onClick={() => setActiveSectionId(s.id)}
                                className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-all ${activeSectionId === s.id ? 'bg-gold-500 text-black' : 'text-slate-400 hover:text-white'}`}
                            >
                                {s.name}
                            </button>
                        ))}
                    </div>
                    <button onClick={createTable} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest"><Plus size={16} /> Add Table</button>
                </div>
                <div className="flex items-center gap-4">
                    {hasUnsavedChanges && <span className="text-[10px] text-amber-500 font-black uppercase tracking-widest flex items-center gap-2 animate-pulse"><AlertCircle size={14} /> Unsaved Changes</span>}
                    <button onClick={handleSave} disabled={!hasUnsavedChanges || isSaving} className="flex items-center gap-2 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-black px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all shadow-lg">{isSaving ? <RotateCw className="animate-spin" size={16} /> : <Save size={16} />} Save Layout</button>
                </div>
            </div>

            <div className="flex-1 flex gap-4 overflow-hidden">
                <div className="flex-1 bg-slate-950 rounded-2xl border-2 border-dashed border-slate-800 relative overflow-hidden group">
                    <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                    <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-700 text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-4">
                        <div className="flex items-center gap-1"><Grid size={12} /> 10px Snapping</div>
                        <div className="flex items-center gap-1"><Move size={12} /> Drag to Move</div>
                    </div>
                    <div className="w-full h-full relative" id="floor-canvas">
                        {activeTables.map(table => (
                            <div
                                key={table.id}
                                onMouseDown={(e) => handleMouseDown(e, table)}
                                className={`absolute cursor-move select-none flex items-center justify-center border-2 ${selectedTableId === table.id ? 'border-gold-500 shadow-2xl z-50 scale-105' : 'border-slate-700 hover:border-slate-500 z-20'} ${table.shape === 'ROUND' || table.shape === 'OVAL' ? 'rounded-full' : 'rounded-xl'} ${table.status === 'OCCUPIED' ? 'bg-amber-500/10' : 'bg-slate-900'}`}
                                style={{ left: `${table.x_position}px`, top: `${table.y_position}px`, width: `${table.width || 100}px`, height: `${table.height || 100}px`, transform: `rotate(${table.rotation || 0}deg)` }}
                            >
                                <div className="text-center">
                                    <div className="text-white font-black text-xl">{table.name}</div>
                                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Cap: {table.capacity}</div>
                                </div>
                                {selectedTableId === table.id && <div className="absolute -top-3 -right-3 w-6 h-6 bg-gold-500 rounded-full flex items-center justify-center text-black shadow-lg"><EditIcon size={12} /></div>}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="w-80 flex flex-col gap-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex-1 flex flex-col">
                        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-gold-500 mb-6 flex items-center gap-2"><Info size={16} /> Table Properties</h3>
                        {selectedTable ? (
                            <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar flex-1">
                                <div><label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Name</label>
                                    <input type="text" value={selectedTable.name} onChange={(e) => updateTableProperty(selectedTable.id, { name: e.target.value })} className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-gold-500 font-bold" /></div>
                                <div><label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Zone</label>
                                    <select value={selectedTable.section_id || ''} onChange={(e) => updateTableProperty(selectedTable.id, { section_id: e.target.value })} className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white outline-none focus:border-gold-500 font-bold">
                                        {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Width</label>
                                        <input type="number" value={selectedTable.width || 100} onChange={(e) => updateTableProperty(selectedTable.id, { width: parseInt(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white" /></div>
                                    <div><label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Height</label>
                                        <input type="number" value={selectedTable.height || 100} onChange={(e) => updateTableProperty(selectedTable.id, { height: parseInt(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white" /></div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Shape</label>
                                        <div className="flex gap-1">
                                            {['SQUARE', 'ROUND', 'BOOTH'].map((s) => (
                                                <button key={s} onClick={() => updateTableProperty(selectedTable.id, { shape: s as any })} className={`flex-1 py-1 rounded text-[10px] font-bold ${selectedTable.shape === s ? 'bg-gold-500 text-black' : 'bg-slate-800 text-slate-400'}`}>{s}</button>
                                            ))}</div></div>
                                    <div><label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Rotation</label>
                                        <input type="number" value={selectedTable.rotation || 0} onChange={(e) => updateTableProperty(selectedTable.id, { rotation: parseInt(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 p-3 rounded-xl text-white" /></div>
                                </div>
                                <div><label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Capacity</label>
                                    <div className="flex items-center gap-4 bg-slate-950 border border-slate-800 p-1 rounded-xl">
                                        <button onClick={() => updateTableProperty(selectedTable.id, { capacity: Math.max(1, (selectedTable.capacity || 4) - 1) })} className="w-10 h-10 rounded-lg bg-slate-900 text-white font-black">-</button>
                                        <div className="flex-1 text-center font-black text-xl text-white">{selectedTable.capacity}</div>
                                        <button onClick={() => updateTableProperty(selectedTable.id, { capacity: (selectedTable.capacity || 4) + 1 })} className="w-10 h-10 rounded-lg bg-slate-900 text-white font-black">+</button>
                                    </div></div>
                                <div className="pt-6 border-t border-slate-800">
                                    <button onClick={() => { if (window.confirm('Delete table?')) { deleteTable(selectedTable.id); setSelectedTableId(null); } }} className="w-full flex items-center justify-center gap-2 text-red-500 hover:bg-red-500/10 py-3 rounded-xl border border-red-500/20 text-xs font-bold uppercase tracking-widest"><Trash2 size={16} /> Delete Table</button>
                                </div>
                            </div>
                        ) : <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30"><Move size={48} className="mb-4" /><p className="text-xs uppercase tracking-widest font-bold">Select table to edit</p></div>}
                    </div>
                </div>
            </div>
        </div>
    );
};
