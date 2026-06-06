import React, { useState, useEffect } from 'react';
import { useRestaurant } from '../../client/RestaurantContext';
import { useAppContext } from '../../client/App';
import { 
  Lock, AlertCircle, Building2, Clock, Loader2, 
  CheckCircle2, LogOut, Shield, Key, Copy, Check, RefreshCw 
} from 'lucide-react';

interface LicenseStatusInfo {
  status: 'loading' | 'active' | 'expired' | 'tampered' | 'unlicensed';
  daysRemaining: number;
  error: string | null;
  plan: string;
  restaurantName: string;
  expiresAt: string | null;
}

export const SubscriptionGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentRestaurant, setCurrentRestaurant } = useRestaurant();
  const { logout } = useAppContext();
  
  // Licensing and verification state
  const [licenseInfo, setLicenseInfo] = useState<LicenseStatusInfo>({
    status: 'loading',
    daysRemaining: 0,
    error: null,
    plan: 'BASIC',
    restaurantName: '',
    expiresAt: null
  });
  
  const [hardwareFingerprint, setHardwareFingerprint] = useState<string>('');
  const [fingerprintCopied, setFingerprintCopied] = useState(false);
  
  // Activation form state
  const [licenseTokenInput, setLicenseTokenInput] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activationSuccess, setActivationSuccess] = useState(false);
  
  const validateLicense = async () => {
    try {
      const res = await fetch(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/licensing/status`);
      const result = await res.json();
      
      setLicenseInfo({
        status: result.status || 'unlicensed',
        daysRemaining: result.daysRemaining || 0,
        error: result.error || null,
        plan: result.plan || 'BASIC',
        restaurantName: result.restaurantName || currentRestaurant?.name || '',
        expiresAt: result.expiresAt || null
      });

      // Synchronize client context if restaurant status changes
      if (currentRestaurant && (result.status === 'active' || result.status === 'expired')) {
        const mappedStatus = result.status === 'active' ? 'active' : 'expired';
        if (currentRestaurant.subscriptionStatus !== mappedStatus || currentRestaurant.subscriptionPlan !== result.plan) {
          setCurrentRestaurant({
            ...currentRestaurant,
            subscriptionStatus: mappedStatus as any,
            subscriptionPlan: result.plan,
            subscriptionExpiresAt: result.expiresAt ? new Date(result.expiresAt) : currentRestaurant.subscriptionExpiresAt
          });
        }
      }
    } catch (err) {
      console.warn('[SubscriptionGuard] Failed to reach local licensing API, falling back to unlicensed:', err);
      setLicenseInfo(prev => ({
        ...prev,
        status: 'unlicensed',
        error: 'Cannot reach local licensing backend service'
      }));
    }
  };

  const fetchFingerprint = async () => {
    try {
      const res = await fetch(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/licensing/fingerprint`);
      const data = await res.json();
      if (data.fingerprint) {
        setHardwareFingerprint(data.fingerprint);
      }
    } catch (err) {
      console.error('[SubscriptionGuard] Failed to fetch hardware fingerprint:', err);
    }
  };

  useEffect(() => {
    if (!currentRestaurant?.id || currentRestaurant.id === 'SYSTEM') {
      setLicenseInfo(prev => ({ ...prev, status: 'active' }));
      return;
    }

    const validateSubscription = async () => {
      // ── Step 1: Query LOCAL cryptographic license first (works 100% offline) ──
      try {
        const localRes = await fetch('/api/licensing/status', { signal: AbortSignal.timeout(2000) });
        if (localRes.ok) {
          const localData = await localRes.json();
          if (localData.status === 'active') {
            await validateLicense();
            return; // ✅ Local license valid — no cloud call needed
          }
          if (localData.status === 'expired' || localData.status === 'tampered') {
            await validateLicense();
            return; // ⛔ Locally locked — no cloud call can override this
          }
        }
      } catch (err) {
        console.error('Local license check failed:', err);
      }

      // ── Step 2: Cloud fallback (for initial setup / trial validation) ──
      // Note: Implementation specific cloud check logic would go here if needed.
      // Falling back to existing validateLicense() logic.
      validateLicense();
    };

    validateSubscription();
    const interval = setInterval(validateSubscription, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [currentRestaurant?.id]);

  useEffect(() => {
    if (['unlicensed', 'tampered', 'expired'].includes(licenseInfo.status)) {
      fetchFingerprint();
    }
  }, [licenseInfo.status]);

  const handleCopyFingerprint = () => {
    if (!hardwareFingerprint) return;
    navigator.clipboard.writeText(hardwareFingerprint);
    setFingerprintCopied(true);
    setTimeout(() => setFingerprintCopied(false), 2000);
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseTokenInput.trim()) {
      setActivationError('Please paste your Cryptographic License Token.');
      return;
    }

    setIsActivating(true);
    setActivationError(null);
    setActivationSuccess(false);

    try {
      const res = await fetch(`${typeof window !== 'undefined' ? window.location.origin + '/api' : 'http://localhost:3001/api'}/licensing/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseToken: licenseTokenInput.trim() })
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Activation failed. Please check your token.');
      }

      setActivationSuccess(true);
      setLicenseTokenInput('');
      
      // Briefly show success animation then reload status
      setTimeout(async () => {
        await validateLicense();
        setActivationSuccess(false);
      }, 1500);

    } catch (err: any) {
      setActivationError(err.message || 'Verification service failed');
    } finally {
      setIsActivating(false);
    }
  };

  if (!currentRestaurant) return <>{children}</>;

  // Loading State
  if (licenseInfo.status === 'loading') {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#020617]">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-gold-500 animate-spin mx-auto" />
          <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Verifying FireFlow License...</p>
        </div>
      </div>
    );
  }

  // Active but expiring soon (7 days or less)
  const isExpiringSoon = licenseInfo.status === 'active' && licenseInfo.daysRemaining <= 7 && licenseInfo.daysRemaining > 0;

  // Blocking Lockout View (Unlicensed, Tampered, or Expired)
  if (['unlicensed', 'tampered', 'expired'].includes(licenseInfo.status)) {
    const isTampered = licenseInfo.status === 'tampered';
    const isExpired = licenseInfo.status === 'expired';
    const statusTitle = isExpired 
      ? 'Subscription Expired' 
      : isTampered 
        ? 'Security Alert: Tamper Detected' 
        : 'System Unlicensed';

    const statusSubtitle = isExpired
      ? `Your license expired on ${licenseInfo.expiresAt ? new Date(licenseInfo.expiresAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A'}`
      : licenseInfo.error || 'A valid signed cryptographic license file is required to operate this terminal.';

    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#020617] p-4 md:p-8 overflow-y-auto relative">
        {/* Background Blur */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-red-500/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-1/4 w-[400px] h-[300px] bg-gold-500/5 rounded-full blur-[100px]" />
        </div>

        <div className="max-w-2xl w-full relative z-10 space-y-6 my-auto">
          {/* Status Header */}
          <div className="text-center">
            <div className={`inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-4 border ${
              isExpired 
                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-[0_0_40px_rgba(245,158,11,0.1)]' 
                : 'bg-red-500/10 text-red-500 border-red-500/20 shadow-[0_0_40px_rgba(239,68,68,0.1)]'
            }`}>
              {isExpired ? <Clock size={40} className="animate-[pulse_2s_infinite]" /> : <Lock size={40} />}
            </div>
            <h1 className="text-3xl md:text-4xl font-serif text-white font-bold leading-none">{statusTitle}</h1>
            <p className="text-slate-400 text-sm mt-3 font-medium max-w-lg mx-auto">{statusSubtitle}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {/* Left: Terminal Info & Fingerprint */}
            <div className="md:col-span-2 space-y-4">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
                <h3 className="text-white text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Building2 size={14} className="text-gold-500" />
                  Terminal Identity
                </h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="text-slate-500 font-medium">Establishment</div>
                    <div className="text-slate-200 font-bold truncate mt-0.5">{licenseInfo.restaurantName || currentRestaurant.name}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 font-medium">Current Plan</div>
                    <div className="text-slate-200 font-bold mt-0.5">{licenseInfo.plan}</div>
                  </div>
                  {licenseInfo.expiresAt && (
                    <div>
                      <div className="text-slate-500 font-medium">Expiration Date</div>
                      <div className="text-slate-200 font-bold mt-0.5">
                        {new Date(licenseInfo.expiresAt).toLocaleDateString('en-PK')}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Hardware Fingerprint Copy Card */}
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm space-y-3">
                <h3 className="text-white text-xs font-black uppercase tracking-widest flex items-center gap-2">
                  <Shield size={14} className="text-gold-500" />
                  Hardware ID
                </h3>
                <p className="text-[10px] text-slate-500 font-medium">
                  Provide this unique fingerprint to SaaS Administration to generate your license.
                </p>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    value={hardwareFingerprint || 'Retrieving...'}
                    className="w-full bg-slate-950/80 border border-slate-700/60 rounded-xl px-3 py-2.5 font-mono text-[9px] text-gold-400 outline-none select-all"
                  />
                  <button
                    onClick={handleCopyFingerprint}
                    disabled={!hardwareFingerprint}
                    className="absolute right-1 top-1 bottom-1 px-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white rounded-lg transition-all flex items-center justify-center gap-1.5"
                  >
                    {fingerprintCopied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
                    <span className="text-[9px] font-black uppercase tracking-wider">
                      {fingerprintCopied ? 'Copied' : 'Copy'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Manual Activation Form */}
            <div className="md:col-span-3">
              <form onSubmit={handleActivate} className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm space-y-4 h-full flex flex-col justify-between">
                <div>
                  <h3 className="text-white text-xs font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Key size={14} className="text-gold-500" />
                    License Key Activation
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium mb-3">
                    Paste the manual Base64 cryptographic license token generated from your SaaS management portal.
                  </p>

                  <textarea
                    placeholder="Paste cryptographic token here (eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...)"
                    value={licenseTokenInput}
                    onChange={e => {
                      setLicenseTokenInput(e.target.value);
                      setActivationError(null);
                    }}
                    className="w-full h-28 bg-slate-950/80 border border-slate-700/60 rounded-xl p-3 font-mono text-[10px] text-slate-300 outline-none focus:border-gold-500/50 resize-none transition-all placeholder:text-slate-800"
                    disabled={isActivating || activationSuccess}
                  />

                  {activationError && (
                    <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl p-3 mt-2">
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{activationError}</span>
                    </div>
                  )}

                  {activationSuccess && (
                    <div className="flex items-center gap-2 text-green-400 text-xs bg-green-500/10 border border-green-500/20 rounded-xl p-3 mt-2">
                      <CheckCircle2 size={14} className="shrink-0 animate-[bounce_1s_infinite]" />
                      <span className="font-bold">License verified! Unlocking terminal...</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-800/80 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={isActivating || activationSuccess || !licenseTokenInput.trim()}
                    className="flex-1 h-12 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-slate-950 font-black uppercase tracking-widest text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(234,179,8,0.15)] active:scale-[0.98]"
                  >
                    {isActivating ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                    {isActivating ? 'Verifying...' : 'Activate Terminal'}
                  </button>
                  <button
                    type="button"
                    onClick={validateLicense}
                    className="h-12 w-12 border border-slate-700 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white flex items-center justify-center transition-all"
                    title="Refresh License Status"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Footer actions */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800/60">
            <span className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">
              FireFlow Hardware Security Gateway v3.1
            </span>
            <button
              onClick={logout}
              className="flex items-center gap-2 text-slate-500 hover:text-red-400 transition-colors text-xs font-black uppercase tracking-widest"
            >
              <LogOut size={12} />
              Logout & Switch Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Expiring Soon Banner */}
      {isExpiringSoon && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-500 text-slate-950 px-4 py-2.5 font-bold text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-lg animate-in slide-in-from-top duration-500">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>
              Your local system license will expire in <strong className="underline">{licenseInfo.daysRemaining} day{licenseInfo.daysRemaining !== 1 ? 's' : ''}</strong> ({licenseInfo.expiresAt ? new Date(licenseInfo.expiresAt).toLocaleDateString() : 'N/A'}). Please renew to prevent service lockout.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[9px] bg-slate-950 text-gold-400 px-2 py-0.5 rounded font-black uppercase tracking-widest">
              Plan: {licenseInfo.plan}
            </span>
          </div>
        </div>
      )}

      <div className={`flex-1 flex flex-col overflow-hidden ${isExpiringSoon ? 'pt-10' : ''}`}>
        {children}
      </div>
    </>
  );
};
