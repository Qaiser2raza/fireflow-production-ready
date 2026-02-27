import React, { useState } from 'react';
import { Zap, Building2, Phone, MapPin, Key, CheckCircle2, Loader2, AlertCircle, ChevronRight, Shield, Wifi } from 'lucide-react';

type Step = 'key' | 'details' | 'activating' | 'manager-setup' | 'done';

interface ActivationState {
    licenseKey: string;
    restaurantName: string;
    ownerPhone: string;
    city: string;
    managerName: string;
    managerPin: string;
    managerPinConfirm: string;
    activatedRestaurantId?: string;
    plan?: string;
    trialEndsAt?: string;
}

interface ActivationViewProps {
    onActivationComplete: () => void;
}

export const ActivationView: React.FC<ActivationViewProps> = ({ onActivationComplete }) => {
    const [step, setStep] = useState<Step>('key');
    const [state, setState] = useState<ActivationState>({
        licenseKey: '',
        restaurantName: '',
        ownerPhone: '',
        city: '',
        managerName: '',
        managerPin: '',
        managerPinConfirm: '',
    });
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const updateState = (key: keyof ActivationState, value: string) => {
        setState(prev => ({ ...prev, [key]: value }));
        setError(null);
    };

    // Step 1: Validate the key format locally, then move to details
    const handleKeySubmit = () => {
        const keyPattern = /^FIRE-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
        if (!keyPattern.test(state.licenseKey.trim().toUpperCase())) {
            setError('Invalid key format. Expected: FIRE-XXXX-XXXX-XXXX');
            return;
        }
        setState(prev => ({ ...prev, licenseKey: prev.licenseKey.trim().toUpperCase() }));
        setStep('details');
    };

    // Step 2: Send to backend for cloud handshake
    const handleActivate = async () => {
        if (!state.restaurantName.trim()) { setError('Restaurant name is required'); return; }
        if (!state.ownerPhone.trim()) { setError('Owner phone is required'); return; }
        if (!state.city.trim()) { setError('City is required'); return; }

        setIsLoading(true);
        setStep('activating');
        setError(null);

        try {
            const res = await fetch('http://localhost:3001/api/setup/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    licenseKey: state.licenseKey,
                    restaurantName: state.restaurantName.trim(),
                    ownerPhone: state.ownerPhone.trim(),
                    city: state.city.trim(),
                })
            });

            const result = await res.json();

            if (!res.ok) {
                setError(result.error || 'Activation failed. Please contact FireFlow support.');
                setStep('details');
                return;
            }

            setState(prev => ({
                ...prev,
                activatedRestaurantId: result.restaurant_id,
                plan: result.plan,
                trialEndsAt: result.trial_ends_at,
            }));

            setStep('manager-setup');
        } catch (err: any) {
            setError('Cannot reach FireFlow servers. Check your internet connection and try again.');
            setStep('details');
        } finally {
            setIsLoading(false);
        }
    };

    // Step 3: Create the first manager account
    const handleManagerSetup = async () => {
        if (!state.managerName.trim()) { setError('Your name is required'); return; }
        if (!/^\d{4,6}$/.test(state.managerPin)) { setError('PIN must be 4-6 digits'); return; }
        if (state.managerPin !== state.managerPinConfirm) { setError('PINs do not match'); return; }

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch('http://localhost:3001/api/setup/create-manager', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: state.managerName.trim(),
                    pin: state.managerPin,
                    restaurantId: state.activatedRestaurantId,
                })
            });

            if (!res.ok) {
                const result = await res.json();
                setError(result.error || 'Failed to create manager account');
                return;
            }

            setStep('done');
        } catch (err) {
            setError('Server error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const planColors: Record<string, string> = {
        BASIC: 'text-blue-400',
        STANDARD: 'text-gold-500',
        PREMIUM: 'text-purple-400',
    };

    return (
        <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background ambience */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gold-500/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-0 left-1/4 w-[400px] h-[300px] bg-blue-500/5 rounded-full blur-[100px]" />
            </div>

            <div className="w-full max-w-lg relative z-10">
                {/* Logo */}
                <div className="flex items-center gap-3 mb-10 justify-center">
                    <div className="w-12 h-12 bg-gold-500/10 border border-gold-500/30 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(234,179,8,0.15)]">
                        <Zap className="text-gold-500" size={26} />
                    </div>
                    <div>
                        <h1 className="text-white font-serif font-bold text-2xl leading-none">FireFlow</h1>
                        <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">Restaurant Intelligence</p>
                    </div>
                </div>

                {/* Progress Dots */}
                <div className="flex items-center justify-center gap-2 mb-8">
                    {(['key', 'details', 'activating', 'manager-setup', 'done'] as Step[]).map((s, i) => (
                        <div
                            key={s}
                            className={`rounded-full transition-all duration-500 ${s === step
                                    ? 'w-6 h-2 bg-gold-500'
                                    : ['key', 'details', 'activating', 'manager-setup', 'done'].indexOf(step) > i
                                        ? 'w-2 h-2 bg-green-500'
                                        : 'w-2 h-2 bg-slate-700'
                                }`}
                        />
                    ))}
                </div>

                {/* STEP 1: License Key */}
                {step === 'key' && (
                    <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-8 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="mb-6">
                            <h2 className="text-white font-serif font-bold text-2xl">Enter Your License Key</h2>
                            <p className="text-slate-500 text-sm mt-2">Your activation key was sent by the FireFlow team. It looks like <span className="text-gold-500 font-mono">FIRE-XXXX-XXXX-XXXX</span></p>
                        </div>

                        <div className="space-y-4">
                            <div className="relative">
                                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                <input
                                    type="text"
                                    placeholder="FIRE-XXXX-XXXX-XXXX"
                                    value={state.licenseKey}
                                    onChange={e => updateState('licenseKey', e.target.value.toUpperCase())}
                                    onKeyDown={e => e.key === 'Enter' && handleKeySubmit()}
                                    maxLength={19}
                                    className="w-full bg-slate-950/80 border border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-gold-400 font-mono text-lg font-bold outline-none focus:border-gold-500/60 transition-all placeholder:text-slate-700 tracking-widest uppercase"
                                    autoFocus
                                />
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                                    <AlertCircle size={16} />
                                    {error}
                                </div>
                            )}

                            <button
                                onClick={handleKeySubmit}
                                className="w-full h-14 bg-gold-500 hover:bg-gold-400 text-slate-950 font-black uppercase tracking-widest text-sm rounded-2xl flex items-center justify-center gap-2 transition-all shadow-[0_0_30px_rgba(234,179,8,0.2)] hover:shadow-[0_0_40px_rgba(234,179,8,0.35)]"
                            >
                                Continue <ChevronRight size={18} />
                            </button>
                        </div>

                        <p className="text-center text-slate-600 text-xs font-medium mt-6">
                            Don't have a key? Contact us on WhatsApp to get started.
                        </p>
                    </div>
                )}

                {/* STEP 2: Restaurant Details */}
                {step === 'details' && (
                    <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-8 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="mb-6">
                            <div className="inline-flex items-center gap-2 mb-3 bg-gold-500/10 border border-gold-500/20 rounded-lg px-3 py-1.5">
                                <Key size={12} className="text-gold-500" />
                                <span className="text-gold-500 font-mono text-xs font-bold">{state.licenseKey}</span>
                            </div>
                            <h2 className="text-white font-serif font-bold text-2xl">Tell us about your restaurant</h2>
                            <p className="text-slate-500 text-sm mt-1">This information will appear in your reports and notifications.</p>
                        </div>

                        <div className="space-y-3">
                            <div className="relative">
                                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                <input
                                    type="text"
                                    placeholder="Restaurant Name"
                                    value={state.restaurantName}
                                    onChange={e => updateState('restaurantName', e.target.value)}
                                    className="w-full bg-slate-950/80 border border-slate-700 rounded-2xl pl-11 pr-4 py-3.5 text-white font-medium outline-none focus:border-gold-500/60 transition-all placeholder:text-slate-600"
                                />
                            </div>

                            <div className="relative">
                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                <input
                                    type="tel"
                                    placeholder="Owner Phone (e.g. 0300-1234567)"
                                    value={state.ownerPhone}
                                    onChange={e => updateState('ownerPhone', e.target.value)}
                                    className="w-full bg-slate-950/80 border border-slate-700 rounded-2xl pl-11 pr-4 py-3.5 text-white font-medium outline-none focus:border-gold-500/60 transition-all placeholder:text-slate-600"
                                />
                            </div>

                            <div className="relative">
                                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                <input
                                    type="text"
                                    placeholder="City (e.g. Karachi)"
                                    value={state.city}
                                    onChange={e => updateState('city', e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleActivate()}
                                    className="w-full bg-slate-950/80 border border-slate-700 rounded-2xl pl-11 pr-4 py-3.5 text-white font-medium outline-none focus:border-gold-500/60 transition-all placeholder:text-slate-600"
                                />
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                                    <AlertCircle size={16} />
                                    {error}
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setStep('key')}
                                    className="flex-1 h-14 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black uppercase tracking-widest text-xs rounded-2xl transition-all"
                                >
                                    Back
                                </button>
                                <button
                                    onClick={handleActivate}
                                    className="flex-[2] h-14 bg-gold-500 hover:bg-gold-400 text-slate-950 font-black uppercase tracking-widest text-sm rounded-2xl flex items-center justify-center gap-2 transition-all shadow-[0_0_30px_rgba(234,179,8,0.2)]"
                                >
                                    <Wifi size={16} />
                                    Activate Now
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 3: Activating (loading state) */}
                {step === 'activating' && (
                    <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 backdrop-blur-sm animate-in fade-in duration-500 text-center">
                        <div className="w-20 h-20 bg-gold-500/10 border border-gold-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(234,179,8,0.1)]">
                            <Loader2 className="text-gold-500 animate-spin" size={36} />
                        </div>
                        <h2 className="text-white font-serif font-bold text-2xl mb-2">Connecting to FireFlow Cloud</h2>
                        <p className="text-slate-500 text-sm">
                            Validating your license and setting up your restaurant profile...
                        </p>
                        <div className="mt-8 space-y-2 text-left max-w-xs mx-auto">
                            {['Validating license key', 'Registering restaurant profile', 'Configuring local database', 'Finalizing setup'].map((msg, i) => (
                                <div key={i} className="flex items-center gap-3 text-slate-500 text-xs">
                                    <Loader2 size={12} className="animate-spin shrink-0" />
                                    {msg}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* STEP 4: Manager Setup */}
                {step === 'manager-setup' && (
                    <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-8 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Trial Banner */}
                        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 mb-6 flex items-center gap-3">
                            <CheckCircle2 className="text-green-500 shrink-0" size={20} />
                            <div>
                                <p className="text-green-400 font-black text-sm uppercase tracking-wider">Activated Successfully!</p>
                                <p className="text-slate-400 text-xs mt-0.5">
                                    <span className={planColors[state.plan || 'BASIC'] || 'text-gold-500'}>{state.plan} Plan</span>
                                    {state.trialEndsAt && (
                                        <> · Free trial until <strong className="text-white">{new Date(state.trialEndsAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></>
                                    )}
                                </p>
                            </div>
                        </div>

                        <div className="mb-6">
                            <h2 className="text-white font-serif font-bold text-2xl">Create Your Manager Account</h2>
                            <p className="text-slate-500 text-sm mt-1">You'll use this PIN to log in and manage the restaurant.</p>
                        </div>

                        <div className="space-y-3">
                            <div className="relative">
                                <Shield className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                <input
                                    type="text"
                                    placeholder="Your Full Name"
                                    value={state.managerName}
                                    onChange={e => updateState('managerName', e.target.value)}
                                    className="w-full bg-slate-950/80 border border-slate-700 rounded-2xl pl-11 pr-4 py-3.5 text-white font-medium outline-none focus:border-gold-500/60 transition-all placeholder:text-slate-600"
                                    autoFocus
                                />
                            </div>

                            <input
                                type="password"
                                placeholder="Set 4-digit PIN"
                                value={state.managerPin}
                                onChange={e => updateState('managerPin', e.target.value.replace(/\D/g, '').slice(0, 6))}
                                inputMode="numeric"
                                maxLength={6}
                                className="w-full bg-slate-950/80 border border-slate-700 rounded-2xl px-4 py-3.5 text-white font-mono text-xl font-bold tracking-[0.5em] outline-none focus:border-gold-500/60 transition-all placeholder:text-slate-600 placeholder:text-sm placeholder:tracking-normal"
                            />

                            <input
                                type="password"
                                placeholder="Confirm PIN"
                                value={state.managerPinConfirm}
                                onChange={e => updateState('managerPinConfirm', e.target.value.replace(/\D/g, '').slice(0, 6))}
                                onKeyDown={e => e.key === 'Enter' && handleManagerSetup()}
                                inputMode="numeric"
                                maxLength={6}
                                className="w-full bg-slate-950/80 border border-slate-700 rounded-2xl px-4 py-3.5 text-white font-mono text-xl font-bold tracking-[0.5em] outline-none focus:border-gold-500/60 transition-all placeholder:text-slate-600 placeholder:text-sm placeholder:tracking-normal"
                            />

                            {error && (
                                <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                                    <AlertCircle size={16} />
                                    {error}
                                </div>
                            )}

                            <button
                                onClick={handleManagerSetup}
                                disabled={isLoading}
                                className="w-full h-14 bg-gold-500 hover:bg-gold-400 disabled:opacity-60 text-slate-950 font-black uppercase tracking-widest text-sm rounded-2xl flex items-center justify-center gap-2 transition-all"
                            >
                                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                                {isLoading ? 'Creating Account...' : 'Create Manager Account'}
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 5: Done */}
                {step === 'done' && (
                    <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-500 text-center">
                        <div className="w-24 h-24 bg-green-500/10 border border-green-500/30 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-[0_0_50px_rgba(34,197,94,0.15)]">
                            <CheckCircle2 className="text-green-500" size={44} />
                        </div>
                        <h2 className="text-white font-serif font-bold text-3xl mb-2">You're All Set!</h2>
                        <p className="text-slate-400 text-sm mb-2">
                            <span className="text-white font-bold">{state.restaurantName}</span> is ready to take its first order.
                        </p>
                        <p className="text-slate-500 text-xs mb-10">
                            Your {state.plan} trial runs until {state.trialEndsAt ? new Date(state.trialEndsAt).toLocaleDateString() : '—'}
                        </p>

                        <button
                            onClick={onActivationComplete}
                            className="w-full h-14 bg-gold-500 hover:bg-gold-400 text-slate-950 font-black uppercase tracking-widest text-sm rounded-2xl flex items-center justify-center gap-2 transition-all shadow-[0_0_40px_rgba(234,179,8,0.25)]"
                        >
                            <Zap size={20} />
                            Launch FireFlow
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
