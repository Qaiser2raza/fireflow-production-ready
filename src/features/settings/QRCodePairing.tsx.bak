import React, { useState, useEffect } from 'react';
import { QrCode, Copy, RefreshCw, CheckCircle2, Clock, Smartphone, AlertCircle, X } from 'lucide-react';
import { useAppContext } from '../../client/App';
import { useRestaurant } from '../../client/RestaurantContext';
import { QRCodeSVG } from 'qrcode.react';
import { getDeviceFingerprint } from '../../shared/lib/deviceFingerprint';
import { fetchWithAuth } from '../../shared/lib/authInterceptor';

interface PairingCode {
    id: string;
    pairing_code: string;
    expires_at: string;
    is_used: boolean;
    is_expired: boolean;
    qr_payload: string;
    qr_expires_in: number;
    target_staff_name?: string;
    session_duration_hours?: number;
}

interface PairedDevice {
    id: string;
    device_name: string;
    last_sync_at: string;
    is_active: boolean;
    expires_at?: string;
    platform?: string;
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
    const [selectedDuration, setSelectedDuration] = useState<number>(8); // Default 8h
    const [selectedStaffId, setSelectedStaffId] = useState<string>('');
    const { servers } = useAppContext();

    // Fetch paired devices on mount and every 10s
    useEffect(() => {
        fetchDevices();
        const interval = setInterval(fetchDevices, 10000);
        return () => clearInterval(interval);
    }, [currentRestaurant?.id]);

