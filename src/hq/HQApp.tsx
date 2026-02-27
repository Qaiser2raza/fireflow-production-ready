import React, { useState, useEffect } from 'react';
import { HQLogin, hqSupabase } from './HQLogin';
import { HQDashboard } from './HQDashboard';

export const HQApp: React.FC = () => {
    const [session, setSession] = useState<any>(null);
    const [checking, setChecking] = useState(true);

    // Restore session from Supabase on page load
    useEffect(() => {
        hqSupabase.auth.getSession().then(({ data }) => {
            setSession(data.session);
            setChecking(false);
        });

        // Keep session in sync
        const { data: listener } = hqSupabase.auth.onAuthStateChange((_event, newSession) => {
            setSession(newSession);
        });

        return () => listener.subscription.unsubscribe();
    }, []);

    const handleLogout = async () => {
        await hqSupabase.auth.signOut();
        setSession(null);
    };

    if (checking) {
        return (
            <div className="min-h-screen bg-[#020617] flex items-center justify-center">
                <div className="flex items-center gap-4 text-slate-500">
                    <div className="w-8 h-8 border-2 border-gold-500/30 border-t-gold-500 rounded-full animate-spin" />
                    <span className="text-sm font-black uppercase tracking-widest">FireFlow HQ...</span>
                </div>
            </div>
        );
    }

    if (!session) {
        return <HQLogin onLogin={setSession} />;
    }

    return <HQDashboard session={session} onLogout={handleLogout} />;
};
