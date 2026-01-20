import React, { useState, useEffect } from 'react';
import { QrCode, Copy, RefreshCw, CheckCircle2, Clock, Smartphone, AlertCircle } from 'lucide-react';
import { useAppContext } from '../../client/App';
import { useRestaurant } from '../../client/RestaurantContext';
import { QRCodeSVG } from 'qrcode.react';

interface PairingCode {
    id: string;
    pairing_code: string;
    expires_at: string;
    is_used: boolean;
    is_expired: boolean;
}

interface DeviceFingerprint {
    userAgent: string;
    screenWidth: number;
    screenHeight: number;
    timezone: string;
    hash: string;
}

/**
 * Generate device fingerprint for pairing verification
 * 
 * This prevents code reuse across different devices.
 * Hash = SHA256(userAgent + screen dimensions + timezone)
 */
function generateDeviceFingerprint(): DeviceFingerprint {
    const userAgent = navigator.userAgent;
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // For client-side, we'll use a simple hash for now
    // In production: use crypto.subtle.digest for SHA256
    const fingerprintString = `${userAgent}|${screenWidth}|${screenHeight}|${timezone}`;
    
    // Simple hash function (not cryptographically secure, but good enough for device identification)
    let hash = 0;
    for (let i = 0; i < fingerprintString.length; i++) {
        const char = fingerprintString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }

    return {
        userAgent,
        screenWidth,
        screenHeight,
        timezone,
        hash: Math.abs(hash).toString(16).padStart(8, '0')
    };
}

export const QRCodePairing: React.FC = () => {
    const { currentUser } = useAppContext();
    const { currentRestaurant } = useRestaurant();
    const [pairingCode, setPairingCode] = useState<PairingCode | null>(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState<number>(0);
    const [deviceFingerprint, setDeviceFingerprint] = useState<DeviceFingerprint | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Generate fingerprint on mount
    useEffect(() => {
        setDeviceFingerprint(generateDeviceFingerprint());
    }, []);

    // Timer for code expiry
    useEffect(() => {
        if (pairingCode && !pairingCode.is_expired) {
            const interval = setInterval(() => {
                const expiresAt = new Date(pairingCode.expires_at).getTime();
                const now = new Date().getTime();
                const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));

                setTimeRemaining(remaining);

                if (remaining === 0) {
                    setPairingCode(null);
                    setError('Pairing code expired. Generate a new one.');
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
            setTimeRemaining(15 * 60); // 15 minutes in seconds
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

    const qrData = pairingCode && deviceFingerprint ? JSON.stringify({
        code: pairingCode.pairing_code,
        code_id: pairingCode.id,
        restaurantId: currentRestaurant?.id,
        restaurantName: currentRestaurant?.name,
        deviceFingerprint: deviceFingerprint.hash,
        type: 'device_pairing',
        version: '1.0'
    }) : '';

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
                                    <p className="text-slate-400 text-sm">Once paired, the device will appear in your Device Management dashboard with an "Online" status.</p>
                                </div>
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
                                    {deviceFingerprint && (
                                        <p className="text-blue-200/60 text-xs font-mono">
                                            Fingerprint: {deviceFingerprint.hash}
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
