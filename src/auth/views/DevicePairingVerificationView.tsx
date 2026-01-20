import React, { useState, useEffect, useRef } from 'react';
import {
    Smartphone,
    AlertCircle,
    CheckCircle2,
    Loader,
    Camera,
    Type,
    ArrowLeft
} from 'lucide-react';
import jsQR from 'jsqr';
import { Button } from '../../shared/ui/Button';
import { Input } from '../../shared/ui/Input';
import { Card } from '../../shared/ui/Card';
import { Badge } from '../../shared/ui/Badge';

interface DeviceFingerprint {
    userAgent: string;
    screenWidth: number;
    screenHeight: number;
    timezone: string;
    hash: string;
}

interface QRCodeData {
    code: string;
    code_id: string;
    restaurantId: string;
    restaurantName: string;
    deviceFingerprint: string;
    type: string;
    version: string;
}

interface DevicePairingVerificationViewProps {
    onPairingSuccess?: () => void;
    onCancel?: () => void;
}

/**
 * Generate device fingerprint for pairing verification
 * MUST match server-side generation in PairingService.ts
 * 
 * Hash formula: SHA256(userAgent + screen dimensions + timezone)
 * Client-side uses simple hash (non-cryptographic but consistent)
 */
function generateDeviceFingerprint(): DeviceFingerprint {
    const userAgent = navigator.userAgent;
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const fingerprintString = `${userAgent}|${screenWidth}|${screenHeight}|${timezone}`;

    // Same algorithm as QRCodePairing.tsx for consistency
    let hash = 0;
    for (let i = 0; i < fingerprintString.length; i++) {
        const char = fingerprintString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }

    return {
        userAgent,
        screenWidth,
        screenHeight,
        timezone,
        hash: Math.abs(hash).toString(16).padStart(8, '0')
    };
}

/**
 * Securely store auth token in Electron or browser context
 * 
 * Electron: Use electron-store with encryption
 * Browser: Use sessionStorage (cleared on tab close)
 */
async function storeAuthToken(token: string, deviceId: string): Promise<void> {
    try {
        // Try Electron IPC first
        const win = window as any;
        if (win.electron?.store) {
            await win.electron.store.set('deviceAuthToken', token);
            await win.electron.store.set('deviceId', deviceId);
        } else {
            // Fallback: sessionStorage (not persisted)
            sessionStorage.setItem('deviceAuthToken', token);
            sessionStorage.setItem('deviceId', deviceId);
            console.warn('⚠️ Using sessionStorage for auth token. Not recommended for production.');
        }
    } catch (error) {
        console.error('Failed to store auth token:', error);
        throw new Error('Failed to store authentication token securely');
    }
}

/**
 * Main Device Pairing Verification Component
 * 
 * Responsibilities:
 * - QR code scanning (camera input)
 * - Manual 6-char code entry
 * - Device fingerprint generation + transmission
 * - Call /api/pairing/verify endpoint
 * - Secure token storage
 * - Error handling with specific error codes
 */
