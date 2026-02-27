import React, { useState, useEffect } from 'react';
import {
    Smartphone,
    Monitor,
    Tablet,
    Cpu,
    Wifi,
    WifiOff,
    Shield,
    RefreshCw,
    QrCode,
    Lock,
    Unlock,
    Trash2,
    Activity,
    Clock
} from 'lucide-react';
import { useAppContext } from '../../client/App';
import { useRestaurant } from '../../client/RestaurantContext';

interface RegisteredDevice {
    id: string;
    restaurant_id: string;
    device_id: string;
    device_name: string;
    device_type: 'main_server' | 'pos_terminal' | 'kitchen_display' | 'manager_tablet' | 'waiter_handheld';
    mac_address: string;
    hardware_fingerprint: string;
    ip_address?: string;
    authorized: boolean;
    status: 'online' | 'offline' | 'blocked' | 'maintenance';
    last_seen: string;
    registered_at: string;
    software_version?: string;
    failed_auth_attempts: number;
}

export const DeviceManagementView: React.FC = () => {
    const { socket } = useAppContext();
    const { currentRestaurant } = useRestaurant();
    const [devices, setDevices] = useState<RegisteredDevice[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDevices();
        const interval = setInterval(fetchDevices, 30000); // Refresh every 30s

        // Listen for real-time device updates
        if (socket) {
            socket.on('device_change', handleDeviceUpdate);
        }

        return () => {
            clearInterval(interval);
            if (socket) {
                socket.off('device_change', handleDeviceUpdate);
            }
        };
    }, [currentRestaurant, socket]);

    const handleDeviceUpdate = (data: any) => {
        console.log('Device update received:', data);
        fetchDevices();
    };

    const fetchDevices = async () => {
        if (!currentRestaurant?.id) return;

        try {
            const response = await fetch(`/api/registered_devices?restaurant_id=${currentRestaurant.id}`);
            const data = await response.json();
            setDevices(data);
        } catch (error) {
            console.error('Failed to fetch devices:', error);
        } finally {
            setLoading(false);
        }
    };

    const getDeviceIcon = (type: string) => {
        switch (type) {
            case 'main_server': return <Monitor className="w-5 h-5" />;
            case 'pos_terminal': return <Cpu className="w-5 h-5" />;
            case 'kitchen_display': return <Monitor className="w-5 h-5" />;
            case 'manager_tablet': return <Tablet className="w-5 h-5" />;
            case 'waiter_handheld': return <Smartphone className="w-5 h-5" />;
            default: return <Smartphone className="w-5 h-5" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'online': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
            case 'offline': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
            case 'blocked': return 'bg-red-500/20 text-red-400 border-red-500/30';
            case 'maintenance': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
            default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
        }
    };

    const toggleDeviceAuthorization = async (deviceId: string, currentAuth: boolean) => {
        try {
            await fetch(`/api/registered_devices/upsert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: deviceId,
                    authorized: !currentAuth,
                    status: !currentAuth ? 'offline' : 'blocked'
                })
            });
            fetchDevices();
        } catch (error) {
            console.error('Failed to toggle authorization:', error);
        }
    };

    const deleteDevice = async (deviceId: string) => {
        if (!confirm('Are you sure you want to remove this device?')) return;

        try {
            await fetch(`/api/registered_devices?id=${deviceId}`, {
                method: 'DELETE'
            });
            fetchDevices();
        } catch (error) {
            console.error('Failed to delete device:', error);
        }
    };

    const formatLastSeen = (timestamp: string) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
        return `${Math.floor(diffMins / 1440)}d ago`;
    };

    if (loading && devices.length === 0) {
        return (
            <div className="flex items-center justify-center h-full">
                <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="h-full w-full bg-slate-950 p-6 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Device Management</h1>
                    <p className="text-slate-400">Manage and monitor all registered devices</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={fetchDevices}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-all flex items-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                    <button
                        onClick={() => alert('Pairing feature coming soon. Please contact system administrator.')}
                        className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-cyan-500/20"
                    >
                        <QrCode className="w-4 h-4" />
                        Pair New Device
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 border border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-400 text-sm">Total Devices</span>
                        <Monitor className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div className="text-2xl font-bold text-white">{devices.length}</div>
                </div>

                <div className="bg-gradient-to-br from-emerald-900/20 to-slate-900 rounded-xl p-4 border border-emerald-500/30">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-400 text-sm">Online</span>
                        <Wifi className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="text-2xl font-bold text-emerald-400">
                        {devices.filter(d => d.status === 'online').length}
                    </div>
                </div>

                <div className="bg-gradient-to-br from-slate-900/20 to-slate-900 rounded-xl p-4 border border-slate-500/30">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-400 text-sm">Offline</span>
                        <WifiOff className="w-5 h-5 text-slate-400" />
                    </div>
                    <div className="text-2xl font-bold text-slate-400">
                        {devices.filter(d => d.status === 'offline').length}
                    </div>
                </div>

                <div className="bg-gradient-to-br from-red-900/20 to-slate-900 rounded-xl p-4 border border-red-500/30">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-slate-400 text-sm">Blocked</span>
                        <Shield className="w-5 h-5 text-red-400" />
                    </div>
                    <div className="text-2xl font-bold text-red-400">
                        {devices.filter(d => d.status === 'blocked').length}
                    </div>
                </div>
            </div>

            {/* Devices Table */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-800/50 border-b border-slate-700">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Device</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Last Seen</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">IP Address</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {devices.map((device) => (
                                <tr key={device.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-slate-700/50 rounded-lg">
                                                {getDeviceIcon(device.device_type)}
                                            </div>
                                            <div>
                                                <div className="font-medium text-white">{device.device_name}</div>
                                                <div className="text-sm text-slate-400">{device.device_id}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-slate-300 capitalize">
                                            {device.device_type.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(device.status)}`}>
                                            {device.status === 'online' && <Activity className="w-3 h-3" />}
                                            {device.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 text-slate-400 text-sm">
                                            <Clock className="w-4 h-4" />
                                            {formatLastSeen(device.last_seen)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-300 text-sm">
                                        {device.ip_address || 'N/A'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => toggleDeviceAuthorization(device.id, device.authorized)}
                                                className={`p-2 rounded-lg transition-all ${device.authorized
                                                    ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400'
                                                    : 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                                                    }`}
                                                title={device.authorized ? 'Block Device' : 'Authorize Device'}
                                            >
                                                {device.authorized ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                                            </button>
                                            <button
                                                onClick={() => deleteDevice(device.id)}
                                                className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-all"
                                                title="Delete Device"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {devices.length === 0 && (
                        <div className="text-center py-12">
                            <Monitor className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                            <p className="text-slate-400 text-lg">No devices registered yet</p>
                            <p className="text-slate-500 text-sm mt-2">Click "Pair New Device" to get started</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
