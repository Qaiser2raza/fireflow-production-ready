import React, { useState, useEffect } from 'react';
import { QrCode, Copy, RefreshCw, CheckCircle2, Clock, Smartphone, AlertCircle } from 'lucide-react';
import { useAppContext } from '../../client/App';
import { useRestaurant } from '../../client/RestaurantContext';
import { QRCodeSVG } from 'qrcode.react';
import { getDeviceFingerprint } from '../../shared/lib/deviceFingerprint';

interface PairingCode {
    id: string;
    pairing_code: string;
    expires_at: string;
    is_used: boolean;
    is_expired: boolean;
    qr_payload: string;
    qr_expires_in: number;
}

interface PairedDevice {
    id: string;
    device_name: string;
    last_seen: string;
    status: 'active' | 'inactive';
}


export const QRCodePairing: React.FC = () => {
    const { currentUser } = useAppContext();
    const { currentRestaurant } = useRestaurant();
    const [pairingCode, setPairingCode] = useState<PairingCode | null>(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState<number>(0);
    const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Fetch paired devices on mount and every 10s
    useEffect(() => {
        fetchDevices();
        const interval = setInterval(fetchDevices, 10000);
        return () => clearInterval(interval);
    }, [currentRestaurant?.id]);

    const fetchDevices = async () => {
        if (!currentRestaurant?.id) return;
        try {
            const res = await fetch(`/api/pairing/devices?restaurantId=${currentRestaurant.id}`);
            if (res.ok) {
                const data = await res.json();
                setPairedDevices(data.devices || []);
            }
        } catch (err) {
            console.error('Failed to fetch devices:', err);
        }
    };

    // Timer for code expiry
    useEffect(() => {
        if (pairingCode && !pairingCode.is_expired) {
            const interval = setInterval(() => {
                const expiresAt = new Date(pairingCode.expires_at).getTime();
                const now = new Date().getTime();
                const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));

                setTimeRemaining(remaining);

                if (remaining === 0) {
                    // Feature 1: Auto-regenerate on expiry
                    generatePairingCode();
                }
            }, 1000);

            return () => clearInterval(interval);
        }
    }, [pairingCode]);

    const generatePairingCode = async () => {
        if (!currentRestaurant?.id || !currentUser?.id) {
            setError('Missing restaurant or user context');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/pairing/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    restaurantId: currentRestaurant.id
                }),
                // TODO: Add Bearer token after JWT implementation
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || `HTTP ${response.status}`);
            }

            const data = await response.json();
            setPairingCode(data);
            setTimeRemaining(data.qr_expires_in || 900);
        } catch (error: any) {
            console.error('Failed to generate pairing code:', error);
            setError(error.message || 'Failed to generate pairing code');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        if (pairingCode) {
            navigator.clipboard.writeText(pairingCode.pairing_code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const qrData = pairingCode?.qr_payload || '';
    const fingerprint = getDeviceFingerprint();

    return (
        <div className="h-full w-full bg-slate-950 p-6 overflow-y-auto">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Device Pairing</h1>
                    <p className="text-slate-400">Generate a QR code to pair new devices with your restaurant</p>
                </div>

                {/* Error Alert */}
                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <h4 className="text-red-400 font-semibold mb-1">Error</h4>
                            <p className="text-red-200/80 text-sm">{error}</p>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* QR Code Section */}
                    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-8">
                        <div className="flex flex-col items-center">
                            {!pairingCode ? (
                                <>
                                    <div className="w-64 h-64 bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-600 flex items-center justify-center mb-6">
                                        <QrCode className="w-24 h-24 text-slate-600" />
                                    </div>
                                    <button
                                        onClick={generatePairingCode}
                                        disabled={loading}
                                        className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                                    >
                                        {loading ? (
                                            <>
                                                <RefreshCw className="w-5 h-5 animate-spin" />
                                                Generating...
                                            </>
                                        ) : (
                                            <>
                                                <QrCode className="w-5 h-5" />
                                                Generate Pairing Code
                                            </>
                                        )}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="bg-white p-6 rounded-xl mb-6">
                                        <QRCodeSVG value={qrData}
                                            size={256}
                                            level="H"
                                            includeMargin={true}
                                        />
                                    </div>

                                    {/* Pairing Code Display */}
                                    <div className="w-full bg-slate-800/50 rounded-lg p-4 mb-4">
                                        <div className="text-center">
                                            <div className="text-sm text-slate-400 mb-2">Pairing Code</div>
                                            <div className="text-4xl font-bold text-white tracking-wider mb-3">
                                                {pairingCode.pairing_code}
                                            </div>
                                            <button
                                                onClick={copyToClipboard}
                                                className="text-sm text-cyan-400 hover:text-cyan-300 flex items-center gap-2 mx-auto transition-colors"
                                            >
                                                {copied ? (
                                                    <>
                                                        <CheckCircle2 className="w-4 h-4" />
                                                        Copied!
                                                    </>
                                                ) : (
                                                    <>
                                                        <Copy className="w-4 h-4" />
                                                        Copy Code
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Timer */}
                                    <div className="flex items-center gap-2 text-slate-400 mb-4">
                                        <Clock className="w-5 h-5" />
                                        <span className="text-lg font-mono">
                                            Expires in {formatTime(timeRemaining)}
                                        </span>
                                    </div>

                                    <button
                                        onClick={generatePairingCode}
                                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-all flex items-center gap-2"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        Generate New Code
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Instructions Section */}
                    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-8">
                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <Smartphone className="w-6 h-6 text-cyan-400" />
                            How to Pair a Device
                        </h2>

                        <div className="space-y-6">
                            <div className="flex gap-4">
                                <div className="flex-shrink-0 w-8 h-8 bg-cyan-500/20 text-cyan-400 rounded-full flex items-center justify-center font-bold border border-cyan-500/30">
                                    1
                                </div>
                                <div>
                                    <h3 className="text-white font-semibold mb-1">Generate Code</h3>
                                    <p className="text-slate-400 text-sm">Click "Generate Pairing Code" to create a new QR code. The code is valid for 15 minutes.</p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-shrink-0 w-8 h-8 bg-cyan-500/20 text-cyan-400 rounded-full flex items-center justify-center font-bold border border-cyan-500/30">
                                    2
                                </div>
                                <div>
                                    <h3 className="text-white font-semibold mb-1">Scan QR Code</h3>
                                    <p className="text-slate-400 text-sm">On your new device, open the FireFlow app and select "Pair Device". Scan the QR code displayed here.</p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-shrink-0 w-8 h-8 bg-cyan-500/20 text-cyan-400 rounded-full flex items-center justify-center font-bold border border-cyan-500/30">
                                    3
                                </div>
                                <div>
                                    <h3 className="text-white font-semibold mb-1">Manual Entry</h3>
                                    <p className="text-slate-400 text-sm">Alternatively, you can manually enter the 6-digit pairing code on your device.</p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-shrink-0 w-8 h-8 bg-cyan-500/20 text-cyan-400 rounded-full flex items-center justify-center font-bold border border-cyan-500/30">
                                    4
                                </div>
                                <div>
                                    <h3 className="text-white font-semibold mb-1">Verify Connection</h3>
                                    <p className="text-slate-400 text-sm">Once paired, the device will appear in the "Registered Devices" list below.</p>
                                </div>
                            </div>
                        </div>

                        {/* Feature 1: Paired Device List */}
                        <div className="mt-10">
                            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                                Registered Devices / رجسٹرڈ ڈیوائسز
                            </h3>
                            <div className="space-y-3">
                                {pairedDevices.length === 0 ? (
                                    <div className="text-slate-600 italic text-sm py-4 border-2 border-dashed border-slate-800 rounded-lg text-center">
                                        No devices paired yet.
                                    </div>
                                ) : (
                                    pairedDevices.map(device => (
                                        <div key={device.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                                            <div className="flex items-center gap-3">
                                                <Smartphone className="w-4 h-4 text-cyan-400" />
                                                <div>
                                                    <div className="text-white text-sm font-medium">{device.device_name}</div>
                                                    <div className="text-slate-500 text-xs">Last seen: {new Date(device.last_seen).toLocaleTimeString()}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${device.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`} />
                                                <span className="text-xs text-slate-400 capitalize">{device.status}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Device Fingerprint Info */}
                        <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                            <div className="flex gap-3">
                                <Smartphone className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="text-blue-400 font-semibold mb-1">Device Security</h4>
                                    <p className="text-blue-200/80 text-sm mb-2">
                                        This device is identified by a unique fingerprint (based on screen size, browser, timezone).
                                        This prevents pairing codes from being reused across different devices.
                                    </p>
                                    {fingerprint && (
                                        <p className="text-blue-200/60 text-xs font-mono">
                                            This Master Terminal ID: {fingerprint}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                            <div className="flex gap-3">
                                <Clock className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="text-amber-400 font-semibold mb-1">Security Note</h4>
                                    <p className="text-amber-200/80 text-sm">
                                        Each pairing code can only be used once and expires after 15 minutes.
                                        Pairing attempts are rate-limited to prevent brute-force attacks.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
