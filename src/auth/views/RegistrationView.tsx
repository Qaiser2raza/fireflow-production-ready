import React, { useState } from 'react';
import { Restaurant, Server } from '../../shared/types';
import {
  registerRestaurant,
  activateLicenseKey,
  type RestaurantRegistrationData
} from '../../shared/lib/cloudClient';
import {
  Building2,
  MapPin,
  Phone,
  User,
  Lock,
  Hash,
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

  const [businessData, setBusinessData] = useState({
    name: '',
    phone: '',
    address: '',
    city: 'Karachi'
  });

  const [adminData, setAdminData] = useState({
    ownerName: '',
    ownerPhone: '',
    password: '',
    confirmPassword: '',
    pin: ''
  });

  const [selectedPlan, setSelectedPlan] = useState<'BASIC' | 'STANDARD' | 'PREMIUM'>('BASIC');
  const [licenseKey, setLicenseKey] = useState('');

  const PLANS = {
    BASIC: { price: 1000, features: ['POS System', 'KDS', 'Basic Reports', 'Up to 3 Staff'] },
    STANDARD: { price: 1500, features: ['Everything in Basic', 'Floor Management', 'Inventory', 'Up to 10 Staff', 'Email Support'] },
    PREMIUM: { price: 2000, features: ['Everything in Standard', 'Advanced Analytics', 'Unlimited Staff', 'Priority Support', 'Custom Branding'] }
  } as const;

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

  const handleNext = async () => {
    setError(null);
    if (currentStep === 'business') {
      if (validateBusinessStep()) {
        setIsSubmitting(true);
        try {
          // Call registerRestaurant from cloudClient to check for duplicates
          const cloudResult = await registerRestaurant({
            restaurantId: 'temp', // temp ID for duplicate check
            name: businessData.name.trim(),
            phone: businessData.phone.replace(/\D/g, ''),
            city: businessData.city,
            slug: businessData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            subscriptionPlan: selectedPlan
          });

          // If cloud check failed, it might be because of duplicate
          if (cloudResult.error && cloudResult.error.includes('duplicate')) {
            setError('This restaurant name or phone number is already registered.');
            setIsSubmitting(false);
            return;
          }

          setIsSubmitting(false);
          setAdminData(prev => ({ ...prev, ownerPhone: businessData.phone }));
          setCurrentStep('admin');
        } catch (err) {
          console.error('Duplicate check error:', err);
          setIsSubmitting(false);
          // Allow proceeding even if cloud check fails (local-only mode)
          setAdminData(prev => ({ ...prev, ownerPhone: businessData.phone }));
          setCurrentStep('admin');
        }
      }
    } else if (currentStep === 'admin') {
      if (validateAdminStep()) setCurrentStep('plan');
    }
  };

  const handleBack = () => {
    if (currentStep === 'admin') setCurrentStep('business');
    else if (currentStep === 'plan') setCurrentStep('admin');
  };

  const handleSubmit = async () => {
    if (!validateAdminStep()) return;
    setIsSubmitting(true);
    setError(null);

    try {
      // Step 1: Generate slug
      const slug = businessData.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        + '-' + Math.random().toString(36).substring(2, 6);

      // Step 2: Calculate trial dates
      const now = new Date();
      const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      // Step 3: Create local restaurant record
      const restaurantPayload = {
        name: businessData.name.trim(),
        slug: slug,
        phone: businessData.phone.replace(/\D/g, ''),
        address: businessData.address || null,
        city: businessData.city,
        subscription_plan: selectedPlan,
        subscription_status: 'trial',
        trial_ends_at: trialEndsAt.toISOString(),
        subscription_expires_at: trialEndsAt.toISOString(),
        monthly_fee: PLANS[selectedPlan].price,
        currency: 'PKR',
        tax_rate: 0,
        service_charge_rate: 5,
        timezone: 'Asia/Karachi'
      };

      const restaurantRes = await fetch('http://localhost:3001/api/restaurants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(restaurantPayload)
      });

      if (!restaurantRes.ok) {
        const data = await restaurantRes.json();
        throw new Error(data.error || 'Failed to create restaurant');
      }

      const newRestaurant = await restaurantRes.json();

      // Step 4: Create owner staff record (no custom id — let DB generate a UUID)
      const staffPayload = {
        restaurant_id: newRestaurant.id,
        name: adminData.ownerName.trim(),
        role: 'ADMIN',
        pin: adminData.pin,
        status: 'active'
      };

      const staffRes = await fetch('http://localhost:3001/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staffPayload)
      });

      if (!staffRes.ok) {
        const data = await staffRes.json();
        // Cleanup: Delete the created restaurant
        await fetch(`http://localhost:3001/api/restaurants/${newRestaurant.id}`, {
          method: 'DELETE'
        }).catch(console.error);
        throw new Error(data.error || 'Failed to create staff account');
      }

      const newStaff = await staffRes.json();

      // Step 5: Sync to cloud SaaS system
      const cloudRegisterResult = await registerRestaurant({
        restaurantId: newRestaurant.id,
        name: businessData.name.trim(),
        phone: businessData.phone.replace(/\D/g, ''),
        city: businessData.city,
        slug: slug,
        subscriptionPlan: selectedPlan
      });

      if (cloudRegisterResult.error) {
        console.warn('Cloud sync warning:', cloudRegisterResult.error);
        // Don't fail - cloud registration is optional
      }

      // Step 6: Activate license key if provided
      if (licenseKey.trim()) {
        const activateResult = await activateLicenseKey(
          licenseKey.trim(),
          newRestaurant.id
        );

        if (activateResult.error) {
          console.warn('License activation warning:', activateResult.error);
          // Don't fail - license is optional
        }
      }

      // Success: Call onRegister callback
      onRegister(
        {
          id: newRestaurant.id,
          name: newRestaurant.name,
          phone: newRestaurant.phone,
          address: newRestaurant.address,
          city: newRestaurant.city,
          slug: newRestaurant.slug,
          subscriptionPlan: newRestaurant.subscription_plan,
          subscriptionStatus: newRestaurant.subscription_status,
          trialEndsAt: new Date(newRestaurant.trial_ends_at),
          subscriptionExpiresAt: new Date(newRestaurant.subscription_expires_at),
          monthlyFee: newRestaurant.monthly_fee,
          currency: newRestaurant.currency,
          createdAt: new Date(newRestaurant.created_at || now)
        } as Restaurant,
        {
          id: newStaff.id,
          restaurant_id: newRestaurant.id,
          restaurantId: newRestaurant.id,
          name: adminData.ownerName,
          role: 'ADMIN',
          pin: adminData.pin,
          status: 'active',
          active_tables: 0
        } as Server
      );

    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.message || 'Registration failed. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-6xl flex flex-col lg:flex-row gap-8 items-center">
        <div className="hidden lg:flex flex-col flex-1 text-white space-y-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-3xl font-serif font-bold shadow-lg shadow-gold-500/20">
                C
              </div>
              <div>
                <h1 className="text-4xl font-serif font-bold tracking-tight text-white">Cravex</h1>
                <p className="text-slate-400 text-sm tracking-wide">Next-Gen Solutions for Premium Dining</p>
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

          <p className="text-slate-600 text-xs">© 2026 Cravex Solutions Pakistan. All rights reserved.</p>
        </div>

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
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Business Information</h2>
                    <p className="text-slate-400 text-sm">Tell us about your restaurant</p>
                  </div>

                  <div className="space-y-4">
                    <InputField
                      icon={<Building2 size={20} />}
                      label="Restaurant Name"
                      value={businessData.name}
                      onChange={(e) => setBusinessData({ ...businessData, name: e.target.value })}
                      placeholder="e.g., Karachi Grill"
                    />

                    <InputField
                      icon={<Phone size={20} />}
                      label="Business Phone"
                      value={businessData.phone}
                      onChange={(e) => setBusinessData({ ...businessData, phone: e.target.value })}
                      placeholder="03XX-XXXXXXX"
                      type="tel"
                    />

                    <InputField
                      icon={<MapPin size={20} />}
                      label="Address (Optional)"
                      value={businessData.address}
                      onChange={(e) => setBusinessData({ ...businessData, address: e.target.value })}
                      placeholder="Street address"
                    />

                    <InputField
                      icon={<MapPin size={20} />}
                      label="City"
                      value={businessData.city}
                      onChange={(e) => setBusinessData({ ...businessData, city: e.target.value })}
                      placeholder="Karachi"
                    />
                  </div>
                </div>
              )}

              {currentStep === 'admin' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Admin Account</h2>
                    <p className="text-slate-400 text-sm">Create your manager credentials</p>
                  </div>

                  <div className="space-y-4">
                    <InputField
                      icon={<User size={20} />}
                      label="Owner Name"
                      value={adminData.ownerName}
                      onChange={(e) => setAdminData({ ...adminData, ownerName: e.target.value })}
                      placeholder="Your full name"
                    />

                    <InputField
                      icon={<Phone size={20} />}
                      label="Login Phone"
                      value={adminData.ownerPhone}
                      onChange={(e) => setAdminData({ ...adminData, ownerPhone: e.target.value })}
                      placeholder="03XX-XXXXXXX"
                      type="tel"
                    />

                    <InputField
                      icon={<Lock size={20} />}
                      label="Password"
                      value={adminData.password}
                      onChange={(e) => setAdminData({ ...adminData, password: e.target.value })}
                      placeholder="Min. 6 characters"
                      type="password"
                    />

                    <InputField
                      icon={<Lock size={20} />}
                      label="Confirm Password"
                      value={adminData.confirmPassword}
                      onChange={(e) => setAdminData({ ...adminData, confirmPassword: e.target.value })}
                      placeholder="Re-enter password"
                      type="password"
                    />

                    <InputField
                      icon={<Hash size={20} />}
                      label="4-Digit PIN"
                      value={adminData.pin}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setAdminData({ ...adminData, pin: val });
                      }}
                      placeholder="For POS quick access"
                      type="text"
                      maxLength={4}
                    />
                  </div>
                </div>
              )}

              {currentStep === 'plan' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Choose Your Plan</h2>
                    <p className="text-slate-400 text-sm">14-day free trial • No credit card required</p>
                  </div>

                  <div className="space-y-3">
                    {(Object.keys(PLANS) as Array<keyof typeof PLANS>).map((planKey) => (
                      <PlanCard
                        key={planKey}
                        name={planKey}
                        price={PLANS[planKey].price}
                        features={PLANS[planKey].features}
                        selected={selectedPlan === planKey}
                        onSelect={() => setSelectedPlan(planKey)}
                      />
                    ))}
                  </div>

                  <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Clock className="text-gold-500 shrink-0 mt-0.5" size={20} />
                      <div className="text-sm">
                        <p className="text-white font-semibold mb-1">14-Day Free Trial</p>
                        <p className="text-slate-400 text-xs leading-relaxed">
                          Full access to all features. Cancel anytime during trial with no charges.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 text-xs font-semibold mb-2 uppercase tracking-wide">
                      Have a License Key? (Optional)
                    </label>
                    <input
                      type="text"
                      value={licenseKey}
                      onChange={(e) => setLicenseKey(e.target.value)}
                      placeholder="e.g., CRAVEX-ABC123-XYZ789"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all text-sm"
                    />
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
    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${completed ? 'bg-green-500 text-white' :
      active ? 'bg-gold-500 text-slate-950' :
        'bg-slate-800 text-slate-600'
      }`}>
      {completed ? <CheckCircle2 size={20} /> : number}
    </div>
    <span className={`text-[9px] font-bold uppercase tracking-wider ${active ? 'text-gold-500' : completed ? 'text-green-500' : 'text-slate-600'
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

const InputField: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  type?: string;
  maxLength?: number;
}> = ({ icon, label, value, onChange, placeholder, type = 'text', maxLength }) => (
  <div>
    <label className="block text-slate-300 text-sm font-semibold mb-2 uppercase tracking-wide">
      {label}
    </label>
    <div className="relative">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
        {icon}
      </div>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-12 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all"
      />
    </div>
  </div>
);

const PlanCard: React.FC<{
  name: string;
  price: number;
  features: readonly string[];
  selected: boolean;
  onSelect: () => void;
}> = ({ name, price, features, selected, onSelect }) => (
  <button
    onClick={onSelect}
    className={`w-full text-left p-5 rounded-xl border-2 transition-all ${selected
      ? 'border-gold-500 bg-gold-500/10 shadow-lg shadow-gold-500/20'
      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
      }`}
  >
    <div className="flex items-start justify-between mb-3">
      <div>
        <h3 className="text-white font-bold text-lg uppercase tracking-wide">{name}</h3>
        <p className="text-slate-400 text-sm mt-1">
          <span className="text-2xl font-bold text-white">Rs. {price.toLocaleString()}</span>/month
        </p>
      </div>
      {selected && (
        <div className="w-6 h-6 rounded-full bg-gold-500 flex items-center justify-center">
          <CheckCircle2 size={16} className="text-slate-950" />
        </div>
      )}
    </div>
    <ul className="space-y-2">
      {features.map((feature, idx) => (
        <li key={idx} className="flex items-start gap-2 text-sm text-slate-300">
          <ChevronRight size={16} className="text-gold-500 shrink-0 mt-0.5" />
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  </button>
);