export const DevicePairingVerificationView: React.FC<DevicePairingVerificationViewProps> = ({
    onPairingSuccess,
    onCancel
}) => {
    // === STATE ===
    const [mode, setMode] = useState<'method-select' | 'qr-scan' | 'manual-entry' | 'verifying' | 'success' | 'error'>('method-select');
    const [manualCode, setManualCode] = useState('');
    const [qrCodeData, setQrCodeData] = useState<QRCodeData | null>(null);
    const [deviceFingerprint, setDeviceFingerprint] = useState<DeviceFingerprint | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [deviceName, setDeviceName] = useState('');
    const [platform, setPlatform] = useState('');
    const [showDeviceNamePrompt, setShowDeviceNamePrompt] = useState(false);

    // === REFS ===
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // === EFFECTS ===

    // Initialize device fingerprint on mount
    useEffect(() => {
        const fp = generateDeviceFingerprint();
        setDeviceFingerprint(fp);

        // Detect platform
        const ua = navigator.userAgent.toLowerCase();
        let detectedPlatform = 'unknown';
        if (ua.includes('win')) detectedPlatform = 'win32';
        else if (ua.includes('mac')) detectedPlatform = 'darwin';
        else if (ua.includes('linux')) detectedPlatform = 'linux';
        else if (ua.includes('android')) detectedPlatform = 'android';
        else if (ua.includes('iphone') || ua.includes('ipad')) detectedPlatform = 'ios';

        setPlatform(detectedPlatform);

        // Generate default device name based on platform + screen size
        const devName = `${detectedPlatform}-${fp.screenWidth}x${fp.screenHeight}`;
        setDeviceName(devName);
    }, []);

    // Cleanup camera on unmount
    useEffect(() => {
        return () => {
            stopCamera();
        };
    }, []);

    // === CAMERA FUNCTIONS ===

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                streamRef.current = stream;
                setCameraActive(true);
                setMode('qr-scan');
                startQRScanning();
            }
        } catch (error: any) {
            console.error('Camera access denied:', error);
            setError('Unable to access camera. Please ensure permissions are granted.');
            setMode('method-select');
        }
    };

    const stopCamera = () => {
        if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        setCameraActive(false);
    };

    const startQRScanning = () => {
        scanIntervalRef.current = setInterval(() => {
            if (videoRef.current && canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                if (!ctx) return;

                // Draw video frame to canvas
                canvasRef.current.width = videoRef.current.videoWidth;
                canvasRef.current.height = videoRef.current.videoHeight;
                ctx.drawImage(videoRef.current, 0, 0);

                // Scan for QR code
                const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);

                if (code) {
                    try {
                        const data = JSON.parse(code.data) as QRCodeData;
                        if (data.type === 'device_pairing' && data.code && data.code_id) {
                            // Valid QR code detected
                            setQrCodeData(data);
                            setManualCode(data.code);
                            stopCamera();
                            setShowDeviceNamePrompt(true);
                        }
                    } catch (e) {
                        // Invalid QR format, keep scanning
                    }
                }
            }
        }, 200);
    };

    // === VERIFICATION FUNCTION ===

    const verifyPairingCode = async (codeToVerify: string, codeId: string, restaurantId: string) => {
        if (!deviceFingerprint) {
            setError('Device fingerprint not initialized');
            setMode('error');
            return;
        }

        setMode('verifying');
        setError(null);

        try {
            // Validation
            if (!/^[A-Z0-9]{6}$/.test(codeToVerify)) {
                throw new Error('INVALID_CODE');
            }

            // Call verify endpoint
            const response = await fetch('/api/pairing/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    restaurantId,
                    codeId,
                    code: codeToVerify,
                    deviceFingerprint: deviceFingerprint.hash,
                    deviceName: deviceName || `Device-${deviceFingerprint.hash.substring(0, 4)}`,
                    userAgent: deviceFingerprint.userAgent,
                    platform
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const result = await response.json();

            // Store token securely
            await storeAuthToken(result.auth_token, result.device_id);

            // Success state
            setMode('success');

            // Redirect after 2 seconds
            setTimeout(() => {
                if (onPairingSuccess) {
                    onPairingSuccess();
                } else {
                    window.location.href = '/';
                }
            }, 2000);
        } catch (error: any) {
            console.error('Pairing verification failed:', error);
            setError(mapErrorCode(error.message));
            setMode('error');
        }
    };

    // === MANUAL ENTRY SUBMIT ===

    const handleManualSubmit = async () => {
        if (manualCode.length !== 6) {
            setError('Code must be 6 characters');
            return;
        }

        if (!qrCodeData) {
            setError('Missing pairing code ID. Please scan QR code first.');
            return;
        }

        setShowDeviceNamePrompt(true);
    };

    const handleVerifyFromPrompt = async () => {
        if (!qrCodeData) {
            setError('Missing pairing data');
            return;
        }

        await verifyPairingCode(
            manualCode,
            qrCodeData.code_id,
            qrCodeData.restaurantId
        );
    };

    // === ERROR MAPPING ===

    const mapErrorCode = (code: string): string => {
        const errorMap: Record<string, string> = {
            'INVALID_CODE': 'Invalid pairing code. Please check and try again.',
            'CODE_EXPIRED': 'This pairing code has expired. Generate a new one on the manager device.',
            'CODE_ALREADY_USED': 'This code has already been used. Generate a new one.',
            'TOO_MANY_ATTEMPTS': 'Too many failed attempts. Wait a moment before trying again.',
            'DEVICE_BLOCKED': 'Your device is blocked. Contact your restaurant manager.'
        };

        return errorMap[code] || code || 'An error occurred during pairing. Please try again.';
    };

    // === RENDER ===

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
            {/* Background accent */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-30" />

            <div className="w-full max-w-2xl">
                {/* === METHOD SELECT MODE === */}
                {mode === 'method-select' && (
                    <Card className="bg-slate-900 border-slate-700 shadow-2xl">
                        <div className="p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <Smartphone className="w-8 h-8 text-cyan-400" />
                                <h1 className="text-3xl font-bold text-white">Pair Your Device</h1>
                            </div>

                            <p className="text-slate-400 mb-8">
                                To get started, your device needs to be paired with the Fireflow system.
                                Scan a QR code from your manager's device or enter the code manually.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                <button
                                    onClick={startCamera}
                                    className="p-6 border-2 border-slate-700 hover:border-cyan-500 rounded-lg transition-all bg-slate-800/50 hover:bg-slate-800 flex flex-col items-center gap-3 group"
                                >
                                    <Camera className="w-8 h-8 text-slate-400 group-hover:text-cyan-400 transition-colors" />
                                    <div className="text-left w-full">
                                        <h3 className="text-white font-semibold">Scan QR Code</h3>
                                        <p className="text-slate-500 text-sm">Use your camera to scan</p>
                                    </div>
                                </button>

                                <button
                                    onClick={() => setMode('manual-entry')}
                                    className="p-6 border-2 border-slate-700 hover:border-cyan-500 rounded-lg transition-all bg-slate-800/50 hover:bg-slate-800 flex flex-col items-center gap-3 group"
                                >
                                    <Type className="w-8 h-8 text-slate-400 group-hover:text-cyan-400 transition-colors" />
                                    <div className="text-left w-full">
                                        <h3 className="text-white font-semibold">Enter Code</h3>
                                        <p className="text-slate-500 text-sm">6-character code</p>
                                    </div>
                                </button>
                            </div>

                            {deviceFingerprint && (
                                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                                    <div className="flex gap-3">
                                        <Smartphone className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="text-blue-400 font-semibold mb-1 text-sm">Device Security</h4>
                                            <p className="text-blue-200/80 text-xs">
                                                Fingerprint: {deviceFingerprint.hash}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {onCancel && (
                                <Button
                                    variant="ghost"
                                    onClick={onCancel}
                                    className="w-full mt-6"
                                >
                                    <ArrowLeft className="w-4 h-4 mr-2" />
                                    Cancel
                                </Button>
                            )}
                        </div>
                    </Card>
                )}

                {/* === QR SCAN MODE === */}
                {mode === 'qr-scan' && cameraActive && (
                    <Card className="bg-slate-900 border-slate-700 shadow-2xl">
                        <div className="p-8">
                            <div className="mb-6">
                                <h2 className="text-2xl font-bold text-white mb-2">Scan QR Code</h2>
                                <p className="text-slate-400 text-sm">Position the QR code in your camera's view</p>
                            </div>

                            <div className="relative bg-black rounded-lg overflow-hidden mb-6 aspect-video">
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    className="w-full h-full object-cover"
                                />
                                <canvas
                                    ref={canvasRef}
                                    className="hidden"
                                />

                                {/* Scan guide overlay */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-48 h-48 border-2 border-cyan-500 rounded-lg opacity-50" />
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        stopCamera();
                                        setMode('method-select');
                                    }}
                                    className="flex-1"
                                >
                                    <ArrowLeft className="w-4 h-4 mr-2" />
                                    Back
                                </Button>

                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        stopCamera();
                                        setMode('manual-entry');
                                    }}
                                    className="flex-1"
                                >
                                    <Type className="w-4 h-4 mr-2" />
                                    Enter Code
                                </Button>
                            </div>
                        </div>
                    </Card>
                )}

                {/* === MANUAL ENTRY MODE === */}
                {mode === 'manual-entry' && (
                    <Card className="bg-slate-900 border-slate-700 shadow-2xl">
                        <div className="p-8">
                            <div className="mb-6">
                                <h2 className="text-2xl font-bold text-white mb-2">Enter Pairing Code</h2>
                                <p className="text-slate-400 text-sm">Get this 6-character code from your manager's device</p>
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                    Pairing Code
                                </label>
                                <Input
                                    type="text"
                                    placeholder="ABC123"
                                    value={manualCode}
                                    onChange={(e) => setManualCode(e.target.value.toUpperCase().slice(0, 6))}
                                    maxLength={6}
                                    autoFocus
                                    className="text-center text-2xl font-mono tracking-widest"
                                />
                                <p className="text-slate-500 text-xs mt-2 text-center">
                                    {manualCode.length}/6 characters
                                </p>
                            </div>

                            {error && (
                                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                                    <p className="text-red-200 text-sm">{error}</p>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        setMode('method-select');
                                        setError(null);
                                    }}
                                    className="flex-1"
                                >
                                    <ArrowLeft className="w-4 h-4 mr-2" />
                                    Back
                                </Button>

                                <Button
                                    disabled={manualCode.length !== 6}
                                    onClick={handleManualSubmit}
                                    className="flex-1"
                                >
                                    Continue
                                </Button>
                            </div>
                        </div>
                    </Card>
                )}

                {/* === DEVICE NAME PROMPT === */}
                {showDeviceNamePrompt && qrCodeData && (
                    <Card className="bg-slate-900 border-slate-700 shadow-2xl">
                        <div className="p-8">
                            <div className="mb-6">
                                <h2 className="text-2xl font-bold text-white mb-2">Device Name</h2>
                                <p className="text-slate-400 text-sm">Give this device a friendly name (optional)</p>
                            </div>

                            <div className="mb-6">
                                <Input
                                    type="text"
                                    placeholder={`e.g., Waiter-Tablet-1, Kitchen-Display`}
                                    value={deviceName}
                                    onChange={(e) => setDeviceName(e.target.value)}
                                    maxLength={50}
                                />
                                <p className="text-slate-500 text-xs mt-2">
                                    {deviceName.length}/50 characters
                                </p>
                            </div>

                            <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg mb-6">
                                <p className="text-slate-400 text-sm">
                                    <span className="font-semibold text-white">Restaurant:</span> {qrCodeData.restaurantName}
                                </p>
                                <p className="text-slate-400 text-sm mt-2">
                                    <span className="font-semibold text-white">Code:</span> {manualCode}
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        setShowDeviceNamePrompt(false);
                                        setMode('manual-entry');
                                    }}
                                    className="flex-1"
                                >
                                    <ArrowLeft className="w-4 h-4 mr-2" />
                                    Back
                                </Button>

                                <Button
                                    onClick={handleVerifyFromPrompt}
                                    className="flex-1"
                                >
                                    Confirm & Pair
                                </Button>
                            </div>
                        </div>
                    </Card>
                )}

                {/* === VERIFYING MODE === */}
                {mode === 'verifying' && (
                    <Card className="bg-slate-900 border-slate-700 shadow-2xl">
                        <div className="p-12 flex flex-col items-center justify-center">
                            <Loader className="w-12 h-12 text-cyan-400 animate-spin mb-4" />
                            <h2 className="text-2xl font-bold text-white mb-2">Verifying Pairing Code</h2>
                            <p className="text-slate-400 text-center">Please wait while we verify your device...</p>
                        </div>
                    </Card>
                )}

                {/* === SUCCESS MODE === */}
                {mode === 'success' && (
                    <Card className="bg-slate-900 border-slate-700 shadow-2xl">
                        <div className="p-12 flex flex-col items-center justify-center">
                            <div className="w-16 h-16 bg-emerald-500/20 border-2 border-emerald-500 rounded-full flex items-center justify-center mb-6">
                                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Device Paired Successfully</h2>
                            <p className="text-slate-400 text-center mb-6">
                                Your device has been registered. Redirecting to the app...
                            </p>
                            <Badge variant="success">Ready to use</Badge>
                        </div>
                    </Card>
                )}

                {/* === ERROR MODE === */}
                {mode === 'error' && (
                    <Card className="bg-slate-900 border-slate-700 shadow-2xl">
                        <div className="p-8">
                            <div className="flex items-start gap-4 mb-6">
                                <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />
                                <div>
                                    <h2 className="text-2xl font-bold text-white mb-2">Pairing Failed</h2>
                                    <p className="text-red-200">{error}</p>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        setMode('method-select');
                                        setError(null);
                                        setManualCode('');
                                        setQrCodeData(null);
                                    }}
                                    className="flex-1"
                                >
                                    <ArrowLeft className="w-4 h-4 mr-2" />
                                    Try Again
                                </Button>
                                {onCancel && (
                                    <Button
                                        variant="ghost"
                                        onClick={onCancel}
                                        className="flex-1"
                                    >
                                        Cancel
                                    </Button>
                                )}
                            </div>
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
};
