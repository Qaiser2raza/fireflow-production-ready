import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../client/contexts/AppContext';
import { Monitor, Smartphone, Tablet, Trash2, RefreshCw, Shield, CheckCircle2, XCircle } from 'lucide-react';

interface Device {
    id: string;
    device_name: string;
    platform: string;
    is_active: boolean;
    created_at: string;
    last_sync_at: string;
    staff_id: string;
}

export const DeviceManagementView: React.FC = () => {
    const { addNotification, currentUser } = useAppContext();
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const [revoking, setRevoking] = useState<string | null>(null);

    const currentFingerprint = localStorage.getItem('fireflow_device_fingerprint');

    const fetchDevices = async () => {
        setLoading(true);
        try {
            const token = sessionStorage.getItem('accessToken');
            const res = await fetch('/api/devices', {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            if (!res.ok) throw new Error('Failed to fetch devices');
            const data = await res.json();
            setDevices(data);
        } catch (err: any) {
            addNotification('error', `Failed to load devices: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDevices(); }, []);

    const revokeDevice = async (deviceId: string) => {
        setRevoking(deviceId);
        try {
            const token = sessionStorage.getItem('accessToken');
            const res = await fetch(`/api/devices/${deviceId}`, {
                method: 'DELETE',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            if (!res.ok) throw new Error('Failed to revoke device');
            addNotification('success', 'Device revoked successfully');
            setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, is_active: false } : d));
        } catch (err: any) {
            addNotification('error', `Revoke failed: ${err.message}`);
        } finally {
            setRevoking(null);
        }
    };

    const getPlatformIcon = (platform: string) => {
        if (platform?.includes('android') || platform?.includes('ios')) return <Smartphone size={18} />;
        if (platform?.includes('tablet')) return <Tablet size={18} />;
        return <Monitor size={18} />;
    };

    const formatDate = (date: string) => {
        if (!date) return 'Never';
        return new Date(date).toLocaleString('en-PK', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-black text-white uppercase tracking-tight">Registered Devices</h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                        Devices that have logged in to this restaurant
                    </p>
                </div>
                <button
                    onClick={fetchDevices}
                    className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-all"
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Security note */}
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-3">
                <Shield size={16} className="text-blue-400 mt-0.5 shrink-0" />
                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest leading-relaxed">
                    Each device that logs in is automatically registered. Revoke any device you don't recognise.
                    Revoking a device forces it to re-login on next use.
                </p>
            </div>

            {/* Device List */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-20 bg-slate-900/50 rounded-xl animate-pulse border border-slate-800" />
                    ))}
                </div>
            ) : devices.length === 0 ? (
                <div className="text-center py-16 text-slate-600">
                    <Monitor size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No devices registered yet</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {devices.map(device => (
                        <div
                            key={device.id}
                            className={`p-4 rounded-xl border flex items-center gap-4 transition-all ${
                                device.is_active
                                    ? 'bg-slate-900/50 border-slate-800'
                                    : 'bg-slate-950/30 border-slate-900 opacity-50'
                            }`}
                        >
                            {/* Platform Icon */}
                            <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${
                                device.is_active ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-600'
                            }`}>
                                {getPlatformIcon(device.platform)}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-black text-white truncate">
                                        {device.device_name || 'Unknown Device'}
                                    </span>
                                    {device.is_active ? (
                                        <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                                    ) : (
                                        <XCircle size={12} className="text-red-500 shrink-0" />
                                    )}
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                                        {device.platform || 'Unknown OS'}
                                    </span>
                                    <span className="text-[9px] text-slate-600">·</span>
                                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                                        Last seen: {formatDate(device.last_sync_at)}
                                    </span>
                                    <span className="text-[9px] text-slate-600">·</span>
                                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                                        Added: {formatDate(device.created_at)}
                                    </span>
                                </div>
                            </div>

                            {/* Revoke button */}
                            {device.is_active && (
                                <button
                                    onClick={() => revokeDevice(device.id)}
                                    disabled={revoking === device.id}
                                    className="shrink-0 p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl transition-all disabled:opacity-50"
                                    title="Revoke device access"
                                >
                                    {revoking === device.id ? (
                                        <RefreshCw size={14} className="animate-spin" />
                                    ) : (
                                        <Trash2 size={14} />
                                    )}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
