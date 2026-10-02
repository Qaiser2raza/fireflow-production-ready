import React, { useState } from 'react';
import { Copy, Eye, EyeOff, CheckCircle2, Lock, ArrowRight } from 'lucide-react';

interface SetupTokenDisplayProps {
    restaurantId: string;
    setupToken: string;
    temporaryPin: string;
    restaurantName?: string;
    onProceed: () => void;
}

export const SetupTokenDisplay: React.FC<SetupTokenDisplayProps> = ({
    restaurantId,
    setupToken,
    temporaryPin,
    restaurantName,
    onProceed,
}) => {
const [showPin, setShowPin] = useState(false);
    const [copiedPin, setCopiedPin] = useState(false);

    const copyToClipboard = async (text: string, setter: (v: boolean) => void) => {
        try {
            await navigator.clipboard.writeText(text);
            setter(true);
            setTimeout(() => setter(false), 2000);
        } catch {
            // Clipboard not available — user can manually copy
        }
    };

    const handleProceed = () => {
        localStorage.setItem('restaurant_id', restaurantId);
        setShowPin(false);
        onProceed();
    };

    return (
        <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold-500 to-transparent opacity-30"></div>
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-900/10 rounded-full blur-[128px]"></div>

            <div className="w-full max-w-xl relative z-10">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 mb-4">
                        <CheckCircle2 className="text-emerald-500" size={26} />
                    </div>
                    <h1 className="text-2xl font-serif font-bold text-white">
                        Workspace Created{restaurantName ? `, ${restaurantName}` : ''}
                    </h1>
                    <p className="text-slate-500 text-xs font-black uppercase tracking-widest mt-2">
                        Check your email to verify your account
                    </p>
                </div>

                <div className="mb-6 bg-sky-500/10 border border-sky-500/25 text-sky-200 text-sm rounded-2xl px-4 py-3 leading-relaxed">
                    We sent a verification link to your email address. Open it to activate your
                    account, then sign in with your email and password.
                </div>

                <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl shadow-2xl p-8">
                    <div className="space-y-6">
                        <div>
                            <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-2 block">
                                Restaurant
                            </label>
                            <div className="text-white font-medium text-lg">{restaurantName || restaurantId}</div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-black text-slate-600 uppercase tracking-wider">
                                    POS PIN for Staff Devices
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setShowPin(!showPin)}
                                    className="text-slate-500 hover:text-slate-300 transition-colors"
                                >
                                    {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            <div className="relative">
                                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                                <input
                                    type={showPin ? 'text' : 'password'}
                                    value={temporaryPin}
                                    readOnly
                                    onClick={e => e.currentTarget.select()}
                                    className={`w-full bg-slate-950/60 border rounded-xl px-4 py-3 text-white text-3xl font-mono font-black tracking-[0.3em] outline-none focus:border-gold-500/50 pl-10 ${copiedPin ? 'border-emerald-500/50' : 'border-slate-800'}`}
                                />
                                <button
                                    type="button"
                                    onClick={() => copyToClipboard(temporaryPin, setCopiedPin)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-gold-400 transition-colors p-1"
                                    title="Copy PIN"
                                >
                                    <Copy size={14} />
                                </button>
                            </div>
                            {copiedPin && (
                                <div className="mt-1 text-[10px] text-emerald-400 font-black uppercase tracking-widest">
                                    Copied
                                </div>
                            )}
                            <p className="text-[10px] text-slate-600 mt-2">
                                This is your POS PIN for staff devices, not your sign-in password. It is shown
                                once and must be changed at first login.
                            </p>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs font-black text-slate-600 uppercase tracking-wider">
                                    Setup Token
                                </label>
                                <button
                                    type="button"
                                    onClick={() => copyToClipboard(setupToken, () => {})}
                                    className="text-slate-500 hover:text-slate-300 transition-colors"
                                    title="Copy setup token"
                                >
                                    <Copy size={14} />
                                </button>
                            </div>
                            <div className="bg-slate-950/40 border border-slate-800 rounded-xl px-4 py-3 font-mono text-xs text-slate-400 break-all">
                                {setupToken}
                            </div>
                            <p className="text-[10px] text-slate-600 mt-2">
                                Token used to verify your identity before first login.
                            </p>
                        </div>

                        <div className="pt-4 border-t border-slate-800">
                            <button
                                onClick={handleProceed}
                                className="w-full py-3.5 rounded-xl font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 bg-gold-500 hover:bg-gold-400 text-slate-950 shadow-lg transition-all"
                            >
                                Go to sign in <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mt-6 text-center">
                    <p className="text-xs text-slate-600">
                        🔒 FireFlow Restaurant — Powered by Fireflow
                    </p>
                </div>
            </div>
        </div>
    );
};