    const fetchDevices = async () => {
        if (!currentRestaurant?.id) return;
        try {
            // Fix 6: API calls for pairing MUST use authenticated fetch
            const res = await fetchWithAuth(`/api/pairing/devices?restaurantId=${currentRestaurant.id}`);
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
            const response = await fetchWithAuth('/api/pairing/generate', {
                method: 'POST',
                body: JSON.stringify({ 
                    restaurantId: currentRestaurant.id,
                    targetStaffId: selectedStaffId,
                    durationHours: selectedDuration
                })
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

    const formatDate = (date: string) => {
        if (!date) return 'Never';
        return new Date(date).toLocaleString('en-PK', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Fix 7: Improve last-seen timestamp formatting
    const formatLastSeen = (dateString: string) => {
        if (!dateString) return 'Never / کبھی نہیں';
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) return 'Just now / ابھی';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago / ${Math.floor(diffInSeconds / 60)} منٹ پہلے`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago / ${Math.floor(diffInSeconds / 3600)} گھنٹے پہلے`;
        
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const qrData = pairingCode?.qr_payload || '';
    const fingerprint = getDeviceFingerprint();

    return (
        <div className="h-full w-full bg-slate-950 p-6 overflow-y-auto">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Device Pairing / ڈیوائس پیئرنگ</h1>
                    <p className="text-slate-400 text-lg">Generate a QR code to pair new devices with your restaurant / اپنی ریسٹورنٹ کے ساتھ نئی ڈیوائسز جوڑنے کے لیے QR کوڈ بنائیں۔</p>
                </div>

                {/* Error Alert */}
                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <h4 className="text-red-400 font-semibold mb-1">Error / غلطی</h4>
                            <p className="text-red-200/80 text-sm">{error}</p>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* QR Code Section */}
                    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-8 shadow-2xl">
                        <div className="flex flex-col items-center">
                            {!pairingCode ? (
                                <>
                                    <div className="w-64 h-64 bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-600 flex items-center justify-center mb-6">
                                        <QrCode className="w-24 h-24 text-slate-600" />
                                    </div>

                                    {/* Staff Selection */}
                                    <div className="w-full mb-4">
                                        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 text-center text-cyan-400">
                                            Select Staff Member / اسٹاف ممبر منتخب کریں
                                        </label>
                                        <select
                                            value={selectedStaffId}
                                            onChange={(e) => setSelectedStaffId(e.target.value)}
                                            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-cyan-500 outline-none transition-all"
                                        >
                                            <option value="">Choose Staff / اسٹاف کا انتخاب کریں</option>
                                            {servers.map(staff => (
                                                <option key={staff.id} value={staff.id}>
                                                    {staff.name} ({staff.role})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    {/* Duration Selection */}
                                    <div className="w-full mb-6">
                                        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 text-center">
                                            Authorization Duration / اجازت کا دورانیہ
                                        </label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { label: '2 Hr', value: 2 },
                                                { label: '8 Hr', value: 8 },
                                                { label: '24 Hr', value: 24 },
                                                { label: '3 Days', value: 72 },
                                                { label: '7 Days', value: 168 },
                                                { label: 'Life', value: 87600 },
                                            ].map((opt) => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => setSelectedDuration(opt.value)}
                                                    className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${
                                                        selectedDuration === opt.value
                                                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                                                            : 'bg-slate-800/50 border-slate-700 text-slate-500 hover:border-slate-600'
                                                    }`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <button
                                        onClick={generatePairingCode}
                                        disabled={loading || !selectedStaffId}
                                        className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:from-slate-700 disabled:to-slate-800 text-lg"
                                    >

                                        {loading ? (
                                            <>
                                                <RefreshCw className="w-6 h-6 animate-spin" />
                                                Generating... / بن رہا ہے...
                                            </>
                                        ) : (
                                            <>
                                                <QrCode className="w-6 h-6" />
                                                Generate Code / کوڈ بنائیں
                                            </>
                                        )}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="bg-white p-6 rounded-xl mb-6 shadow-inner">
                                        <QRCodeSVG value={qrData}
                                            size={256}
                                            level="H"
                                            includeMargin={true}
                                        />
                                    </div>

                                    {/* Pairing Code Display */}
                                    <div className="w-full bg-slate-950/50 rounded-lg p-5 mb-4 border border-slate-700">
                                        <div className="text-center">
                                            <div className="text-sm text-slate-400 uppercase tracking-widest mb-1 font-bold">Pairing Code / پیئرنگ کوڈ</div>
                                            <div className="text-4xl font-black text-white tracking-[0.2em] mb-2 font-mono">
                                                {pairingCode.pairing_code}
                                            </div>
                                            
                                            {/* Session Details */}
                                            <div className="flex flex-col gap-1 mb-4">
                                                <div className="text-cyan-400 font-bold text-sm">
                                                    Target: {pairingCode.target_staff_name} / اسٹاف: {pairingCode.target_staff_name}
                                                </div>
                                                <div className="text-slate-500 text-xs font-medium">
                                                    Duration: {pairingCode.session_duration_hours === 87600 ? 'Permanent' : `${pairingCode.session_duration_hours} Hours`} / دورانیہ: {pairingCode.session_duration_hours === 87600 ? 'مستقل' : `${pairingCode.session_duration_hours} گھنٹے`}
                                                </div>
                                            </div>

                                            <button
                                                onClick={copyToClipboard}
                                                className="text-sm border border-cyan-500/30 px-4 py-1.5 rounded-full text-cyan-400 hover:bg-cyan-500/10 flex items-center gap-2 mx-auto transition-all"
                                            >
                                                {copied ? (
                                                    <>
                                                        <CheckCircle2 className="w-4 h-4" />
                                                        Copied!
                                                    </>
                                                ) : (
                                                    <>
                                                        <Copy className="w-4 h-4" />
                                                        Copy Code / کاپی کریں
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Timer */}
                                    <div className="flex items-center gap-3 text-amber-400 mb-6 bg-amber-500/10 px-4 py-2 rounded-full border border-amber-500/20">
                                        <Clock className="w-5 h-5" />
                                        <span className="text-xl font-black font-mono">
                                            {formatTime(timeRemaining)}
                                        </span>
                                    </div>

                                    <div className="flex flex-col gap-3 w-full">
                                        <button
                                            onClick={generatePairingCode}
                                            className="w-full px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-all flex items-center justify-center gap-2 font-bold"
                                        >
                                            <RefreshCw className="w-4 h-4" />
                                            Generate New Code / نیا کوڈ بنائیں
                                        </button>

                                        <button
                                            onClick={() => setPairingCode(null)}
                                            className="w-full px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl transition-all flex items-center justify-center gap-2 font-bold"
                                        >
                                            <X className="w-4 h-4" />
                                            Pair Another Staff / دوسرے اسٹاف کے لیے کوڈ بنائیں
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Instructions Section */}
                    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-8 shadow-2xl">
                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                            <Smartphone className="w-6 h-6 text-cyan-400" />
                            How to Pair a Device / ڈیوائس کیسے جوڑیں
                        </h2>

                        <div className="space-y-6 mb-8">
                            <div className="flex gap-4">
                                <div className="flex-shrink-0 w-8 h-8 bg-cyan-500/20 text-cyan-400 rounded-full flex items-center justify-center font-bold border border-cyan-500/30">
                                    1
                                </div>
                                <div>
                                    <h3 className="text-white font-semibold mb-1">Generate Code</h3>
                                    <p className="text-slate-400 text-sm">Click "Generate Code" to create a new QR code. Valid for 15 mins. / "Generate Code" پر کلک کریں۔ یہ 15 منٹ کے لیے کارآمد ہوگا۔</p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-shrink-0 w-8 h-8 bg-cyan-500/20 text-cyan-400 rounded-full flex items-center justify-center font-bold border border-cyan-500/30">
                                    2
                                </div>
                                <div>
                                    <h3 className="text-white font-semibold mb-1">Scan QR Code</h3>
                                    <p className="text-slate-400 text-sm">On your phone/tablet, open FireFlow and select "Pair Device". Scan the QR code. / اپنے فون پر فائر فلو کھولیں اور QR کوڈ اسکین کریں۔</p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-shrink-0 w-8 h-8 bg-cyan-500/20 text-cyan-400 rounded-full flex items-center justify-center font-bold border border-cyan-500/30">
                                    3
                                </div>
                                <div>
                                    <h3 className="text-white font-semibold mb-1">Fingerprint Lock</h3>
                                    <p className="text-slate-400 text-sm italic">Each code is locked to the first device that scans it. / ہر کوڈ پہلے اسکین کرنے والی ڈیوائس کے لیے لاک ہو جاتا ہے۔</p>
                                </div>
                            </div>
                        </div>

                        {/* Feature 1: Paired Device List */}
                        <div className="mt-10 border-t border-slate-700 pt-8">
                            <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4" />
                                Registered Devices / رجسٹرڈ ڈیوائسز ({pairedDevices.length})
                            </h3>
                            <div className="space-y-3">
                                {pairedDevices.length === 0 ? (
                                    <div className="text-slate-600 italic text-sm py-6 border-2 border-dashed border-slate-800 rounded-xl text-center">
                                        No devices paired yet.
                                    </div>
                                ) : (
                                    pairedDevices.map(device => (
                                        <div key={device.id} className="flex items-center justify-between p-4 bg-slate-950/50 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center">
                                                    <Smartphone className="w-5 h-5 text-cyan-400" />
                                                </div>
                                                <div>
                                                    <div className="text-white text-sm font-bold flex items-center gap-2">
                                                        {device.device_name}
                                                        {device.is_active && <span className="text-[10px] bg-green-500/20 text-green-400 px-2 rounded-full border border-green-500/30">Active</span>}
                                                    </div>
                                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                                                        {device.platform} • {formatDate(device.last_sync_at)}
                                                        {device.expires_at && (
                                                            <span className="text-amber-500 ml-2">
                                                                • Expires: {new Date(device.expires_at).toLocaleString()}
                                                            </span>
                                                        )}
                                                    </p>
                                                    <div className="text-slate-500 text-xs mt-0.5">
                                                        Last seen: <span className="text-slate-300 font-medium">{formatLastSeen(device.last_sync_at)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={`w-3 h-3 rounded-full ${device.is_active ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)] animate-pulse' : 'bg-slate-700'}`} />
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
