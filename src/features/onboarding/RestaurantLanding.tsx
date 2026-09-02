import React, { useState } from 'react';
import { Store, Mail, User, Phone, MapPin, Lock, ArrowRight, Shield } from 'lucide-react';

interface RestaurantLandingProps {
  onAccountCreated: (data: { restaurant_id: string; setup_token: string; temporary_pin: string }) => void;
}

export const RestaurantLanding: React.FC<RestaurantLandingProps> = ({ onAccountCreated }) => {
    const [formData, setFormData] = useState({
        restaurantName: '',
        ownerName: '',
        ownerEmail: '',
        address: '',
        phone: '',
    });
    const [isProvisioning, setIsProvisioning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isProvisioning) return;

        if (!formData.restaurantName.trim() || formData.restaurantName.length < 2) {
            setError('Restaurant name must be at least 2 characters');
            return;
        }
        if (!formData.ownerName.trim()) {
            setError('Owner name is required');
            return;
        }
        if (!formData.ownerEmail.trim() || !formData.ownerEmail.includes('@')) {
            setError('A valid email address is required');
            return;
        }

        setIsProvisioning(true);
        setError(null);

        try {
            const res = await fetch('/api/onboarding/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.restaurantName,
                    owner_name: formData.ownerName,
                    owner_email: formData.ownerEmail,
                    address: formData.address,
                    phone: formData.phone,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                if (res.status === 200 && data.already_exists) {
                    setError('An account with this email already exists. Please log in instead.');
                    return;
                }
                throw new Error(data.error || `Provisioning failed (${res.status})`);
            }

            const data = await res.json();
            onAccountCreated({
                restaurant_id: data.restaurant.id,
                setup_token: data.setup_token,
                temporary_pin: data.temporary_pin,
            });
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsProvisioning(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold-500 to-transparent opacity-30"></div>
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-900/10 rounded-full blur-[128px]"></div>

            <div className="w-full max-w-2xl grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center relative z-10">
                <div className="hidden lg:flex flex-col justify-center">
                    <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl text-gold-500">
                        <Store size={32} />
                    </div>
                    <h1 className="text-4xl lg:text-5xl font-serif font-bold text-white mb-4 leading-tight">
                        Fireflow Restaurant <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 to-gold-600">Create Your Workspace</span>
                    </h1>
                    <p className="text-slate-400 text-sm max-w-sm leading-relaxed mb-6">
                        Set up your restaurant's secure operating workspace. One-time PIN is displayed once for handover — never stored or emailed.
                    </p>
                    <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800">
                            <Lock size={12} /> End-to-end encrypted
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800">
                            <Shield size={12} /> PCI compliant
                        </div>
                    </div>
                </div>

                <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-8 rounded-3xl shadow-2xl w-full">
                    <div className="text-center mb-6">
                        <div className="lg:hidden mb-3 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 text-gold-500">
                            <Store size={20} />
                        </div>
                        <h2 className="text-white text-xl font-bold tracking-wide">New Restaurant Account</h2>
                        <p className="text-slate-500 text-xs uppercase font-black tracking-widest mt-1">One-time setup</p>
                    </div>

                    {error && (
                        <div className="mb-4 bg-red-500/10 border border-red-500/25 text-red-300 text-sm rounded-xl px-4 py-3">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-1.5 block">
                                Restaurant Name
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. Bistro 47"
                                value={formData.restaurantName}
                                onChange={e => setFormData({ ...formData, restaurantName: e.target.value })}
                                disabled={isProvisioning}
                                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-gold-500/50 transition-colors"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-1.5 block">
                                Owner Name
                            </label>
                            <div className="relative">
                                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                                <input
                                    type="text"
                                    placeholder="Jane Doe"
                                    value={formData.ownerName}
                                    onChange={e => setFormData({ ...formData, ownerName: e.target.value })}
                                    disabled={isProvisioning}
                                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-gold-500/50 pl-10 transition-colors"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-1.5 block">
                                Owner Email
                            </label>
                            <div className="relative">
                                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                                <input
                                    type="email"
                                    placeholder="jane@example.com"
                                    value={formData.ownerEmail}
                                    onChange={e => setFormData({ ...formData, ownerEmail: e.target.value })}
                                    disabled={isProvisioning}
                                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-gold-500/50 pl-10 transition-colors"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-1.5 block">
                                Address
                            </label>
                            <div className="relative">
                                <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                                <input
                                    type="text"
                                    placeholder="123 Main Street"
                                    value={formData.address}
                                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                                    disabled={isProvisioning}
                                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-gold-500/50 pl-10 transition-colors"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-black text-slate-600 uppercase tracking-wider mb-1.5 block">
                                Phone
                            </label>
                            <div className="relative">
                                <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                                <input
                                    type="tel"
                                    placeholder="+1 (555) 000-0000"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                    disabled={isProvisioning}
                                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-gold-500/50 pl-10 transition-colors"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isProvisioning}
                            className="w-full py-3.5 mt-2 rounded-xl font-bold uppercase tracking-widest text-sm flex items-center justify-center gap-2 transition-all bg-gold-500 hover:bg-gold-400 text-slate-950 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isProvisioning ? (
                                <>Creating workspace…</>
                            ) : (
                                <>Create workspace <ArrowRight size={16} /></>
                            )}
                        </button>
                    </form>

                    <p className="text-[10px] text-slate-600 mt-6 text-center leading-relaxed">
                        By creating a workspace, you agree to FireFlow's terms. A one-time PIN will be displayed for handover — store it securely.
                    </p>
                </div>
            </div>
        </div>
    );
};
