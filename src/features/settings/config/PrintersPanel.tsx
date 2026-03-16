import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../../shared/lib/authInterceptor';
import { Card } from '../../../shared/ui/Card';
import { Printer, Plus, Edit2, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { useAppContext } from '../../../client/contexts/AppContext';

export const PrintersPanel: React.FC = () => {
    const { addNotification } = useAppContext();
    const [printers, setPrinters] = useState<any[]>([]);
    const [stations, setStations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [showModal, setShowModal] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        ip_address: '',
        port: 9100,
        station_id: '',
        is_active: true
    });

    const loadData = async () => {
        try {
            const [printersRes, stationsRes] = await Promise.all([
                fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/printers`),
                fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/stations`)
            ]);
            if (printersRes.ok) setPrinters(await printersRes.json());
            if (stationsRes.ok) setStations(await stationsRes.json());
        } catch (err: any) {
            addNotification('error', err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const isEdit = !!editingId;
            const url = isEdit ? `${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/printers/${editingId}` : `${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/printers`;
            const method = isEdit ? 'PATCH' : 'POST';

            const res = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to save printer');
            }

            addNotification('success', `Printer ${isEdit ? 'updated' : 'created'} successfully`);
            setShowModal(false);
            loadData();
        } catch (err: any) {
            addNotification('error', err.message);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this printer?')) return;
        try {
            const res = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/printers/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete printer');
            addNotification('success', 'Printer deleted successfully');
            loadData();
        } catch (err: any) {
            addNotification('error', err.message);
        }
    };

    const handleTestConnection = async (printer: any) => {
        setTestingId(printer.id);
        try {
            const res = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/printers/test-connection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip_address: printer.ip_address, port: printer.port })
            });
            const data = await res.json();
            if (data.success) {
                addNotification('success', `${printer.name}: ${data.message}`);
            } else {
                addNotification('error', `${printer.name}: ${data.message}`);
            }
        } catch (err: any) {
            addNotification('error', err.message);
        } finally {
            setTestingId(null);
        }
    };

    const handleTestPrint = async (printer: any) => {
        setTestingId(printer.id);
        try {
            const res = await fetchWithAuth(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/printers/test-print`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip_address: printer.ip_address, port: printer.port, name: printer.name })
            });
            const data = await res.json();
            if (data.success) {
                addNotification('success', `${printer.name}: ${data.message}`);
            } else {
                addNotification('error', `${printer.name}: ${data.message}`);
            }
        } catch (err: any) {
            addNotification('error', err.message);
        } finally {
            setTestingId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-tighter">Hardware Configuration</h2>
                    <p className="text-slate-500 text-xs">Manage IP Printers for Receipts and KDS Networks</p>
                </div>
                <button
                    onClick={() => {
                        setEditingId(null);
                        setFormData({ name: '', ip_address: '', port: 9100, station_id: stations[0]?.id || '', is_active: true });
                        setShowModal(true);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2 shadow-lg shadow-indigo-900/20"
                >
                    <Plus size={16} /> Add Printer
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="text-slate-500">Loading...</div>
                ) : printers.length === 0 ? (
                    <div className="text-slate-500 italic">No printers configured.</div>
                ) : (
                    printers.map(p => (
                        <Card key={p.id} className="p-6 border-slate-800 bg-[#0B0F19]/50 relative overflow-hidden group">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className={`p-3 rounded-lg ${p.is_active ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-slate-500'}`}>
                                        <Printer size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-white font-bold">{p.name}</h3>
                                        <div className="text-[10px] uppercase font-black tracking-widest text-slate-500">
                                            {p.stations?.name || 'Unassigned Station'}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => {
                                        setEditingId(p.id);
                                        setFormData({ name: p.name, ip_address: p.ip_address, port: p.port, station_id: p.station_id, is_active: p.is_active });
                                        setShowModal(true);
                                    }} className="text-slate-500 hover:text-indigo-400"><Edit2 size={16} /></button>
                                    <button onClick={() => handleDelete(p.id)} className="text-slate-500 hover:text-red-400"><Trash2 size={16} /></button>
                                </div>
                            </div>

                            <div className="space-y-2 mt-4">
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500 uppercase font-bold tracking-widest text-[9px]">IP Endpoint</span>
                                    <span className="text-emerald-400 font-mono">{p.ip_address}:{p.port}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500 uppercase font-bold tracking-widest text-[9px]">Status</span>
                                    <span className={p.is_active ? "text-emerald-400 flex items-center gap-1 font-bold" : "text-slate-500 flex items-center gap-1"}>
                                        {p.is_active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                                        {p.is_active ? "ONLINE" : "OFFLINE"}
                                    </span>
                                </div>
                            </div>

                            <div className="flex gap-2 mt-4 pt-4 border-t border-slate-800/50">
                                <button
                                    onClick={() => handleTestConnection(p)}
                                    disabled={testingId === p.id}
                                    className="flex-1 py-2 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-bold text-slate-400 hover:text-white uppercase tracking-widest transition-all disabled:opacity-50"
                                >
                                    {testingId === p.id ? 'Testing...' : 'Test Link'}
                                </button>
                                <button
                                    onClick={() => handleTestPrint(p)}
                                    disabled={testingId === p.id}
                                    className="flex-1 py-2 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-bold text-slate-400 hover:text-white uppercase tracking-widest transition-all disabled:opacity-50"
                                >
                                    Print Test
                                </button>
                            </div>
                        </Card>
                    ))
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full">
                        <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-6">{editingId ? 'Edit' : 'Add'} Printer</h3>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Internal Name Alias</label>
                                <input
                                    required
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-slate-800 text-white rounded-xl px-4 py-3 border border-slate-700 outline-none focus:border-indigo-500"
                                    placeholder="e.g. Kitchen Line 1"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">IP Address</label>
                                    <input
                                        required
                                        type="text"
                                        pattern="^([0-9]{1,3}\.){3}[0-9]{1,3}$"
                                        value={formData.ip_address}
                                        onChange={e => setFormData({ ...formData, ip_address: e.target.value })}
                                        className="w-full bg-slate-800 text-white rounded-xl px-4 py-3 border border-slate-700 outline-none focus:border-indigo-500 font-mono"
                                        placeholder="192.168.1.100"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">TCP Port</label>
                                    <input
                                        required
                                        type="number"
                                        value={formData.port}
                                        onChange={e => setFormData({ ...formData, port: parseInt(e.target.value) })}
                                        className="w-full bg-slate-800 text-white rounded-xl px-4 py-3 border border-slate-700 outline-none focus:border-indigo-500 font-mono"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">Print Station Zone</label>
                                <select
                                    required
                                    value={formData.station_id}
                                    onChange={e => setFormData({ ...formData, station_id: e.target.value })}
                                    className="w-full bg-slate-800 text-white rounded-xl px-4 py-3 border border-slate-700 outline-none focus:border-indigo-500"
                                >
                                    <option value="" disabled>Select Station...</option>
                                    {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>

                            <div className="flex items-center gap-3 pt-4">
                                <input
                                    type="checkbox"
                                    checked={formData.is_active}
                                    onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                                    id="active-toggle"
                                    className="size-5 accent-indigo-500"
                                />
                                <label htmlFor="active-toggle" className="text-slate-300 font-bold">Enabled & Operational</label>
                            </div>

                            <div className="pt-6 flex gap-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-700 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-500 transition shadow-lg shadow-indigo-900/20"
                                >
                                    Save Hardware
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
