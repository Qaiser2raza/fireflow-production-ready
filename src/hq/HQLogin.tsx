import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Zap, Mail, Lock, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';

const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!
);

interface HQLoginProps {
    onLogin: (session: any) => void;
}

export const HQLogin: React.FC<HQLoginProps> = ({ onLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!email.trim() || !password) {
            setError('Email and password are required');
            return;
        }

        setIsLoading(true);
        try {
            const { data, error: authError } = await supabase.auth.signInWithPassword({
                email: email.trim().toLowerCase(),
                password,
            });

            if (authError || !data.session) {
                setError('Invalid credentials. Only authorized FireFlow admins can access this portal.');
                return;
            }

            onLogin(data.session);
        } catch (err) {
            setError('Connection error. Check your internet and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#020617] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-gold-500/4 rounded-full blur-[140px]" />
                <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] bg-blue-500/4 rounded-full blur-[100px]" />
                {/* Grid pattern */}
                <div className="absolute inset-0 opacity-[0.015]"
                    style={{
                        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                        backgroundSize: '60px 60px'
                    }}
                />
            </div>

            <div className="w-full max-w-sm relative z-10">
                {/* Brand */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gold-500/10 border border-gold-500/30 rounded-3xl mb-5 shadow-[0_0_40px_rgba(234,179,8,0.12)]">
                        <Zap className="text-gold-500" size={30} />
                    </div>
                    <h1 className="text-white font-serif font-bold text-3xl leading-none mb-1">FireFlow HQ</h1>
                    <p className="text-slate-500 text-xs font-black uppercase tracking-[0.25em]">Command Centre</p>
                </div>

                {/* Login card */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 backdrop-blur-sm">
                    <p className="text-slate-400 text-sm mb-6 text-center">
                        Authorized personnel only. Sign in with your FireFlow admin credentials.
                    </p>

                    <form onSubmit={handleLogin} className="space-y-4">
                        {/* Email */}
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                            <input
                                type="email"
                                placeholder="Admin email"
                                value={email}
                                onChange={e => { setEmail(e.target.value); setError(null); }}
                                className="w-full bg-slate-950/80 border border-slate-700 rounded-2xl pl-11 pr-4 py-3.5 text-white font-medium outline-none focus:border-gold-500/60 transition-all placeholder:text-slate-600 text-sm"
                                autoComplete="email"
                                autoFocus
                            />
                        </div>

                        {/* Password */}
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Password"
                                value={password}
                                onChange={e => { setPassword(e.target.value); setError(null); }}
                                className="w-full bg-slate-950/80 border border-slate-700 rounded-2xl pl-11 pr-12 py-3.5 text-white font-medium outline-none focus:border-gold-500/60 transition-all placeholder:text-slate-600 text-sm"
                                autoComplete="current-password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(v => !v)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="flex items-start gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                {error}
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full h-13 py-3.5 bg-gold-500 hover:bg-gold-400 disabled:opacity-60 text-slate-950 font-black uppercase tracking-widest text-sm rounded-2xl flex items-center justify-center gap-2 transition-all shadow-[0_0_30px_rgba(234,179,8,0.15)] hover:shadow-[0_0_40px_rgba(234,179,8,0.25)] mt-2"
                        >
                            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
                            {isLoading ? 'Authenticating...' : 'Enter HQ'}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <p className="text-center text-slate-700 text-xs mt-8 font-medium">
                    FireFlow HQ · SaaS Intelligence Platform · v1.0
                </p>
            </div>
        </div>
    );
};

export { supabase as hqSupabase };
