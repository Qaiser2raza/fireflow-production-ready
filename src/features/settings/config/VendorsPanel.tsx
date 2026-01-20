import React, { useState } from 'react';
import { useAppContext } from '../../../client/App';
import { Plus, Trash2, Edit2, Save, X, Truck } from 'lucide-react';

export const VendorsPanel: React.FC = () => {
    const { vendors, addVendor, updateVendor, deleteVendor } = useAppContext();
    const [isAdding, setIsAdding] = useState(false);

    // Add State
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const [newCategory, setNewCategory] = useState('Supplies');

    // Edit State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editCategory, setEditCategory] = useState('');

    const CATEGORIES = ['Supplies', 'Maintenance', 'Utilities', 'Food', 'Beverage', 'Other'];

    const handleAdd = async () => {
        if (!newName) return;
        await addVendor({
            name: newName,
            phone: newPhone,
            category: newCategory
        });
        setIsAdding(false);
        setNewName('');
        setNewPhone('');
        setNewCategory('Supplies');
    };

    const startEdit = (vendor: any) => {
        setEditingId(vendor.id);
        setEditName(vendor.name);
        setEditPhone(vendor.phone || '');
        setEditCategory(vendor.category);
    };

    const saveEdit = async () => {
        if (editingId) {
            await updateVendor({
                id: editingId,
                name: editName,
                phone: editPhone,
                category: editCategory
            });
            setEditingId(null);
        }
    };

    return (
        <div className="text-slate-200">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-xl font-bold text-white">Vendor Directory</h3>
                    <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Management of raw material supply chain</p>
                </div>
                <button
                    onClick={() => setIsAdding(true)}
                    className="bg-gold-500 text-black px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-gold-400 transition-all shadow-lg shadow-gold-500/10"
                >
                    <Plus size={18} /> Add Vendor
                </button>
            </div>

            {isAdding && (
                <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl mb-6 animate-in slide-in-from-top-2">
                    <h4 className="font-bold mb-4 text-sm uppercase tracking-widest text-gold-500">New Vendor Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="col-span-1">
                            <label className="text-xs text-slate-500 mb-1 block uppercase font-bold">Vendor Name</label>
                            <input
                                className="w-full bg-black border border-slate-700 rounded px-3 py-2 text-white outline-none focus:border-gold-500"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                placeholder="e.g. Acme Supplies"
                            />
                        </div>
                        <div className="col-span-1">
                            <label className="text-xs text-slate-500 mb-1 block uppercase font-bold">Phone</label>
                            <input
                                className="w-full bg-black border border-slate-700 rounded px-3 py-2 text-white outline-none focus:border-gold-500"
                                value={newPhone}
                                onChange={e => setNewPhone(e.target.value)}
                                placeholder="0300..."
                            />
                        </div>
                        <div className="col-span-1">
                            <label className="text-xs text-slate-500 mb-1 block uppercase font-bold">Category</label>
                            <select
                                className="w-full bg-black border border-slate-700 rounded px-3 py-2 text-white outline-none focus:border-gold-500"
                                value={newCategory}
                                onChange={e => setNewCategory(e.target.value)}
                            >
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        <div className="flex gap-2 h-[42px]">
                            <button onClick={handleAdd} className="flex-1 bg-green-600 hover:bg-green-500 rounded text-white font-bold transition-colors">Save</button>
                            <button onClick={() => setIsAdding(false)} className="w-12 bg-slate-800 rounded text-slate-400 hover:text-white flex items-center justify-center transition-all"><X size={20} /></button>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* FIX: Use (vendors || []) to prevent crashing when data is undefined */}
                {(!vendors || vendors.length === 0) ? (
                    <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-800 rounded-2xl">
                        <Truck size={40} className="mx-auto text-slate-700 mb-4 opacity-20" />
                        <p className="text-slate-600 uppercase font-black tracking-[0.2em]">No Vendor Records Detected</p>
                    </div>
                ) : (
                    vendors.map(vendor => (
                        <div key={vendor.id} className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl flex items-start justify-between group hover:border-slate-600 transition-all">
                            {editingId === vendor.id ? (
                                <div className="flex-1 space-y-2">
                                    <input
                                        className="w-full bg-black border border-slate-600 rounded px-2 py-1 text-white text-sm"
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                    />
                                    <input
                                        className="w-full bg-black border border-slate-600 rounded px-2 py-1 text-white text-sm"
                                        value={editPhone}
                                        onChange={e => setEditPhone(e.target.value)}
                                    />
                                    <select
                                        className="w-full bg-black border border-slate-600 rounded px-2 py-1 text-white text-sm"
                                        value={editCategory}
                                        onChange={e => setEditCategory(e.target.value)}
                                    >
                                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <div className="flex gap-2 pt-1">
                                        <button onClick={saveEdit} className="text-green-500 text-[10px] uppercase font-black tracking-widest hover:text-green-400">Save</button>
                                        <button onClick={() => setEditingId(null)} className="text-slate-500 text-[10px] uppercase font-black tracking-widest hover:text-slate-300">Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-gold-500 group-hover:scale-110 transition-transform">
                                            <Truck size={24} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-white group-hover:text-gold-500 transition-colors">{vendor.name}</div>
                                            <div className="text-xs text-slate-400 font-mono mt-0.5">{vendor.phone || 'No Phone'}</div>
                                            <div className="text-[9px] text-slate-500 bg-slate-800/50 w-fit px-2 py-0.5 rounded-full uppercase tracking-tighter mt-2 border border-slate-700">
                                                {vendor.category}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => startEdit(vendor)} className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-all"><Edit2 size={14} /></button>
                                        <button onClick={() => deleteVendor(vendor.id)} className="p-2 hover:bg-red-900/30 rounded text-red-500 transition-all"><Trash2 size={14} /></button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};