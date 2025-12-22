
import React, { useState } from 'react';
import { Restaurant, Server } from '../types';
import { supabase } from '../supabase';
import { 
  Building2, 
  MapPin, 
  Phone, 
  User, 
  Lock, 
  Hash, 
  CreditCard, 
  ChevronRight, 
  ChevronLeft, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Shield, 
  Clock, 
  Zap, 
  Crown
} from 'lucide-react';

interface RegistrationViewProps {
  onRegister: (restaurant: Restaurant, owner: Server) => void;
}

type RegistrationStep = 'business' | 'admin' | 'plan';

export const RegistrationView: React.FC<RegistrationViewProps> = ({ onRegister }) => {
  const [currentStep, setCurrentStep] = useState<RegistrationStep>('business');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- STEP 1: BUSINESS DATA ---
  const [businessData, setBusinessData] = useState({
    name: '',
    phone: '',
    address: '',
    city: 'Karachi' // Default to Karachi
  });

  // --- STEP 2: ADMIN DATA ---
  const [adminData, setAdminData] = useState({
    ownerName: '',
    ownerPhone: '',
    password: '',
    confirmPassword: '',
    pin: ''
  });

  // --- STEP 3: PLAN DATA ---
  const [selectedPlan, setSelectedPlan] = useState<'BASIC' | 'STANDARD' | 'PREMIUM'>('BASIC');

  // Plan pricing
  const PLANS = {
    BASIC: { price: 1000, features: ['POS System', 'KDS', 'Basic Reports', 'Up to 3 Staff'] },
    STANDARD: { price: 1500, features: ['Everything in Basic', 'Floor Management', 'Inventory', 'Up to 10 Staff', 'Email Support'] },
    PREMIUM: { price: 2000, features: ['Everything in Standard', 'Advanced Analytics', 'Unlimited Staff', 'Priority Support', 'Custom Branding'] }
  };

  // --- VALIDATION ---
  const validateBusinessStep = (): boolean => {
    if (!businessData.name.trim()) {
      setError('Restaurant name is required');
      return false;
    }
    const cleanPhone = businessData.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setError('Valid 10-11 digit phone number is required');
      return false;
    }
    if (!businessData.city.trim()) {
      setError('City is required');
      return false;
    }
    setError(null);
    return true;
  };

  const validateAdminStep = (): boolean => {
    if (!adminData.ownerName.trim()) {
      setError('Owner name is required');
      return false;
    }
    const cleanPhone = adminData.ownerPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setError('Valid phone number is required for login');
      return false;
    }
    if (!adminData.password || adminData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }
    if (adminData.password !== adminData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    if (!adminData.pin || adminData.pin.length !== 4) {
      setError('4-digit PIN is required for POS access');
      return false;
    }
    setError(null);
    return true;
  };

  // --- NAVIGATION ---
  const handleNext = async () => {
    setError(null);
    if (currentStep === 'business') {
      if (validateBusinessStep()) {
        setIsSubmitting(true);
        try {
          const cleanPhone = businessData.phone.replace(/\D/g, '');
          // Check for exact phone match or name match
          const { data: existing, error: checkError } = await supabase
            .from('restaurants')
            .select('id, name, phone')
            .or(`phone.eq.${cleanPhone},name.ilike.${businessData.name.trim()}`);
          
          if (existing && existing.length > 0) {
            const match = existing[0];
            if (match.phone === cleanPhone) {
              setError(`This phone number (${cleanPhone}) is already registered with "${match.name}".`);
            } else {
              setError(`A business named "${match.name}" is already registered.`);
            }
            setIsSubmitting(false);
            return;
          }
        } catch (err) {
          console.error("Duplicate check failed:", err);
        }
        setIsSubmitting(false);
        // Default owner phone to business phone to save time
        setAdminData(prev => ({ ...prev, ownerPhone: businessData.phone }));
        setCurrentStep('admin');
      }
    } else if (currentStep === 'admin') {
      if (validateAdminStep()) setCurrentStep('plan');
    }
  };

  const handleBack = () => {
    if (currentStep === 'admin') setCurrentStep('business');
    else if (currentStep === 'plan') setCurrentStep('admin');
  };

  // --- SUBMISSION ---
  const handleSubmit = async () => {
    if (!validateAdminStep()) return;
    
    setIsSubmitting(true);
    setError(null);

    try {
      const cleanPhone = businessData.phone.replace(/\D/g, '');
      const ownerPhone = adminData.ownerPhone.replace(/\D/g, '');

      // 1. Generate unique slug
      const slug = businessData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        + '-' + Math.random().toString(36).substring(2, 6);

      // 2. Calculate trial dates
      const now = new Date();
      const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); 
      const subscriptionExpiresAt = new Date(trialEndsAt);

      // 3. Create Restaurant Record
      const restaurantData: any = {
        name: businessData.name.trim(),
        slug: slug,
        phone: cleanPhone,
        address: businessData.address || null,
        city: businessData.city,
        subscription_plan: selectedPlan,
        subscription_status: 'trial',
        trial_ends_at: trialEndsAt.toISOString(),
        subscription_expires_at: subscriptionExpiresAt.toISOString(),
        monthly_fee: PLANS[selectedPlan].price,
        currency: 'PKR',
        tax_rate: 0,
        service_charge_rate: 5,
        timezone: 'Asia/Karachi',
        created_at: now.toISOString(),
        is_active: true
      };

      const { data: newRestaurant, error: restaurantError } = await supabase
        .from('restaurants')
        .insert(restaurantData)
        .select()
        .single();

      if (restaurantError) throw new Error(`Registration failed: ${restaurantError.message}`);

      // 4. Create Owner/Admin Account
      const ownerId = `OWNER-${Math.random().toString(36).substring(2, 9)}`;
      
      const ownerData = {
        id: ownerId,
        restaurant_id: newRestaurant.id,
        name: adminData.ownerName.trim(),
        role: 'MANAGER',
        pin: adminData.pin,
        email: ownerPhone + '@fireflow.local',
        password: adminData.password, 
        activeTables: 0,
        last_login: null
      };

      const { error: ownerError } = await supabase
        .from('staff')
        .insert(ownerData);

      if (ownerError) {
        // Rollback restaurant if owner fails
        await supabase.from('restaurants').delete().eq('id', newRestaurant.id);
        throw new Error(`Account setup failed: ${ownerError.message}`);
      }

      // 5. Update restaurant with owner ID link
      await supabase.from('restaurants').update({ owner_id: ownerId }).eq('id', newRestaurant.id);

      // 6. Success
      onRegister({
        ...newRestaurant,
        subscriptionPlan: newRestaurant.subscription_plan,
        subscriptionStatus: newRestaurant.subscription_status,
        trialEndsAt: new Date(newRestaurant.trial_ends_at),
        subscriptionExpiresAt: new Date(newRestaurant.subscription_expires_at),
        createdAt: new Date(newRestaurant.created_at)
      }, {
        id: ownerId,
        restaurantId: newRestaurant.id,
        name: adminData.ownerName,
        role: 'MANAGER',
        pin: adminData.pin,
        activeTables: 0
      });

    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.message || 'Registration failed. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-6xl flex flex-col lg:flex-row gap-8 items-center">
        
        {/* LEFT SIDE: BRANDING */}
        <div className="hidden lg:flex flex-col flex-1 text-white space-y-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-3xl font-serif font-bold shadow-lg shadow-gold-500/20">
                F
              </div>
              <div>
                <h1 className="text-4xl font-serif font-bold tracking-tight text-white">Fireflow</h1>
                <p className="text-slate-400 text-sm tracking-wide">Precision Control for Premium Dining</p>
              </div>
            </div>
          </div>

          <div className="space-y-6 pl-4 border-l-2 border-gold-500/20">
            <FeatureItem 
              icon={<Zap className="text-gold-500" size={24} />}
              title="Kitchen Display System"
              description="Streamline communication between FOH and BOH."
            />
            <FeatureItem 
              icon={<Shield className="text-gold-500" size={24} />}
              title="Manager Controls"
              description="Complete oversight of staff, menu, and sales."
            />
            <FeatureItem 
              icon={<Crown className="text-gold-500" size={24} />}
              title="Premium Experience"
              description="Designed for high-end restaurants and cafes."
            />
          </div>

          <p className="text-slate-600 text-xs">© 2024 Fireflow Systems. Built for performance.</p>
        </div>

        {/* RIGHT SIDE: REGISTRATION FORM */}
        <div className="flex-1 w-full max-w-xl">
          <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
            
            <div className="bg-slate-950 p-6 border-b border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <StepIndicator number={1} label="BUSINESS" active={currentStep === 'business'} completed={currentStep === 'admin' || currentStep === 'plan'} />
                <div className="flex-1 h-px bg-slate-800 mx-2" />
                <StepIndicator number={2} label="ADMIN" active={currentStep === 'admin'} completed={currentStep === 'plan'} />
                <div className="flex-1 h-px bg-slate-800 mx-2" />
                <StepIndicator number={3} label="PLAN" active={currentStep === 'plan'} completed={false} />
              </div>
            </div>

            <div className="p-8">
              
              {error && (
                <div className="mb-6 bg-red-900/20 border border-red-900/50 rounded-lg p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                  <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
                  <span className="text-red-400 text-sm">{error}</span>
                </div>
              )}

              {currentStep === 'business' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <h2 className="text-2xl font-serif text-white mb-2">Tell us about your restaurant</h2>
                    <p className="text-slate-400 text-sm">This information will appear on your receipts and dashboard.</p>
                  </div>

                  <div>
                    <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block">Restaurant Name</label>
                    <div className="relative">
                      <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                      <input 
                        type="text"
                        placeholder="e.g. Cafe Royal"
                        value={businessData.name}
                        onChange={(e) => setBusinessData({...businessData, name: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-12 pr-4 py-3 text-white placeholder-slate-600 outline-none focus:border-gold-500 transition-colors"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block">City</label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                        <select
                          value={businessData.city}
                          onChange={(e) => setBusinessData({...businessData, city: e.target.value})}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-12 pr-4 py-3 text-white outline-none focus:border-gold-500 transition-colors appearance-none"
                        >
                          <option value="Karachi">Karachi</option>
                          <option value="Lahore">Lahore</option>
                          <option value="Islamabad">Islamabad</option>
                          <option value="Rawalpindi">Rawalpindi</option>
                          <option value="Faisalabad">Faisalabad</option>
                          <option value="Multan">Multan</option>
                          <option value="Peshawar">Peshawar</option>
                          <option value="Quetta">Quetta</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block">Business Phone</label>
                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                        <input 
                          type="tel"
                          placeholder="03001234567"
                          value={businessData.phone}
                          onChange={(e) => setBusinessData({...businessData, phone: e.target.value.replace(/\D/g, '')})}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-12 pr-4 py-3 text-white placeholder-slate-600 outline-none focus:border-gold-500 transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block">Address (Optional)</label>
                    <input 
                      type="text"
                      placeholder="Full address for receipts"
                      value={businessData.address}
                      onChange={(e) => setBusinessData({...businessData, address: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-600 outline-none focus:border-gold-500 transition-colors"
                    />
                  </div>
                </div>
              )}

              {currentStep === 'admin' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <h2 className="text-2xl font-serif text-white mb-2">Create admin account</h2>
                    <p className="text-slate-400 text-sm">This will be the primary owner account with full access.</p>
                  </div>

                  <div>
                    <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block">Owner Name</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                      <input 
                        type="text"
                        placeholder="Your full name"
                        value={adminData.ownerName}
                        onChange={(e) => setAdminData({...adminData, ownerName: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-12 pr-4 py-3 text-white placeholder-slate-600 outline-none focus:border-gold-500 transition-colors"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block">Login Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                      <input 
                        type="tel"
                        placeholder="03001234567"
                        value={adminData.ownerPhone}
                        onChange={(e) => setAdminData({...adminData, ownerPhone: e.target.value.replace(/\D/g, '')})}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-12 pr-4 py-3 text-white placeholder-slate-600 outline-none focus:border-gold-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block">Password</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                        <input 
                          type="password"
                          placeholder="Min. 6 chars"
                          value={adminData.password}
                          onChange={(e) => setAdminData({...adminData, password: e.target.value})}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-12 pr-4 py-3 text-white placeholder-slate-600 outline-none focus:border-gold-500 transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block">Confirm</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                        <input 
                          type="password"
                          placeholder="Confirm"
                          value={adminData.confirmPassword}
                          onChange={(e) => setAdminData({...adminData, confirmPassword: e.target.value})}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-12 pr-4 py-3 text-white placeholder-slate-600 outline-none focus:border-gold-500 transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 block">4-Digit POS PIN</label>
                    <div className="relative">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                      <input 
                        type="text"
                        placeholder="1234"
                        maxLength={4}
                        value={adminData.pin}
                        onChange={(e) => setAdminData({...adminData, pin: e.target.value.replace(/\D/g, '')})}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-12 pr-4 py-3 text-white placeholder-slate-600 outline-none focus:border-gold-500 transition-colors font-mono tracking-widest text-center"
                      />
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 'plan' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                    <h2 className="text-2xl font-serif text-white mb-2">Choose your plan</h2>
                    <p className="text-slate-400 text-sm">Start with a 14-day free trial.</p>
                  </div>

                  <div className="space-y-3">
                    {(['BASIC', 'STANDARD', 'PREMIUM'] as const).map(plan => (
                      <button
                        key={plan}
                        onClick={() => setSelectedPlan(plan)}
                        className={`w-full border-2 rounded-xl p-5 text-left transition-all duration-200 ${
                          selectedPlan === plan
                            ? 'border-gold-500 bg-gold-500/10'
                            : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="text-white font-bold text-lg">{plan}</h3>
                            <p className="text-3xl font-serif text-gold-500 mt-1">
                              Rs. {PLANS[plan].price}
                              <span className="text-sm text-slate-500 font-sans">/mo</span>
                            </p>
                          </div>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            selectedPlan === plan ? 'border-gold-500 bg-gold-500' : 'border-slate-700'
                          }`}>
                            {selectedPlan === plan && <CheckCircle2 size={16} className="text-slate-950" />}
                          </div>
                        </div>
                        
                        <ul className="space-y-1">
                          {PLANS[plan].features.slice(0, 3).map((feature, idx) => (
                            <li key={idx} className="text-slate-400 text-xs flex items-center gap-2">
                              <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </button>
                    ))}
                  </div>

                  <div className="bg-blue-900/20 border border-blue-900/50 rounded-lg p-4 flex items-start gap-3">
                    <Clock className="text-blue-400 shrink-0 mt-0.5" size={20} />
                    <div>
                      <p className="text-blue-300 text-sm font-semibold">14-Day Free Trial</p>
                      <p className="text-blue-400/80 text-xs">Access all features. Renew later.</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-8 pt-6 border-t border-slate-800">
                {currentStep !== 'business' && (
                  <button
                    onClick={handleBack}
                    disabled={isSubmitting}
                    className="px-6 py-3 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-2 font-bold uppercase tracking-wider text-sm"
                  >
                    <ChevronLeft size={18} />
                    Back
                  </button>
                )}

                <button
                  onClick={currentStep === 'plan' ? handleSubmit : handleNext}
                  disabled={isSubmitting}
                  className="flex-1 bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-400 hover:to-gold-500 text-slate-950 py-3 rounded-lg font-bold uppercase tracking-wider text-sm flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Processing...
                    </>
                  ) : currentStep === 'plan' ? (
                    <>
                      Start Free Trial
                      <CheckCircle2 size={18} />
                    </>
                  ) : (
                    <>
                      Continue
                      <ChevronRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StepIndicator: React.FC<{ number: number; label: string; active: boolean; completed: boolean }> = ({ number, label, active, completed }) => (
  <div className="flex flex-col items-center gap-2">
    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
      completed ? 'bg-green-500 text-white' :
      active ? 'bg-gold-500 text-slate-950' :
      'bg-slate-800 text-slate-600'
    }`}>
      {completed ? <CheckCircle2 size={20} /> : number}
    </div>
    <span className={`text-[9px] font-bold uppercase tracking-wider ${
      active ? 'text-gold-500' : completed ? 'text-green-500' : 'text-slate-600'
    }`}>
      {label}
    </span>
  </div>
);

const FeatureItem: React.FC<{ icon: React.ReactNode; title: string; description: string }> = ({ icon, title, description }) => (
  <div className="flex items-start gap-4">
    <div className="w-12 h-12 bg-slate-900 rounded-lg flex items-center justify-center shrink-0 border border-slate-800">
      {icon}
    </div>
    <div>
      <h3 className="text-white font-semibold mb-1">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
    </div>
  </div>
);
