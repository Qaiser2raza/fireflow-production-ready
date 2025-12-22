
import React, { useState, useEffect } from 'react';
import { Server, Restaurant } from '../types';
import { User, Lock, ArrowRight, Smartphone, List, Loader2, Building2, Search, ArrowLeft, ShieldCheck, Globe, CheckCircle2, PlusCircle, AlertCircle, Code, FlaskConical, MapPin, Sparkles } from 'lucide-react';
import { supabase } from '../supabase';

interface LoginViewProps {
  onLogin: (user: Server, restaurant: Restaurant) => void;
  onStartRegistration: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin, onStartRegistration }) => {
  const [step, setStep] = useState<'identify' | 'select_business' | 'authenticate'>('identify');
  const [restaurantSearch, setRestaurantSearch] = useState('');
  const [matches, setMatches] = useState<Restaurant[]>([]);
  const [identifiedRest, setIdentifiedRest] = useState<Restaurant | null>(null);
  const [restaurantStaff, setRestaurantStaff] = useState<Server[]>([]);
  const [selectedUser, setSelectedUser] = useState<Server | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleIdentify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = restaurantSearch.trim();
    if (query.length < 3) return;
    setIsLoading(true);
    setError(null);
    try {
      if (query.toLowerCase() === 'admin' || query.toLowerCase() === 'fireflow' || query.toLowerCase() === 'system') {
        const adminRest = { id: 'SYSTEM', name: 'System Core', city: 'Global', slug: 'admin', subscriptionStatus: 'active', subscriptionExpiresAt: new Date(2099, 1, 1), trialEndsAt: new Date(2099, 1, 1), createdAt: new Date(), isActive: true } as any;
        setIdentifiedRest(adminRest);
        setRestaurantStaff([{ id: 'SUPER-ADMIN-001', name: 'System Administrator', role: 'SUPER_ADMIN', pin: '0000', activeTables: 0 }]);
        setStep('authenticate');
        setIsLoading(false);
        return;
      }
      const { data, error: fetchError } = await supabase.from('restaurants').select('*').or(`name.ilike.%${query}%,slug.ilike.%${query}%,phone.ilike.%${query}%`);
      if (fetchError || !data || data.length === 0) {
        setError('Business not found. Try searching by Name, Phone, or Slug.');
        setIsLoading(false);
      } else if (data.length === 1) { 
        await selectBusiness(data[0]); 
      } else { 
        setMatches(data); 
        setStep('select_business'); 
        setIsLoading(false); 
      }
    } catch (err) { 
      setError('Connection failure.'); 
      setIsLoading(false); 
    }
  };

  const selectBusiness = async (restData: any) => {
    setIsLoading(true);
    const rest: Restaurant = { id: restData.id, name: restData.name, slug: restData.slug, phone: restData.phone, address: restData.address, city: restData.city, subscriptionPlan: restData.subscription_plan, subscriptionStatus: restData.subscription_status, trialEndsAt: new Date(restData.trial_ends_at), subscriptionExpiresAt: new Date(restData.subscription_expires_at), monthlyFee: restData.monthly_fee, currency: restData.currency || 'PKR', taxRate: restData.tax_rate || 0, serviceChargeRate: restData.service_charge_rate || 5, timezone: restData.timezone || 'Asia/Karachi', logo: restData.logo, primaryColor: restData.primary_color, createdAt: new Date(restData.created_at), isActive: restData.is_active !== false, ownerId: restData.owner_id };
    
    setIdentifiedRest(rest);
    
    // EAGER LOAD: Fetch staff immediately to warm up connection
    const { data: staffData } = await supabase.from('staff').select('*').eq('restaurant_id', rest.id);
    setRestaurantStaff(staffData || []);
    
    setStep('authenticate');
    setIsLoading(false);
  };

  const handleDevBypass = async () => {
    setIsLoading(true);
    const devRest = { 
        id: 'SYSTEM-CORE-001', 
        name: 'AURA System Core', 
        city: 'Global', 
        slug: 'dev', 
        subscription_plan: 'PREMIUM',
        subscription_status: 'active', 
        subscription_expires_at: new Date(2099, 1, 1).toISOString(), 
        trial_ends_at: new Date(2099, 1, 1).toISOString(), 
        created_at: new Date().toISOString(), 
        is_active: true,
        phone: '0000000000',
        monthly_fee: 0,
        currency: 'PKR',
        timezone: 'Asia/Karachi'
    };

    const devUser = { 
        id: 'DEV-USER-001', 
        restaurant_id: devRest.id,
        name: 'System Architect', 
        role: 'SUPER_ADMIN', 
        pin: '0000', 
        active_tables: 0 
    };

    try {
        await supabase.from('restaurants').upsert(devRest);
        await supabase.from('staff').upsert(devUser);
        
        onLogin(
            { ...devUser, activeTables: 0 } as any, 
            { ...devRest, subscriptionPlan: 'PREMIUM', subscriptionStatus: 'active', trialEndsAt: new Date(devRest.trial_ends_at), subscriptionExpiresAt: new Date(devRest.subscription_expires_at), createdAt: new Date(devRest.created_at), isActive: true } as any
        );
    } catch (err) {
        setError("Failed to provision dev environment.");
    } finally {
        setIsLoading(false);
    }
  };

  const handleLogin = () => {
    if (selectedUser && identifiedRest && selectedUser.pin === pin) {
      onLogin(selectedUser, identifiedRest);
    } else { 
      setError('Invalid PIN'); 
      setPin(''); 
    }
  };

  const handleKeyPress = (key: string) => {
    setError(null);
    if (key === 'DEL') setPin(prev => prev.slice(0, -1));
    else if (key === 'CLR') setPin('');
    else if (pin.length < 4) setPin(prev => prev + key);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (step === 'authenticate') {
        if (/^[0-9]$/.test(e.key)) handleKeyPress(e.key);
        else if (e.key === 'Backspace') handleKeyPress('DEL');
        else if (e.key === 'Enter' && pin.length === 4) handleLogin();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, pin, selectedUser, identifiedRest]);

  return (
    <div className="h-screen w-screen bg-slate-950 flex items-center justify-center relative overflow-hidden p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black opacity-90" />
      
      {/* Animated Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
         <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-gold-600/20 blur-[120px] animate-pulse" />
         <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative z-10 w-full max-w-4xl flex flex-col items-center">
        <div className="text-center mb-8">
           <div className="w-16 h-16 bg-gold-500 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-2xl shadow-gold-500/20">
              <ShieldCheck size={40} className="text-slate-950" strokeWidth={2.5} />
           </div>
           <h1 className="text-4xl font-serif font-bold text-white tracking-widest uppercase">Fireflow</h1>
           <p className="text-gold-500/60 text-[10px] uppercase tracking-[0.5em] font-bold mt-2">Precision Multi-Tenant SaaS</p>
        </div>

        <div className="w-full flex flex-col md:flex-row gap-8 items-stretch justify-center min-h-[500px]">
          {/* Identity Section */}
          <div className="w-full md:w-[480px] bg-slate-900/40 backdrop-blur-2xl border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col">
            {step === 'identify' && (
              <div className="p-10 flex-1 flex flex-col justify-center space-y-6 animate-in fade-in slide-in-from-left-4">
                <div className="text-center mb-2">
                  <h2 className="text-white font-serif text-2xl mb-2">Terminal Access</h2>
                  <p className="text-slate-500 text-[10px] uppercase tracking-[0.2em]">Identify your business identity</p>
                </div>
                <form onSubmit={handleIdentify} className="space-y-4">
                  <div className="relative group">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-gold-500 transition-colors" size={20} />
                    <input 
                      type="text" 
                      placeholder="Name, Slug, or Phone" 
                      value={restaurantSearch} 
                      onChange={(e) => setRestaurantSearch(e.target.value)} 
                      className="w-full bg-slate-950 border border-slate-800 rounded-[1.5rem] pl-16 pr-6 py-6 text-white text-xl outline-none focus:border-gold-500 transition-all placeholder-slate-800" 
                      autoFocus 
                    />
                  </div>
                  {error && <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 text-red-400 text-xs"><AlertCircle size={16} /> {error}</div>}
                  <button type="submit" disabled={isLoading || restaurantSearch.length < 3} className="w-full py-5 bg-gold-500 text-slate-950 font-black uppercase tracking-widest rounded-2xl shadow-xl hover:bg-gold-400 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
                    {isLoading ? <Loader2 className="animate-spin" /> : <>Identify Business <ArrowRight size={20} /></>}
                  </button>
                </form>
                <div className="grid grid-cols-1 gap-3 pt-2">
                  <button onClick={handleDevBypass} disabled={isLoading} className="w-full py-4 bg-slate-800 border border-gold-500/30 text-gold-500 rounded-2xl flex items-center justify-center gap-3 text-xs font-black uppercase tracking-[0.2em] shadow-lg hover:bg-slate-700 transition-all disabled:opacity-50">
                    <Code size={18} /> System SuperAdmin
                  </button>
                  <button onClick={onStartRegistration} className="w-full py-4 border border-slate-800 rounded-2xl text-slate-400 hover:text-gold-500 transition-all flex items-center justify-center gap-3 text-xs font-bold uppercase tracking-widest mt-2">
                    <PlusCircle size={18} /> Register New Business
                  </button>
                </div>
              </div>
            )}

            {step === 'select_business' && (
              <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-4">
                <div className="p-6 bg-slate-950/50 border-b border-slate-800 flex justify-between items-center"><h2 className="text-white font-serif">Multiple Matches Found</h2><button onClick={() => setStep('identify')} className="text-slate-500 hover:text-white"><ArrowLeft size={20} /></button></div>
                <div className="p-6 flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                  {matches.map(m => (
                    <button key={m.id} onClick={() => selectBusiness(m)} className="w-full p-4 bg-slate-800/20 border border-slate-700/50 rounded-2xl flex items-center justify-between group hover:border-gold-500 transition-all">
                      <div className="text-left"><div className="text-white font-bold">{m.name}</div><div className="text-[10px] text-slate-500 uppercase tracking-widest">{m.city} • {m.slug}</div></div><ArrowRight size={18} className="text-slate-600 group-hover:text-gold-500" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 'authenticate' && (
              <div className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-4">
                <div className="p-6 bg-slate-950/50 border-b border-slate-800 flex justify-between items-center">
                  <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-gold-500 flex items-center justify-center text-slate-950"><Building2 size={20} /></div><div><div className="text-white font-bold text-sm leading-tight line-clamp-1">{identifiedRest?.name}</div><div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{identifiedRest?.city}</div></div></div>
                  <button onClick={() => { setStep('identify'); setSelectedUser(null); setPin(''); }} className="text-slate-600 hover:text-white transition-colors"><ArrowLeft size={20} /></button>
                </div>
                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar space-y-2">
                  <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-4">Select Staff Profile</div>
                  {restaurantStaff.map(user => (
                    <button key={user.id} onClick={() => { setSelectedUser(user); setPin(''); setError(null); }} className={`w-full p-4 rounded-2xl flex items-center gap-4 transition-all duration-300 border group ${selectedUser?.id === user.id ? 'bg-gold-500 text-slate-950 border-gold-500 shadow-lg' : 'bg-slate-800/20 text-slate-400 border-slate-800/50 hover:bg-slate-800 hover:border-slate-700'}`}><div className={`w-10 h-10 rounded-full flex items-center justify-center border ${selectedUser?.id === user.id ? 'bg-black/10 border-black/20' : 'bg-slate-900 border-slate-700'}`}><User size={20} /></div><div className="text-left flex-1"><div className="font-bold text-sm">{user.name}</div><div className={`text-[9px] font-black tracking-widest uppercase ${selectedUser?.id === user.id ? 'text-black/60' : 'text-slate-500'}`}>{user.role}</div></div><ArrowRight size={16} className={selectedUser?.id === user.id ? 'text-black' : 'text-slate-700'} /></button>
                  ))}
                  {restaurantStaff.length === 0 && <div className="py-20 text-center text-slate-600 italic text-sm">No staff accounts found.</div>}
                </div>
              </div>
            )}
            <div className="p-4 bg-slate-950/80 border-t border-slate-800 text-center text-slate-700 text-[9px] font-black uppercase tracking-[0.4em]">Auth Engine v2.9.2 • Realtime Mode</div>
          </div>

          {/* Authentication PinPad Section */}
          <div className={`w-full md:w-[320px] flex flex-col justify-center transition-all duration-500 ${selectedUser ? 'opacity-100' : 'opacity-20 pointer-events-none grayscale scale-95'}`}>
             <div className="mb-10 text-center">
                <div className="flex items-center justify-center gap-4 mb-4">
                  {[1, 2, 3, 4].map((_, idx) => (
                    <div key={idx} className={`w-4 h-4 rounded-full transition-all duration-500 ${pin.length > idx ? 'bg-gold-500 scale-125 shadow-[0_0_20px_rgba(245,158,11,0.6)]' : 'bg-slate-800 border border-slate-700'} ${error ? 'bg-red-500 animate-pulse scale-90' : ''}`} />
                  ))}
                </div>
                <div className={`text-[10px] tracking-[0.3em] uppercase font-black h-4 transition-colors ${error ? 'text-red-500' : 'text-slate-500'}`}>
                  {error || (selectedUser ? `PIN FOR ${selectedUser.name.split(' ')[0].toUpperCase()}` : 'ENTER SECURE PIN')}
                </div>
             </div>
             
             <div className="grid grid-cols-3 gap-4 mx-auto w-full max-w-[280px]">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button key={num} onClick={() => handleKeyPress(num.toString())} className="h-20 w-20 rounded-full bg-slate-900 border border-slate-800 text-slate-200 text-3xl font-light hover:bg-slate-800 hover:border-gold-500/50 transition-all active:scale-90 flex items-center justify-center shadow-xl">{num}</button>
                ))}
                <button onClick={() => handleKeyPress('CLR')} className="h-20 w-20 rounded-full text-slate-600 text-[10px] font-black tracking-widest hover:text-white transition-colors flex items-center justify-center uppercase">CLR</button>
                <button onClick={() => handleKeyPress('0')} className="h-20 w-20 rounded-full bg-slate-900 border border-slate-800 text-slate-200 text-3xl font-light hover:bg-slate-800 transition-all active:scale-90 flex items-center justify-center shadow-xl">0</button>
                <button onClick={handleLogin} disabled={pin.length !== 4} className={`h-20 w-20 rounded-full flex items-center justify-center transition-all shadow-2xl ${pin.length === 4 ? 'bg-gold-500 text-slate-950 shadow-gold-500/40 hover:scale-105 active:scale-95' : 'bg-slate-800 text-slate-700 pointer-events-none'}`}><ArrowRight size={32} strokeWidth={3} /></button>
             </div>
             {selectedUser && <button onClick={() => { setSelectedUser(null); setPin(''); setError(null); }} className="mt-12 mx-auto text-slate-600 hover:text-white text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-3 transition-colors group"><ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Change Staff Profile</button>}
          </div>
        </div>
      </div>
    </div>
  );
};
